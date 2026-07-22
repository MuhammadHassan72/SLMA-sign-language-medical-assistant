"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  FilesetResolver,
  GestureRecognizer,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import type {
  Category,
  GestureRecognizerResult,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const MODEL_PATH = "/models/gesture_recognizer.task";
const WASM_PATH = "/mediapipe/tasks-vision/wasm";
const DETECTION_INTERVAL_MS = 160;
const MOTION_BUFFER_SIZE = 30;
const STABILITY_MS = 650;
const JITTER_THRESHOLD = 0.025;
const WAVE_RANGE_THRESHOLD = 0.1;
const SWIPE_THRESHOLD = 0.18;

const OFFICIAL_GESTURES = [
  "Unknown/None",
  "Closed_Fist",
  "Open_Palm",
  "Pointing_Up",
  "Thumb_Down",
  "Thumb_Up",
  "Victory",
  "ILoveYou",
];

const EXTRA_GESTURES = [
  "Wave",
  "Swipe_Left",
  "Swipe_Right",
  "Two_Hands_Open",
  "Double_Thumbs_Up",
  "Double_Fist",
  "Two_Hand_Wave",
  "Unknown_General_Gesture",
];

type LoadStatus = "idle" | "loading" | "ready" | "error";
type StabilityState = "Waiting" | "Stabilizing" | "Stable";

interface EnhancedGeneralGesturePlaygroundProps {
  cameraContainerRef: RefObject<HTMLDivElement>;
}

interface HandSnapshot {
  key: string;
  handedness: string;
  label: string;
  confidence: number;
  x: number;
  y: number;
  landmarks: NormalizedLandmark[];
}

interface MotionFrame {
  timestamp: number;
  hands: HandSnapshot[];
}

interface GestureReadout {
  rawLabel: string;
  rawConfidence: number;
  finalLabel: string;
  candidateLabel: string;
  handCount: number;
  leftLabel: string;
  rightLabel: string;
  deltaX: number;
  deltaY: number;
  stabilityMs: number;
  stability: StabilityState;
  fps: number;
  framesProcessed: number;
  lastUpdated: string;
}

function createInitialReadout(): GestureReadout {
  return {
    rawLabel: "None",
    rawConfidence: 0,
    finalLabel: "Unknown_General_Gesture",
    candidateLabel: "Unknown_General_Gesture",
    handCount: 0,
    leftLabel: "None",
    rightLabel: "None",
    deltaX: 0,
    deltaY: 0,
    stabilityMs: 0,
    stability: "Waiting",
    fps: 0,
    framesProcessed: 0,
    lastUpdated: "--",
  };
}

function normalizeOfficialLabel(name?: string) {
  if (!name || name === "None") return "Unknown/None";
  return OFFICIAL_GESTURES.includes(name) ? name : "Unknown/None";
}

function formatGestureLabel(name: string) {
  return name.replaceAll("_", " ");
}

function getTopCategory(categories?: Category[]) {
  return categories?.[0];
}

function getHandPosition(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0];
  const indexTip = landmarks[8] ?? wrist;
  return {
    x: ((wrist?.x ?? 0) + (indexTip?.x ?? 0)) / 2,
    y: ((wrist?.y ?? 0) + (indexTip?.y ?? 0)) / 2,
  };
}

function buildHandSnapshots(result: GestureRecognizerResult) {
  return result.landmarks.map((landmarks, index) => {
    const gesture = getTopCategory(result.gestures[index]);
    const handedness = getTopCategory(result.handedness[index])?.categoryName ?? `Hand ${index + 1}`;
    const position = getHandPosition(landmarks);

    return {
      key: `${handedness}-${index}`,
      handedness,
      label: normalizeOfficialLabel(gesture?.categoryName),
      confidence: gesture?.score ?? 0,
      x: position.x,
      y: position.y,
      landmarks,
    };
  });
}

function getPrimaryHand(hands: HandSnapshot[]) {
  return hands.reduce<HandSnapshot | null>((best, hand) => {
    if (!best || hand.confidence > best.confidence) return hand;
    return best;
  }, null);
}

function positionsForHand(buffer: MotionFrame[], key: string) {
  return buffer
    .map((frame) => frame.hands.find((hand) => hand.key === key))
    .filter((hand): hand is HandSnapshot => Boolean(hand));
}

