import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, FormDialog, ORIGENS, CANAIS, REDES, Lista, LoadBox, M, Status, call, fmtDate, fmtMoney, label, opts, useApi, useToast, type FormField } from "./kit";

const PUBLICOS = ["ENSINO_MEDIO", "PROFISSIONAIS", "EGRESSOS", "ALUNOS", "COMUNIDADE", "EMPRESAS", "LEADS"];
const FIELDS: FormField[] = [
  { key: "nome", label: "Nome da campanha", required: true, full: true }, { key: "objetivo", label: "Objetivo" }, { key: "publico", label: "Público", type: "select", options: opts(PUBLICOS) },
  { key: "briefing", label: "Briefing", type: "textarea", full: true }, { key: "canais", label: "Canais (separe por vírgulas)", type: "list", helper: "Ex.: INSTAGRAM, GOOGLE_ADS, EMAIL, RADIO", full: true },
  { key: "cursoNome", label: "Curso" }, { key: "responsavelNome", label: "Responsável" }, { key: "inicio", label: "Início", type: "date", required: true }, { key: "fim", label: "Fim", type: "date", required: true },
  { key: "orcamentoPrevisto", label: "Orçamento previsto (R$)", type: "number" }, { key: "metaLeads", label: "Meta de leads", type: "number" }, { key: "metaMatriculas", label: "Meta de matrículas", type: "number" },
  { key: "baseLegal", label: "Base legal (LGPD)", type: "select", options: opts(["CONSENTIMENTO", "LEGITIMO_INTERESSE", "EXECUCAO_CONTRATO", "PROCEDIMENTOS_PRELIMINARES"]), helper: "Marketing exige consentimento ou legítimo interesse; o opt-in continua obrigatório no envio." },
  { key: "utmCampaign", label: "utm_campaign" },
];

