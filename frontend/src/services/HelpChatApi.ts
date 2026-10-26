const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export interface HelpMessage { role: "user" | "assistant"; content: string }

export async function askHelp(message: string, history: HelpMessage[], page: string): Promise<string> {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  const r = await fetch(`${API}/ai/help`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) },
    body: JSON.stringify({ message, history: history.slice(-8), page }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return String(d.texto || "");
}
