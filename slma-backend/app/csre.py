import json
import os
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

router = APIRouter(prefix="/csre", tags=["csre"])

DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
DEFAULT_GEMINI_TIMEOUT_SECONDS = 45
CSRE_SOURCE = "csre"
SAFE_CSRE_SOURCE = "safe_csre"

# Transport-level failures only: no internet, host unreachable, DNS failure,
# connect/read timeout. Kept deliberately distinct from HTTP status errors such
# as a 429 quota response (google.genai raises its own APIError for those),
# which continue to use the ordinary safe fallback path.
_CONNECTION_ERRORS = (httpx.TransportError, ConnectionError)


class GlossCandidate(BaseModel):
    rank: int = Field(..., ge=1)
    gloss: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0)


class RefineRequest(BaseModel):
    top5: list[GlossCandidate] = Field(default_factory=list)
    is_accepted: bool
    threshold: float = Field(..., ge=0.0)
    top1_gloss: str | None = None
    top1_confidence: float | None = Field(default=None, ge=0.0)


class RefineResponse(BaseModel):
    refined_text: str
    uncertainty_note: str
    raw_glosses_used: list[str]
    source: str


def _extract_glosses(top5: list[GlossCandidate]) -> list[str]:
    glosses: list[str] = []
    for candidate in sorted(top5, key=lambda item: item.rank):
        gloss = candidate.gloss.strip().upper()
        if gloss and gloss not in glosses:
            glosses.append(gloss)
    return glosses


def _top_candidate(payload: RefineRequest) -> GlossCandidate | None:
    if not payload.top5:
        return None
    return sorted(payload.top5, key=lambda item: item.rank)[0]


def _friendly_gloss_text(glosses: list[str]) -> str:
    return ", ".join(gloss.replace("_", " ").lower() for gloss in glosses)


def build_fallback_response(top5: list[GlossCandidate], is_accepted: bool) -> dict[str, Any]:
    glosses = _extract_glosses(top5)

    if not is_accepted:
        refined_text = "The sign recognition result is uncertain. Please ask the patient to repeat or confirm the sign."
        uncertainty_note = "Safe CSRE refinement used because the model confidence is below the acceptance threshold."
    elif glosses:
        primary_gloss = glosses[0]
        refined_text = (
            f"The patient may be indicating {_friendly_gloss_text([primary_gloss])}. "
            "Please confirm the exact meaning with the patient."
        )
        uncertainty_note = "Safe CSRE refinement used; this is not a diagnosis."
    else:
        refined_text = "No clear sign candidate was provided. Please ask the patient to repeat or confirm the sign."
        uncertainty_note = "Safe CSRE refinement used because no gloss candidates were available."

    return {
        "refined_text": refined_text,
        "uncertainty_note": uncertainty_note,
        "raw_glosses_used": glosses,
        "source": SAFE_CSRE_SOURCE,
    }


def _get_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL


def _get_gemini_timeout_seconds() -> int:
    raw_value = os.getenv("GEMINI_TIMEOUT_SECONDS", str(DEFAULT_GEMINI_TIMEOUT_SECONDS)).strip()
    try:
        timeout_seconds = int(raw_value)
    except ValueError:
        return DEFAULT_GEMINI_TIMEOUT_SECONDS
    return max(1, timeout_seconds)


def _build_gemini_prompt(payload: RefineRequest, glosses: list[str]) -> str:
    top_candidate = _top_candidate(payload)
    top1_gloss = payload.top1_gloss or top_candidate.gloss if top_candidate else ""
    top1_confidence = (
        payload.top1_confidence
        if payload.top1_confidence is not None
        else top_candidate.confidence if top_candidate else 0.0
    )
    top5_payload = [
        {
            "rank": candidate.rank,
            "gloss": candidate.gloss,
            "confidence": candidate.confidence,
        }
        for candidate in sorted(payload.top5, key=lambda item: item.rank)
    ]

    return (
        "You are the CSRE sentence refinement module for a sign-language medical assistant.\n"
        "Convert model gloss candidates into one short doctor-facing English sentence.\n"
        "Rules:\n"
        "- Do not diagnose.\n"
        "- Do not invent symptoms.\n"
        "- Do not give treatment advice.\n"
        "- Do not claim certainty.\n"
        "- Use only the provided gloss candidates.\n"
        "- Use only the top1 gloss in the sentence unless top1 is empty.\n"
        "- Always set needs_confirmation to true.\n"
        '- If is_accepted is true, the sentence must start with "The patient may be indicating" and must end by asking the doctor to confirm with the patient.\n'
        "- If confidence is low or is_accepted is false, ask the doctor to confirm or ask the patient to repeat.\n"
        '- If is_accepted is false, use this sentence style: "The sign recognition result is uncertain. Please ask the patient to repeat or confirm the sign."\n'
        "- Return JSON only, with no markdown, no extra text, and no code fence.\n"
        'Required JSON shape: {"sentence":"The patient may be indicating ... Please confirm the exact meaning with the patient.","needs_confirmation":true}\n'
        f"top1_gloss: {top1_gloss}\n"
        f"top1_confidence: {top1_confidence}\n"
        f"top5_candidates: {json.dumps(top5_payload)}\n"
        f"confidence_threshold: {payload.threshold}\n"
        f"is_accepted: {payload.is_accepted}\n"
        f"allowed_glosses: {', '.join(glosses)}"
    )


