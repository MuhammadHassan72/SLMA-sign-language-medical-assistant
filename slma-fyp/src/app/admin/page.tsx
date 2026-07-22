"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CircleUserRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import { apiFetch, AuthResponse, AuthUser, DoctorProfile, readApiError } from "@/lib/backend";

interface DoctorRecord {
  user: AuthUser;
  profile: DoctorProfile | null;
}

interface Summary {
  total_doctors: number;
  active_doctors: number;
  pending_doctors: number;
  inactive_doctors: number;
  total_patient_profiles: number;
  total_consultation_sessions: number;
  sessions_today: number;
}

interface RecentSession {
  session_id: string;
  doctor_name: string;
  patient_name: string;
  status: string;
  started_at?: string;
  ended_at?: string | null;
  prediction_count: number;
  message_count: number;
}

const emptyDoctorForm = {
  name: "",
  email: "",
  password: "",
  specialization: "",
  hospital_name: "",
  phone: "",
  license_no: "",
};

function formatDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(emptyDoctorForm);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [accessDeniedUser, setAccessDeniedUser] = useState<AuthUser | null>(null);

  const loadData = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const meResponse = await apiFetch("/auth/me");
      if (meResponse.status === 401) {
        router.replace("/login?next=/admin");
        return;
      }
      if (!meResponse.ok) throw new Error(await readApiError(meResponse, "Could not load account"));
      const me = (await meResponse.json()) as AuthResponse;
      if (me.user.role !== "admin") {
        setAccount(me.user);
        setAccessDeniedUser(me.user);
        return;
      } else {
        setAccessDeniedUser(null);
        setAccount(me.user);
      }
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (statusFilter) query.set("status", statusFilter);
      const [summaryResponse, doctorsResponse, sessionsResponse] = await Promise.all([
        apiFetch("/admin/summary"),
        apiFetch(`/admin/doctors?${query.toString()}`),
        apiFetch("/admin/sessions/recent?limit=25"),
      ]);
      for (const response of [summaryResponse, doctorsResponse, sessionsResponse]) {
        if (!response.ok) throw new Error(await readApiError(response, "Admin data could not be loaded"));
      }
      setSummary(await summaryResponse.json());
      setDoctors(await doctorsResponse.json());
      setSessions(await sessionsResponse.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Admin data could not be loaded");
    } finally {
      setBusy(false);
    }
  }, [router, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 200);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const editingDoctor = useMemo(
    () => doctors.find((doctor) => doctor.profile?.doctor_id === editingDoctorId) || null,
    [doctors, editingDoctorId],
  );

  async function saveDoctor(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = editingDoctorId
        ? { ...form, password: undefined }
        : form;
      const response = await apiFetch(
        editingDoctorId ? `/admin/doctors/${editingDoctorId}` : "/admin/doctors",
        {
          method: editingDoctorId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await readApiError(response, "Doctor could not be saved"));
      setNotice(editingDoctorId ? "Doctor profile updated." : "Doctor account created.");
      setEditingDoctorId(null);
      setForm(emptyDoctorForm);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Doctor could not be saved");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(doctor: DoctorRecord) {
    setEditingDoctorId(doctor.profile?.doctor_id || null);
    setForm({
      name: doctor.user.name,
      email: doctor.user.email,
      password: "",
      specialization: doctor.profile?.specialization || "",
      hospital_name: doctor.profile?.hospital_name || "",
      phone: doctor.profile?.phone || "",
      license_no: doctor.profile?.license_no || "",
    });
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeStatus(doctor: DoctorRecord) {
    if (!doctor.profile) return;
    const next = doctor.user.status === "active" ? "inactive" : "active";
    if (next === "inactive" && !window.confirm(`Deactivate ${doctor.user.name}? Existing history will be preserved.`)) return;
    const response = await apiFetch(`/admin/doctors/${doctor.profile.doctor_id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    if (!response.ok) {
      setError(await readApiError(response, "Status could not be changed"));
      return;
    }
    setNotice(`Doctor ${doctor.user.status === "pending" ? "approved" : next === "active" ? "activated" : "deactivated"}.`);
    await loadData();
  }

  async function resetDoctorPassword() {
    if (!editingDoctorId || !resetPassword) return;
    const response = await apiFetch(`/admin/doctors/${editingDoctorId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: resetPassword }),
    });
    if (!response.ok) {
      setError(await readApiError(response, "Password could not be reset"));
      return;
    }
    setResetPassword("");
    setNotice("Doctor password reset. Existing doctor sessions were signed out.");
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function switchToAdminLogin() {
    await apiFetch("/auth/logout", { method: "POST" });
    router.replace("/login?next=/admin");
  }

  async function switchToDoctorLogin() {
    await apiFetch("/auth/logout", { method: "POST" });
    router.replace("/login?next=/doctor");
  }

  const stats = summary ? [
    ["Total doctors", summary.total_doctors, Stethoscope],
    ["Active doctors", summary.active_doctors, UserCheck],
    ["Pending doctors", summary.pending_doctors, CircleUserRound],
    ["Inactive doctors", summary.inactive_doctors, UserRoundX],
    ["Patient profiles", summary.total_patient_profiles, Users],
    ["Consultations", summary.total_consultation_sessions, Activity],
    ["Sessions today", summary.sessions_today, ShieldCheck],
  ] as const : [];

  const pendingDoctors = doctors.filter((doctor) => doctor.user.status === "pending");

  if (accessDeniedUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <section className="w-full max-w-lg border border-amber-800/60 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="text-amber-300" size={24} />
            <div>
              <h1 className="text-lg font-bold">Admin login required</h1>
              <p className="text-xs text-slate-400">The admin portal is only available to an active administrator account.</p>
            </div>
          </div>
          <p className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/25 px-3 py-2 text-sm text-amber-100">
            You are currently signed in as <span className="font-semibold">{accessDeniedUser.role}</span>
            {accessDeniedUser.email ? ` (${accessDeniedUser.email})` : ""}. Sign out and login with the admin account to approve doctors.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={switchToAdminLogin} className="bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500">
              Sign out and login as admin
            </button>
            <button onClick={switchToDoctorLogin} className="border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
              Back to doctor login
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-5 py-3">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-teal-400" />
            <div><h1 className="font-bold">SLMA Administration</h1><p className="text-xs text-slate-400">Accounts and consultation monitoring</p></div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 sm:inline">{account?.name}</span>
            <button onClick={switchToDoctorLogin} className="text-teal-300 hover:text-teal-200">
              Switch to doctor login
            </button>
            <button onClick={logout} title="Sign out" className="p-2 text-slate-400 hover:text-white"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-7 px-5 py-6">
        {error && <div className="border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>}
        {notice && <div className="border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">System summary</h2><button onClick={() => void loadData()} title="Refresh" className="p-2 text-slate-400 hover:text-white"><RefreshCw size={16} className={busy ? "animate-spin" : ""} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {stats.map(([label, value, Icon]) => <div key={label} className="rounded-md border border-slate-800 bg-slate-900 p-4"><Icon size={18} className="mb-3 text-teal-400" /><p className="text-2xl font-bold">{value}</p><p className="text-xs text-slate-400">{label}</p></div>)}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <form onSubmit={saveDoctor} className="self-start border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2"><Plus size={17} className="text-teal-400" /><h2 className="font-semibold">{editingDoctorId ? "Edit doctor" : "Create doctor"}</h2></div>
            <div className="grid gap-3">
              {(["name", "email", "specialization", "hospital_name", "phone", "license_no"] as const).map((field) => (
                <label key={field} className="text-xs capitalize text-slate-400">{field.replace("_", " ")}<input type={field === "email" ? "email" : "text"} required={field === "name" || field === "email"} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500" /></label>
              ))}
              {!editingDoctorId && <label className="text-xs text-slate-400">Initial password<input type="password" minLength={10} required value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-1 w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-teal-500" /></label>}
              <div className="flex gap-2">
                <button disabled={busy} className="flex-1 bg-teal-600 px-3 py-2 text-sm font-semibold hover:bg-teal-500 disabled:opacity-60">{editingDoctorId ? "Save changes" : "Create doctor"}</button>
                {editingDoctorId && <button type="button" onClick={() => { setEditingDoctorId(null); setForm(emptyDoctorForm); }} className="border border-slate-700 px-3 py-2 text-sm">Cancel</button>}
              </div>
              {editingDoctorId && <div className="mt-2 border-t border-slate-800 pt-3"><p className="mb-2 text-xs text-slate-400">Secure password reset for {editingDoctor?.user.name}</p><div className="flex gap-2"><input type="password" minLength={10} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="New password" className="min-w-0 flex-1 border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><button type="button" onClick={() => void resetDoctorPassword()} className="border border-amber-700 px-3 py-2 text-xs text-amber-300">Reset</button></div></div>}
            </div>
          </form>

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex min-w-[220px] flex-1 items-center gap-2 border border-slate-700 bg-slate-900 px-3 py-2"><Search size={15} className="text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search doctor, email, hospital, license" className="w-full bg-transparent text-sm outline-none" /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-slate-700 bg-slate-900 px-3 py-2 text-sm"><option value="">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            </div>
            {pendingDoctors.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-800/60 bg-amber-950/20 px-3 py-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-200">Pending doctor approvals</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {pendingDoctors.map((doctor) => (
                    <div key={doctor.user.user_id} className="flex items-center justify-between gap-2 border border-amber-900/50 bg-slate-950/50 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">{doctor.user.name}</p>
                        <p className="truncate text-slate-500">{doctor.user.email}</p>
                      </div>
                      <button onClick={() => void changeStatus(doctor)} className="shrink-0 bg-amber-600 px-2 py-1 font-semibold text-slate-950 hover:bg-amber-500">
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="overflow-x-auto border border-slate-800">
              <table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr><th className="p-3">Doctor</th><th className="p-3">Profile</th><th className="p-3">License</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-800">{doctors.map((doctor) => <tr key={doctor.user.user_id} className="bg-slate-950/30"><td className="p-3"><p className="font-medium">{doctor.user.name}</p><p className="text-xs text-slate-500">{doctor.user.email}</p><p className="text-[10px] text-slate-600">Last login: {formatDate(doctor.user.last_login_at)}</p></td><td className="p-3"><p>{doctor.profile?.specialization || "Not provided"}</p><p className="text-xs text-slate-500">{doctor.profile?.hospital_name || "No hospital"}</p></td><td className="p-3 text-slate-400">{doctor.profile?.license_no || "--"}</td><td className="p-3"><span className={doctor.user.status === "active" ? "text-emerald-300" : doctor.user.status === "pending" ? "text-amber-300" : "text-red-300"}>{doctor.user.status}</span></td><td className="p-3"><div className="flex gap-2"><button onClick={() => beginEdit(doctor)} title="Edit doctor" className="p-2 text-blue-300 hover:bg-slate-800"><Pencil size={15} /></button><button onClick={() => void changeStatus(doctor)} className="border border-slate-700 px-2 py-1 text-xs">{doctor.user.status === "active" ? "Deactivate" : doctor.user.status === "pending" ? "Approve" : "Activate"}</button></div></td></tr>)}{!busy && doctors.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No doctors match this filter.</td></tr>}</tbody></table>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2"><CircleUserRound size={17} className="text-blue-400" /><h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Recent consultations</h2></div>
          <div className="overflow-x-auto border border-slate-800"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr><th className="p-3">Started</th><th className="p-3">Doctor</th><th className="p-3">Patient</th><th className="p-3">Status</th><th className="p-3">Predictions</th><th className="p-3">Messages</th><th className="p-3">Ended</th></tr></thead><tbody className="divide-y divide-slate-800">{sessions.map((session) => <tr key={session.session_id}><td className="p-3 text-slate-400">{formatDate(session.started_at)}</td><td className="p-3">{session.doctor_name}</td><td className="p-3">{session.patient_name}</td><td className="p-3 capitalize">{session.status}</td><td className="p-3">{session.prediction_count}</td><td className="p-3">{session.message_count}</td><td className="p-3 text-slate-400">{formatDate(session.ended_at)}</td></tr>)}{!busy && sessions.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No consultation sessions have been recorded.</td></tr>}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}
