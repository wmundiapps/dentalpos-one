const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: init.method || "GET", headers: headers(init.body !== undefined), body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}
export interface AppointmentMarker { id: string; name: string; color: string }
export const AppointmentMarkerApi = {
  list: () => call<AppointmentMarker[]>("/appointment-markers"),
  create: (name: string, color: string) => call<AppointmentMarker>("/appointment-markers", { method: "POST", body: { name, color } }),
  update: (id: string, data: Partial<{ name: string; color: string; isActive: boolean }>) => call<AppointmentMarker>(`/appointment-markers/${encodeURIComponent(id)}`, { method: "PUT", body: data }),
  links: (ids: string[]) => call<Array<{ appointmentId: string; markerId: string }>>("/appointment-markers/links", { method: "POST", body: { ids } }),
  set: (appointmentId: string, markerIds: string[]) => call<{ ok: boolean; markerIds: string[] }>(`/appointments/${encodeURIComponent(appointmentId)}/markers`, { method: "PUT", body: { markerIds } }),
};
