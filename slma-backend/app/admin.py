import re
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from app.auth import (
    hash_password,
    new_user_document,
    normalize_email,
    public_user,
    require_admin,
    validate_password,
)
from app.database import get_database
from app.mongo_utils import serialize_mongo_doc

router = APIRouter(prefix="/admin", tags=["admin"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_license(value: str | None) -> str | None:
    cleaned = (value or "").strip().upper()
    return cleaned or None


def doctor_response(user: dict[str, Any], profile: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "user": public_user(user),
        "profile": serialize_mongo_doc(profile),
    }


class DoctorCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=10, max_length=256)
    specialization: str = Field(default="", max_length=120)
    hospital_name: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)
    license_no: str | None = Field(default=None, max_length=80)


class DoctorUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, min_length=3, max_length=254)
    specialization: str | None = Field(default=None, max_length=120)
    hospital_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    license_no: str | None = Field(default=None, max_length=80)


class DoctorStatusRequest(BaseModel):
    status: Literal["active", "inactive", "pending"]


class PasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=10, max_length=256)


async def _load_doctor(doctor_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    db = get_database()
    profile = await db.doctor_profiles.find_one({"doctor_id": doctor_id})
    if profile is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    user = await db.users.find_one({"user_id": profile.get("user_id"), "role": "doctor"})
    if user is None:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    return user, profile


@router.post("/doctors", status_code=201)
async def create_doctor(
    payload: DoctorCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_database()
    user_doc = new_user_document(
        name=payload.name,
        email=payload.email,
        password=payload.password,
        role="doctor",
    )
    now = utc_now()
    doctor_id = uuid4().hex
    license_normalized = normalize_license(payload.license_no)
    profile_doc = {
        "_id": doctor_id,
        "doctor_id": doctor_id,
        "user_id": user_doc["user_id"],
        "specialization": payload.specialization.strip(),
        "hospital_name": payload.hospital_name.strip(),
        "phone": payload.phone.strip(),
        "license_no": (payload.license_no or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    if license_normalized:
        profile_doc["license_no_normalized"] = license_normalized

    try:
        await db.users.insert_one(user_doc)
        try:
            await db.doctor_profiles.insert_one(profile_doc)
        except Exception:
            await db.users.delete_one({"user_id": user_doc["user_id"]})
            raise
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email or license number is already in use") from exc
    return doctor_response(user_doc, profile_doc)


@router.get("/doctors")
async def list_doctors(
    search: str = Query(default="", max_length=100),
    account_status: Literal["active", "inactive", "pending"] | None = Query(default=None, alias="status"),
    _: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    db = get_database()
    user_query: dict[str, Any] = {"role": "doctor", "user_id": {"$exists": True}}
    if account_status:
        user_query["status"] = account_status
    users = await db.users.find(user_query).sort("created_at", -1).to_list(length=500)
    user_ids = [user.get("user_id") for user in users]
    profiles = await db.doctor_profiles.find({"user_id": {"$in": user_ids}}).to_list(length=500)
    profile_map = {profile.get("user_id"): profile for profile in profiles}
    needle = search.strip().lower()
    results = []
    for user in users:
        profile = profile_map.get(user.get("user_id"))
        searchable = " ".join(
            str(value or "")
            for value in [
                user.get("name"),
                user.get("email"),
                (profile or {}).get("specialization"),
                (profile or {}).get("hospital_name"),
                (profile or {}).get("license_no"),
            ]
        ).lower()
        if needle and needle not in searchable:
            continue
        results.append(doctor_response(user, profile))
    return results


@router.patch("/doctors/{doctor_id}")
async def update_doctor(
    doctor_id: str,
    payload: DoctorUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_database()
    user, profile = await _load_doctor(doctor_id)
    now = utc_now()
    user_updates: dict[str, Any] = {"updated_at": now}
    profile_updates: dict[str, Any] = {"updated_at": now}

    if payload.name is not None:
        user_updates["name"] = payload.name.strip()
    if payload.email is not None:
        user_updates["email"] = normalize_email(payload.email)
    for field in ("specialization", "hospital_name", "phone"):
        value = getattr(payload, field)
        if value is not None:
            profile_updates[field] = value.strip()
    if payload.license_no is not None:
        cleaned = payload.license_no.strip()
        profile_updates["license_no"] = cleaned or None
        normalized = normalize_license(cleaned)
        if normalized:
            profile_updates["license_no_normalized"] = normalized
        else:
            await db.doctor_profiles.update_one(
                {"doctor_id": doctor_id},
                {"$unset": {"license_no_normalized": ""}},
            )
    try:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": user_updates})
        await db.doctor_profiles.update_one({"doctor_id": doctor_id}, {"$set": profile_updates})
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email or license number is already in use") from exc
    return doctor_response(
        await db.users.find_one({"user_id": user["user_id"]}),
        await db.doctor_profiles.find_one({"doctor_id": doctor_id}),
    )


@router.patch("/doctors/{doctor_id}/status")
async def set_doctor_status(
    doctor_id: str,
    payload: DoctorStatusRequest,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_database()
    user, profile = await _load_doctor(doctor_id)
    now = utc_now()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"status": payload.status, "updated_at": now}},
    )
    if payload.status == "inactive":
        await db.auth_sessions.delete_many({"user_id": user["user_id"]})
    return doctor_response(
        await db.users.find_one({"user_id": user["user_id"]}),
        profile,
    )


@router.post("/doctors/{doctor_id}/reset-password")
async def reset_doctor_password(
    doctor_id: str,
    payload: PasswordResetRequest,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, str]:
    db = get_database()
    user, _profile = await _load_doctor(doctor_id)
    validate_password(payload.new_password)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": utc_now()}},
    )
    await db.auth_sessions.delete_many({"user_id": user["user_id"]})
    return {"status": "password_reset"}


async def _session_summary(session: dict[str, Any]) -> dict[str, Any]:
    db = get_database()
    session_id = str(session["_id"])
    doctor_name = "Legacy/Unassigned"
    patient_name = "Legacy/Unassigned"
    doctor_id = session.get("doctor_id")
    patient_id = session.get("patient_id")
    if doctor_id:
        profile = await db.doctor_profiles.find_one({"doctor_id": doctor_id})
        if profile:
            user = await db.users.find_one({"user_id": profile.get("user_id")})
            doctor_name = (user or {}).get("name") or doctor_name
    if patient_id:
        try:
            from bson import ObjectId

            patient = await db.patients.find_one({"_id": ObjectId(patient_id)})
        except Exception:
            patient = None
        if patient:
            patient_name = patient.get("full_name") or patient.get("name") or patient_name
    return {
        "session_id": session_id,
        "doctor_id": doctor_id,
        "doctor_name": doctor_name,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "status": session.get("status", "active"),
        "started_at": session.get("started_at") or session.get("created_at"),
        "ended_at": session.get("ended_at"),
        "prediction_count": await db.predictions.count_documents({"session_id": session_id}),
        "message_count": await db.messages.count_documents({"session_id": session_id}),
    }


@router.get("/summary")
async def admin_summary(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    db = get_database()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "total_doctors": await db.users.count_documents({"role": "doctor", "user_id": {"$exists": True}}),
        "active_doctors": await db.users.count_documents({"role": "doctor", "user_id": {"$exists": True}, "status": "active"}),
        "pending_doctors": await db.users.count_documents({"role": "doctor", "user_id": {"$exists": True}, "status": "pending"}),
        "inactive_doctors": await db.users.count_documents({"role": "doctor", "user_id": {"$exists": True}, "status": "inactive"}),
        "total_patient_profiles": await db.patients.count_documents({}),
        "total_consultation_sessions": await db.sessions.count_documents({}),
        "sessions_today": await db.sessions.count_documents({"started_at": {"$gte": today}}),
    }


@router.get("/sessions/recent")
async def recent_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    _: dict[str, Any] = Depends(require_admin),
) -> list[dict[str, Any]]:
    sessions = await get_database().sessions.find({}).sort("started_at", -1).to_list(length=limit)
    return [serialize_mongo_doc(await _session_summary(session)) for session in sessions]
