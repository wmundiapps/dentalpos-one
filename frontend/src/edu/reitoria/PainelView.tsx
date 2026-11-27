import { Alert, Box, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import IndicatorCard, { type Indicador } from "./IndicatorCard";
import { SEMAFORO_COR, SEMAFORO_LABEL, mapRota } from "./common";

export interface Painel {
  perfil: string; geradoEm: string;
  resumo: { VERDE: number; AMARELO: number; VERMELHO: number; CINZA: number; saude: number | null };
  alertas: Indicador[];
  indicadoresComErro: Array<{ chave: string; erro: string }>;
  categorias: Array<{ categoria: string; indicadores: Indicador[] }>;
  pendencias?: { totalVencidos: number; criticos: number; porModulo: Record<string, number> } | null;
}

interface Props { painel: Painel | null; erro: string | null; onOpen: (i: Indicador) => void }

const titulo = (c: string) => c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " ");

export default function PainelView({ painel, erro, onOpen }: Props) {
  const nav = useNavigate();
  if (erro) return <Alert severity="warning">Não foi possível carregar o painel agora: {erro}. Tente atualizar em instantes.</Alert>;
  if (!painel) return <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress /></Box>;
  const r = painel.resumo;
  const total = r.VERDE + r.AMARELO + r.VERMELHO + r.CINZA;
  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 140 }}>
          <Typography variant="overline" color="text.secondary">Saúde geral</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1 }}>{r.saude != null ? `${Math.round(r.saude)}%` : "—"}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Box sx={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", bgcolor: "action.hover" }}>
            {(["VERDE", "AMARELO", "VERMELHO", "CINZA"] as const).map((k) => r[k] > 0 && (
              <Box key={k} title={`${SEMAFORO_LABEL[k]}: ${r[k]}`} sx={{ width: `${(r[k] / (total || 1)) * 100}%`, bgcolor: SEMAFORO_COR[k] }} />
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 2, mt: 1, flexWrap: "wrap" }}>
            {(["VERDE", "AMARELO", "VERMELHO", "CINZA"] as const).map((k) => (
              <Box key={k} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: SEMAFORO_COR[k] }} />
                <Typography variant="body2">{r[k]} {SEMAFORO_LABEL[k].toLowerCase()}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
        {painel.pendencias && painel.pendencias.totalVencidos > 0 && (
          <Chip color="warning" label={`${painel.pendencias.totalVencidos} pendências vencidas (${painel.pendencias.criticos} críticas)`} onClick={() => nav("/edu/minha-mesa")} />
        )}
      </Paper>

      {painel.alertas.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Alertas</Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" } }}>
            {painel.alertas.map((i) => <IndicatorCard key={`a-${i.chave}`} ind={i} onOpen={onOpen} />)}
          </Box>
        </Box>
      )}

      {painel.categorias.length === 0 && <Alert severity="info">Nenhum indicador disponível para este perfil.</Alert>}
      {painel.categorias.map((c) => (
        <Box key={c.categoria}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>{titulo(c.categoria)}</Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" } }}>
            {c.indicadores.map((i) => <IndicatorCard key={i.chave} ind={{ ...i, rota: mapRota(i.rota, null) || "" }} onOpen={onOpen} />)}
          </Box>
        </Box>
      ))}
      {painel.indicadoresComErro.length > 0 && (
        <Typography variant="caption" color="text.secondary">{painel.indicadoresComErro.length} indicador(es) temporariamente indisponível(is). Atualizado em {new Date(painel.geradoEm).toLocaleString("pt-BR")}.</Typography>
      )}
    </Box>
  );
}
