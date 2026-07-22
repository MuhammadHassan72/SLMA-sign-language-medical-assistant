import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.config import BASE_DIR
from app.auth import (
    authorize_session,
    doctor_profile_for_user,
    require_doctor_or_admin,
)
from app.csre import GlossCandidate, RefineRequest, _build_gemini_response, build_fallback_response
from app.database import get_database
from app.inference import (
    EXPECTED_FEATURES,
    EXPECTED_FRAMES,
    _get_confidence_threshold,
    _predict,
    get_top5_predictions,
    load_label_encoder_once,
    normalize_input_shape,
)
from app.mongo_utils import serialize_mongo_doc, serialize_mongo_list, to_object_id

router = APIRouter(prefix="/sessions", tags=["sessions"])


class StartSessionRequest(BaseModel):
    patient_id: str | None = Field(default=None, min_length=1)
    doctor_id: str | None = Field(default=None, min_length=1)
    patient_name: str | None = Field(default=None, min_length=1)
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, min_length=1)


class StartSessionResponse(BaseModel):
    session_id: str
    patient_id: str
    status: str


class CameraFrameRequest(BaseModel):
    frame_data: str = Field(..., min_length=32)


class LiveSequenceRequest(BaseModel):
    frames: list[list[float]] = Field(..., min_length=1)


_camera_frames: dict[str, dict[str, str]] = {}

POSE_FEATURES = 23 * 3
FACE_FEATURES = 48 * 3
HAND_FEATURE_START = POSE_FEATURES + FACE_FEATURES
MIN_LIVE_HAND_SIGNAL_FRAMES = 4
MIN_UPLOAD_HAND_SIGNAL_FRAMES = 1


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def build_session_record(doctor_id: str, patient_id: str) -> dict[str, Any]:
    now = utc_now()
    return {
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "status": "active",
        "started_at": now,
        "created_at": now,
        "updated_at": now,
    }


async def _doctor_id_for_session(user: dict[str, Any], requested_doctor_id: str | None) -> str:
    if user.get("role") == "doctor":
        profile = await doctor_profile_for_user(user)
        if profile is None:
            raise HTTPException(status_code=403, detail="Doctor profile is required before starting a consultation")
        return str(profile["doctor_id"])
    if requested_doctor_id:
        profile = await get_database().doctor_profiles.find_one({"doctor_id": requested_doctor_id})
        if profile is None:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return requested_doctor_id
    raise HTTPException(status_code=422, detail="doctor_id is required when an admin starts a consultation")


async def _load_session_patient(patient_id: str) -> dict[str, Any]:
    patient = await get_database().patients.find_one({"_id": to_object_id(patient_id, "patient_id")})
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return patient


def _safe_upload_name(session_id: str, filename: str) -> str:
    original = Path(filename).stem
    safe_stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", original).strip("._") or "landmarks"
    safe_stem = safe_stem[:60]
    timestamp = utc_now().strftime("%Y%m%dT%H%M%S%fZ")
    return f"{timestamp}_{session_id}_{uuid4().hex[:8]}_{safe_stem}.npy"


async def _refine_prediction(top5: list[dict[str, Any]], is_accepted: bool, threshold: float) -> dict[str, Any]:
    candidates = [GlossCandidate(**candidate) for candidate in top5]
    payload = RefineRequest(top5=candidates, is_accepted=is_accepted, threshold=threshold)
    fallback = build_fallback_response(candidates, is_accepted)
    try:
        return await _build_gemini_response(payload, fallback["raw_glosses_used"]) or fallback
    except Exception:
        return fallback


def _validate_landmark_signal(sequence: Any, source_name: str, min_hand_frames: int) -> dict[str, int]:
    import numpy as np

    abs_sequence = np.abs(sequence)
    nonzero_frame_count = int((abs_sequence.sum(axis=1) > 1e-6).sum())
    hand_frame_count = int((abs_sequence[:, HAND_FEATURE_START:].sum(axis=1) > 1e-6).sum())

    if nonzero_frame_count == 0:
        raise HTTPException(
            status_code=400,
            detail=f"{source_name} contains no usable landmarks. Please keep hands visible and try again.",
        )

    if hand_frame_count < min_hand_frames:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Not enough hand landmarks detected in {source_name}. "
                "Please keep both hands visible and try again."
            ),
        )

    return {
        "nonzero_frame_count": nonzero_frame_count,
        "hand_signal_frame_count": hand_frame_count,
    }


