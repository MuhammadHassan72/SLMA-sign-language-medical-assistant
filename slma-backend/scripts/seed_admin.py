import asyncio
import os

from pymongo.errors import DuplicateKeyError

from app.auth import new_user_document, normalize_email
from app.database import close_mongo_connection, connect_to_mongo, ensure_indexes, get_database


async def main() -> None:
    name = os.getenv("INITIAL_ADMIN_NAME", "").strip()
    email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip()
    password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    if not name or not email or not password:
        raise SystemExit(
            "Set INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD before running this command."
        )

    connect_to_mongo()
    try:
        await ensure_indexes()
        db = get_database()
        normalized_email = normalize_email(email)
        existing = await db.users.find_one({"email": normalized_email})
        if existing:
            if existing.get("role") != "admin":
                raise SystemExit("That email already belongs to a non-admin account.")
            print("Initial admin already exists; no changes made.")
            return
        try:
            await db.users.insert_one(
                new_user_document(name=name, email=normalized_email, password=password, role="admin")
            )
        except DuplicateKeyError as exc:
            raise SystemExit("Admin email already exists.") from exc
        print("Initial admin created successfully.")
    finally:
        close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())
