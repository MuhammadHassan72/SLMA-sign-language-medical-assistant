"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ClipboardCheck, Mail, Stethoscope, UserPlus } from "lucide-react";
import { apiFetch, readApiError } from "@/lib/backend";

const emptyForm = {
  full_name: "",
  email: "",
  password: "",
  confirm_password: "",
  phone: "",
  specialization: "",
  hospital_name: "",
  license_no: "",
};

export default function DoctorSignupPage() {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch("/auth/doctor-signup", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          license_no: form.license_no || null,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Doctor signup failed"));
      const data = await response.json();
      setSuccess(data.message || "Doctor signup submitted. Your account is pending admin approval.");
      setForm(emptyForm);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Doctor signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto grid w-full max-w-5xl overflow-hidden border border-slate-800 bg-slate-900/90 shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-slate-800 bg-slate-950/70 p-7 lg:border-b-0 lg:border-r">
          <div className="mb-8 flex items-center gap-3">
            <Image src="/logo-nobg.png" alt="SLMA" width={44} height={44} />
            <div>
              <h1 className="text-xl font-bold">Doctor Sign Up</h1>
              <p className="text-xs text-slate-400">Request access to the SLMA doctor portal</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <div className="flex gap-3">
              <ClipboardCheck className="mt-0.5 shrink-0 text-teal-400" size={18} />
              <p>Your request is saved as a pending doctor account.</p>
            </div>
            <div className="flex gap-3">
              <Stethoscope className="mt-0.5 shrink-0 text-blue-400" size={18} />
              <p>An administrator must approve the account before login to the doctor portal works.</p>
            </div>
            <div className="rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              Patients do not sign up in SLMA. Patient details are entered by the doctor inside the doctor portal.
            </div>
          </div>

          <Link href="/login" className="mt-8 inline-block text-sm font-semibold text-teal-300 hover:text-teal-200">
            Back to staff login
          </Link>
        </div>

        <form onSubmit={submit} className="grid gap-4 p-7 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm text-slate-300">
            Full name
            <input
              required
              minLength={2}
              value={form.full_name}
              onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          <label className="sm:col-span-2 text-sm text-slate-300">
            Email
            <span className="mt-1 flex items-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
              <Mail size={16} className="text-slate-500" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full bg-transparent outline-none"
              />
            </span>
          </label>

          <label className="text-sm text-slate-300">
            Password
            <input
              type="password"
              required
              minLength={10}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          <label className="text-sm text-slate-300">
            Confirm password
            <input
              type="password"
              required
              minLength={10}
              value={form.confirm_password}
              onChange={(event) => setForm((current) => ({ ...current, confirm_password: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          <label className="text-sm text-slate-300">
            Phone optional
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          <label className="text-sm text-slate-300">
            Specialization optional
            <input
              value={form.specialization}
              onChange={(event) => setForm((current) => ({ ...current, specialization: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          <label className="text-sm text-slate-300">
            Hospital name optional
            <input
              value={form.hospital_name}
              onChange={(event) => setForm((current) => ({ ...current, hospital_name: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          <label className="text-sm text-slate-300">
            License number optional
            <input
              value={form.license_no}
              onChange={(event) => setForm((current) => ({ ...current, license_no: event.target.value }))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 outline-none focus:border-teal-500"
            />
          </label>

          {error && <p className="sm:col-span-2 border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
          {success && <p className="sm:col-span-2 border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">{success}</p>}

          <button
            type="submit"
            disabled={busy}
            className="sm:col-span-2 flex items-center justify-center gap-2 bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
          >
            <UserPlus size={17} /> {busy ? "Submitting request..." : "Submit Doctor Signup"}
          </button>
        </form>
      </section>
    </main>
  );
}
