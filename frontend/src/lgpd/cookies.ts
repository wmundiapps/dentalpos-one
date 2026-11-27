// Escolha de cookies do visitante. Guardada no navegador (e registrada na API quando a instituição é conhecida).
const KEY = "dentalpos.cookies.v1";
export const VERSAO_AVISO_COOKIES = "1.0-modelo";

export type CategoriaCookie = "COOKIES_PREFERENCIAS" | "COOKIES_ANALITICOS" | "COOKIES_MARKETING";
export interface EscolhaCookies {
  versao: string;
  decididoEm: string;
  necessarios: true;                         // sempre ativos (não dependem de consentimento)
  opcionais: Record<CategoriaCookie, boolean>;
}

export const CATEGORIAS: Array<{ codigo: CategoriaCookie; titulo: string; descricao: string }> = [
  { codigo: "COOKIES_PREFERENCIAS", titulo: "Preferências", descricao: "Lembram escolhas como tema e filtros para personalizar a experiência." },
  { codigo: "COOKIES_ANALITICOS", titulo: "Estatísticas", descricao: "Ajudam a entender, de forma agregada, como as páginas públicas são usadas." },
  { codigo: "COOKIES_MARKETING", titulo: "Campanhas", descricao: "Medem a origem das inscrições (UTM) e permitem divulgação mais relevante." },
];

export function lerEscolha(): EscolhaCookies | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || "null");
    if (r && r.versao === VERSAO_AVISO_COOKIES && r.opcionais) return r as EscolhaCookies;
  } catch { /* sem armazenamento */ }
  return null;
}

export function salvarEscolha(opcionais: Record<CategoriaCookie, boolean>): EscolhaCookies {
  const e: EscolhaCookies = { versao: VERSAO_AVISO_COOKIES, decididoEm: new Date().toISOString(), necessarios: true, opcionais };
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* ignora */ }
  window.dispatchEvent(new CustomEvent("dentalpos:cookies", { detail: e }));
  return e;
}

/** Use antes de gravar qualquer cookie/armazenamento opcional: false até o visitante aceitar. */
export function cookieOpcionalPermitido(c: CategoriaCookie): boolean {
  return lerEscolha()?.opcionais?.[c] === true;
}
