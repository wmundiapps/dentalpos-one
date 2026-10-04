import { Box, MenuItem, TextField, Typography, Button } from "@mui/material";
import { useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { eduApi, qsOf } from "../../services/EduApi";
import ListTable from "./ListTable";
import { Async, Bars, Light, Panel, Stat, StatGrid, SubNav, Tag, brl, fmtDate, itemsOf, label, nameOf, num, pct, useApi, useSpaces, useToast } from "./kit";

const TIPO_MED = ["ENERGIA", "AGUA", "GAS"];
const UNID: Record<string, string> = { ENERGIA: "kWh", AGUA: "m³", GAS: "m³" };

function Iluminacao({ spaces }: { spaces: any[] }) {
  const st = useApi<any>("/infraestrutura/iluminacao/resumo");
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={st}>
        {(d) => (
          <StatGrid>
            <Stat label="Pontos de luz" value={num(d.totalPontos, 0)} />
            <Stat label="Com problema" value={num(d.comProblema, 0)} tone={d.comProblema ? "error" : "success"} />
            <Stat label="Potência instalada" value={`${num(d.potenciaInstaladaKw)} kW`} />
            <Stat label="Pontos em LED" value={pct(d.pctLed)} tone={d.pctLed >= 70 ? "success" : "warning"} />
          </StatGrid>
        )}
      </Async>
      <EduResourcePage title="Pontos de iluminação" base="/infraestrutura" resource="/iluminacao/pontos" dense
        description="Reporte lâmpadas queimadas (abre chamado automático) e registre a substituição."
        filters={[{ key: "status", label: "Situação", options: ["OK", "QUEIMADA", "INTERMITENTE", "DESATIVADA"] }]}
        columns={[
          { key: "codigo", label: "Código" }, { key: "descricao", label: "Descrição" }, { key: "spaceId", label: "Local", render: (r) => nameOf(spaces, r.spaceId) },
          { key: "tipo", label: "Tipo" }, { key: "potenciaW", label: "Potência (W)" }, { key: "quantidade", label: "Qtd" },
          { key: "status", label: "Situação", render: (r) => <Light tone={r.status === "OK" ? "success" : r.status === "DESATIVADA" ? "default" : "error"} text={label(r.status)} /> },
          { key: "ultimaTroca", label: "Última troca", render: (r) => fmtDate(r.ultimaTroca) },
        ]}
        fields={[{ key: "codigo", label: "Código", required: true }, { key: "descricao", label: "Descrição" }, { key: "spaceId", label: "Local", type: "select", options: spaces },
          { key: "tipo", label: "Tipo (LED, fluorescente…)" }, { key: "potenciaW", label: "Potência (W)", type: "number" }, { key: "quantidade", label: "Quantidade", type: "number" }, { key: "ultimaTroca", label: "Última troca", type: "date" }]}
        rowActions={[
          { label: "Reportar queimada", path: "/iluminacao/pontos/:id/reportar", color: "warning", hidden: (r) => r.status !== "OK", confirm: "Reportar este ponto como queimado? Será aberto um chamado." },
          { label: "Substituída", path: "/iluminacao/pontos/:id/substituir", color: "success", hidden: (r) => r.status === "OK" || r.status === "DESATIVADA" },
        ]} />
    </Box>
  );
}

