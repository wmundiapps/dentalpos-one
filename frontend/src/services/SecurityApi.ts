// Cliente das APIs de segurança: 2FA (/auth/2fa e /security/2fa) e eventos de segurança.
const API = (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/$/, "");

export class SecurityApiError extends Error {
  status: number;
  code?: string;
  data?: any;
  /** Segundos até poder tentar de novo (bloqueio por tentativas), quando informado. */
  retryAfter?: number;
  constructor(message: string, status: number, data?: any, retryAfter?: number) {
    super(message);
    this.status = status;
    this.data = data;
    this.code = data?.code;
    this.retryAfter = retryAfter;
  }
  get bloqueado() {
    return this.status === 429 || this.status === 423 || /LOCK|TOO_MANY|BLOQUE/i.test(this.code || "");
  }
}

function mensagemPadrao(status: number) {
  if (status === 401) return "Código inválido ou expirado. Confira e tente de novo.";
  if (status === 403) return "Você não tem permissão para esta ação.";
  if (status === 404) return "Recurso de segurança indisponível neste ambiente.";
  if (status === 429 || status === 423) return "Muitas tentativas. Aguarde um pouco antes de tentar de novo.";
  if (status >= 500) return "O servidor não conseguiu concluir agora. Tente novamente em instantes.";
  return `Erro ${status}`;
}

async function request<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  // token === null: chamada anônima (ex.: segundo passo do login); undefined: usa a sessão atual.
  const t = token === null ? "" : token || localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(clinicId ? { "X-Clinic-ID": clinicId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SecurityApiError("Sem conexão com o servidor. Verifique a internet e tente de novo.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const header = Number(res.headers.get("Retry-After"));
    const retry = Number(data?.retryAfterSeconds ?? data?.retryAfter ?? (Number.isFinite(header) && header > 0 ? header : NaN));
    throw new SecurityApiError(data?.error || data?.message || mensagemPadrao(res.status), res.status, data, Number.isFinite(retry) ? retry : undefined);
  }
  return data as T;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt?: string | null;
  recoveryCodesRemaining?: number | null;
  required?: boolean;
}
export interface TwoFactorSetup { secret: string; otpauthUri: string }

export const securityApi = {
  status: (token?: string) => request<TwoFactorStatus>("GET", "/security/2fa/status", undefined, token),
  setup: (token?: string) => request<TwoFactorSetup>("POST", "/security/2fa/setup", {}, token),
  confirm: (code: string, token?: string) =>
    request<{ recoveryCodes: string[]; token?: string; accessToken?: string; user?: unknown }>("POST", "/security/2fa/confirm", { code }, token),
  disable: (password: string, code: string) => request<{ ok?: boolean }>("POST", "/security/2fa/disable", { password, code }),
  recoveryCodes: (code: string) => request<{ recoveryCodes: string[] }>("POST", "/security/2fa/recovery-codes", { code }),
  verifyLogin: (challengeToken: string, entrada: { code?: string; recoveryCode?: string }) =>
    request<any>("POST", "/auth/2fa/verify", { challengeToken, ...entrada }, null),
  events: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") q.set(k, String(v));
    });
    const s = q.toString();
    return request<any>("GET", `/security/events${s ? `?${s}` : ""}`);
  },
};
