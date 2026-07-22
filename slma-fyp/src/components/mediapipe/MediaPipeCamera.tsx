"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import FPSCounter from "./FPSCounter";
import DetectionStatus from "./DetectionStatus";
import LandmarkCounter from "./LandmarkCounter";
import RecordingIndicator from "./RecordingIndicator";
import { Eye, EyeOff, Circle, Square, Loader2, AlertCircle } from "lucide-react";
import type { NormalizedLandmark, HolisticInstance, CameraInstance } from "@/types/mediapipe";

// ── Public types ──────────────────────────────────────────────────────────
export interface LandmarkData {
  leftHand: NormalizedLandmark[] | null;
  rightHand: NormalizedLandmark[] | null;
  pose: NormalizedLandmark[] | null;
  face: NormalizedLandmark[] | null;
  timestamp: number;
}

export interface MediaPipeCameraProps {
  width?: number;
  height?: number;
  showFace?: boolean;
  onLandmarks?: (data: LandmarkData) => void;
  mirrored?: boolean;
  showRecord?: boolean;
  processingActive?: boolean;
  processingFrameIntervalMs?: number;
  onStatusChange?: (status: "loading" | "ready" | "error", error?: string) => void;
}

// ── LOCAL MediaPipe assets (vendored into /public) ────────────────────────
// Previously these loaded from the jsdelivr CDN, which meant a slow or absent
// internet connection stopped the camera from initialising at all. The whole
// Holistic runtime + models now ship locally, so the patient camera works
// fully offline and starts instantly.
const MEDIAPIPE_BASE = "/mediapipe/holistic-legacy";
const HOLISTIC_CDN = `${MEDIAPIPE_BASE}/holistic.js`;
const CAMERA_CDN = `${MEDIAPIPE_BASE}/camera_utils.js`;
const DRAWING_CDN = `${MEDIAPIPE_BASE}/drawing_utils.js`;

// Inference runs on a downscaled copy of the frame; the visible preview stays
// full-size. Fewer pixels per Holistic pass => each blocking send() is much
// shorter => the camera feed keeps a high FPS during recording. Landmarks are
// normalized [0,1], so downscaling does NOT change their values / accuracy.
// TUNING KNOB: raise these (e.g. 640x360) for slightly crisper landmark
// tracking, lower them (e.g. 424x240) for even smoother FPS on weaker laptops.
const PROCESSING_WIDTH = 480;
const PROCESSING_HEIGHT = 270;

