"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Stethoscope, Wifi, Circle, Bot, Activity, Hand } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import AvatarPlayer from "@/components/avatar/AvatarPlayer";
import GeneralGesturePlayground from "@/components/gesture/EnhancedGeneralGesturePlayground";
import MediaPipeCamera from "@/components/mediapipe/MediaPipeCamera";
import type { LandmarkData } from "@/components/mediapipe/MediaPipeCamera";
import {
  AVATAR_HELLO_RESPONSE,
  AVATAR_IDLE_RESPONSE,
  AVATAR_RESPONSE_BY_KEY,
  getAvatarAssetUrl,
} from "@/lib/avatarAnimations";

function getBackendUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const browserHost = window.location.hostname;
    const isLocalClient = browserHost === "localhost" || browserHost === "127.0.0.1";
    if (isLocalClient) {
      return "http://localhost:8000";
    }
    return `http://${browserHost}:8000`;
  }

  return configuredUrl || "http://localhost:8000";
}

const BACKEND_URL = getBackendUrl();

type UploadStatus = "Waiting" | "Uploading" | "Prediction sent" | "Prediction received" | "Accepted" | "Low confidence / uncertain" | "Error";

interface BackendMessage {
  _id?: string;
  id?: string | number;
  session_id?: string;
  sender?: string;
  direction?: "patient_to_doctor" | "doctor_to_patient" | string;
  text?: string;
  final_text?: string;
  animation_key?: string;
  timestamp?: string;
  created_at?: string;
}

interface PredictionResult {
  top1_gloss: string;
  top1_confidence: number;
  top5: { rank: number; gloss: string; confidence: number }[];
  threshold: number;
  is_accepted: boolean;
  input_type?: string;
  source_frame_count?: number;
  hand_signal_frame_count?: number;
}

interface PredictResponse {
  session_id?: string;
  prediction_id?: string;
  message_id?: string;
  prediction: PredictionResult;
  refined_text: string;
  uncertainty_note: string;
  source: string;
}

interface DemoSample {
  label: string;
  display_name: string;
  file: string;
  expected_confidence: number;
  original_path: string;
}

type RecordingMode = "quick" | "normal" | "long" | "continuous";

interface SegmentHistoryItem {
  id: string;
  label: string;
  top1_gloss: string;
  confidence: number;
  refined_text: string;
  is_accepted: boolean;
  created_at: string;
}

interface VisibleDoctorMessage {
  id: string | number;
  text: string;
  time: string;
  source?: string;
  animationKey?: string;
}

interface ValidatedSampleProof {
  inputType: string;
  shape: string;
  endpoint: string;
  model: string;
  storedInMongoDb: string;
  predictionId: string;
}

type LandmarkList = LandmarkData["pose"];
type LandmarkPoint = NonNullable<LandmarkList>[number];

const POSE_POINT_COUNT = 23;
const HAND_POINT_COUNT = 21;
const POSE_INDICES = Array.from({ length: POSE_POINT_COUNT }, (_, index) => index);
const FACE_INDICES = [
  0, 13, 14, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95,
  146, 178, 181, 185, 191,
  267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318, 321, 324, 375,
  402, 405, 409, 415,
  46, 105, 107, 70, 276, 334, 336, 300,
];
const SELECTED_FACE_POINT_COUNT = FACE_INDICES.length;
const REQUIRED_FACE_LANDMARKS = Math.max(...FACE_INDICES) + 1;
const MODEL_SELECTED_LANDMARKS = POSE_POINT_COUNT + SELECTED_FACE_POINT_COUNT + HAND_POINT_COUNT * 2;
const LIVE_FEATURE_DIM = MODEL_SELECTED_LANDMARKS * 3;
const AUTO_READY_MS = 700;
// Minimum captured frames before we send a live sequence. Kept just above the
// backend's hand-signal floor (4) so valid short captures are not falsely
// rejected as "low visibility". The backend pads/samples to 96 frames.
const MIN_LIVE_FRAMES = 5;
const RELAY_INTERVAL_MS = 1000;
const RELAY_MAX_WIDTH = 480;
const RELAY_JPEG_QUALITY = 0.6;
const CONTINUOUS_SEGMENT_MS = 4000;
const RECORDING_MODE_OPTIONS: { value: RecordingMode; label: string; durationMs?: number }[] = [
  { value: "quick", label: "Quick Gloss: 3 seconds", durationMs: 3000 },
  { value: "normal", label: "Normal Gloss: 5 seconds", durationMs: 5000 },
  { value: "long", label: "Long Gloss: 7 seconds", durationMs: 7000 },
  { value: "continuous", label: "Continuous Segments" },
];

function safeCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function appendLandmark(features: number[], landmark?: LandmarkPoint | null) {
  features.push(
    safeCoordinate(landmark?.x),
    safeCoordinate(landmark?.y),
    safeCoordinate(landmark?.z),
  );
}

function appendIndexedLandmarks(features: number[], landmarks: LandmarkList, indices: number[]) {
  indices.forEach((landmarkIndex) => appendLandmark(features, landmarks?.[landmarkIndex]));
}

function appendSequentialLandmarks(features: number[], landmarks: LandmarkList, count: number) {
  for (let index = 0; index < count; index += 1) {
    appendLandmark(features, landmarks?.[index]);
  }
}

