import { useEffect } from "react";
import { appRootUrl, clearClientSession } from "../services/DemoAccess";

/** Encerra a sessão após N minutos sem atividade (padrão 60; VITE_IDLE_LOGOUT_MIN=0 desativa). */
export function useIdleLogout() {
  useEffect(() => {
    const minutes = Number(import.meta.env.VITE_IDLE_LOGOUT_MIN ?? 60);
    if (!minutes || minutes < 1) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        clearClientSession();
        window.location.href = appRootUrl();
      }, minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);
}
