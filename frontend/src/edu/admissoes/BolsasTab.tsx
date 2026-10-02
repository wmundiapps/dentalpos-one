import { Alert, Box, Button, Chip, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { BASE, Section, StateBox, asList, fmtDate, money, pct, useLoad, type Toast } from "./common";

const fields: FieldDef[] = [
  { key: "nome", label: "Nome", required: true },
  { key: "tipo", label: "Tipo", type: "select", options: [{ value: "BOLSA", label: "Bolsa" }, { value: "DESCONTO", label: "Desconto" }, { value: "CONVENIO", label: "Convênio" }] },
  { key: "percentual", label: "Percentual de desconto (%)", type: "number", helper: "Informe percentual ou valor fixo" },
  { key: "valorFixo", label: "Valor fixo (R$)", type: "number" },
  { key: "convenioEmpresa", label: "Empresa/entidade conveniada", helper: "Obrigatório para convênios" },
  { key: "limiteConcessoes", label: "Limite de concessões", type: "number" },
  { key: "vigenciaInicio", label: "Vigência — início", type: "date" },
  { key: "vigenciaFim", label: "Vigência — fim", type: "date" },
  { key: "cumulativa", label: "Cumulativa com outros benefícios", type: "bool" },
];

function Simulador() {
  const [q, setQ] = useState("");
  const cands = useLoad<any>(`${BASE}/candidatos${qsOf({ q, pageSize: 30 })}`);
  const [cid, setCid] = useState("");
  const [valor, setValor] = useState("");
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function simular() {
    setErro(null); setRes(null);
    try { setRes(await eduApi.post(`${BASE}/bolsas/simular`, { candidatoId: cid, ...(valor ? { valorBase: Number(valor) } : {}) })); } catch (e: any) { setErro(e.message); }
  }
  return (
    <Section title="Simulador de benefícios" description="Veja quais bolsas e descontos o candidato recebe e por que outras foram recusadas.">
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
        <TextField size="small" label="Buscar candidato" value={q} onChange={(e) => setQ(e.target.value)} />
        <TextField select size="small" label="Candidato" value={cid} onChange={(e) => setCid(e.target.value)} sx={{ minWidth: 280 }}>
          {asList(cands.data).map((c) => <MenuItem key={c.id} value={c.id}>{c.nome} — {c.protocolo}</MenuItem>)}
        </TextField>
        <TextField size="small" type="number" label="Mensalidade base (opcional)" value={valor} onChange={(e) => setValor(e.target.value)} />
        <Button variant="contained" disabled={!cid} onClick={simular}>Simular</Button>
      </Box>
      {erro ? <Alert severity="warning">{erro}</Alert> : null}
      {res ? (
        <Box sx={{ display: "grid", gap: 1 }}>
          <Typography>Mensalidade base: <b>{money(res.valorBase)}</b> · Desconto: <b>{pct(res.percentualTotal)} ({money(res.valorDesconto)})</b> · Valor final: <b>{money(res.valorFinal)}</b></Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{(res.elegiveis || []).map((b: any) => <Chip key={b.id} color="success" label={`${b.nome} (${b.percentual}%)`} />)}</Box>
          {(res.rejeitadas || []).map((b: any) => <Typography key={b.id} variant="body2" color="text.secondary"><b>{b.nome}</b> não aplicada: {(b.motivos || []).join("; ")}</Typography>)}
        </Box>
      ) : null}
    </Section>
  );
}

function Concessoes() {
  const bolsas = useLoad<any>(`${BASE}/bolsas?pageSize=200`);
  const [bid, setBid] = useState("");
  const con = useLoad<any[]>(bid ? `${BASE}/bolsas/${bid}/concessoes` : null);
  const b = asList(bolsas.data).find((x) => x.id === bid);
  const list = asList(con.data);
  return (
    <Section title="Concessões" description="Quem já recebeu cada bolsa, e quanto do limite foi usado.">
      <TextField select size="small" label="Bolsa" value={bid} onChange={(e) => setBid(e.target.value)} sx={{ minWidth: 300, mb: 2 }}>
        {asList(bolsas.data).map((x) => <MenuItem key={x.id} value={x.id}>{x.nome}</MenuItem>)}
      </TextField>
      {b?.limiteConcessoes ? <Typography variant="body2" sx={{ mb: 1 }}>{list.length} de {b.limiteConcessoes} concessões usadas</Typography> : null}
      {bid ? (
        <StateBox loading={con.loading} error={con.error} onRetry={con.reload} empty={!list.length} emptyText="Nenhuma concessão para esta bolsa.">
          <Table size="small">
            <TableHead><TableRow>{["Data", "Candidato/aluno", "Percentual", "Motivo"].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>{list.map((c) => (
              <TableRow key={c.id}><TableCell>{fmtDate(c.createdAt)}</TableCell><TableCell>{c.studentId || c.candidatoId || "—"}</TableCell><TableCell>{pct(c.percentualAplicado)}</TableCell><TableCell>{c.motivo || "—"}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </StateBox>
      ) : null}
    </Section>
  );
}

export default function BolsasTab(_: { toast: (t: Toast) => void }) {
  const [sub, setSub] = useState(0);
  return (
    <Box>
      <Tabs value={sub} onChange={(_e, v) => setSub(v)} sx={{ mb: 2 }}><Tab label="Bolsas e descontos" /><Tab label="Simulador" /><Tab label="Concessões" /></Tabs>
      {sub === 0 && (
        <EduResourcePage title="Bolsas, descontos e convênios" base={BASE} resource="/bolsas" fields={fields}
          filters={[{ key: "tipo", label: "Tipo", options: ["BOLSA", "DESCONTO", "CONVENIO"] }]}
          columns={[
            { key: "nome", label: "Nome" }, { key: "tipo", label: "Tipo", render: (r) => <StatusChip value={r.tipo} /> },
            { key: "percentual", label: "Desconto", render: (r) => (r.valorFixo ? money(r.valorFixo) : pct(r.percentual)) },
            { key: "vigencia", label: "Vigência", render: (r) => (r.vigenciaInicio || r.vigenciaFim ? `${fmtDate(r.vigenciaInicio)} a ${fmtDate(r.vigenciaFim)}` : "Indeterminada") },
            { key: "limiteConcessoes", label: "Limite", render: (r) => r.limiteConcessoes ?? "—" },
            { key: "ativo", label: "Ativa", render: (r) => (r.ativo ? "Sim" : "Não") },
          ]} />
      )}
      {sub === 1 && <Simulador />}
      {sub === 2 && <Concessoes />}
    </Box>
  );
}
