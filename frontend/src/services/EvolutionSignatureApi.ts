const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function parse<T>(r: Response): Promise<T> {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}
export interface EvolutionSignature {
  evolutionId: string; contentHash: string; intact: boolean;
  patientSignature?: string | null; patientSignerName?: string | null; patientSignedAt?: string | null; patientIp?: string | null;
  dentistSignature?: string | null; dentistSignerName?: string | null; dentistSignedAt?: string | null; dentistIp?: string | null;
}
export const EvolutionSignatureApi = {
  list: async (patientId: string) => parse<EvolutionSignature[]>(await fetch(`${API}/patients/${encodeURIComponent(patientId)}/evolution-signatures`, { headers: headers() })),
  sign: async (evolutionId: string, role: "PATIENT" | "DENTIST", signerName: string, signature: string) =>
    parse<{ ok: boolean }>(await fetch(`${API}/evolutions/${encodeURIComponent(evolutionId)}/signature`, { method: "POST", headers: headers(true), body: JSON.stringify({ role, signerName, signature }) })),
};
