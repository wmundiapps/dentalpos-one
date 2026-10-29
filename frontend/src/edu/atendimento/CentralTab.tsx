import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useState } from "react";
import { A, CANAIS, CanalChip, FormDialog, LoadBox, Pick, PrioChip, PRIORIDADES, ROTULO_CANAL, ROTULO_STATUS, Section, SlaChip, StatusChip, call, fmtDateTime, itemsOf, opts, useApi, useIsMobile, useReload, useRunner, useToast, type FormField } from "./kit";

const NOVO: FormField[] = [
  { key: "canal", label: "Canal", type: "select", required: true, options: opts(CANAIS, ROTULO_CANAL) },
  { key: "solicitanteNome", label: "Nome do solicitante", required: true }, { key: "solicitanteContato", label: "Contato (telefone, e-mail ou @perfil)" },
  { key: "studentId", label: "Aluno (se houver)", type: "student" }, { key: "assunto", label: "Assunto", required: true, full: true },
  { key: "prioridade", label: "Prioridade", type: "select", options: opts(PRIORIDADES) }, { key: "mensagem", label: "Primeira mensagem / relato", type: "textarea" },
];
const SIMULAR: FormField[] = [
  { key: "canal", label: "Canal simulado", type: "select", required: true, options: opts(CANAIS.filter((c) => !["BALCAO", "TELEFONE"].includes(c)), ROTULO_CANAL) },
  { key: "nome", label: "Nome do contato", required: true }, { key: "contato", label: "Telefone / e-mail / perfil", required: true, helper: "Identifica o contato no canal (ex.: +5511999990000)" },
  { key: "texto", label: "Mensagem recebida", type: "textarea", required: true },
];

