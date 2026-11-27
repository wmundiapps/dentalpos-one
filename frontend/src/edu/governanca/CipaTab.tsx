import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { fmtDate, Kpi, KpiGrid, label, Section, SEMAFORO, Status, useApi, useToast } from "../regulatorio/ui";
import { STATUS_ACAO, toArr, useOptions } from "./shared";

const AGENTES = ["FISICO", "QUIMICO", "BIOLOGICO", "ERGONOMICO", "ACIDENTE"];
const NIVEL_COR: Record<string, string> = { BAIXO: "#16a34a", MEDIO: "#eab308", ALTO: "#ea580c", CRITICO: "#dc2626" };
const corCelula = (g: number, p: number) => { const s = g * p; return s <= 4 ? NIVEL_COR.BAIXO : s <= 9 ? NIVEL_COR.MEDIO : s <= 16 ? NIVEL_COR.ALTO : NIVEL_COR.CRITICO; };
const opts = (a: string[]) => a.map((x) => ({ value: x, label: label(x) }));

function Painel() {
  const { data, loading, error, reload } = useApi<any>("/governanca/cipa/painel");
  const g = data?.gestaoVigente;
  const sit = useApi<any>(g ? `/governanca/cipa/gestoes/${g.id}/situacao` : null);
  const riscos = data?.riscosAbertosPorNivel || {};
  return (
    <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
      {data && (<>
        <KpiGrid>
          <Kpi title="Gestão vigente" value={g ? "Ativa" : "—"} color={g ? SEMAFORO.VERDE : SEMAFORO.AMARELO} hint={g ? `${g.nome} até ${fmtDate(g.fim)}` : "Nenhuma gestão ativa"} />
          <Kpi title="CAT pendentes" value={data.catPendentes} color={data.catPendentes ? SEMAFORO.VERMELHO : undefined} />
          <Kpi title="Acidentes (12 meses)" value={data.acidentesUltimos12Meses} />
          <Kpi title="Plano de ação" value={data.planoAcao.abertas} color={data.planoAcao.atrasadas ? SEMAFORO.VERMELHO : undefined} hint={`${data.planoAcao.atrasadas} atrasada(s)`} />
        </KpiGrid>
        <Section title="Riscos abertos por nível">
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {["CRITICO", "ALTO", "MEDIO", "BAIXO"].map((n) => <Chip key={n} label={`${label(n)}: ${riscos[n] || 0}`} sx={{ bgcolor: `${NIVEL_COR[n]}22`, fontWeight: 800 }} />)}
          </Box>
        </Section>
        {data.reunioesMensaisFaltantes?.length > 0 && <Alert severity="error" sx={{ mb: 2 }}>Reuniões ordinárias mensais não realizadas: {data.reunioesMensaisFaltantes.join(", ")}.</Alert>}
        {sit.data && (
          <Section title="Situação da gestão (NR-5)">
            <Typography variant="body2">{sit.data.diasParaFim} dia(s) para o fim do mandato · {sit.data.reunioesRealizadas} reunião(ões) realizada(s)</Typography>
            {sit.data.composicao?.conforme ? <Alert severity="success" sx={{ mt: 1 }}>Composição conforme.</Alert> : (sit.data.composicao?.problemas || []).map((p: string, i: number) => <Alert key={i} severity="warning" sx={{ mt: 1 }}>{p}</Alert>)}
          </Section>
        )}
      </>)}
    </Status>
  );
}

function Matriz() {
  const { data } = useApi<any>("/governanca/cipa/riscos?pageSize=200");
  const itens = toArr(data).filter((r: any) => r.status !== "CONTROLADO");
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Matriz de risco (riscos não controlados) — gravidade x probabilidade</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "60px repeat(5, 1fr)", gap: 0.5, maxWidth: 480 }}>
        {[5, 4, 3, 2, 1].map((g) => (
          <Box key={g} sx={{ display: "contents" }}>
            <Typography variant="caption" sx={{ alignSelf: "center" }}>Grav. {g}</Typography>
            {[1, 2, 3, 4, 5].map((p) => {
              const n = itens.filter((r: any) => r.gravidade === g && r.probabilidade === p).length;
              return <Box key={p} sx={{ bgcolor: corCelula(g, p), opacity: n ? 1 : 0.28, color: "#fff", textAlign: "center", borderRadius: 1, py: 1, fontWeight: 800 }}>{n || ""}</Box>;
            })}
          </Box>
        ))}
        <Box />{[1, 2, 3, 4, 5].map((p) => <Typography key={p} variant="caption" sx={{ textAlign: "center" }}>Prob. {p}</Typography>)}
      </Box>
    </Paper>
  );
}

