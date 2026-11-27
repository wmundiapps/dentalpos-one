import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { Bar, ETAPAS, FormDialog, Kpi, KpiRow, Lista, LoadBox, M, ORIGENS, Section, Status, baixarCsv, call, fmtDateTime, fmtPct, label, opts, useApi, useToast, type FormField } from "./kit";

const TEMP: Record<string, string> = { QUENTE: "#d64545", MORNO: "#e0a100", FRIO: "#0F5FDB" };
const LEAD_FIELDS: FormField[] = [
  { key: "nome", label: "Nome completo", required: true }, { key: "email", label: "E-mail" }, { key: "telefone", label: "Telefone / WhatsApp" }, { key: "curso", label: "Curso de interesse" },
  { key: "origem", label: "Origem", type: "select", required: true, options: opts(ORIGENS) }, { key: "detalheOrigem", label: "Detalhe da origem (colégio, empresa, evento...)" }, { key: "cupom", label: "Cupom / código" }, { key: "indicacao", label: "Código de indicação" },
  { key: "consentimentoContato", label: "O titular autorizou o contato (LGPD) — obrigatório", type: "bool", full: true }, { key: "consentimentoMarketing", label: "O titular também aceitou receber divulgação (opt-in de marketing)", type: "bool", full: true },
];

