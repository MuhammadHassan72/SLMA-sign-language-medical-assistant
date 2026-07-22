from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import admin, auth, csre, debug, doctors, inference, messages, patients, realtime, sessions
from app.config import get_settings
from app.database import close_mongo_connection, connect_to_mongo, ensure_indexes, ping_database

settings = get_settings()

LOCAL_NETWORK_CORS_REGEX = (
    r"^http://("
    r"localhost|127\.0\.0\.1|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r"):3000$"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    connect_to_mongo()
    try:
        await ensure_indexes()
        yield
    finally:
        close_mongo_connection()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Backend scaffold for the SLMA final-year-project.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=LOCAL_NETWORK_CORS_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(doctors.router)
app.include_router(patients.router)
app.include_router(sessions.router)
app.include_router(messages.router)
app.include_router(inference.router)
app.include_router(csre.router)
app.include_router(realtime.router)
app.include_router(debug.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health() -> dict[str, object]:
    database_connected = await ping_database()
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "database": {
            "name": settings.mongodb_db_name,
            "connected": database_connected,
        },
    }
