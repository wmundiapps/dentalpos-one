const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export type Formato = "POST" | "STORY" | "REEL";
export interface ConteudoIA { legenda: string; hashtags: string[]; telas: { titulo: string; texto: string }[]; fala: string; ideiaVisual: string }
export interface AvatarInfo { ativoNaPlataforma: boolean; creditosPorVideo: number; avatar: { pessoa: string; consentimentoEm: string } | null }
export interface VideoAvatar { status: "PROCESSANDO" | "PRONTO" | "FALHOU"; videoUrl?: string; reason?: string }

function headers() {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(clinicId ? { "X-Clinic-ID": clinicId } : {}) };
}

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Erro HTTP ${response.status}`);
  return body as T;
}

export const gerarConteudo = async (input: { formato: Formato; tema: string; tom?: string }) =>
  parse<ConteudoIA>(await fetch(`${API}/marketing-studio/content`, { method: "POST", headers: headers(), body: JSON.stringify(input) }));

export const getAvatar = async () => parse<AvatarInfo>(await fetch(`${API}/marketing-studio/avatar`, { headers: headers() }));

export const saveAvatar = async (input: { avatarId: string; voiceId: string; pessoa: string; autorizacao: boolean }) =>
  parse<{ pessoa: string; consentimentoEm: string }>(await fetch(`${API}/marketing-studio/avatar`, { method: "PUT", headers: headers(), body: JSON.stringify(input) }));

export const criarVideo = async (fala: string) =>
  parse<{ videoId: string; creditos: number }>(await fetch(`${API}/marketing-studio/video`, { method: "POST", headers: headers(), body: JSON.stringify({ fala }) }));

export const getVideo = async (id: string) => parse<VideoAvatar>(await fetch(`${API}/marketing-studio/video/${encodeURIComponent(id)}`, { headers: headers() }));
