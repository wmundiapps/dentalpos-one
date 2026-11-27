import { Alert, Box, Chip, Paper, Typography } from "@mui/material";
import { A, Bar, COLORS, DataList, Kpi, KpiRow, LoadBox, Pick, Section, ROTULO_CANAL, ROTULO_STATUS, SlaChip, CanalChip, StatusChip, itemsOf, useApi, fmtDateTime } from "./kit";
import { useState } from "react";

const num = (v: any, d = 0) => (v === null || v === undefined ? "—" : Number(v).toFixed(d).replace(".", ","));
const min = (v: any) => (v === null || v === undefined ? "—" : v >= 120 ? `${num(v / 60, 1)} h` : `${num(v, 0)} min`);

export default function PainelTab() {
  const [dias, setDias] = useState("30");
  const g = useApi<any>(`${A}/painel/gestor?dias=${dias}`, [dias]);
  const m = useApi<any>(`${A}/painel/atendente`);
  const d = g.data;
  const maxCanal = d ? Math.max(1, ...Object.values<number>(d.porCanal)) : 1;
  const maxDia = d ? Math.max(1, ...Object.values<number>(d.volumePorDia)) : 1;
  return (
    <>
      <Section title="Meu painel (atendente)">
        <LoadBox loading={m.loading} error={m.error} onRetry={m.reload}>
          {m.data && <>
            <KpiRow><Kpi title="Minha caixa" value={m.data.minhas.length} /><Kpi title="Fila sem atendente" value={m.data.fila.length} color={COLORS.warn} /><Kpi title="SLA estourado" value={m.data.slaEstourado} color={m.data.slaEstourado ? COLORS.bad : COLORS.ok} /><Kpi title="Resolvidos hoje" value={m.data.resolvidosHoje} color={COLORS.ok} /><Kpi title="CSAT (30 d)" value={num(m.data.csatMedio30d, 1)} hint={`${m.data.avaliacoes30d} avaliação(ões)`} /></KpiRow>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Próximos a vencer</Typography>
            <DataList rows={[...m.data.minhas, ...m.data.fila].slice(0, 8)} columns={[
              { label: "Atendimento", primary: true, render: (a: any) => <><b>{a.solicitanteNome}</b><div style={{ fontSize: 12, opacity: 0.7 }}>{a.numero} · {a.assunto}</div></> }, { label: "Canal", render: (a: any) => <CanalChip canal={a.canal} /> }, { label: "Situação", render: (a: any) => <StatusChip s={a.status} /> }, { label: "SLA", render: (a: any) => <SlaChip sla={a.sla} /> }, { label: "Resolução até", hideOnMobile: true, render: (a: any) => fmtDateTime(a.slaResolucaoEm) },
            ]} />
          </>}
        </LoadBox>
      </Section>
      <Section title="Painel do gestor — SLA, volume e satisfação" actions={<Pick label="Período" value={dias} onChange={setDias} minWidth={130} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }]} />}>
        <LoadBox loading={g.loading} error={g.error} onRetry={g.reload}>
          {d && <>
            <KpiRow>
              <Kpi title="Abertos agora" value={d.abertos} hint={`${d.semAtendente} sem atendente`} /><Kpi title="SLA estourado" value={d.estourados} color={d.estourados ? COLORS.bad : COLORS.ok} hint={`${d.atencao} em atenção`} />
              <Kpi title="1ª resposta (média)" value={min(d.tempoMedioPrimeiraRespostaMin)} /><Kpi title="Resolução (média)" value={min(d.tempoMedioResolucaoMin)} hint={d.slaResolucaoCumpridoPct != null ? `${d.slaResolucaoCumpridoPct}% dentro do SLA` : undefined} />
              <Kpi title="CSAT" value={num(d.csat.media, 1)} hint={`${d.csat.avaliacoes} avaliações (${d.csat.respostaPct ?? 0}% de resposta)`} color={COLORS.info} />
            </KpiRow>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Atendimentos por canal ({d.criadosPeriodo})</Typography>
                {Object.entries<number>(d.porCanal).map(([k, v]) => <Bar key={k} value={v} max={maxCanal} label={ROTULO_CANAL[k] ?? k} right={v} />)}</Paper>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Volume nos últimos 14 dias</Typography>
                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 110 }}>{Object.entries<number>(d.volumePorDia).map(([k, v]) => <Box key={k} title={`${k}: ${v}`} sx={{ flex: 1, height: `${Math.max(4, (v / maxDia) * 100)}%`, bgcolor: "primary.main", borderRadius: 0.5 }} />)}</Box></Paper>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Distribuição das avaliações (CSAT)</Typography>
                {[5, 4, 3, 2, 1].map((n) => <Bar key={n} value={d.csat.distribuicao[n] ?? 0} max={Math.max(1, d.csat.avaliacoes)} label={`${"★".repeat(n)}`} right={d.csat.distribuicao[n] ?? 0} color={n >= 4 ? COLORS.ok : n === 3 ? COLORS.warn : COLORS.bad} />)}</Paper>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontWeight: 800, mb: 1 }}>Abertos por situação</Typography>
                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>{Object.entries<number>(d.porStatus).map(([k, v]) => <Chip key={k} label={`${ROTULO_STATUS[k] ?? k}: ${v}`} />)}</Box>
                <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Protocolos</Typography>
                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>{Object.entries<number>(d.protocolos).map(([k, v]) => <Chip key={k} variant="outlined" label={`${ROTULO_STATUS[k] ?? k}: ${v}`} />)}</Box></Paper>
            </Box>
            <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Filas por setor</Typography>
            <DataList rows={d.porSetor.map((s: any) => ({ ...s, id: s.setorId }))} columns={[{ label: "Setor", primary: true, render: (s: any) => s.setor }, { label: "Abertos", render: (s: any) => s.abertos }, { label: "SLA estourado", render: (s: any) => <span style={{ color: s.estourados ? "#d64545" : undefined, fontWeight: 700 }}>{s.estourados}</span> }, { label: "Sem atendente", render: (s: any) => s.semAtendente }]} />
            <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Equipe</Typography>
            <DataList rows={d.porAtendente.map((s: any) => ({ ...s, id: s.userId }))} columns={[{ label: "Atendente", primary: true, render: (s: any) => s.nome ?? s.userId }, { label: "Total", render: (s: any) => s.total }, { label: "Em aberto", render: (s: any) => s.abertos }, { label: "Resolvidos", render: (s: any) => s.resolvidos }, { label: "CSAT", render: (s: any) => num(s.csat, 1) }]} />
            <Alert severity="info" sx={{ mt: 2 }}>IA no período: {d.ia.usos} chamadas, {d.ia.atendidasPelaIa} atendimento(s) respondido(s) pela IA ({d.ia.resolvidasSemHumanoPct}% sem humano), {d.ia.escalonados} escalonamento(s) para atendente.</Alert>
          </>}
        </LoadBox>
      </Section>
    </>
  );
}
void itemsOf;
