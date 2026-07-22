from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import get_database
from app.auth import authorize_session, require_doctor_or_admin
from app.mongo_utils import serialize_mongo_doc, serialize_mongo_list, to_object_id

router = APIRouter(prefix="/messages", tags=["messages"])

DIRECTION_DOCTOR_TO_PATIENT = "doctor_to_patient"
DIRECTION_PATIENT_TO_DOCTOR = "patient_to_doctor"


class DoctorMessageRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    doctor_input: str = Field(..., min_length=1)
    animation_key: str | None = Field(default=None)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def build_message_record(
    session_id: str,
    text: str,
    direction: str,
    sender_id: str,
    animation_key: str | None = None,
) -> dict[str, Any]:
    now = utc_now()
    message = {
        "session_id": session_id,
        "sender_id": sender_id,
        "sender": "doctor" if direction == DIRECTION_DOCTOR_TO_PATIENT else "patient",
        "direction": direction,
        "message_type": "text",
        "text": text.strip(),
        "timestamp": now,
        "created_at": now,
        "updated_at": now,
    }
    if animation_key:
        message["animation_key"] = animation_key.strip()
    return message


def build_patient_message_record(session_id: str, patient_id: str, text: str) -> dict[str, Any]:
    return build_message_record(
        session_id=session_id,
        text=text,
        direction=DIRECTION_PATIENT_TO_DOCTOR,
        sender_id=patient_id,
    )


@router.post("/doctor")
async def create_doctor_message(
    payload: DoctorMessageRequest,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    db = get_database()
    session_object_id = to_object_id(payload.session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await authorize_session(user, session)

    message_doc = build_message_record(
        session_id=payload.session_id,
        text=payload.doctor_input,
        direction=DIRECTION_DOCTOR_TO_PATIENT,
        sender_id=session.get("doctor_id") or user.get("user_id"),
        animation_key=payload.animation_key,
    )
    result = await db.messages.insert_one(message_doc)
    message_doc["_id"] = result.inserted_id

    await db.sessions.update_one(
        {"_id": session_object_id},
        {"$set": {"updated_at": message_doc["created_at"]}},
    )

    return serialize_mongo_doc(message_doc)


@router.get("/{session_id}")
async def get_messages(session_id: str) -> list[dict[str, Any]]:
    db = get_database()
    session_object_id = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_object_id})
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = await db.messages.find({"session_id": session_id}).sort("created_at", 1).to_list(length=500)
    return serialize_mongo_list(messages)
