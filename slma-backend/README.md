# SLMA Backend

FastAPI and MongoDB backend for the SLMA doctor/patient communication system. It provides staff authentication, doctor administration, doctor-managed patient profiles, consultation ownership/history, medical landmark inference, CSRE refinement, messages, and the in-memory patient camera relay.

## Setup

```powershell
cd "D:\FYP\Internal frontend\slma-backend"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Use `npm.cmd run dev -- --hostname 0.0.0.0 -p 3000` in the frontend directory for a two-laptop LAN demo. `CORS_ORIGINS` and the existing local-network CORS rule allow the frontend on port 3000; authenticated frontend requests include credentials.

## Environment

Keep MongoDB and API secrets only in `.env`. Do not expose them through `NEXT_PUBLIC_*` variables.

```env
APP_NAME=SLMA Backend
APP_ENV=development
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=slma
MONGODB_SERVER_SELECTION_TIMEOUT_MS=2000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
AUTH_COOKIE_NAME=slma_auth
AUTH_SESSION_TTL_MINUTES=480
AUTH_COOKIE_SECURE=false
INITIAL_ADMIN_NAME=
INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=
```

Set `AUTH_COOKIE_SECURE=true` when the deployed frontend/backend use HTTPS.

## Create The First Admin

The admin password is never hardcoded. Set the three values only in the terminal environment and run the one-time command:

```powershell
$env:INITIAL_ADMIN_NAME="SLMA Administrator"
$env:INITIAL_ADMIN_EMAIL="admin@example.com"
$env:INITIAL_ADMIN_PASSWORD="replace-with-a-strong-password"
.\.venv\Scripts\python.exe -m scripts.seed_admin
Remove-Item Env:INITIAL_ADMIN_PASSWORD
```

The command is idempotent for an existing admin email. After seeding, open `http://localhost:3000/login`.

## Authentication

- Passwords use salted standard-library `scrypt`; plain-text passwords are never stored.
- Login issues a random opaque token in an HTTP-only, SameSite=Lax cookie.
- MongoDB stores only the SHA-256 token hash in `auth_sessions`.
- Sessions expire according to `AUTH_SESSION_TTL_MINUTES`; a TTL index removes expired records.
- Inactive doctors receive the same generic invalid-credentials response as other failed logins.
- Admin endpoints require the `admin` role. Doctor-side clinical changes require the owning doctor or an admin.
- Patients do not have accounts and do not enter their profile data.

## Primary Endpoints

Authentication:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Administration:

- `GET /admin/summary`
- `GET|POST /admin/doctors`
- `PATCH /admin/doctors/{doctor_id}`
- `PATCH /admin/doctors/{doctor_id}/status`
- `POST /admin/doctors/{doctor_id}/reset-password`
- `GET /admin/sessions/recent`

Doctor and patient profiles:

- `GET /doctors/me`
- `GET|POST /patients`
- `GET|PATCH /patients/{patient_id}`
- `GET /patients/{patient_id}/history`

Consultations:

- `POST /sessions/start` - authenticated doctor/admin; links selected doctor and patient
- `GET /sessions/latest` - patient portal synchronization
- `GET /sessions/mine/latest`
- `GET /sessions/mine/history`
- `POST /sessions/{session_id}/end`
- `GET /sessions/{session_id}` - owning doctor/admin, with legacy read support
- `POST /sessions/{session_id}/predict-npy`
- `POST /sessions/{session_id}/predict-live-sequence`
- `POST|GET /sessions/{session_id}/camera-frame`
- `POST /messages/doctor`
- `GET /messages/{session_id}`

Inference and diagnostics:

- `POST /inference/npy`
- `POST /csre/refine`
- `GET /health`
- `GET /debug/db-summary`
- `GET /docs`

## Collections

- `users` - admin/doctor accounts; legacy passwordless demo records remain untouched
- `doctor_profiles` - one-to-one doctor details
- `auth_sessions` - expiring opaque-token hashes
- `patients` - existing collection upgraded for doctor-managed textual patient profiles
- `sessions`, `messages`, `predictions` - consultation data

Live camera frame data stays in memory and is not saved to MongoDB. Patient photo capture/storage is deferred and is not implemented.

## Testing `/inference/npy`

Open `http://localhost:8000/docs`, select `POST /inference/npy`, and upload a `.npy` sequence containing 339 features per frame. The medical model still receives `96 x 339` after validation/preprocessing.
