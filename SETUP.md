# SLMA — Setup Guide

Complete instructions to run SLMA locally, plus how to restore the large binary assets that are excluded from this repository.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ (tested on 24) |
| Python | 3.10+ |
| MongoDB | 6+ running locally on `27017` |
| OS | Windows / macOS / Linux (paths below use Windows) |

---

## 1 · Backend (FastAPI)

```bash
cd slma-backend

# create + activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
```

### Configure environment

```bash
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux
```

Open `.env` and fill in:

```ini
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=slma

MODEL_PATH=models/slma_best_model_continued_v2.keras
LABEL_ENCODER_PATH=models/slma_label_encoder.json
CONFIDENCE_THRESHOLD=0.3

# Optional — CSRE falls back to a local rule engine if left blank
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_SECONDS=10

# For the first admin account (used by scripts/seed_admin.py)
INITIAL_ADMIN_NAME=
INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=
```

> **CSRE is optional.** With no `GEMINI_API_KEY`, the system automatically uses its local rule-based refinement engine — the pipeline still works end to end.

### Create the first admin

```bash
python scripts/seed_admin.py
```

### Run

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Verify: <http://localhost:8000/health> → `{"status":"ok", ...}`
API docs: <http://localhost:8000/docs>

---

## 2 · Frontend (Next.js)

```bash
cd slma-fyp
npm install
npm run dev
```

Open <http://localhost:3000>.

---

## 3 · Restoring Excluded Binary Assets

Three asset groups are excluded from Git to keep the repo lean.

### 3.1 · MediaPipe Holistic runtime (~39 MB) — **required for the patient camera**

These are vendored locally so the camera works with slow or no internet.

```bash
cd slma-fyp
npm install @mediapipe/holistic@0.5.1635989137 @mediapipe/camera_utils @mediapipe/drawing_utils
mkdir public\mediapipe\holistic-legacy

# copy the runtime files
copy node_modules\@mediapipe\holistic\holistic.js                              public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\holistic.binarypb                        public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\holistic_solution_packed_assets.data     public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\holistic_solution_packed_assets_loader.js public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\holistic_solution_simd_wasm_bin.*        public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\holistic_solution_wasm_bin.*             public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\pose_landmark_lite.tflite                public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\holistic\pose_landmark_full.tflite                public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\camera_utils\camera_utils.js                      public\mediapipe\holistic-legacy\
copy node_modules\@mediapipe\drawing_utils\drawing_utils.js                    public\mediapipe\holistic-legacy\
```

The app loads these from `/mediapipe/holistic-legacy/` — no CDN required.

### 3.2 · Gesture Playground assets (~19 MB) — *optional feature*

```bash
# WASM runtime
mkdir public\mediapipe\tasks-vision\wasm
copy node_modules\@mediapipe\tasks-vision\wasm\*  public\mediapipe\tasks-vision\wasm\
```

Then download the gesture model into `public/models/gesture_recognizer.task` from the
[MediaPipe Gesture Recognizer model zoo](https://developers.google.com/mediapipe/solutions/vision/gesture_recognizer).

### 3.3 · Trained sign-recognition model (~67 MB) — **required for predictions**

Place these two files in `slma-backend/models/`:

```
slma-backend/models/
├── slma_best_model_continued_v2.keras   (~67 MB — distributed separately)
└── slma_label_encoder.json              (included in this repo)
```

The `.keras` file exceeds comfortable Git limits and is distributed separately
(GitHub Release asset, Git LFS, or a cloud link). Without it the backend starts
fine and the **doctor → patient avatar flow still works**, but sign prediction
endpoints will return a model-not-found error.

---

## 4 · Running on Two Machines (LAN Demo)

The host machine runs **everything** (backend, frontend, MongoDB). The second
machine only needs a browser.

1. Find the host's LAN IP:
   ```bash
   ipconfig        # Windows — look at the Wi-Fi adapter's IPv4 Address
   ifconfig        # macOS / Linux
   ```
2. Start both servers bound to all interfaces:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   npm run dev -- -H 0.0.0.0 -p 3000
   ```
3. Open the portals:
   - **Patient** (host machine): `http://localhost:3000/patient`
   - **Doctor** (second machine): `http://<HOST_IP>:3000/doctor`

> **Important:** the patient portal must be opened via `localhost`. Browsers only
> grant camera access on `localhost` or HTTPS — an `http://<IP>` origin will be
> blocked. The doctor portal needs no camera, so the IP origin is fine there.

**CORS needs no configuration** — the backend already allows any private LAN
range (`10.x`, `192.168.x`, `172.16–31.x`) on port 3000, so a changing DHCP
address never breaks the setup.

**Firewall:** allow inbound TCP 3000 and 8000 on the host:
```powershell
New-NetFirewallRule -DisplayName "SLMA 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
New-NetFirewallRule -DisplayName "SLMA 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Any
```

---

## 5 · Demo Flow

1. **Doctor** logs in → selects/creates a patient → **Start Consultation**.
2. **Patient** opens `/patient` and allows the camera → auto-connects within ~3 s.
3. **Patient** either records a live sign, or picks a validated `.npy` landmark
   file from the dropdown and sends it.
4. **Doctor** sees the top-1 gloss, confidence, top-5 breakdown and the refined
   CSRE sentence in the translation log.
5. **Doctor** clicks a Quick Response → the **3D avatar performs it** on the
   patient's screen.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Camera never starts | Patient page must be on `localhost`, not an IP. Check that `public/mediapipe/holistic-legacy/` exists (§3.1). |
| Doctor page blank / stuck | Backend unreachable — verify `http://<HOST_IP>:8000/health` and the firewall rules. |
| "End the current consultation first" | That doctor already has an active session — click **Load My Active**, or end it. |
| Predictions return a model error | The `.keras` model is missing from `slma-backend/models/` (§3.3). |
| CSRE always says "Safe CSRE" | No/invalid `GEMINI_API_KEY`, or the model is rate-limited. This is a safe, expected fallback. |
| Low FPS while recording | Lower `PROCESSING_WIDTH/HEIGHT` in `src/components/mediapipe/MediaPipeCamera.tsx` (e.g. 424×240). |
