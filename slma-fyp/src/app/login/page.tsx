"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from "lucide-react";
import { apiFetch, AuthResponse, readApiError } from "@/lib/backend";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch("/auth/me").then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as AuthResponse;
      const requested = params.get("next");
      const safeRequested = requested?.startsWith("/") ? requested : null;
      if (safeRequested === "/doctor" && data.user.role !== "doctor") {
        setError("You are signed in as admin. Sign in with an approved doctor account to open the doctor portal.");
        return;
      }
      if (safeRequested === "/admin" && data.user.role !== "admin") {
        setError("You are signed in as doctor. Sign in with an admin account to open the admin portal.");
        return;
      }
      router.replace(safeRequested || (data.user.role === "admin" ? "/admin" : "/doctor"));
    }).catch(() => {
      // Backend not reachable (slow network / firewall / server down).
      // Tell the user up-front instead of letting them try a login that
      // would also fail with an unexplained error.
      setError("Cannot reach the SLMA backend server. Make sure it is running and reachable, then reload this page.");
    });
  }, [params, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Login failed"));
      const data = (await response.json()) as AuthResponse;
      const requested = params.get("next");
      const safeRequested = requested?.startsWith("/") ? requested : null;
      router.replace(safeRequested || (data.user.role === "admin" ? "/admin" : "/doctor"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-8">
      <section className="w-full max-w-md border border-slate-800 bg-slate-900/90 p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-nobg.png" alt="SLMA" width={42} height={42} />
            <div>
              <h1 className="text-xl font-bold">SLMA Staff Login</h1>
              <p className="text-xs text-slate-400">Doctor and administrator access</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-teal-300 hover:text-teal-200">Home</Link>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            Email
            <span className="mt-1 flex items-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
              <Mail size={16} className="text-slate-500" />
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent outline-none"
              />
            </span>
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <span className="mt-1 flex items-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
              <LockKeyhole size={16} className="text-slate-500" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent outline-none"
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          {error && <p className="border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
          >
            <LogIn size={17} /> {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="mt-5 space-y-3 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-500">
          <p>Doctors can request an account, then wait for admin approval before using the doctor portal.</p>
          <Link
            href="/signup"
            className="block border border-teal-700/60 px-3 py-2 text-center font-semibold text-teal-300 hover:border-teal-500 hover:text-teal-200"
          >
            Doctor Sign Up
          </Link>
          <p>Patient access does not require an account. Patient details are entered and managed by the doctor during consultation.</p>
        </div>
      </section>
    </main>
  );
}
