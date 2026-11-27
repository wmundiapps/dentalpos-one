import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { eduApi } from "../../services/EduApi";
import type { Indicador } from "./IndicatorCard";
import { SEMAFORO_COR, SEMAFORO_LABEL, fmtValor, mapRota, msgErro } from "./common";

interface Ponto { dia: string; valor: number | null }

function Sparkline({ pontos, cor }: { pontos: Ponto[]; cor: string }) {
  const vals = pontos.filter((p) => p.valor != null) as Array<{ dia: string; valor: number }>;
  const W = 480, H = 140, P = 12;
  const { min, max } = useMemo(() => ({ min: Math.min(...vals.map((v) => v.valor)), max: Math.max(...vals.map((v) => v.valor)) }), [vals]);
  const span = max - min || 1;
  const x = (i: number) => P + (vals.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (vals.length - 1));
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = vals.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Histórico do indicador">
        <path d={`${d} L${x(vals.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill={cor} opacity={0.12} />
        <path d={d} fill="none" stroke={cor} strokeWidth={2.5} strokeLinejoin="round" />
        {vals.map((p, i) => <circle key={p.dia} cx={x(i)} cy={y(p.valor)} r={vals.length > 40 ? 0 : 3} fill={cor}><title>{`${new Date(p.dia).toLocaleDateString("pt-BR", { timeZone: "UTC" })}: ${p.valor}`}</title></circle>)}
      </svg>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary">{new Date(vals[0].dia).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · mín {min.toLocaleString("pt-BR")}</Typography>
        <Typography variant="caption" color="text.secondary">{new Date(vals[vals.length - 1].dia).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · máx {max.toLocaleString("pt-BR")}</Typography>
      </Box>
    </Box>
  );
}

interface Props { ind: Indicador | null; onClose: () => void }

export default function IndicatorDialog({ ind, onClose }: Props) {
  const nav = useNavigate();
  const [hist, setHist] = useState<Ponto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setHist(null); setErro(null);
    if (!ind) return;
    let alive = true;
    eduApi.get<Ponto[]>(`/reitoria/indicadores/${encodeURIComponent(ind.chave)}/historico?dias=180`)
      .then((r) => alive && setHist(Array.isArray(r) ? r : []))
      .catch((e) => alive && setErro(msgErro(e)));
    return () => { alive = false; };
  }, [ind]);

  if (!ind) return null;
  const cor = SEMAFORO_COR[ind.semaforo] || SEMAFORO_COR.CINZA;
  const rota = mapRota(ind.rota, null);
  const pts = (hist ?? []).filter((p) => p.valor != null);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{ind.titulo}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: cor }}>{fmtValor(ind.valor, ind.unidade)}</Typography>
          <Typography color="text.secondary">{SEMAFORO_LABEL[ind.semaforo]}{ind.meta != null ? ` · meta ${fmtValor(ind.meta, ind.unidade)}` : ""}</Typography>
        </Box>
        {ind.erro && <Alert severity="warning" sx={{ mb: 2 }}>Este indicador não pôde ser calculado agora. Tente atualizar o painel.</Alert>}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Histórico (180 dias)</Typography>
        {hist === null && !erro && <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={28} /></Box>}
        {erro && <Alert severity="info">O histórico está disponível apenas para a reitoria ou ainda não foi registrado.</Alert>}
        {hist !== null && pts.length === 0 && !erro && <Alert severity="info">Ainda não há histórico registrado para este indicador. O painel guarda uma foto diária.</Alert>}
        {pts.length > 0 && <Sparkline pontos={pts} cor={cor} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
        {rota && <Button variant="contained" onClick={() => { onClose(); nav(rota); }}>Abrir módulo</Button>}
      </DialogActions>
    </Dialog>
  );
}