def _resize_frame_matrix_to_sequence(sequence: Any, crop_mode: str = "center") -> tuple[Any, int]:
    import numpy as np

    original_frame_count = int(sequence.shape[0])
    if original_frame_count > EXPECTED_FRAMES:
        if crop_mode == "uniform":
            indices = np.linspace(0, original_frame_count - 1, EXPECTED_FRAMES).astype(np.int64)
            sequence = sequence[indices]
        else:
            start = max((original_frame_count - EXPECTED_FRAMES) // 2, 0)
            sequence = sequence[start:start + EXPECTED_FRAMES]
    elif original_frame_count < EXPECTED_FRAMES:
        padding = np.zeros((EXPECTED_FRAMES - original_frame_count, EXPECTED_FEATURES), dtype=np.float32)
        sequence = np.concatenate([sequence, padding], axis=0)

    return normalize_input_shape(sequence), original_frame_count


def _coerce_npy_to_frame_matrix(array: Any) -> Any:
    import numpy as np

    sequence = np.asarray(array, dtype=np.float32)

    if sequence.shape == (EXPECTED_FEATURES,):
        sequence = np.expand_dims(sequence, axis=0)
    elif sequence.ndim == 2 and sequence.shape[1] == EXPECTED_FEATURES:
        pass
    elif sequence.ndim == 3 and sequence.shape[0] == 1 and sequence.shape[2] == EXPECTED_FEATURES:
        sequence = sequence[0]
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid .npy shape. Expected (339,), (N, 339), or (1, N, 339) "
                f"where N is the number of frames; received {tuple(sequence.shape)}"
            ),
        )

    if sequence.ndim != 2 or sequence.shape[1] != EXPECTED_FEATURES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid .npy shape after normalization; received {tuple(sequence.shape)}",
        )

    if not np.isfinite(sequence).all():
        raise HTTPException(status_code=400, detail="Invalid .npy values. NaN or Inf detected")

    return sequence


def _resize_live_frames_to_sequence(frames: list[list[float]]) -> tuple[Any, int, dict[str, int]]:
    import numpy as np

    if not frames:
        raise HTTPException(status_code=400, detail="frames must be a non-empty list")

    for index, frame in enumerate(frames):
        if len(frame) != EXPECTED_FEATURES:
            raise HTTPException(
                status_code=400,
                detail=f"Frame {index} must contain exactly {EXPECTED_FEATURES} floats",
            )

    try:
        sequence = np.asarray(frames, dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"frames must contain numeric float values: {exc}") from exc

    if sequence.ndim != 2 or sequence.shape[1] != EXPECTED_FEATURES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid live sequence shape. Expected (N, {EXPECTED_FEATURES}); received {tuple(sequence.shape)}",
        )

    if not np.isfinite(sequence).all():
        raise HTTPException(status_code=400, detail="Invalid live sequence values. NaN or Inf detected")

    quality_stats = _validate_landmark_signal(
        sequence,
        "live camera sequence",
        MIN_LIVE_HAND_SIGNAL_FRAMES,
    )
    model_sequence, original_frame_count = _resize_frame_matrix_to_sequence(sequence, crop_mode="uniform")
    return model_sequence, original_frame_count, quality_stats


def _resize_npy_to_sequence(array: Any) -> tuple[Any, int, dict[str, int]]:
    sequence = _coerce_npy_to_frame_matrix(array)
    quality_stats = _validate_landmark_signal(
        sequence,
        "uploaded .npy file",
        MIN_UPLOAD_HAND_SIGNAL_FRAMES,
    )
    model_sequence, original_frame_count = _resize_frame_matrix_to_sequence(sequence, crop_mode="center")
    return model_sequence, original_frame_count, quality_stats


