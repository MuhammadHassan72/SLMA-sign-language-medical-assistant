# SLMA Core Feature Regression Audit

Generated: 2026-06-22 10:58:17 +05:00

## Scope

- Inspected current frontend/backend code, reports, and `DEVELOPMENT_LOG.md` before editing.
- Git status was unavailable because Git is not installed in this shell.
- No file was deleted, moved, or renamed. The ERD was not touched.
- The CE V2 Keras model, label encoder, and class mapping were not modified.
- `npm audit fix` was not run. Physical webcam accuracy is not claimed.

## Architecture Recorded

Frontend routes: `/`, `/doctor`, `/patient`, `/mediapipe`. The Patient Portal renders `EnhancedGeneralGesturePlayground`; the older component remains present but unused. Patient polling uses one latest-session loop (3 seconds), one doctor-message loop (2 seconds), and one frame relay loop (1 second). Doctor polling uses session data every 2 seconds and frames every 700 ms.

Backend routes audited: health, session start/latest/detail, session `.npy` and live prediction, both camera-frame routes, doctor/get messages, direct inference, CSRE, and database debug routes. Doctor messages save MongoDB ID, session ID, doctor sender/direction, text, UTC timestamps, and optional animation key. Camera frames remain in memory by session ID.

## Bugs Found and Fixed

1. Patient stopped checking latest session after initial connection. It now keeps one 3-second latest-session sync and follows a new doctor session.
2. Old session messages/predictions could remain briefly. Both portals now clear session-scoped state immediately.
3. Doctor no-session send created a misleading local-only message. It is now blocked with a clear warning.
4. Hardcoded consultation messages, simulated translation, obsolete phase labels, and a no-op End Session button were removed/replaced with honest states.
5. Relay could report active from an unavailable camera canvas. Camera loading/ready/error now gates relay.
6. General gesture temporal history survived Start/Stop. Motion, FPS, labels, timers, counts, and errors now reset.
7. CSRE used invalid `gemini-3.5-flash` and forced zero thinking. Code/env now use `gemini-2.5-pro`; forced zero thinking was removed.

## Feature Audit

| Feature | Previous status | Code inspected | Problem found | Fix applied | Automated test result | Runtime test result | Manual test still required | Final honest status |
|---|---|---|---|---|---|---|---|---|
| Same session | Partial | Portals/sessions API | Patient could stay old | Persistent sync/reset | TS/lint pass | Same ID and session switch confirmed | LAN rehearsal | Verified working |
| Manual doctor message | API-only | Send/API/patient poll | Unsynced local send | Blocked no-session send | Schema/dedupe pass | Visible under camera | No | Verified working |
| Quick avatar response | Partial | Mapping/player/poll | Runtime evidence missing | Session fixes | GLBs found | Text, key, Playing status confirmed | Physical visual check | Verified working |
| Message dedupe | Partial | Patient ID Map | Stale cross-session UI | Clear on switch | Logic pass | 2 records/2 IDs | No | Verified working |
| Manual `.npy` | Working | Upload/session inference | None | None | Invalid input tests pass | Real sample saved | No | Verified working |
| Prepared samples | Working | Manifest/files/API | Full sweep missing | None | 10 files found | 10/10 correct/accepted | No | Verified working |
| Direct inference | Working | `inference.py` | None | None | 96 x 339 checks | SICK, Top-5, 0.9988685846 | No | Verified working |
| Quick/Normal/Long | Implemented | Modes/MediaPipe/live API | Physical evidence missing | Camera/session fixes | Shared 339 path pass | Real sequence API pass | Real signing | Implemented, manual hardware test required |
| Continuous Segments | Implemented | Loop/history/live API | Repeated evidence missing | Session cleanup | Loop checks pass | Two distinct predictions | Real multi-segment signing | Implemented, manual hardware test required |
| Low confidence | Working | Threshold/CSRE/UI | Evidence missing | None | Threshold confirmed | Real sample 0.1868999898 rejected safely | No | Verified working |
| Camera relay | Partial | Patient/backend/doctor | False active possible | Camera-ready gate | Cleanup inspected | API/fake-camera relay pass | Physical two-laptop test | Implemented, manual hardware test required |
| Built-in gestures | Model ready | Gesture components/model/WASM | Physical labels unverified | Runtime reset | Model/WASM 200 | Recognizer Ready | Test each gesture | Implemented, manual hardware test required |
| New gesture rules | Partial | Enhanced rules | History not reset | Full Start/Stop reset | Guards inspected | Component reset/Ready | Physical tuning | Implemented, manual hardware test required |
| General/medical separation | Structural | Source/network | Runtime evidence missing | None | No medical calls | No predict/CSRE request | No | Verified working |
| Safe CSRE | Working | CSRE/UI | Invalid model config | Correct model/safety | High/low cases pass | Complete safe text | No | Verified working |
| Direct CSRE API | Broken | SDK/env/test | API quota zero | Corrected code/config | Reaches 2.5 Pro | HTTP 429; safe path used | Enable paid quota | Blocked with exact reason |
| MongoDB | Working | DB/session/message/debug | Evidence incomplete | None | Debug pass | Connected/counts update | No | Verified working |
| Layout | Partial | JSX/screenshots | Misleading/no-op UI | Honest UI states | TS/lint pass | 1440 x 900 no overlap | Target laptop check | Verified working |
| Exact metrics | Pending | Four artifacts | Not consolidated | Summary created | 32934 rows parsed | N/A | No | Verified working |