function motionDelta(buffer: MotionFrame[], key?: string) {
  const positions = key
    ? positionsForHand(buffer, key)
    : buffer.map((frame) => getPrimaryHand(frame.hands)).filter((hand): hand is HandSnapshot => Boolean(hand));

  if (positions.length < 3) return { deltaX: 0, deltaY: 0 };
  const first = positions[0];
  const last = positions[positions.length - 1];
  return {
    deltaX: last.x - first.x,
    deltaY: last.y - first.y,
  };
}

function hasWaveMotion(buffer: MotionFrame[], key: string) {
  const positions = positionsForHand(buffer, key).slice(-MOTION_BUFFER_SIZE);
  if (positions.length < 8) return false;

  const xs = positions.map((hand) => hand.x);
  const range = Math.max(...xs) - Math.min(...xs);
  if (range < WAVE_RANGE_THRESHOLD) return false;

  let directionChanges = 0;
  let lastDirection = 0;
  let meaningfulMoves = 0;

  for (let index = 1; index < xs.length; index += 1) {
    const diff = xs[index] - xs[index - 1];
    if (Math.abs(diff) < JITTER_THRESHOLD) continue;

    meaningfulMoves += 1;
    const direction = diff > 0 ? 1 : -1;
    if (lastDirection && direction !== lastDirection) {
      directionChanges += 1;
    }
    lastDirection = direction;
  }

  return meaningfulMoves >= 4 && directionChanges >= 2;
}

function detectRuleCandidate(hands: HandSnapshot[], buffer: MotionFrame[]) {
  const primary = getPrimaryHand(hands);
  const rawLabel = primary?.label ?? "Unknown/None";
  const rawConfidence = primary?.confidence ?? 0;
  const currentBuffer = buffer.slice(-14);
  const primaryDelta = motionDelta(currentBuffer, primary?.key);

  const openHands = hands.filter((hand) => hand.label === "Open_Palm");
  const thumbHands = hands.filter((hand) => hand.label === "Thumb_Up");
  const fistHands = hands.filter((hand) => hand.label === "Closed_Fist");
  const waveHands = openHands.filter((hand) => hasWaveMotion(buffer, hand.key));

  if (hands.length >= 2 && openHands.length >= 2 && waveHands.length >= 2) {
    return { label: "Two_Hand_Wave", confidence: Math.max(...waveHands.map((hand) => hand.confidence), rawConfidence) };
  }
  if (hands.length >= 2 && thumbHands.length >= 2) {
    return { label: "Double_Thumbs_Up", confidence: Math.min(...thumbHands.map((hand) => hand.confidence)) };
  }
  if (hands.length >= 2 && fistHands.length >= 2) {
    return { label: "Double_Fist", confidence: Math.min(...fistHands.map((hand) => hand.confidence)) };
  }
  if (hands.length >= 2 && openHands.length >= 2) {
    return { label: "Two_Hands_Open", confidence: Math.min(...openHands.map((hand) => hand.confidence)) };
  }
  if (waveHands.length > 0) {
    return { label: "Wave", confidence: Math.max(...waveHands.map((hand) => hand.confidence)) };
  }

  if (
    Math.abs(primaryDelta.deltaX) >= SWIPE_THRESHOLD &&
    Math.abs(primaryDelta.deltaX) > Math.abs(primaryDelta.deltaY) * 1.7
  ) {
    return {
      label: primaryDelta.deltaX < 0 ? "Swipe_Left" : "Swipe_Right",
      confidence: Math.max(rawConfidence, 0.7),
    };
  }

  if (rawLabel !== "Unknown/None" && rawConfidence >= 0.45) {
    return { label: rawLabel, confidence: rawConfidence };
  }

  return { label: "Unknown_General_Gesture", confidence: rawConfidence };
}

