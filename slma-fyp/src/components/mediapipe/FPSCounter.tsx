"use client";

interface FPSCounterProps {
  fps: number;
}

export default function FPSCounter({ fps }: FPSCounterProps) {
  const color =
    fps >= 25
      ? "bg-green-500/90 text-green-50 shadow-green-900/40"
      : fps >= 15
      ? "bg-yellow-500/90 text-yellow-50 shadow-yellow-900/40"
      : "bg-red-500/90 text-red-50 shadow-red-900/40";

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums shadow-md backdrop-blur-sm ${color}`}
      title="Frames per second"
    >
      <span className="text-[10px] font-semibold opacity-80">FPS</span>
      <span>{fps}</span>
    </div>
  );
}
