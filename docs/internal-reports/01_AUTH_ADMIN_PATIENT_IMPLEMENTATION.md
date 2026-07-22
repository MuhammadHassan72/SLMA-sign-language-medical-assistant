# SLMA Authentication, Administration, and Patient Profile Implementation Report

Generated: 2026-06-22

## Scope And Existing State

The existing frontend, backend, MongoDB document shapes, reports, and `DEVELOPMENT_LOG.md` were inspected before editing. Baseline TypeScript, ESLint, and Python compilation passed after granting the validation tools normal cache access on the D: project.

MongoDB initially contained:

- `users`: 1 passwordless legacy `demo_doctor` record, with no email/status/password hash.
- `patients`: 66 minimal `{name, age, gender, timestamps}` records.
- `sessions`: 66 records linked to the legacy `demo_doctor` and ObjectId-string patient IDs.
- `messages`: 338 records.
- `predictions`: 265 records.
- No `doctor_profiles` or `auth_sessions` collection.
- No duplicate normalized user emails or doctor license numbers.

The legacy records were not migrated, deleted, or rewritten. Legacy sessions remain readable and appear as `Legacy/Unassigned` where a normalized doctor profile cannot be resolved.

## Collections And Fields

### `users`

New staff accounts use:

- `user_id`, `name`, normalized unique `email`
- salted `password_hash`
- `role`: `admin` or `doctor`
- `status`: `active` or `inactive`
- `created_at`, `updated_at`, optional `last_login_at`

APIs never return `password_hash`.

### `doctor_profiles`

- `doctor_id`, unique `user_id`
- `specialization`, `hospital_name`, `phone`
- `license_no`, normalized sparse-unique `license_no_normalized`
- `created_at`, `updated_at`

### `auth_sessions`

- SHA-256 `token_hash` only; the raw cookie token is not stored
- `user_id`, `created_at`, `last_seen_at`, `expires_at`

### `patients`

The existing collection is reused rather than creating a duplicate patient collection. New doctor-managed profiles contain:

- `patient_id`, `profile_type`, `full_name` and compatibility `name`
- optional `date_of_birth`, optional `age`, `gender`, optional `phone`
- optional `emergency_contact`, `blood_group`, `allergies`, `medical_notes`
- `created_by_doctor_id`, `created_at`, `updated_at`
- internal normalized name/phone search fields

Patients do not have passwords or accounts. Photo fields/storage are intentionally absent because patient photo capture is deferred.

### `sessions`

New sessions contain `doctor_id`, `doctor_user_id`, `patient_id`, `started_at`, optional `ended_at`, `status`, and timestamps. Existing prediction and message references remain unchanged.

## Indexes

- `users.email`: sparse unique (safe for the old email-less demo user)
- `users.user_id`: sparse unique
- `auth_sessions.token_hash`: unique
- `auth_sessions.user_id`: standard
- `auth_sessions.expires_at`: TTL (`expireAfterSeconds=0`)
- `doctor_profiles.user_id`: unique
- `doctor_profiles.license_no_normalized`: sparse unique
- `patients.phone_normalized`, `patients.normalized_name`, `patients.created_by_doctor_id`
- `sessions.doctor_id`, `sessions.patient_id`, `sessions.started_at`
- compound `sessions(doctor_id,status)`
- compound `messages(session_id,created_at)`
- compound `predictions(session_id,created_at)`

The unique indexes were added only after inspecting the existing database for conflicts.

## Authentication And Authorization

Authentication uses a random opaque session token in an HTTP-only, SameSite=Lax cookie. Only its SHA-256 hash is stored in MongoDB. Tokens expire according to `AUTH_SESSION_TTL_MINUTES` (default 480 minutes). Passwords use salted standard-library `hashlib.scrypt`; no additional authentication dependency was required.