@router.post("/start", response_model=StartSessionResponse)
async def start_session(
    payload: StartSessionRequest,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> StartSessionResponse:
    db = get_database()
    now = utc_now()
    doctor_id = await _doctor_id_for_session(user, payload.doctor_id)
    existing = await db.sessions.find_one({"doctor_id": doctor_id, "status": "active"})
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "End the current consultation before starting another one",
                "active_session_id": str(existing["_id"]),
            },
        )

    if payload.patient_id:
        await _load_session_patient(payload.patient_id)
        patient_id = payload.patient_id
    else:
        if not payload.patient_name or payload.age is None or not payload.gender:
            raise HTTPException(status_code=422, detail="Select a patient profile before starting the consultation")
        patient_doc = {
            "profile_type": "legacy_quick_profile",
            "name": payload.patient_name.strip(),
            "full_name": payload.patient_name.strip(),
            "normalized_name": payload.patient_name.strip().lower(),
            "age": payload.age,
            "gender": payload.gender.strip(),
            "created_by_doctor_id": doctor_id,
            "created_at": now,
            "updated_at": now,
        }
        patient_result = await db.patients.insert_one(patient_doc)
        patient_id = str(patient_result.inserted_id)
        await db.patients.update_one(
            {"_id": patient_result.inserted_id},
            {"$set": {"patient_id": patient_id}},
        )

    session_doc = build_session_record(doctor_id, patient_id)
    session_doc["doctor_user_id"] = user.get("user_id")
    session_result = await db.sessions.insert_one(session_doc)
    session_id = str(session_result.inserted_id)

    return StartSessionResponse(
        session_id=session_id,
        patient_id=patient_id,
        status="active",
    )


@router.get("/latest")
async def get_latest_session() -> dict[str, Any]:
    db = get_database()
    session = await db.sessions.find_one(
        {"status": "active"},
        sort=[("started_at", -1)],
    )
    if session is None:
        raise HTTPException(status_code=404, detail="No active session found")
    return serialize_mongo_doc(session)


