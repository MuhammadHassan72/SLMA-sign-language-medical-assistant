from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException


def to_object_id(value: str, field_name: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")


def serialize_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}
    return value


def serialize_mongo_doc(doc: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if doc is None:
        return None
    return {key: serialize_value(value) for key, value in doc.items()}


def serialize_mongo_list(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [serialize_mongo_doc(doc) for doc in docs if doc is not None]