Endpoints:

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /doctors/me`

Inactive doctors cannot log in, existing sessions are removed when a doctor is deactivated or their password is reset, and login failures return a generic `Invalid email or password` response.

Admin endpoints require the admin role. Doctor-side session detail, camera-frame reads, doctor messages, and end-session actions enforce consultation ownership. Admins can access all sessions. Legacy demo sessions may be read by authenticated doctors but cannot be modified as if they were owned. Patient-side session synchronization, landmark prediction submission, camera-frame posting, and doctor-message polling remain compatible with the no-login patient portal.

CORS keeps credentials enabled for configured origins and the established local-network frontend pattern. The frontend backend helper preserves the current browser hostname (`localhost`, `127.0.0.1`, or LAN IP) so the HTTP-only cookie remains same-host.

## Initial Admin Setup

No permanent admin password is hardcoded. Set `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD` in the terminal environment, then run:

```powershell
.\.venv\Scripts\python.exe -m scripts.seed_admin
```

The command is one-time/idempotent for an existing admin email. Variables are documented in `.env.example`; existing `.env` secrets were not overwritten.

## Admin Portal

New route: `/admin`.

Implemented:

- Real MongoDB summary counts for managed doctors, active/inactive doctors, patient records, total sessions, and sessions today.
- Doctor account/profile creation and editing.
- Search and active/inactive filtering.
- Soft activate/deactivate without deleting consultation history.
- Secure password reset with existing-session revocation.
- Recent consultation monitoring with resolved doctor/patient names, status, timestamps, prediction counts, and message counts.
- Loading, empty, success, and error states.
- Role redirect/denial for non-admin users.

The passwordless legacy `demo_doctor` placeholder is excluded from managed-doctor statistics/listing, while its historical sessions remain visible as legacy data.

## Doctor Portal Patient Workflow

New login route: `/login`. The Doctor Portal now verifies the current doctor account and shows the real account name.

The compact patient workspace provides:

- Search/select existing patients.
- Create and edit doctor-managed textual patient profiles.
- Duplicate warning based on normalized name/phone with explicit authorized override.
- Selected-patient clinical details and consultation history.
- Start consultation for the selected patient.
- Load the authenticated doctor's active consultation.
- End consultation through the backend and preserve it in history.

The existing patient camera feed, prediction/Top-5/CSRE panel, quick avatar responses, manual response, and conversation log remain in the same portal.

## Patient And Session History

`GET /patients/{patient_id}/history` returns each consultation date/status, resolved doctor, predictions/glosses/refined sentences, and doctor responses. `GET /sessions/mine/history` supports doctor-owned session history. Admin monitoring uses `GET /admin/sessions/recent`.

Only one active session is allowed per normalized doctor. Starting another returns HTTP 409 with the active session ID until the doctor ends or loads that session.

## Photo Scope

Patient photo capture, upload, retrieval, GridFS/filesystem storage, and photo fields were not implemented. They remain an optional future enhancement, exactly as required by the scope override.

## Files Changed

Backend:

- `app/auth.py`, `app/admin.py`, `app/doctors.py`, `app/patients.py`
- `app/config.py`, `app/database.py`, `app/main.py`
- `app/sessions.py`, `app/messages.py`, `app/debug.py`
- `scripts/seed_admin.py`, `.env.example`, `README.md`

Frontend:

- `src/lib/backend.ts`
- `src/app/login/page.tsx`
- `src/app/admin/page.tsx`
- `src/components/doctor/DoctorPatientWorkspace.tsx`
- `src/app/doctor/page.tsx`

No ERD/diagram, CE V2 model, label encoder, prediction mapping, patient portal, avatar assets, MediaPipe extraction code, or General Gesture Playground implementation was changed.

## Validation

Static checks:

- TypeScript `npm.cmd exec tsc -- --noEmit`: PASS.
- ESLint `npm.cmd run lint`: PASS, no warnings/errors.
- Python compilation for every modified module and the seed command: PASS.

Runtime API suite: 30/30 passed.

- Secure one-time admin seed and admin login.
- Generic incorrect-login failure.
- Admin doctor creation/listing, deactivate, inactive-login rejection, reactivate, doctor login.
- Second-doctor authorization denial for another doctor's session.
- Patient create/update and duplicate warning.
- Doctor/patient-linked session start and patient latest-session synchronization.
- Anonymous admin 401 and doctor-on-admin 403.
- Camera relay API post/read ownership path.
- Real prepared `SICK` `.npy` inference, saved prediction, and doctor retrieval.
- Manual doctor message and avatar `animation_key` message.
- Patient message retrieval.
- Real end-session action and completed patient/admin history.

Browser checks:

- `/login`, `/admin`, `/doctor`, and `/patient` returned 200.
- Admin login redirected to the real Admin Portal after a same-host cookie fix.
- Admin summary, management table, and legacy session labels rendered.
- Doctor login showed the authenticated doctor name.
- Patient selection enabled consultation start; the patient portal auto-connected to the same new session.
- A manual doctor response became visible in the Patient Portal.
- General Gesture Playground remained local frontend-only; source and prior runtime audit confirm no medical backend/CSRE/MongoDB calls.

All temporary audit users, profiles, sessions, messages, predictions, auth sessions, and upload files were removed. Original collection counts were restored. New empty collections/indexes remain ready for real setup.

## Remaining Manual Tests

- Physical two-laptop LAN/firewall rehearsal.
- Physical patient camera permission/feed and real sign recording accuracy.
- Visual playback confirmation for each GLB avatar animation on the target patient laptop.
- Create the real initial admin using a private strong password before the final demonstration.

## Final Status

Authentication, role authorization, Admin Portal, doctor management, doctor-managed textual patient profiles, session ownership/end/history, and backward-compatible clinical integration are implemented and software-verified. Patient photo capture is intentionally deferred. The only remaining checks require the actual two-laptop/camera demo environment.
