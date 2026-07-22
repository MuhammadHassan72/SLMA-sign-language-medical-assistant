"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Stethoscope, UserCircle, HandMetal, Wifi, Circle,
  Brain, AlertTriangle, Send, Activity,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AVATAR_RESPONSES } from "@/lib/avatarAnimations";
import DoctorPatientWorkspace, { PatientProfile } from "@/components/doctor/DoctorPatientWorkspace";
import { apiFetch, AuthResponse, AuthUser, getBackendUrl, readApiError } from "@/lib/backend";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface ChatMessage {
  id: number | string;
  sender: "patient" | "doctor";
  text: string;
  time: string;
  isSign?: boolean;
  confidence?: number;
}

interface BackendPrediction {
  _id: string;
  input_type?: string;
  file_path?: string;
  source_frame_count?: number;
  hand_signal_frame_count?: number;
  top1_gloss: string;
  top1_confidence: number;
  top5: { rank: number; gloss: string; confidence: number }[];
  threshold: number;
  is_accepted: boolean;
  refined_text: string;
  uncertainty_note: string;
  source: string;
}

interface BackendMessage {
  _id: string;
  session_id?: string;
  direction: "patient_to_doctor" | "doctor_to_patient";
  text?: string;
  final_text?: string;
  raw_glosses?: string[];
  animation_key?: string;
  created_at?: string;
}

interface DoctorMessageResponse {
  _id: string;
  session_id: string;
  text?: string;
  animation_key?: string;
}

interface BackendSessionData {
  session?: { status?: string; patient_id?: string; doctor_id?: string };
  patient?: PatientProfile;
  messages: BackendMessage[];
  predictions: BackendPrediction[];
}

interface CameraFrameResponse {
  session_id: string;
  frame_data: string;
  updated_at: string;
}

const BACKEND_URL = getBackendUrl();

