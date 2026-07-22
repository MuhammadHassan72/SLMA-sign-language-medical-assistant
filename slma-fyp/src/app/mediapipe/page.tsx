"use client";

import { useState, useCallback } from "react";
import MediaPipeCamera from "@/components/mediapipe/MediaPipeCamera";
import type { LandmarkData } from "@/components/mediapipe/MediaPipeCamera";
import Link from "next/link";
import { ArrowLeft, FlipHorizontal, Activity } from "lucide-react";

export default function MediaPipeTestPage() {
  const [mirrored, setMirrored] = useState(true);
  const [showFace, setShowFace] = useState(false);
  const [lastLandmarks, setLastLandmarks] = useState<LandmarkData | null>(null);

  const handleLandmarks = useCallback((data: LandmarkData) => {
    setLastLandmarks(data);
  }, []);

  return (
    <main className="min-h-screen bg-background text-slate-100 p-6">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            MediaPipe Holistic — Live Test
          </h1>
        </div>
        <p className="text-slate-400 text-sm ml-12">
          Real-time hand, pose, and face landmark detection via webcam.
          Open your browser console to see captured landmark logs.
        </p>
      </div>

      {/* Controls */}
      <div className="max-w-4xl mx-auto mb-5 flex flex-wrap gap-3">
        <button
          onClick={() => setMirrored((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            mirrored
              ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          <FlipHorizontal className="w-4 h-4" />
          Mirror {mirrored ? "ON" : "OFF"}
        </button>

        <button
          onClick={() => setShowFace((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            showFace
              ? "bg-red-500/20 border-red-500/40 text-red-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          Face Mesh {showFace ? "ON" : "OFF"}
        </button>
      </div>

      {/* Camera */}
      <div className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-6">
        <div className="flex-shrink-0 flex justify-center">
          <MediaPipeCamera
            width={640}
            height={480}
            mirrored={mirrored}
            showFace={showFace}
            onLandmarks={handleLandmarks}
          />
        </div>

        {/* Landmark debug panel */}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Latest Frame Data
          </h2>
          <div className="bg-surface border border-slate-700 rounded-2xl p-4 font-mono text-xs space-y-3">
            {lastLandmarks ? (
              <>
                <LandmarkRow label="Left Hand" landmarks={lastLandmarks.leftHand} expected={21} color="text-green-400" />
                <LandmarkRow label="Right Hand" landmarks={lastLandmarks.rightHand} expected={21} color="text-green-400" />
                <LandmarkRow label="Pose" landmarks={lastLandmarks.pose} expected={33} color="text-blue-400" />
                <LandmarkRow label="Face" landmarks={lastLandmarks.face} expected={468} color="text-red-400" />
                <div className="border-t border-slate-700 pt-2 text-slate-500 text-[10px]">
                  ts: {new Date(lastLandmarks.timestamp).toISOString()}
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-center py-8">
                Waiting for landmark data…
              </p>
            )}
          </div>

          <div className="mt-4 bg-surface border border-slate-700 rounded-2xl p-4 text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-2">Legend</p>
            <ul className="space-y-1">
              <li><span className="text-green-400 font-bold">■</span> Green — Hand landmarks (left &amp; right)</li>
              <li><span className="text-blue-400 font-bold">■</span> Blue — Pose landmarks (33 points)</li>
              <li><span className="text-red-400 font-bold">■</span> Red (0.3 opacity) — Face mesh (468 points)</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Helper sub-component ──────────────────────────────────────────────────
function LandmarkRow({
  label,
  landmarks,
  expected,
  color,
}: {
  label: string;
  landmarks: { x: number; y: number; z: number }[] | null;
  expected: number;
  color: string;
}) {
  const count = landmarks?.length ?? 0;
  const detected = count > 0;

  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`${color} font-semibold w-24`}>{label}</span>
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${detected ? color.replace("text-", "bg-") : "bg-slate-700"} transition-all duration-200`}
            style={{ width: `${(count / expected) * 100}%` }}
          />
        </div>
        <span className="text-slate-300 tabular-nums w-16 text-right">
          {count}/{expected}
        </span>
      </div>
      <span className={detected ? "text-green-500" : "text-slate-600"}>
        {detected ? "✓" : "–"}
      </span>
    </div>
  );
}
