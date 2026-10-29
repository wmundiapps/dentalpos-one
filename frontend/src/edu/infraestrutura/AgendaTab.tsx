import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { Bar, FormDialog, Kpi, KpiRow, LoadBox, ResourceTab, Status, call, fmtDate, fmtMoney, label, opts, useApi, usePessoas, useRunner, useToast, type FormField } from "./kit2";

const TIPOS = ["PREVENTIVA", "EVENTUAL", "AQUISICAO", "EXPANSAO", "SEGURANCA", "AVISO", "SINALIZACAO", "IDENTIDADE_VISUAL", "MOBILIARIO"];
const AREAS = ["EQUIPAMENTOS", "TELHADO", "BANHEIRO", "JARDIM", "ELETRICA", "HIDRAULICA", "PINTURA", "CALCAMENTO", "INSPECAO", "EXTINTOR", "CIPA", "EPI", "SIMULADO", "COMUNICACAO", "MOBILIARIO", "OUTRO"];
const PRIOR = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];

function NotasDialog({ item, onClose }: { item: any; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [txt, setTxt] = useState("");
  const { toast, node } = useToast();
  const d = useApi<any>(`/infraestrutura/agenda/itens/${item.id}`, [rev]);
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Anotações — {item.titulo}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} empty={!(d.data?.notas ?? []).length} emptyText="Sem anotações ainda." onRetry={d.reload}>
          {(d.data?.notas ?? []).map((n: any) => (
            <Box key={n.id} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="caption" color="text.secondary">{n.autorNome || "—"} · {new Date(n.createdAt).toLocaleString("pt-BR")}</Typography>
              <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.texto}</Typography>
            </Box>
          ))}
        </LoadBox>
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <TextField size="small" fullWidth multiline label="Nova anotação" value={txt} onChange={(e) => setTxt(e.target.value)} />
          <Button variant="contained" disabled={!txt.trim()} onClick={() => run(async () => { await call("POST", `/infraestrutura/agenda/itens/${item.id}/notas`, { texto: txt }); setTxt(""); }, "Anotação salva.")}>Salvar</Button>
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function AgendaTab() {
  const pessoas = usePessoas();
  const [rev, setRev] = useState(0);
  const [notas, setNotas] = useState<any>(null);
  const [concluir, setConcluir] = useState<any>(null);
  const resumo = useApi<any>("/infraestrutura/agenda/resumo", [rev]);
  const r = resumo.data;
  const FIELDS: FormField[] = useMemo(() => [
    { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(TIPOS) },
    { key: "area", label: "Área", type: "select", required: true, options: opts(AREAS) },
    { key: "titulo", label: "Título", required: true, full: true },
    { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim / prazo", type: "date" },
    { key: "responsavelUserId", label: "Responsável", type: "select", options: pessoas },
    { key: "prioridade", label: "Prioridade", type: "select", options: opts(PRIOR) },
    { key: "recorrenciaDias", label: "Repetir a cada (dias) — só preventiva", type: "number", helper: "Ao concluir, a próxima ocorrência é criada automaticamente." },
    { key: "departamentoNome", label: "Departamento" }, { key: "local", label: "Local" },
    { key: "custoPrevisto", label: "Custo previsto (R$)", type: "number" },
    { key: "descricao", label: "Descrição", type: "textarea", full: true }, { key: "anotacoes", label: "Anotações", type: "textarea", full: true },
  ], [pessoas]);
  return (
    <>
      <KpiRow>
        <Kpi title="Itens" value={r?.total ?? "—"} /><Kpi title="Atrasados" value={r?.atrasados?.length ?? "—"} color={r?.atrasados?.length ? "#d64545" : undefined} />
        <Kpi title="Próximos 30 dias" value={r?.proximos30Dias ?? "—"} /><Kpi title="Preventivas recorrentes" value={r?.preventivasRecorrentes ?? "—"} />
        <Kpi title="Previsto em aberto" value={fmtMoney(r?.custoPrevisto)} /><Kpi title="Realizado" value={fmtMoney(r?.custoRealizado)} />
      </KpiRow>
      {r?.porTipo && Object.entries(r.porTipo as Record<string, number>).map(([k, v]) => <Bar key={k} label={label(k)} value={v} max={r.total || 1} right={v} />)}
      {r?.atrasados?.length ? <Alert severity="warning" sx={{ my: 1.5 }}>Atrasados: {r.atrasados.slice(0, 5).map((a: any) => `${a.codigo} ${a.titulo}`).join(" · ")}</Alert> : null}
      <ResourceTab title="Agenda de infraestrutura" path="/agenda/itens" fields={FIELDS} newLabel="Novo item" refreshKey={rev} anexoRef="Agenda" deletable
        intro={<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Preventivas recorrentes e eventuais, aquisições e expansões, segurança do trabalho (extintores, CIPA, EPIs, simulados), avisos, sinalização, identidade visual e mobiliário por departamento.</Typography>}
        filters={[{ key: "tipo", label: "Tipo", options: opts(TIPOS) }, { key: "area", label: "Área", options: opts(AREAS) }, { key: "status", label: "Situação", options: opts(["PLANEJADO", "EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]) }]}
        columns={[
          { label: "Item", primary: true, render: (x) => <><b>{x.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{x.codigo} · {label(x.tipo)} · {label(x.area)}</Typography></> },
          { label: "Quando", render: (x) => `${fmtDate(x.inicio)}${x.fim ? " → " + fmtDate(x.fim) : ""}` },
          { label: "Responsável", render: (x) => x.responsavelNome || "—" }, { label: "Depto.", hideOnMobile: true, render: (x) => x.departamentoNome || "—" },
          { label: "Situação", render: (x) => <><Status value={x.status} />{x.atrasado ? " ⚠" : ""}</> },
        ]}
        rowActions={(x, { run }) => [
          { label: "Anotações", onClick: () => setNotas(x) },
          { label: "Iniciar", show: x.status === "PLANEJADO", onClick: () => { void run(() => call("POST", `/infraestrutura/agenda/itens/${x.id}/iniciar`), "Iniciado."); } },
          { label: "Concluir", show: ["PLANEJADO", "EM_ANDAMENTO"].includes(x.status), onClick: () => setConcluir(x) },
          { label: "Cancelar", color: "error", show: ["PLANEJADO", "EM_ANDAMENTO"].includes(x.status), onClick: () => { void run(() => call("POST", `/infraestrutura/agenda/itens/${x.id}/cancelar`, {}), "Cancelado.", "Cancelar este item?"); } },
        ]} />
      {notas && <NotasDialog item={notas} onClose={() => setNotas(null)} />}
      <FormDialog open={!!concluir} title={`Concluir — ${concluir?.titulo ?? ""}`} onClose={() => setConcluir(null)} maxWidth="sm" submitLabel="Concluir"
        intro={concluir?.recorrenciaDias ? <Alert severity="info">Preventiva recorrente: a próxima ocorrência será agendada em {concluir.recorrenciaDias} dias.</Alert> : undefined}
        fields={[{ key: "custoReal", label: "Custo realizado (R$)", type: "number" }, { key: "nota", label: "Anotação final", type: "textarea", full: true }]}
        onSubmit={async (b) => { await call("POST", `/infraestrutura/agenda/itens/${concluir.id}/concluir`, b); setConcluir(null); setRev((x) => x + 1); }} />
    </>
  );
}
