export class ApiError extends Error {
  constructor(public status: number, public code: string, public params?: unknown) {
    super(code);
  }
}

let authToken: string | null = null;
try { authToken = localStorage.getItem('sh_token'); } catch { /* sem storage */ }

export function setToken(t: string | null) {
  authToken = t;
  try {
    if (t) localStorage.setItem('sh_token', t);
    else localStorage.removeItem('sh_token');
  } catch { /* ignore */ }
}
export const hasToken = () => !!authToken;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'internal', data.params);
  return data as T;
}

/** Envio de arquivos (multipart). O navegador define o Content-Type com o boundary. */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? (res.status === 413 ? 'file_too_large' : 'internal'), data.params);
  return data as T;
}

/** Baixa um arquivo protegido (ex.: documento para a equipe) e devolve uma URL local. */
export async function apiBlobUrl(path: string): Promise<string> {
  const res = await fetch(`/api${path}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'not_found');
  return URL.createObjectURL(await res.blob());
}
