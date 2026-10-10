import { Alert, Box, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import TimerIcon from "@mui/icons-material/Timer";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { TrainingApi, type TrainingMe, type TrainingModule, CAREER_LEVEL_LABELS } from "../services/TrainingApi";
import { errorMessage, toast } from "../utils/toast";

const GAME_URL = "/treinamento/odonto-odisseia.html";
const HEARTBEAT_MS = 15000;

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

type GameMessage =
  | { type: "dp:ready" }
  | { type: "dp:save"; module: TrainingModule; state: unknown }
  | { type: "dp:prize"; module: TrainingModule };

export default function Training() {
  const { modulo } = useParams();
  const module: TrainingModule = modulo === "job-rotation" ? "jobrotation" : "carreira";
  const [me, setMe] = useState<TrainingMe | null>(null);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    setMe(null);
    setError("");
    TrainingApi.me()
      .then((data) => { if (alive) { setMe(data); setRemaining(data.usage.remainingSeconds); } })
      .catch((e) => { if (alive) setError(errorMessage(e, "Não foi possível abrir o treinamento.")); });
    return () => { alive = false; };
  }, [module]);

  const allowed = Boolean(me?.access[module]);

  useEffect(() => {
    if (!me || !allowed) return;
    const post = (msg: unknown) => frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);
    // Salvar e registrar prêmio passam por uma fila: o prêmio só é pedido depois que o progresso chegou ao servidor.
    const enqueue = (task: () => Promise<unknown>, failure: string) => {
      queue.current = queue.current.then(task).catch((e) => post({ type: "dp:error", message: errorMessage(e, failure) }));
    };
    const onMessage = (event: MessageEvent<GameMessage>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "dp:ready") {
        post({ type: "dp:init", data: { userName: me.userName, settings: me.settings, usage: me.usage, states: me.states } });
      } else if (msg.type === "dp:save" && msg.module === module) {
        enqueue(() => TrainingApi.saveProgress(module, msg.state), "Não foi possível salvar seu progresso.");
      } else if (msg.type === "dp:prize" && msg.module === module) {
        enqueue(async () => {
          const result = await TrainingApi.claimPrize(module);
          post({ type: "dp:prizeResult", module, prize: result.prize, code: result.code });
          if (!result.alreadyClaimed) toast.success(`Prêmio registrado: ${result.prize}`);
        }, "Não foi possível registrar o prêmio.");
      }
    };
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      TrainingApi.heartbeat()
        .then((usage) => { setRemaining(usage.remainingSeconds); post({ type: "dp:usage", remainingSeconds: usage.remainingSeconds, locked: usage.locked }); })
        .catch(() => undefined);
    };
    window.addEventListener("message", onMessage);
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(timer); };
  }, [me, allowed, module]);

  const title = module === "carreira" ? "Odonto Odisseia: carreira do dentista" : "Job Rotation da equipe";
  const description = module === "carreira"
    ? "Plantões com protocolos de memória, decisões de gestão e uma clínica que cresce até a renda passiva."
    : "Rodadas cronometradas na recepção, esterilização, financeiro, laboratório e apoio na cadeira.";
  const prizeLine = me?.settings.prize
    ? module === "carreira"
      ? `${me.settings.prize} para quem bater as metas do nível ${CAREER_LEVEL_LABELS[me.settings.minLevel] || me.settings.minLevel} ou acima`
      : `${me.settings.prize} para quem concluir os 5 níveis`
    : "";

  return (
    <Box>
      <PageHeader title={title} description={description} />
      {error && <Alert severity="error">{error}</Alert>}
      {!error && !me && <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>}
      {me && !allowed && (
        <Alert severity="info">Seu perfil de acesso não inclui este módulo de treinamento. Peça ao gestor para liberar em Configurações → Permissões.</Alert>
      )}
      {me && allowed && (
        <>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {prizeLine && <Chip icon={<EmojiEventsIcon />} color="warning" variant="outlined" label={`Prêmio: ${prizeLine}`} />}
            <Chip icon={<TimerIcon />} variant="outlined" label={`Tempo de jogo hoje: ${fmt(remaining ?? me.usage.remainingSeconds)} de ${me.settings.dailyLimitMinutes} min`} />
            {me.prizes.filter((p) => p.module === module).map((p) => (
              <Chip key={p.code} color="success" label={`Você ganhou: ${p.prize} · código ${p.code}${p.deliveredAt ? " · entregue" : ""}`} />
            ))}
          </Box>
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            <Box
              component="iframe"
              key={module}
              ref={frameRef}
              title={title}
              src={`${GAME_URL}?host=dentalpos&modulo=${module}`}
              sx={{ display: "block", width: "100%", height: { xs: "calc(100vh - 160px)", md: "calc(100vh - 230px)" }, minHeight: 640, border: 0 }}
            />
          </Paper>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            O tempo conta só com esta tela aberta. O progresso fica salvo no seu usuário e continua em qualquer computador.
          </Typography>
        </>
      )}
    </Box>
  );
}