function LeadDialog({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [rev, setRev] = useState(0);
  const [perda, setPerda] = useState(false);
  const d = useApi<any>(`${M}/leads/${id}`, [rev]);
  const cons = useApi<any>(`${M}/consultores?pageSize=100`);
  const { toast, node } = useToast();
  const l = d.data;
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast({ type: "success", text: ok }); setRev((x) => x + 1); onChange(); } catch (e: any) { toast({ type: "error", text: e.message }); } };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{l?.nome ?? "Lead"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {l && (
            <>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                <Status value={l.etapa} /><Chip size="small" sx={{ bgcolor: TEMP[l.temperatura], color: "#fff", fontWeight: 700 }} label={`${l.temperatura} · ${l.score} pts`} />
                <Chip size="small" label={label(l.origem)} />{l.suprimido && <Chip size="small" color="error" label="Na lista de supressão" />}
                {l.consentimentoMarketing ? <Chip size="small" color="success" label="Opt-in de marketing" /> : <Chip size="small" label="Sem opt-in de marketing" />}
              </Box>
              <Typography variant="body2">{l.email ?? "sem e-mail"} · {l.telefone ?? "sem telefone"} · {l.cursoInteresse ?? "curso não informado"}</Typography>
              <Typography variant="body2">Consultor: <b>{l.consultorNome ?? "—"}</b>{l.proximoContatoEm ? ` · próximo contato até ${fmtDateTime(l.proximoContatoEm)}` : ""}</Typography>
              <Typography variant="body2">Atribuição: {l.utmSource ? `utm ${l.utmSource}/${l.utmMedium ?? "-"}/${l.utmCampaign ?? "-"}` : "sem UTM"}{l.cupom ? ` · cupom ${l.cupom}` : ""}{l.indicacaoCodigo ? ` · indicação ${l.indicacaoCodigo}` : ""}</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 2 }}>
                {ETAPAS.filter((e) => e !== l.etapa && e !== "PERDIDO").map((e) => <Button key={e} size="small" variant="outlined" onClick={() => act(() => call("POST", `${M}/leads/${id}/etapa`, { etapa: e }), `Etapa: ${label(e)}`)}>{label(e)}</Button>)}
                <Button size="small" color="error" variant="outlined" onClick={() => setPerda(true)}>Perdido</Button>
                <Button size="small" onClick={() => act(() => call("POST", `${M}/leads/${id}/atribuir`, {}), "Redistribuído.")}>Redistribuir</Button>
                <TextField select size="small" label="Atribuir a" value="" onChange={(e) => act(() => call("POST", `${M}/leads/${id}/atribuir`, { consultorId: e.target.value }), "Atribuído.")} sx={{ minWidth: 160 }} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
                  <option value="" />{(cons.data?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </TextField>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
                {["RESPONDEU", "VISITOU_CURSO", "SIMULOU_MENSALIDADE", "SOLICITOU_CONTATO", "NOTA", "LIGACAO"].map((t) => <Chip key={t} clickable size="small" label={`+ ${label(t)}`} onClick={() => act(() => call("POST", `${M}/leads/${id}/eventos`, { tipo: t }), "Registrado.")} />)}
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Prova de consentimento</Typography>
              {l.consentimentos.length ? l.consentimentos.map((c: any) => <Typography key={c.id} variant="body2">{fmtDateTime(c.createdAt)} · {label(c.finalidade)} · {label(c.baseLegal)} · texto v{c.textoVersao} (hash {String(c.textoHash).slice(0, 8)}…) · {label(c.origem)}{c.revogadoEm ? ` · REVOGADO em ${fmtDateTime(c.revogadoEm)}` : ""}</Typography>) : <Typography variant="body2" color="text.secondary">Nenhum registro.</Typography>}
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2 }}>Linha do tempo</Typography>
              {l.eventos.map((e: any) => <Typography key={e.id} variant="body2">{fmtDateTime(e.createdAt)} · {label(e.tipo)}{e.pontos ? ` (${e.pontos > 0 ? "+" : ""}${e.pontos})` : ""}{e.descricao ? ` — ${e.descricao}` : ""}</Typography>)}
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 2 }}>Mensagens enviadas</Typography>
              {l.envios.length ? l.envios.map((e: any) => <Typography key={e.id} variant="body2">{fmtDateTime(e.createdAt)} · {e.canal} · {e.assunto ?? "(sem assunto)"} · <b>{e.status}</b>{e.motivo ? ` — ${e.motivo}` : ""}</Typography>) : <Typography variant="body2" color="text.secondary">Nada enviado.</Typography>}
              <FormDialog open={perda} title="Marcar lead como perdido" onClose={() => setPerda(false)} maxWidth="sm" fields={[{ key: "motivo", label: "Motivo", required: true, full: true }]} onSubmit={async (b) => { await call("POST", `${M}/leads/${id}/etapa`, { etapa: "PERDIDO", motivo: b.motivo }); setRev((x) => x + 1); onChange(); }} />
            </>
          )}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Funil() {
  const f = useApi<any>(`${M}/painel/funil`);
  const d = f.data;
  return (
    <Section title="Funil: lead → inscrito → matriculado">
      <LoadBox loading={f.loading} error={f.error} onRetry={f.reload}>
        {d && (<>
          <KpiRow><Kpi title="Lead → Inscrito" value={fmtPct(d.conversaoLeadInscrito)} /><Kpi title="Inscrito → Matrícula" value={fmtPct(d.conversaoInscritoMatricula)} /><Kpi title="Lead → Matrícula" value={fmtPct(d.conversaoLeadMatricula)} /><Kpi title="Perdidos" value={d.perdidos} /></KpiRow>
          {d.etapas.map((e: any) => <Bar key={e.etapa} label={e.rotulo} value={e.total} max={d.etapas[0].total || 1} right={String(e.total)} />)}
        </>)}
      </LoadBox>
    </Section>
  );
}

