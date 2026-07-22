# SLMA — Sign Language Medical Assistant

> **Final Year Project** · University of Management and Technology (UMT) Sialkot  
> **Phase 1 Demo** · Real-time sign-language detection via MediaPipe Holistic

---

## Overview

SLMA is a web-based consultation platform that enables deaf/mute patients to communicate with doctors using sign language. The system captures live hand, pose and face landmarks via webcam, converts them into the trained 113 selected landmark / 339-feature layout, and presents a clean split-screen consultation UI for both sides.

---

## Features

| Feature | Details |
|---|---|
| 🎥 Real-time landmark detection | MediaPipe Holistic with 113 selected landmarks converted into 339 model features |
| 📊 Live HUD | FPS counter, detection status, selected model feature layout, live frame buffer |
| 🔴 Landmark recording | Start/stop recording; frame count displayed in real time |
| 👨‍⚕️ Doctor Portal | 3-column layout: patient camera, translation chat, doctor controls + emergency alert |
| 🤟 Patient Portal | Full-screen split: live camera (mirrored) + doctor messages + avatar chat |
| 🚨 Emergency overlay | Animated full-screen alert with dismiss |
| 🌙 Dark UI | Tailwind CSS, custom `background #0F172A` palette, glass-morphism cards |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS 3, Framer Motion |
| CV Engine | MediaPipe Holistic 0.5 (CDN — no npm install required) |
| Icons | lucide-react |
| Toasts | react-hot-toast |

---

## Project Structure

```
slma-fyp/
├── public/
│   └── logo-nobg.png            # SLMA logo
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout, metadata, ToastProvider
│   │   ├── page.tsx              # Landing page
│   │   ├── doctor/page.tsx       # Doctor consultation portal
│   │   ├── patient/page.tsx      # Patient consultation portal
│   │   ├── not-found.tsx         # Custom 404
│   │   └── globals.css           # Global styles, keyframes, utilities
│   ├── components/
│   │   ├── mediapipe/
│   │   │   ├── MediaPipeCamera.tsx   # Core camera + holistic component
│   │   │   ├── FPSCounter.tsx
│   │   │   ├── DetectionStatus.tsx
│   │   │   ├── LandmarkCounter.tsx
│   │   │   └── RecordingIndicator.tsx
│   │   └── ToastProvider.tsx
│   └── types/
│       └── mediapipe.d.ts        # Window.Holistic / Camera type declarations
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A browser with webcam access (Chrome / Edge recommended for MediaPipe)

### Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

---

## Demo Console Logs

Open DevTools → Console to see live landmark data while the camera runs:

```
🏥 SLMA v1.0 — Sign Language Medical Advisor initialized
🤟 Patient Portal loaded — Camera feed active
📊 SLMA Landmark Data — Hands: 42/42, Pose: 33/33, Face: 468/468, Buffer: 45/90 frames
🔴 SLMA Recording Started — Buffering raw landmarks for 339-feature conversion
⏹️ SLMA Recording Stopped — 87 frames captured for 339-feature conversion
```

---

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/patient` | Patient portal (camera + doctor messages) |
| `/doctor` | Doctor portal (patient feed + chat + controls) |
| `/*` | Custom 404 page |

---

## Phase Roadmap

- **Phase 1 (current)** — Real-time landmark capture, buffering, consultation UI
- **Phase 2** — LSTM / Transformer model for sign-to-text translation
- **Phase 3** — Doctor-to-patient text-to-avatar sign replay

---

## Authors

Developed as part of the Final Year Project programme at  
**University of Management and Technology (UMT), Sialkot Campus**
