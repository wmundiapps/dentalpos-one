/** Botão "ir resolver" que o servidor manda junto com alguns erros. */
export type ErrorAction = { to: string; label: string };
export class ApiError extends Error {
  constructor(public status: number, public code: string, public params?: unknown, public action?: ErrorAction) {
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
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'internal', data.params, safeAction(data.action));
  return data as T;
}

/** Só rotas internas do site (nunca um link externo vindo da resposta). */
function safeAction(a: unknown): ErrorAction | undefined {
  const x = a as ErrorAction | undefined;
  return x && typeof x.to === 'string' && /^\/(?!\/)/.test(x.to) && typeof x.label === 'string' ? x : undefined;
}

/** Envio de arquivos (multipart). O navegador define o Content-Type com o boundary. */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? (res.status === 413 ? 'file_too_large' : 'internal'), data.params);
  return data as T;
}

/** Documento sensível (equipe): foto abre em outra aba; PDF é baixado, nunca aberto dentro do site. */
export async function openProtectedFile(path: string, name = 'documento') {
  const res = await fetch(`/api${path}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'not_found');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (blob.type === 'application/pdf') {
    const a = document.createElement('a'); a.href = url; a.download = `${name}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else window.open(url, '_blank', 'noopener');
}

/** Baixa um arquivo protegido (ex.: documento para a equipe) e devolve uma URL local. */
export async function apiBlobUrl(path: string): Promise<string> {
  const res = await fetch(`/api${path}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'not_found');
  return URL.createObjectURL(await res.blob());
}
