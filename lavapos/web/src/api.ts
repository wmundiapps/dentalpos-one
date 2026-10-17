const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
let token: string | null = null;
try { token = localStorage.getItem('lp_token'); } catch { /* navegação privada */ }

export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  try { t ? localStorage.setItem('lp_token', t) : localStorage.removeItem('lp_token'); } catch { /* ignora */ }
}

export class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token && !path.startsWith('/auth/login')) { setToken(null); window.dispatchEvent(new Event('lp:logout')); }
    throw new ApiError(r.status, j.error ?? 'Erro inesperado. Tente de novo.', j.code);
  }
  return j as T;
}

/** Reduz a foto no aparelho (máx. 1600 px) antes de enviar: upload rápido mesmo com 4G fraco. O servidor ainda a regrava e remove metadados. */
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('falha'))), 'image/jpeg', 0.85));
  } catch { return file; }
}

export async function uploadPhoto(blob: Blob, p: { orderId: string; phase: 'checkin' | 'checkout' | 'vitrine'; angle: string }) {
  const r = await fetch(`${BASE}/api/photos?phase=${p.phase}&angle=${encodeURIComponent(p.angle)}&orderId=${p.orderId}`, {
    method: 'POST', headers: { 'content-type': 'image/jpeg', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: blob,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'Não consegui enviar a foto.');
  return j as { id: string };
}

const blobCache = new Map<string, string>();
/** Foto privada: busca com a sessão e devolve um endereço local (blob:) para <img>. */
export async function privatePhotoUrl(id: string): Promise<string> {
  const hit = blobCache.get(id); if (hit) return hit;
  const r = await fetch(`${BASE}/api/photos/${id}/file`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new ApiError(r.status, 'Foto indisponível');
  const url = URL.createObjectURL(await r.blob());
  blobCache.set(id, url); return url;
}
export const publicPhotoUrl = (slug: string, id: string) => `${BASE}/api/public/l/${slug}/photo/${id}`;
export const apiBase = BASE;
