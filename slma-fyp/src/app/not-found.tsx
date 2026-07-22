"use client";

import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
      style={{ background: "#0A0F1E", color: "#F1F5F9" }}
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(13,148,136,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.2) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md">
        {/* Logo */}
        <Image src="/logo-nobg.png" alt="SLMA" width={64} height={64} className="opacity-80" />

        {/* 404 number */}
        <div className="flex items-center gap-3">
          <div className="h-px w-12 bg-teal-500/40" />
          <span
            className="text-[80px] font-black leading-none tabular-nums"
            style={{
              background: "linear-gradient(135deg, #0D9488, #1E40AF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            404
          </span>
          <div className="h-px w-12 bg-teal-500/40" />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-100">Page Not Found</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        {/* Error code badge */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono"
          style={{
            background: "rgba(220,38,38,0.1)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "#fca5a5",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          ERROR 404 — ROUTE_NOT_FOUND
        </div>

        {/* Back home button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[0_0_24px_rgba(13,148,136,0.4)]"
          style={{
            background: "linear-gradient(135deg, #0D9488, #0F766E)",
            color: "#fff",
            border: "1px solid rgba(13,148,136,0.5)",
          }}
        >
          <span>&#8592;</span>
          Go Back Home
        </Link>

        {/* Quick links */}
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <Link href="/doctor" className="hover:text-blue-400 transition-colors">Doctor Portal</Link>
          <span>&middot;</span>
          <Link href="/patient" className="hover:text-teal-400 transition-colors">Patient Portal</Link>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-slate-700 mt-2">
          SLMA &mdash; Sign Language Medical Assistant &middot; UMT Sialkot
        </p>
      </div>
    </div>
  );
}
