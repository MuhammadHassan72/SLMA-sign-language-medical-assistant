import json
import os
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import BASE_DIR

router = APIRouter(prefix="/inference", tags=["inference"])

EXPECTED_FRAMES = 96
EXPECTED_FEATURES = 339
TOP_K = 5

_model: Any = None
_model_lock = Lock()
_label_encoder: list[str] | None = None
_label_lock = Lock()


@tf.keras.utils.register_keras_serializable(package="SLMA", name="AttentionPooling1D")
class AttentionPooling1D(layers.Layer):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.score = layers.Dense(1)

    def build(self, input_shape: Any) -> None:
        self.score.build(input_shape)
        super().build(input_shape)

    def call(self, inputs: Any) -> Any:
        scores = self.score(inputs)
        weights = tf.nn.softmax(scores, axis=1)
        weights = tf.cast(weights, inputs.dtype)
        return tf.reduce_sum(inputs * weights, axis=1)

    def compute_output_shape(self, input_shape: Any) -> Any:
        return input_shape[0], input_shape[-1]

    def get_config(self) -> dict[str, Any]:
        config = super().get_config()
        return config


def _resolve_env_path(env_name: str) -> Path:
    raw_path = os.getenv(env_name)
    if not raw_path:
        raise HTTPException(status_code=500, detail=f"{env_name} is not configured")

    path = Path(raw_path)
    if not path.is_absolute():
        path = BASE_DIR / path
    return path


def _get_confidence_threshold() -> float:
    raw_threshold = os.getenv("CONFIDENCE_THRESHOLD", "0.3")
    try:
        return float(raw_threshold)
    except ValueError:
        raise HTTPException(status_code=500, detail="CONFIDENCE_THRESHOLD must be a number")


def load_model_once() -> Any:
    global _model

    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        model_path = _resolve_env_path("MODEL_PATH")
        if not model_path.exists():
            raise HTTPException(status_code=500, detail=f"Model file not found: {model_path}")

        try:
            tf.keras.utils.get_custom_objects()["AttentionPooling1D"] = AttentionPooling1D
            tf.keras.utils.get_custom_objects()["SLMA>AttentionPooling1D"] = AttentionPooling1D
            _model = tf.keras.models.load_model(
                model_path,
                custom_objects={
                    "AttentionPooling1D": AttentionPooling1D,
                    "SLMA>AttentionPooling1D": AttentionPooling1D,
                },
                compile=False,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to load model: {exc}") from exc

    return _model


def _labels_from_id_map(id_to_label: dict[str, Any]) -> list[str]:
    parsed: dict[int, str] = {}
    for key, value in id_to_label.items():
        try:
            parsed[int(key)] = str(value)
        except (TypeError, ValueError):
            continue

    if not parsed:
        return []

    max_index = max(parsed)
    return [parsed.get(index, f"class_{index}") for index in range(max_index + 1)]


def load_label_encoder_once() -> list[str]:
    global _label_encoder

    if _label_encoder is not None:
        return _label_encoder

    with _label_lock:
        if _label_encoder is not None:
            return _label_encoder

        label_path = _resolve_env_path("LABEL_ENCODER_PATH")
        if not label_path.exists():
            raise HTTPException(status_code=500, detail=f"Label encoder file not found: {label_path}")

        try:
            with label_path.open("r", encoding="utf-8") as file:
                payload = json.load(file)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to load label encoder: {exc}") from exc

        labels: list[str] = []
        if isinstance(payload, list):
            labels = [str(item) for item in payload]
        elif isinstance(payload, dict):
            id_to_label = payload.get("id_to_label")
            if isinstance(id_to_label, dict):
                labels = _labels_from_id_map(id_to_label)

            if not labels:
                for key in ("classes", "class_names", "classes_"):
                    value = payload.get(key)
                    if isinstance(value, list):
                        labels = [str(item) for item in value]
                        break

            if not labels:
                label_to_id = payload.get("label_to_id")
                if isinstance(label_to_id, dict):
                    inverted = {str(index): label for label, index in label_to_id.items()}
                    labels = _labels_from_id_map(inverted)

        if not labels:
            raise HTTPException(status_code=500, detail="Label encoder does not contain class labels")

        _label_encoder = labels

    return _label_encoder


def normalize_input_shape(array: Any) -> Any:
    import numpy as np

    sequence = np.asarray(array, dtype=np.float32)

    if sequence.shape == (EXPECTED_FRAMES, EXPECTED_FEATURES):
        sequence = np.expand_dims(sequence, axis=0)
    elif sequence.shape != (1, EXPECTED_FRAMES, EXPECTED_FEATURES):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid .npy shape. Expected (96, 339) or (1, 96, 339); "
                f"received {tuple(sequence.shape)}"
            ),
        )

    if not np.isfinite(sequence).all():
        raise HTTPException(status_code=400, detail="Invalid .npy values. NaN or Inf detected")

    return sequence


def _label_for_index(labels: list[str], index: int) -> str:
    if 0 <= index < len(labels):
        return labels[index]
    return f"class_{index}"


def get_top5_predictions(predictions: Any, labels: list[str]) -> list[dict[str, Any]]:
    import numpy as np

    scores = np.asarray(predictions, dtype=np.float64)
    if scores.ndim == 2 and scores.shape[0] == 1:
        scores = scores[0]
    elif scores.ndim != 1:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected model output shape: {tuple(scores.shape)}",
        )

    if scores.size == 0:
        raise HTTPException(status_code=500, detail="Model returned no class scores")

    top_count = min(TOP_K, scores.size)
    top_indices = np.argsort(scores)[-top_count:][::-1]

    return [
        {
            "rank": rank,
            "gloss": _label_for_index(labels, int(index)),
            "confidence": float(scores[index]),
        }
        for rank, index in enumerate(top_indices, start=1)
    ]


def _predict(sequence: Any) -> Any:
    model = load_model_once()
    return model.predict(sequence, verbose=0)


@router.post("/npy")
async def predict_from_npy(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".npy"):
        raise HTTPException(status_code=400, detail="Uploaded file must have a .npy extension")

    try:
        content = await file.read()
    finally:
        await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded .npy file is empty")

    try:
        import numpy as np

        uploaded_array = np.load(BytesIO(content), allow_pickle=False)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid .npy file: {exc}") from exc

    sequence = normalize_input_shape(uploaded_array)
    labels = load_label_encoder_once()
    predictions = await run_in_threadpool(_predict, sequence)
    top5 = get_top5_predictions(predictions, labels)

    top1 = top5[0]
    threshold = _get_confidence_threshold()

    return {
        "top1_gloss": top1["gloss"],
        "top1_confidence": top1["confidence"],
        "top5": top5,
        "threshold": threshold,
        "is_accepted": top1["confidence"] >= threshold,
    }