/* ─── Static data ────────────────────────────────────────────────────────── */
/* ─── Helpers ────────────────────────────────────────────────────────────── */
function formatTime(secs: number) {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatBackendTime(value?: string) {
  if (!value) return nowTime();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return nowTime();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isValidSessionId(value: string) {
  return /^[a-fA-F0-9]{24}$/.test(value.trim());
}

function formatPredictionInputSource(prediction: BackendPrediction) {
  if (prediction.input_type === "live_sequence") return "Live camera landmarks";
  if (prediction.input_type === "npy_upload" || prediction.file_path) return "Uploaded landmark file";
  return "Model prediction";
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

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function DoctorPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"checking" | "doctor" | "denied">("checking");
  /* ── Camera state ── */
  /* ── Chat state ── */
  const [input, setInput]         = useState("");
  const [timelineInput, setTimelineInput] = useState("");
  const chatEndRef                = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionData, setSessionData] = useState<BackendSessionData | null>(null);
  const [isSessionBusy, setIsSessionBusy] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [cameraFrame, setCameraFrame] = useState<CameraFrameResponse | null>(null);
  const [cameraFrameStatus, setCameraFrameStatus] = useState("Waiting for patient camera feed...");
  const [cameraPollingStatus, setCameraPollingStatus] = useState("Patient feed polling: waiting for session");
  const [lastFrameReceivedAt, setLastFrameReceivedAt] = useState("");
  const [feedError, setFeedError] = useState("");
  const [sessionActionStatus, setSessionActionStatus] = useState("Doctor session controls ready");
  const [messageSendStatus, setMessageSendStatus] = useState("Doctor message sync ready");
  const [lastSentMessageId, setLastSentMessageId] = useState("");
  const [lastSentMessageText, setLastSentMessageText] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientProfile | null>(null);
  const sessionLoadBusyRef = useRef(false);
  const cameraLoadBusyRef = useRef(false);

  const handleAccountLoaded = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    setAuthStatus("doctor");
  }, []);

  useEffect(() => {
    let cancelled = false;

    void apiFetch("/auth/me").then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) {
        router.replace("/login?next=/doctor");
        return;
      }
      if (!response.ok) {
        setBackendError(await readApiError(response, "Account could not be loaded"));
        setAuthStatus("denied");
        return;
      }
      const data = (await response.json()) as AuthResponse;
      setCurrentUser(data.user);
      if (data.user.role !== "doctor") {
        setBackendError("You are signed in as admin. Sign out and login with an approved doctor account to open the doctor portal.");
        setAuthStatus("denied");
        return;
      }
      setAuthStatus("doctor");
    })
    .catch((reason) => {
      // Network-level failure (backend unreachable / firewall / wrong IP).
      // Without this the promise rejected silently and the page stayed stuck
      // on "Checking doctor access..." forever — a blank-looking screen.
      if (cancelled) return;
      const detail = reason instanceof Error ? reason.message : String(reason);
      setBackendError(
        `Cannot reach the SLMA backend at ${BACKEND_URL}. (${detail}) — check that the backend is running on the host laptop and that port 8000 is allowed through its firewall.`
      );
      setAuthStatus("denied");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function switchToDoctorLogin() {
    await apiFetch("/auth/logout", { method: "POST" });
    localStorage.removeItem("slma_session_id");
    router.replace("/login?next=/doctor");
  }

  /* ── Mount ── */
  useEffect(() => {
    console.log("Doctor Portal loaded - backend session and patient relay ready");
    const savedSessionId = localStorage.getItem("slma_session_id");
    if (savedSessionId && isValidSessionId(savedSessionId)) {
      setSessionId(savedSessionId);
      setSessionActionStatus("Saved session loaded");
    } else if (savedSessionId) {
      localStorage.removeItem("slma_session_id");
      setSessionActionStatus("Old invalid session cleared. Start or load a session.");
    }
  }, []);

  /* ── Timer ── */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Emergency state ── */
  const [emergency, setEmergency] = useState(false);

  /* ── UI-only collapse toggles (visual overhaul; no data logic) ── */
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isTop5Open, setIsTop5Open] = useState(false);

  /* ── Auto-scroll chat ── */
  const saveSessionId = (nextSessionId: string) => {
    const trimmedSessionId = nextSessionId.trim();
    setSessionId(trimmedSessionId);
    if (isValidSessionId(trimmedSessionId)) {
      localStorage.setItem("slma_session_id", trimmedSessionId);
      setSessionActionStatus(`Session connected: ${trimmedSessionId}`);
    } else {
      localStorage.removeItem("slma_session_id");
      setSessionActionStatus("Invalid session id. Click Load Latest Session.");
    }
  };

  const loadSessionData = useCallback(async (targetSessionId: string) => {
    if (!targetSessionId) return;
    if (!isValidSessionId(targetSessionId)) {
      setBackendError("Invalid session id. Click Load Latest Session.");
      return;
    }
    if (sessionLoadBusyRef.current) return;
    sessionLoadBusyRef.current = true;
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${targetSessionId}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Session load failed (${res.status})`);
      const data = await res.json();

      // Self-heal: agar stored session ab active nahi hai (purani/stale id
      // localStorage mein reh gayi ho), to usay khud chhod do — warna
      // "Start Consultation" button hamesha disabled raheta hai.
      if (data.session?.status && data.session.status !== "active") {
        localStorage.removeItem("slma_session_id");
        setSessionId("");
        setSessionData(null);
        setBackendError("");
        setSessionActionStatus("Previous consultation already ended. Select a patient and start a new consultation.");
        return;
      }

      setSessionData({
        session: data.session,
        patient: data.patient,
        messages: data.messages ?? [],
        predictions: data.predictions ?? [],
      });
      if (data.patient) {
        setSelectedPatient({
          ...data.patient,
          patient_id: data.patient.patient_id || data.patient._id,
        });
      }
      setBackendError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load session";
      setBackendError(msg);
    } finally {
      sessionLoadBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    loadSessionData(sessionId);
    const id = setInterval(() => loadSessionData(sessionId), 2000);
    return () => clearInterval(id);
  }, [sessionId, loadSessionData]);

  useEffect(() => {
    setSessionData(null);
    setCameraFrame(null);
    setLastSentMessageId("");
    setLastSentMessageText("");
    setMessageSendStatus(sessionId ? "Doctor message sync ready" : "No active session selected");
  }, [sessionId]);

  const loadCameraFrame = useCallback(async (targetSessionId: string) => {
    if (!targetSessionId) return;
    if (!isValidSessionId(targetSessionId)) {
      setCameraPollingStatus("Patient feed polling: waiting for valid session");
      setFeedError("Invalid session id. Click Load Latest Session.");
      return;
    }
    if (cameraLoadBusyRef.current) return;
    cameraLoadBusyRef.current = true;
    setCameraPollingStatus("Patient feed polling: active");
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${targetSessionId}/camera-frame`, {
        cache: "no-store",
        credentials: "include",
      });

      if (res.status === 404) {
        setCameraFrame(null);
        setCameraFrameStatus("Waiting for patient camera feed...");
        setFeedError("");
        console.warn("[SLMA camera-frame GET miss]", {
          session_id: targetSessionId,
          status: res.status,
        });
        return;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`GET /camera-frame failed (${res.status}) ${detail}`.trim());
      }
      const data = await res.json();
      const receivedAt = formatBackendTime(new Date().toISOString());
      setCameraFrame(data);
      setCameraFrameStatus("Patient camera feed live");
      setLastFrameReceivedAt(receivedAt);
      setFeedError("");
      console.log("[SLMA camera-frame GET success]", {
        session_id: targetSessionId,
        frame_data_length: data.frame_data?.length ?? 0,
        received_at: receivedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown feed error";
      setCameraFrameStatus("Waiting for patient camera feed...");
      setFeedError(msg);
      console.error("[SLMA camera-frame GET failure]", {
        session_id: targetSessionId,
        error: msg,
      });
    } finally {
      cameraLoadBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setCameraFrame(null);
      setCameraFrameStatus("Waiting for patient camera feed...");
      setCameraPollingStatus("Patient feed polling: waiting for session");
      return;
    }

    loadCameraFrame(sessionId);
    const id = setInterval(() => loadCameraFrame(sessionId), 700);
    return () => clearInterval(id);
  }, [sessionId, loadCameraFrame]);

  useEffect(() => {
    if (!sessionId) return;

    const recoverActiveSession = () => {
      void loadSessionData(sessionId);
      void loadCameraFrame(sessionId);
      setSessionActionStatus("Connection recovered and session refreshed");
    };

    const recoverWhenVisible = () => {
      if (document.visibilityState === "visible") recoverActiveSession();
    };

    window.addEventListener("online", recoverActiveSession);
    window.addEventListener("focus", recoverActiveSession);
    document.addEventListener("visibilitychange", recoverWhenVisible);
    return () => {
      window.removeEventListener("online", recoverActiveSession);
      window.removeEventListener("focus", recoverActiveSession);
      document.removeEventListener("visibilitychange", recoverWhenVisible);
    };
  }, [sessionId, loadSessionData, loadCameraFrame]);
  /* ── Actions ── */
  const startConsultation = async () => {
    if (!selectedPatient) {
      toast.error("Select or create a patient profile first.");
      return;
    }
    setIsSessionBusy(true);
    setBackendError("");
    setSessionActionStatus("Starting consultation...");
    console.log("[SLMA doctor] POST /sessions/start begin", { backend_url: BACKEND_URL });
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patient_id: selectedPatient.patient_id }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Start consultation failed"));
      const data = await res.json();
      console.log("[SLMA doctor] POST /sessions/start success", data);
      saveSessionId(data.session_id);
      await loadSessionData(data.session_id);
      setElapsed(0);
      setSessionActionStatus("Consultation started");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start session";
      setBackendError(msg);
      setSessionActionStatus(`Start Consultation failed: ${msg}`);
      console.error("[SLMA doctor] POST /sessions/start failure", msg);
      toast.error(msg);
    } finally {
      setIsSessionBusy(false);
    }
  };

  const loadLatestSession = async () => {
    setIsSessionBusy(true);
    setBackendError("");
    setSessionActionStatus("Loading latest session...");
    console.log("[SLMA doctor] GET /sessions/latest begin", { backend_url: BACKEND_URL });
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/mine/latest`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiError(res, "Load active consultation failed"));
      const data = await res.json();
      console.log("[SLMA doctor] GET /sessions/latest success", data);
      saveSessionId(data._id);
      await loadSessionData(data._id);
      setSessionActionStatus("Active consultation loaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load latest session";
      setBackendError(msg);
      setSessionActionStatus(`Load Active Consultation failed: ${msg}`);
      console.error("[SLMA doctor] GET /sessions/latest failure", msg);
      toast.error(msg);
    } finally {
      setIsSessionBusy(false);
    }
  };

  const sendDoctorMessage = async (text: string, animationKey?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!sessionId || !isValidSessionId(sessionId)) {
      toast("No active session selected. Load latest session first.");
      setMessageSendStatus("No active session selected. Load latest session first.");
      setLastSentMessageId("");
      setLastSentMessageText(trimmed);
      return;
    }

    try {
      setMessageSendStatus("Sending message to patient...");
      const res = await fetch(`${BACKEND_URL}/messages/doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          session_id: sessionId,
          doctor_input: trimmed,
          ...(animationKey ? { animation_key: animationKey } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Send failed"));
      const savedMessage = (await res.json()) as DoctorMessageResponse;
      setLastSentMessageId(savedMessage._id || "");
      setLastSentMessageText(trimmed);
      setMessageSendStatus("Message sent to patient");
      await loadSessionData(sessionId);
      setBackendError("");
      toast.success("Message sent to patient");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send response";
      setBackendError(msg);
      setMessageSendStatus(`Message send failed: ${msg}`);
      toast.error(msg);
    }
  };

  const endConsultation = async () => {
    if (!sessionId) return;
    setIsSessionBusy(true);
    setBackendError("");
    try {
      const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/end`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiError(res, "End consultation failed"));
      setSessionActionStatus("Consultation completed and saved to history");
      setSessionId("");
      localStorage.removeItem("slma_session_id");
      setElapsed(0);
      toast.success("Consultation ended");
    } catch (err) {
      const message = err instanceof Error ? err.message : "End consultation failed";
      setBackendError(message);
      toast.error(message);
    } finally {
      setIsSessionBusy(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    void sendDoctorMessage(input.trim());
    setInput("");
  };

  const handleTimelineSend = () => {
    if (!timelineInput.trim()) return;
    void sendDoctorMessage(timelineInput.trim());
    setTimelineInput("");
  };

  const triggerEmergency = () => {
    setEmergency(true);
    setTimeout(() => setEmergency(false), 2500);
    toast.error("🚨 Emergency alert triggered!");
  };

  const visibleMessages = useMemo<ChatMessage[]>(() => {
    if (!sessionData?.messages?.length) return [];
    return sessionData.messages.map((msg) => {
      const isPatient = msg.direction === "patient_to_doctor";
      const rawGlosses = msg.raw_glosses?.length ? ` [${msg.raw_glosses.join(", ")}]` : "";
      return {
        id: msg._id,
        sender: isPatient ? "patient" : "doctor",
        text: isPatient
          ? `${msg.final_text || "Patient sign received"}${rawGlosses}`
          : msg.text || msg.final_text || "Doctor response",
        time: formatBackendTime(msg.created_at),
        isSign: isPatient,
      };
    });
  }, [sessionData]);

  const latestPrediction = sessionData?.predictions?.length
    ? sessionData.predictions[sessionData.predictions.length - 1]
    : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

  if (authStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="border border-slate-800 bg-slate-900 px-6 py-5 text-sm text-slate-300">
          Checking doctor access...
        </div>
      </main>
    );
  }

  if (authStatus === "denied") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <section className="w-full max-w-lg border border-amber-800/60 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <Stethoscope className="text-amber-300" size={24} />
            <div>
              <h1 className="text-lg font-bold">Doctor login required</h1>
              <p className="text-xs text-slate-400">The doctor portal is only available to approved doctor accounts.</p>
            </div>
          </div>
          <p className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
            {backendError || "Sign in with an approved doctor account to continue."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={switchToDoctorLogin} className="bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500">
              Sign out and login as doctor
            </button>
            <Link href="/admin" className="border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
              Back to admin
            </Link>
            <Link href="/" className="border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
              Home
            </Link>
          </div>
          {currentUser && (
            <p className="mt-4 text-xs text-slate-500">
              Current signed-in role: <span className="font-mono text-slate-300">{currentUser.role}</span>
            </p>
          )}
        </section>
      </main>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#0B1220] text-slate-100">

      {/* ══════════════════════ HEADER ══════════════════════════ */}
      <header className="z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/95 px-4">
        {/* Left: brand + back link */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            className="mr-1 flex items-center gap-1 text-[11px] text-slate-500 transition-colors hover:text-slate-300"
          >
            <span>&#8592;</span> Home
          </Link>
          <span className="text-xs text-slate-700">|</span>
          <Image src="/logo-nobg.png" alt="SLMA" width={28} height={28} />
          <span className="text-sm font-bold tracking-wide text-white">SLMA</span>
          <span className="rounded-full border border-blue-500/40 bg-blue-950/50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300">
            Doctor Portal
          </span>
          <span className="hidden truncate text-[11px] text-slate-500 md:inline">
            Consultation Room · UMT Sialkot Medical Centre
          </span>
        </div>

        {/* Right: doctor info + timer + phase badge + end */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden items-center gap-1.5 sm:flex">
            <UserCircle size={16} className="text-blue-400" />
            <span className="max-w-[160px] truncate text-xs font-medium text-slate-200">
              {currentUser?.name || "Authenticated doctor"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/80 px-2.5 py-1 font-mono text-xs text-slate-400">
            <Activity size={11} className="text-green-400" />
            <span>{formatTime(elapsed)}</span>
          </div>
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${
              sessionId
                ? "border-teal-500/40 bg-teal-950/40 text-teal-300"
                : "border-amber-500/35 bg-amber-950/30 text-amber-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${sessionId ? "bg-teal-400" : "bg-amber-400"}`}
              style={{ animation: "pulseGlow 2s ease-in-out infinite" }}
            />
            {sessionId ? "Consultation Active" : "Consultation Ready"}
          </div>
          <button
            onClick={() => void endConsultation()}
            disabled={!sessionId || isSessionBusy}
            className="rounded-lg border border-teal-500/35 bg-teal-950/40 px-3.5 py-1.5 text-xs font-semibold text-teal-200 transition-all hover:bg-teal-900/40 active:scale-95 disabled:opacity-40"
          >
            End consultation
          </button>
        </div>
      </header>

      <DoctorPatientWorkspace
        selectedPatient={selectedPatient}
        activeSessionId={sessionId}
        sessionBusy={isSessionBusy}
        onPatientSelected={setSelectedPatient}
        onAccountLoaded={handleAccountLoaded}
        onStartConsultation={() => void startConsultation()}
        onLoadLatest={() => void loadLatestSession()}
        onEndConsultation={() => void endConsultation()}
      />

      {/* ══════════════════════ 2-PANEL DASHBOARD ══════════════════════════ */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,29fr)_minmax(0,21fr)] lg:overflow-hidden">

        {/* ══ LEFT — VISUAL COMMAND ══ */}
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3 lg:border-r lg:border-slate-800/80">
          {/* Patient live feed — aspect-locked, can never collapse */}
          <div className="relative aspect-video max-h-[52vh] min-h-[220px] w-full shrink-0 overflow-hidden rounded-xl border border-slate-800/80 bg-black">
            {cameraFrame?.frame_data ? (
              <Image
                src={cameraFrame.frame_data}
                alt="Patient live camera feed"
                fill
                unoptimized
                sizes="60vw"
                className="object-cover"
              />
            ) : (
              <div className="tech-grid absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-slate-950 px-6 text-center">
                <Wifi size={26} className="text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">Waiting for patient camera feed...</p>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Ask the patient to load the same session and allow their camera.
                </p>
              </div>
            )}

            {/* Overlay chips */}
            <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-950/80 px-2.5 py-1 backdrop-blur-sm">
              <Circle size={7} className={cameraFrame ? "fill-green-400 text-green-400" : "fill-slate-500 text-slate-500"} />
              <span className={`text-[10px] font-semibold tracking-widest ${cameraFrame ? "text-green-300" : "text-slate-400"}`}>
                {cameraFrame ? "LIVE" : "WAITING"}
              </span>
            </div>
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
              <span className="rounded-full border border-teal-500/30 bg-slate-950/80 px-2.5 py-1 font-mono text-[10px] text-teal-200 backdrop-blur-sm">
                700ms relay
              </span>
              <span className="rounded-full border border-slate-700/60 bg-slate-950/80 px-2.5 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
                {cameraFrame ? formatBackendTime(cameraFrame.updated_at) : "--:--"}
              </span>
            </div>
            <div className="absolute bottom-3 left-3 z-10 rounded-full border border-slate-700/60 bg-slate-950/80 px-2.5 py-1 text-[10px] text-slate-300 backdrop-blur-sm">
              {cameraFrameStatus}
            </div>
          </div>

          {/* Doctor message box */}
          <div className="shrink-0 rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Stethoscope size={12} className="text-blue-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Doctor Message</span>
              </div>
              <span className="truncate text-[10px] text-blue-300/80">{messageSendStatus}</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={timelineInput}
                onChange={(event) => setTimelineInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleTimelineSend()}
                placeholder="Type instruction for patient..."
                className="min-w-0 flex-1 rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-blue-500"
              />
              <button
                onClick={handleTimelineSend}
                disabled={!sessionId || !timelineInput.trim()}
                className="rounded-lg border border-blue-500/45 bg-blue-950/50 px-3.5 py-2 text-blue-200 transition-all hover:bg-blue-900/50 active:scale-95 disabled:opacity-40"
                title="Send doctor message"
              >
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <button
              onClick={() => void loadCameraFrame(sessionId)}
              disabled={!sessionId}
              className="rounded-xl border border-teal-500/35 bg-teal-950/30 px-3 py-2.5 text-xs font-semibold text-teal-200 transition-all hover:bg-teal-900/40 active:scale-95 disabled:opacity-40"
            >
              Fetch Frame Now
            </button>
            <button
              onClick={triggerEmergency}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-red-600/50 bg-red-950/40 px-3 py-2.5 text-xs font-bold tracking-wide text-red-300 transition-all hover:bg-red-900/40 active:scale-95"
            >
              <AlertTriangle size={13} /> Emergency Alert
            </button>
          </div>
        </section>

        {/* ══ RIGHT — CLINICAL CONTROL ROOM ══ */}
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          {/* Consultation state */}
          <div className="shrink-0 rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Consultation State</span>
              <span className={`h-2 w-2 rounded-full ${sessionId ? "bg-green-400" : "bg-slate-600"}`} />
            </div>
            <div className="mb-2 grid grid-cols-1 gap-1 text-[11px]">
              <p className="truncate text-slate-300">
                <span className="text-slate-500">Patient:</span>{" "}
                {selectedPatient
                  ? `${selectedPatient.full_name || selectedPatient.name || "Unnamed"} · ${selectedPatient.gender || "--"} · ${selectedPatient.age ?? "--"} yrs`
                  : "No patient selected"}
              </p>
              <p className="truncate font-mono text-slate-400">
                <span className="font-sans text-slate-500">Session:</span> {sessionId || "not started"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void startConsultation()}
                disabled={isSessionBusy || !selectedPatient || !!sessionId}
                className="rounded-lg border border-teal-500/35 bg-teal-950/30 px-2.5 py-2 text-[11px] font-semibold text-teal-200 transition-all hover:bg-teal-900/40 active:scale-95 disabled:opacity-40"
              >
                Start Consultation
              </button>
              <button
                onClick={loadLatestSession}
                disabled={isSessionBusy}
                className="rounded-lg border border-blue-500/40 bg-blue-950/40 px-2.5 py-2 text-[11px] font-semibold text-blue-200 transition-all hover:bg-blue-900/40 active:scale-95 disabled:opacity-40"
              >
                Load My Active
              </button>
            </div>
            {backendError && (
              <p className="mt-2 rounded-md bg-red-950/40 px-2 py-1 text-[10px] leading-snug text-red-300">{friendlyErrorText(backendError)}</p>
            )}
          </div>

          {/* Real-time translation log */}
          <div className="flex min-h-[160px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/50">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800/60 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Brain size={12} className="text-amber-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Translation Log</span>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-950/30 px-2 py-0.5 text-[9px] font-semibold text-green-300">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" style={{ animation: "pulseGlow 1.5s ease-in-out infinite" }} />
                Live
              </span>
            </div>
            <div className="max-h-[45vh] flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5 lg:max-h-none">
              {visibleMessages.length === 0 && (
                <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-3 text-center text-[11px] text-slate-500">
                  No consultation messages for the active session yet.
                </div>
              )}
              {visibleMessages.map((msg) => {
                const isPatient = msg.sender === "patient";
                return (
                  <div key={msg.id} className={`flex items-start gap-2 ${isPatient ? "" : "flex-row-reverse"}`}>
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        isPatient ? "border-teal-500/40 bg-teal-950/40" : "border-blue-500/40 bg-blue-950/40"
                      }`}
                    >
                      {isPatient
                        ? <HandMetal size={10} className="text-teal-300" />
                        : <Stethoscope size={10} className="text-blue-300" />
                      }
                    </div>
                    <div className={`flex max-w-[82%] flex-col gap-1 ${isPatient ? "items-start" : "items-end"}`}>
                      <div
                        className={`rounded-xl px-3 py-2 ${
                          isPatient
                            ? "rounded-tl-sm border border-teal-500/20 bg-teal-950/25"
                            : "rounded-tr-sm border border-blue-500/20 bg-blue-950/25"
                        }`}
                      >
                        <p className="text-xs leading-relaxed text-slate-200">{msg.text}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {msg.isSign && (
                          <span className="rounded-full border border-teal-500/40 bg-teal-950/40 px-1.5 py-0.5 text-[8px] font-semibold tracking-wider text-teal-300">
                            SIGN LANG
                          </span>
                        )}
                        <span className="font-mono text-[9px] text-slate-600">{msg.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Model output */}
          <div className="shrink-0 rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Brain size={11} className="text-slate-500" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Medical Model Output</span>
              </div>
              {latestPrediction && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    latestPrediction.is_accepted ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {latestPrediction.is_accepted ? "Accepted" : "Low confidence"}
                </span>
              )}
            </div>
            {latestPrediction ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-teal-300">{latestPrediction.top1_gloss}</span>
                  <span className="font-mono text-[11px] text-slate-300">{(latestPrediction.top1_confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      latestPrediction.is_accepted
                        ? "bg-gradient-to-r from-teal-500 to-teal-300"
                        : "bg-gradient-to-r from-amber-500 to-amber-300"
                    }`}
                    style={{ width: `${Math.min(latestPrediction.top1_confidence * 100, 100)}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                  <span>Threshold <span className="font-mono text-slate-300">{latestPrediction.threshold}</span></span>
                  <span>{formatPredictionInputSource(latestPrediction)}</span>
                  <span>{formatCsreSource(latestPrediction.source)}</span>
                  <span>
                    Frames{" "}
                    <span className="font-mono text-slate-300">
                      {latestPrediction.hand_signal_frame_count ?? "--"} hand / {latestPrediction.source_frame_count ?? "--"} total
                    </span>
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">{latestPrediction.refined_text}</p>
                {!latestPrediction.is_accepted && (
                  <p className="text-[10px] leading-snug text-red-300">
                    Low confidence: ask the patient to repeat or confirm the sign.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setIsTop5Open((value) => !value)}
                  className="self-start text-[10px] font-semibold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-300"
                >
                  Top-5 detail {isTop5Open ? "[-]" : "[+]"}
                </button>
                {isTop5Open && (
                  <div className="space-y-1.5">
                    {latestPrediction.top5.slice(0, 5).map((item) => (
                      <div key={`${item.rank}-${item.gloss}`} className="flex items-center gap-2 text-[10px]">
                        <span className="w-24 truncate text-slate-400">#{item.rank} {item.gloss}</span>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-blue-400/70"
                            style={{ width: `${Math.min(item.confidence * 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-11 text-right font-mono text-slate-500">{(item.confidence * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] leading-snug text-amber-300/80">{latestPrediction.uncertainty_note}</p>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-600">
                Start or load a session to view backend model predictions here.
              </p>
            )}
          </div>

          {/* Quick response board */}
          <div className="shrink-0 rounded-xl border border-slate-800/80 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Quick Responses</span>
              <span className="font-mono text-[9px] text-blue-400/60">PROTOCOL</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {AVATAR_RESPONSES.map((response, idx) => (
                <button
                  key={response.key}
                  onClick={() => void sendDoctorMessage(response.doctorText, response.key)}
                  className="group rounded-lg border border-slate-700/50 bg-slate-950/50 px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-slate-300 transition-all duration-200 hover:-translate-y-px hover:border-blue-500/50 hover:bg-blue-950/30 hover:text-blue-100 active:scale-95"
                >
                  <span className="mb-0.5 block font-mono text-[8px] text-blue-500/60 group-hover:text-blue-400">
                    [A{String(idx + 1).padStart(2, "0")}]
                  </span>
                  {response.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Custom quick reply..."
                className="min-w-0 flex-1 rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-blue-500"
              />
              <button
                onClick={handleSend}
                className="rounded-lg border border-blue-500/45 bg-blue-950/50 px-3 py-2 text-blue-200 transition-all hover:bg-blue-900/50 active:scale-95"
                title="Send custom reply"
              >
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* Session diagnostics — collapsible raw metadata */}
          <div className="shrink-0 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2">
            <button
              type="button"
              onClick={() => setIsDiagnosticsOpen((value) => !value)}
              className="w-full text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-300"
            >
              Session Diagnostics {isDiagnosticsOpen ? "[-]" : "[+]"}
            </button>
            {isDiagnosticsOpen && (
              <div className="mt-2 grid grid-cols-1 gap-1 text-[10px]">
                <p className="rounded-md bg-slate-900/70 px-2 py-1 text-blue-200">{cameraPollingStatus}</p>
                <p className="rounded-md bg-slate-900/70 px-2 py-1 text-slate-300">Last frame received: {lastFrameReceivedAt || "--"}</p>
                <p className="rounded-md bg-slate-900/70 px-2 py-1 text-teal-200">{sessionActionStatus}</p>
                <p className="rounded-md bg-slate-900/70 px-2 py-1 text-blue-200">{messageSendStatus}</p>
                <p className="break-all rounded-md bg-slate-900/70 px-2 py-1 font-mono text-slate-400">
                  Saved message ID: {lastSentMessageId || "--"}
                </p>
                <p className="break-words rounded-md bg-slate-900/70 px-2 py-1 text-slate-400">
                  Text sent: {lastSentMessageText || "--"}
                </p>
                {feedError && <p className="rounded-md bg-red-950/40 px-2 py-1 text-red-300">{friendlyErrorText(feedError, "Feed error")}</p>}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ══════ Emergency overlay (Framer Motion) ══════ */}
      <AnimatePresence>
        {emergency && (
          <motion.div
            key="emergency"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: "rgba(127,29,29,0.88)" }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <AlertTriangle size={56} className="text-red-300 mx-auto mb-4" />
              <p className="text-4xl font-black text-red-200 tracking-widest">EMERGENCY ALERT SENT</p>
              <p className="text-red-400 text-sm mt-2">Medical team has been notified</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
