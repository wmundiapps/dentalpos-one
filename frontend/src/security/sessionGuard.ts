// Sessão do navegador: logout em todas as abas e expiração por inatividade.
//
// LIMITAÇÃO: o JWT continua em localStorage (a API usa Authorization: Bearer). Isso o expõe a XSS;
// a mitigação é a CSP estrita (script-src 'self'), o 2FA e a expiração curta do token no servidor.
import { appRootUrl, clearClientSession } from "../services/DemoAccess";

const CANAL = "dentalpos-sessao";
const CHAVE_ATIVIDADE = "dentalpos.lastActivity";
export const CHAVE_MOTIVO = "dentalpos.logoutReason";

/** Minutos de inatividade até sair sozinho. 0 desliga. Configurável por VITE_IDLE_TIMEOUT_MINUTES. */
export function minutosDeInatividade(): number {
  const bruto = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES ?? 240);
  return Number.isFinite(bruto) && bruto >= 0 ? bruto : 240;
}

let canal: BroadcastChannel | null = null;
function obterCanal() {
  if (canal || typeof BroadcastChannel === "undefined") return canal;
  try {
    canal = new BroadcastChannel(CANAL);
  } catch {
    canal = null;
  }
  return canal;
}

/** Encerra a sessão aqui e avisa as outras abas. */
export function endSession(motivo?: "idle" | "remote") {
  clearClientSession();
  try {
    localStorage.removeItem(CHAVE_ATIVIDADE);
    if (motivo) sessionStorage.setItem(CHAVE_MOTIVO, motivo);
  } catch {
    // Armazenamento indisponível.
  }
  obterCanal()?.postMessage({ tipo: "logout" });
  window.location.href = appRootUrl();
}

function temSessao() {
  try {
    return !!localStorage.getItem("dentalpos.token");
  } catch {
    return false;
  }
}

export function startSessionGuard() {
  obterCanal()?.addEventListener("message", (e) => {
    if (e.data?.tipo !== "logout") return;
    try {
      sessionStorage.setItem(CHAVE_MOTIVO, "remote");
    } catch {
      // Armazenamento indisponível.
    }
    window.location.href = appRootUrl();
  });

  const limite = minutosDeInatividade() * 60_000;
  if (!limite) return;

  const ler = () => Number(localStorage.getItem(CHAVE_ATIVIDADE) || 0);
  const marcar = () => {
    try {
      if (temSessao()) localStorage.setItem(CHAVE_ATIVIDADE, String(Date.now()));
    } catch {
      // Armazenamento indisponível.
    }
  };

  const verificar = () => {
    try {
      if (!temSessao()) return;
      const ultima = ler();
      if (!ultima) return marcar();
      if (Date.now() - ultima > limite) endSession("idle");
    } catch {
      // Sem armazenamento: não expira por inatividade.
    }
  };

  let ultimoRegistro = 0;
  const atividade = () => {
    const agora = Date.now();
    if (agora - ultimoRegistro < 15_000) return;
    ultimoRegistro = agora;
    marcar();
  };

  verificar();
  ["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, atividade, { passive: true, capture: true }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") verificar();
  });
  window.setInterval(verificar, 30_000);
  marcar();
}
