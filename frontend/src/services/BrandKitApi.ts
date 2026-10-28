import { readSessionUser, writeSessionUser } from "./DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Erro HTTP ${r.status}`); }
  return r.json() as Promise<T>;
}

export interface ClinicIdentity {
  name: string; displayName?: string | null; logo?: string | null; primaryColor?: string | null;
  phone?: string | null; email?: string | null; cnpj?: string | null;
  address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null;
}

// Dados extras do kit, guardados em ClinicBrandKit.data.
export interface KitPersonOverride { role?: string; phone?: string; email?: string; hidden?: boolean }
export interface KitExtraPerson { key: string; name: string; role: string; cro: string; phone: string; email: string }
export interface ControlledText { titulo: string; codigo: string; rev: string; elab: string; aprov: string; texto: string }
export interface BrandKitData {
  tagline?: string; whatsapp?: string; site?: string; instagram?: string;
  rtName?: string; rtCro?: string;
  logoWidthMm?: number;
  cardOrient?: "h" | "v"; cardQR?: boolean;
  people?: Record<string, KitPersonOverride>;
  extraPeople?: KitExtraPerson[];
  texts?: { contrato?: string; manual?: ControlledText; it?: ControlledText; pop?: ControlledText };
}

export interface BrandKitResponse { clinic: ClinicIdentity; kit: BrandKitData; kitReady: boolean }

export async function loadBrandKit(): Promise<BrandKitResponse> {
  return parse(await fetch(`${API}/settings/brand-kit`, { headers: headers() }));
}

export async function saveBrandKit(kit: BrandKitData): Promise<BrandKitData> {
  const r = await parse<{ kit: BrandKitData }>(await fetch(`${API}/settings/brand-kit`, { method: "PUT", headers: headers(true), body: JSON.stringify({ kit }) }));
  return r.kit;
}

export type ClinicIdentityInput = Partial<Omit<ClinicIdentity, "name">>;

// Salva a identidade no cadastro da clínica e atualiza a sessão (cabeçalho, impressão).
export async function saveClinicIdentity(input: ClinicIdentityInput): Promise<ClinicIdentity> {
  const clinic = await parse<ClinicIdentity>(await fetch(`${API}/settings/clinic`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) }));
  applyIdentityToSession(clinic);
  return clinic;
}

export function applyIdentityToSession(clinic: ClinicIdentity) {
  const user = readSessionUser();
  if (user) writeSessionUser({ ...user, clinic: { ...(user.clinic || {}), name: clinic.name, displayName: clinic.displayName ?? null, logo: clinic.logo ?? null } });
  try {
    if (clinic.logo) localStorage.setItem("dentalpos.clinicLogo", clinic.logo); else localStorage.removeItem("dentalpos.clinicLogo");
    localStorage.setItem("dentalpos.clinic.identity.v1", JSON.stringify({ name: clinic.displayName || clinic.name, logo: clinic.logo || "" }));
  } catch { /* armazenamento cheio: a sessão já foi atualizada */ }
  window.dispatchEvent(new Event("dentalpos:identity"));
}

// Reduz a imagem enviada para no máximo 512 px e devolve como data URL (PNG ou o próprio SVG).
export async function prepareLogo(file: File): Promise<string> {
  if (file.size > 5_000_000) throw new Error("Use uma imagem de até 5 MB.");
  const raw = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error("Não foi possível ler a imagem.")); fr.readAsDataURL(file); });
  if (file.type === "image/svg+xml") { if (raw.length > 600_000) throw new Error("SVG muito grande (máx. 450 KB)."); return raw; }
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Formato de imagem não suportado.")); i.src = raw; });
  const max = 512; const s = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext("2d")?.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/png");
}
