// Proteções de execução: bloqueio de domínio, anti-iframe (clickjacking), dissuasão de ferramentas de desenvolvedor.
// IMPORTANTE: tudo que roda no navegador do usuário é, por natureza, dissuasão — quem controla o computador pode contornar.
// A proteção forte vem de: licença/autenticação no servidor, o servidor só entregar o programa a clientes autorizados e CSP/HTTPS.
import { SECURITY } from "./config";

export function hostAllowed(loc: { protocol: string; hostname: string }, hosts: string[], allowFile: boolean): boolean {
  if (loc.protocol === "file:") return allowFile;
  const h = loc.hostname.toLowerCase();
  return hosts.some((a) => h === a || h.endsWith("." + a));
}
export function frameAllowed(top: boolean, parentOrigin: string | null, origins: string[]): boolean {
  if (top) return true;
  return !!parentOrigin && origins.includes(parentOrigin.toLowerCase());
}
export interface GuardResult { ok: boolean; reason?: string }

export function checkEnvironment(): GuardResult {
  if (!SECURITY.harden) return { ok: true };
  if (!hostAllowed(location, SECURITY.hosts, SECURITY.allowFile)) return { ok: false, reason: "Este programa não está autorizado a rodar neste endereço." };
  const top = window.top === window.self;
  let parent: string | null = null;
  try { parent = document.referrer ? new URL(document.referrer).origin : (location.ancestorOrigins?.[0] ?? null); } catch { parent = null; }
  if (!frameAllowed(top, parent, SECURITY.embedOrigins)) return { ok: false, reason: "Incorporação em outro site não autorizada." };
  return { ok: true };
}

/** dissuasão de F12/inspeção; chama onOpen quando detecta ferramentas abertas */
export function installDevtoolsDeterrent(onOpen: () => void): () => void {
  if (!SECURITY.harden) return () => {};
  const keys = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c", "k"].includes(k)) || ((e.ctrlKey || e.metaKey) && ["u", "s"].includes(k) && !(e.target instanceof HTMLInputElement))) { e.preventDefault(); e.stopPropagation(); }
  };
  const menu = (e: Event) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault(); };
  window.addEventListener("keydown", keys, true); window.addEventListener("contextmenu", menu, true);
  let opened = false;
  const probe = () => {
    const gap = window.outerWidth - window.innerWidth > 170 || window.outerHeight - window.innerHeight > 220;
    const t0 = performance.now(); // eslint-disable-next-line no-debugger
    debugger;
    const slow = performance.now() - t0 > 120;
    if ((gap || slow) && !opened) { opened = true; onOpen(); } else if (!gap && !slow) opened = false;
  };
  const id = window.setInterval(probe, 1500);
  const neutral = () => { for (const m of ["log", "info", "debug", "table", "dir", "trace"] as const) (console as unknown as Record<string, unknown>)[m] = () => {}; };
  neutral();
  console.warn("%cPare!", "color:#d00;font-size:36px;font-weight:bold", "\nEste recurso do navegador é para desenvolvedores. Se alguém pediu para você colar algo aqui, é golpe: isso dá acesso aos dados dos pacientes.");
  return () => { clearInterval(id); window.removeEventListener("keydown", keys, true); window.removeEventListener("contextmenu", menu, true); };
}
