import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { fmtDate, fmtNum, Kpi, KpiGrid, label, Section, Status, useApi, useToast } from "../regulatorio/ui";
import { moeda, TITULACOES, toArr, useOptions } from "./shared";

const TRANS: Record<string, string[]> = { SOLICITADA: ["EM_ANALISE", "CANCELADA"], EM_ANALISE: ["DEFERIDA", "INDEFERIDA", "CANCELADA"], DEFERIDA: ["EFETIVADA", "CANCELADA"], INDEFERIDA: [], EFETIVADA: [], CANCELADA: [] };
const opts = (a: string[]) => a.map((x) => ({ value: x, label: label(x) }));

function Simulacao({ enq, onClose, onDone }: { enq: any; onClose: () => void; onDone: () => void }) {
  const { data, loading, error, reload } = useApi<any>(`/governanca/carreira/enquadramentos/${enq.id}/simulacao`);
  const { toast, node } = useToast();
  async function solicitar() {
    if (!window.confirm("Abrir processo de progressão para este servidor?")) return;
    try { await eduApi.post("/governanca/carreira/progressoes", { enquadramentoId: enq.id }); toast({ type: "success", text: "Processo de progressão aberto." }); onDone(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const s = data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Simulação de progressão — {enq.nome}</DialogTitle>
      <DialogContent dividers>
        <Status loading={loading && !s} error={error} onRetry={reload} empty={!s}>
          {s && (<>
            <Typography variant="body2" sx={{ mb: 1 }}>{s.nivelAtual?.codigo} — {s.nivelAtual?.nome} ({s.mesesNoNivel} mês(es) no nível){s.nivelDestino ? ` → ${s.nivelDestino.codigo} — ${s.nivelDestino.nome}` : ""}</Typography>
            {!s.nivelDestino ? <Alert severity="info">Não há nível superior disponível.</Alert> : (<>
              <Alert severity={s.elegivel ? "success" : "warning"} sx={{ mb: 2 }}>{s.elegivel ? "Elegível à progressão." : `Ainda não elegível. Interstício completo em ${fmtDate(s.elegivelEm)}.`}</Alert>
              <Table size="small">
                <TableHead><TableRow><TableCell>Critério</TableCell><TableCell>Exigido</TableCell><TableCell>Atual</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>{(s.criterios || []).map((c: any, i: number) => (
                  <TableRow key={i}><TableCell>{c.criterio}</TableCell><TableCell>{label(String(c.exigido))}</TableCell><TableCell>{label(String(c.atual))}</TableCell><TableCell>{c.atende ? <CheckCircleIcon color="success" fontSize="small" /> : <CancelIcon color="error" fontSize="small" />}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
              {s.impacto && <KpiGrid><Kpi title="Salário atual" value={moeda(s.impacto.salarioAtual)} /><Kpi title="Novo salário" value={moeda(s.impacto.salarioNovo)} /><Kpi title="Impacto mensal" value={moeda(s.impacto.diferenca)} hint={`${fmtNum(s.impacto.percentual, 2)}%`} /></KpiGrid>}
            </>)}
          </>)}
        </Status>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button>{s?.elegivel && <Button variant="contained" onClick={solicitar}>Solicitar progressão</Button>}</DialogActions>
      {node}
    </Dialog>
  );
}

function Elegiveis() {
  const planos = useOptions("/governanca/carreira/planos?pageSize=50", (p) => p.nome);
  const [plano, setPlano] = useState("");
  const { data, loading, error, reload } = useApi<any>(plano ? `/governanca/carreira/planos/${plano}/elegiveis` : null);
  return (
    <Section title="Servidores elegíveis à progressão" action={<TextField select size="small" label="Plano" value={plano} onChange={(e) => setPlano(e.target.value)} sx={{ minWidth: 260 }}>{planos.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField>}>
      {!plano ? <Typography color="text.secondary">Selecione um plano.</Typography> : (
        <Status loading={loading && !data} error={error} onRetry={reload} empty={!toArr(data).length} emptyText="Nenhum servidor elegível no momento.">
          {data && <><KpiGrid><Kpi title="Elegíveis" value={data.total} /><Kpi title="Impacto mensal estimado" value={moeda(data.impactoMensalEstimado)} /></KpiGrid>
            {data.items.map((i: any) => <Typography key={i.enquadramentoId} variant="body2">• <b>{i.nome}</b>: {i.de} → {i.para} (+{moeda(i.impacto?.diferenca)}/mês)</Typography>)}</>}
        </Status>
      )}
    </Section>
  );
}

function Progressoes() {
  const { data, loading, error, reload } = useApi<any>("/governanca/carreira/progressoes?pageSize=100");
  const enqs = useOptions("/governanca/carreira/enquadramentos?pageSize=200", (e) => e.nome);
  const [tr, setTr] = useState<{ p: any; para: string } | null>(null);
  const [parecer, setParecer] = useState("");
  const { toast, node } = useToast();
  const items = toArr(data);
  async function go() {
    try { await eduApi.post(`/governanca/carreira/progressoes/${tr!.p.id}/transicao`, { para: tr!.para, parecer: parecer || undefined }); setTr(null); setParecer(""); toast({ type: "success", text: "Processo atualizado." }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Processos de progressão">
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhum processo. Abra um a partir da simulação do enquadramento.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Servidor</TableCell><TableCell>Impacto</TableCell><TableCell>Status</TableCell><TableCell>Parecer</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{enqs.find((e) => e.value === p.enquadramentoId)?.label || "—"}<br /><Typography variant="caption" color="text.secondary">{fmtDate(p.createdAt)}</Typography></TableCell>
                  <TableCell>{moeda(p.impactoSalarial)}</TableCell><TableCell><StatusChip value={p.status} /></TableCell><TableCell sx={{ maxWidth: 260 }}>{p.parecer || "—"}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {(TRANS[p.status] || []).map((t) => <Button key={t} size="small" color={t === "CANCELADA" || t === "INDEFERIDA" ? "error" : "primary"} onClick={() => setTr({ p, para: t })}>{label(t)}</Button>)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Status>
      <Dialog open={!!tr} onClose={() => setTr(null)} fullWidth maxWidth="sm">
        <DialogTitle>Mover para {label(tr?.para)}</DialogTitle>
        <DialogContent dividers>
          {tr?.para === "EFETIVADA" && <Alert severity="warning" sx={{ mb: 1 }}>A efetivação move o servidor para o novo nível.</Alert>}
          <TextField fullWidth multiline minRows={4} label={["DEFERIDA", "INDEFERIDA"].includes(tr?.para || "") ? "Parecer da comissão (obrigatório, mín. 10 caracteres)" : "Observação"} value={parecer} onChange={(e) => setParecer(e.target.value)} />
        </DialogContent>
        <DialogActions><Button onClick={() => setTr(null)}>Cancelar</Button><Button variant="contained" onClick={go}>Confirmar</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}

export default function CarreiraTab() {
  const [v, setV] = useState("enq");
  const [sim, setSim] = useState<any | null>(null);
  const [k, setK] = useState(0);
  const planos = useOptions("/governanca/carreira/planos?pageSize=50", (p) => p.nome);
  const niveis = useOptions("/governanca/carreira/niveis?pageSize=200", (n) => `${n.codigo} — ${n.nome}`);
  const B = "/governanca";
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Dados salariais são sensíveis: o acesso é restrito à secretaria e ao financeiro.</Alert>
      <ToggleButtonGroup size="small" exclusive value={v} onChange={(_, x) => x && setV(x)} sx={{ mb: 2, flexWrap: "wrap" }}>
        <ToggleButton value="enq">Enquadramentos e simulação</ToggleButton><ToggleButton value="eleg">Elegíveis</ToggleButton><ToggleButton value="prog">Progressões</ToggleButton><ToggleButton value="planos">Planos</ToggleButton><ToggleButton value="niveis">Níveis</ToggleButton>
      </ToggleButtonGroup>
      {v === "planos" && <EduResourcePage title="Planos de carreira" base={B} resource="/carreira/planos" fields={[{ key: "tipo", label: "Tipo", type: "select", options: opts(["DOCENTE", "TECNICO_ADMINISTRATIVO"]), required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "vigenciaInicio", label: "Início da vigência", type: "date" }]} columns={[{ key: "nome", label: "Plano" }, { key: "tipo", label: "Tipo", render: (r) => label(r.tipo) }, { key: "niveis", label: "Níveis", render: (r) => (r.niveis || []).length }]} />}
      {v === "niveis" && <EduResourcePage title="Níveis da carreira" base={B} resource="/carreira/niveis"
        fields={[{ key: "planoId", label: "Plano", type: "select", options: planos, required: true, createOnly: true }, { key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "classe", label: "Classe" }, { key: "ordem", label: "Ordem", type: "number", required: true }, { key: "titulacaoMinima", label: "Titulação mínima", type: "select", options: opts(TITULACOES) }, { key: "intersticioMeses", label: "Interstício (meses)", type: "number" }, { key: "pontuacaoMinima", label: "Pontuação mínima", type: "number" }, { key: "avaliacaoMinima", label: "Avaliação mínima (0-10)", type: "number" }, { key: "salarioBase", label: "Salário base (R$)", type: "number", required: true }]}
        columns={[{ key: "ordem", label: "Ordem" }, { key: "codigo", label: "Código" }, { key: "nome", label: "Nível" }, { key: "intersticioMeses", label: "Interstício (m)" }, { key: "salarioBase", label: "Salário", render: (r) => moeda(r.salarioBase) }]} />}
      {v === "enq" && <EduResourcePage key={k} title="Enquadramento de servidores" base={B} resource="/carreira/enquadramentos"
        description="Informe o ID do docente/servidor (identificador externo). Mudança de nível só ocorre via processo de progressão."
        fields={[{ key: "planoId", label: "Plano", type: "select", options: planos, required: true, createOnly: true }, { key: "nivelId", label: "Nível atual", type: "select", options: niveis, required: true, createOnly: true }, { key: "docenteId", label: "ID do servidor", required: true, createOnly: true }, { key: "nome", label: "Nome", required: true }, { key: "titulacao", label: "Titulação", type: "select", options: opts(TITULACOES) }, { key: "inicioNivel", label: "Início no nível", type: "date", required: true, createOnly: true }, { key: "pontuacao", label: "Pontuação de produção", type: "number" }, { key: "avaliacao", label: "Avaliação de desempenho (0-10)", type: "number" }]}
        columns={[{ key: "nome", label: "Servidor" }, { key: "nivelId", label: "Nível", render: (r) => niveis.find((n) => n.value === r.nivelId)?.label || "—" }, { key: "titulacao", label: "Titulação", render: (r) => label(r.titulacao) }, { key: "inicioNivel", label: "No nível desde", render: (r) => fmtDate(r.inicioNivel) }, { key: "sim", label: "", render: (r) => <Button size="small" variant="outlined" onClick={() => setSim(r)}>Simular progressão</Button> }]} />}
      {v === "eleg" && <Elegiveis />}
      {v === "prog" && <Progressoes key={k} />}
      {sim && <Simulacao enq={sim} onClose={() => setSim(null)} onDone={() => { setSim(null); setK((x) => x + 1); setV("prog"); }} />}
    </Box>
  );
}
