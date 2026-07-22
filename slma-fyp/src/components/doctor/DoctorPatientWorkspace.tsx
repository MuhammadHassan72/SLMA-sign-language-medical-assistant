"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  LogOut,
  Pencil,
  Plus,
  Search,
  UserRoundCheck,
} from "lucide-react";
import { apiFetch, AuthResponse, AuthUser, readApiError } from "@/lib/backend";

export interface PatientProfile {
  _id?: string;
  patient_id: string;
  full_name?: string;
  name?: string;
  date_of_birth?: string | null;
  age?: number | null;
  gender?: string;
  phone?: string | null;
  emergency_contact?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  medical_notes?: string | null;
}

interface HistoryEntry {
  session: { _id: string; status?: string; started_at?: string; ended_at?: string | null };
  doctor_name: string;
  predictions: { top1_gloss: string; refined_text?: string }[];
  doctor_responses: { text?: string; final_text?: string }[];
}

interface Props {
  selectedPatient: PatientProfile | null;
  activeSessionId: string;
  sessionBusy: boolean;
  onPatientSelected: (patient: PatientProfile | null) => void;
  onAccountLoaded: (user: AuthUser) => void;
  onStartConsultation: () => void;
  onLoadLatest: () => void;
  onEndConsultation: () => void;
}

const emptyForm = {
  full_name: "",
  date_of_birth: "",
  age: "",
  gender: "",
  phone: "",
  emergency_contact: "",
  blood_group: "",
  allergies: "",
  medical_notes: "",
};

const patientFields = [
  { key: "full_name", label: "Name", required: true },
  { key: "gender", label: "Gender", required: true },
  { key: "age", label: "Age", type: "number" },
  { key: "date_of_birth", label: "DOB", type: "date" },
  { key: "blood_group", label: "Blood Group" },
  { key: "phone", label: "Contact Number" },
  { key: "emergency_contact", label: "Emergency Contact", wide: true },
  { key: "allergies", label: "Allergies", wide: true },
] as const;

function patientDisplayName(patient: PatientProfile | null) {
  return patient?.full_name || patient?.name || "No patient selected";
}

