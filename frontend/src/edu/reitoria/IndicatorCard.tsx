import { Box, Chip, Paper, Typography } from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { SEMAFORO_COR, SEMAFORO_LABEL, fmtValor } from "./common";

export interface Indicador {
  chave: string; titulo: string; categoria: string; valor: number | null; unidade: string;
  variacaoPct?: number | null; tendencia?: "SOBE" | "DESCE" | "ESTAVEL" | null; favoravel?: boolean | null;
  semaforo: string; meta?: number | null; rota: string; erro?: string;
}

interface Props { ind: Indicador; onOpen: (i: Indicador) => void }

/** Cartão de indicador com semáforo, variação e meta. O clique abre o detalhe (histórico + navegação). */
export default function IndicatorCard({ ind, onOpen }: Props) {
  const cor = SEMAFORO_COR[ind.semaforo] || SEMAFORO_COR.CINZA;
  const Trend = ind.tendencia === "SOBE" ? TrendingUpIcon : ind.tendencia === "DESCE" ? TrendingDownIcon : TrendingFlatIcon;
  const varCor = ind.favoravel == null ? "text.secondary" : ind.favoravel ? "success.main" : "error.main";
  return (
    <Paper
      variant="outlined" onClick={() => onOpen(ind)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(ind); }}
      sx={{ p: 2, borderRadius: 3, cursor: "pointer", borderLeft: `6px solid ${cor}`, height: "100%", transition: "box-shadow .15s", "&:hover": { boxShadow: 4 } }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, lineHeight: 1.25 }}>{ind.titulo}</Typography>
        <Box title={SEMAFORO_LABEL[ind.semaforo]} sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: cor, flexShrink: 0, mt: 0.3 }} aria-label={SEMAFORO_LABEL[ind.semaforo]} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.75 }}>{ind.erro ? "—" : fmtValor(ind.valor, ind.unidade)}</Typography>
      {ind.erro ? (
        <Typography variant="caption" color="warning.main">Indicador indisponível no momento</Typography>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
          {ind.variacaoPct != null ? (
            <Box sx={{ display: "flex", alignItems: "center", color: varCor }}>
              <Trend fontSize="small" />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{ind.variacaoPct > 0 ? "+" : ""}{ind.variacaoPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</Typography>
            </Box>
          ) : <Typography variant="caption" color="text.secondary">sem comparativo</Typography>}
          {ind.meta != null && <Chip size="small" variant="outlined" label={`Meta ${fmtValor(ind.meta, ind.unidade)}`} />}
        </Box>
      )}
    </Paper>
  );
}
