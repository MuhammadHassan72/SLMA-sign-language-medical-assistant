import re
from datetime import date, datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from app.auth import doctor_profile_for_user, require_doctor_or_admin
from app.database import get_database
from app.mongo_utils import serialize_mongo_doc, serialize_mongo_list, to_object_id

router = APIRouter(prefix="/patients", tags=["patients"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    prefix = "+" if value.strip().startswith("+") else ""
    digits = "".join(character for character in value if character.isdigit())
    return f"{prefix}{digits}" if digits else None


def public_patient(patient: dict[str, Any]) -> dict[str, Any]:
    safe = serialize_mongo_doc(patient) or {}
    safe["patient_id"] = str(patient.get("patient_id") or patient.get("_id"))
    safe.pop("normalized_name", None)
    safe.pop("phone_normalized", None)
    return safe


class PatientCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str = Field(..., min_length=1, max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    emergency_contact: str | None = Field(default=None, max_length=120)
    blood_group: str | None = Field(default=None, max_length=12)
    allergies: str | None = Field(default=None, max_length=1000)
    medical_notes: str | None = Field(default=None, max_length=4000)
    allow_duplicate: bool = False

    @model_validator(mode="after")
    def validate_age_or_birth_date(self):
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        if self.age is None and self.date_of_birth is None:
            raise ValueError("Provide age or date_of_birth")
        return self


class PatientUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    date_of_birth: date | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, min_length=1, max_length=40)
    phone: str | None = Field(default=None, max_length=40)
    emergency_contact: str | None = Field(default=None, max_length=120)
    blood_group: str | None = Field(default=None, max_length=12)
    allergies: str | None = Field(default=None, max_length=1000)
    medical_notes: str | None = Field(default=None, max_length=4000)
    allow_duplicate: bool = False

    @model_validator(mode="after")
    def validate_birth_date(self):
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return self


async def _actor_doctor_id(user: dict[str, Any]) -> str:
    if user.get("role") == "admin":
        return f"admin:{user.get('user_id')}"
    profile = await doctor_profile_for_user(user)
    if profile is None:
        raise HTTPException(status_code=403, detail="Doctor profile is required")
    return str(profile["doctor_id"])


async def _duplicate_patient(
    *,
    full_name: str,
    phone: str | None,
    exclude_id: ObjectId | None = None,
) -> dict[str, Any] | None:
    conditions: list[dict[str, Any]] = [{"normalized_name": normalize_name(full_name)}]
    phone_normalized = normalize_phone(phone)
    if phone_normalized:
        conditions.append({"phone_normalized": phone_normalized})
    query: dict[str, Any] = {"$or": conditions}
    if exclude_id:
        query["_id"] = {"$ne": exclude_id}
    return await get_database().patients.find_one(query)


@router.get("")
async def search_patients(
    search: str = Query(default="", max_length=120),
    limit: int = Query(default=50, ge=1, le=200),
    _: dict[str, Any] = Depends(require_doctor_or_admin),
) -> list[dict[str, Any]]:
    db = get_database()
    query: dict[str, Any] = {}
    needle = search.strip()
    if needle:
        escaped = re.escape(needle)
        query["$or"] = [
            {"full_name": {"$regex": escaped, "$options": "i"}},
            {"name": {"$regex": escaped, "$options": "i"}},
            {"phone": {"$regex": escaped, "$options": "i"}},
        ]
    patients = await db.patients.find(query).sort("updated_at", -1).to_list(length=limit)
    return [public_patient(patient) for patient in patients]


@router.post("", status_code=201)
async def create_patient(
    payload: PatientCreateRequest,
    user: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    duplicate = await _duplicate_patient(full_name=payload.full_name, phone=payload.phone)
    if duplicate and not payload.allow_duplicate:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A similar patient profile already exists. Review it or confirm duplicate override.",
                "duplicate_patient_id": str(duplicate["_id"]),
                "duplicate_name": duplicate.get("full_name") or duplicate.get("name"),
            },
        )
    db = get_database()
    now = utc_now()
    doctor_id = await _actor_doctor_id(user)
    doc = {
        "profile_type": "patient_profile",
        "full_name": payload.full_name.strip(),
        "name": payload.full_name.strip(),
        "normalized_name": normalize_name(payload.full_name),
        "date_of_birth": payload.date_of_birth.isoformat() if payload.date_of_birth else None,
        "age": payload.age,
        "gender": payload.gender.strip(),
        "phone": (payload.phone or "").strip() or None,
        "emergency_contact": (payload.emergency_contact or "").strip() or None,
        "blood_group": (payload.blood_group or "").strip() or None,
        "allergies": (payload.allergies or "").strip() or None,
        "medical_notes": (payload.medical_notes or "").strip() or None,
        "created_by_doctor_id": doctor_id,
        "created_at": now,
        "updated_at": now,
    }
    phone_normalized = normalize_phone(payload.phone)
    if phone_normalized:
        doc["phone_normalized"] = phone_normalized
    result = await db.patients.insert_one(doc)
    await db.patients.update_one({"_id": result.inserted_id}, {"$set": {"patient_id": str(result.inserted_id)}})
    doc["_id"] = result.inserted_id
    doc["patient_id"] = str(result.inserted_id)
    return public_patient(doc)


@router.get("/{patient_id}")
async def get_patient(
    patient_id: str,
    _: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    patient = await get_database().patients.find_one({"_id": to_object_id(patient_id, "patient_id")})
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return public_patient(patient)


@router.patch("/{patient_id}")
async def update_patient(
    patient_id: str,
    payload: PatientUpdateRequest,
    _: dict[str, Any] = Depends(require_doctor_or_admin),
) -> dict[str, Any]:
    db = get_database()
    object_id = to_object_id(patient_id, "patient_id")
    patient = await db.patients.find_one({"_id": object_id})
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    updates = payload.model_dump(exclude_unset=True, exclude={"allow_duplicate"})
    full_name = str(updates.get("full_name") or patient.get("full_name") or patient.get("name") or "")
    phone = updates.get("phone", patient.get("phone"))
    duplicate = await _duplicate_patient(full_name=full_name, phone=phone, exclude_id=object_id)
    if duplicate and not payload.allow_duplicate:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A similar patient profile already exists. Review it or confirm duplicate override.",
                "duplicate_patient_id": str(duplicate["_id"]),
            },
        )
    if "date_of_birth" in updates and updates["date_of_birth"] is not None:
        updates["date_of_birth"] = updates["date_of_birth"].isoformat()
    for field in ("full_name", "gender", "phone", "emergency_contact", "blood_group", "allergies", "medical_notes"):
        if field in updates and isinstance(updates[field], str):
            updates[field] = updates[field].strip() or None
    if "full_name" in updates:
        updates["name"] = updates["full_name"]
        updates["normalized_name"] = normalize_name(updates["full_name"])
    if "phone" in updates:
        normalized = normalize_phone(updates["phone"])
        if normalized:
            updates["phone_normalized"] = normalized
        else:
            await db.patients.update_one({"_id": object_id}, {"$unset": {"phone_normalized": ""}})
    updates["updated_at"] = utc_now()
    await db.patients.update_one({"_id": object_id}, {"$set": updates})
    return public_patient(await db.patients.find_one({"_id": object_id}))


