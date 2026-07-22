# SLMA — Sign Language Medical Assistant

> A bidirectional, AI-powered communication bridge between **deaf patients** and **doctors** — no human interpreter required.

SLMA lets a deaf patient sign to a camera and have their sign recognised, refined into a cautious clinical sentence, and delivered to the doctor in real time. The doctor replies in plain text, and a **3D avatar performs that reply back in sign language** on the patient's screen.

Built as a Final Year Project at **University of Management & Technology (UMT), Sialkot**.

---

## The Problem

There are roughly **70 million deaf people worldwide** (~10 million in Pakistan). In a hospital, a sign-language interpreter is almost never available — so deaf patients cannot describe symptoms and doctors cannot explain instructions. SLMA closes that gap in both directions.

---

## Key Features

| Feature | Description |
|---|---|
| 🤟 **Sign → Text** | Live camera sign recognition using MediaPipe landmarks + a deep learning model (2,731 sign vocabulary) |
| 🧠 **CSRE refinement** | Raw model glosses are converted into one safe, doctor-facing clinical sentence — never a diagnosis |
| 🧍 **Text → Sign (3D Avatar)** | Doctor's quick replies are performed by a Three.js avatar in sign language |
| 📹 **Live camera relay** | Patient's camera streams to the doctor's dashboard over a lightweight in-memory relay |
| 🩺 **Doctor dashboard** | Session control, patient records, translation log, top-5 model output with confidence bars |
| 🛡️ **Admin portal** | Doctor account approval, activation/deactivation, password reset, system stats |
| ✋ **Gesture Playground** | A separate, fully-offline general gesture demo (non-ASL) for evaluators/non-signers |

---

## Architecture

```
┌──────────────────────────┐        REST + polling         ┌─────────────────────────┐
│   PATIENT PORTAL         │  ─────────────────────────►   │      FastAPI Backend    │
│   (Next.js, public)      │                               │                         │
│   • MediaPipe Holistic   │   POST /predict-live-sequence │  • Keras model (96×339) │
│   • 339 features/frame   │   POST /camera-frame          │  • CSRE refinement      │
│   • 3D Avatar (R3F)      │   GET  /messages/{id}         │  • scrypt auth          │
└──────────────────────────┘                               │  • Motor / MongoDB      │
                                                           │                         │
┌──────────────────────────┐   GET /sessions/{id}          │                         │
│   DOCTOR PORTAL          │   GET /camera-frame           │                         │
│   (Next.js, auth-gated)  │  ◄─────────────────────────   │                         │
│   • Live patient feed    │   POST /messages/doctor       │                         │
│   • Translation log      │                               └─────────────────────────┘
└──────────────────────────┘                                          │
                                                            ┌─────────▼─────────┐
                                                            │     MongoDB       │
                                                            │ users · sessions  │
                                                            │ messages ·        │
                                                            │ predictions ·     │
                                                            │ patients          │
                                                            └───────────────────┘
```

**No WebSockets, no Redis, no Socket.io.** Synchronisation is deliberately done with lightweight REST polling so the system runs on any ordinary LAN without extra infrastructure.

| Loop | Interval |
|---|---|
| Patient → active session discovery | 3 s |
| Patient → doctor messages | 2 s |
| Patient → camera frame upload | 1 s |
| Doctor → session (messages + predictions) | 2 s |
| Doctor → patient camera frame | 700 ms |

---

## How Recognition Works

**1 · Landmark capture** — MediaPipe Holistic runs *in the browser* (no video ever leaves the client).

**2 · Feature extraction** — of the 543 landmarks MediaPipe produces, SLMA selects **113**:

| Group | Points |
|---|---|
| Pose | 23 |
| Face (selected) | 48 |
| Left hand | 21 |
| Right hand | 21 |
| **Total** | **113 × (x, y, z) = 339 features/frame** |

**3 · Sequence normalisation** — frames are cropped / uniformly sampled / zero-padded to a fixed **96 × 339 float32** tensor.

**4 · Model** — `TCN blocks → Squeeze-and-Excitation attention → BiLSTM → Attention Pooling → Softmax(2731)`, returning the **top-5** gloss candidates.

> **Note on CTC:** Connectionist Temporal Classification loss and decoders were **deliberately dropped**. On isolated single-sign glosses, CTC collapsed into a blank-dominance trap. The production model is a pure classification pipeline trained with sparse categorical cross-entropy.

