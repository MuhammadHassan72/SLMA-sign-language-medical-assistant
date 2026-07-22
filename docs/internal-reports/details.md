# SLMA — Sign Language Medical Assistant
## Comprehensive Technical Documentation

> **Project:** Final Year Project (FYP) — University of Management & Technology (UMT), Sialkot  
> **Version:** v1.0.0-ALPHA  
> **Stack:** Next.js 14 · TypeScript · Tailwind CSS · MediaPipe Holistic (CDN) · Framer Motion  
> **Purpose:** Real-time bidirectional sign language ↔ speech translation system for deaf patients in clinical environments.

---

## Table of Contents

1. [Project Architecture Overview](#1-project-architecture-overview)
2. [Configuration Files](#2-configuration-files)
   - [package.json](#21-packagejson)
   - [next.config.mjs](#22-nextconfigmjs)
   - [tailwind.config.ts](#23-tailwindconfigts)
   - [tsconfig.json](#24-tsconfigjson)
   - [.eslintrc.json](#25-eslintrcjson)
3. [Type Declarations](#3-type-declarations)
   - [src/types/mediapipe.d.ts](#31-srctypesmediapipedts)
4. [Core App Files](#4-core-app-files)
   - [src/app/layout.tsx](#41-srapplayouttsx)
   - [src/app/globals.css](#42-srappglobalscss)
   - [src/app/page.tsx](#43-srappagetsx)
   - [src/app/not-found.tsx](#44-srappnot-foundtsx)
5. [Portal Pages](#5-portal-pages)
   - [src/app/doctor/page.tsx](#51-srappdoctorpagetsx)
   - [src/app/patient/page.tsx](#52-srapppatientpagetsx)
   - [src/app/mediapipe/page.tsx](#53-srappmediapipepagetsx)
6. [Components](#6-components)
   - [src/components/ToastProvider.tsx](#61-srccomponentstoastprovidertsx)
   - [src/components/mediapipe/MediaPipeCamera.tsx](#62-srccomponentsmediapipemediapipecameratsx)
   - [src/components/mediapipe/FPSCounter.tsx](#63-srccomponentsmediapipefpscountertsx)
   - [src/components/mediapipe/DetectionStatus.tsx](#64-srccomponentsmediapipedetectionstatustsx)
   - [src/components/mediapipe/LandmarkCounter.tsx](#65-srccomponentsmediapipelandmarkcountertsx)
   - [src/components/mediapipe/RecordingIndicator.tsx](#66-srccomponentsmediapiperecordingindicatortsx)
7. [Data & Asset Files](#7-data--asset-files)
8. [System Interaction Diagram](#8-system-interaction-diagram)

---

## 1. Project Architecture Overview

```
slma-fyp/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout — metadata, fonts, ToastProvider
│   │   ├── globals.css             # Global styles, CSS variables, keyframes, utilities
│   │   ├── page.tsx                # Landing page — hero, features, tech stack, footer
│   │   ├── not-found.tsx           # 404 error page
│   │   ├── doctor/
│   │   │   └── page.tsx            # Doctor Portal — 3-column consultation room UI
│   │   ├── patient/
│   │   │   └── page.tsx            # Patient Portal — camera + messaging + avatar zone
│   │   └── mediapipe/
│   │       └── page.tsx            # Standalone MediaPipe landmark debugger / test page
│   ├── components/
│   │   ├── ToastProvider.tsx       # Global toast notification provider
│   │   └── mediapipe/
│   │       ├── MediaPipeCamera.tsx # Core camera + MediaPipe Holistic engine
│   │       ├── FPSCounter.tsx      # Real-time FPS badge (green/yellow/red)
│   │       ├── DetectionStatus.tsx # Hand detection status indicator
│   │       ├── LandmarkCounter.tsx # 113-selected-landmark model layout badge
│   │       └── RecordingIndicator.tsx # REC badge with frame counter
│   └── types/
│       └── mediapipe.d.ts          # TypeScript ambient declarations for MediaPipe CDN globals
├── public/
│   └── logo-nobg.png               # SLMA logo (used in navbars and 404 page)
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── .eslintrc.json
```

### Routing Structure (Next.js App Router)

| URL | File | Description |
|-----|------|-------------|
| `/` | `src/app/page.tsx` | Public landing page |
| `/doctor` | `src/app/doctor/page.tsx` | Doctor consultation dashboard |
| `/patient` | `src/app/patient/page.tsx` | Patient camera + messaging interface |
| `/mediapipe` | `src/app/mediapipe/page.tsx` | Development/test: raw landmark debugger |
| `*` (any unknown) | `src/app/not-found.tsx` | Custom 404 page |

---

## 2. Configuration Files

### 2.1 `package.json`

**Path:** `slma-fyp/package.json`

**Purpose:** Defines the project identity, NPM scripts, and all runtime and development dependencies.

**Key Sections:**

| Section | Detail |
|---------|--------|
| `name` | `slma-fyp` |
| `scripts.dev` | `next dev` — starts the local development server |
| `scripts.build` | `next build` — compiles the production bundle |
| `scripts.lint` | `next lint` — runs ESLint with Next.js rules |

**Runtime Dependencies:**

| Package | Version | Role |
|---------|---------|------|
| `next` | `14.2.35` | Core framework — App Router, SSR, file-based routing |
| `react` / `react-dom` | `^18` | UI rendering engine |
| `framer-motion` | `^12.34.3` | Declarative animation library (hero fade-ups, page transitions) |
| `lucide-react` | `^0.575.0` | SVG icon library used across all pages |
| `react-hot-toast` | `^2.6.0` | Toast notifications (hand detection alerts, quick actions) |

**Dev Dependencies:**

| Package | Role |
|---------|------|
| `typescript` | Static type checking |
| `tailwindcss` | Utility-first CSS framework |
| `eslint` + `eslint-config-next` | Code linting with Next.js specific rules |
| `@types/react`, `@types/node` | TypeScript type definitions |

**Logic Flow:** This file is the entry point for `npm install`, `npm run dev`, and `npm run build`. All other tooling (Tailwind, ESLint, TypeScript) feeds off the versions declared here.

---

### 2.2 `next.config.mjs`

**Path:** `slma-fyp/next.config.mjs`

**Purpose:** Next.js build and runtime configuration.

**Current State:** Empty configuration object — all Next.js defaults are used. No custom rewrites, redirects, image domains, or experimental flags are needed because MediaPipe is loaded via CDN (not npm), eliminating the need for custom webpack rules.

```js
const nextConfig = {};
export default nextConfig;
```

**Logic Flow:** Read by Next.js at build and dev startup. Extending this file would be required when adding a backend API proxy, custom image domains (for `next/image`), or enabling React Server Components new features.

---

### 2.3 `tailwind.config.ts`

**Path:** `slma-fyp/tailwind.config.ts`

**Purpose:** Extends Tailwind CSS defaults with the SLMA design system — custom colours, fonts, and animation utilities.

**Key Components:**

**Custom Colour Palette:**

| Token | Hex | Used For |
|-------|-----|----------|
| `primary` | `#1E40AF` | Doctor Portal CTA buttons, primary actions |
| `secondary` | `#0D9488` | Patient Portal, teal accents, online indicators |
| `accent` | `#F59E0B` | Warning states, amber highlights, Phase badges |
| `emergency` | `#DC2626` | Emergency alert button, error states |
| `background` | `#0F172A` | Base page background (deep dark navy) |
| `surface` | `#1E293B` | Card and panel backgrounds |
| `card` | `#334155` | Elevated card surfaces |

**Custom Font:** `Inter` (Google Fonts, all weights 300–900) mapped to `--font-inter` CSS variable, applied via `font-sans`.

**Custom Animations:**
- `fade-in` — opacity `0 → 1` over 0.6s (used for status indicators)
- `fade-up` — opacity + `translateY(24px → 0)` over 0.7s (used for hero entry)

**Content Paths:** Scans all `.tsx/.ts/.jsx/.js/.mdx` files under `src/pages/`, `src/components/`, and `src/app/` to generate the minimal CSS bundle.

**Logic Flow:** Consumed at build time by PostCSS (configured in `postcss.config.mjs`). All `className` strings like `bg-primary`, `text-secondary`, or `bg-background` in `.tsx` files resolve to these extended tokens.

---

### 2.4 `tsconfig.json`

**Path:** `slma-fyp/tsconfig.json`

**Purpose:** TypeScript compiler configuration — enables strict type checking, path aliases, and JSX handling.

**Critical Settings:**

| Option | Value | Impact |
|--------|-------|--------|
| `strict` | `true` | All strict checks enabled — prevents runtime bugs |
| `paths` | `"@/*": ["./src/*"]` | Enables `@/components/...` imports without relative paths |
| `jsx` | `preserve` | Next.js handles JSX transformation |
| `moduleResolution` | `bundler` | Matches Next.js/Webpack module resolution behaviour |
| `lib` | `["dom", "dom.iterable", "esnext"]` | Gives access to Browser APIs (`window`, `document`, `HTMLVideoElement`) |

**Logic Flow:** The `@/` path alias is essential throughout the project. It is used in every `import` statement that references shared components or types, e.g., `import MediaPipeCamera from "@/components/mediapipe/MediaPipeCamera"`.

---

### 2.5 `.eslintrc.json`

**Path:** `slma-fyp/.eslintrc.json`

**Purpose:** Enforces code quality rules using `eslint-config-next` which includes React Hooks rules, Next.js best practices, and accessibility checks.

```json
{ "extends": "next/core-web-vitals" }
```

**Logic Flow:** Runs via `npm run lint`. Integrated into the Next.js build pipeline — a lint error will block production builds.

---

## 3. Type Declarations

### 3.1 `src/types/mediapipe.d.ts`

**Path:** `src/types/mediapipe.d.ts`

**Purpose:** This is the most architecturally critical configuration file in the project. MediaPipe Holistic is loaded via `<script>` CDN tags (not as an npm package), meaning it injects objects directly onto `window` at runtime. Without this file, TypeScript would throw `Property 'Holistic' does not exist on type 'Window'` errors for every MediaPipe call.

**Key Components:**

**Core Interfaces:**

| Interface | Description |
|-----------|-------------|
| `NormalizedLandmark` | `{ x, y, z, visibility? }` — a single 3D landmark point, coordinates normalized to `[0, 1]` |
| `HolisticConfig` | Constructor config — `locateFile()` callback that points to the CDN WASM files |
| `HolisticOptions` | Runtime options: `modelComplexity`, `smoothLandmarks`, `minDetectionConfidence`, `minTrackingConfidence` |
| `HolisticResults` | The result object passed to `onResults()` — contains `leftHandLandmarks`, `rightHandLandmarks`, `poseLandmarks`, `faceLandmarks` |
| `HolisticInstance` | The live Holistic object: `.setOptions()`, `.onResults()`, `.send()`, `.close()` |
| `CameraOptions` | `{ onFrame, width, height }` — the tick loop configuration for `window.Camera` |
| `CameraInstance` | The live Camera object: `.start()`, `.stop()` |
| `DrawingStyle` | Visual style config for `drawConnectors` and `drawLandmarks` |
| `Connection` | `{ start: number, end: number }` — defines a connection between two landmark indices |

**Global Window Augmentation:**

```typescript
declare global {
  interface Window {
    Holistic: new (config?) => HolisticInstance;
    Camera: new (video, options) => CameraInstance;
    drawConnectors: (ctx, landmarks, connections, style?) => void;
    drawLandmarks: (ctx, landmarks, style?) => void;
    HAND_CONNECTIONS: Connection[];
    POSE_CONNECTIONS: Connection[];
    FACEMESH_TESSELATION: Connection[];
    // ... all other connection constants
  }
}
```

**Logic Flow:** Imported as `import type { NormalizedLandmark, HolisticInstance, CameraInstance } from "@/types/mediapipe"` in `MediaPipeCamera.tsx`. The `declare global` block makes `window.Holistic`, `window.Camera`, `window.drawConnectors`, and all connection constants type-safe without any import required at the call site.

---

## 4. Core App Files

### 4.1 `src/app/layout.tsx`

**Path:** `src/app/layout.tsx`

**Purpose:** The root layout — the outermost HTML shell that wraps every page in the application. In Next.js App Router, this file renders once and persists across navigation.

**Key Components:**

**`metadata` export:**
```ts
export const metadata: Metadata = {
  title: "SLMA — Sign Language Medical Assistant",
  description: "Real-time bidirectional sign language translation...",
  keywords: ["sign language", "medical assistant", "deaf", "Pakistan", "UMT Sialkot", ...],
  authors: [{ name: "SLMA FYP Team — UMT Sialkot" }],
  metadataBase: new URL("https://slma.vercel.app"),
};
```
Automatically injected into `<head>` by Next.js — controls the browser tab title and search engine metadata.

**`viewport` export:**
Controls `<meta name="viewport">` — ensures the app renders correctly on mobile devices.

**`Inter` font:**
Loaded via `next/font/google` (zero layout shift, self-optimised). All weights from 300 to 900 are included to support the full range of typography across the UI (thin captions to black headings).

**`RootLayout` function:**
```tsx
<html lang="en" className={inter.variable}>
  <body className="bg-background text-slate-100 antialiased font-sans">
    {children}
    <ToastProvider />
  </body>
</html>
```

Applies the dark background globally, mounts `ToastProvider` once at the root so toast notifications work on every page without re-mounting.

**Logic Flow:** Every page component (`page.tsx`) is rendered as `{children}` inside this layout. `ToastProvider` is mounted here so `toast.success()` and `toast.error()` calls from Doctor Portal and Patient Portal work without any additional setup.

---

### 4.2 `src/app/globals.css`

**Path:** `src/app/globals.css`

**Purpose:** The global stylesheet — defines CSS custom properties (design tokens), global resets, custom scrollbar styles, reusable utility classes, and all keyframe animations used throughout the project.

**Key Components:**

**CSS Design Tokens (`:root`):**
```css
:root {
  --background: #0F172A;   /* deep dark navy */
  --foreground: #F1F5F9;
  --surface:    #1E293B;
  --card:       #334155;
  --primary:    #1E40AF;   /* blue */
  --secondary:  #0D9488;   /* teal */
  --accent:     #F59E0B;   /* amber */
}
```
These mirror the Tailwind token names — the CSS variables are used in inline `style={}` props while Tailwind class names are used in `className={}`.

**Utility Classes (`@layer utilities`):**

| Class | Description |
|-------|-------------|
| `.gradient-text` | Blue-to-teal gradient applied as text fill — used on the "SLMA" title |
| `.glass-card` | Frosted glass effect: `rgba(30,41,59,0.7)` + `backdrop-filter: blur(12px)` |
| `.tech-grid` | Subtle dot/grid background — `4% opacity` sky-blue lines on 48px grid |
| `.glow-teal/blue/red/green` | Neon box-shadow presets for glowing borders |
| `.bracket-corner` | CSS `::before`/`::after` pseudo-elements that draw tech-style corner brackets |
| `.scan-line` | Adds a continuous top-to-bottom animated scan line via `::after` pseudo-element |
| `.cam-fill` | Forces `canvas` and `video` inside to be `100% width/height, object-fit: cover` — critical for the MediaPipe camera display |
| `.float-logo` | Applies `floatY` animation to elements |
| `.cursor-blink` | Blinking cursor effect on the SLMA title (step-end timing for hard blink) |
| `.dot-1/2/3` | Staggered `dotPulse` animation for the "●●●" typing indicator |

**Keyframes:**

| Animation | Behaviour | Used In |
|-----------|-----------|---------|
| `scanDown` | Moves a 2px line from top to bottom | Feature cards, camera overlays |
| `floatY` | Gentle `translateY(0 → -10px → 0)` loop | Logo float effect |
| `pulseGlow` | Opacity `0.5 → 1 → 0.5` | Status dots, phase badges, camera borders |
| `blink` | `1 → 0 → 1` (step-end) | Cursor `_` on hero title |
| `dotPulse` | `0.2 → 1 → 0.2` | Typing dots in patient portal |
| `borderSpin` | `rotate(0 → 360)` | Border spin for decorative rings |

**Logic Flow:** Imported once in `layout.tsx` via `import "./globals.css"`. All pages and components inherit these styles automatically. The `.cam-fill` class is the key bridge between CSS and the MediaPipe canvas — without it, the camera would render at a fixed pixel size and not stretch to fill its container.

---

### 4.3 `src/app/page.tsx`

**Path:** `src/app/page.tsx`

**Purpose:** The public-facing landing page of SLMA. It introduces the system, displays the brand logo, provides navigation to both portals, and showcases the feature set and technology stack.

**Key Components:**

**`SLMALogo({ size })` — Inline SVG Brand Logo:**
A fully custom SVG component (no external file or library) that renders the SLMA brand mark at any size. Composed of layered elements:
- **Background radial orb** — soft sky-blue glow (`slma-bg` gradient)
- **Orbit rings** — dashed + solid concentric circles with subtle opacity
- **Cardinal ticks** — N/E/S/W tick marks with glow dots (compass aesthetic)
- **Hand silhouette** — 5 finger `<rect>` elements + palm + knuckle line using the `slma-hand` gradient (sky → indigo)
- **Fingertip nodes** — glowing circles at each fingertip with white inner cores
- **Circuit traces** — branching lines from thumb and pinky, terminating in small node dots (AI/circuit aesthetic)
- **Medical cross** — top-right quadrant white-to-cyan cross using `slma-cross` gradient
- **ECG waveform** — SVG `<path>` simulating a heartbeat trace across the bottom half, using `slma-ecg` gradient (teal → sky → indigo fade)
- **AI nodes** — bottom-left cyan circles with connecting lines (neural network aesthetic)
- **Neural nodes** — bottom-right indigo circles

**Animation Variants:**
```ts
const fadeUp = (delay = 0) => ({
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22,1,0.36,1], delay } }
});
const fadeIn = (delay = 0) => ({ ... });
```
Used with Framer Motion's `variants` system for staggered hero entrance animations.

**Static Data Arrays:**
- `techStack[]` — 6 items (Next.js, MediaPipe, TensorFlow, FastAPI, Socket.io, TCN+LSTM) with Lucide icons and colour tokens
- `features[]` — 4 feature cards (Real-Time Translation, Medical Context-Aware, Dual Portals, 70M Users) with icons, glow colours, and `// COMMENT` tags
- `sysStatus[]` — 4 system status items (MediaPipe Engine, WebSocket Server, CTC Decoder, Paraphraser NLP)

**`HomePage` Component Layout (inside `<main>`):**
1. **Tech grid + ambient blobs** — fixed background layers (z-0), non-interactive
2. **Floating particles** — 5 animated dots at hardcoded `top`/`left` positions
3. **HERO Section** — fully centred (`items-center text-center`):
   - HUD status bar (project tag + system status pills)
   - `<SLMALogo size={210} />` with triple-layer glow backdrop
   - Giant `SLMA` title (up to 168px on xl screens) with blinking cursor
   - Version tag (Shield icon + `v1.0.0-ALPHA · FYP · UMT Sialkot`)
   - Subtitle: "Sign Language Medical Assistant"
   - Amber tagline: "Breaking Healthcare Communication Barriers..."
   - Description paragraph with highlighted tech terms
   - Two CTA buttons: **Doctor Portal** (blue) and **Patient Portal** (teal)
4. **Features Section** — 4-column grid of `scan-line` animation cards
5. **Tech Stack Section** — horizontal flex wrap of tech badge pills
6. **Footer** — SLMA brand + university info + pulsing green dot

**Logic Flow:**
- Imports `Link` from `next/link` for SPA navigation to `/doctor` and `/patient`
- Uses `useEffect` only for a console initialization log (no side effects)
- `SLMALogo` is a pure function — no state, no hooks — renders the same SVG at any given `size`
- Framer Motion `initial="hidden" animate="visible"` triggers on mount; `whileInView="visible"` triggers for features/tech sections when scrolled into view

---

### 4.4 `src/app/not-found.tsx`

**Path:** `src/app/not-found.tsx`

**Purpose:** Custom 404 page rendered by Next.js App Router when a route cannot be matched. Maintains visual consistency with the rest of the application.

**Key Components:**
- Tech grid background (same teal-on-dark pattern as patient portal)
- SLMA logo (`/logo-nobg.png`) at 64px
- Large gradient `404` number (teal → blue gradient text)
- Error badge styled like the rest of the system: dark background, red border, monospace font
- "Go Home" button linking back to `/`
- "Patient Portal" and "Doctor Portal" shortcut links

**Logic Flow:** Automatically rendered by Next.js when no `page.tsx` file matches the current URL. No special configuration needed — placing this file in `src/app/` is sufficient for the App Router to pick it up.

---

## 5. Portal Pages

### 5.1 `src/app/doctor/page.tsx`

**Path:** `src/app/doctor/page.tsx`

**Purpose:** The Doctor Consultation Dashboard — a full-screen, three-column clinical UI where a doctor monitors a patient's camera feed, reads AI-translated sign language, and responds via text or quick-response buttons.

**Key Components:**

**Type: `ChatMessage`:**
```ts
interface ChatMessage {
  id: number;
  sender: "patient" | "doctor";
  text: string;
  time: string;
  isSign?: boolean;      // true = came from sign language detection
  confidence?: number;  // AI confidence score (0–100)
}
```

**Static Data:**
- `INITIAL_MESSAGES[]` — 4 pre-loaded chat messages simulating a consultation already in progress (mix of patient signs and doctor responses)
- `QUICK_RESPONSES[]` — 8 one-click doctor response strings: "Where does it hurt?", "Rate your pain 1-10", etc.
- `DUMMY_GLOSSES[]` — 6 simulated patient sign glosses used by `simulateTranslation()`: "MEDICINE NEED I", "FEVER HIGH TODAY", etc.

**Helper Functions:**
- `formatTime(secs)` — converts elapsed seconds to `MM:SS` display for the session timer
- `nowTime()` — returns current time as `HH:MM AM/PM` for chat message timestamps

**State Management:**

| State | Type | Purpose |
|-------|------|---------|
| `showFace` | `boolean` | Toggle face mesh overlay on camera |
| `fps` | `number` | Displayed FPS from MediaPipe tick |
| `isDetecting` | `boolean` | Whether hands are currently in frame |
| `landmarkCount` | `number` | Raw detection total used internally for selected model feature status |
| `messages` | `ChatMessage[]` | Full chat history |
| `input` | `string` | Doctor's text input field value |
| `elapsed` | `number` | Session timer in seconds |
| `emergency` | `boolean` | Emergency alert state (resets after 2.5s) |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `handleLandmarks(data)` | MediaPipe callback — updates `isDetecting`, raw detection totals, and the hand detection toast |
| `addDoctorMessage(text)` | Appends a new `sender: "doctor"` message to the chat history |
| `simulateTranslation()` | Picks a random entry from `DUMMY_GLOSSES`, adds it as a signed patient message with a random 85–96% confidence score |
| `handleSend()` | Sends the doctor's typed input as a chat message, clears the input field |
| `triggerEmergency()` | Sets `emergency = true` for 2.5s — triggers a red alert overlay and `toast.error()` |

**Layout Structure (3-Column, `100vh`):**

```
┌─────────────────────────────────────────────────────────────┐
│                    HEADER (64px)                            │
│   ← Home | SLMA | Doctor Portal | Dr. Hassan | Timer | End │
├──────────────────┬──────────────────────┬───────────────────┤
│  LEFT (40%)      │  CENTER (35%)        │  RIGHT (25%)      │
│  Patient Camera  │  Sign Translation    │  Doctor Controls  │
│  MediaPipe Feed  │  Chat History        │  Quick Responses  │
│  Landmark Bars   │  AI Confidence Badge │  Input Field      │
│  FPS Counter     │  Scroll-to-bottom    │  Simulate Button  │
│  Face Toggle     │                      │  Emergency Btn    │
└──────────────────┴──────────────────────┴───────────────────┘
```

**AI Confidence Badge Logic:**
Each patient sign message in the chat displays a colour-coded confidence badge:
- `>= 90%` → green (`#22C55E`)
- `>= 75%` → amber (`#F59E0B`)
- `< 75%` → red (`#EF4444`)

**Quick Response Protocol Buttons:**
8 labelled `[P01]` through `[P08]` — clicking any sends that text as a doctor message via `addDoctorMessage()`.

**Logic Flow:**
1. On mount, `useEffect` sets up a 1-second interval for the session timer
2. `MediaPipeCamera` runs continuously in the left column, calling `handleLandmarks` on every frame
3. Doctor reads translated signs in the center chat column
4. Doctor responds via Quick Response buttons `[P01–P08]` or the text input field
5. `simulateTranslation()` (demo only) mimics what the real ML model will inject in production
6. Emergency alert visually flashes the UI and triggers a toast notification

---

### 5.2 `src/app/patient/page.tsx`

**Path:** `src/app/patient/page.tsx`

**Purpose:** The Patient Interface — a full-screen split-layout page where the deaf patient sees their live camera feed (left half) and receives messages from the doctor (right half), along with a future 3D sign language avatar zone.

**Key Components:**

**Static Data:**
- `DEMO_MESSAGES[]` — 4 pre-loaded doctor messages from "Dr. Hassan" guiding the patient through using the system

**State Management:**

| State | Type | Purpose |
|-------|------|---------|
| `isDetecting` | `boolean` | Whether hand landmarks are currently active |
| `showFace` | `boolean` | Toggle face mesh overlay |
| `landmarkCounts` | `{ left, right, pose, face }` | Per-modality raw detection totals used to display selected model feature availability |
| `dotStep` | `0 \| 1 \| 2` | Drives the cycling `●○○ → ●●○ → ●●●` animation |

**Key Logic:**

- **`dotStep` cycle:** A `setInterval` running every 500ms increments `dotStep` through `0 → 1 → 2 → 0`, creating the animated three-dot indicator at the bottom of the camera feed.

- **`handleLandmarks(data)`:** Reads raw MediaPipe detection totals, updates `isDetecting` and all four `landmarkCounts`, then displays the selected 113-landmark model layout. Fires a one-time `toast.success("✋ Hand landmarks detected!")` using a `useRef` guard (`handToastShownRef`) so the toast only appears once per session, not on every frame.

**Layout Structure (2-Column, `100vh`):**

```
┌────────────────────────────┬────────────────────────────┐
│  LEFT (50%)                │  RIGHT (50%)               │
│  ┌─────────────────────┐   │  ┌──────────────────────┐  │
│  │  Top Nav Bar         │   │  │  Doctor Messages     │  │
│  │  ← Home | SLMA |    │   │  │  (54% height)        │  │
│  │  Phase 1 | Live     │   │  │  Dr. Hassan header   │  │
│  └─────────────────────┘   │  │  4 demo messages     │  │
│  ┌─────────────────────┐   │  │  Read-only hint bar  │  │
│  │  Camera Feed        │   │  └──────────────────────┘  │
│  │  (green/red border  │   │  ┌──────────────────────┐  │
│  │   based on detect)  │   │  │  Sign Language Avatar │  │
│  │                     │   │  │  (46% height)        │  │
│  │  Face toggle btn    │   │  │  Holographic zone    │  │
│  │  339-feature model  │   │  │  Phase 2 badge       │  │
│  │  layout card        │   │  └──────────────────────┘  │
│  └─────────────────────┘   │                            │
│  ┌─────────────────────┐   │                            │
│  │  Status bar         │   │                            │
│  │  Hand icon + dots   │   │                            │
│  └─────────────────────┘   │                            │
└────────────────────────────┴────────────────────────────┘
```

**Camera Border Feedback:**
The camera container's left and right borders change colour in real time:
- `isDetecting = true` → `3px solid #22C55E` (green) + green box-shadow
- `isDetecting = false` → `3px solid #DC2626` (red) + red box-shadow

This gives the patient an immediate visual signal that their signs are being captured without requiring them to read text.

**Model Feature Layout Card:**
An overlay in the top-right of the camera feed shows selected model-layout progress bars:
- Left Hand (21 pts), Right Hand (21 pts), Pose (23 selected pts), Face (48 selected pts)
- Total out of 113 selected landmarks, producing 339 model features per frame

**Avatar Zone (Phase 2 Placeholder):**
The bottom-right section is reserved for a future 3D skeletal avatar that will mirror the patient's signs in real time. Currently shows: animated concentric rings, a scan line, corner brackets, and a "Phase 2" badge.

**Logic Flow:**
1. Camera initializes on mount via `MediaPipeCamera` with `showRecord={false}` (hides the recording button — patient doesn't need to manually record)
2. `handleLandmarks` fires on every MediaPipe frame tick, updating the detection state
3. Camera border + status bar + model feature layout card all update reactively via state
4. Right panel is static demo data — in production, doctor messages would stream in via WebSocket

---

### 5.3 `src/app/mediapipe/page.tsx`

**Path:** `src/app/mediapipe/page.tsx`

**Purpose:** A standalone development and debugging page for testing MediaPipe Holistic in isolation. Provides a real-time view of raw landmark data for each detected modality. Used during development to verify the MediaPipe pipeline is working correctly before integrating into the portal pages.

**Key Components:**

**State:**
- `mirrored` — toggles camera horizontal flip
- `showFace` — toggles face mesh overlay
- `lastLandmarks` — stores the most recently received `LandmarkData` frame for display

**`LandmarkRow` Sub-component:**
A display-only sub-component that renders a single modality's data as a labeled progress bar + count:
```tsx
function LandmarkRow({ label, landmarks, expected, color }) {
  const count = landmarks?.length ?? 0;
  // progress bar: count/expected * 100%
  // status dot: green if count > 0, grey if not
}
```

**UI Panels:**
1. **Controls row** — Mirror ON/OFF toggle, Face Mesh ON/OFF toggle
2. **MediaPipeCamera** — full 640×480 feed
3. **Latest Frame Data panel** — shows `LandmarkRow` for each of left hand, right hand, pose, face + ISO timestamp
4. **Legend panel** — colour key for green (hands), blue (pose), red (face)

**Logic Flow:**
- `handleLandmarks` callback stores the latest frame data in `lastLandmarks` state
- The `LandmarkRow` components re-render on every frame tick with updated counts
- This page is accessible at `/mediapipe` and links back to `/` via "Back to Home"
- Not linked from any other page in the final product — accessed directly by developers

---

## 6. Components

### 6.1 `src/components/ToastProvider.tsx`

**Path:** `src/components/ToastProvider.tsx`

**Purpose:** Renders the `react-hot-toast` `<Toaster>` component with custom SLMA styling. Mounted once in `layout.tsx` so toast notifications are available on every page.

**Key Component:**
```tsx
<Toaster
  position="bottom-center"
  toastOptions={{
    style: {
      background: "rgba(15,23,42,0.95)",    // dark glass
      color: "#e2e8f0",
      border: "1px solid rgba(13,148,136,0.4)", // teal border
      borderRadius: "14px",
      fontSize: "13px",
      backdropFilter: "blur(8px)",
    },
  }}
/>
```

**Logic Flow:** Imported and rendered once in `RootLayout`. Any component anywhere in the app can call `toast.success("message")`, `toast.error("message")`, or `toast("message")` from `react-hot-toast` and the notification will appear at the bottom-center of the screen in the SLMA glass-dark style.

---

### 6.2 `src/components/mediapipe/MediaPipeCamera.tsx`

**Path:** `src/components/mediapipe/MediaPipeCamera.tsx`

**Purpose:** The core engine of the entire application. Handles loading MediaPipe Holistic scripts from CDN, initializing the model, running the per-frame inference loop, drawing landmarks onto a canvas, and emitting structured landmark data to parent components via a callback prop.

**Exported Types:**
```ts
export interface LandmarkData {
  leftHand: NormalizedLandmark[] | null;
  rightHand: NormalizedLandmark[] | null;
  pose: NormalizedLandmark[] | null;
  face: NormalizedLandmark[] | null;
  timestamp: number;
}

export interface MediaPipeCameraProps {
  width?: number;         // default: 640
  height?: number;        // default: 480
  showFace?: boolean;     // default: false
  onLandmarks?: (data: LandmarkData) => void;
  mirrored?: boolean;     // default: false
  showRecord?: boolean;   // default: true — hides record button when false
}
```

**CDN URLs:**
```ts
const HOLISTIC_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/holistic.js";
const CAMERA_CDN   = "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
const DRAWING_CDN  = "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js";
```

**Key Refs (mutable, avoid stale closures):**

| Ref | Type | Purpose |
|-----|------|---------|
| `videoRef` | `HTMLVideoElement` | The hidden `<video>` element used as the webcam source |
| `canvasRef` | `HTMLCanvasElement` | The visible `<canvas>` on which landmarks are drawn |
| `holisticRef` | `HolisticInstance` | The live Holistic model instance |
| `cameraRef` | `CameraInstance` | The live Camera tick loop instance |
| `showFaceRef` | `boolean` | Current face mesh toggle (avoids stale closure in `onResults`) |
| `fpsTimestampsRef` | `number[]` | Rolling 30-frame buffer of `performance.now()` values for FPS |
| `bufferRef` | `LandmarkData[]` | Rolling 90-frame landmark buffer (for future sequence model consumption) |
| `onLandmarksRef` | `function` | Keeps the `onLandmarks` prop fresh inside the callback |

**Initialization Flow (`useEffect` on mount):**

```
1. loadScript(HOLISTIC_CDN)
2. loadScript(CAMERA_CDN)
3. loadScript(DRAWING_CDN)
4. new window.Holistic({ locateFile: (f) => CDN_BASE + f })
5. holistic.setOptions({ modelComplexity:0, smoothLandmarks:true,
                         enableSegmentation:false,
                         minDetectionConfidence:0.5,
                         minTrackingConfidence:0.5 })
6. holistic.onResults(callback)        ← the main inference callback
7. new window.Camera(video, { onFrame, width, height })
8. camera.start()                       ← begins the webcam tick loop
```

**`onResults` Callback (per-frame, ~20-28fps):**
```
Every frame:
  1. Update rolling FPS (30-frame average via fpsTimestampsRef)
  2. ctx.clearRect + ctx.drawImage(results.image)   ← draw raw video
  3. drawConnectors + drawLandmarks for left hand (green)
  4. drawConnectors + drawLandmarks for right hand (green)
  5. drawConnectors + drawLandmarks for pose (blue)
  6. If showFaceRef.current: draw face mesh (red, 0.3 opacity)
  7. Read raw detection totals → setDetectedCount, setIsDetecting
  8. Push LandmarkData to bufferRef (90-frame rolling window)
  9. If recording: increment recFrameCountRef
  10. Every 30th frame: console.log landmark summary
  11. onLandmarksRef.current?.(landmarkFrame)   ← emit to parent
```

**Model Configuration (performance-tuned):**

| Option | Value | Reason |
|--------|-------|--------|
| `modelComplexity` | `0` | Lightest model — ~2x faster than complexity 1 on CPU |
| `smoothLandmarks` | `true` | Reduces jitter between frames |
| `enableSegmentation` | `false` | Skips background segmentation (not needed) |
| `minDetectionConfidence` | `0.5` | Allows faster re-detection without false negatives |
| `minTrackingConfidence` | `0.5` | Extends tracking window, reduces expensive re-detection |

**`loadScript(src)` Helper:**
Dynamically injects a `<script>` tag into `document.head`. Checks for an existing script with the same `src` to prevent duplicate loading on hot reload. Returns a `Promise<void>` that resolves on `onload`.

**Mirroring:**
When `mirrored={true}`, the canvas wrapper is CSS-transformed with `scaleX(-1)`. This makes the camera feel like a mirror (natural for self-view) without affecting the underlying landmark coordinates.

**Recording Feature (`showRecord` prop):**
When `showRecord={true}` (default), a record button is visible. `isRecording` state and `recFrameCountRef` track the recording session frame count displayed via `RecordingIndicator`. In the Patient Portal, `showRecord={false}` hides this entirely.

**Cleanup (`useEffect` return):**
```ts
return () => {
  cancelled = true;
  cameraRef.current?.stop();
  holisticRef.current?.close();
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
};
```
Prevents memory leaks and model inference after component unmount.

**Logic Flow:**
- Used by Doctor Portal (left column), Patient Portal (left panel), and MediaPipe Test Page
- Parent components pass `onLandmarks` to receive `LandmarkData` on every frame
- Doctor Portal uses it to drive real-time sign detection indicators and simulate translations
- Patient Portal uses it to drive the camera border colour, model feature layout card, and detection status bar
- The 90-frame `bufferRef` is the integration point for the future ML sequence model (TCN + LSTM will consume this buffer)

---

### 6.3 `src/components/mediapipe/FPSCounter.tsx`

**Path:** `src/components/mediapipe/FPSCounter.tsx`

**Purpose:** A small display badge that shows the current MediaPipe inference FPS with colour-coded performance indication.

**Props:** `{ fps: number }`

**Colour Logic:**
```
fps >= 25  → green  (good performance)
fps >= 15  → yellow (marginal performance)
fps <  15  → red    (poor performance — model too slow)
```

**Logic Flow:** Receives the `fps` state value from `MediaPipeCamera` and renders it as an overlay badge in the top-right corner of the camera view. No state or effects — purely presentational.

---

### 6.4 `src/components/mediapipe/DetectionStatus.tsx`

**Path:** `src/components/mediapipe/DetectionStatus.tsx`

**Purpose:** A status badge indicating whether hand landmarks are currently being detected.

**Props:** `{ isDetecting: boolean }`

**Behaviour:**
- `isDetecting = true` → animated pulsing green dot + "Detecting" label (uses `animate-ping` for the outer ring)
- `isDetecting = false` → static red dot + "Not Detecting" label

**Logic Flow:** Purely presentational. Receives `isDetecting` from `MediaPipeCamera` state (passed up via `onLandmarks` callback in portal pages). Rendered as an overlay in the camera view.

---

### 6.5 `src/components/mediapipe/LandmarkCounter.tsx`

**Path:** `src/components/mediapipe/LandmarkCounter.tsx`

**Purpose:** Displays whether landmarks are available for the 113 selected landmark / 339-feature model layout.

**Props:** `{ detected: number }`

**Constants:**
```ts
const MODEL_SELECTED_LANDMARKS = 113;
const MODEL_FEATURES = 339;
```

**Progress Bar Colour Logic:**
```
pct > 60  → green   (majority of body tracked)
pct > 30  → yellow  (partial tracking)
pct > 0   → blue    (minimal detection)
pct === 0 → slate   (nothing detected)
```

**Logic Flow:** Receives the summed raw `detectedCount` from `MediaPipeCamera` state. It does not treat raw MediaPipe totals as the trained sequence; it presents the selected 113-landmark / 339-feature model layout status. Purely presentational — no state or effects.

---

### 6.6 `src/components/mediapipe/RecordingIndicator.tsx`

**Path:** `src/components/mediapipe/RecordingIndicator.tsx`

**Purpose:** Displays a "REC" badge with a frame counter when recording is active. Returns `null` when not recording (renders nothing).

**Props:**
```ts
{ isRecording: boolean, frameCount: number }
```

**Behaviour:**
- Hidden when `isRecording = false` (returns `null`)
- Visible when `isRecording = true`:
  - Animated pulsing red circle (same `animate-ping` pattern as `DetectionStatus`)
  - "REC" text in bold red
  - 5-digit zero-padded frame count: `00000`, `00001`, ..., `00090`

**Logic Flow:** Renders only when the doctor has pressed the record button in `MediaPipeCamera`. `frameCount` is incremented by `MediaPipeCamera`'s `onResults` callback on each frame while `isRecordingRef.current = true`.

---

## 7. Data & Asset Files

### `public/logo-nobg.png`

**Purpose:** The SLMA logo image (transparent background PNG). Used in:
- Patient Portal top nav (`width=28, height=28`)
- Doctor Portal top nav (`width=32, height=32`)
- 404 Not Found page (`width=64, height=64, opacity-80`)

Referenced via `<Image src="/logo-nobg.png" ...>` using `next/image` in the portals and 404 page.

---

### `src/app/fonts/GeistVF.woff` & `GeistMonoVF.woff`

**Purpose:** Geist variable font files (by Vercel) — scaffolded by `create-next-app` but not actively used in the final project. The project uses `Inter` (loaded via `next/font/google` in `layout.tsx`) as its primary typeface. These font files are legacy from the initial scaffold.

---

### `src/app/favicon.ico`

**Purpose:** Browser tab icon — the default Next.js favicon from the scaffold. Displayed in browser tabs and bookmarks.

---

## 8. System Interaction Diagram

```
Browser
│
├─ Loads page.tsx (Landing)
│   ├─ Renders SLMALogo SVG (inline, no external dep)
│   └─ Links to /doctor and /patient
│
├─ Loads doctor/page.tsx
│   ├─ Mounts MediaPipeCamera (Left Column)
│   │   ├─ loadScript(holistic.js) → window.Holistic
│   │   ├─ loadScript(camera_utils.js) → window.Camera
│   │   ├─ loadScript(drawing_utils.js) → window.drawConnectors
│   │   ├─ Holistic.setOptions({ modelComplexity:0, ... })
│   │   ├─ Camera.start() → per-frame tick
│   │   │   └─ Holistic.send(videoFrame)
│   │   │       └─ onResults(results)
│   │   │           ├─ drawImage + drawConnectors + drawLandmarks → canvas
│   │   │           ├─ Update fps, isDetecting, detectedCount
│   │   │           ├─ Push to bufferRef[90]
│   │   │           └─ onLandmarks(LandmarkData) → DoctorPage.handleLandmarks
│   │   └─ FPSCounter / DetectionStatus / LandmarkCounter overlays
│   ├─ Chat Panel (Center): messages[], AI confidence badges, auto-scroll
│   └─ Controls Panel (Right): Quick responses [P01-P08], input, emergency btn
│
├─ Loads patient/page.tsx
│   ├─ Mounts MediaPipeCamera (Left Half, showRecord={false})
│   │   └─ (same pipeline as above)
│   │       └─ onLandmarks → PatientPage.handleLandmarks
│   │           ├─ setIsDetecting → camera border colour (green/red)
│   │           ├─ setLandmarkCounts → per-modality progress bars
│   │           └─ toast.success (one-time via handToastShownRef)
│   └─ Right Half:
│       ├─ Doctor Messages (Dr. Hassan, DEMO_MESSAGES)
│       └─ Avatar Zone (Phase 2 placeholder)
│
├─ Loads mediapipe/page.tsx (dev tool)
│   └─ Mounts MediaPipeCamera
│       └─ onLandmarks → LandmarkRow panels (raw debug view)
│
└─ layout.tsx (persistent across all routes)
    ├─ Inter font (next/font/google)
    ├─ globals.css (CSS variables, keyframes, utilities)
    └─ ToastProvider (react-hot-toast, bottom-center)
```

---

## Appendix — Technology Rationale

| Decision | Rationale |
|----------|-----------|
| **MediaPipe via CDN (not npm)** | The `@mediapipe/holistic` npm package has WebAssembly loading issues in Next.js's webpack pipeline. CDN loading via dynamic `<script>` injection bypasses this entirely. |
| **`modelComplexity: 0`** | Balances accuracy and performance for browser-based inference. Complexity 1 is accurate but halves FPS on typical hardware. |
| **90-frame `bufferRef`** | At ~25fps, 90 frames = ~3.6 seconds of sign — the typical duration of a single sign phrase. This is the planned input window for the TCN+LSTM sequence model. |
| **`useRef` for Holistic/Camera** | MediaPipe instances must not be stored in React state — state updates trigger re-renders, which would restart the camera. Refs persist without causing renders. |
| **`framer-motion` variants** | Declarative staggered animations with `delay` parameters are cleaner than manual CSS `animation-delay` chains when the number of animated elements is dynamic. |
| **Tailwind + CSS Variables** | Tailwind handles layout and spacing; CSS variables (`--primary`, `--surface`) are used for inline `style={}` props where Tailwind classes can't be used dynamically. |

---

*Documentation generated for SLMA v1.0.0-ALPHA — FYP, UMT Sialkot, 2025–2026.*
