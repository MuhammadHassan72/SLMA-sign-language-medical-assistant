"use client";

interface RecordingIndicatorProps {
  isRecording: boolean;
  frameCount: number;
}

export default function RecordingIndicator({
  isRecording,
  frameCount,
}: RecordingIndicatorProps) {
  if (!isRecording) return null;

  return (
    <div className="inline-flex items-center gap-2 bg-red-950/90 backdrop-blur-sm border border-red-800/60 px-3 py-1.5 rounded-lg shadow-lg shadow-red-900/30">
      {/* Pulsing red circle */}
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
      </span>
      <span className="text-xs font-bold text-red-400 tracking-widest">REC</span>
      <span className="text-xs font-mono tabular-nums text-red-300 ml-0.5">
        {frameCount.toString().padStart(5, "0")}
      </span>
    </div>
  );
}