**5 · CSRE (Custom Semantic Refinement Engine)** — converts glosses into a single cautious sentence. It never diagnoses, never invents symptoms, and always asks the doctor to confirm. If the external LLM is unreachable or rate-limited, a **local rule-based fallback** takes over so the pipeline never fails.

**6 · Persistence** — predictions and messages are stored in MongoDB; the doctor dashboard reflects them within ~2 s.

---

## Model Performance

Trained on the **ASL Citizen** dataset (isolated signs).

| Metric | Value |
|---|---|
| Vocabulary (classes) | **2,731** |
| Input shape | `(96, 339)` float32 |
| Top-1 accuracy | **38.9 %** |
| Top-5 accuracy | **66.4 %** |
| Macro-F1 | 0.38 |
| Canonical Top-1 / Top-5 | 40.4 % / 67.6 % |
| Operating confidence threshold | 0.30 |

> With **2,731 classes**, random chance is ~0.03 %. SLMA is designed as **clinical decision support**, not an autonomous diagnostic tool — the doctor always sees the confidence and is asked to confirm with the patient.

---

## Tech Stack

**Frontend** — Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · MediaPipe Holistic · Three.js / React Three Fiber / Drei · Framer Motion

**Backend** — FastAPI · Motor (async MongoDB) · TensorFlow / Keras · NumPy · Google GenAI SDK

**Database** — MongoDB (`users`, `auth_sessions`, `doctor_profiles`, `patients`, `sessions`, `messages`, `predictions`)

**Security** — scrypt password hashing (N=2¹⁴) · opaque httpOnly session cookies with TTL · role-based access (admin / doctor) · admin approval flow for new doctors

---

## Project Structure

```
slma-fyp/                       # Next.js frontend
├── src/app/
│   ├── page.tsx                # Landing page
│   ├── patient/page.tsx        # Patient portal (public, camera + avatar)
│   ├── doctor/page.tsx         # Doctor dashboard (auth-gated)
│   ├── admin/page.tsx          # Admin portal
│   ├── login/ · signup/        # Staff auth
│   └── mediapipe/page.tsx      # Landmark test page
├── src/components/
│   ├── mediapipe/              # Camera + landmark HUD
│   ├── avatar/AvatarPlayer.tsx # Three.js avatar player
│   ├── doctor/                 # Doctor patient workspace
│   └── gesture/                # Offline general-gesture playground
└── src/lib/                    # Backend URL resolution, avatar mapping

slma-backend/                   # FastAPI backend
└── app/
    ├── main.py                 # App entry, CORS, router registration
    ├── auth.py                 # scrypt auth, cookie sessions, RBAC
    ├── sessions.py             # Consultations, predictions, camera relay
    ├── inference.py            # Keras model loading + top-5 inference
    ├── csre.py                 # Semantic refinement + safe fallback
    ├── messages.py             # Doctor ↔ patient messaging
    ├── patients.py · doctors.py · admin.py
    └── database.py             # Motor client + indexes

docs/                           # API reference + development reports
```

---

## Getting Started

See **[SETUP.md](SETUP.md)** for full installation instructions.

Quick version:

```bash
# Backend
cd slma-backend
python -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt
copy .env.example .env                              # then fill in values
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd slma-fyp
npm install
npm run dev
```

Then open `http://localhost:3000`.

---

## ⚠️ Large Assets Not Included

To keep this repository lightweight, three sets of binary assets are **excluded**. `SETUP.md` explains how to restore each one:

| Asset | Size | How to obtain |
|---|---|---|
| Trained model `.keras` | ~67 MB | Distributed separately (see SETUP.md) |
| MediaPipe Holistic runtime | ~39 MB | `npm install` + copy script (see SETUP.md) |
| Gesture recognizer `.task` | ~8 MB | Download from MediaPipe model zoo |

No API keys, credentials, or patient data are included in this repository.

---

## Roadmap

- Continuous / sentence-level signing (beyond isolated glosses)
- GPU-accelerated, fully offline landmark extraction
- Fine-tuning on a focused medical vocabulary to raise top-1 accuracy
- Pakistan Sign Language (PSL) support

---
**##screenshots**

<img width="1279" height="679" alt="admin portal" src="https://github.com/user-attachments/assets/facf1a76-244f-4e28-836f-9dc635438eb0" />

## License

Released under the [MIT License](LICENSE).

---

**Author** — Final Year Project, University of Management & Technology (UMT), Sialkot