@router.get("/mine/latest")
async def get_my_latest_session(
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    db = get_database()
    query: dict[str, Any] = {"status": "active"}
    if user.get("role") == "doctor":
        profile = await doctor_profile_for_user(user)
        if profile is None:
            raise HTTPException(status_code=404, detail="Doctor profile not found")
        query["doctor_id"] = profile["doctor_id"]
    session = await db.sessions.find_one(query, sort=[("started_at", -1)])
    if session is None:
        raise HTTPException(status_code=404, detail="No active consultation found")
    return serialize_mongo_doc(session)


@router.get("/mine/history")
async def get_my_session_history(
    limit: int = 100,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {}
    if user.get("role") == "doctor":
        profile = await doctor_profile_for_user(user)
        if profile is None:
            raise HTTPException(status_code=404, detail="Doctor profile not found")
        query["doctor_id"] = profile["doctor_id"]
    sessions = await get_database().sessions.find(query).sort("started_at", -1).to_list(length=min(max(limit, 1), 200))
    return serialize_mongo_list(sessions)


@router.post("/{session_id}/end")
async def end_session(
    session_id: str,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    db = get_database()
    object_id = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await authorize_session(user, session)
    now = utc_now()
    await db.sessions.update_one(
        {"_id": object_id},
        {"$set": {"status": "completed", "ended_at": now, "updated_at": now}},
    )
    _camera_frames.pop(session_id, None)
    return serialize_mongo_doc(await db.sessions.find_one({"_id": object_id}))


@router.post("/{session_id}/predict-npy")
async def predict_session_npy(session_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    db = get_database()
    session_object_id = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if not file.filename or not file.filename.lower().endswith(".npy"):
        raise HTTPException(status_code=400, detail="Uploaded file must have a .npy extension")

    try:
        content = await file.read()
    finally:
        await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded .npy file is empty")

    uploads_dir = BASE_DIR / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    upload_name = _safe_upload_name(session_id, file.filename)
    upload_path = uploads_dir / upload_name
    upload_path.write_bytes(content)

    try:
        import numpy as np

        uploaded_array = np.load(BytesIO(content), allow_pickle=False)
        sequence, original_frame_count, quality_stats = _resize_npy_to_sequence(uploaded_array)
        labels = load_label_encoder_once()
        predictions = await run_in_threadpool(_predict, sequence)
        top5 = get_top5_predictions(predictions, labels)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to run .npy inference: {exc}") from exc

    top1 = top5[0]
    threshold = _get_confidence_threshold()
    is_accepted = top1["confidence"] >= threshold
    csre_result = await _refine_prediction(top5, is_accepted, threshold)
    now = utc_now()

    prediction_doc = {
        "session_id": session_id,
        "input_type": "npy_upload",
        "file_path": str(upload_path.relative_to(BASE_DIR)),
        "source_frame_count": original_frame_count,
        "model_frame_count": EXPECTED_FRAMES,
        "hand_signal_frame_count": quality_stats["hand_signal_frame_count"],
        "nonzero_frame_count": quality_stats["nonzero_frame_count"],
        "top1_gloss": top1["gloss"],
        "top1_confidence": top1["confidence"],
        "top5": top5,
        "threshold": threshold,
        "is_accepted": is_accepted,
        "refined_text": csre_result["refined_text"],
        "uncertainty_note": csre_result["uncertainty_note"],
        "source": csre_result["source"],
        "created_at": now,
    }
    prediction_result = await db.predictions.insert_one(prediction_doc)
    prediction_id = str(prediction_result.inserted_id)

    message_doc = {
        "session_id": session_id,
        "direction": "patient_to_doctor",
        "raw_glosses": csre_result["raw_glosses_used"],
        "final_text": csre_result["refined_text"],
        "prediction_id": prediction_id,
        "created_at": now,
    }
    message_result = await db.messages.insert_one(message_doc)
    message_id = str(message_result.inserted_id)

    await db.sessions.update_one(
        {"_id": session_object_id},
        {"$set": {"updated_at": now}},
    )

    return {
        "session_id": session_id,
        "prediction_id": prediction_id,
        "message_id": message_id,
        "prediction": {
            "top1_gloss": prediction_doc["top1_gloss"],
            "top1_confidence": prediction_doc["top1_confidence"],
            "top5": prediction_doc["top5"],
            "threshold": prediction_doc["threshold"],
            "is_accepted": prediction_doc["is_accepted"],
            "input_type": prediction_doc["input_type"],
            "source_frame_count": prediction_doc["source_frame_count"],
            "hand_signal_frame_count": prediction_doc["hand_signal_frame_count"],
        },
        "refined_text": prediction_doc["refined_text"],
        "uncertainty_note": prediction_doc["uncertainty_note"],
        "source": prediction_doc["source"],
    }


@router.post("/{session_id}/predict-live-sequence")
async def predict_session_live_sequence(session_id: str, payload: LiveSequenceRequest) -> dict[str, Any]:
    db = get_database()
    session_object_id = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        sequence, original_frame_count, quality_stats = _resize_live_frames_to_sequence(payload.frames)
        labels = load_label_encoder_once()
        predictions = await run_in_threadpool(_predict, sequence)
        top5 = get_top5_predictions(predictions, labels)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to run live sequence inference: {exc}") from exc

    top1 = top5[0]
    threshold = _get_confidence_threshold()
    is_accepted = top1["confidence"] >= threshold
    csre_result = await _refine_prediction(top5, is_accepted, threshold)
    now = utc_now()

    prediction_doc = {
        "session_id": session_id,
        "input_type": "live_sequence",
        "source_frame_count": original_frame_count,
        "model_frame_count": EXPECTED_FRAMES,
        "hand_signal_frame_count": quality_stats["hand_signal_frame_count"],
        "nonzero_frame_count": quality_stats["nonzero_frame_count"],
        "top1_gloss": top1["gloss"],
        "top1_confidence": top1["confidence"],
        "top5": top5,
        "threshold": threshold,
        "is_accepted": is_accepted,
        "refined_text": csre_result["refined_text"],
        "uncertainty_note": csre_result["uncertainty_note"],
        "source": csre_result["source"],
        "created_at": now,
    }
    prediction_result = await db.predictions.insert_one(prediction_doc)
    prediction_id = str(prediction_result.inserted_id)

    message_doc = {
        "session_id": session_id,
        "direction": "patient_to_doctor",
        "raw_glosses": csre_result["raw_glosses_used"],
        "final_text": csre_result["refined_text"],
        "prediction_id": prediction_id,
        "created_at": now,
    }
    message_result = await db.messages.insert_one(message_doc)
    message_id = str(message_result.inserted_id)

    await db.sessions.update_one(
        {"_id": session_object_id},
        {"$set": {"updated_at": now}},
    )

    return {
        "session_id": session_id,
        "prediction_id": prediction_id,
        "message_id": message_id,
        "prediction": {
            "top1_gloss": prediction_doc["top1_gloss"],
            "top1_confidence": prediction_doc["top1_confidence"],
            "top5": prediction_doc["top5"],
            "threshold": prediction_doc["threshold"],
            "is_accepted": prediction_doc["is_accepted"],
            "input_type": prediction_doc["input_type"],
            "source_frame_count": prediction_doc["source_frame_count"],
            "hand_signal_frame_count": prediction_doc["hand_signal_frame_count"],
        },
        "refined_text": prediction_doc["refined_text"],
        "uncertainty_note": prediction_doc["uncertainty_note"],
        "source": prediction_doc["source"],
    }


@router.post("/{session_id}/camera-frame")
async def update_camera_frame(session_id: str, payload: CameraFrameRequest) -> dict[str, str]:
    db = get_database()
    session_object_id = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if not payload.frame_data.startswith("data:image/jpeg;base64,"):
        raise HTTPException(status_code=400, detail="frame_data must be a JPEG data URL")

    updated_at = utc_now().isoformat()
    _camera_frames[session_id] = {
        "session_id": session_id,
        "frame_data": payload.frame_data,
        "updated_at": updated_at,
    }
    print(
        f"[camera-frame] received session_id={session_id} frame_data_length={len(payload.frame_data)}",
        flush=True,
    )

    return {
        "session_id": session_id,
        "updated_at": updated_at,
    }


@router.get("/{session_id}/camera-frame")
async def get_camera_frame(
    session_id: str,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, str]:
    db = get_database()
    session = await db.sessions.find_one({"_id": to_object_id(session_id, "session_id")})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await authorize_session(user, session, allow_legacy_read=True)
    frame = _camera_frames.get(session_id)
    if frame is None:
        print(f"[camera-frame] fetch_miss session_id={session_id}", flush=True)
        raise HTTPException(status_code=404, detail="No camera frame found for this session")
    print(
        f"[camera-frame] fetched session_id={session_id} frame_data_length={len(frame['frame_data'])}",
        flush=True,
    )
    return frame


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    db = get_database()
    session_object_id = to_object_id(session_id, "session_id")

    session = await db.sessions.find_one({"_id": session_object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await authorize_session(user, session, allow_legacy_read=True)

    patient = None
    patient_id = session.get("patient_id")
    if patient_id:
        patient = await db.patients.find_one({"_id": to_object_id(patient_id, "patient_id")})

    doctor = None
    profile = await db.doctor_profiles.find_one({"doctor_id": session.get("doctor_id")})
    if profile:
        doctor = await db.users.find_one({"user_id": profile.get("user_id")}, {"password_hash": 0})

    messages = await db.messages.find({"session_id": session_id}).sort("created_at", 1).to_list(length=500)
    predictions = await db.predictions.find({"session_id": session_id}).sort("created_at", 1).to_list(length=500)

    return {
        "session": serialize_mongo_doc(session),
        "patient": serialize_mongo_doc(patient),
        "doctor": serialize_mongo_doc(doctor),
        "ownership_label": "Assigned" if profile else "Legacy/Unassigned",
        "messages": serialize_mongo_list(messages),
        "predictions": serialize_mongo_list(predictions),
    }
