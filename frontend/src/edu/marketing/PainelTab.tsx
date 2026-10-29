import { Box, Chip, Paper, Typography } from "@mui/material";
import { Bar, DataList, Kpi, KpiRow, LoadBox, M, Section, fmtMoney, fmtPct, useApi, type Col } from "./kit";

const ROT: Record<string, string> = { LEAD: "Leads", CONTATO: "Contatados", QUALIFICADO: "Qualificados", INSCRITO: "Inscritos", MATRICULADO: "Matriculados" };
export default function PainelTab({ onGo }: { onGo: (s: string) => void }) {
  const p = useApi<any>(`${M}/painel`);
  const c = useApi<any>(`${M}/painel/canais`);
  const cp = useApi<any>(`${M}/painel/campanhas`);
  const cv = useApi<any>(`${M}/painel/conversao`);
  const d = p.data;
  const max = d?.funil?.etapas?.[0]?.total || 1;
  const colsCanal: Col[] = [
    { label: "Canal / origem", primary: true, render: (r) => <b>{r.origem.replace(/_/g, " ")}</b> },
    { label: "Leads", render: (r) => r.leads }, { label: "Matríc.", render: (r) => r.matriculados },
    { label: "Custo", render: (r) => fmtMoney(r.custo) }, { label: "CPL", render: (r) => (r.cpl == null ? "—" : fmtMoney(r.cpl)) },
    { label: "CAC", render: (r) => (r.cac == null ? "—" : fmtMoney(r.cac)) }, { label: "ROI", render: (r) => (r.roi == null ? "—" : fmtPct(r.roi, 0)) },
  ];
  const colsCamp: Col[] = [
    { label: "Campanha", primary: true, render: (r) => <><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo}</Typography></> },
    { label: "Situação", render: (r) => <Chip size="small" label={r.status.replace(/_/g, " ")} /> },
    { label: "Previsto", render: (r) => fmtMoney(r.orcamentoPrevisto) }, { label: "Realizado", render: (r) => fmtMoney(r.orcamentoRealizado) },
    { label: "Leads", render: (r) => `${r.leads}${r.metaLeads ? ` / ${r.metaLeads}` : ""}` }, { label: "CPL", render: (r) => (r.cpl == null ? "—" : fmtMoney(r.cpl)) },
  ];
  return (
    <LoadBox loading={p.loading} error={p.error} onRetry={p.reload}>
      {d && (
        <>
          <KpiRow>
            <Kpi title="Leads (90 dias)" value={d.totais.leads} hint={`${d.leadsUltimas24h} nas últimas 24 h`} color="#0F5FDB" />
            <Kpi title="Matriculados" value={d.totais.matriculados} hint={`Conversão ${fmtPct(d.funil.conversaoLeadMatricula)}`} color="#2e9e5b" />
            <Kpi title="Custo por lead" value={d.totais.cpl == null ? "—" : fmtMoney(d.totais.cpl)} hint={d.metaCustoLead ? `Meta ${fmtMoney(d.metaCustoLead)}` : undefined} color="#e0a100" />
            <Kpi title="Custo por aluno (CAC)" value={d.totais.cac == null ? "—" : fmtMoney(d.totais.cac)} color="#e07b00" />
            <Kpi title="ROI" value={d.totais.roi == null ? "—" : fmtPct(d.totais.roi, 0)} color="#7C3AED" />
            <Kpi title="Leads quentes abertos" value={d.leadsQuentesAbertos} hint="Priorize o contato" color="#d64545" />
          </KpiRow>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Section title="Funil de captação" actions={<Chip size="small" clickable label="Ver leads" onClick={() => onGo("leads")} />}>
              {d.funil.etapas.map((e: any) => <Bar key={e.etapa} label={ROT[e.etapa] ?? e.rotulo} value={e.total} max={max} right={`${e.total}`} />)}
              <Typography variant="caption" color="text.secondary">Perdidos: {d.funil.perdidos} · Lead→Inscrito {fmtPct(d.funil.conversaoLeadInscrito)} · Inscrito→Matrícula {fmtPct(d.funil.conversaoInscritoMatricula)}</Typography>
            </Section>
            <Section title="Orçamento das campanhas" actions={<Chip size="small" clickable label="Campanhas" onClick={() => onGo("campanhas")} />}>
              <Bar label="Realizado x previsto" value={d.orcamento.realizado} max={d.orcamento.previsto || 1} right={`${fmtMoney(d.orcamento.realizado)} / ${fmtMoney(d.orcamento.previsto)}`} />
              <Typography variant="body2" sx={{ mt: 1 }}>Campanhas ativas: <b>{d.campanhasAtivas}</b></Typography>
              <Typography variant="body2">Atendimentos: IA {d.atendimentos.IA ?? 0} · escalonados {d.atendimentos.ESCALONADO ?? 0} · encerrados {d.atendimentos.ENCERRADO ?? 0}</Typography>
              <Typography variant="body2">Contatos na lista de supressão: <b>{d.supressoesAtivas}</b> <Chip size="small" clickable label="LGPD" onClick={() => onGo("lgpd")} sx={{ ml: 1 }} /></Typography>
            </Section>
          </Box>
          <Section title="Canais: custo por lead, custo por aluno e ROI">
            <LoadBox loading={c.loading} error={c.error} empty={!c.data?.canais?.length} onRetry={c.reload}><DataList rows={c.data?.canais ?? []} columns={colsCanal} /></LoadBox>
          </Section>
          <Section title="Campanhas">
            <LoadBox loading={cp.loading} error={cp.error} empty={!cp.data?.length} onRetry={cp.reload}><DataList rows={(cp.data ?? []).slice(0, 8)} columns={colsCamp} /></LoadBox>
          </Section>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Section title="Conversão por consultor">
              <LoadBox loading={cv.loading} error={cv.error} empty={!cv.data?.consultores?.length} onRetry={cv.reload}>
                {(cv.data?.consultores ?? []).map((x: any) => <Paper key={x.consultor} variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2 }}><b>{x.consultor}</b> — {x.leads} leads · {x.matriculados} matrículas ({fmtPct(x.conversao)}) · 1º contato {x.tempoMedioPrimeiroContatoMin == null ? "—" : `${x.tempoMedioPrimeiroContatoMin} min`}{x.foraSla ? ` · ${x.foraSla} fora do SLA` : ""}</Paper>)}
              </LoadBox>
            </Section>
            <Section title="Próximos eventos e publicações">
              {(d.proximosEventos ?? []).map((e: any) => <Typography key={e.id} variant="body2">Evento: <b>{e.titulo}</b> — {new Date(e.inicio).toLocaleString("pt-BR")}</Typography>)}
              {(d.proximasPublicacoes ?? []).map((x: any) => <Typography key={x.id} variant="body2">{x.rede}: {String(x.texto).slice(0, 50)} — {new Date(x.agendadoPara).toLocaleString("pt-BR")}</Typography>)}
              {!d.proximosEventos?.length && !d.proximasPublicacoes?.length && <Typography color="text.secondary">Nada agendado.</Typography>}
            </Section>
          </Box>
        </>
      )}
    </LoadBox>
  );
}
