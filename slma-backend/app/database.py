from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import get_settings

client: Optional[AsyncIOMotorClient] = None
database: Optional[AsyncIOMotorDatabase] = None


def connect_to_mongo() -> None:
    global client, database

    settings = get_settings()
    if client is None:
        client = AsyncIOMotorClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=settings.mongodb_server_selection_timeout_ms,
        )
    database = client[settings.mongodb_db_name]


def get_database() -> AsyncIOMotorDatabase:
    if database is None:
        raise RuntimeError("MongoDB has not been initialized")
    return database


async def ping_database() -> bool:
    if client is None:
        return False

    try:
        await client.admin.command("ping")
    except Exception:
        return False
    return True


async def ensure_indexes() -> None:
    db = get_database()
    await db.users.create_index("email", unique=True, sparse=True, name="users_email_unique")
    await db.users.create_index("user_id", unique=True, sparse=True, name="users_user_id_unique")
    await db.auth_sessions.create_index("token_hash", unique=True, name="auth_token_hash_unique")
    await db.auth_sessions.create_index("user_id", name="auth_user_id")
    await db.auth_sessions.create_index("expires_at", expireAfterSeconds=0, name="auth_expiry_ttl")
    await db.doctor_profiles.create_index("user_id", unique=True, name="doctor_user_unique")
    await db.doctor_profiles.create_index(
        "license_no_normalized",
        unique=True,
        sparse=True,
        name="doctor_license_unique",
    )
    await db.patients.create_index("phone_normalized", name="patient_phone")
    await db.patients.create_index("normalized_name", name="patient_name")
    await db.patients.create_index("created_by_doctor_id", name="patient_creator")
    await db.sessions.create_index("doctor_id", name="session_doctor")
    await db.sessions.create_index("patient_id", name="session_patient")
    await db.sessions.create_index("started_at", name="session_started_at")
    await db.sessions.create_index([("doctor_id", 1), ("status", 1)], name="session_doctor_status")
    await db.messages.create_index([("session_id", 1), ("created_at", 1)], name="message_session_time")
    await db.predictions.create_index([("session_id", 1), ("created_at", 1)], name="prediction_session_time")


def close_mongo_connection() -> None:
    global client, database

    if client is not None:
        client.close()
    client = None
    database = None