function Detalhe({ id, onClose }: { id: string; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [custo, setCusto] = useState(false);
  const d = useApi<any>(`${M}/campanhas/${id}`, [rev]);
  const { toast, node } = useToast();
  const c = d.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{c?.nome ?? "Campanha"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {c && (
            <>
              <Typography variant="body2" color="text.secondary">{c.codigo} · {fmtDate(c.inicio)} a {fmtDate(c.fim)} · {c.responsavelNome ?? "sem responsável"} · base legal: {label(c.baseLegal)}</Typography>
              <Box sx={{ my: 1 }}><Status value={c.status} /></Box>
              {c.briefing && <Alert severity="info" icon={false} sx={{ mb: 2, whiteSpace: "pre-line" }}>{c.briefing}</Alert>}
              <Bar label="Orçamento realizado x previsto" value={c.orcamentoRealizado} max={c.orcamentoPrevisto || 1} right={`${fmtMoney(c.orcamentoRealizado)} / ${fmtMoney(c.orcamentoPrevisto)}`} />
              <Typography variant="body2" sx={{ mt: 1 }}>Leads: <b>{c.leads}</b>{c.metaLeads ? ` / meta ${c.metaLeads}` : ""} · Matriculados: <b>{c.matriculados}</b> · Publicações: {c.publicacoes} · Disparos: {c.disparos}</Typography>
              {c.motivoRejeicao && <Alert severity="warning" sx={{ mt: 1 }}>Rejeitada: {c.motivoRejeicao}</Alert>}
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}><Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Custos lançados</Typography><Button size="small" variant="outlined" onClick={() => setCusto(true)}>Lançar custo</Button></Box>
              {c.custos.length ? c.custos.map((x: any) => <Typography key={x.id} variant="body2">{fmtDate(x.data)} · {label(x.tipo)}{x.origem ? ` · ${label(x.origem)}` : ""} · <b>{fmtMoney(x.valor)}</b> {x.descricao ?? ""}</Typography>) : <Typography color="text.secondary" variant="body2">Nenhum custo lançado.</Typography>}
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2 }}>Histórico e aprovação</Typography>
              {c.historico.map((h: any) => <Typography key={h.id} variant="body2">{new Date(h.createdAt).toLocaleString("pt-BR")} · {label(h.acao)}{h.nota ? ` — ${h.nota}` : ""}</Typography>)}
              <FormDialog open={custo} title="Lançar custo" onClose={() => setCusto(false)} maxWidth="sm"
                fields={[{ key: "valor", label: "Valor (R$)", type: "number", required: true }, { key: "tipo", label: "Tipo", type: "select", required: true, options: opts(["MIDIA", "PRODUCAO", "EQUIPE", "EVENTO", "OUTROS"]) }, { key: "origem", label: "Canal / origem", type: "select", options: opts(ORIGENS) }, { key: "descricao", label: "Descrição", full: true }]}
                initial={{ tipo: "MIDIA" }} onSubmit={async (b) => { await call("POST", `${M}/custos`, { ...b, campanhaId: id }); setRev((x) => x + 1); toast({ type: "success", text: "Custo lançado." }); }} />
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

export default function CampanhasTab() {
  const [det, setDet] = useState<string | null>(null);
  const [rej, setRej] = useState<any>(null);
  return (
    <>
      <Lista title="Campanhas" path="/campanhas" fields={FIELDS} newLabel="Nova campanha" onRowClick={(r) => setDet(r.id)}
        intro={<Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Planeje com briefing, responsável e orçamento. Campanhas acima do limite de orçamento passam por aprovação de um gestor (quem criou não aprova). Os disparos só rodam em campanhas aprovadas ou ativas.</Typography>}
        filters={[{ key: "status", label: "Situação", options: opts(["RASCUNHO", "EM_APROVACAO", "APROVADA", "REJEITADA", "ATIVA", "PAUSADA", "CONCLUIDA", "CANCELADA"]) }, { key: "canal", label: "Canal", options: opts([...ORIGENS, ...CANAIS, ...REDES].filter((v, i, a) => a.indexOf(v) === i)) }, { key: "publico", label: "Público", options: opts(PUBLICOS) }]}
        columns={[
          { label: "Campanha", primary: true, render: (r) => <><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo} · {(r.canais || []).map(label).join(", ") || "sem canais"}</Typography></> },
          { label: "Período", render: (r) => `${fmtDate(r.inicio)} – ${fmtDate(r.fim)}` }, { label: "Responsável", hideOnMobile: true, render: (r) => r.responsavelNome ?? "—" },
          { label: "Previsto", render: (r) => fmtMoney(r.orcamentoPrevisto) }, { label: "Realizado", render: (r) => fmtMoney(r.orcamentoRealizado) }, { label: "Situação", render: (r) => <Status value={r.status} /> },
        ]}
        rowActions={(r, { run }) => [
          { label: "Detalhes", onClick: () => setDet(r.id) },
          { label: "Enviar para aprovação", show: ["RASCUNHO", "REJEITADA"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/enviar-aprovacao`), "Enviada para aprovação."); } },
          { label: "Aprovar", show: r.status === "EM_APROVACAO", onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/aprovar`), "Campanha aprovada."); } },
          { label: "Rejeitar", color: "error", show: r.status === "EM_APROVACAO", onClick: () => setRej(r) },
          { label: "Ativar", show: ["APROVADA", "PAUSADA", "RASCUNHO"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/ativar`), "Campanha ativa."); } },
          { label: "Pausar", show: r.status === "ATIVA", onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/pausar`), "Pausada."); } },
          { label: "Concluir", show: ["ATIVA", "PAUSADA"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/concluir`), "Concluída.", "Concluir a campanha?"); } },
          { label: "Vincular ao funil de Admissões", show: !r.admCampanhaId, onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/vincular-admissoes`), "Vinculada (UTM gerada)."); } },
          { label: "Cancelar", color: "error", show: !["CONCLUIDA", "CANCELADA"].includes(r.status), onClick: () => { void run(() => call("POST", `${M}/campanhas/${r.id}/cancelar`), "Cancelada.", "Cancelar a campanha?"); } },
        ]} />
      {det && <Detalhe id={det} onClose={() => setDet(null)} />}
      <FormDialog open={!!rej} title="Rejeitar campanha" onClose={() => setRej(null)} maxWidth="sm" fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }]} onSubmit={async (b) => { await call("POST", `${M}/campanhas/${rej.id}/rejeitar`, b); }} />
    </>
  );
}