export default function DoctorPatientWorkspace({
  selectedPatient,
  activeSessionId,
  sessionBusy,
  onPatientSelected,
  onAccountLoaded,
  onStartConsultation,
  onLoadLatest,
  onEndConsultation,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void apiFetch("/auth/me").then(async (response) => {
      if (response.status === 401) {
        router.replace("/login?next=/doctor");
        return;
      }
      if (!response.ok) {
        setError(await readApiError(response, "Account could not be loaded"));
        return;
      }
      const data = (await response.json()) as AuthResponse;
      if (data.user.role !== "doctor") {
        router.replace("/admin");
        return;
      }
      onAccountLoaded(data.user);
    }).catch((reason) => {
      // Surface network failures instead of failing silently.
      setError(
        reason instanceof Error
          ? `Cannot reach the backend: ${reason.message}`
          : "Cannot reach the backend server.",
      );
    });
  }, [onAccountLoaded, router]);

  const loadPatients = useCallback(async () => {
    try {
      const response = await apiFetch(`/patients?search=${encodeURIComponent(search.trim())}&limit=50`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/login?next=/doctor");
        return;
      }
      if (!response.ok) throw new Error(await readApiError(response, "Patients could not be loaded"));
      setPatients(await response.json());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Patients could not be loaded");
    }
  }, [router, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatients(), 250);
    return () => window.clearTimeout(timer);
  }, [loadPatients]);

  useEffect(() => {
    if (!selectedPatient) {
      setHistory([]);
      return;
    }
    void apiFetch(`/patients/${selectedPatient.patient_id}/history`, { cache: "no-store" }).then(async (response) => {
      if (response.ok) setHistory(await response.json());
    });
  }, [selectedPatient, activeSessionId]);

  function openPatientDetails(patient: PatientProfile) {
    setEditingId(patient.patient_id);
    setForm({
      full_name: patient.full_name || patient.name || "",
      date_of_birth: patient.date_of_birth || "",
      age: patient.age?.toString() || "",
      gender: patient.gender || "",
      phone: patient.phone || "",
      emergency_contact: patient.emergency_contact || "",
      blood_group: patient.blood_group || "",
      allergies: patient.allergies || "",
      medical_notes: patient.medical_notes || "",
    });
    setShowForm(true);
    setDuplicatePending(false);
    setError("");
    setNotice("");
  }

  function beginCreatePatient() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setDuplicatePending(false);
    setError("");
    setNotice("");
  }

  function closePatientModal() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setDuplicatePending(false);
  }

  async function savePatient(event: FormEvent | null, allowDuplicate = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        age: form.age ? Number(form.age) : null,
        date_of_birth: form.date_of_birth || null,
        allow_duplicate: allowDuplicate,
      };
      const response = await apiFetch(editingId ? `/patients/${editingId}` : "/patients", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (response.status === 409 && !allowDuplicate) {
        setDuplicatePending(true);
        throw new Error(await readApiError(response, "A similar patient exists"));
      }
      if (!response.ok) throw new Error(await readApiError(response, "Patient could not be saved"));
      const saved = (await response.json()) as PatientProfile;
      onPatientSelected(saved);
      setNotice(editingId ? "Patient profile updated." : "Patient profile created and selected.");
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      setDuplicatePending(false);
      await loadPatients();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Patient could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    localStorage.removeItem("slma_session_id");
    router.replace("/login");
  }

  return (
    <section className="shrink-0 border-b border-slate-800 bg-slate-950/95">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3 text-xs">
          <UserRoundCheck size={16} className="shrink-0 text-teal-400" />
          <span className="font-semibold text-slate-200">Doctor-entered patient profile</span>
          <span className="truncate text-slate-400">
            {selectedPatient ? `${patientDisplayName(selectedPatient)} - ${selectedPatient.gender || "gender not set"}` : "No patient selected"}
          </span>
          <span className={activeSessionId ? "text-emerald-300" : "text-amber-300"}>
            {activeSessionId ? "Consultation connected" : "No active consultation"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded((value) => !value)} className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Patient workspace
          </button>
          <button onClick={logout} title="Sign out" className="p-1.5 text-slate-500 hover:text-white"><LogOut size={15} /></button>
        </div>
      </div>

      {expanded && (
        <div className="grid max-h-[210px] grid-cols-1 gap-3 overflow-y-auto border-t border-slate-800/80 px-4 py-3 lg:grid-cols-[1.1fr_1fr_1fr]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Search size={14} className="text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or phone"
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs outline-none transition-colors focus:border-teal-500"
              />
              <button onClick={beginCreatePatient} title="Add New Patient" className="p-2 text-teal-300">
                <Plus size={15} />
              </button>
            </div>
            <div className="max-h-[155px] space-y-1 overflow-y-auto">
              {patients.map((patient) => (
                <div key={patient.patient_id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${selectedPatient?.patient_id === patient.patient_id ? "border-teal-600 bg-teal-950/30" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}>
                  <button onClick={() => onPatientSelected(patient)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-medium">{patientDisplayName(patient)}</span>
                    <span className="block truncate text-[10px] text-slate-500">{patient.phone || "No phone"} - {patient.age ?? "--"} years</span>
                  </button>
                  <button onClick={() => openPatientDetails(patient)} title="Patient Details" className="p-1 text-blue-300">
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              {patients.length === 0 && <p className="py-4 text-center text-xs text-slate-500">No patient profiles found.</p>}
            </div>
          </div>

          <div className="min-w-0 border-l border-slate-800 pl-3">
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2"><ClipboardList size={14} className="text-blue-400" /><p className="font-semibold">Patient summary</p></div>
              {selectedPatient ? (
                <>
                  <p className="truncate text-slate-300">{patientDisplayName(selectedPatient)}</p>
                  <p className="text-slate-500">Age: {selectedPatient.age ?? "--"} - Gender: {selectedPatient.gender || "--"}</p>
                  <p className="text-slate-500">DOB: {selectedPatient.date_of_birth || "--"} - Blood: {selectedPatient.blood_group || "--"}</p>
                  <p className="truncate text-slate-500">Contact: {selectedPatient.phone || "Not recorded"}</p>
                </>
              ) : (
                <p className="text-slate-500">Search or create a patient profile here. Patients do not create accounts or fill profile forms.</p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={() => selectedPatient && openPatientDetails(selectedPatient)} disabled={!selectedPatient} className="rounded-md border border-blue-700 px-2 py-2 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-blue-950/40 disabled:opacity-40">
                  Patient Details
                </button>
                <button type="button" onClick={beginCreatePatient} className="rounded-md border border-teal-700 bg-teal-950/30 px-2 py-2 text-[11px] font-semibold text-teal-200 transition-colors hover:bg-teal-900/40">
                  Add New Patient
                </button>
              </div>
            </div>
          </div>

          <div className="min-w-0 border-l border-slate-800 pl-3 text-xs">
            <p className="mb-2 font-semibold text-slate-300">Consultation actions</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={onStartConsultation} disabled={!selectedPatient || !!activeSessionId || sessionBusy} className="rounded-md bg-teal-700 px-2 py-2 font-semibold transition-colors hover:bg-teal-600 disabled:opacity-40">Start</button>
              <button onClick={onLoadLatest} disabled={sessionBusy} className="rounded-md border border-blue-700 px-2 py-2 text-blue-300 transition-colors hover:bg-blue-950/40 disabled:opacity-40">Load active</button>
              <button onClick={onEndConsultation} disabled={!activeSessionId || sessionBusy} className="rounded-md border border-red-800 px-2 py-2 text-red-300 transition-colors hover:bg-red-950/40 disabled:opacity-40">End</button>
            </div>
            <p className="mt-3 mb-1 font-semibold text-slate-300">Patient history</p>
            <div className="max-h-[105px] space-y-1 overflow-y-auto">
              {history.map((entry) => (
                <div key={entry.session._id} className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                  <div className="flex justify-between"><span>{entry.session.started_at ? new Date(entry.session.started_at).toLocaleDateString() : "Unknown date"}</span><span className="capitalize text-slate-500">{entry.session.status || "active"}</span></div>
                  <p className="truncate text-[10px] text-slate-500">{entry.predictions.map((prediction) => prediction.top1_gloss).join(", ") || "No predictions"}</p>
                  <p className="truncate text-[10px] text-slate-500">{entry.doctor_responses.at(-1)?.text || entry.doctor_responses.at(-1)?.final_text || "No doctor response"}</p>
                </div>
              ))}
              {selectedPatient && history.length === 0 && <p className="text-slate-500">No consultation history.</p>}
            </div>
          </div>
          {(error || notice) && <div className={`xl:col-span-3 px-2 py-1 text-xs ${error ? "bg-red-950/60 text-red-300" : "bg-emerald-950/50 text-emerald-300"}`}>{error || notice}</div>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <form onSubmit={(event) => void savePatient(event)} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">{editingId ? "Patient Details" : "Add New Patient"}</p>
                <p className="mt-1 text-xs text-slate-500">Doctor-entered profile for this consultation. No patient signup is required.</p>
              </div>
              <button type="button" onClick={closePatientModal} className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-500">
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 text-xs sm:grid-cols-2">
              {patientFields.map((field) => (
                <label key={field.key} className={`${"wide" in field && field.wide ? "sm:col-span-2 " : ""}text-slate-400`}>
                  {field.label}
                  <input
                    required={("required" in field && field.required) || (field.key === "age" && !form.date_of_birth)}
                    type={"type" in field ? field.type : "text"}
                    value={form[field.key]}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-teal-500"
                  />
                </label>
              ))}
              <label className="sm:col-span-2 text-slate-400">
                Medical History / Notes
                <textarea
                  value={form.medical_notes}
                  onChange={(event) => setForm((current) => ({ ...current, medical_notes: event.target.value }))}
                  rows={4}
                  className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-teal-500"
                />
              </label>
            </div>
            {(error || notice || duplicatePending) && (
              <div className={`mx-5 mb-3 rounded-md px-3 py-2 text-xs ${error || duplicatePending ? "bg-red-950/50 text-red-200" : "bg-emerald-950/50 text-emerald-200"}`}>
                {error || notice || "A similar patient may already exist. Review before creating a duplicate."}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 px-5 py-4">
              {duplicatePending && <button type="button" onClick={() => void savePatient(null, true)} className="rounded-md border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-300">Create anyway</button>}
              <button type="button" onClick={closePatientModal} className="rounded-md border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300">Cancel</button>
              <button disabled={busy} className="rounded-md bg-teal-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {busy ? "Saving..." : editingId ? "Save Patient Details" : "Create Patient"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
