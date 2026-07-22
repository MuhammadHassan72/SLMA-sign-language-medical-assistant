"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  Brain,
  Code2,
  Heart,
  Server,
  Stethoscope,
  Users,
  Zap,
  Shield,
  Cpu,
  Radio,
} from "lucide-react";

// â”€â”€ Animation variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fadeUp = (delay = 0) => ({
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const, delay },
  },
});

const fadeIn = (delay = 0) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, delay } },
});

// â”€â”€ Tech stack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const techStack = [
  { name: "Next.js 14",  icon: <Code2 className="w-4 h-4" />,    color: "border-slate-500   text-slate-300" },
  { name: "MediaPipe",   icon: <Activity className="w-4 h-4" />, color: "border-green-600   text-green-400" },
  { name: "TensorFlow",  icon: <Brain className="w-4 h-4" />,    color: "border-orange-600  text-orange-400" },
  { name: "FastAPI",     icon: <Server className="w-4 h-4" />,   color: "border-teal-600    text-teal-400" },
  { name: "REST Polling", icon: <Radio className="w-4 h-4" />,   color: "border-blue-600    text-blue-400" },
  { name: "TCN + BiLSTM", icon: <Cpu className="w-4 h-4" />,     color: "border-purple-600  text-purple-400" },
];

// â”€â”€ Feature cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const features = [
  {
    icon: <Zap className="w-6 h-6" />,
    color: "text-amber-400",
    glow: "shadow-amber-900/30",
    border: "border-amber-800/40",
    title: "Bidirectional Consultation",
    desc: "Sign-to-text predictions and doctor replies relayed over lightweight REST polling — no WebSocket or Redis infrastructure.",
    tag: "// REST POLLING",
  },
  {
    icon: <Heart className="w-6 h-6" />,
    color: "text-red-400",
    glow: "shadow-red-900/30",
    border: "border-red-800/40",
    title: "Medical Context-Aware",
    desc: "The CSRE engine refines top-5 gloss candidates into cautious clinical sentences, with a safe local fallback.",
    tag: "// CSRE ENGINE",
  },
  {
    icon: <Stethoscope className="w-6 h-6" />,
    color: "text-teal-400",
    glow: "shadow-teal-900/30",
    border: "border-teal-800/40",
    title: "Doctor & Patient Portals",
    desc: "Separate dedicated dashboards for healthcare professionals and patients.",
    tag: "// DUAL PORTAL",
  },
  {
    icon: <Users className="w-6 h-6" />,
    color: "text-blue-400",
    glow: "shadow-blue-900/30",
    border: "border-blue-800/40",
    title: "70 Million Users Worldwide",
    desc: "Serving the global deaf community — with special focus on Pakistan’s 10M deaf individuals.",
    tag: "// GLOBAL IMPACT",
  },
];