// ── Helpers ───────────────────────────────────────────────────────────────
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function drawLetterboxedVideo(video: HTMLVideoElement, targetCanvas: HTMLCanvasElement) {
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return false;

  const sourceWidth = video.videoWidth || video.width;
  const sourceHeight = video.videoHeight || video.height;
  if (!sourceWidth || !sourceHeight) return false;

  const scale = Math.min(targetCanvas.width / sourceWidth, targetCanvas.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (targetCanvas.width - drawWidth) / 2;
  const offsetY = (targetCanvas.height - drawHeight) / 2;

  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
  return true;
}

// ═════════════════════════════════════════════════════════════════════════
export default function MediaPipeCamera({
  width = 640,
  height = 480,
  showFace: showFaceProp = false,
  onLandmarks,
  mirrored = false,
  showRecord = true,
  processingActive = true,
  processingFrameIntervalMs = 85,
  onStatusChange,
}: MediaPipeCameraProps) {
  // ── Refs ----------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const holisticRef = useRef<HolisticInstance | null>(null);
  const cameraRef = useRef<CameraInstance | null>(null);

  // Mutable refs for use inside holistic callback (avoids stale closures)
  const showFaceRef = useRef(showFaceProp);
  const isRecordingRef = useRef(false);
  const recFrameCountRef = useRef(0);
  const fpsTimestampsRef = useRef<number[]>([]);
  const frameTickRef = useRef(0);
  const bufferRef = useRef<LandmarkData[]>([]);
  const onLandmarksRef = useRef(onLandmarks);
  const onStatusChangeRef = useRef(onStatusChange);
  const processingActiveRef = useRef(processingActive);
  const processingBusyRef = useRef(false);
  const lastProcessingAtRef = useRef(0);

  // ── State ---------------------------------------------------------------
  const [showFace, setShowFace] = useState(showFaceProp);
  const [fps, setFps] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [loadPhase, setLoadPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // ── Keep mutable refs in sync with latest values ─────────────────────
  useEffect(() => {
    showFaceRef.current = showFace;
  }, [showFace]);

  useEffect(() => {
    onLandmarksRef.current = onLandmarks;
  }, [onLandmarks]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChangeRef.current?.(loadPhase, loadPhase === "error" ? errorMsg : undefined);
  }, [errorMsg, loadPhase]);

  useEffect(() => {
    processingActiveRef.current = processingActive;
    if (!processingActive) {
      processingBusyRef.current = false;
      // NOTE: fps deliberately NOT reset here — render FPS keeps measuring
      // the live camera preview even while MediaPipe inference is idle.
      setIsDetecting(false);
      setDetectedCount(0);
    }
  }, [processingActive]);

  // ── Toggle controls ----------------------------------------------------
  const toggleFace = useCallback(() => setShowFace((v) => !v), []);

  const toggleRecording = useCallback(() => {
    setIsRecording((prev) => {
      const next = !prev;
      isRecordingRef.current = next;
      if (next) {
        recFrameCountRef.current = 0;
        setFrameCount(0);
        console.log("🔴 SLMA Recording Started — Buffering raw landmarks for 339-feature conversion");
      } else {
        console.log(
          `⏹️ SLMA Recording Stopped — ${recFrameCountRef.current} frames captured for 339-feature conversion`
        );
      }
      return next;
    });
  }, []);

  // ── Main initialization ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let cleanupVideo: HTMLVideoElement | null = null;
    let cleanupCanvas: HTMLCanvasElement | null = null;

    const init = async () => {
      try {
        // 1 – Load scripts in dependency order
        await loadScript(HOLISTIC_CDN);
        await loadScript(CAMERA_CDN);
        await loadScript(DRAWING_CDN);

        if (cancelled) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        cleanupVideo = video;
        cleanupCanvas = canvas;

        const processingCanvas = document.createElement("canvas");
        processingCanvas.width = PROCESSING_WIDTH;
        processingCanvas.height = PROCESSING_HEIGHT;
        processingCanvasRef.current = processingCanvas;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        // 2 – Initialise Holistic
        const holistic = new window.Holistic({
          locateFile: (file: string) => `${MEDIAPIPE_BASE}/${file}`,
        });

        holistic.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // 3 – Result callback
        holistic.onResults((results) => {
          if (cancelled) return;
          if (!processingActiveRef.current) return;

          const {
            HAND_CONNECTIONS,
            POSE_CONNECTIONS,
            FACEMESH_TESSELATION,
            drawConnectors,
            drawLandmarks,
          } = window;

          // ── Draw ───────────────────────────────────────────────────
          // (FPS is now measured in the camera onFrame render loop.)
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          // Left hand — green
          if (results.leftHandLandmarks) {
            drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
              color: "#22C55E",
              lineWidth: 2,
            });
            drawLandmarks(ctx, results.leftHandLandmarks, {
              color: "#22C55E",
              lineWidth: 1,
              radius: 3,
            });
          }

          // Right hand — green
          if (results.rightHandLandmarks) {
            drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
              color: "#22C55E",
              lineWidth: 2,
            });
            drawLandmarks(ctx, results.rightHandLandmarks, {
              color: "#22C55E",
              lineWidth: 1,
              radius: 3,
            });
          }

          // Pose — blue
          if (results.poseLandmarks) {
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
              color: "#3B82F6",
              lineWidth: 2,
            });
            drawLandmarks(ctx, results.poseLandmarks, {
              color: "#3B82F6",
              lineWidth: 1,
              radius: 3,
            });
          }

          // Face — light red, 0.3 opacity, toggled via ref
          if (showFaceRef.current && results.faceLandmarks) {
            ctx.globalAlpha = 0.3;
            drawConnectors(ctx, results.faceLandmarks, FACEMESH_TESSELATION, {
              color: "#F87171",
              lineWidth: 1,
            });
            drawLandmarks(ctx, results.faceLandmarks, {
              color: "#F87171",
              lineWidth: 0.5,
              radius: 1,
            });
            ctx.globalAlpha = 1;
          }

          ctx.restore();

          // ── Landmark counts ────────────────────────────────────────
          const leftCount = results.leftHandLandmarks?.length ?? 0;
          const rightCount = results.rightHandLandmarks?.length ?? 0;
          const poseCount = results.poseLandmarks?.length ?? 0;
          const faceCount = results.faceLandmarks?.length ?? 0;
          const total = leftCount + rightCount + poseCount + faceCount;

          setDetectedCount(total);
          setIsDetecting(!!(results.leftHandLandmarks || results.rightHandLandmarks));

          // ── Buffer (last 90 frames) ────────────────────────────────
          const landmarkFrame: LandmarkData = {
            leftHand: results.leftHandLandmarks ?? null,
            rightHand: results.rightHandLandmarks ?? null,
            pose: results.poseLandmarks ?? null,
            face: results.faceLandmarks ?? null,
            timestamp: Date.now(),
          };
          bufferRef.current.push(landmarkFrame);
          if (bufferRef.current.length > 90) bufferRef.current.shift();

          // ── Recording frame counter ────────────────────────────────
          if (isRecordingRef.current) {
            recFrameCountRef.current += 1;
            setFrameCount(recFrameCountRef.current);
          }

          // ── Console log every 30th frame ──────────────────────────
          frameTickRef.current += 1;
          if (frameTickRef.current % 30 === 0) {
            console.log(
              `📊 SLMA Landmark Data — Hands: ${leftCount + rightCount}/42, Pose: ${poseCount}/33, Face: ${faceCount}/468, Buffer: ${bufferRef.current.length}/90 frames`
            );
          }

          // ── Callback prop ──────────────────────────────────────────
          onLandmarksRef.current?.(landmarkFrame);
        });

        holisticRef.current = holistic;

        // 4 – Start camera
        const camera = new window.Camera(video, {
          onFrame: async () => {
            const visibleCanvas = canvasRef.current;
            if (visibleCanvas) drawLetterboxedVideo(video, visibleCanvas);

            // ── Render FPS (rolling 30-frame average) ──────────────────
            // Measured on EVERY camera frame so the counter reflects the
            // live preview rate, independent of MediaPipe inference gating.
            const frameNow = performance.now();
            const stamps = fpsTimestampsRef.current;
            stamps.push(frameNow);
            if (stamps.length > 30) stamps.shift();
            if (stamps.length >= 2) {
              const elapsed = stamps[stamps.length - 1] - stamps[0];
              setFps(Math.round(((stamps.length - 1) / elapsed) * 1000));
            }

            if (!processingActiveRef.current || !holisticRef.current || processingBusyRef.current) return;

            const now = performance.now();
            if (now - lastProcessingAtRef.current < processingFrameIntervalMs) return;
            lastProcessingAtRef.current = now;

            const processingCanvas = processingCanvasRef.current;
            const image = processingCanvas && drawLetterboxedVideo(video, processingCanvas)
              ? processingCanvas
              : video;

            processingBusyRef.current = true;
            try {
              await holisticRef.current.send({ image });
            } finally {
              processingBusyRef.current = false;
            }
          },
          width,
          height,
        });

        await camera.start();
        cameraRef.current = camera;

        if (!cancelled) setLoadPhase("ready");
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setErrorMsg(msg);
          setLoadPhase("error");
          console.error("[MediaPipeCamera]", err);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        cameraRef.current?.stop();
      } catch { /* ignore */ }
      try {
        holisticRef.current?.close();
      } catch { /* ignore */ }
      // Stop any lingering webcam tracks
      if (cleanupVideo?.srcObject) {
        const stream = cleanupVideo.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
      // Clear canvas
      if (cleanupCanvas) {
        const ctx = cleanupCanvas.getContext("2d");
        ctx?.clearRect(0, 0, cleanupCanvas.width, cleanupCanvas.height);
      }
      cameraRef.current = null;
      holisticRef.current = null;
      processingCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full max-w-full rounded-2xl overflow-hidden shadow-2xl bg-slate-950 border border-slate-800"
      style={{ maxWidth: width, aspectRatio: `${width} / ${height}` }}
    >
      {/* Hidden video source — MediaPipe Camera drives this */}
      <video
        ref={videoRef}
        style={{ display: "none" }}
        width={width}
        height={height}
        muted
        playsInline
      />

      {/* Visible canvas — receives drawn landmarks */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block h-full w-full object-contain"
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      />

      {/* ── Loading overlay ─────────────────────────────────────── */}
      {loadPhase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          <p className="text-slate-300 text-sm font-medium">Loading MediaPipe…</p>
        </div>
      )}

      {/* ── Error overlay ───────────────────────────────────────── */}
      {loadPhase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-red-950/90 backdrop-blur-sm px-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-red-300 text-sm font-semibold">MediaPipe failed to load</p>
          <p className="text-red-500 text-xs break-all">{errorMsg}</p>
        </div>
      )}

      {/* ── HUD overlays (only when ready) ──────────────────────── */}
      {loadPhase === "ready" && (
        <>
          {/* Top-left: Detection status + Recording */}
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            <DetectionStatus isDetecting={isDetecting} />
            <RecordingIndicator isRecording={isRecording} frameCount={frameCount} />
          </div>

          {/* Top-right: FPS */}
          <div className="absolute top-3 right-3">
            <FPSCounter fps={fps} />
          </div>

          {/* Bottom-left: Landmark counter */}
          <div className="absolute bottom-14 left-3">
            <LandmarkCounter detected={detectedCount} />
          </div>

          {/* Bottom toolbar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-3 py-2 bg-slate-950/80 backdrop-blur-sm border-t border-slate-800/60">
            {/* Face toggle */}
            <button
              onClick={toggleFace}
              title={showFace ? "Hide face mesh" : "Show face mesh"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                showFace
                  ? "bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
              }`}
            >
              {showFace ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              Face Mesh
            </button>

            {/* Buffer size indicator */}
            <span className="text-[10px] text-slate-500 font-mono tabular-nums">
              buf: {bufferRef.current.length}/90
            </span>

            {/* Record button — doctor-only privilege */}
            {showRecord && (
              <button
                onClick={toggleRecording}
                title={isRecording ? "Stop recording" : "Start recording"}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  isRecording
                    ? "bg-red-600/90 text-white border border-red-500 hover:bg-red-700/90 shadow-lg shadow-red-900/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <Circle className="w-3 h-3 fill-current text-red-400" />
                    Record
                  </>
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