export default function CentralTab() {
  const { rev, reload } = useReload();
  const mobile = useIsMobile();
  const [f, setF] = useState({ status: "ABERTOS", canal: "", setorId: "", sla: "", q: "", minha: "" });
  const [sel, setSel] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | "novo" | "simular">(null);
  const { toast, node } = useToast();
  const q = Object.entries({ pageSize: 50, status: f.status, canal: f.canal, setorId: f.setorId, sla: f.sla, q: f.q, minha: f.minha }).filter(([, v]) => v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  const l = useApi<any>(`${A}/atendimentos?${q}`, [rev]);
  const setores = useApi<any>(`${A}/setores`);
  const rows = itemsOf(l.data);
  const lista = (
    <Section title="Caixa única" actions={<><Button variant="outlined" size="small" onClick={() => setDlg("simular")}>Simular entrada de canal</Button><Button variant="contained" size="small" onClick={() => setDlg("novo")}>Novo atendimento</Button></>}>
      {node}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <TextField size="small" label="Buscar" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} sx={{ flex: "1 1 140px", minWidth: 0 }} />
        <Pick label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} all="Todas" minWidth={140} options={[{ value: "ABERTOS", label: "Abertos" }, ...opts(["NOVO", "EM_FILA", "EM_ATENDIMENTO", "AGUARDANDO_SOLICITANTE", "RESOLVIDO", "FECHADO"], ROTULO_STATUS)]} />
        <Pick label="Canal" value={f.canal} onChange={(v) => setF({ ...f, canal: v })} all="Todos" minWidth={130} options={opts(CANAIS, ROTULO_CANAL)} />
        <Pick label="Setor" value={f.setorId} onChange={(v) => setF({ ...f, setorId: v })} all="Todos" minWidth={140} options={(setores.data ?? []).map((s: any) => ({ value: s.id, label: s.nome }))} />
        <Pick label="SLA" value={f.sla} onChange={(v) => setF({ ...f, sla: v })} all="Todos" minWidth={120} options={[{ value: "ESTOURADO", label: "Estourado" }, { value: "ATENCAO", label: "Atenção" }, { value: "OK", label: "No prazo" }]} />
        <FormControlLabel control={<Checkbox checked={f.minha === "1"} onChange={(e) => setF({ ...f, minha: e.target.checked ? "1" : "" })} />} label="Minha caixa" />
      </Box>
      <LoadBox loading={l.loading} error={l.error} empty={!rows.length} emptyText="Nenhum atendimento com estes filtros." onRetry={l.reload}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: mobile ? undefined : 640, overflowY: "auto" }}>
          {rows.map((a: any) => (
            <Paper key={a.id} variant="outlined" onClick={() => setSel(a.id)} sx={{ p: 1.3, borderRadius: 3, cursor: "pointer", borderColor: sel === a.id ? "primary.main" : undefined, bgcolor: sel === a.id ? "action.hover" : undefined }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 140, overflowWrap: "anywhere" }}>{a.solicitanteNome}</Typography>
                {a.naoLidas > 0 && <Chip size="small" color="primary" label={a.naoLidas} />}
                <SlaChip sla={a.sla} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{a.assunto}</Typography>
              <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mt: 0.6, alignItems: "center" }}>
                <CanalChip canal={a.canal} /><StatusChip s={a.status} /><PrioChip p={a.prioridade} />
                {a.iaAtendeu && <Chip size="small" icon={<AutoAwesomeIcon />} label="IA respondeu" />}
                <Typography variant="caption" color="text.secondary">{a.numero} · {a.setor ?? "sem setor"} · {a.atendente ?? "sem atendente"}</Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      </LoadBox>
    </Section>
  );
  const detalhe = sel ? <Detalhe id={sel} setores={setores.data ?? []} onChanged={reload} onBack={() => setSel(null)} mobile={mobile} /> : (!mobile && <Paper variant="outlined" sx={{ p: 4, borderRadius: 4, textAlign: "center" }}><Typography color="text.secondary">Selecione um atendimento para ver a conversa.</Typography></Paper>);
  return (
    <>
      {mobile ? (sel ? detalhe : lista) : <Box sx={{ display: "grid", gridTemplateColumns: "minmax(320px, 5fr) minmax(0, 7fr)", gap: 2, alignItems: "start" }}>{lista}{detalhe}</Box>}
      <FormDialog open={dlg === "novo"} title="Novo atendimento" fields={NOVO} initial={{ canal: "BALCAO" }} onClose={() => setDlg(null)} onSubmit={async (b) => { const r = await call("POST", `${A}/atendimentos`, b); reload(); setSel(r.id); toast({ type: "success", text: `Atendimento ${r.numero} aberto.` }); }} />
      <FormDialog open={dlg === "simular"} title="Simular entrada de um canal" fields={SIMULAR} initial={{ canal: "WHATSAPP" }} submitLabel="Enviar mensagem simulada"
        intro={<Alert severity="info" sx={{ mb: 2 }}>Canal SIMULADO: sem credenciais configuradas em Comunicação, nada sai da plataforma. Serve para demonstrar roteamento, resposta automática e escalonamento da IA.</Alert>}
        onClose={() => setDlg(null)} onSubmit={async (b) => { const r = await call("POST", `${A}/canais/simular-entrada`, b); reload(); setSel(r.atendimentoId); toast({ type: r.tipo === "IA" ? "success" : "info", text: r.tipo === "IA" ? "A IA respondeu automaticamente." : r.escalonado ? `Escalonado para atendimento humano. ${r.motivo ?? ""}` : "Mensagem registrada." }); }} />
    </>
  );
}

