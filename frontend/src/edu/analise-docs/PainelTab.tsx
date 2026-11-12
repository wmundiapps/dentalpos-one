import { Alert, Box, Button, Chip, Typography } from "@mui/material";
import { Sparkline } from "../desempenho/kit";
import { AD, AVISO_AGENTE, AVISO_SIMULADO, COLORS, Kpi, KpiRow, LoadBox, Section, label, useApi, rotuloOrigem } from "./kit";
import { GravidadeChip } from "./kit";

export default function PainelTab({ onGo }: { onGo: (secao: string, extra?: Record<string, string>) => void }) {
  const p = useApi<any>(`${AD}/painel`);
  const d = p.data;
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>{AVISO_AGENTE}</Alert>
      {d?.provedor?.simulado && <Alert severity="warning" sx={{ mb: 2 }}>{AVISO_SIMULADO}</Alert>}
      <Section title="Fila de revisão e SLA" actions={<Button variant="contained" onClick={() => onGo("fila")}>Abrir fila</Button>}>
        <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
          {d && (
            <>
              {d.criticosAbertos > 0 && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => onGo("fila", { critico: "1" })}>Ver</Button>}>{d.criticosAbertos} caso(s) CRÍTICO(S) aguardando decisão humana — {d.bloqueados} processo(s) bloqueado(s).</Alert>}
              <KpiRow>
                <Kpi title="Na fila" value={d.naFila} hint="aguardando revisão humana" />
                <Kpi title="Críticos abertos" value={d.criticosAbertos} color={d.criticosAbertos ? COLORS.bad : COLORS.ok} hint={`${d.bloqueados} bloqueando processos`} />
                <Kpi title="SLA vencido" value={d.atrasados} color={d.atrasados ? COLORS.warn : COLORS.ok} />
                <Kpi title="Decididos (30 d)" value={d.decididos30d} />
                <Kpi title="Tempo médio" value={d.tempoMedioHoras == null ? "—" : `${String(d.tempoMedioHoras).replace(".", ",")} h`} hint="da criação à decisão" />
                <Kpi title="No prazo" value={d.noPrazoPct == null ? "—" : `${d.noPrazoPct}%`} color={d.noPrazoPct != null && d.noPrazoPct < 80 ? COLORS.warn : COLORS.ok} />
              </KpiRow>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                {Object.entries(d.filaPorOrigem || {}).map(([o, n]) => <Chip key={o} label={`${rotuloOrigem(o)}: ${n}`} onClick={() => onGo("fila", { origem: o })} />)}
                {Object.entries(d.porStatus || {}).map(([s, n]) => <Chip key={s} variant="outlined" label={`${label(s)}: ${n}`} />)}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Casos criados por dia (30 dias)</Typography>
              <Sparkline values={d.serie.map((s: any) => s.criados)} labels={d.serie.map((s: any) => s.dia.slice(5))} width={640} height={90} />
              <Typography variant="caption" color="text.secondary">Críticos no período: {d.serie.reduce((a: number, s: any) => a + s.criticos, 0)}</Typography>
            </>
          )}
        </LoadBox>
      </Section>
      {d && (
        <Section title="Resultados (90 dias) e achados mais frequentes">
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            {Object.entries(d.porResultado90d || {}).map(([r, n]) => <Chip key={r} label={`${r === "OK" ? "Sem pendências" : r === "ATENCAO" ? "Atenção" : r === "CRITICO" ? "Crítico" : label(r)}: ${n}`} color={r === "CRITICO" ? "error" : r === "ATENCAO" ? "warning" : r === "OK" ? "success" : "default"} />)}
          </Box>
          {!d.achadosFrequentes.length && <Typography color="text.secondary">Ainda não há achados.</Typography>}
          {d.achadosFrequentes.map((a: any) => (
            <Box key={a.regra + a.gravidade} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5 }}>
              <GravidadeChip g={a.gravidade} /><Typography sx={{ flex: 1, overflowWrap: "anywhere" }}>{label(a.regra)}</Typography><b>{a.total}</b>
            </Box>
          ))}
        </Section>
      )}
    </>
  );
}