// â”€â”€ System status items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const sysStatus = [
  { label: "MediaPipe Engine",  status: "ONLINE"  },
  { label: "REST Relay",        status: "ONLINE"  },
  { label: "Keras Classifier",  status: "ONLINE"  },
  { label: "CSRE Refinement",   status: "ONLINE"  },
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ── SLMA Brand Logo (original SVG: hand + circuits + ECG + medical cross) ───
function SLMALogo({ size = 200 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="slma-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="slma-glow-strong" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="slma-hand" x1="60" y1="55" x2="140" y2="165" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="1" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id="slma-cross" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#F0FDFF" />
          <stop offset="1" stopColor="#67E8F9" />
        </linearGradient>
        <linearGradient id="slma-ecg" x1="42" y1="0" x2="158" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2DD4BF" stopOpacity="0" />
          <stop offset="0.2" stopColor="#2DD4BF" />
          <stop offset="0.65" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="slma-bg" cx="100" cy="95" r="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0EA5E9" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0F172A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* background orb */}
      <circle cx="100" cy="100" r="90" fill="url(#slma-bg)" />
      {/* orbit rings */}
      <circle cx="100" cy="100" r="92" stroke="#38BDF8" strokeWidth="0.6" strokeOpacity="0.2" fill="none" strokeDasharray="5 9" />
      <circle cx="100" cy="100" r="83" stroke="#0EA5E9" strokeWidth="0.9" strokeOpacity="0.35" fill="none" strokeDasharray="13 6" />
      {/* cardinal ticks */}
      <line x1="100" y1="6"   x2="100" y2="18"  stroke="#38BDF8" strokeWidth="2.5" strokeOpacity="0.75" />
      <line x1="194" y1="100" x2="182" y2="100" stroke="#38BDF8" strokeWidth="2.5" strokeOpacity="0.75" />
      <line x1="100" y1="194" x2="100" y2="182" stroke="#38BDF8" strokeWidth="2.5" strokeOpacity="0.75" />
      <line x1="6"   y1="100" x2="18"  y2="100" stroke="#38BDF8" strokeWidth="2.5" strokeOpacity="0.75" />
      <circle cx="100" cy="6"   r="2.5" fill="#38BDF8" filter="url(#slma-glow-strong)" />
      <circle cx="194" cy="100" r="2.5" fill="#38BDF8" filter="url(#slma-glow-strong)" />
      <circle cx="100" cy="194" r="2.5" fill="#38BDF8" filter="url(#slma-glow-strong)" />
      <circle cx="6"   cy="100" r="2.5" fill="#38BDF8" filter="url(#slma-glow-strong)" />
      {/* hand — thumb to pinky */}
      <rect x="62"  y="83"  width="10" height="36" rx="5"   fill="url(#slma-hand)" opacity="0.93" filter="url(#slma-glow-soft)" />
      <rect x="75"  y="67"  width="11" height="52" rx="5.5" fill="url(#slma-hand)" opacity="0.93" filter="url(#slma-glow-soft)" />
      <rect x="89"  y="58"  width="11" height="61" rx="5.5" fill="url(#slma-hand)" opacity="0.93" filter="url(#slma-glow-soft)" />
      <rect x="103" y="64"  width="11" height="55" rx="5.5" fill="url(#slma-hand)" opacity="0.93" filter="url(#slma-glow-soft)" />
      <rect x="117" y="77"  width="10" height="42" rx="5"   fill="url(#slma-hand)" opacity="0.91" filter="url(#slma-glow-soft)" />
      <rect x="61"  y="116" width="68" height="41" rx="10"  fill="url(#slma-hand)" opacity="0.93" filter="url(#slma-glow-soft)" />
      <line x1="63" y1="122" x2="127" y2="122" stroke="#E0F2FE" strokeWidth="0.7" strokeOpacity="0.22" />
      {/* fingertip nodes */}
      <circle cx="67"    cy="83" r="4.5" fill="#38BDF8" filter="url(#slma-glow-strong)" />
      <circle cx="80.5"  cy="67" r="4.5" fill="#67E8F9" filter="url(#slma-glow-strong)" />
      <circle cx="94.5"  cy="58" r="5.2" fill="#E0F2FE" filter="url(#slma-glow-strong)" />
      <circle cx="108.5" cy="64" r="4.5" fill="#67E8F9" filter="url(#slma-glow-strong)" />
      <circle cx="122"   cy="77" r="4"   fill="#38BDF8" filter="url(#slma-glow-strong)" />
      <circle cx="67"    cy="83" r="1.8" fill="#F0FDFF" />
      <circle cx="80.5"  cy="67" r="1.8" fill="#F0FDFF" />
      <circle cx="94.5"  cy="58" r="2.2" fill="#F0FDFF" />
      <circle cx="108.5" cy="64" r="1.8" fill="#F0FDFF" />
      <circle cx="122"   cy="77" r="1.6" fill="#F0FDFF" />
      {/* circuit traces left */}
      <line x1="62" y1="83" x2="53" y2="83" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="53" y1="83" x2="53" y2="72" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.6" />
      <circle cx="53" cy="72" r="2.2" fill="#22D3EE" filter="url(#slma-glow-strong)" />
      <line x1="53" y1="72" x2="43" y2="72" stroke="#22D3EE" strokeWidth="0.8" strokeOpacity="0.35" />
      <circle cx="43" cy="72" r="1.5" fill="#22D3EE" opacity="0.5" />
      {/* circuit traces right */}
      <line x1="127" y1="77" x2="137" y2="77" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="137" y1="77" x2="137" y2="65" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.6" />
      <circle cx="137" cy="65" r="2.2" fill="#22D3EE" filter="url(#slma-glow-strong)" />
      <line x1="137" y1="65" x2="148" y2="65" stroke="#22D3EE" strokeWidth="0.8" strokeOpacity="0.35" />
      <circle cx="148" cy="65" r="1.5" fill="#22D3EE" opacity="0.5" />
      {/* medical cross */}
      <g filter="url(#slma-glow-soft)">
        <rect x="150" y="34" width="5"  height="19" rx="2.5" fill="url(#slma-cross)" />
        <rect x="144" y="40" width="17" height="5"  rx="2.5" fill="url(#slma-cross)" />
      </g>
      <circle cx="152.5" cy="43" r="2.2" fill="#E0F2FE" filter="url(#slma-glow-strong)" />
      {/* ECG waveform */}
      <path d="M 42 134 L 57 134 L 61 124 L 65 144 L 71 110 L 77 157 L 83 134 L 158 134"
        stroke="url(#slma-ecg)" strokeWidth="2.3" fill="none"
        strokeLinecap="round" strokeLinejoin="round" filter="url(#slma-glow-soft)" />
      <circle cx="158" cy="134" r="3.2" fill="#6366F1" filter="url(#slma-glow-strong)" />
      <circle cx="158" cy="134" r="1.3" fill="#E0F2FE" />
      {/* AI nodes bottom-left */}
      <circle cx="35" cy="151" r="2.8" stroke="#22D3EE" strokeWidth="1.2" strokeOpacity="0.55" fill="rgba(34,211,238,0.12)" />
      <circle cx="35" cy="151" r="1"   fill="#22D3EE" opacity="0.8" />
      <circle cx="50" cy="166" r="2.2" stroke="#22D3EE" strokeWidth="1"   strokeOpacity="0.4"  fill="rgba(34,211,238,0.08)" />
      <circle cx="50" cy="166" r="0.8" fill="#22D3EE" opacity="0.6" />
      <line x1="35" y1="151" x2="50" y2="166" stroke="#22D3EE" strokeWidth="0.8" strokeOpacity="0.28" />
      {/* neural nodes bottom-right */}
      <circle cx="156" cy="160" r="2.2" stroke="#818CF8" strokeWidth="1"   strokeOpacity="0.5"  fill="rgba(129,140,248,0.1)" />
      <circle cx="156" cy="160" r="0.8" fill="#818CF8" opacity="0.7" />
      <circle cx="165" cy="148" r="1.8" stroke="#818CF8" strokeWidth="0.8" strokeOpacity="0.38" fill="rgba(129,140,248,0.07)" />
      <circle cx="165" cy="148" r="0.6" fill="#818CF8" opacity="0.5" />
      <line x1="156" y1="160" x2="165" y2="148" stroke="#818CF8" strokeWidth="0.8" strokeOpacity="0.28" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function HomePage() {
  useEffect(() => {
    console.log("SLMA v1.0 initialized");
  }, []);

  return (
    <main className="min-h-screen bg-background text-slate-100 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 tech-grid" />
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[15%]  w-[700px] h-[500px] rounded-full bg-blue-700/15 blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] rounded-full bg-teal-700/12 blur-[120px]" />
        <div className="absolute top-[40%]  left-[-5%]  w-[300px] h-[300px] rounded-full bg-purple-700/10 blur-[100px]" />
      </div>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {([
          { t: "8%",  l: "5%",  d: "0s"   },
          { t: "20%", l: "92%", d: "0.5s" },
          { t: "55%", l: "3%",  d: "1s"   },
          { t: "70%", l: "88%", d: "1.5s" },
          { t: "85%", l: "50%", d: "0.8s" },
        ] as const).map((n, i) => (
          <div key={i} className="absolute w-1.5 h-1.5 rounded-full bg-sky-400/40"
            style={{ top: n.t, left: n.l, animation: `pulseGlow 2.5s ease-in-out ${n.d} infinite` }} />
        ))}
        <div className="absolute top-[50%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/10 to-transparent" />
      </div>

      {/* HERO */}
      <section className="relative z-10 min-h-screen flex flex-col justify-center px-6 md:px-12 pt-10 pb-20 max-w-5xl mx-auto">
        <motion.div variants={fadeIn(0)} initial="hidden" animate="visible"
          className="flex flex-wrap items-center justify-between gap-3 mb-12 md:mb-16">
          <div className="inline-flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 backdrop-blur-sm px-4 py-1.5 rounded-full text-slate-400 text-[11px] font-mono tracking-widest uppercase">
            <Activity className="w-3 h-3 text-teal-400" /> Final Year Project &mdash; UMT Sialkot
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sysStatus.map((s) => (
              <span key={s.label}
                className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1 rounded-full border backdrop-blur-sm ${
                  s.status === "ONLINE"
                    ? "border-teal-700/50 text-teal-400 bg-teal-900/20"
                    : "border-slate-700/50 text-slate-500 bg-slate-800/30"
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.status === "ONLINE" ? "bg-teal-400" : "bg-slate-600"}`}
                  style={{ animation: s.status === "ONLINE" ? "pulseGlow 2s ease-in-out infinite" : undefined }} />
                {s.label} &mdash; {s.status}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ── CENTERED HERO STACK ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center w-full">

          {/* 1. Large centered SVG logo */}
          <motion.div variants={fadeUp(0.05)} initial="hidden" animate="visible" className="mb-6">
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-sky-500/8 blur-3xl scale-150" />
              <div
                className="absolute inset-[-18px] rounded-full border border-sky-400/15"
                style={{ animation: "pulseGlow 3.5s ease-in-out infinite" }}
              />
              <div
                className="absolute inset-[-36px] rounded-full border border-sky-400/7"
                style={{ animation: "pulseGlow 3.5s ease-in-out 1s infinite" }}
              />
              <SLMALogo size={210} />
            </div>
          </motion.div>

          {/* 2. SLMA giant title */}
          <motion.div variants={fadeUp(0.13)} initial="hidden" animate="visible" className="mb-2">
            <h1 className="text-[88px] sm:text-[112px] md:text-[138px] xl:text-[168px] font-black tracking-tight leading-none gradient-text inline-flex items-end">
              SLMA
              <span className="cursor-blink text-sky-400 ml-2 text-[62%]">_</span>
            </h1>
          </motion.div>

          {/* Version / project tag */}
          <motion.div variants={fadeUp(0.17)} initial="hidden" animate="visible" className="mb-7">
            <div className="inline-flex items-center gap-2">
              <Shield className="w-3 h-3 text-teal-400" />
              <span className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">
                v1.0.0-ALPHA &middot; Final Year Project &middot; UMT Sialkot
              </span>
            </div>
          </motion.div>

          {/* 3. Subtitle */}
          <motion.p
            variants={fadeUp(0.22)} initial="hidden" animate="visible"
            className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-100 mb-4 leading-tight"
          >
            Sign Language{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-sky-400">Medical</span>
            {" "}Assistant
          </motion.p>

          {/* 4. Tagline */}
          <motion.p
            variants={fadeUp(0.28)} initial="hidden" animate="visible"
            className="text-sm sm:text-base text-amber-400 font-medium max-w-lg mb-6 leading-relaxed"
          >
            Breaking Healthcare Communication Barriers for{" "}
            <span className="text-amber-300 font-bold border-b border-amber-500/40">
              70 Million Deaf People
            </span>{" "}
            Worldwide
          </motion.p>

          {/* 5. Description */}
          <motion.p
            variants={fadeUp(0.34)} initial="hidden" animate="visible"
            className="text-slate-400 max-w-2xl text-sm md:text-[15px] leading-7 mb-10 px-2"
          >
            A real-time bidirectional translation system built for clinical environments.
            Keypoint extraction via{" "}
            <span className="text-sky-300 font-medium">MediaPipe Holistic</span>,
            temporal modelling through{" "}
            <span className="text-sky-300 font-medium">TCN + SE + BiLSTM</span>{" "}
            with <span className="text-sky-300 font-medium">attention pooling</span>, and output
            refinement via a medical{" "}
            <span className="text-sky-300 font-medium">Semantic Refinement Engine</span>{" "}
            &mdash; enabling deaf patients to communicate with doctors without a human interpreter.
          </motion.p>

          {/* 6. CTA buttons */}
          <motion.div
            variants={fadeUp(0.40)} initial="hidden" animate="visible"
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              href="/login?next=/doctor"
              className="group relative inline-flex items-center justify-center gap-3 bg-primary hover:bg-blue-600 text-white font-bold text-lg px-11 py-4 rounded-2xl transition-all duration-300 shadow-lg shadow-blue-900/40 hover:shadow-[0_0_32px_rgba(59,130,246,0.45)] hover:-translate-y-0.5 active:translate-y-0 border border-blue-700/50"
            >
              <Stethoscope className="w-5 h-5 transition-transform group-hover:scale-110" />
              Doctor Login
              <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            <Link
              href="/patient"
              className="group relative inline-flex items-center justify-center gap-3 bg-secondary hover:bg-teal-500 text-white font-bold text-lg px-11 py-4 rounded-2xl transition-all duration-300 shadow-lg shadow-teal-900/40 hover:shadow-[0_0_32px_rgba(20,184,166,0.45)] hover:-translate-y-0.5 active:translate-y-0 border border-teal-700/50"
            >
              <Heart className="w-5 h-5 transition-transform group-hover:scale-110" />
              Patient Portal
              <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div variants={fadeIn(1.4)} initial="hidden" animate="visible"
          className="flex flex-col items-center gap-1.5 text-slate-600 text-xs mt-16 mx-auto"
        >
          <span className="font-mono tracking-widest uppercase text-[10px]">scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-slate-600 to-transparent animate-pulse" />
        </motion.div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* â”€â”€ FEATURES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="relative z-10 px-6 md:px-12 py-24 max-w-7xl mx-auto">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp(0)} className="mb-14">
          <p className="font-mono text-xs text-teal-500 tracking-widest mb-2">{"// CAPABILITIES"}</p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-100">
            Why{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-400">SLMA?</span>
          </h2>
          <p className="text-slate-500 text-sm mt-2 max-w-lg">
            Purpose-built for the global deaf community — combining cutting-edge AI with real clinical workflow needs.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <motion.div key={f.title} initial="hidden" whileInView="visible"
              viewport={{ once: true, margin: "-50px" }} variants={fadeUp(i * 0.1)}
              className={`relative group scan-line bg-surface/60 border ${f.border} rounded-2xl p-6 hover:bg-surface/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${f.glow} cursor-default backdrop-blur-sm`}
            >
              <p className={`font-mono text-[10px] ${f.color} opacity-60 mb-3 tracking-widest`}>{f.tag}</p>
              <div className={`mb-4 w-11 h-11 rounded-xl bg-slate-900/60 border ${f.border} flex items-center justify-center ${f.color}`}>
                {f.icon}
              </div>
              <h3 className="font-semibold text-slate-100 mb-2 text-sm">{f.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* â”€â”€ TECH STACK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section className="relative z-10 px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={fadeUp(0)} className="mb-10">
          <p className="font-mono text-xs text-blue-500 tracking-widest mb-2">{"// TECH_STACK"}</p>
          <h2 className="text-3xl font-bold text-slate-100">Technology Stack</h2>
          <p className="text-slate-500 text-sm mt-2">Industry-grade tools powering every layer of SLMA.</p>
        </motion.div>
        <div className="flex flex-wrap gap-3">
          {techStack.map((tech, i) => (
            <motion.div key={tech.name} initial="hidden" whileInView="visible"
              viewport={{ once: true, margin: "-40px" }} variants={fadeUp(i * 0.07)}
              className={`inline-flex items-center gap-2.5 bg-slate-900/80 border ${tech.color.split(" ")[0]} backdrop-blur-sm px-5 py-2.5 rounded-xl hover:-translate-y-0.5 transition-all duration-200 hover:shadow-lg cursor-default`}
            >
              <span className={tech.color.split(" ")[1]}>{tech.icon}</span>
              <span className="text-slate-200 font-semibold text-sm">{tech.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/70" style={{ animation: "pulseGlow 2s ease-in-out infinite" }} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <footer className="relative z-10 border-t border-slate-800/60 px-6 md:px-12 py-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn(0)}
          className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <Radio className="w-4 h-4 text-teal-500" />
            <p className="text-slate-400 text-sm">
              <span className="text-slate-200 font-bold">SLMA</span>{" "}
              <span className="text-slate-600">—</span>{" "}
              Sign Language Medical Assistant
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-700 text-xs font-mono">
              University of Management & Technology (UMT) Sialkot · 2025–2026
            </span>
            <span className="w-2 h-2 rounded-full bg-green-400/80" style={{ animation: "pulseGlow 2s ease-in-out infinite" }} />
          </div>
        </motion.div>
      </footer>
    </main>
  );
}
