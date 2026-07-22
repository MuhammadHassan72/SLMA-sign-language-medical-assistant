export function getBackendUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const browserHost = window.location.hostname;
    if (browserHost === "localhost") {
      return "http://localhost:8000";
    }
    return `http://${browserHost}:8000`;
  }
  return configuredUrl || "http://localhost:8000";
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${getBackendUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
}

export async function readApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (typeof detail === "string") return detail;
    if (detail?.message) return detail.message as string;
  } catch {
    // Keep the caller's concise fallback when the response is not JSON.
  }
  return `${fallback} (${response.status})`;
}

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  role: "admin" | "doctor";
  status: "active" | "inactive" | "pending";
  created_at?: string;
  last_login_at?: string | null;
}

export interface DoctorProfile {
  doctor_id: string;
  user_id: string;
  specialization?: string;
  hospital_name?: string;
  phone?: string;
  license_no?: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  doctor_profile?: DoctorProfile | null;
}