function Detalhe({ id, setores, onChanged, onBack, mobile }: { id: string; setores: any[]; onChanged: () => void; onBack: () => void; mobile: boolean }) {
  const { rev, reload } = useReload();
  const d = useApi<any>(`${A}/atendimentos/${id}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { reload(); onChanged(); });
  const [txt, setTxt] = useState("");
  const [nota, setNota] = useState(false);
  const [usouIa, setUsouIa] = useState(false);
  const [dlg, setDlg] = useState<null | "transferir" | "protocolo" | "resumo">(null);
  const [resumo, setResumo] = useState("");
  const a = d.data;
  const encerrado = a && ["RESOLVIDO", "FECHADO"].includes(a.status);
  const enviar = async () => { if (!txt.trim()) return; const r = await run(() => call("POST", `${A}/atendimentos/${id}/mensagens`, { conteudo: txt, nota, usouSugestaoIa: usouIa }), nota ? "Nota interna salva." : "Resposta enviada."); if (r) { setTxt(""); setUsouIa(false); } };
  const sugerir = async () => { const r = await run(() => call("POST", `${A}/atendimentos/${id}/sugerir-resposta`), "Sugestão gerada."); if (r?.resposta) { setTxt(r.resposta); setUsouIa(true); setNota(false); } else if (r) toast({ type: "info", text: r.motivo || "A IA não encontrou uma resposta segura: responda manualmente." }); };
  return (
    <Section title={a ? `${a.numero} — ${a.solicitanteNome}` : "Atendimento"} actions={mobile ? <IconButton aria-label="Voltar à lista" onClick={onBack}><ArrowBackIcon /></IconButton> : undefined}>
      {node}
      <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
        {a && <>
          <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap", mb: 1.5, alignItems: "center" }}>
            <CanalChip canal={a.canal} /><StatusChip s={a.status} /><PrioChip p={a.prioridade} /><SlaChip sla={a.sla} />
            {a.categoria && <Chip size="small" variant="outlined" label={a.categoria} />}
            <Typography variant="caption" color="text.secondary">Setor: {a.setor?.nome ?? "—"} · Atendente: {a.atendente ?? "—"}{a.aluno ? ` · Aluno: ${a.aluno.nomeCompleto} (RA ${a.aluno.ra})` : ""}</Typography>
          </Box>
          {a.protocolo && <Alert severity="info" sx={{ mb: 1.5 }}>Protocolo {a.protocolo.numero} ({a.protocolo.status}) · código de rastreio {a.protocolo.codigoRastreio}</Alert>}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Button size="small" variant="outlined" onClick={() => run(() => call("POST", `${A}/atendimentos/${id}/assumir`), "Atendimento assumido.")} disabled={encerrado}>Assumir</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("transferir")} disabled={encerrado}>Transferir</Button>
            <Button size="small" variant="outlined" onClick={() => setDlg("protocolo")} disabled={!!a.protocolo}>Abrir protocolo</Button>
            <Button size="small" variant="outlined" onClick={async () => { const r = await run(() => call("POST", `${A}/atendimentos/${id}/resumir`), "Resumo gerado."); if (r) { setResumo(r.resumo); setDlg("resumo"); } }}>Resumir</Button>
            <Button size="small" variant="outlined" onClick={() => run(() => call("POST", `${A}/atendimentos/${id}/classificar?aplicar=1`), "Demanda classificada e roteada.")} disabled={encerrado}>Classificar (IA)</Button>
            {encerrado ? <Button size="small" onClick={() => run(() => call("POST", `${A}/atendimentos/${id}/reabrir`), "Reaberto.")}>Reabrir</Button>
              : <Button size="small" color="success" variant="contained" onClick={() => run(() => call("POST", `${A}/atendimentos/${id}/resolver`, {}), "Atendimento resolvido.")}>Resolver</Button>}
          </Box>
          {a.csatNota && <Alert severity="success" sx={{ mb: 1.5 }}>Avaliação do atendimento: {"★".repeat(a.csatNota)}{"☆".repeat(5 - a.csatNota)} {a.csatComentario ? `— "${a.csatComentario}"` : ""}</Alert>}
          {a.resumoIa && <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 1.5 }}>{a.resumoIa}</Alert>}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 360, overflowY: "auto", p: 1, bgcolor: "action.hover", borderRadius: 3, mb: 1.5 }}>
            {a.mensagens.map((m: any) => {
              const sai = m.direcao === "SAIDA", n = m.direcao === "NOTA_INTERNA";
              return (
                <Box key={m.id} sx={{ alignSelf: sai ? "flex-end" : "flex-start", maxWidth: "88%", p: 1, px: 1.4, borderRadius: 3, bgcolor: n ? "warning.light" : sai ? "primary.main" : "background.paper", color: sai && !n ? "primary.contrastText" : "text.primary", border: 1, borderColor: "divider" }}>
                  <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 700 }}>{n ? (m.sugeridaPorIa ? "Sugestão da IA (nota interna)" : "Nota interna") : m.autorTipo === "IA" ? "Assistente (IA)" : m.autorTipo === "SOLICITANTE" ? a.solicitanteNome : m.autor ?? "Atendente"} · {fmtDateTime(m.createdAt)}{m.status === "ENVIADA_SIMULADA" ? " · envio simulado" : ""}</Typography>
                  <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.conteudo}</Typography>
                </Box>
              );
            })}
          </Box>
          {a.transferencias.length > 0 && <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>Transferências: {a.transferencias.map((t: any) => `${fmtDateTime(t.createdAt)} — ${t.motivo}`).join(" | ")}</Typography>}
          {!encerrado && <>
            <TextField multiline minRows={2} fullWidth size="small" label={nota ? "Nota interna (não visível ao solicitante)" : "Resposta ao solicitante"} value={txt} onChange={(e) => setTxt(e.target.value)} />
            <Box sx={{ display: "flex", gap: 1, mt: 1, alignItems: "center", flexWrap: "wrap" }}>
              <FormControlLabel control={<Checkbox checked={nota} onChange={(e) => setNota(e.target.checked)} />} label="Nota interna" />
              <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={sugerir}>Sugerir resposta (IA)</Button>
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" onClick={enviar} disabled={!txt.trim()}>{nota ? "Salvar nota" : "Enviar"}</Button>
            </Box>
          </>}
        </>}
      </LoadBox>
      <FormDialog open={dlg === "transferir"} title="Transferir atendimento" onClose={() => setDlg(null)} submitLabel="Transferir"
        fields={[{ key: "setorId", label: "Setor de destino", type: "select", options: setores.map((s) => ({ value: s.id, label: s.nome })) }, { key: "motivo", label: "Motivo da transferência", type: "textarea", required: true }]}
        onSubmit={async (b) => { await call("POST", `${A}/atendimentos/${id}/transferir`, b); reload(); onChanged(); toast({ type: "success", text: "Atendimento transferido." }); }} />
      <ProtocoloDlg open={dlg === "protocolo"} a={a} onClose={() => setDlg(null)} done={() => { reload(); onChanged(); }} toast={toast} />
      <Dialog open={dlg === "resumo"} onClose={() => setDlg(null)} fullWidth maxWidth="sm"><DialogTitle>Resumo da conversa</DialogTitle><DialogContent dividers><Typography>{resumo}</Typography></DialogContent><DialogActions><Button onClick={() => setDlg(null)}>Fechar</Button></DialogActions></Dialog>
    </Section>
  );
}

function ProtocoloDlg({ open, a, onClose, done, toast }: { open: boolean; a: any; onClose: () => void; done: () => void; toast: (m: any) => void }) {
  const sv = useApi<any>(open ? `${A}/servicos` : null);
  const [serv, setServ] = useState("");
  if (!open || !a) return null;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Abrir protocolo</DialogTitle>
      <DialogContent dividers>
        <Pick label="Serviço" value={serv} onChange={setServ} minWidth={280} options={(sv.data ?? []).filter((s: any) => s.ativo).map((s: any) => ({ value: s.id, label: s.nome }))} />
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>O protocolo nasce com a jornada do serviço e o código de rastreio para o solicitante.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={!serv} onClick={async () => { try { const p = await call("POST", `${A}/protocolos`, { servicoId: serv, studentId: a.studentId || undefined, solicitanteNome: a.studentId ? undefined : a.solicitanteNome, atendimentoId: a.id }); toast({ type: "success", text: `Protocolo ${p.numero} aberto. Código de rastreio: ${p.codigoRastreio}` }); done(); onClose(); } catch (e: any) { toast({ type: "error", text: e.message }); } }}>Abrir</Button>
      </DialogActions>
    </Dialog>
  );
}
