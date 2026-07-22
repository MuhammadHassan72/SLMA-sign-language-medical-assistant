"use client";

const MODEL_SELECTED_LANDMARKS = 113;
const MODEL_FEATURES = 339;

interface LandmarkCounterProps {
  detected: number;
}

export default function LandmarkCounter({ detected }: LandmarkCounterProps) {
  const hasLandmarks = detected > 0;
  const pct = hasLandmarks ? 100 : 0;

  const barColor =
    pct > 60
      ? "bg-green-500"
      : pct > 30
      ? "bg-yellow-500"
      : pct > 0
      ? "bg-blue-500"
      : "bg-slate-600";

  return (
    <div className="flex flex-col gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-2 rounded-lg shadow-md min-w-[140px]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
          Model Layout
        </span>
        <span className="text-xs font-bold text-slate-200 tabular-nums">
          {hasLandmarks ? MODEL_SELECTED_LANDMARKS : 0}
          <span className="text-slate-500 font-normal">/{MODEL_SELECTED_LANDMARKS}</span>
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[9px] text-slate-500">{MODEL_FEATURES} model features</p>
    </div>
  );
}