function Medidores({ spaces }: { spaces: any[] }) {
  const meds = useApi<any>("/infraestrutura/medidores?pageSize=200&ativo=true");
  const [medId, setMedId] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [key, setKey] = useState(0);
  const toast = useToast();
  const medidores = itemsOf(meds.data);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Lançar leitura" subtitle="Leituras em ordem cronológica; o sistema calcula consumo, média diária e alerta de desvio.">
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label="Medidor" value={medId} onChange={(e) => setMedId(e.target.value)} sx={{ minWidth: 240 }}>
            {medidores.map((m: any) => <MenuItem key={m.id} value={m.id}>{m.codigo} ({label(m.tipo)})</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="Data" value={data} onChange={(e) => setData(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label={`Leitura (${UNID[medidores.find((m: any) => m.id === medId)?.tipo] || "un."})`} value={valor} onChange={(e) => setValor(e.target.value)} />
          <Button variant="contained" disabled={!medId || valor === ""}
            onClick={() => toast.run(() => eduApi.post(`/infraestrutura/medidores/${medId}/leituras`, { valor: Number(valor), dataLeitura: new Date(`${data}T12:00:00`).toISOString() }), "Leitura registrada.", () => { setValor(""); setKey((k) => k + 1); })}>Registrar</Button>
        </Box>
        {medId && (
          <Box sx={{ mt: 2 }}>
            <ListTable path={`/infraestrutura/medidores/${medId}/leituras`} refreshKey={key} searchable={false} pageSize={10}
              columns={[
                { key: "dataLeitura", label: "Data", render: (r) => fmtDate(r.dataLeitura) }, { key: "valor", label: "Leitura", align: "right", render: (r) => num(r.valor, 2) },
                { key: "consumo", label: "Consumo", align: "right", render: (r) => num(r.consumo, 2) }, { key: "mediaDiaria", label: "Média diária", align: "right", render: (r) => num(r.mediaDiaria, 2) },
                { key: "desvioPct", label: "Desvio", render: (r) => (r.alerta ? <Tag text={`${r.desvioPct > 0 ? "+" : ""}${num(r.desvioPct, 0)}% alerta`} tone="error" /> : r.desvioPct == null ? "—" : `${num(r.desvioPct, 0)}%`) },
              ]} />
          </Box>
        )}
      </Panel>
      <EduResourcePage title="Medidores" base="/infraestrutura" resource="/medidores" dense
        columns={[{ key: "codigo", label: "Código" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> }, { key: "spaceId", label: "Local", render: (r) => nameOf(spaces, r.spaceId) }, { key: "unidade", label: "Unidade" }, { key: "limiarDesvioPct", label: "Limiar de desvio %" }, { key: "ativo", label: "Ativo" }]}
        fields={[{ key: "codigo", label: "Código", required: true }, { key: "tipo", label: "Tipo", type: "select", options: TIPO_MED, required: true }, { key: "spaceId", label: "Local", type: "select", options: spaces },
          { key: "unidade", label: "Unidade" }, { key: "limiarDesvioPct", label: "Limiar de desvio (%)", type: "number" }, { key: "janelaLeituras", label: "Janela de leituras (média)", type: "number" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
    </Box>
  );
}

function Sparkline({ serie }: { serie: Array<{ consumo: number | null }> }) {
  const v = serie.map((s) => s.consumo ?? 0);
  if (v.length < 2) return <Typography variant="caption" color="text.secondary">Poucas leituras</Typography>;
  const max = Math.max(...v, 1), w = 160, h = 36;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - (x / max) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} role="img" aria-label="Tendência de consumo"><polyline points={pts} fill="none" stroke="#0F5FDB" strokeWidth="2" /></svg>;
}

function Consumo() {
  const [tipo, setTipo] = useState("");
  const st = useApi<any>(`/infraestrutura/consumo${qsOf({ tipo })}`);
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ width: 180 }}>
        <MenuItem value="">Todos</MenuItem>{TIPO_MED.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}
      </TextField>
      <Async state={st}>
        {(d) => (
          <>
            <StatGrid>{Object.entries(d.porTipo || {}).map(([t, v]: any) => <Stat key={t} label={`Consumo de ${label(t).toLowerCase()} (90 dias)`} value={`${num(v)} ${UNID[t] || ""}`} />)}</StatGrid>
            <Panel title="Consumo por medidor">
              <Box sx={{ display: "grid", gap: 1.5 }}>
                {(d.porMedidor || []).map((m: any) => (
                  <Box key={m.medidorId} sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                    <Box sx={{ minWidth: 180 }}><b>{m.codigo}</b> <Tag text={label(m.tipo)} /></Box>
                    <Typography variant="body2" sx={{ minWidth: 150 }}>{num(m.consumoTotal)} {m.unidade || UNID[m.tipo]}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130 }}>média/dia: {num(m.mediaDiaria, 2)}</Typography>
                    <Sparkline serie={m.serie || []} />
                    {m.alertas > 0 && <Tag text={`${m.alertas} alerta(s)`} tone="error" />}
                  </Box>
                ))}
                {!(d.porMedidor || []).length && <Typography color="text.secondary">Nenhum medidor com leituras no período.</Typography>}
              </Box>
            </Panel>
            <Panel title="Comparativo entre medidores"><Bars items={(d.porMedidor || []).map((m: any) => ({ label: m.codigo, value: m.consumoTotal }))} format={(v) => num(v)} /></Panel>
          </>
        )}
      </Async>
    </Box>
  );
}

export default function EnergiaTab() {
  const [sub, setSub] = useState("iluminacao");
  const spaces = useSpaces();
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "iluminacao", label: "Iluminação" }, { key: "medidores", label: "Medidores e leituras" }, { key: "consumo", label: "Consumo" }, { key: "acoes", label: "Ações de eficiência" }]} />
      {sub === "iluminacao" && <Iluminacao spaces={spaces} />}
      {sub === "medidores" && <Medidores spaces={spaces} />}
      {sub === "consumo" && <Consumo />}
      {sub === "acoes" && (
        <EduResourcePage title="Ações de eficiência energética e hídrica" base="/infraestrutura" resource="/acoes-eficiencia" filters={[{ key: "status", label: "Situação", options: ["PLANEJADA", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"] }, { key: "tipo", label: "Tipo", options: ["ENERGIA", "AGUA", "RESIDUOS", "OUTRO"] }]}
          columns={[{ key: "titulo", label: "Ação" }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> }, { key: "economiaEstimadaPct", label: "Economia est. %" }, { key: "custo", label: "Custo", render: (r) => brl(r.custo) }, { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> }]}
          fields={[{ key: "titulo", label: "Título", required: true }, { key: "tipo", label: "Tipo", type: "select", options: ["ENERGIA", "AGUA", "RESIDUOS", "OUTRO"] }, { key: "descricao", label: "Descrição", type: "textarea" },
            { key: "economiaEstimadaPct", label: "Economia estimada (%)", type: "number" }, { key: "custo", label: "Custo (R$)", type: "number" }, { key: "status", label: "Situação", type: "select", options: ["PLANEJADA", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"] }, { key: "prazo", label: "Prazo", type: "date" }]} />
      )}
    </Box>
  );
}
