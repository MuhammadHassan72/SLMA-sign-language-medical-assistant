import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.database import get_database
from app.mongo_utils import serialize_mongo_doc

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_MIN_LENGTH = 10
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
ACCOUNT_STATUSES = {"active", "inactive", "pending"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    return email


def normalize_license(value: str | None) -> str | None:
    cleaned = (value or "").strip().upper()
    return cleaned or None


def validate_password(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {PASSWORD_MIN_LENGTH} characters",
        )
    if len(value) > 256:
        raise HTTPException(status_code=422, detail="Password is too long")
    return value


def hash_password(password: str) -> str:
    validate_password(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=32,
    )
    return "$".join(
        [
            "scrypt",
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_b64, digest_b64 = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    safe = {
        key: value
        for key, value in user.items()
        if key not in {"password_hash"}
    }
    safe.pop("_id", None)
    return serialize_mongo_doc(safe) or {}


def new_user_document(*, name: str, email: str, password: str, role: str, status: str = "active") -> dict[str, Any]:
    if role not in {"admin", "doctor"}:
        raise HTTPException(status_code=422, detail="Invalid user role")
    if status not in ACCOUNT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid account status")
    now = utc_now()
    user_id = uuid4().hex
    return {
        "_id": user_id,
        "user_id": user_id,
        "name": name.strip(),
        "email": normalize_email(email),
        "password_hash": hash_password(password),
        "role": role,
        "status": status,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }


async def _issue_session(user_id: str) -> tuple[str, datetime]:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = utc_now()
    expires_at = now + timedelta(minutes=settings.auth_session_ttl_minutes)
    db = get_database()
    await db.auth_sessions.insert_one(
        {
            "token_hash": token_hash,
            "user_id": user_id,
            "created_at": now,
            "last_seen_at": now,
            "expires_at": expires_at,
        }
    )
    return token, expires_at


async def _resolve_user_from_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    db = get_database()
    auth_session = await db.auth_sessions.find_one(
        {"token_hash": token_hash, "expires_at": {"$gt": utc_now()}}
    )
    if auth_session is None:
        return None
    user = await db.users.find_one({"user_id": auth_session.get("user_id")})
    if user is None or user.get("status") != "active" or user.get("role") not in {"admin", "doctor"}:
        await db.auth_sessions.delete_one({"_id": auth_session["_id"]})
        return None
    await db.auth_sessions.update_one(
        {"_id": auth_session["_id"]},
        {"$set": {"last_seen_at": utc_now()}},
    )
    return user


async def get_current_user(
    slma_auth: str | None = Cookie(default=None, alias=get_settings().auth_cookie_name),
) -> dict[str, Any]:
    user = await _resolve_user_from_token(slma_auth)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


async def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_doctor_or_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in {"doctor", "admin"}:
        raise HTTPException(status_code=403, detail="Doctor or admin access required")
    return user


async def doctor_profile_for_user(user: dict[str, Any]) -> dict[str, Any] | None:
    if user.get("role") != "doctor":
        return None
    return await get_database().doctor_profiles.find_one({"user_id": user.get("user_id")})


async def authorize_session(
    user: dict[str, Any],
    session: dict[str, Any],
    *,
    allow_legacy_read: bool = False,
) -> None:
    if user.get("role") == "admin":
        return
    profile = await doctor_profile_for_user(user)
    if profile and session.get("doctor_id") == profile.get("doctor_id"):
        return
    legacy = not session.get("doctor_id") or session.get("doctor_id") == "demo_doctor"
    if allow_legacy_read and legacy:
        return
    raise HTTPException(status_code=403, detail="This consultation belongs to another doctor")


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)


class DoctorSignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=PASSWORD_MIN_LENGTH, max_length=256)
    confirm_password: str = Field(..., min_length=1, max_length=256)
    phone: str = Field(default="", max_length=40)
    specialization: str = Field(default="", max_length=120)
    hospital_name: str = Field(default="", max_length=160)
    license_no: str | None = Field(default=None, max_length=80)


@router.post("/login")
async def login(payload: LoginRequest, response: Response) -> dict[str, Any]:
    db = get_database()
    email = normalize_email(payload.email)
    user = await db.users.find_one({"email": email})
    invalid = HTTPException(status_code=401, detail="Invalid email or password")
    if user is None or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise invalid
    if user.get("status") == "pending" and user.get("role") == "doctor":
        raise HTTPException(status_code=403, detail="Your doctor account is pending admin approval.")
    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="This staff account is not active. Contact the SLMA administrator.")

    token, expires_at = await _issue_session(user["user_id"])
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=settings.auth_session_ttl_minutes * 60,
        expires=expires_at,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login_at": utc_now(), "updated_at": utc_now()}},
    )
    profile = await doctor_profile_for_user(user)
    return {
        "user": public_user(user),
        "doctor_profile": serialize_mongo_doc(profile),
    }


@router.post("/doctor-signup", status_code=201)
async def doctor_signup(payload: DoctorSignupRequest) -> dict[str, Any]:
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=422, detail="Passwords do not match")

    db = get_database()
    email = normalize_email(payload.email)
    license_normalized = normalize_license(payload.license_no)

    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email is already registered")
    if license_normalized and await db.doctor_profiles.find_one({"license_no_normalized": license_normalized}):
        raise HTTPException(status_code=409, detail="License number is already registered")

    user_doc = new_user_document(
        name=payload.full_name,
        email=email,
        password=payload.password,
        role="doctor",
        status="pending",
    )
    now = utc_now()
    doctor_id = uuid4().hex
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
        raise HTTPException(status_code=409, detail="Email or license number is already registered") from exc

    return {
        "status": "pending",
        "message": "Doctor signup submitted. Your account is pending admin approval.",
        "user": public_user(user_doc),
        "doctor_profile": serialize_mongo_doc(profile_doc),
    }


@router.post("/logout")
async def logout(
    response: Response,
    slma_auth: str | None = Cookie(default=None, alias=get_settings().auth_cookie_name),
) -> dict[str, str]:
    if slma_auth:
        token_hash = hashlib.sha256(slma_auth.encode("utf-8")).hexdigest()
        await get_database().auth_sessions.delete_one({"token_hash": token_hash})
    settings = get_settings()
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="lax",
    )
    return {"status": "logged_out"}


@router.get("/me")
async def current_user(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    profile = await doctor_profile_for_user(user)
    return {
        "user": public_user(user),
        "doctor_profile": serialize_mongo_doc(profile),
    }
