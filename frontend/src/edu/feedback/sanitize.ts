// Sanitização no navegador ANTES do envio (o servidor repete e reforça). Nada de token, senha, CPF, e-mail ou telefone sai daqui.
const RULES: Array<[RegExp, string]> = [
  [/data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+/g, "[data-url-omitida]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, "[jwt-omitido]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [omitido]"],
  [/((?:senha|password|passwd|secret|token|api[-_]?key|authorization|access[-_]?token|refresh[-_]?token)["']?\s*[:=]\s*["']?)([^"'\s&,;}{]{1,200})/gi, "$1[omitido]"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[cpf]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail]"],
  [/(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g, "[telefone]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]"],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, "[token-omitido]"],
  [/(https?:\/\/[^\s"')]+)\?[^\s"')]*/g, "$1?[query-omitida]"],
];
export function sanitizar(s: unknown, max = 8000): string {
  let t = typeof s === "string" ? s : (() => { try { return JSON.stringify(s); } catch { return String(s); } })();
  for (const [re, to] of RULES) t = t.replace(re, to);
  return t.length > max ? t.slice(0, max) + "\n[...truncado]" : t;
}

// ---- captura dos últimos erros/avisos do console (anel de 40 entradas) ----
type Entrada = { t: string; n: string; m: string };
const anel: Entrada[] = [];
let instalado = false;
const push = (n: string, args: unknown[]) => {
  try {
    anel.push({ t: new Date().toISOString().slice(11, 19), n, m: sanitizar(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}\n${(a.stack || "").split("\n").slice(0, 4).join("\n")}` : typeof a === "string" ? a : sanitizar(a, 500))).join(" "), 600) });
    if (anel.length > 40) anel.shift();
  } catch { /* nunca quebra a página */ }
};
export function instalarCapturaConsole() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  for (const n of ["error", "warn"] as const) {
    const orig = console[n].bind(console);
    console[n] = (...args: unknown[]) => { push(n, args); orig(...args); };
  }
  window.addEventListener("error", (e) => push("error", [e.message, e.filename ? e.filename.split("/").pop() : "", e.lineno]));
  window.addEventListener("unhandledrejection", (e) => push("error", ["Promise rejeitada:", (e.reason as any)?.message ?? String(e.reason)]));
}
export const logsCapturados = () => anel.map((e) => `[${e.t}] ${e.n.toUpperCase()} ${e.m}`).join("\n");
