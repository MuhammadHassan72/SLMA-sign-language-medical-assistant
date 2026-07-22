from html import escape
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.config import get_settings
from app.database import get_database, ping_database
from app.mongo_utils import serialize_mongo_list

router = APIRouter(prefix="/debug", tags=["debug"])

SUMMARY_COLLECTIONS = [
    "sessions",
    "messages",
    "predictions",
    "users",
    "doctor_profiles",
    "patients",
]
CAMERA_FRAME_NOTE = (
    "Live camera frames are relayed in memory and are not persisted to MongoDB for performance."
)
DEVELOPMENT_ENVS = {"development", "dev", "local", "test"}


def _ensure_development_mode() -> None:
    settings = get_settings()
    if settings.app_env.lower() not in DEVELOPMENT_ENVS:
        raise HTTPException(status_code=404, detail="Debug endpoints are disabled")


def _project_session(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "_id": doc.get("_id"),
        "doctor_id": doc.get("doctor_id"),
        "patient_id": doc.get("patient_id"),
        "status": doc.get("status"),
        "started_at": doc.get("started_at"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _project_message(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "_id": doc.get("_id"),
        "session_id": doc.get("session_id"),
        "direction": doc.get("direction"),
        "text": doc.get("text"),
        "final_text": doc.get("final_text"),
        "raw_glosses": doc.get("raw_glosses"),
        "animation_key": doc.get("animation_key"),
        "created_at": doc.get("created_at"),
    }


def _project_prediction(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "_id": doc.get("_id"),
        "session_id": doc.get("session_id"),
        "input_type": doc.get("input_type"),
        "top1_gloss": doc.get("top1_gloss"),
        "top1_confidence": doc.get("top1_confidence"),
        "top5": doc.get("top5"),
        "threshold": doc.get("threshold"),
        "is_accepted": doc.get("is_accepted"),
        "refined_text": doc.get("refined_text"),
        "uncertainty_note": doc.get("uncertainty_note"),
        "source": doc.get("source"),
        "created_at": doc.get("created_at"),
    }


async def _latest_docs(collection_name: str, limit: int) -> list[dict[str, Any]]:
    db = get_database()
    docs = await db[collection_name].find({}).sort([("created_at", -1), ("_id", -1)]).limit(limit).to_list(limit)
    if collection_name == "sessions":
        docs = [_project_session(doc) for doc in docs]
    elif collection_name == "messages":
        docs = [_project_message(doc) for doc in docs]
    elif collection_name == "predictions":
        docs = [_project_prediction(doc) for doc in docs]
    return serialize_mongo_list(docs)


async def build_db_summary() -> dict[str, Any]:
    _ensure_development_mode()

    settings = get_settings()
    db = get_database()
    database_connected = await ping_database()

    collection_counts = {
        collection_name: await db[collection_name].count_documents({})
        for collection_name in SUMMARY_COLLECTIONS
    }

    return {
        "database_connected": database_connected,
        "database_name": settings.mongodb_db_name,
        "collection_counts": collection_counts,
        "latest_sessions": await _latest_docs("sessions", 3),
        "latest_messages": await _latest_docs("messages", 5),
        "latest_predictions": await _latest_docs("predictions", 5),
        "note": CAMERA_FRAME_NOTE,
    }


def _render_doc_table(title: str, docs: list[dict[str, Any]]) -> str:
    if not docs:
        return f"<section><h2>{escape(title)}</h2><p class='empty'>No records found.</p></section>"

    keys = list(docs[0].keys())
    header = "".join(f"<th>{escape(str(key))}</th>" for key in keys)
    rows = []
    for doc in docs:
        cells = "".join(f"<td>{escape(str(doc.get(key, '')))}</td>" for key in keys)
        rows.append(f"<tr>{cells}</tr>")

    return (
        f"<section><h2>{escape(title)}</h2>"
        f"<table><thead><tr>{header}</tr></thead><tbody>{''.join(rows)}</tbody></table></section>"
    )


@router.get("/db-summary")
async def get_db_summary() -> dict[str, Any]:
    return await build_db_summary()


@router.get("/db-summary/html", response_class=HTMLResponse)
async def get_db_summary_html() -> str:
    summary = await build_db_summary()
    counts = "".join(
        f"<li><strong>{escape(name)}</strong><span>{count}</span></li>"
        for name, count in summary["collection_counts"].items()
    )

    return f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SLMA MongoDB Debug Summary</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 24px; }}
    h1 {{ margin: 0 0 6px; font-size: 26px; }}
    h2 {{ margin: 24px 0 10px; font-size: 18px; color: #93c5fd; }}
    .meta, .note, .empty {{ color: #94a3b8; font-size: 14px; }}
    .note {{ margin-top: 12px; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #111827; }}
    ul {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; padding: 0; list-style: none; }}
    li {{ display: flex; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid #334155; border-radius: 8px; background: #111827; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }}
    th, td {{ border: 1px solid #334155; padding: 8px; text-align: left; vertical-align: top; word-break: break-word; }}
    th {{ background: #1e293b; color: #bfdbfe; }}
    td {{ background: #111827; }}
  </style>
</head>
<body>
  <main>
    <h1>SLMA MongoDB Debug Summary</h1>
    <p class="meta">Database: {escape(str(summary["database_name"]))} | Connected: {escape(str(summary["database_connected"]))}</p>
    <section>
      <h2>Collection Counts</h2>
      <ul>{counts}</ul>
    </section>
    {_render_doc_table("Latest Sessions", summary["latest_sessions"])}
    {_render_doc_table("Latest Messages", summary["latest_messages"])}
    {_render_doc_table("Latest Predictions", summary["latest_predictions"])}
    <p class="note">{escape(summary["note"])}</p>
  </main>
</body>
</html>
"""
