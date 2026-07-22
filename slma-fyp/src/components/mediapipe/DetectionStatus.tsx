"use client";

interface DetectionStatusProps {
  isDetecting: boolean;
}

export default function DetectionStatus({ isDetecting }: DetectionStatusProps) {
  return (
    <div className="inline-flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-1.5 rounded-lg shadow-md">
      {isDetecting ? (
        <>
          {/* Pulsing green dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs font-semibold text-green-400">Detecting</span>
        </>
      ) : (
        <>
          {/* Static red dot */}
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="text-xs font-semibold text-red-400">Not Detecting</span>
        </>
      )}
    </div>
  );
}
