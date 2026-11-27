import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { FormDialog, Lista, LoadBox, M, Section, Status, call, fmtDateTime, fmtMoney, itemsOf, label, opts, useApi, useToast } from "./kit";

function Eventos() {
  const [insc, setInsc] = useState<any>(null);
  const [ck, setCk] = useState(false);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const l = useApi<any>(insc ? `${M}/eventos/${insc.id}/inscricoes` : null, [rev, insc?.id]);
  return (
    <>
      {node}
      <Lista title="Eventos" path="/eventos" embedded search={false} refreshKey={rev} newLabel="Novo evento"
        extraActions={<><Button onClick={() => setCk(true)} sx={{ mr: 1 }}>Check-in por QR</Button><Button onClick={() => call("POST", `${M}/eventos/lembretes`).then((r: any) => toast({ type: "success", text: `Lembretes: ${r.enviados} enviados, ${r.bloqueados} bloqueados (supressão).` })).catch((e) => toast({ type: "error", text: e.message }))} sx={{ mr: 1 }}>Enviar lembretes</Button></>}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Eventos publicados aparecem no site; a inscrição gera lead (origem EVENTO), QR de presença e lembrete 24 h antes (somente para quem aceitou e não está na lista de supressão).</Alert>}
        fields={[{ key: "titulo", label: "Título", required: true, full: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["PALESTRA", "OPEN_DAY", "WORKSHOP", "FEIRA", "VESTIBULAR", "VISITA", "AULA_ABERTA", "OUTRO"]) }, { key: "inicio", label: "Início", type: "datetime", required: true }, { key: "fim", label: "Fim", type: "datetime" }, { key: "local", label: "Local" }, { key: "vagas", label: "Vagas (0 = ilimitado)", type: "number" }, { key: "custo", label: "Custo (R$)", type: "number" }, { key: "descricao", label: "Descrição", type: "textarea", full: true }]}
        columns={[{ label: "Evento", primary: true, render: (r) => <><b>{r.titulo}</b><Typography variant="caption" component="div" color="text.secondary">{label(r.tipo)} · {fmtDateTime(r.inicio)} · {r.local ?? "—"}</Typography></> }, { label: "Inscritos", render: (r) => `${r.inscritos}${r.vagas ? ` / ${r.vagas}` : ""}` }, { label: "Presentes", render: (r) => r.presentes }, { label: "Espera", hideOnMobile: true, render: (r) => r.listaEspera }, { label: "Custo", hideOnMobile: true, render: (r) => fmtMoney(r.custo) }, { label: "Situação", render: (r) => <Status value={r.status} /> }]}
        rowActions={(r, { run }) => [
          { label: "Publicar", show: r.status === "RASCUNHO", onClick: () => { void run(() => call("POST", `${M}/eventos/${r.id}/publicar`), "Publicado."); } },
          { label: "Inscritos", onClick: () => setInsc(r) },
          { label: "Encerrar", show: r.status === "PUBLICADO", onClick: () => { void run(() => call("POST", `${M}/eventos/${r.id}/encerrar`), "Encerrado."); } },
          { label: "Cancelar", color: "error", show: ["RASCUNHO", "PUBLICADO"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/eventos/${r.id}/cancelar`), "Cancelado.", "Cancelar o evento?"); } },
        ]} />
      <Dialog open={!!insc} onClose={() => setInsc(null)} fullWidth maxWidth="sm">
        <DialogTitle>Inscritos — {insc?.titulo}</DialogTitle>
        <DialogContent dividers><LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} onRetry={l.reload}>{itemsOf(l.data).map((i: any) => <Typography key={i.id} variant="body2" sx={{ py: 0.4 }}><b>{i.nome}</b> · {i.email ?? i.telefone ?? "—"} · <Status value={i.status} /></Typography>)}</LoadBox></DialogContent>
        <DialogActions><Button onClick={() => setInsc(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <FormDialog open={ck} title="Check-in por QR" onClose={() => setCk(false)} maxWidth="sm" intro={<Typography variant="body2" sx={{ mb: 1 }}>Leia o QR do participante (ou digite o código) para registrar a presença.</Typography>}
        fields={[{ key: "qrToken", label: "Código do QR", required: true }]} submitLabel="Registrar presença" onSubmit={async (b) => { const r: any = await call("POST", `${M}/eventos/checkin`, b); toast({ type: "success", text: r.jaRegistrado ? `${r.nome}: presença já registrada.` : `Presença de ${r.nome} registrada.` }); setRev((x) => x + 1); }} />
    </>
  );
}

function Incentivos() {
  const [rk, setRk] = useState<any>(null);
  const [ind, setInd] = useState<any>(null);
  const [rev, setRev] = useState(0);
  const { toast, node } = useToast();
  const r = useApi<any>(rk ? `${M}/programas/${rk.id}/ranking` : null, [rk?.id, rev]);
  const ic = useApi<any>(`${M}/indicacoes`, [rev]);
  return (
    <>
      {node}
      <Lista title="Programas de incentivo" path="/programas" embedded search={false} refreshKey={rev} newLabel="Novo programa"
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Indicação premiada e endomarketing para alunos, professores, equipe e comunidade. Cada indicador recebe um código/link; a recompensa só é liberada quando o indicado se matricula.</Alert>}
        fields={[{ key: "nome", label: "Nome", required: true, full: true }, { key: "publicoAlvo", label: "Público", type: "select", required: true, options: opts(["ALUNOS", "PROFESSORES", "EQUIPE", "COMUNIDADE"]) }, { key: "recompensa", label: "Recompensa", required: true }, { key: "valorRecompensa", label: "Valor (R$)", type: "number" }, { key: "metaIndicacoes", label: "Meta de indicações", type: "number" }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date" }, { key: "regras", label: "Regras", type: "textarea", full: true }]}
        columns={[{ label: "Programa", primary: true, render: (x) => <><b>{x.nome}</b><Typography variant="caption" component="div" color="text.secondary">{label(x.publicoAlvo)} · {x.recompensa}</Typography></> }, { label: "Meta", render: (x) => x.metaIndicacoes || "—" }, { label: "Ativo", render: (x) => (x.ativo ? "Sim" : "Não") }]}
        rowActions={(x) => [{ label: "Novo indicador (gera código)", onClick: () => setInd(x) }, { label: "Ranking", onClick: () => setRk(x) }]} />
      <Section title="Indicações recebidas">
        <LoadBox loading={ic.loading} error={ic.error} empty={!itemsOf(ic.data).length} emptyText="Nenhuma indicação ainda." onRetry={ic.reload}>
          {itemsOf(ic.data).map((i: any) => <Box key={i.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.5, flexWrap: "wrap" }}><Status value={i.status} /><Typography variant="body2" sx={{ flex: 1 }}>{fmtDateTime(i.createdAt)}</Typography>{i.status === "CONVERTIDA" && <Button size="small" onClick={() => call("POST", `${M}/indicacoes/${i.id}/recompensar`).then(() => { setRev((x) => x + 1); toast({ type: "success", text: "Recompensa liberada." }); }).catch((e) => toast({ type: "error", text: e.message }))}>Liberar recompensa</Button>}</Box>)}
        </LoadBox>
      </Section>
      <FormDialog open={!!ind} title={`Novo indicador — ${ind?.nome ?? ""}`} onClose={() => setInd(null)} maxWidth="sm" initial={{ tipo: "ALUNO" }} fields={[{ key: "nome", label: "Nome do indicador", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["ALUNO", "PROFESSOR", "FUNCIONARIO", "COMUNIDADE"]) }]}
        onSubmit={async (b) => { const x: any = await call("POST", `${M}/programas/${ind.id}/indicadores`, b); toast({ type: "success", text: `Código ${x.codigo} — link: ${x.link}` }); }} />
      <Dialog open={!!rk} onClose={() => setRk(null)} fullWidth maxWidth="sm">
        <DialogTitle>Ranking — {rk?.nome}</DialogTitle>
        <DialogContent dividers><LoadBox loading={r.loading} error={r.error} empty={!r.data?.ranking?.length} emptyText="Sem indicadores." onRetry={r.reload}>{(r.data?.ranking ?? []).map((x: any, i: number) => <Typography key={x.indicadorId} variant="body2" sx={{ py: 0.4 }}>{i + 1}. <b>{x.nome}</b> ({x.codigo}) — {x.indicacoes} indicações · {x.convertidas} matrículas · {x.recompensadas} recompensas</Typography>)}</LoadBox></DialogContent>
        <DialogActions><Button onClick={() => setRk(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <TextField sx={{ display: "none" }} />
    </>
  );
}

export default function EventosTab() {
  const [t, setT] = useState(0);
  return (<><Tabs value={t} onChange={(_, v) => setT(v)} sx={{ mb: 2 }}><Tab label="Eventos" /><Tab label="Indicação e endomarketing" /></Tabs>{t === 0 ? <Section title="Eventos da instituição"><Eventos /></Section> : <Incentivos />}</>);
}
