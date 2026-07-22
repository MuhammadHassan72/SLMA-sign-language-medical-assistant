from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth import doctor_profile_for_user, get_current_user, public_user
from app.mongo_utils import serialize_mongo_doc

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("/me")
async def my_doctor_profile(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != "doctor":
        raise HTTPException(status_code=403, detail="Doctor account required")
    profile = await doctor_profile_for_user(user)
    if profile is None:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    return {
        "user": public_user(user),
        "profile": serialize_mongo_doc(profile),
    }