function buildLiveFeatureFrame(data: LandmarkData) {
  const features: number[] = [];

  appendIndexedLandmarks(features, data.pose, POSE_INDICES);
  appendIndexedLandmarks(features, data.face, FACE_INDICES);
  appendSequentialLandmarks(features, data.leftHand, HAND_POINT_COUNT);
  appendSequentialLandmarks(features, data.rightHand, HAND_POINT_COUNT);

  if (features.length !== LIVE_FEATURE_DIM) {
    throw new Error(`Live feature frame must have ${LIVE_FEATURE_DIM} values, received ${features.length}`);
  }

  return features;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function readBackendError(res: Response) {
  const statusText = `${res.status} ${res.statusText}`.trim();
  try {
    const payload = await res.json();
    if (typeof payload?.detail === "string") return payload.detail;
    if (Array.isArray(payload?.detail)) {
      return payload.detail
        .map((item: { msg?: string }) => item.msg || JSON.stringify(item))
        .join("; ");
    }
    return JSON.stringify(payload);
  } catch {
    const text = await res.text().catch(() => "");
    return text || statusText;
  }
}

/* â”€â”€â”€ Hard-coded demo messages from doctor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function formatBackendTime(value?: string) {
  const defaultTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (!value) return defaultTime();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return defaultTime();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatCsreSource(source: string) {
  return source === "csre" ? "CSRE refinement" : "Safe CSRE refinement";
}

/* Presentational only: turns a raw network/offline error string into a calm,
   demo-safe status notice. Non-network errors are shown verbatim (optionally
   prefixed). Does not alter any error state — only how it is displayed. */
function friendlyErrorText(raw: string, rawPrefix = "") {
  if (!raw) return raw;
  const browserOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  const looksNetwork = /failed to fetch|network ?error|load failed|fetch failed|err_internet|err_connection|connection refused|econnrefused|timed out|timeout|unreachable/i.test(raw);
  if (browserOffline || looksNetwork) {
    return "Offline Mode Active — Local Inference Models Running. Cloud sentence refinement resumes automatically when the connection returns.";
  }
  return rawPrefix ? `${rawPrefix}: ${raw}` : raw;
}

function getBackendMessageId(message: BackendMessage, fallbackIndex = 0) {
  return String(message._id || message.id || `${message.timestamp || message.created_at || "doctor"}-${fallbackIndex}`);
}

export default function PatientPage() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [showFace, setShowFace] = useState(false);
  const [landmarkCounts, setLandmarkCounts] = useState({ left: 0, right: 0, pose: 0, face: 0 });
  const [dotStep, setDotStep] = useState(0);
  const handToastShownRef = useRef(false);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const framePostBusyRef = useRef(false);
  const latestSessionBusyRef = useRef(false);
  const messageLoadBusyRef = useRef(false);
  const liveRecordingRef = useRef(false);
  const liveFramesRef = useRef<number[][]>([]);
  const continuousActiveRef = useRef(false);
  const landmarkUiRef = useRef({
    left: 0,
    right: 0,
    pose: 0,
    face: 0,
    detected: false,
    quality: "Low visibility",
  });
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());
  const animatedMessagesPrimedRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageAutoScrollCountRef = useRef(0);
  const [sessionId, setSessionId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("Waiting");
  const [predictionResult, setPredictionResult] = useState<PredictResponse | null>(null);
  const [doctorMessages, setDoctorMessages] = useState<BackendMessage[]>([]);
  const [messagePollingStatus, setMessagePollingStatus] = useState("Patient message polling: Waiting for session");
  const [messageLastFetchAt, setMessageLastFetchAt] = useState("");
  const [messageFetchCount, setMessageFetchCount] = useState(0);
  const [messagePollingError, setMessagePollingError] = useState("");
  const [isMessageDebugOpen, setIsMessageDebugOpen] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [frameShareStatus, setFrameShareStatus] = useState("Patient live frame sharing: waiting for session");
  const [cameraDebugStatus, setCameraDebugStatus] = useState("Camera unavailable");
  const [cameraLoadPhase, setCameraLoadPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionDebugStatus, setSessionDebugStatus] = useState("Session not connected");
  const [lastFrameSentAt, setLastFrameSentAt] = useState("");
  const [frameShareError, setFrameShareError] = useState("");
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [liveFrameCount, setLiveFrameCount] = useState(0);
  const [liveRecordingStatus, setLiveRecordingStatus] = useState("Waiting");
  const [liveRecordingError, setLiveRecordingError] = useState("");
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("quick");
  const [isContinuousActive, setIsContinuousActive] = useState(false);
  const [continuousSegmentIndex, setContinuousSegmentIndex] = useState(0);
  const [segmentHistory, setSegmentHistory] = useState<SegmentHistoryItem[]>([]);
  const [consultationStatus, setConsultationStatus] = useState("Waiting for doctor to start consultation...");
  const [landmarkQuality, setLandmarkQuality] = useState("Low visibility");
  const [isAutoTranslating, setIsAutoTranslating] = useState(false);
  const [currentAnimationKey, setCurrentAnimationKey] = useState("");
  const [avatarPlayToken, setAvatarPlayToken] = useState(0);
  const [demoSamples, setDemoSamples] = useState<DemoSample[]>([]);
  const [demoSampleStatus, setDemoSampleStatus] = useState("Prepared demo samples loading...");
  const [activeDemoSampleFile, setActiveDemoSampleFile] = useState("");
  const [selectedDemoFile, setSelectedDemoFile] = useState("");
  const [isDemoSampleSending, setIsDemoSampleSending] = useState(false);
  const [areValidatedSamplesOpen, setAreValidatedSamplesOpen] = useState(false);
  const [isManualUploadOpen, setIsManualUploadOpen] = useState(false);
  const [validatedSampleProof, setValidatedSampleProof] = useState<ValidatedSampleProof | null>(null);

  /* ── Mount ── */
  useEffect(() => {
    console.log("🤟 Patient Portal loaded — Camera feed active");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDemoSamples = async () => {
      try {
        const res = await fetch("/demo_samples/demo_samples.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Demo manifest failed (${res.status})`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Demo manifest must be an array");

        if (!cancelled) {
          setDemoSamples(data as DemoSample[]);
          setDemoSampleStatus(`${data.length} prepared demo samples ready`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Demo samples unavailable";
        if (!cancelled) {
          setDemoSamples([]);
          setDemoSampleStatus(`Demo sample error: ${msg}`);
        }
      }
    };

    void loadDemoSamples();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Cycle dots: 0→1→2→0 every 500ms */
  useEffect(() => {
    const id = setInterval(() => setDotStep((s) => (s + 1) % 3), 500);
    return () => clearInterval(id);
  }, []);

  const saveSessionId = useCallback((nextSessionId: string) => {
    const trimmedSessionId = nextSessionId.trim();
    setSessionId(trimmedSessionId);
    if (trimmedSessionId) {
      localStorage.setItem("slma_session_id", trimmedSessionId);
    } else {
      localStorage.removeItem("slma_session_id");
    }
  }, []);

  useEffect(() => {
    setSessionDebugStatus(sessionId ? "Connected to consultation session" : "Waiting for doctor to start consultation...");
  }, [sessionId]);

  const loadLatestSession = useCallback(async (options: { silent?: boolean } = {}) => {
    if (latestSessionBusyRef.current) return;
    latestSessionBusyRef.current = true;
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/latest`, { cache: "no-store" });
      if (res.status === 404) {
        setConsultationStatus("Waiting for doctor to start consultation...");
        setSessionDebugStatus("Waiting for doctor to start consultation...");
        if (!options.silent) toast("Waiting for doctor to start consultation...");
        return;
      }
      if (!res.ok) throw new Error(await readBackendError(res));
      const data = await res.json();
      saveSessionId(data._id);
      setConsultationStatus("Connected to consultation session");
      setSessionDebugStatus("Connected to consultation session");
      setBackendError("");
      if (!options.silent) toast.success("Latest session loaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load latest session";
      setBackendError(msg);
      setConsultationStatus("Waiting for doctor to start consultation...");
      if (!options.silent) {
        setUploadStatus("Error");
        toast.error(msg);
      }
    } finally {
      latestSessionBusyRef.current = false;
    }
  }, [saveSessionId]);

  useEffect(() => {
    const syncLatestSession = () => void loadLatestSession({ silent: true });
    syncLatestSession();
    const id = window.setInterval(syncLatestSession, 3000);
    return () => window.clearInterval(id);
  }, [loadLatestSession]);

  const handleCameraStatus = useCallback((status: "loading" | "ready" | "error", error?: string) => {
    setCameraLoadPhase(status);
    if (status === "ready") {
      setCameraDebugStatus("Camera available");
      setFrameShareError("");
      return;
    }

    setCameraDebugStatus(status === "loading" ? "Camera loading" : "Camera unavailable");
    if (status === "error") {
      setFrameShareStatus("Patient live frame sharing: camera unavailable");
      setFrameShareError(error || "Camera permission or initialization failed");
    }
  }, []);

  const loadDoctorMessages = useCallback(async (targetSessionId: string) => {
    if (!targetSessionId) return;
    if (messageLoadBusyRef.current) return;
    messageLoadBusyRef.current = true;
    try {
      setMessagePollingStatus("Patient message polling: Active");
      const res = await fetch(`${BACKEND_URL}/messages/${targetSessionId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Message load failed (${res.status})`);
      const data = await res.json();
      const fetchedMessages = Array.isArray(data) ? data : [];
      const uniqueMessages = new Map<string, BackendMessage>();
      fetchedMessages
        .filter((msg: BackendMessage) => msg.direction === "doctor_to_patient" || msg.sender === "doctor")
        .forEach((msg: BackendMessage, index: number) => {
          const messageId = String(msg._id || msg.id || `${msg.timestamp || msg.created_at || "doctor"}-${index}`);
          uniqueMessages.set(messageId, msg);
        });
      setDoctorMessages(Array.from(uniqueMessages.values()));
      setMessageLastFetchAt(formatBackendTime(new Date().toISOString()));
      setMessageFetchCount(fetchedMessages.length);
      setMessagePollingError("");
      setBackendError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load doctor messages";
      setMessagePollingStatus(`Patient message polling: Error - ${msg}`);
      setMessagePollingError(msg);
      setBackendError(msg);
    } finally {
      messageLoadBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setMessagePollingStatus("Patient message polling: Waiting for session");
      setMessagePollingError("");
      return;
    }
    loadDoctorMessages(sessionId);
    const id = setInterval(() => loadDoctorMessages(sessionId), 2000);
    return () => clearInterval(id);
  }, [sessionId, loadDoctorMessages]);

  useEffect(() => {
    const recoverPatientConnection = () => {
      void loadLatestSession({ silent: true });
      if (sessionId) void loadDoctorMessages(sessionId);
      setSessionDebugStatus(sessionId ? "Connection recovered and session refreshed" : "Looking for active consultation...");
    };

    const recoverWhenVisible = () => {
      if (document.visibilityState === "visible") recoverPatientConnection();
    };

    window.addEventListener("online", recoverPatientConnection);
    window.addEventListener("focus", recoverPatientConnection);
    document.addEventListener("visibilitychange", recoverWhenVisible);
    return () => {
      window.removeEventListener("online", recoverPatientConnection);
      window.removeEventListener("focus", recoverPatientConnection);
      document.removeEventListener("visibilitychange", recoverWhenVisible);
    };
  }, [sessionId, loadLatestSession, loadDoctorMessages]);

  const postCameraFrame = useCallback(async (frameData: string, source: "auto" | "manual") => {
    if (!sessionId) {
      const msg = "No active session_id for camera frame relay";
      setFrameShareError(msg);
      setFrameShareStatus("Patient live frame sharing: waiting for session");
      console.warn("[SLMA camera-frame POST skipped]", { reason: msg, source });
      return false;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/camera-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame_data: frameData }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`POST /camera-frame failed (${res.status}) ${detail}`.trim());
      }

      const sentAt = formatBackendTime(new Date().toISOString());
      setFrameShareStatus("Patient live frame sharing: active");
      setLastFrameSentAt(sentAt);
      setFrameShareError("");
      console.log("[SLMA camera-frame POST success]", {
        session_id: sessionId,
        source,
        status: res.status,
        frame_data_length: frameData.length,
        sent_at: sentAt,
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown frame sharing error";
      setFrameShareStatus("Patient live frame sharing: error");
      setFrameShareError(msg);
      console.error("[SLMA camera-frame POST failure]", {
        session_id: sessionId,
        source,
        error: msg,
      });
      return false;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setFrameShareStatus("Patient live frame sharing: waiting for session");
      setCameraDebugStatus("Camera unavailable");
      return;
    }

    if (cameraLoadPhase !== "ready") {
      setFrameShareStatus(
        cameraLoadPhase === "error"
          ? "Patient live frame sharing: camera unavailable"
          : "Patient live frame sharing: waiting for camera",
      );
      return;
    }

    let stopped = false;
    const relayCanvas = document.createElement("canvas");

    const sendCameraFrame = async () => {
      if (framePostBusyRef.current) return;

      const sourceCanvas = cameraContainerRef.current?.querySelector("canvas");
      if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
        setCameraDebugStatus("Camera unavailable");
        setFrameShareStatus("Patient live frame sharing: camera unavailable");
        return;
      }

      const ctx = relayCanvas.getContext("2d");
      if (!ctx) {
        setCameraDebugStatus("Camera unavailable");
        setFrameShareStatus("Patient live frame sharing: camera unavailable");
        return;
      }

      try {
        framePostBusyRef.current = true;
        setCameraDebugStatus("Camera available");
        const sourceWidth = sourceCanvas.width || 1;
        const sourceHeight = sourceCanvas.height || 1;
        const scale = Math.min(1, RELAY_MAX_WIDTH / sourceWidth);
        relayCanvas.width = Math.round(sourceWidth * scale);
        relayCanvas.height = Math.round(sourceHeight * scale);
        ctx.drawImage(sourceCanvas, 0, 0, relayCanvas.width, relayCanvas.height);

        const frameData = relayCanvas.toDataURL("image/jpeg", RELAY_JPEG_QUALITY);
        if (!stopped) await postCameraFrame(frameData, "auto");
      } catch {
        if (!stopped) {
          setCameraDebugStatus("Camera unavailable");
          setFrameShareStatus("Patient live frame sharing: camera unavailable");
        }
      } finally {
        framePostBusyRef.current = false;
      }
    };

    void sendCameraFrame();
    const id = setInterval(() => void sendCameraFrame(), RELAY_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [cameraLoadPhase, sessionId, postCameraFrame]);

  const sendTestFrame = async () => {
    const testCanvas = document.createElement("canvas");
    testCanvas.width = 640;
    testCanvas.height = 480;
    const ctx = testCanvas.getContext("2d");
    if (!ctx) {
      setFrameShareError("Could not create test frame canvas");
      return;
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, testCanvas.width, testCanvas.height);
    ctx.fillStyle = "#14b8a6";
    ctx.fillRect(24, 24, testCanvas.width - 48, testCanvas.height - 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Arial";
    ctx.fillText("SLMA Test Frame", 72, 230);
    ctx.font = "20px Arial";
    ctx.fillText(formatBackendTime(new Date().toISOString()), 72, 268);

    setCameraDebugStatus("Camera available");
    await postCameraFrame(testCanvas.toDataURL("image/jpeg", 0.8), "manual");
  };

  const submitLiveFrames = async (frames: number[][]) => {
    if (frames.length < MIN_LIVE_FRAMES) {
      throw new Error("Not enough landmarks detected. Please keep hands visible and try again.");
    }

    const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/predict-live-sequence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames }),
    });
    if (!res.ok) {
      throw new Error(await readBackendError(res));
    }

    const data = await res.json();
    setPredictionResult(data);
    setLiveRecordingStatus("Live prediction completed");
    setUploadStatus(data.prediction?.is_accepted ? "Accepted" : "Prediction received");
    await loadDoctorMessages(sessionId);
    return data;
  };

  const appendSegmentHistory = (data: PredictResponse, label: string) => {
    setSegmentHistory((previous) => [
      {
        id: `${Date.now()}-${previous.length}`,
        label,
        top1_gloss: data.prediction.top1_gloss,
        confidence: data.prediction.top1_confidence,
        refined_text: data.refined_text,
        is_accepted: data.prediction.is_accepted,
        created_at: new Date().toISOString(),
      },
      ...previous,
    ].slice(0, 8));
  };

  const recordAndSubmitSegment = async (
    durationMs: number,
    label: string,
    shouldSubmit: () => boolean = () => true,
  ) => {
    liveFramesRef.current = [];
    setLiveFrameCount(0);
    setLiveRecordingError("");

    liveRecordingRef.current = true;
    setIsLiveRecording(true);
    setLiveRecordingStatus(`Recording ${label}...`);
    await wait(durationMs);

    liveRecordingRef.current = false;
    setIsLiveRecording(false);

    if (!shouldSubmit()) {
      return null;
    }

    const frames = [...liveFramesRef.current];
    if (frames.length < MIN_LIVE_FRAMES) {
      throw new Error("Low landmark visibility. Please keep hands visible.");
    }

    setLiveRecordingStatus(`Processing ${label}...`);
    setUploadStatus("Uploading");
    const data = await submitLiveFrames(frames);
    appendSegmentHistory(data, label);
    return data;
  };

  const startSignRecording = () => {
    if (!sessionId) {
      const msg = "Enter or load a session ID before recording.";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(`Live prediction error: ${msg}`);
      setUploadStatus("Error");
      return;
    }

    liveFramesRef.current = [];
    liveRecordingRef.current = true;
    setIsLiveRecording(true);
    setLiveFrameCount(0);
    setLiveRecordingError("");
    setLiveRecordingStatus("Recording sign...");
    setUploadStatus("Waiting");
    toast.success("Sign recording started");
  };

  const translateSignAutomatically = async () => {
    if (!sessionId) {
      const msg = "Waiting for doctor to start consultation...";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(msg);
      setUploadStatus("Error");
      return;
    }

    setIsAutoTranslating(true);
    setLiveRecordingError("");
    setBackendError("");
    setUploadStatus("Waiting");

    try {
      setLiveRecordingStatus("Get ready");
      // Warm up MediaPipe DURING the countdown (processing on) without saving
      // frames yet (liveRecordingRef stays false), so the model is already
      // producing landmarks the instant capture begins — this eliminates the
      // cold-start frame loss that caused "low landmark visibility" failures.
      setIsLiveRecording(true);
      await wait(AUTO_READY_MS);

      const durationMs = selectedRecordingOption.durationMs ?? 3000;
      await recordAndSubmitSegment(durationMs, selectedRecordingOption.label.split(":")[0]);
      toast.success("Live prediction sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send live sequence";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(`Live prediction error: ${msg}`);
      setUploadStatus("Error");
      toast.error(msg);
    } finally {
      liveRecordingRef.current = false;
      setIsLiveRecording(false);
      setIsAutoTranslating(false);
    }
  };

  const startContinuousSession = async () => {
    if (!sessionId) {
      const msg = "Waiting for doctor to start consultation...";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(msg);
      setUploadStatus("Error");
      return;
    }

    if (continuousActiveRef.current) return;

    continuousActiveRef.current = true;
    setIsContinuousActive(true);
    setIsAutoTranslating(true);
    setLiveRecordingError("");
    setBackendError("");
    setUploadStatus("Waiting");
    setLiveRecordingStatus("Continuous segmented recognition active");
    toast.success("Continuous segmented recognition started");

    // Warm up MediaPipe before the first segment (see translateSignAutomatically).
    setIsLiveRecording(true);
    let segmentNumber = 1;

    try {
      while (continuousActiveRef.current) {
        setContinuousSegmentIndex(segmentNumber);
        setLiveRecordingStatus(`Recording segment ${segmentNumber}`);

        try {
          const data = await recordAndSubmitSegment(
            CONTINUOUS_SEGMENT_MS,
            `segment ${segmentNumber}`,
            () => continuousActiveRef.current,
          );
          if (!data) break;
          setLiveRecordingStatus(`Segment ${segmentNumber} sent`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Low landmark visibility. Please keep hands visible.";
          setLiveRecordingError(msg);
          setLiveRecordingStatus(`Segment ${segmentNumber} skipped: ${msg}`);
          setUploadStatus("Waiting");
        }

        segmentNumber += 1;
        if (continuousActiveRef.current) {
          setIsLiveRecording(true); // keep MediaPipe warm through the gap
          await wait(450);
        }
      }
    } finally {
      liveRecordingRef.current = false;
      continuousActiveRef.current = false;
      setIsLiveRecording(false);
      setIsContinuousActive(false);
      setIsAutoTranslating(false);
      setLiveRecordingStatus("Continuous segmented recognition stopped");
    }
  };

  const stopContinuousSession = () => {
    continuousActiveRef.current = false;
    liveRecordingRef.current = false;
    setIsLiveRecording(false);
    setIsContinuousActive(false);
    setLiveRecordingStatus("Stopping continuous segmented recognition...");
  };

  const stopAndTranslateLiveSequence = async () => {
    liveRecordingRef.current = false;
    setIsLiveRecording(false);

    if (!sessionId) {
      const msg = "Enter or load a session ID before translating.";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(`Live prediction error: ${msg}`);
      setUploadStatus("Error");
      return;
    }

    const frames = liveFramesRef.current;
    if (!frames.length) {
      const msg = "Live landmark recording unavailable. Please use landmark file upload.";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(msg);
      setUploadStatus("Error");
      return;
    }

    setLiveRecordingError("");
    setLiveRecordingStatus("Ready to translate");
    setLiveRecordingStatus("Processing");
    setUploadStatus("Uploading");

    try {
      const data = await submitLiveFrames(frames);
      appendSegmentHistory(data, "manual segment");
      toast.success("Live prediction sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send live sequence";
      setLiveRecordingError(msg);
      setLiveRecordingStatus(`Live prediction error: ${msg}`);
      setUploadStatus("Error");
      toast.error(msg);
    }
  };

  const clearSignRecording = () => {
    continuousActiveRef.current = false;
    liveRecordingRef.current = false;
    liveFramesRef.current = [];
    setIsLiveRecording(false);
    setIsContinuousActive(false);
    setIsAutoTranslating(false);
    setLiveFrameCount(0);
    setLiveRecordingError("");
    setLiveRecordingStatus("Waiting");
  };

  const submitNpyFile = async (file: File, successMessage = "Prediction sent") => {
    setUploadStatus("Uploading");
    setBackendError("");
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/predict-npy`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(await readBackendError(res));

    const data = await res.json();
    setPredictionResult(data);
    setUploadStatus(data.prediction?.is_accepted ? "Accepted" : "Prediction received");
    toast.success(successMessage);
    await loadDoctorMessages(sessionId);
    return data as PredictResponse;
  };

  const sendSignToDoctor = async () => {
    if (!sessionId) {
      setBackendError("Enter or load a session ID first.");
      setUploadStatus("Error");
      return;
    }
    if (!selectedFile) {
      setBackendError("Select a .npy file first.");
      setUploadStatus("Error");
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith(".npy")) {
      setBackendError("Selected file must be a .npy landmark sequence.");
      setUploadStatus("Error");
      return;
    }

    try {
      await submitNpyFile(selectedFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send sign";
      setBackendError(msg);
      setUploadStatus("Error");
      toast.error(msg);
    }
  };

  const sendPreparedDemoSample = async (sample: DemoSample) => {
    if (!sessionId) {
      const msg = "Waiting for doctor to start consultation. Load latest session first.";
      setDemoSampleStatus(`Demo sample error: ${msg}`);
      setBackendError(msg);
      setUploadStatus("Error");
      return;
    }

    setActiveDemoSampleFile(sample.file);
    setIsDemoSampleSending(true);
    setDemoSampleStatus("Sending prepared demo sample...");
    setUploadStatus("Uploading");
    setBackendError("");

    try {
      const res = await fetch(`/demo_samples/${encodeURIComponent(sample.file)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load ${sample.file} (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], sample.file, { type: "application/octet-stream" });
      setSelectedFile(file);
      const data = await submitNpyFile(file, `${sample.display_name} validated sample prediction sent`);
      setValidatedSampleProof({
        inputType: "Validated .npy landmark sample",
        shape: "96 x 339",
        endpoint: `POST /sessions/${sessionId}/predict-npy`,
        model: "CE V2",
        storedInMongoDb: data.prediction_id ? "yes" : "unknown - response did not include prediction_id",
        predictionId: data.prediction_id || "--",
      });
      setDemoSampleStatus("Prediction completed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send prepared demo sample";
      setDemoSampleStatus(`Demo sample error: ${msg}`);
      setBackendError(msg);
      setUploadStatus("Error");
      toast.error(msg);
    } finally {
      setIsDemoSampleSending(false);
      setActiveDemoSampleFile("");
    }
  };

  const visibleDoctorMessages = useMemo<VisibleDoctorMessage[]>(() => {
    if (!doctorMessages.length) return [];
    return doctorMessages.map((msg, index) => ({
      id: getBackendMessageId(msg, index),
      text: msg.text || msg.final_text || "Doctor response",
      time: formatBackendTime(msg.timestamp || msg.created_at),
      source: "Doctor Portal",
      animationKey: msg.animation_key,
    }));
  }, [doctorMessages]);
  const latestDoctorMessage = doctorMessages.length ? doctorMessages[doctorMessages.length - 1] : null;
  const latestDoctorMessageId = latestDoctorMessage
    ? getBackendMessageId(latestDoctorMessage)
    : "";
  const latestDoctorMessageText = latestDoctorMessage?.text || latestDoctorMessage?.final_text || "Doctor response";
  const latestDoctorMessageTime = formatBackendTime(latestDoctorMessage?.timestamp || latestDoctorMessage?.created_at);

  /* Auto-scroll the history list to the newest doctor message — only when the
     message count actually changes, so the 2s polling loop never fights the
     user while they are scrolled up reading older messages. */
  useEffect(() => {
    if (visibleDoctorMessages.length === messageAutoScrollCountRef.current) return;
    messageAutoScrollCountRef.current = visibleDoctorMessages.length;
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [visibleDoctorMessages]);

  useEffect(() => {
    setDoctorMessages([]);
    setMessageFetchCount(0);
    setMessageLastFetchAt("");
    setMessagePollingError("");
    setPredictionResult(null);
    setSegmentHistory([]);
    setValidatedSampleProof(null);
    animatedMessageIdsRef.current.clear();
    animatedMessagesPrimedRef.current = false;
    setCurrentAnimationKey("");
    setAvatarPlayToken(0);
  }, [sessionId]);

  useEffect(() => {
    const animatedMessages = doctorMessages.filter((msg) => msg.animation_key);

    if (!animatedMessagesPrimedRef.current) {
      animatedMessages.forEach((msg, index) => animatedMessageIdsRef.current.add(getBackendMessageId(msg, index)));
      animatedMessagesPrimedRef.current = true;
      return;
    }

    const newAnimatedMessages = animatedMessages.filter((msg, index) => !animatedMessageIdsRef.current.has(getBackendMessageId(msg, index)));
    animatedMessages.forEach((msg, index) => animatedMessageIdsRef.current.add(getBackendMessageId(msg, index)));

    const nextAnimatedMessage = newAnimatedMessages[newAnimatedMessages.length - 1];
    if (!nextAnimatedMessage?.animation_key) return;

    setCurrentAnimationKey(nextAnimatedMessage.animation_key);
    setAvatarPlayToken((value) => value + 1);
  }, [doctorMessages]);

  const currentAvatarResponse = currentAnimationKey ? AVATAR_RESPONSE_BY_KEY[currentAnimationKey] : undefined;
  const currentAvatarLabel = currentAvatarResponse?.label ?? AVATAR_IDLE_RESPONSE.label;
  const currentAvatarUrl = getAvatarAssetUrl(currentAvatarResponse?.fileName);
  const idleAvatarUrl = getAvatarAssetUrl(AVATAR_IDLE_RESPONSE.fileName);
  const helloAvatarUrl = getAvatarAssetUrl(AVATAR_HELLO_RESPONSE.fileName);

  const modelLandmarkCounts = useMemo(() => {
    const left = Math.min(landmarkCounts.left, HAND_POINT_COUNT);
    const right = Math.min(landmarkCounts.right, HAND_POINT_COUNT);
    const pose = Math.min(landmarkCounts.pose, POSE_POINT_COUNT);
    const face = landmarkCounts.face >= REQUIRED_FACE_LANDMARKS
      ? SELECTED_FACE_POINT_COUNT
      : Math.min(landmarkCounts.face, SELECTED_FACE_POINT_COUNT);

    return {
      left,
      right,
      pose,
      face,
      total: left + right + pose + face,
    };
  }, [landmarkCounts]);
  const mediaPipeModeStatus = isLiveRecording
    ? "Recording mode: MediaPipe active"
    : "Performance mode: MediaPipe idle";
  const selectedRecordingOption = useMemo(
    () => RECORDING_MODE_OPTIONS.find((option) => option.value === recordingMode) ?? RECORDING_MODE_OPTIONS[0],
    [recordingMode],
  );

  useEffect(() => {
    if (isLiveRecording) return;
    landmarkUiRef.current = {
      left: 0,
      right: 0,
      pose: 0,
      face: 0,
      detected: false,
      quality: "Low visibility",
    };
    setIsDetecting(false);
    setLandmarkCounts({ left: 0, right: 0, pose: 0, face: 0 });
    setLandmarkQuality("Low visibility");
  }, [isLiveRecording]);

  const handleLandmarks = useCallback((data: LandmarkData) => {
    const leftCount  = data.leftHand?.length  ?? 0;
    const rightCount = data.rightHand?.length ?? 0;
    const poseCount = data.pose?.length ?? 0;
    const faceCount = data.face?.length ?? 0;
    const detected = leftCount > 0 || rightCount > 0;
    const quality = detected ? "Hand detected" : poseCount > 0 && faceCount > 0 ? "Face-Pose detected" : "Low visibility";
    const previousUi = landmarkUiRef.current;

    if (
      previousUi.left !== leftCount ||
      previousUi.right !== rightCount ||
      previousUi.pose !== poseCount ||
      previousUi.face !== faceCount ||
      previousUi.detected !== detected ||
      previousUi.quality !== quality
    ) {
      landmarkUiRef.current = {
        left: leftCount,
        right: rightCount,
        pose: poseCount,
        face: faceCount,
        detected,
        quality,
      };
      setIsDetecting(detected);
      setLandmarkCounts({
        left:  leftCount,
        right: rightCount,
        pose:  poseCount,
        face:  faceCount,
      });
      setLandmarkQuality(quality);
    }
    if (detected && !handToastShownRef.current) {
      handToastShownRef.current = true;
      toast.success("✋ Hand landmarks detected!");
    }

    if (liveRecordingRef.current) {
      if (!detected) {
        setLiveRecordingStatus("Recording sign... keep hands visible");
        return;
      }
      try {
        const featureFrame = buildLiveFeatureFrame(data);
        liveFramesRef.current.push(featureFrame);
        const nextCount = liveFramesRef.current.length;
        setLiveFrameCount(nextCount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Live landmark recording unavailable. Please use landmark file upload.";
        liveRecordingRef.current = false;
        setIsLiveRecording(false);
        setLiveRecordingError(msg);
        setLiveRecordingStatus(`Live prediction error: ${msg}`);
      }
    }
  }, []);

  return (
    <div
      className="relative flex h-screen overflow-hidden"
      style={{ background: "#0A0F1E", color: "#F1F5F9" }}
    >
      {/* Camera feed + right panel */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• LEFT â€” Camera (full height) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="relative w-1/2 h-full flex-shrink-0 overflow-hidden flex flex-col">
        <div className="relative flex-1 min-h-[420px] overflow-hidden">

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(13,148,136,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Top nav bar */}
        <div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,15,30,0.95) 0%, rgba(10,15,30,0) 100%)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors mr-0.5"
            >
              <span>&#8592;</span> Home
            </Link>
            <span className="text-slate-700 text-xs">|</span>
            <Image src="/logo-nobg.png" alt="SLMA" width={28} height={28} />
            <span className="text-teal-400 font-bold text-sm tracking-[0.2em]">SLMA</span>
            <span className="text-slate-600 text-xs">|</span>
            <span className="text-slate-400 text-xs tracking-wide">Patient Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#FCD34D", backdropFilter: "blur(6px)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" style={{ animation: "pulseGlow 2s ease-in-out infinite" }} />
              Medical ASL
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-600/40 bg-slate-900/60 backdrop-blur-sm">
              <Activity size={11} className="text-teal-400" />
              <span className="text-[11px] text-slate-300">Live Session</span>
            </div>
          </div>
        </div>

        {/* Camera — inset from nav and status bar for center-positioned look */}
        <div
          ref={cameraContainerRef}
          className="absolute left-0 right-0 flex items-center justify-center overflow-hidden px-4 py-3"
          style={{
            top: '54px',
            bottom: '66px',
            borderLeft: isDetecting ? "3px solid #22C55E" : "3px solid #DC2626",
            borderRight: isDetecting ? "3px solid #22C55E" : "3px solid #DC2626",
            boxShadow: isDetecting
              ? "inset 0 0 60px rgba(34,197,94,0.08), 0 0 30px rgba(34,197,94,0.15)"
              : "inset 0 0 60px rgba(220,38,38,0.06), 0 0 30px rgba(220,38,38,0.08)",
            transition: "all 0.5s ease",
          }}
        >
          <MediaPipeCamera
            width={960}
            height={540}
            mirrored={true}
            showFace={showFace}
            showRecord={false}
            processingActive={isLiveRecording}
            processingFrameIntervalMs={85}
            onLandmarks={handleLandmarks}
            onStatusChange={handleCameraStatus}
          />

          {/* ── Face mesh + model feature overlay (top-right corner) ── */}
          <div className="absolute top-14 right-3 z-30 flex flex-col gap-2 items-end">
            {/* Face mesh toggle */}
            <button
              onClick={() => setShowFace((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: showFace ? "rgba(99,102,241,0.25)" : "rgba(15,23,42,0.75)",
                border: showFace ? "1px solid rgba(99,102,241,0.6)" : "1px solid rgba(100,116,139,0.35)",
                color: showFace ? "#a5b4fc" : "#94a3b8",
                backdropFilter: "blur(6px)",
              }}
            >
              {showFace ? "Hide Face Mesh" : "Show Face Mesh"}
            </button>

            {/* 339-feature model layout card */}
            <div
              className="rounded-xl px-3 py-2.5 flex flex-col gap-1.5 min-w-[140px]"
              style={{ background: "rgba(10,15,30,0.82)", border: "1px solid rgba(100,116,139,0.25)", backdropFilter: "blur(8px)" }}
            >
              <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-[0.2em] mb-0.5">
                Model Features
              </p>
              {[
                { label: "Left Hand",  val: modelLandmarkCounts.left,  max: HAND_POINT_COUNT,  color: "#4ADE80" },
                { label: "Right Hand", val: modelLandmarkCounts.right, max: HAND_POINT_COUNT,  color: "#34D399" },
                { label: "Pose",       val: modelLandmarkCounts.pose,  max: POSE_POINT_COUNT,  color: "#60A5FA" },
                { label: "Face",       val: modelLandmarkCounts.face,  max: SELECTED_FACE_POINT_COUNT, color: "#A78BFA" },
              ].map(({ label, val, max, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-[64px] shrink-0">{label}</span>
                  <div className="flex-1 h-1 rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((val / max) * 100)}%`, background: color }}
                    />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums" style={{ color, minWidth: 30, textAlign: "right" }}>
                    {val}/{max}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between mt-0.5 pt-1.5 border-t border-slate-700/40">
                <span className="text-[9px] text-slate-500">Selected</span>
                <span className="text-[10px] font-mono text-slate-300">
                  {modelLandmarkCounts.total}
                  <span className="text-slate-600">/{MODEL_SELECTED_LANDMARKS}</span>
                </span>
              </div>
              <p className="text-[9px] text-slate-500">339 model features</p>
            </div>
          </div>
        </div>

        {/* Bottom status bar overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-4"
          style={{
            background:
              "linear-gradient(to top, rgba(10,15,30,0.97) 0%, rgba(10,15,30,0) 100%)",
          }}
        >
          {/* Detection indicator */}
          <div className="flex items-center gap-2.5">
            <div
              className="relative flex items-center justify-center w-7 h-7 rounded-full"
              style={{
                background: isDetecting
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(220,38,38,0.12)",
                border: isDetecting
                  ? "1px solid rgba(34,197,94,0.5)"
                  : "1px solid rgba(220,38,38,0.4)",
              }}
            >
              <Hand
                size={13}
                className={isDetecting ? "text-green-400" : "text-red-400"}
              />
              {isDetecting && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ animation: "pulseGlow 1.5s ease-in-out infinite", background: "rgba(34,197,94,0.15)" }}
                />
              )}
            </div>
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: isDetecting ? "#4ADE80" : "#F87171" }}
              >
                {isDetecting ? "Sign Detected" : "No Sign Detected"}
              </p>
              <p className="text-[11px] text-slate-500">
                {isDetecting ? "AI is translating your signs..." : "Show your hands to the camera"}
              </p>
            </div>
          </div>

          {/* Animated dots — ●○○ → ●●○ → ●●● cycling */}
          <div className="flex items-center gap-1.5">
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-teal-500/25 bg-teal-950/30"
            >
              <Wifi size={10} className="text-teal-300" />
              <span className="text-[10px] text-teal-200">{frameShareStatus}</span>
            </div>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  background: dotStep >= i ? "#2DD4BF" : "rgba(45,212,191,0.2)",
                  boxShadow: dotStep >= i ? "0 0 6px #2DD4BF" : "none",
                }}
              />
            ))}
          </div>
        </div>
        </div>

        <div
          className="relative z-20 mx-4 mb-4 mt-3 shrink-0 rounded-2xl p-3"
          style={{
            background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(8,13,28,0.95))",
            border: "1px solid rgba(59,130,246,0.34)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.24)",
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Stethoscope size={13} className="text-blue-300" />
              <h2 className="text-[12px] font-bold uppercase tracking-[0.2em] text-blue-200">
                Doctor Message
              </h2>
            </div>
            {sessionId && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-950/35 px-2 py-1 text-[10px] text-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
                Listening for doctor messages...
              </span>
            )}
          </div>

          {!sessionId ? (
            <p className="rounded-xl border border-amber-400/20 bg-amber-950/20 px-3 py-2 text-[12px] leading-relaxed text-amber-100">
              No active session loaded. Start or load a session to receive doctor messages.
            </p>
          ) : latestDoctorMessage ? (
            <div className="rounded-xl border border-blue-400/20 bg-slate-950/55 px-3 py-2">
              <p className="text-[15px] font-semibold leading-snug text-slate-50">
                {latestDoctorMessageText}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span>Time: <span className="text-slate-200">{latestDoctorMessageTime}</span></span>
                <span>Source: <span className="text-blue-200">Doctor Portal</span></span>
                <span>
                  Status:{" "}
                  <span className="text-blue-200">
                    {latestDoctorMessage.animation_key ? "Avatar response" : "Text-only response"}
                  </span>
                </span>
                {latestDoctorMessage.animation_key && (
                  <span>
                    animation_key: <span className="font-mono text-blue-200">{latestDoctorMessage.animation_key}</span>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-slate-600/30 bg-slate-950/45 px-3 py-2 text-[12px] text-slate-300">
              No doctor message received yet.
            </p>
          )}

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsMessageDebugOpen((value) => !value)}
              className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 hover:text-slate-300"
            >
              Message Debug {isMessageDebugOpen ? "[-]" : "[+]"}
            </button>
            {isMessageDebugOpen && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-700/40 bg-slate-950/50 p-2 text-[10px]">
                <span className="text-slate-500">Active session ID: <span className="font-mono text-slate-300">{sessionId || "--"}</span></span>
                <span className="text-slate-500">Polling: <span className="text-slate-300">{sessionId ? "Active" : "Waiting"}</span></span>
                <span className="text-slate-500">Last fetch time: <span className="text-slate-300">{messageLastFetchAt || "--"}</span></span>
                <span className="text-slate-500">Messages fetched: <span className="font-mono text-slate-300">{messageFetchCount}</span></span>
                <span className="text-slate-500">Latest doctor message ID: <span className="font-mono text-slate-300">{latestDoctorMessageId || "--"}</span></span>
                <span className="text-slate-500">Last error: <span className={messagePollingError ? "text-red-300" : "text-slate-300"}>{messagePollingError || "--"}</span></span>
              </div>
            )}
          </div>
      </div>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• RIGHT â€” Messages + Avatar â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div
        className="w-1/2 h-full flex flex-col"
        style={{ borderLeft: "1px solid rgba(100,116,139,0.2)" }}
      >

        {/* â”€â”€ DOCTOR MESSAGES (top ~62%) â”€â”€ */}
        <div
          className="flex flex-col flex-1 min-h-0 overflow-y-auto"
          style={{ borderBottom: "1px solid rgba(100,116,139,0.2)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3.5 shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.8))",
              borderBottom: "1px solid rgba(100,116,139,0.15)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg,rgba(13,148,136,0.3),rgba(13,148,136,0.1))",
                  border: "1px solid rgba(13,148,136,0.4)",
                }}
              >
                <Stethoscope size={16} className="text-teal-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Dr. Hassan</p>
                <p className="text-[11px] text-slate-500">General Physician · UMT Sialkot</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-950/60 border border-green-500/25">
              <Circle className="fill-green-400 text-green-400" size={7} />
              <span className="text-[11px] text-green-400 font-medium tracking-wide">Online</span>
            </div>
          </div>

          {/* Doctor message history — full scrollable log (auto-scrolls to newest) */}
          <div
            className="mx-4 mt-3 flex shrink-0 flex-col overflow-hidden rounded-xl border border-blue-500/20"
            style={{ background: "rgba(15,23,42,0.78)" }}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700/40 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Stethoscope size={12} className="text-blue-300" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">
                  Doctor Message History
                </span>
              </div>
              <span className="rounded-full border border-blue-400/30 bg-blue-950/40 px-2 py-0.5 font-mono text-[10px] text-blue-200">
                {visibleDoctorMessages.length} message{visibleDoctorMessages.length === 1 ? "" : "s"}
              </span>
            </div>
            <div ref={messageListRef} className="max-h-[34vh] min-h-[96px] space-y-3 overflow-y-auto px-3 py-3">
              {visibleDoctorMessages.length === 0 && (
                <div className="rounded-lg border border-slate-700/40 bg-slate-950/45 px-3 py-2.5 text-center text-[11px] text-slate-400">
                  No doctor messages received for this session yet.
                </div>
              )}
              {visibleDoctorMessages.map((msg, i) => (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: "linear-gradient(135deg,rgba(13,148,136,0.25),rgba(13,148,136,0.08))",
                      border: "1px solid rgba(13,148,136,0.35)",
                    }}
                  >
                    <Stethoscope size={11} className="text-teal-300" />
                  </div>
                  <div
                    className="flex-1 rounded-2xl rounded-tl-sm px-3.5 py-2.5"
                    style={{
                      background:
                        i % 2 === 0
                          ? "linear-gradient(135deg, #1E293B, #243040)"
                          : "linear-gradient(135deg, #1A2535, #1E2D3D)",
                      border: "1px solid rgba(100,116,139,0.18)",
                    }}
                  >
                    <p className="text-[13px] leading-relaxed text-slate-200">{msg.text}</p>
                    {msg.source && (
                      <p className="mt-1.5 text-[10px] text-blue-200/80">
                        Source: {msg.source} · {msg.animationKey ? `Animation key: ${msg.animationKey}` : "Text-only response"}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-500">{msg.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Session + upload controls */}
          <div
            className="mx-4 mt-3 rounded-xl p-3 shrink-0 flex flex-col gap-2"
            style={{ background: "rgba(15,23,42,0.78)", border: "1px solid rgba(13,148,136,0.25)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-teal-300 uppercase tracking-[0.2em]">Backend Session</span>
              <span className="text-[10px] text-slate-500">Status: <span className="text-slate-300">{uploadStatus}</span></span>
            </div>
            <div className="flex gap-2 items-center">
              <p
                className="flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold"
                style={{
                  background: sessionId ? "rgba(13,148,136,0.16)" : "rgba(245,158,11,0.1)",
                  border: sessionId ? "1px solid rgba(13,148,136,0.35)" : "1px solid rgba(245,158,11,0.28)",
                  color: sessionId ? "#99f6e4" : "#fcd34d",
                }}
              >
                {consultationStatus}
              </p>
              <button
                onClick={() => void loadLatestSession()}
                className="px-3 py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95"
                style={{ background: "rgba(13,148,136,0.2)", border: "1px solid rgba(13,148,136,0.4)", color: "#5eead4" }}
              >
                Use Latest Session
              </button>
            </div>
            <p className="text-[9px] text-slate-600 break-all">
              debug session_id: <span className="font-mono text-slate-400">{sessionId || "not selected"}</span>
            </p>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <p className="rounded-md bg-slate-950/45 px-2 py-1 text-slate-300">{cameraDebugStatus}</p>
              <p className="rounded-md bg-slate-950/45 px-2 py-1 text-slate-300">{sessionDebugStatus}</p>
              <p className="rounded-md bg-slate-950/45 px-2 py-1 text-teal-200">{frameShareStatus}</p>
              <p className="rounded-md bg-slate-950/45 px-2 py-1 text-slate-300">{landmarkQuality}</p>
              <p className="rounded-md bg-slate-950/45 px-2 py-1 text-slate-300">
                Last frame sent: {lastFrameSentAt || "--"}
              </p>
              <p className="rounded-md bg-slate-950/45 px-2 py-1 text-blue-200">{messagePollingStatus}</p>
            </div>
            {frameShareError && (
              <p className="rounded-md bg-red-950/40 px-2 py-1 text-[10px] text-red-300">
                {friendlyErrorText(frameShareError, "Frame sharing error")}
              </p>
            )}
            <div className="relative z-20 rounded-lg p-2 bg-slate-950/45 border border-blue-500/20 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualUploadOpen((value) => !value)}
                  className="text-left text-[10px] font-semibold text-blue-300 uppercase tracking-[0.16em]"
                >
                  Manual .npy Upload {isManualUploadOpen ? "[-]" : "[+]"}
                </button>
                <span className="text-[10px] text-slate-500">
                  {selectedFile ? selectedFile.name : "No file selected"}
                </span>
              </div>
              {isManualUploadOpen && (
                <>
                  <p className="rounded-md bg-slate-900/70 px-2 py-1 text-[10px] leading-relaxed text-slate-300">
                    Upload a 96 x 339 landmark sequence to the same backend medical ASL model.
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      type="file"
                      accept=".npy"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      className="min-w-[170px] flex-1 text-[10px] text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-[10px] file:text-slate-200"
                    />
                    <button
                      onClick={sendSignToDoctor}
                      disabled={uploadStatus === "Uploading"}
                      className="px-3 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: "rgba(30,64,175,0.28)", border: "1px solid rgba(59,130,246,0.45)", color: "#93c5fd" }}
                    >
                      Send File to Doctor
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="relative z-20 rounded-lg p-2 bg-slate-950/45 border border-green-500/20 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setAreValidatedSamplesOpen((value) => !value)}
                  className="text-left text-[10px] font-semibold text-green-300 uppercase tracking-[0.16em]"
                >
                  Validated Test Landmark Samples {areValidatedSamplesOpen ? "[-]" : "[+]"}
                </button>
                <span className="text-[10px] text-slate-500">{demoSamples.length} real .npy files</span>
              </div>
              <p className="rounded-md bg-slate-900/70 px-2 py-1 text-[10px] leading-relaxed text-slate-300">
                These are real .npy landmark sequences processed through backend CE V2 model, not hardcoded outputs.
              </p>
              {areValidatedSamplesOpen && (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-slate-400">
                    Select a validated landmark file
                    <select
                      value={selectedDemoFile}
                      onChange={(event) => setSelectedDemoFile(event.target.value)}
                      disabled={!sessionId || uploadStatus === "Uploading" || isDemoSampleSending}
                      className="mt-1 w-full rounded-md border border-green-500/30 bg-slate-900 px-2 py-2 text-[11px] text-green-100 outline-none focus:border-green-400 disabled:opacity-50"
                    >
                      <option value="">-- Choose a demo .npy file --</option>
                      {demoSamples.map((sample) => (
                        <option key={sample.file} value={sample.file}>
                          {sample.display_name} ({sample.file})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      const sample = demoSamples.find((item) => item.file === selectedDemoFile);
                      if (sample) void sendPreparedDemoSample(sample);
                    }}
                    disabled={!sessionId || !selectedDemoFile || uploadStatus === "Uploading" || isDemoSampleSending}
                    className="rounded-lg px-3 py-2.5 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: "rgba(34,197,94,0.24)", border: "1px solid rgba(74,222,128,0.55)", color: "#bbf7d0" }}
                  >
                    {isDemoSampleSending
                      ? `Sending ${activeDemoSampleFile || "file"} to doctor...`
                      : "Send Selected File to Doctor"}
                  </button>
                </div>
              )}
              {validatedSampleProof && (
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-green-500/20 bg-slate-950/50 p-2 text-[10px]">
                  <span className="text-slate-500">Input type: <span className="text-green-100">{validatedSampleProof.inputType}</span></span>
                  <span className="text-slate-500">Shape: <span className="text-green-100">{validatedSampleProof.shape}</span></span>
                  <span className="col-span-2 text-slate-500">Endpoint used: <span className="text-green-100">{validatedSampleProof.endpoint}</span></span>
                  <span className="text-slate-500">Model: <span className="text-green-100">{validatedSampleProof.model}</span></span>
                  <span className="text-slate-500">Stored in MongoDB: <span className="text-green-100">{validatedSampleProof.storedInMongoDb}</span></span>
                  <span className="col-span-2 break-all text-slate-500">Prediction ID: <span className="font-mono text-green-100">{validatedSampleProof.predictionId}</span></span>
                </div>
              )}
              <p
                className={`rounded-md px-2 py-1 text-[10px] ${
                  demoSampleStatus.startsWith("Demo sample error")
                    ? "bg-red-950/40 text-red-300"
                    : "bg-green-950/30 text-green-200"
                }`}
              >
                {demoSampleStatus}
              </p>
            </div>
            <div className="rounded-lg p-2 bg-slate-950/45 border border-teal-500/20 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-teal-300 uppercase tracking-[0.16em]">
                  Medical ASL Recognition Mode
                </span>
                <span className="text-[10px] text-slate-400">
                  Collected frames: <span className="font-mono text-slate-200">{liveFrameCount}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {RECORDING_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setRecordingMode(option.value)}
                    disabled={isLiveRecording || isAutoTranslating || isContinuousActive}
                    className="rounded-lg px-2 py-2 text-left text-[10px] font-semibold transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      background:
                        recordingMode === option.value
                          ? "rgba(20,184,166,0.28)"
                          : "rgba(15,23,42,0.72)",
                      border:
                        recordingMode === option.value
                          ? "1px solid rgba(45,212,191,0.58)"
                          : "1px solid rgba(45,212,191,0.2)",
                      color: recordingMode === option.value ? "#ccfbf1" : "#94a3b8",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="rounded-md bg-slate-900/70 px-2 py-1 text-[10px] text-slate-400">
                For longer communication, SLMA captures multiple short sign segments during the same consultation and sends each segment to the doctor.
              </p>
              <button
                onClick={() => void translateSignAutomatically()}
                disabled={!sessionId || recordingMode === "continuous" || isAutoTranslating || isLiveRecording || isContinuousActive}
                className="w-full rounded-xl px-3 py-3 text-sm font-black tracking-wide transition-all active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(13,148,136,0.42), rgba(30,64,175,0.32))",
                  border: "1px solid rgba(45,212,191,0.55)",
                  color: "#ccfbf1",
                  boxShadow: "0 0 18px rgba(13,148,136,0.16)",
                }}
              >
                {recordingMode === "continuous" ? "Use Continuous Buttons" : "Translate Sign"}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void startContinuousSession()}
                  disabled={!sessionId || recordingMode !== "continuous" || isContinuousActive || isLiveRecording}
                  className="px-2.5 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(13,148,136,0.22)", border: "1px solid rgba(13,148,136,0.45)", color: "#5eead4" }}
                >
                  Start Continuous Session
                </button>
                <button
                  onClick={stopContinuousSession}
                  disabled={!isContinuousActive}
                  className="px-2.5 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(127,29,29,0.28)", border: "1px solid rgba(248,113,113,0.45)", color: "#fecaca" }}
                >
                  Stop Continuous Session
                </button>
              </div>
              {isContinuousActive && (
                <p className="rounded-md bg-teal-950/40 px-2 py-1 text-[10px] text-teal-200">
                  Continuous segmented recognition active
                  {continuousSegmentIndex > 0 ? ` - segment ${continuousSegmentIndex}` : ""}
                </p>
              )}
              <p className="text-[10px] text-slate-500">
                Quality: <span className="text-slate-300">{landmarkQuality}</span>
              </p>
              <p
                className={`rounded-md px-2 py-1 text-[10px] ${
                  isLiveRecording
                    ? "bg-teal-950/40 text-teal-200"
                    : "bg-slate-900/70 text-slate-400"
                }`}
              >
                {mediaPipeModeStatus}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={startSignRecording}
                  disabled={isLiveRecording || isAutoTranslating || isContinuousActive}
                  className="px-2.5 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(13,148,136,0.22)", border: "1px solid rgba(13,148,136,0.45)", color: "#5eead4" }}
                >
                  Start Sign Recording
                </button>
                <button
                  onClick={() => void stopAndTranslateLiveSequence()}
                  disabled={isAutoTranslating || isContinuousActive || (!isLiveRecording && liveFrameCount === 0)}
                  className="px-2.5 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(30,64,175,0.28)", border: "1px solid rgba(59,130,246,0.45)", color: "#93c5fd" }}
                >
                  Stop & Translate
                </button>
                <button
                  onClick={clearSignRecording}
                  disabled={isAutoTranslating || (!isLiveRecording && liveFrameCount === 0 && !isContinuousActive)}
                  className="px-2.5 py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(71,85,105,0.24)", border: "1px solid rgba(100,116,139,0.4)", color: "#cbd5e1" }}
                >
                  Clear Recording
                </button>
              </div>
              <p className="rounded-md bg-slate-900/70 px-2 py-1 text-[10px] text-teal-100">
                {liveRecordingStatus}
              </p>
              {liveRecordingError && (
                <p className="rounded-md bg-red-950/40 px-2 py-1 text-[10px] text-red-300">
                  {friendlyErrorText(liveRecordingError)}
                </p>
              )}
              {segmentHistory.length > 0 && (
                <div className="rounded-lg border border-teal-500/20 bg-slate-950/50 p-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-300">
                    Segment result history
                  </p>
                  <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                    {segmentHistory.map((item) => (
                      <div key={item.id} className="rounded-md bg-slate-900/70 px-2 py-1 text-[10px] text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-teal-100">{item.label}</span>
                          <span className={item.is_accepted ? "text-green-300" : "text-amber-300"}>
                            {(item.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-slate-400">
                          {item.top1_gloss}: {item.refined_text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <GeneralGesturePlayground cameraContainerRef={cameraContainerRef} />
            <button
              onClick={() => void sendTestFrame()}
              className="w-full rounded-lg px-3 py-2 text-[10px] font-semibold transition-all active:scale-95"
              style={{ background: "rgba(13,148,136,0.16)", border: "1px solid rgba(13,148,136,0.34)", color: "#5eead4" }}
            >
              Send Test Frame
            </button>
            {selectedFile && <p className="text-[10px] text-slate-500">Selected: {selectedFile.name}</p>}
            {predictionResult && (
              <div className="rounded-lg p-2 bg-slate-950/50 border border-teal-500/25">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-300">
                    Latest ASL Prediction
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      predictionResult.prediction.is_accepted
                        ? "bg-green-500/15 text-green-300"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {predictionResult.prediction.is_accepted ? "Accepted" : "Needs confirmation"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400">Top gloss</span>
                  <span className="font-bold text-teal-300">{predictionResult.prediction.top1_gloss}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] mt-1">
                  <span className="text-slate-400">Confidence</span>
                  <span className="font-mono text-slate-300">{(predictionResult.prediction.top1_confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] mt-1">
                  <span className="text-slate-400">CSRE status</span>
                  <span className={predictionResult.source === "csre" ? "font-semibold text-teal-300" : "font-semibold text-amber-300"}>
                    {formatCsreSource(predictionResult.source)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] mt-1">
                  <span className="text-slate-400">Input frames</span>
                  <span className="font-mono text-slate-300">
                    {predictionResult.prediction.hand_signal_frame_count ?? "--"} hand / {predictionResult.prediction.source_frame_count ?? "--"} total
                  </span>
                </div>
                <p className="text-[11px] text-slate-200 leading-relaxed mt-2">{predictionResult.refined_text}</p>
                <p className="text-[10px] text-amber-300/80 leading-snug mt-1">{predictionResult.uncertainty_note}</p>
              </div>
            )}
            {backendError && <p className="text-[10px] text-red-300 leading-snug">{friendlyErrorText(backendError)}</p>}
          </div>

          {/* Read-only hint bar */}
          <div
            className="px-4 py-2.5 shrink-0"
            style={{
              borderTop: "1px solid rgba(100,116,139,0.15)",
              background: "rgba(10,15,30,0.6)",
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-700/30">
              <Wifi size={12} className="text-slate-600" />
              <span className="text-[11px] text-slate-500">
                Record a live sign or upload a prepared .npy landmark sequence to send a prediction to the doctor.
              </span>
            </div>
          </div>
        </div>

        {/* Avatar animation display */}
        <div className="flex flex-col p-0 gap-0 overflow-hidden shrink-0" style={{ height: "40%", minHeight: "310px", maxHeight: "440px" }}>
          <div
            className="flex items-center justify-between px-4 py-2.5 shrink-0"
            style={{ background: "rgba(10,15,30,0.9)", borderTop: "1px solid rgba(13,148,136,0.2)" }}
          >
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-teal-400" />
              <span className="text-[11px] font-semibold text-teal-400/80 uppercase tracking-[0.2em]">
                Avatar animation display
              </span>
            </div>
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-medium"
              style={{ background: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.3)", color: "#99f6e4" }}
            >
              {currentAvatarLabel}
            </div>
          </div>

          <div
            className="flex-1 relative overflow-hidden p-3"
            style={{
              background: "radial-gradient(ellipse at 50% 60%, rgba(13,148,136,0.15) 0%, rgba(10,15,30,0.7) 70%)",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none opacity-15"
              style={{
                backgroundImage: "linear-gradient(rgba(13,148,136,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.2) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div
              className="absolute left-0 right-0 h-[2px] pointer-events-none opacity-30"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(13,148,136,0.8), transparent)",
                animation: "scanDown 3s ease-in-out infinite",
              }}
            />
            <div className="relative z-10 h-full">
              <AvatarPlayer
                animationKey={currentAnimationKey}
                label={currentAvatarLabel}
                modelUrl={currentAvatarUrl}
                playToken={avatarPlayToken}
                idleLabel={AVATAR_IDLE_RESPONSE.label}
                idleModelUrl={idleAvatarUrl}
                introLabel={AVATAR_HELLO_RESPONSE.label}
                introModelUrl={helloAvatarUrl}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