function drawPreview(
  previewCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  hands: HandSnapshot[],
  finalLabel: string,
) {
  const ctx = previewCanvas.getContext("2d");
  if (!ctx) return;

  const sourceWidth = sourceCanvas.width || 1;
  const sourceHeight = sourceCanvas.height || 1;
  const targetWidth = 640;
  const targetHeight = Math.round((targetWidth / sourceWidth) * sourceHeight);

  if (previewCanvas.width !== targetWidth || previewCanvas.height !== targetHeight) {
    previewCanvas.width = targetWidth;
    previewCanvas.height = targetHeight;
  }

  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0, previewCanvas.width, previewCanvas.height);

  const scaleX = previewCanvas.width;
  const scaleY = previewCanvas.height;
  const connections = HandLandmarker.HAND_CONNECTIONS as { start: number; end: number }[];

  hands.forEach((hand) => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.86)";
    connections.forEach((connection) => {
      const start = hand.landmarks[connection.start];
      const end = hand.landmarks[connection.end];
      if (!start || !end) return;
      ctx.beginPath();
      ctx.moveTo(start.x * scaleX, start.y * scaleY);
      ctx.lineTo(end.x * scaleX, end.y * scaleY);
      ctx.stroke();
    });

    hand.landmarks.forEach((landmark, index) => {
      ctx.beginPath();
      ctx.fillStyle = index === 0 || index === 8 ? "#FDE047" : "#4ADE80";
      ctx.arc(landmark.x * scaleX, landmark.y * scaleY, index === 0 || index === 8 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.fillStyle = "rgba(2,6,23,0.82)";
  ctx.fillRect(12, 12, Math.min(390, previewCanvas.width - 24), 52);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Arial";
  ctx.fillText(formatGestureLabel(finalLabel), 24, 46);
}

function nowTimeWithSeconds() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function EnhancedGeneralGesturePlayground({ cameraContainerRef }: EnhancedGeneralGesturePlaygroundProps) {
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<MotionFrame[]>([]);
  const framesProcessedRef = useRef(0);
  const fpsTimestampsRef = useRef<number[]>([]);
  const stabilizerRef = useRef({
    candidateLabel: "Unknown_General_Gesture",
    candidateSince: 0,
    stableLabel: "Unknown_General_Gesture",
    stableSince: 0,
  });

  const [isActive, setIsActive] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [statusText, setStatusText] = useState("Ready for local gesture demo");
  const [modelBytes, setModelBytes] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [readout, setReadout] = useState<GestureReadout>(createInitialReadout);

  const resetTrackingState = useCallback(() => {
    bufferRef.current = [];
    framesProcessedRef.current = 0;
    fpsTimestampsRef.current = [];
    stabilizerRef.current = {
      candidateLabel: "Unknown_General_Gesture",
      candidateSince: 0,
      stableLabel: "Unknown_General_Gesture",
      stableSince: 0,
    };
    setReadout(createInitialReadout());
  }, []);

  const loadRecognizer = useCallback(async () => {
    if (recognizerRef.current) {
      setLoadStatus("ready");
      return recognizerRef.current;
    }

    setLoadStatus("loading");
    setStatusText("Loading local gesture recognizer...");
    setErrorText("");

    try {
      const [vision, modelResponse] = await Promise.all([
        FilesetResolver.forVisionTasks(WASM_PATH),
        fetch(MODEL_PATH, { cache: "force-cache" }),
      ]);

      if (!modelResponse.ok) {
        throw new Error(`Gesture model load failed (${modelResponse.status})`);
      }

      const modelBuffer = await modelResponse.arrayBuffer();
      setModelBytes(modelBuffer.byteLength);

      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: new Uint8Array(modelBuffer),
        },
        runningMode: "VIDEO",
        numHands: 2,
      });

      recognizerRef.current = recognizer;
      setLoadStatus("ready");
      setStatusText("General gesture playground active");
      return recognizer;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gesture recognizer failed to load";
      setLoadStatus("error");
      setStatusText("General gesture playground unavailable");
      setErrorText(message);
      throw err;
    }
  }, []);

  const startPlayground = useCallback(async () => {
    resetTrackingState();
    setErrorText("");
    setStatusText("Starting local gesture recognizer...");
    setIsActive(true);
    try {
      await loadRecognizer();
    } catch {
      setIsActive(false);
    }
  }, [loadRecognizer, resetTrackingState]);

  const stopPlayground = useCallback(() => {
    setIsActive(false);
    resetTrackingState();
    setErrorText("");
    setStatusText("General gesture playground paused");
  }, [resetTrackingState]);

  useEffect(() => {
    if (!isActive || loadStatus !== "ready") return undefined;

    const detectGesture = () => {
      const recognizer = recognizerRef.current;
      const sourceCanvas = cameraContainerRef.current?.querySelector("canvas");

      if (!recognizer || !(sourceCanvas instanceof HTMLCanvasElement) || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
        setStatusText("Waiting for camera preview...");
        return;
      }

      try {
        const timestamp = performance.now();
        const result = recognizer.recognizeForVideo(sourceCanvas, timestamp);
        const hands = buildHandSnapshots(result);
        const primary = getPrimaryHand(hands);
        const rawLabel = primary?.label ?? "Unknown/None";
        const rawConfidence = primary?.confidence ?? 0;

        const nextFrame: MotionFrame = { timestamp, hands };
        bufferRef.current.push(nextFrame);
        if (bufferRef.current.length > MOTION_BUFFER_SIZE) bufferRef.current.shift();

        const candidate = detectRuleCandidate(hands, bufferRef.current);
        const stabilizer = stabilizerRef.current;
        if (candidate.label !== stabilizer.candidateLabel) {
          stabilizer.candidateLabel = candidate.label;
          stabilizer.candidateSince = timestamp;
        }

        const stabilityMs = timestamp - stabilizer.candidateSince;
        const isStable = stabilityMs >= STABILITY_MS;
        if (isStable && stabilizer.stableLabel !== candidate.label) {
          stabilizer.stableLabel = candidate.label;
          stabilizer.stableSince = timestamp;
        }

        const delta = motionDelta(bufferRef.current.slice(-14), primary?.key);
        framesProcessedRef.current += 1;
        fpsTimestampsRef.current.push(timestamp);
        if (fpsTimestampsRef.current.length > 30) fpsTimestampsRef.current.shift();
        const stamps = fpsTimestampsRef.current;
        const fps = stamps.length > 1
          ? Math.round(((stamps.length - 1) / (stamps[stamps.length - 1] - stamps[0])) * 1000)
          : 0;

        const leftHand = hands.find((hand) => hand.handedness.toLowerCase().includes("left"));
        const rightHand = hands.find((hand) => hand.handedness.toLowerCase().includes("right"));
        // Only the stabilized label is shown; `isStable` still drives the
        // "Stabilizing / Stable" readout below.
        const finalLabel = stabilizer.stableLabel;

        setReadout({
          rawLabel,
          rawConfidence,
          finalLabel,
          candidateLabel: candidate.label,
          handCount: hands.length,
          leftLabel: leftHand?.label ?? "None",
          rightLabel: rightHand?.label ?? "None",
          deltaX: delta.deltaX,
          deltaY: delta.deltaY,
          stabilityMs: Math.max(0, stabilityMs),
          stability: hands.length === 0 ? "Waiting" : isStable ? "Stable" : "Stabilizing",
          fps,
          framesProcessed: framesProcessedRef.current,
          lastUpdated: nowTimeWithSeconds(),
        });

        if (hands.length === 0) {
          setStatusText("No hand detected - place your hand inside the frame.");
        } else if (candidate.label === "Unknown_General_Gesture") {
          setStatusText("Unknown general gesture - this is outside supported non-ASL demo gestures.");
        } else {
          setStatusText(`${formatGestureLabel(candidate.label)} detected locally`);
        }

        const previewCanvas = previewCanvasRef.current;
        if (previewCanvas) drawPreview(previewCanvas, sourceCanvas, hands, finalLabel);
        setErrorText("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Gesture detection failed";
        setStatusText("General gesture detection error");
        setErrorText(message);
      }
    };

    detectGesture();
    const intervalId = window.setInterval(detectGesture, DETECTION_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [cameraContainerRef, isActive, loadStatus]);

  useEffect(() => {
    return () => {
      recognizerRef.current?.close();
      recognizerRef.current = null;
    };
  }, []);

  return (
    <div className="relative z-20 rounded-xl border border-fuchsia-500/25 bg-slate-950/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
            General Gesture Playground (Non-ASL Demo)
          </p>
          <p className="text-[10px] text-slate-500">Non-ASL demo, local browser model</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${isActive ? "bg-fuchsia-950/70 text-fuchsia-200" : "bg-slate-900/80 text-slate-400"}`}>
          {isActive ? "Active" : "Paused"}
        </span>
      </div>

      <div className="mt-2 overflow-hidden rounded-xl border border-fuchsia-500/20 bg-black">
        <canvas ref={previewCanvasRef} className="block aspect-video w-full object-contain" />
        {!isActive && (
          <p className="px-3 py-2 text-[10px] text-slate-400">
            Start Playground to show the local camera overlay and live general gesture label.
          </p>
        )}
      </div>

      <div className="mt-2 rounded-xl border border-fuchsia-500/25 bg-slate-900/70 px-3 py-2">
        <p className="text-[10px] text-slate-500">Final general gesture</p>
        <p className="mt-0.5 text-xl font-black text-fuchsia-100">{formatGestureLabel(readout.finalLabel)}</p>
        <p className="text-[10px] text-slate-400">
          Raw label: {readout.rawLabel} · Confidence: {(readout.rawConfidence * 100).toFixed(1)}% · Hands: {readout.handCount}
        </p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => void startPlayground()}
          disabled={isActive || loadStatus === "loading"}
          className="rounded-lg px-2.5 py-2 text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
          style={{ background: "rgba(134,25,143,0.28)", border: "1px solid rgba(217,70,239,0.45)", color: "#f5d0fe" }}
        >
          Start Playground
        </button>
        <button
          onClick={stopPlayground}
          disabled={!isActive}
          className="rounded-lg px-2.5 py-2 text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
          style={{ background: "rgba(71,85,105,0.24)", border: "1px solid rgba(100,116,139,0.4)", color: "#cbd5e1" }}
        >
          Stop
        </button>
      </div>

      <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/70 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          Live Gesture Processing Pipeline
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">
            Camera Frame: <span className="text-slate-200">{isActive ? "Active" : "Idle"}</span>
          </span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">
            MediaPipe Hand Detection: <span className="text-slate-200">{readout.handCount ? "Hand detected" : isActive ? "No hand" : "Idle"}</span>
          </span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">
            Landmark Extraction: <span className="text-slate-200">21 hand points per hand</span>
          </span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">
            Gesture Recognizer: <span className="text-slate-200">{loadStatus === "ready" ? "Running" : loadStatus === "loading" ? "Loading" : loadStatus === "error" ? "Error" : "Ready"}</span>
          </span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">
            Temporal Rule Engine: <span className="text-slate-200">{isActive ? "Running" : "Idle"}</span>
          </span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">
            Final General Gesture: <span className="text-slate-200">{formatGestureLabel(readout.finalLabel)}</span>
          </span>
        </div>
      </div>

      <p className="mt-2 rounded-md bg-slate-900/70 px-2 py-1 text-[10px] text-slate-300">{statusText}</p>
      {errorText && (
        <p className="mt-2 rounded-md bg-red-950/40 px-2 py-1 text-[10px] text-red-300">
          {errorText}
        </p>
      )}

      <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/70 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">Gesture Debug</p>
        <div className="mt-1 grid grid-cols-2 gap-1.5 text-[10px]">
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Recognizer: <span className="text-slate-200">{loadStatus === "idle" ? "Idle" : loadStatus === "loading" ? "Loading" : loadStatus === "ready" ? "Ready" : "Error"}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">FPS estimate: <span className="text-slate-200">{readout.fps}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Frames processed: <span className="text-slate-200">{readout.framesProcessed}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Raw confidence: <span className="text-slate-200">{(readout.rawConfidence * 100).toFixed(1)}%</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Raw MediaPipe label: <span className="text-slate-200">{readout.rawLabel}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Final stabilized label: <span className="text-slate-200">{readout.finalLabel}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Left hand label: <span className="text-slate-200">{readout.leftLabel}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Right hand label: <span className="text-slate-200">{readout.rightLabel}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Motion delta X/Y: <span className="text-slate-200">{readout.deltaX.toFixed(3)} / {readout.deltaY.toFixed(3)}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Stability: <span className="text-slate-200">{readout.stability} ({Math.round(readout.stabilityMs)} ms)</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Last updated: <span className="text-slate-200">{readout.lastUpdated}</span></span>
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Model bytes: <span className="text-slate-200">{modelBytes || "--"}</span></span>
          <span className="col-span-2 rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">Model path: <span className="text-slate-200">{MODEL_PATH}</span></span>
          <span className="col-span-2 rounded-md bg-slate-900/80 px-2 py-1 text-slate-400">WASM path: <span className="text-slate-200">{WASM_PATH}</span></span>
        </div>
        {errorText && <p className="mt-1 rounded-md bg-red-950/40 px-2 py-1 text-[10px] text-red-300">Last error: {errorText}</p>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...OFFICIAL_GESTURES, ...EXTRA_GESTURES].map((gesture) => (
          <span
            key={gesture}
            className={`rounded-full border px-2 py-1 text-[9px] ${
              gesture === readout.finalLabel || gesture === readout.candidateLabel
                ? "border-fuchsia-400/60 bg-fuchsia-950/50 text-fuchsia-100"
                : "border-slate-700/70 bg-slate-900/60 text-slate-500"
            }`}
          >
            {formatGestureLabel(gesture)}
          </span>
        ))}
      </div>

      <p className="mt-2 rounded-md bg-teal-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-teal-100">
        This is separate from SLMA medical ASL recognition and does not send data to backend, CSRE, MongoDB, or doctor log.
      </p>
      <p className="mt-2 rounded-md bg-amber-950/30 px-2 py-1.5 text-[10px] leading-relaxed text-amber-100">
        This mode is not the medical ASL recognition model. It only detects a small set of common general gestures for non-signers/evaluators. Medical translation uses the ASL gloss recognition mode.
      </p>
    </div>
  );
}
