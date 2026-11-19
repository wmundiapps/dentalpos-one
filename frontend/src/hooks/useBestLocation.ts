import { useCallback, useEffect, useRef, useState } from "react";

export type GeoFix = { latitude: number; longitude: number; accuracy: number };
export type GeoStatus = "searching" | "ok" | "denied" | "unavailable";

// Localização do aparelho para o ponto: dois "ouvintes" ao mesmo tempo (um rápido, de rede/Wi-Fi, e um de GPS de alta precisão)
// e guarda sempre a MELHOR leitura dos últimos segundos. Assim o primeiro local aparece logo e depois vai ficando mais exato.
// Erro de tempo esgotado não é falha: o GPS só está demorando, e a busca continua.
export function useBestLocation() {
  const best = useRef<(GeoFix & { at: number }) | null>(null);
  const startedAt = useRef(Date.now());
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoStatus>("searching");
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    best.current = null; startedAt.current = Date.now(); setAccuracy(null); setStatus("searching");
    if (!navigator.geolocation) { setStatus("unavailable"); return; }
    const onFix = (p: GeolocationPosition) => {
      const now = Date.now();
      const cur = best.current;
      if (!cur || p.coords.accuracy <= cur.accuracy || now - cur.at > 25000) {
        best.current = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, at: now };
        setAccuracy(Math.round(p.coords.accuracy));
      }
      setStatus("ok");
    };
    const onError = (e: GeolocationPositionError) => { if (e.code === 1) setStatus("denied"); else if (e.code === 2 && !best.current) setStatus("unavailable"); };
    const fast = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
    const precise = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 });
    return () => { navigator.geolocation.clearWatch(fast); navigator.geolocation.clearWatch(precise); };
  }, [runId]);

  const restart = useCallback(() => setRunId((n) => n + 1), []);
  // Espera uma leitura boa (até o limite de tempo) e devolve a melhor que houver; quem chama decide se serve.
  const waitForFix = useCallback(async (target: number, maxMs: number) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end && !(best.current && best.current.accuracy <= target)) await new Promise((r) => setTimeout(r, 400));
    const b = best.current;
    return b ? { latitude: b.latitude, longitude: b.longitude, accuracy: b.accuracy } : null;
  }, []);
  const secondsSearching = () => Math.round((Date.now() - startedAt.current) / 1000);
  return { best, accuracy, status, restart, waitForFix, secondsSearching };
}

// Texto de ajuda quando o aparelho não acha o local.
export const GEO_HELP = "Confira: localização do aparelho LIGADA; permissão do navegador para o local (Permitir); sem modo de economia de bateria; e fique perto de uma janela ou área aberta. No iPhone: Ajustes > Privacidade > Serviços de Localização > Safari > \"Ao usar\". Use o celular do polo, não o computador.";