## Runtime Evidence

- Browser: same session, second-session auto-switch, permanent Doctor Message card, manual text, quick avatar response, no duplicate records, patient relay, recognizer Ready, model/WASM 200, no provider names, no unexpected HTTP errors, and no page exceptions.
- API: health/MongoDB pass; manual/quick messages save expected fields; frame POST/GET matches session.
- SICK direct inference: confidence `0.9988685846328735`, accepted, five candidates.
- Real CHAMP sample: Top-1 VOTE, `0.18689998984336853`, rejected with repeat/confirm text.
- Real SICK live sequence: 64 source frames, 21 hand frames; two calls created distinct predictions.
- `(96,338)`, NaN/Inf, and zero-landmark files each returned clear HTTP 400 responses.
- Prepared samples all matched: SICK `0.9988685846`, HEART `0.9968276620`, STOMACH `0.9429111481`, HEADACHE `0.8802012205`, TIRED `0.9896751046`, COLD `0.8936091065`, HOT `0.9402210712`, SLEEP `0.9887521863`, FAINT `0.9986905456`, INHALE `0.9875810146`.

## Exact Saved Metrics

- Test loss: `2.965562582015991`
- TensorFlow/Manual Top-1: `0.38877755403518677` / `0.38877755511022044`
- TensorFlow/Manual Top-5: `0.6638124585151672` / `0.6638124734317119`
- Macro-F1: `0.3845374045584791`
- Classes/test rows/input: `2731` / `32934` / `96 x 339`
- Deployed threshold 0.3: accepted accuracy `0.5138454566054838`, coverage `0.6699763162689014`.
- Threshold 0.7: accepted accuracy `0.8008683934720766`, coverage `0.20279953847088117`.
- The threshold artifact has no explicit best/recommended flag. See `03_SLMA_MODEL_METRICS.md`.

## Validation

- TypeScript: PASS.
- ESLint: PASS, no warnings/errors.
- Python compile for main/messages/sessions/inference/CSRE/database/debug: PASS.
- Final scan found no `543`, invalid Gemini model, simulated-translation label, or obsolete phase label.

## Still Requiring Physical Manual Testing

- Real signer Quick/Normal/Long and Continuous Segments.
- All built-in and new general gestures plus evaluator-camera threshold tuning.
- Final two-laptop LAN/firewall/camera-permission rehearsal.

## Genuinely Incomplete or Blocked

- Direct Gemini CSRE is externally blocked by HTTP 429 `RESOURCE_EXHAUSTED`: free-tier request/input-token limit `0` for `gemini-2.5-pro`. Safe CSRE works.
- Continuous communication remains segmented isolated-gloss recognition, not a continuous-language model.
- Physical gesture accuracy requires a real webcam/signing test.
