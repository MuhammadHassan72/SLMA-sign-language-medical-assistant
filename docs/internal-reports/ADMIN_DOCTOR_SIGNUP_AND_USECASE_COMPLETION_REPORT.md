# Admin, Doctor Signup, and Patient Profile Scope Completion Report

Date: 2026-06-29

## Summary
This update keeps patient signup out of scope and makes the intended consultation flow explicit:

- Admin and doctors are the only authenticated staff roles.
- Doctors can request an account through `/signup`.
- New doctor signup accounts are saved as `pending`.
- Admin can approve pending doctors from `/admin`.
- Patient details are created and edited by the doctor inside the doctor portal.
- The patient portal remains a consultation interface only; patients do not create accounts or fill profile forms.

## Root Cause / Scope Correction
The existing backend already restricted auth roles to `admin` and `doctor`, and patient profiles were already protected through doctor/admin APIs. The missing piece was a visible doctor self-signup flow and admin approval handling for pending doctor accounts. The UI also needed clearer wording so evaluators do not assume patients must sign up.

## Files Changed
- `D:\FYP\Internal frontend\slma-backend\app\auth.py`
- `D:\FYP\Internal frontend\slma-backend\app\admin.py`
- `D:\FYP\Internal frontend\slma-fyp\src\lib\backend.ts`
- `D:\FYP\Internal frontend\slma-fyp\src\app\login\page.tsx`
- `D:\FYP\Internal frontend\slma-fyp\src\app\signup\page.tsx`
- `D:\FYP\Internal frontend\slma-fyp\src\app\admin\page.tsx`
- `D:\FYP\Internal frontend\slma-fyp\src\components\doctor\DoctorPatientWorkspace.tsx`

## Backend Changes
- Added `POST /auth/doctor-signup`.
- Doctor signup creates:
  - `users` document with `role = doctor`
  - `status = pending`
  - hashed password using the existing scrypt utility
  - matching `doctor_profiles` document
- Duplicate email returns `409`.
- Duplicate license number returns `409` when provided.
- Pending doctor login returns a clear `403` message:
  - `Your doctor account is pending admin approval.`
- Admin doctor status handling now supports:
  - `pending`
  - `active`
  - `inactive`
- Admin summary now includes `pending_doctors`.

## Frontend Changes
- Added `/signup` doctor signup page.
- Login page now includes a `Doctor Sign Up` link.
- Login page clearly states patient access does not require an account.
- Admin portal now shows:
  - pending doctor count
  - pending status filter
  - pending approvals panel
  - `Approve` button for pending doctors
- Doctor patient workspace now explicitly says:
  - no patient signup is required
  - patient details are entered or updated by the doctor before consultation

## Completed Current-Scope Use Cases
- Doctor self-signup request.
- Admin approval of pending doctors.
- Active doctor login after approval.
- Doctor-created patient profile.
- Doctor-edited patient profile.
- Patient portal remains accountless and consultation-only.

## Auth / Role Behavior
- `admin` and `doctor` remain the only authenticated user roles.
- `pending` doctor accounts cannot access the doctor portal because login is rejected.
- `active` doctors can log in normally.
- Patient profiles remain under `/patients` and require doctor/admin auth.
- No patient signup endpoint was added.

## Validation Commands / Results
Backend:

```powershell
cd "D:\FYP\Internal frontend\slma-backend"
.\.venv\Scripts\python.exe -m py_compile app\main.py app\auth.py app\admin.py app\patients.py app\sessions.py app\messages.py app\inference.py app\csre.py app\debug.py app\doctors.py
```

Result: Passed.

Frontend TypeScript:

```powershell
cd "D:\FYP\Internal frontend\slma-fyp"
npm.cmd exec tsc -- --noEmit
```

Result: Passed.

Frontend lint:

```powershell
cd "D:\FYP\Internal frontend\slma-fyp"
npm.cmd run lint
```

Result: Passed with no ESLint warnings or errors.

## Runtime Test Results
Not started in this turn. Manual runtime checks still recommended:

1. Start backend on port 8000.
2. Start frontend on port 3000.
3. Open `/login`.
4. Open `/signup`.
5. Submit a doctor signup.
6. Confirm pending doctor cannot log in.
7. Login as admin.
8. Open `/admin`.
9. Approve the pending doctor.
10. Login as that doctor.
11. Create/select a patient profile in `/doctor`.
12. Start consultation and verify patient portal session sync.

## Features Intentionally Deferred
- Patient signup/login.
- Patient self profile creation.
- Patient photo capture/storage.
- Full doctor text-to-sign generation.
- Model retraining or trained-model changes.

## Current Status
The codebase now matches the requested scope: no patient signup is required, and patient details are entered by the doctor from the doctor portal.
