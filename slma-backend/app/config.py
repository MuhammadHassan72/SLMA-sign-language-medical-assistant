import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _get_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default


def _get_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.app_name = os.getenv("APP_NAME", "SLMA Backend")
        self.app_env = os.getenv("APP_ENV", "development")
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.mongodb_db_name = os.getenv("MONGODB_DB_NAME", "slma")
        self.mongodb_server_selection_timeout_ms = _get_int(
            "MONGODB_SERVER_SELECTION_TIMEOUT_MS",
            2000,
        )
        self.cors_origins = _split_csv(
            os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000",
            )
        )
        self.auth_cookie_name = os.getenv("AUTH_COOKIE_NAME", "slma_auth")
        self.auth_session_ttl_minutes = _get_int("AUTH_SESSION_TTL_MINUTES", 480)
        self.auth_cookie_secure = _get_bool("AUTH_COOKIE_SECURE", False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
