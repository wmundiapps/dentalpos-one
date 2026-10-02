// Utilitários compartilhados do painel executivo (reitoria) e da Minha Mesa.
const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const MODULOS = new Set([
  "minha-mesa", "jornadas", "admissoes", "secretaria", "calendario", "notas", "modalidades", "desempenho", "biblioteca", "regulatorio",
  "governanca", "infraestrutura", "suprimentos", "pesquisa", "apoio", "comunicacao", "portal-aluno", "identidade",
]);

/** Mapeia a rota sugerida pelo backend para uma rota real do app (/edu/<modulo>); null se desconhecida. */
export function mapRota(rota?: string | null, modulo?: string | null): string | null {
  const segs = String(rota || "").split("?")[0].split("/").filter(Boolean);
  if (segs[0] === "academico") return "/academico";
  if (segs[0] === "edu") {
    if (segs.length === 1) return "/edu";
    if (MODULOS.has(segs[1])) return `/edu/${segs[1]}`;
    if (segs[1] === "reitoria") return "/edu";
    return null;
  }
  if (segs.length && MODULOS.has(segs[0])) return `/edu/${segs[0]}`;
  if (modulo === "reitoria") return "/edu";
  if (modulo && MODULOS.has(modulo)) return `/edu/${modulo}`;
  return null;
}

export const SEMAFORO_COR: Record<string, string> = { VERDE: "#2E9E5B", AMARELO: "#E5A100", VERMELHO: "#D64545", CINZA: "#9AA3AF" };
export const SEMAFORO_LABEL: Record<string, string> = { VERDE: "No alvo", AMARELO: "Atenção", VERMELHO: "Crítico", CINZA: "Sem dados" };

export function fmtValor(v: number | null | undefined, unidade?: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (unidade === "R$") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const n = v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (unidade === "%") return `${n}%`;
  return unidade ? `${n} ${unidade}` : n;
}

export const fmtData = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
export const fmtDataHora = (v: any) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

export const PERFIL_LABEL: Record<string, string> = {
  reitoria: "Reitoria", administracao: "Administração / Financeiro", coordenacao: "Coordenação", secretaria: "Secretaria",
  professor: "Professor", biblioteca: "Biblioteca", infraestrutura: "Infraestrutura", admissoes: "Admissões / Marketing",
};

/** Requisição autenticada que devolve texto (HTML/CSV) — o eduApi só trata JSON. */
export async function fetchTexto(path: string): Promise<string> {
  const token = localStorage.getItem("dentalpos.token") || "";
  const res = await fetch(`${API}/edu${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error || `Erro ${res.status}`);
  }
  return res.text();
}

export function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function abrirHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const w = window.open(url, "_blank");
  if (!w) throw new Error("O navegador bloqueou a nova janela. Libere pop-ups para imprimir o relatório.");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const msgErro = (e: any) => (e?.message as string) || "Não foi possível concluir a operação.";