def _parse_json_object(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if not text:
        raise ValueError("empty response")
    if text.startswith("```") or text.endswith("```"):
        raise ValueError("response used markdown fence")

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("response JSON must be an object")
    return parsed


def _sentence_mentions_allowed_gloss(sentence: str, glosses: list[str]) -> bool:
    if not glosses:
        return False
    normalized_sentence = sentence.upper().replace("-", " ")
    return any(gloss.replace("_", " ") in normalized_sentence for gloss in glosses)


def _is_sentence_safe(sentence: str, glosses: list[str], is_accepted: bool) -> bool:
    normalized = " ".join(sentence.strip().split())
    if normalized != sentence.strip():
        return False
    if len(normalized.split()) < 8:
        return False
    if normalized[-1:] not in {".", "?", "!"}:
        return False
    if normalized.endswith((",", ";", ":", " and.", " or.")):
        return False

    lower = normalized.lower()
    unsafe_phrases = (
        "diagnosed",
        "diagnosis",
        "you should take",
        "take medicine",
        "prescribe",
        "treatment",
        "emergency immediately",
        "definitely",
        "certainly",
        "is suffering from",
    )
    if any(phrase in lower for phrase in unsafe_phrases):
        return False
    if not is_accepted:
        return "uncertain" in lower or "repeat" in lower or "confirm" in lower
    return _sentence_mentions_allowed_gloss(normalized, glosses) and "may" in lower and "confirm" in lower


def _call_gemini_direct(prompt: str, api_key: str, model_name: str, timeout_seconds: int) -> str:
    timeout_ms = timeout_seconds * 1000
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=timeout_ms),
    )
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                maxOutputTokens=512,
                responseMimeType="application/json",
            ),
        )
        return (getattr(response, "text", "") or "").strip()
    finally:
        client.close()


async def _build_gemini_response(payload: RefineRequest, glosses: list[str]) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or not glosses:
        return None

    model_name = _get_gemini_model()
    timeout_seconds = _get_gemini_timeout_seconds()
    prompt = _build_gemini_prompt(payload, glosses)

    try:
        raw_text = await run_in_threadpool(
            _call_gemini_direct,
            prompt,
            api_key,
            model_name,
            timeout_seconds,
        )
        parsed = _parse_json_object(raw_text)
        sentence = str(parsed.get("sentence", "")).strip()
        needs_confirmation = bool(parsed.get("needs_confirmation", True))

        if not needs_confirmation:
            raise ValueError("CSRE response must require confirmation")
        if not _is_sentence_safe(sentence, glosses, payload.is_accepted):
            raise ValueError("CSRE response failed safety or completeness checks")

        return {
            "refined_text": sentence,
            "uncertainty_note": "CSRE refinement generated a cautious sentence; confirm with the patient.",
            "raw_glosses_used": glosses,
            "source": CSRE_SOURCE,
        }
    except _CONNECTION_ERRORS as exc:
        # Offline / unreachable host: never surface the raw transport error.
        # Serve the local safe fallback, tagged so the UI can show provenance.
        print(f"[csre] offline fallback engaged (connection error): {exc}", flush=True)
        offline_fallback = build_fallback_response(payload.top5, payload.is_accepted)
        offline_fallback["uncertainty_note"] = (
            f"{offline_fallback['uncertainty_note']} Source: Local Standalone Fallback Engine."
        )
        return offline_fallback
    except Exception as exc:
        print(f"[csre] direct Gemini call failed for {_get_gemini_model()}: {exc}", flush=True)
        return None


def refine_medical_text(text: str) -> str:
    return text.strip()


@router.post("/refine", response_model=RefineResponse)
async def refine_semantic_text(payload: RefineRequest) -> RefineResponse:
    glosses = _extract_glosses(payload.top5)
    gemini_response = await _build_gemini_response(payload, glosses)
    response = gemini_response or build_fallback_response(payload.top5, payload.is_accepted)
    return RefineResponse(**response)
