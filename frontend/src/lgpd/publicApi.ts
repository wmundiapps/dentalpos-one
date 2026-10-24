// Cliente das rotas PÚBLICAS do módulo LGPD (/api/public/edu/lgpd/:instituicao/...). Sem token de sessão.
const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
const KEY_I = "dentalpos.lgpd.instituicao";
const KEY_VID = "dentalpos.lgpd.visitante";

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* armazenamento indisponível */ } }

/** Instituição (id/sigla) vem de ?i=..., do último acesso ou do usuário logado. Sem ela, só funciona o texto-modelo. */
export function instituicaoRef(): string | null {
  const q = new URLSearchParams(window.location.search).get("i");
  if (q && /^[A-Za-z0-9._-]{1,80}$/.test(q)) { safeSet(KEY_I, q); return q; }
  const salvo = safeGet(KEY_I);
  if (salvo) return salvo;
  try {
    const u = JSON.parse(safeGet("dentalpos.user") || "null");
    if (u?.tenantId) return String(u.tenantId);
  } catch { /* ignora */ }
  return null;
}

/** Identificador anônimo do navegador (usado só para provar/revogar a escolha de cookies). */
export function visitanteId(): string {
  let v = safeGet(KEY_VID);
  if (!v || v.length < 16) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    v = "v-" + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    safeSet(KEY_VID, v);
  }
  return v;
}

export class PublicApiError extends Error {
  status: number; data?: any;
  constructor(m: string, status: number, data?: any) { super(m); this.status = status; this.data = data; }
}

export async function pub<T = any>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const i = instituicaoRef();
  if (!i) throw new PublicApiError("Instituição não informada. Use o link fornecido pela sua instituição (…?i=sigla).", 400);
  const res = await fetch(`${API}/public/edu/lgpd/${encodeURIComponent(i)}${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PublicApiError(data?.error || `Erro ${res.status}`, res.status, data);
  return data as T;
}

export const ROTULOS_TIPO: Record<string, { titulo: string; ajuda: string }> = {
  CONFIRMACAO: { titulo: "Confirmar se tratam meus dados", ajuda: "Art. 18, I — resposta simples sobre a existência de tratamento." },
  ACESSO: { titulo: "Acessar meus dados", ajuda: "Art. 18, II — cópia dos dados pessoais que a instituição mantém sobre você." },
  CORRECAO: { titulo: "Corrigir dados incorretos", ajuda: "Art. 18, III — dados incompletos, inexatos ou desatualizados." },
  ANONIMIZACAO: { titulo: "Anonimizar ou bloquear dados", ajuda: "Art. 18, IV — dados desnecessários, excessivos ou tratados em desconformidade." },
  ELIMINACAO: { titulo: "Eliminar dados", ajuda: "Art. 18, VI — dados tratados com base no seu consentimento. O histórico escolar e registros fiscais são de guarda obrigatória (art. 16)." },
  PORTABILIDADE: { titulo: "Portabilidade dos dados", ajuda: "Art. 18, V — receber seus dados em formato estruturado (JSON) para levar a outro serviço." },
  INFO_COMPARTILHAMENTO: { titulo: "Saber com quem meus dados são compartilhados", ajuda: "Art. 18, VII — entidades públicas e privadas com as quais houve uso compartilhado." },
  REVOGACAO_CONSENTIMENTO: { titulo: "Revogar consentimento", ajuda: "Art. 18, IX — retirar uma autorização dada anteriormente." },
  OPOSICAO: { titulo: "Opor-me a um tratamento", ajuda: "Art. 18, §2º — quando o tratamento não depende de consentimento e você discorda." },
  REVISAO_AUTOMATIZADA: { titulo: "Revisar decisão automatizada", ajuda: "Art. 20 — pedir revisão por pessoa de decisões tomadas só por tratamento automatizado." },
};

export const ROTULO_BASE: Record<string, string> = {
  CONSENTIMENTO: "Consentimento", CONSENTIMENTO_DESTACADO: "Consentimento específico e destacado", CUMPRIMENTO_OBRIGACAO_LEGAL: "Obrigação legal ou regulatória", POLITICAS_PUBLICAS: "Políticas públicas",
  ESTUDOS_ORGAO_PESQUISA: "Estudos por órgão de pesquisa", EXECUCAO_CONTRATO: "Execução de contrato", EXERCICIO_REGULAR_DIREITOS: "Exercício regular de direitos", PROTECAO_VIDA: "Proteção da vida",
  TUTELA_SAUDE: "Tutela da saúde", LEGITIMO_INTERESSE: "Legítimo interesse", PROTECAO_CREDITO: "Proteção do crédito", GARANTIA_PREVENCAO_FRAUDE: "Prevenção à fraude",
};
