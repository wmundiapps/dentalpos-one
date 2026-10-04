import { Box, Button, Chip, Typography } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { Bar, BASE, Section, Stat, StateBox, pct, useLoad, type Toast } from "./common";

const ROTULO: Record<string, string> = {
  LEAD: "Leads", INSCRITO: "Inscritos", PROVA: "Prova", APROVADO: "Aprovados", CONVOCADO: "Convocados", MATRICULADO: "Matriculados",
  DESISTENTE: "Desistentes", REPROVADO: "Reprovados",
};

/** Funil horizontal em CSS: largura proporcional ao total de leads. */
export function FunilBars({ funil }: { funil: any }) {
  const etapas: any[] = funil?.etapas || [];
  const topo = etapas[0]?.alcancou || 0;
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {etapas.map((e, i) => (
        <Box key={e.etapa} sx={{ display: "grid", gridTemplateColumns: { xs: "90px 1fr", md: "110px 1fr 150px" }, gap: 1, alignItems: "center" }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{ROTULO[e.etapa] || e.etapa}</Typography>
          <Box sx={{ bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}>
            <Box sx={{ width: `${topo ? Math.max(4, (e.alcancou / topo) * 100) : 0}%`, bgcolor: `hsl(${210 - i * 8} 75% ${48 + i * 3}%)`, color: "#fff", px: 1, py: 0.5, fontWeight: 800, fontSize: 13, transition: "width .3s" }}>
              {e.alcancou}
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
            {i === 0 ? "base" : `${pct(e.conversaoAnterior)} da etapa anterior`}
          </Typography>
        </Box>
      ))}
      {funil ? <Typography variant="caption" color="text.secondary">Desistentes: {funil.desistentes ?? 0} · Reprovados: {funil.reprovados ?? 0} · Total: {funil.total ?? 0}</Typography> : null}
    </Box>
  );
}

export default function PainelTab({ toast }: { toast: (t: Toast) => void }) {
  const painel = useLoad<any>(`${BASE}/relatorios/painel`);
  const funil = useLoad<any>(`${BASE}/relatorios/funil`);
  const vagas = useLoad<any[]>(`${BASE}/relatorios/vagas`);
  const [busy, setBusy] = useState(false);

  async function bootstrap() {
    setBusy(true);
    try {
      await eduApi.post(`${BASE}/bootstrap`);
      toast({ type: "success", text: "Checklist de documentos e bolsas padrão preparados." });
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }

  const p = painel.data;
  return (
    <>
      <Section title="Visão geral" description="Indicadores de captação, convocação, matrícula e rematrícula."
        actions={<Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} disabled={busy} onClick={bootstrap}>Preparar dados padrão</Button>}>
        <StateBox loading={painel.loading} error={painel.error} onRetry={painel.reload}>
          {p ? (
            <>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
                <Stat label="Processos abertos" value={p.processosAbertos} />
                <Stat label="Follow-ups vencidos" value={p.followUpsVencidos} color={p.followUpsVencidos ? "#d32f2f" : undefined} hint="candidatos aguardando contato" />
                <Stat label="Convocações pendentes" value={p.convocacoesPendentes} />
                <Stat label="Matrículas pendentes" value={p.matriculasPendentes} hint="documentos ou efetivação" />
                <Stat label="Rematrículas abertas" value={p.rematriculasAbertas} />
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {Object.entries(p.candidatosPorStatus || {}).map(([k, v]) => <Chip key={k} label={`${ROTULO[k] || k}: ${v}`} variant="outlined" />)}
              </Box>
            </>
          ) : null}
        </StateBox>
      </Section>

      <Section title="Funil de conversão" description="Do lead à matrícula, com a conversão entre etapas.">
        <StateBox loading={funil.loading} error={funil.error} onRetry={funil.reload} empty={!funil.data?.geral?.total} emptyText="Ainda não há candidatos para montar o funil.">
          <FunilBars funil={funil.data?.geral} />
        </StateBox>
      </Section>

      <Section title="Ocupação de vagas" description="Vagas ocupadas por processo seletivo e por curso.">
        <StateBox loading={vagas.loading} error={vagas.error} onRetry={vagas.reload} empty={!vagas.data?.length} emptyText="Nenhum processo seletivo com ofertas.">
          <Box sx={{ display: "grid", gap: 2.5 }}>
            {(vagas.data || []).map((v) => (
              <Box key={v.processoId}>
                <Typography component="div" sx={{ fontWeight: 800 }}>{v.processo} <Chip size="small" label={String(v.status).replace(/_/g, " ")} sx={{ ml: 1 }} /></Typography>
                <Bar value={v.vagasOcupadas} max={v.vagasOfertadas} color={(v.ocupacaoPct ?? 0) >= 90 ? "success" : (v.ocupacaoPct ?? 0) >= 50 ? "primary" : "warning"}
                  label={`${v.vagasOcupadas} de ${v.vagasOfertadas} vagas (${pct(v.ocupacaoPct)})`} />
                <Box sx={{ display: "grid", gap: 0.5, mt: 1, pl: 2 }}>
                  {(v.ofertas || []).map((o: any) => (
                    <Typography key={o.ofertaId} variant="body2" color="text.secondary">
                      {o.nomeCurso} ({String(o.turno).toLowerCase()}) — {o.matriculados}/{o.vagas} matriculados · {o.inscritos} inscritos · {o.vagasLivres} livres{o.relacaoCandidatoVaga != null ? ` · ${o.relacaoCandidatoVaga} cand./vaga` : ""}
                    </Typography>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </StateBox>
      </Section>
    </>
  );
}