function CatButton({ a, onDone }: { a: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("");
  const { toast, node } = useToast();
  if (!a.catObrigatoria) return <>—</>;
  if (a.catEmitida) return <Chip size="small" color="success" label={`CAT ${a.catNumero}`} />;
  async function go() { try { await eduApi.post(`/governanca/cipa/acidentes/${a.id}/cat`, { catNumero: num }); setOpen(false); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <>
      <Button size="small" color="error" variant="outlined" onClick={() => setOpen(true)}>Registrar CAT (até {fmtDate(a.catPrazo)})</Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Registrar emissão da CAT</DialogTitle>
        <DialogContent><TextField autoFocus size="small" fullWidth label="Número da CAT" value={num} onChange={(e) => setNum(e.target.value)} sx={{ mt: 1 }} /></DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="contained" disabled={num.length < 3} onClick={go}>Registrar</Button></DialogActions>
      </Dialog>
      {node}
    </>
  );
}

export default function CipaTab() {
  const [v, setV] = useState("painel");
  const [k, setK] = useState(0);
  const gestoes = useOptions("/governanca/cipa/gestoes?pageSize=50", (g) => g.nome);
  const bump = () => setK((x) => x + 1);
  return (
    <Box>
      <ToggleButtonGroup size="small" exclusive value={v} onChange={(_, x) => x && setV(x)} sx={{ mb: 2, flexWrap: "wrap" }}>
        {[["painel", "Painel"], ["gestoes", "Gestões"], ["membros", "Membros"], ["reunioes", "Reuniões"], ["riscos", "Mapa de riscos"], ["inspecoes", "Inspeções"], ["acidentes", "Acidentes / CAT"], ["sipat", "SIPAT"], ["plano", "Plano de ação"]].map(([x, l]) => <ToggleButton key={x} value={x}>{l}</ToggleButton>)}
      </ToggleButtonGroup>
      {v === "painel" && <Painel />}
      {v === "gestoes" && <EduResourcePage title="Gestões da CIPA (mandato de 1 ano)" base="/governanca" resource="/cipa/gestoes"
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "inicio", label: "Início do mandato", type: "date", required: true, createOnly: true }, { key: "eleicaoEm", label: "Data da eleição", type: "date" }, { key: "ataEleicao", label: "Ata da eleição", type: "textarea" }]}
        columns={[{ key: "nome", label: "Gestão" }, { key: "inicio", label: "Início", render: (r) => fmtDate(r.inicio) }, { key: "fim", label: "Fim", render: (r) => fmtDate(r.fim) }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]}
        rowActions={[{ label: "Ativar", path: "/cipa/gestoes/:id/ativar", color: "success", confirm: "Ativar esta gestão? Exige composição conforme com a NR-5.", hidden: (r) => r.status !== "ELEICAO" }, { label: "Encerrar", path: "/cipa/gestoes/:id/encerrar", color: "warning", confirm: "Encerrar esta gestão?", hidden: (r) => r.status === "ENCERRADA" }]} />}
      {v === "membros" && <EduResourcePage title="Membros da CIPA" base="/governanca" resource="/cipa/membros"
        description="NR-5: presidente indicado pelo empregador; vice-presidente eleito pelos empregados."
        fields={[{ key: "gestaoId", label: "Gestão", type: "select", options: gestoes, required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "representacao", label: "Representação", type: "select", options: opts(["EMPREGADOR", "EMPREGADOS"]), required: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["TITULAR", "SUPLENTE"]) }, { key: "cargo", label: "Cargo", type: "select", options: opts(["PRESIDENTE", "VICE_PRESIDENTE", "SECRETARIO", "MEMBRO"]) }]}
        columns={[{ key: "nome", label: "Nome" }, { key: "representacao", label: "Representação", render: (r) => label(r.representacao) }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "cargo", label: "Cargo", render: (r) => label(r.cargo) }]} />}
      {v === "reunioes" && <EduResourcePage title="Reuniões da CIPA" base="/governanca" resource="/cipa/reunioes" description="Reunião ordinária mensal obrigatória; para marcar como realizada registre a ata."
        fields={[{ key: "gestaoId", label: "Gestão", type: "select", options: gestoes, required: true, createOnly: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["ORDINARIA", "EXTRAORDINARIA"]) }, { key: "data", label: "Data", type: "date", required: true }, { key: "pauta", label: "Pauta", type: "textarea" }, { key: "ata", label: "Ata", type: "textarea" }, { key: "realizada", label: "Realizada", type: "bool" }]}
        columns={[{ key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "competencia", label: "Competência" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "realizada", label: "Realizada" }]} />}
      {v === "riscos" && <><Matriz key={k} /><EduResourcePage title="Mapa de riscos" base="/governanca" resource="/cipa/riscos" filters={[{ key: "nivel", label: "Nível", options: ["BAIXO", "MEDIO", "ALTO", "CRITICO"] }, { key: "agente", label: "Agente", options: AGENTES }]}
        description="Riscos ALTO/CRÍTICO geram automaticamente uma ação no plano."
        fields={[{ key: "local", label: "Local", required: true }, { key: "setor", label: "Setor" }, { key: "agente", label: "Agente", type: "select", options: opts(AGENTES), required: true }, { key: "descricao", label: "Descrição", type: "textarea", required: true }, { key: "gravidade", label: "Gravidade (1-5)", type: "number", required: true }, { key: "probabilidade", label: "Probabilidade (1-5)", type: "number", required: true }, { key: "medidaControle", label: "Medida de controle", type: "textarea" }, { key: "status", label: "Status", type: "select", options: opts(["ABERTO", "EM_CONTROLE", "CONTROLADO"]) }]}
        columns={[{ key: "local", label: "Local" }, { key: "agente", label: "Agente", render: (r) => label(r.agente) }, { key: "descricao", label: "Descrição" }, { key: "pontuacao", label: "Pontos" }, { key: "nivel", label: "Nível", render: (r) => <Chip size="small" label={label(r.nivel)} sx={{ bgcolor: `${NIVEL_COR[r.nivel] || "#94a3b8"}33`, fontWeight: 800 }} /> }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]} /></>}
      {v === "inspecoes" && <EduResourcePage title="Inspeções de segurança" base="/governanca" resource="/cipa/inspecoes"
        fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "local", label: "Local", required: true }, { key: "achados", label: "Achados", type: "textarea" }, { key: "conclusao", label: "Conclusão", type: "textarea" }, { key: "realizada", label: "Realizada", type: "bool" }]}
        columns={[{ key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "local", label: "Local" }, { key: "realizada", label: "Realizada" }]} />}
      {v === "acidentes" && <EduResourcePage key={k} title="Acidentes e CAT" base="/governanca" resource="/cipa/acidentes" description="A CAT é exigida para empregados (exceto incidentes) até o 1º dia útil seguinte — imediata em caso de morte."
        fields={[{ key: "data", label: "Data", type: "date", required: true }, { key: "pessoaNome", label: "Pessoa", required: true }, { key: "vinculo", label: "Vínculo", type: "select", options: opts(["EMPREGADO", "ALUNO", "TERCEIRO"]) }, { key: "tipo", label: "Tipo", type: "select", options: opts(["TIPICO", "TRAJETO", "DOENCA_OCUPACIONAL", "INCIDENTE"]) }, { key: "gravidade", label: "Gravidade", type: "select", options: opts(["LEVE", "MODERADO", "GRAVE", "FATAL"]) }, { key: "local", label: "Local" }, { key: "descricao", label: "Descrição", type: "textarea", required: true }, { key: "diasAfastamento", label: "Dias de afastamento", type: "number" }]}
        columns={[{ key: "data", label: "Data", render: (r) => fmtDate(r.data) }, { key: "pessoaNome", label: "Pessoa" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "gravidade", label: "Gravidade", render: (r) => label(r.gravidade) }, { key: "cat", label: "CAT", render: (r) => <CatButton a={r} onDone={bump} /> }]} />}
      {v === "sipat" && <EduResourcePage title="SIPAT" base="/governanca" resource="/cipa/sipat"
        fields={[{ key: "ano", label: "Ano", type: "number", required: true }, { key: "tema", label: "Tema", required: true }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date", required: true }, { key: "participantes", label: "Participantes", type: "number" }, { key: "status", label: "Status", type: "select", options: opts(["PLANEJADA", "REALIZADA", "CANCELADA"]) }]}
        columns={[{ key: "ano", label: "Ano" }, { key: "tema", label: "Tema" }, { key: "inicio", label: "Início", render: (r) => fmtDate(r.inicio) }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]} />}
      {v === "plano" && <EduResourcePage title="Plano de ação SST" base="/governanca" resource="/cipa/plano-acao" filters={[{ key: "status", label: "Status", options: STATUS_ACAO }]}
        fields={[{ key: "acao", label: "Ação", type: "textarea", required: true }, { key: "prazo", label: "Prazo", type: "date", required: true }, { key: "status", label: "Status", type: "select", options: opts(STATUS_ACAO) }]}
        columns={[{ key: "acao", label: "Ação" }, { key: "origem", label: "Origem", render: (r) => label(r.origem) }, { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) }, { key: "status", label: "Status", render: (r) => <StatusChip value={r.status} /> }]} />}
    </Box>
  );
}
