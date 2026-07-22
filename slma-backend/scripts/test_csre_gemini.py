import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from app.csre import GlossCandidate, RefineRequest, _build_gemini_response, build_fallback_response  # noqa: E402


async def run_case(name: str, payload: RefineRequest) -> None:
    glosses = [candidate.gloss for candidate in sorted(payload.top5, key=lambda item: item.rank)]
    response = await _build_gemini_response(payload, glosses)
    if response is None:
        response = build_fallback_response(payload.top5, payload.is_accepted)

    label = "CSRE refinement" if response["source"] == "csre" else "Safe CSRE refinement"
    print(f"\n{name}")
    print(f"source_label: {label}")
    print(f"source_code: {response['source']}")
    print(f"refined_text: {response['refined_text']}")
    print(f"uncertainty_note: {response['uncertainty_note']}")


async def main() -> None:
    high_confidence = RefineRequest(
        top1_gloss="SICK",
        top1_confidence=0.998,
        top5=[
            GlossCandidate(rank=1, gloss="SICK", confidence=0.998),
            GlossCandidate(rank=2, gloss="TIRED", confidence=0.421),
        ],
        is_accepted=True,
        threshold=0.3,
    )
    low_confidence = RefineRequest(
        top1_gloss="UNKNOWN",
        top1_confidence=0.12,
        top5=[
            GlossCandidate(rank=1, gloss="UNKNOWN", confidence=0.12),
            GlossCandidate(rank=2, gloss="SICK", confidence=0.09),
        ],
        is_accepted=False,
        threshold=0.3,
    )

    await run_case("high-confidence sample: SICK", high_confidence)
    await run_case("low-confidence sample: UNKNOWN", low_confidence)


if __name__ == "__main__":
    asyncio.run(main())