@router.get("/{patient_id}/history")
async def patient_history(
    patient_id: str,
    _: dict[str, Any] = Depends(require_doctor_or_admin),
) -> list[dict[str, Any]]:
    db = get_database()
    object_id = to_object_id(patient_id, "patient_id")
    if await db.patients.find_one({"_id": object_id}) is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    sessions = await db.sessions.find({"patient_id": patient_id}).sort("started_at", -1).to_list(length=100)
    history = []
    for session in sessions:
        session_id = str(session["_id"])
        doctor_name = "Legacy/Unassigned"
        profile = await db.doctor_profiles.find_one({"doctor_id": session.get("doctor_id")})
        if profile:
            doctor = await db.users.find_one({"user_id": profile.get("user_id")})
            doctor_name = (doctor or {}).get("name") or doctor_name
        predictions = await db.predictions.find({"session_id": session_id}).sort("created_at", 1).to_list(length=200)
        messages = await db.messages.find({"session_id": session_id}).sort("created_at", 1).to_list(length=300)
        history.append(
            {
                "session": serialize_mongo_doc(session),
                "doctor_name": doctor_name,
                "predictions": serialize_mongo_list(predictions),
                "doctor_responses": serialize_mongo_list(
                    [message for message in messages if message.get("direction") == "doctor_to_patient"]
                ),
            }
        )
    return history