export default function LeadsTab() {
  const [det, setDet] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [imp, setImp] = useState(false);
  const { toast, node } = useToast();
  return (
    <>
      {node}
      <Funil />
      <Lista title="Leads" path="/leads" fields={LEAD_FIELDS} newLabel="Novo lead" editable={false} refreshKey={rev} onRowClick={(r) => setDet(r.id)} defaults={{ origem: "BALCAO" }}
        toBody={(b) => ({ ...b, consentimentoContato: b.consentimentoContato === true ? true : undefined, consentimentoMarketing: !!b.consentimentoMarketing })}
        extraActions={<>
          <Button onClick={() => call("POST", `${M}/leads/sincronizar-admissoes`).then((r: any) => { toast({ type: "success", text: `Funil de Admissões sincronizado: ${r.atualizados} atualizados, ${r.importados} importados.` }); setRev((x) => x + 1); }).catch((e) => toast({ type: "error", text: e.message }))}>Sincronizar com Admissões</Button>
          <Button onClick={() => setImp(true)}>Importar lista</Button>
          <Button onClick={() => baixarCsv(`${M}/leads-export.csv`, "leads.csv").catch((e) => toast({ type: "error", text: e.message }))}>Exportar CSV</Button>
        </>}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>Todo lead nasce com a prova do consentimento (texto, versão, origem). Quem não aceitou divulgação só recebe mensagens do atendimento solicitado. Leads captados aparecem também no funil de Admissões.</Alert>}
        filters={[{ key: "etapa", label: "Etapa", options: opts(ETAPAS) }, { key: "origem", label: "Origem", options: opts(ORIGENS) }, { key: "temperatura", label: "Temperatura", options: opts(["QUENTE", "MORNO", "FRIO"]) }]}
        columns={[
          { label: "Lead", primary: true, render: (r) => <><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">{r.cursoInteresse ?? "—"} · {label(r.origem)}</Typography></> },
          { label: "Score", render: (r) => <Chip size="small" sx={{ bgcolor: TEMP[r.temperatura], color: "#fff", fontWeight: 700 }} label={r.score} /> },
          { label: "Etapa", render: (r) => <Status value={r.etapa} /> }, { label: "Consultor", hideOnMobile: true, render: (r) => r.consultorNome ?? "—" },
          { label: "Opt-in", hideOnMobile: true, render: (r) => (r.consentimentoMarketing ? "Sim" : "Não") }, { label: "Captado", hideOnMobile: true, render: (r) => fmtDateTime(r.createdAt) },
        ]} />
      {det && <LeadDialog id={det} onClose={() => setDet(null)} onChange={() => setRev((x) => x + 1)} />}
      <FormDialog open={imp} title="Importar lista de leads" onClose={() => setImp(false)} maxWidth="md"
        intro={<Alert severity="warning" sx={{ mb: 2 }}>Declare a base legal. Sem comprovante de consentimento, os contatos entram SEM autorização de marketing. Formato das linhas: <code>nome;e-mail;telefone;curso</code> (uma por linha).</Alert>}
        fields={[{ key: "origem", label: "Origem", type: "select", required: true, options: opts(ORIGENS) }, { key: "baseLegal", label: "Base legal", type: "select", required: true, options: opts(["CONSENTIMENTO", "LEGITIMO_INTERESSE", "PROCEDIMENTOS_PRELIMINARES"]) }, { key: "comprovanteConsentimento", label: "Comprovante do consentimento (obrigatório para habilitar marketing)", full: true }, { key: "texto", label: "Linhas", type: "textarea", required: true, full: true }]}
        initial={{ origem: "CONVENIO_EMPRESA", baseLegal: "LEGITIMO_INTERESSE" }}
        onSubmit={async (b) => {
          const linhas = String(b.texto).split("\n").map((s) => s.trim()).filter(Boolean).map((s) => { const [nome, email, telefone, curso] = s.split(";").map((x) => x.trim()); return { nome, email, telefone, curso }; });
          const r: any = await call("POST", `${M}/leads/importar`, { origem: b.origem, baseLegal: b.baseLegal, comprovanteConsentimento: b.comprovanteConsentimento, linhas });
          toast({ type: r.marketingHabilitado ? "success" : "info", text: `${r.criados} criados, ${r.existentes} já existiam, ${r.invalidos} inválidos. ${r.aviso ?? ""}` }); setRev((x) => x + 1);
        }} />
      <Paper sx={{ display: "none" }} />
    </>
  );
}
