import { Box, Table, TableBody, TableCell, TableHead, TableRow, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { Bar, BASE, Section, Stat, StateBox, asList, fmtDate, money, pct, useLoad } from "./common";

const CANAIS = ["GOOGLE_ADS", "META_ADS", "INDICACAO", "EVENTO", "ORGANICO", "EMAIL", "WHATSAPP", "PARCERIA"];

function RoiPanel() {
  const r = useLoad<any>(`${BASE}/marketing/por-canal`);
  const canais: any[] = r.data?.canais || [];
  const camps: any[] = r.data?.campanhas || [];
  const maxMat = Math.max(1, ...canais.map((c) => c.matriculas));
  const totalCusto = canais.reduce((s, c) => s + c.custo, 0);
  const totalMat = canais.reduce((s, c) => s + c.matriculas, 0);
  const totalLeads = canais.reduce((s, c) => s + c.leads, 0);
  return (
    <>
      <Section title="Retorno por canal" description="Custo por lead (CPL), custo por matrícula e ROI estimado pela receita das mensalidades.">
        <StateBox loading={r.loading} error={r.error} onRetry={r.reload} empty={!canais.length} emptyText="Cadastre campanhas e gastos para ver o retorno por canal.">
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Stat label="Investimento" value={money(totalCusto)} />
            <Stat label="Leads" value={totalLeads} />
            <Stat label="Matrículas" value={totalMat} />
            <Stat label="Custo por matrícula" value={totalMat ? money(totalCusto / totalMat) : "—"} />
          </Box>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow>{["Canal", "Campanhas", "Custo", "Leads", "Inscritos", "Matrículas", "CPL", "Custo/matrícula", "ROI", "Matrículas"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {canais.map((c) => (
                  <TableRow key={c.canal} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{String(c.canal).replace(/_/g, " ")}</TableCell><TableCell>{c.campanhas}</TableCell><TableCell>{money(c.custo)}</TableCell>
                    <TableCell>{c.leads}</TableCell><TableCell>{c.inscritos}</TableCell><TableCell>{c.matriculas}</TableCell>
                    <TableCell>{money(c.cpl)}</TableCell><TableCell>{money(c.custoPorMatricula)}</TableCell>
                    <TableCell sx={{ color: (c.roi ?? 0) >= 0 ? "success.main" : "error.main", fontWeight: 800 }}>{pct(c.roi)}</TableCell>
                    <TableCell sx={{ minWidth: 120 }}><Bar value={c.matriculas} max={maxMat} color="success" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </StateBox>
      </Section>
      <Section title="Desempenho por campanha" description="Atingimento de metas e uso do orçamento.">
        <StateBox loading={r.loading} error={r.error} empty={!camps.length} emptyText="Nenhuma campanha cadastrada.">
          <Box sx={{ display: "grid", gap: 2 }}>
            {camps.map((c) => (
              <Box key={c.campanhaId} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px 1fr 1fr 1fr" }, gap: 2, alignItems: "center" }}>
                <Typography sx={{ fontWeight: 700 }}>{c.nome} <StatusChip value={c.status} /></Typography>
                <Bar value={c.atingimentoMetaInscritos ?? 0} max={100} color={(c.atingimentoMetaInscritos ?? 0) >= 100 ? "success" : "primary"} label={`Meta de inscritos: ${pct(c.atingimentoMetaInscritos)}`} />
                <Bar value={c.atingimentoMetaMatriculas ?? 0} max={100} color={(c.atingimentoMetaMatriculas ?? 0) >= 100 ? "success" : "primary"} label={`Meta de matrículas: ${pct(c.atingimentoMetaMatriculas)}`} />
                <Bar value={c.usoOrcamento ?? 0} max={100} color={(c.usoOrcamento ?? 0) > 100 ? "error" : (c.usoOrcamento ?? 0) > 85 ? "warning" : "info"} label={`Orçamento usado: ${pct(c.usoOrcamento)}`} />
              </Box>
            ))}
          </Box>
        </StateBox>
      </Section>
    </>
  );
}

export default function CampanhasTab() {
  const [sub, setSub] = useState(0);
  const camps = useLoad<any>(`${BASE}/campanhas?pageSize=200`);
  const campOpts = asList(camps.data).map((c: any) => ({ value: c.id, label: c.nome }));
  const procs = useLoad<any>(`${BASE}/processos?pageSize=200`);
  const procOpts = asList(procs.data).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` }));

  const campFields: FieldDef[] = [
    { key: "nome", label: "Nome da campanha", required: true },
    { key: "canal", label: "Canal", type: "select", options: CANAIS, required: true },
    { key: "nivel", label: "Nível", type: "select", options: [{ value: "GRADUACAO", label: "Graduação" }, { value: "POS_LATO", label: "Pós lato sensu" }, { value: "POS_STRICTO", label: "Pós stricto sensu" }] },
    { key: "status", label: "Situação", type: "select", options: ["PLANEJADA", "ATIVA", "PAUSADA", "ENCERRADA"] },
    { key: "processoId", label: "Processo seletivo", type: "select", options: procOpts },
    { key: "inicio", label: "Início", type: "date", required: true },
    { key: "fim", label: "Fim", type: "date", required: true },
    { key: "orcamento", label: "Orçamento (R$)", type: "number" },
    { key: "metaInscritos", label: "Meta de inscritos", type: "number" },
    { key: "metaMatriculas", label: "Meta de matrículas", type: "number" },
    { key: "utmSource", label: "utm_source" }, { key: "utmMedium", label: "utm_medium" }, { key: "utmCampaign", label: "utm_campaign" },
    { key: "observacoes", label: "Observações", type: "textarea" },
  ];

  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 2 }}>
        <Tab label="Retorno (ROI)" /><Tab label="Campanhas" /><Tab label="Gastos" />
      </Tabs>
      {sub === 0 && <RoiPanel />}
      {sub === 1 && (
        <EduResourcePage title="Campanhas de captação" base={BASE} resource="/campanhas" fields={campFields}
          filters={[{ key: "status", label: "Situação", options: ["PLANEJADA", "ATIVA", "PAUSADA", "ENCERRADA"] }, { key: "canal", label: "Canal", options: CANAIS }]}
          columns={[
            { key: "nome", label: "Campanha" }, { key: "canal", label: "Canal", render: (r) => String(r.canal).replace(/_/g, " ") },
            { key: "periodo", label: "Período", render: (r) => `${fmtDate(r.inicio)} a ${fmtDate(r.fim)}` },
            { key: "orcamento", label: "Orçamento", render: (r) => money(r.orcamento) },
            { key: "metas", label: "Metas (insc./matr.)", render: (r) => `${r.metaInscritos ?? 0} / ${r.metaMatriculas ?? 0}` },
            { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
          ]} />
      )}
      {sub === 2 && (
        <EduResourcePage title="Gastos de campanha" description="Lançamentos que alimentam o CPL e o ROI." base={BASE} resource="/campanhas-gastos"
          fields={[
            { key: "campanhaId", label: "Campanha", type: "select", options: campOpts, required: true, createOnly: true },
            { key: "data", label: "Data", type: "date" }, { key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "descricao", label: "Descrição" },
          ]}
          columns={[
            { key: "campanhaId", label: "Campanha", render: (r) => campOpts.find((c) => c.value === r.campanhaId)?.label || "—" },
            { key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "valor", label: "Valor", render: (r) => money(r.valor) }, { key: "descricao", label: "Descrição" },
          ]} />
      )}
    </Box>
  );
}
