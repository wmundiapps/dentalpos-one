import { Alert, Box, Button, FormControlLabel, Switch } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { useCallback, useEffect, useRef, useState } from "react";
import { A, call, itemsOf } from "./kit";

const CHAVE = "edu.atd.alertaSonoro";
const INTERVALO_MS = 15000;

/** Três toques curtos (Web Audio, sem arquivo). Só toca depois de o usuário interagir com a página (regra dos navegadores). */
function tocar(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  [0, 0.28, 0.56].forEach((d, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = i === 2 ? 1180 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
    o.connect(g); g.connect(ctx.destination); o.start(t0 + d); o.stop(t0 + d + 0.24);
  });
}

/** Precisa de uma pessoa: aberto, ainda sem atendente (a IA não resolveu ou o cliente pediu), ou com mensagem nova não lida. */
const precisaHumano = (a: any) => (["NOVO", "EM_FILA"].includes(a.status) && !a.atribuidoAId) || (a.naoLidas ?? 0) > 0;

export default function AlertaHumano({ onAbrir }: { onAbrir?: (id: string) => void }) {
  const [ligado, setLigado] = useState<boolean>(() => { try { return localStorage.getItem(CHAVE) !== "0"; } catch { return true; } });
  const [fila, setFila] = useState<any[]>([]);
  const [novo, setNovo] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const visto = useRef<Map<string, number> | null>(null);

  const destravar = useCallback(() => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      if (!ctx.current) ctx.current = new AC();
      if (ctx.current!.state === "suspended") void ctx.current!.resume();
      return ctx.current;
    } catch { return null; }
  }, []);

  useEffect(() => {
    const h = () => { destravar(); };
    window.addEventListener("pointerdown", h, { once: true });
    return () => window.removeEventListener("pointerdown", h);
  }, [destravar]);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const r = await call<any>("GET", `${A}/atendimentos?status=ABERTOS&pageSize=50`);
        if (!vivo) return;
        const lista = itemsOf(r).filter(precisaHumano);
        setFila(lista);
        const atual = new Map<string, number>(lista.map((a: any) => [a.id, a.naoLidas ?? 0]));
        if (visto.current) {
          const chegou = lista.some((a: any) => !visto.current!.has(a.id) || (a.naoLidas ?? 0) > (visto.current!.get(a.id) ?? 0));
          if (chegou) {
            setNovo(true);
            if (ligado) { const c = destravar(); if (c) tocar(c); }
            window.setTimeout(() => vivo && setNovo(false), 8000);
          }
        }
        visto.current = atual;
      } catch { /* sem acesso ou rede: tenta de novo no próximo ciclo */ }
    };
    void ler();
    const t = window.setInterval(ler, INTERVALO_MS);
    return () => { vivo = false; window.clearInterval(t); };
  }, [ligado, destravar]);

  const alternar = (v: boolean) => {
    setLigado(v);
    try { localStorage.setItem(CHAVE, v ? "1" : "0"); } catch { /* ignora */ }
    if (v) { const c = destravar(); if (c) tocar(c); }
  };

  return (
    <Box sx={{ display: "grid", gap: 1, mb: 1.5 }}>
      {fila.length > 0 && (
        <Alert severity={novo ? "error" : "warning"} icon={<NotificationsActiveIcon />}
          action={onAbrir ? <Button color="inherit" size="small" onClick={() => onAbrir(fila[0].id)}>Atender</Button> : undefined}
          sx={novo ? { animation: "pulsoAtd 1s ease-in-out 4" , "@keyframes pulsoAtd": { "50%": { opacity: 0.55 } } } : undefined}>
          {fila.length === 1 ? "1 atendimento aguarda uma pessoa" : `${fila.length} atendimentos aguardam uma pessoa`}: {fila.slice(0, 2).map((a: any) => a.solicitanteNome).join(", ")}{fila.length > 2 ? "…" : ""}
        </Alert>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <FormControlLabel control={<Switch checked={ligado} onChange={(e) => alternar(e.target.checked)} />} label="Alerta sonoro quando a IA passar para um atendente" />
        <Button size="small" variant="outlined" onClick={() => { const c = destravar(); if (c) tocar(c); }}>Testar som</Button>
      </Box>
    </Box>
  );
}
