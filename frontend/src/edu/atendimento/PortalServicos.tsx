import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Paper, Rating, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { A, LoadBox, Section, StatusChip, abrirArquivo, call, fmtDate, fmtDateTime, itemsOf, lerArquivo, useApi, useReload, useRunner, useToast } from "./kit";

/** Serviços e atendimento do Portal do Aluno: assistente, catálogo de autoatendimento, meus pedidos (com rastreio) e meus documentos. */
export default function PortalServicos() {
  const { rev, reload } = useReload();
  const { toast, node } = useToast();
  const run = useRunner(toast, reload);
  const serv = useApi<any>(`${A}/portal/servicos`, [rev]);
  const prot = useApi<any>(`${A}/portal/protocolos`, [rev]);
  const docs = useApi<any>(`${A}/portal/documentos`, [rev]);
  const [sel, setSel] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [resp, setResp] = useState<any>(null);
  const [ask, setAsk] = useState<any>(null);
  const [fin, setFin] = useState("");

  async function perguntar() {
    const r = await run(() => call("POST", `${A}/portal/assistente`, { pergunta }), "Pronto.");
    if (r) setResp(r);
  }
  async function solicitar(s: any) {
    if (s.taxa > 0 && !window.confirm(`Este serviço tem taxa de R$ ${Number(s.taxa).toFixed(2).replace(".", ",")}. Uma cobrança será lançada no seu financeiro. Continuar?`)) return;
    const r = await run(() => call("POST", `${A}/portal/solicitar`, { servicoId: s.id, finalidade: fin || undefined }), "Solicitação registrada.");
    if (!r) return;
    setAsk(r);
    if (r.documentoEmitidoId) void abrirArquivo(`${A}/portal/documentos/${r.documentoEmitidoId}/pdf`, "documento.pdf").catch(() => undefined);
  }
  return (
    <Box>
      {node}
      <Section title="Assistente de atendimento" actions={<Button size="small" variant="outlined" onClick={() => setChat(true)}>Falar com um atendente</Button>}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" label="Pergunte algo (ex.: como pegar a 2ª via do boleto?)" value={pergunta} onChange={(e) => setPergunta(e.target.value)} sx={{ flex: "1 1 280px" }} onKeyDown={(e) => { if (e.key === "Enter" && pergunta.length >= 3) void perguntar(); }} />
          <Button variant="contained" disabled={pergunta.length < 3} onClick={perguntar}>Perguntar</Button>
        </Box>
        {resp && <Alert sx={{ mt: 1.5 }} severity={resp.escalonar ? "warning" : "success"}>{resp.escalonar ? (resp.sugestao ?? resp.motivo) : resp.resposta}{resp.servicoSugerido && <> Serviço relacionado: <b>{resp.servicoSugerido.nome}</b>.</>}</Alert>}
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>As respostas vêm da base de conhecimento da instituição. Dados pessoais não são enviados a provedores externos de IA.</Typography>
      </Section>
      <Section title="Solicitar um serviço">
        <TextField size="small" label="Finalidade (opcional, aparece em declarações)" value={fin} onChange={(e) => setFin(e.target.value)} sx={{ mb: 1.5, maxWidth: 420 }} fullWidth />
        <LoadBox loading={serv.loading} error={serv.error} empty={!itemsOf(serv.data).length} emptyText="Nenhum serviço disponível no momento." onRetry={serv.reload}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" } }}>
            {itemsOf(serv.data).map((s: any) => (
              <Paper key={s.id} variant="outlined" sx={{ p: 2, borderRadius: 3, display: "flex", flexDirection: "column", gap: 0.8 }}>
                <Typography sx={{ fontWeight: 800 }}>{s.nome}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{s.descricao}</Typography>
                <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap" }}>
                  {s.imediato ? <Chip size="small" color="success" label="Imediato" /> : <Chip size="small" label={`até ${s.prazoDias} dia(s) úteis`} />}
                  {s.taxa > 0 && <Chip size="small" color="warning" label={`Taxa R$ ${Number(s.taxa).toFixed(2).replace(".", ",")}`} />}
                  {s.documentos.length > 0 && <Chip size="small" variant="outlined" label={`${s.documentos.length} documento(s)`} />}
                </Box>
                <Button variant="contained" onClick={() => solicitar(s)}>Solicitar</Button>
              </Paper>
            ))}
          </Box>
        </LoadBox>
      </Section>
      <Section title="Meus pedidos e protocolos">
        <LoadBox loading={prot.loading} error={prot.error} empty={!itemsOf(prot.data).length} emptyText="Você ainda não fez solicitações." onRetry={prot.reload}>
          {itemsOf(prot.data).map((p: any) => (
            <Paper key={p.id} variant="outlined" onClick={() => setSel(p.id)} sx={{ p: 1.5, my: 1, borderRadius: 3, cursor: "pointer", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 180 }}><Typography sx={{ fontWeight: 800 }}>{p.servicoNome}</Typography><Typography variant="caption" color="text.secondary">Protocolo {p.numero} · aberto em {fmtDate(p.createdAt)} · código {p.codigoRastreio}</Typography></Box>
              <StatusChip s={p.status} />
            </Paper>
          ))}
        </LoadBox>
      </Section>
      <Section title="Meus documentos emitidos">
        <LoadBox loading={docs.loading} error={docs.error} empty={!itemsOf(docs.data).length} emptyText="Nenhum documento emitido." onRetry={docs.reload}>
          {itemsOf(docs.data).map((d: any) => (
            <Paper key={d.id} variant="outlined" sx={{ p: 1.5, my: 1, borderRadius: 3, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 180 }}><Typography sx={{ fontWeight: 800 }}>{d.titulo} {d.via > 1 ? `(${d.via}ª via)` : ""}</Typography><Typography variant="caption" color="text.secondary">{d.numero} · emitido em {fmtDate(d.emitidoEm)}{d.validoAte ? ` · válido até ${fmtDate(d.validoAte)}` : ""}</Typography></Box>
              <Chip size="small" color={d.status === "EMITIDO" ? "success" : "default"} label={d.status} />
              <Button size="small" variant="outlined" onClick={() => run(() => abrirArquivo(`${A}/portal/documentos/${d.id}/pdf`, `${d.numero}.pdf`), "PDF aberto.")}>Abrir PDF</Button>
            </Paper>
          ))}
        </LoadBox>
      </Section>
      {sel && <PedidoDialog id={sel} onClose={() => setSel(null)} onChanged={reload} />}
      {chat && <ChatDialog onClose={() => setChat(false)} />}
      <Dialog open={!!ask} onClose={() => setAsk(null)} fullWidth maxWidth="sm">
        <DialogTitle>{ask?.status === "CONCLUIDO" ? "Pedido concluído" : ask?.status === "INDEFERIDO" ? "Pedido não pôde ser atendido" : "Solicitação registrada"}</DialogTitle>
        <DialogContent dividers>
          {ask && <>
            <Typography>Protocolo <b>{ask.numero}</b> · código de rastreio <b>{ask.codigoRastreio}</b></Typography>
            {ask.status === "INDEFERIDO" && <Alert severity="warning" sx={{ mt: 1 }}>Motivo: {ask.automacao?.motivo ?? "regra do serviço"}.</Alert>}
            {ask.documentoEmitidoId && <Alert severity="success" sx={{ mt: 1 }}>Documento emitido. O PDF foi aberto em outra aba e fica em "Meus documentos emitidos".</Alert>}
            {ask.taxaStatus === "PENDENTE" && <Alert severity="warning" sx={{ mt: 1 }}>Taxa de R$ {Number(ask.taxaValor).toFixed(2).replace(".", ",")} lançada no seu financeiro. Após o pagamento, volte aqui e acompanhe o pedido.</Alert>}
            {ask.resultado?.cobrancas && <Box sx={{ mt: 1 }}>{ask.resultado.cobrancas.length ? ask.resultado.cobrancas.map((c: any) => <Typography key={c.id} variant="body2">• {c.descricao} — R$ {Number(c.valor).toFixed(2).replace(".", ",")} — vence {fmtDate(c.vencimento)}{c.emAtraso ? " (em atraso)" : ""}{c.codigoCobranca ? ` — código ${c.codigoCobranca}` : ""}</Typography>) : <Typography>Você não tem cobranças em aberto.</Typography>}</Box>}
          </>}
        </DialogContent>
        <DialogActions><Button onClick={() => { setAsk(null); }}>Fechar</Button>{ask && <Button variant="contained" onClick={() => { setSel(ask.id); setAsk(null); }}>Acompanhar</Button>}</DialogActions>
      </Dialog>
    </Box>
  );
}

function PedidoDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { rev, reload } = useReload();
  const d = useApi<any>(`${A}/portal/protocolos/${id}`, [rev]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => { reload(); onChanged(); });
  const p = d.data;
  async function enviar(doc: any, f: File) { try { const dataUrl = await lerArquivo(f); await run(() => call("POST", `${A}/portal/protocolos/${id}/documentos`, { docId: doc.id, arquivoNome: f.name, dataUrl }), "Documento enviado."); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{p ? `${p.servicoNome} — ${p.numero}` : "Pedido"}</DialogTitle>
      <DialogContent dividers>
        {node}
        <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
          {p && <>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}><StatusChip s={p.status} /><Typography variant="caption" color="text.secondary">Código de rastreio: <b>{p.codigoRastreio}</b> · previsão {fmtDate(p.prazoEm)}</Typography></Box>
            <LinearProgress variant="determinate" value={Math.round((p.etapas.filter((e: any) => e.status === "CONCLUIDA").length / Math.max(1, p.etapas.length)) * 100)} sx={{ height: 8, borderRadius: 4, mb: 1.5 }} />
            {p.etapas.map((e: any) => <Box key={e.codigo} sx={{ py: 0.5, pl: 1.5, borderLeft: 3, borderColor: e.status === "CONCLUIDA" ? "success.main" : e.status === "EM_ANDAMENTO" ? "primary.main" : "divider", mb: 0.5 }}><Typography sx={{ fontWeight: e.status === "EM_ANDAMENTO" ? 800 : 500 }}>{e.nome}{e.status === "CONCLUIDA" ? " ✓" : e.status === "EM_ANDAMENTO" ? " (em andamento)" : ""}</Typography>{e.mensagem && <Typography variant="caption" color="text.secondary">{e.mensagem}</Typography>}{e.concluidaEm && <Typography variant="caption" color="text.secondary" component="div">{fmtDateTime(e.concluidaEm)}</Typography>}</Box>)}
            {p.taxaStatus === "PENDENTE" && <Alert severity="warning" sx={{ my: 1 }} action={<Button color="inherit" size="small" onClick={() => run(() => call("POST", `${A}/portal/protocolos/${id}/sincronizar-taxa`), "Situação atualizada.")}>Já paguei</Button>}>Aguardando o pagamento da taxa de R$ {Number(p.taxaValor).toFixed(2).replace(".", ",")}.</Alert>}
            {p.pendencias.map((x: any) => <Alert key={x.id} severity={x.status === "VENCIDA" ? "error" : "warning"} sx={{ my: 1 }}>{x.descricao} — até {fmtDate(x.prazoEm)}</Alert>)}
            {p.documentos.length > 0 && <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Documentos</Typography>}
            {p.documentos.map((x: any) => (
              <Box key={x.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", py: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 160 }}>{x.titulo} {x.obrigatorio ? "" : "(opcional)"}{x.motivo && <Typography variant="caption" color="error" component="div">Rejeitado: {x.motivo}</Typography>}</Box>
                <StatusChip s={x.status} />
                {["ABERTO", "EM_ANDAMENTO", "PENDENTE_SOLICITANTE"].includes(p.status) && x.status !== "APROVADO" && <Button size="small" component="label">{x.status === "PENDENTE" ? "Enviar" : "Reenviar"}<input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviar(x, f); }} /></Button>}
              </Box>
            ))}
            {p.documentoEmitidoId && <Button sx={{ mt: 1 }} variant="contained" onClick={() => run(() => abrirArquivo(`${A}/portal/documentos/${p.documentoEmitidoId}/pdf`, "documento.pdf"), "PDF aberto.")}>Abrir documento (PDF)</Button>}
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>Notificações de andamento: {p.notificar ? "ativadas" : "desativadas"}. <Button size="small" onClick={() => run(() => call("POST", `${A}/portal/protocolos/${id}/notificacoes`, { receber: !p.notificar }), "Preferência salva.")}>{p.notificar ? "Parar de receber" : "Voltar a receber"}</Button></Typography>
          </>}
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function ChatDialog({ onClose }: { onClose: () => void }) {
  const { rev, reload } = useReload();
  const lista = useApi<any>(`${A}/portal/atendimentos`, [rev]);
  const [atd, setAtd] = useState<string | null>(null);
  const det = useApi<any>(atd ? `${A}/portal/atendimentos/${atd}` : null, [rev, atd]);
  const [txt, setTxt] = useState("");
  const { toast, node } = useToast();
  const abertos = itemsOf(lista.data);
  const atual = atd ?? abertos.find((a: any) => !["RESOLVIDO", "FECHADO"].includes(a.status))?.id ?? null;
  const d = atual && atual !== atd ? null : det.data;
  async function enviar() {
    try { const r = await call("POST", `${A}/portal/chat`, { texto: txt }); setTxt(""); setAtd(r.atendimentoId); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Atendimento pelo chat</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 280 }}>
        {node}
        {!atd && atual && <Button size="small" onClick={() => setAtd(atual)}>Continuar atendimento em aberto</Button>}
        {d?.mensagens?.map((m: any) => <Box key={m.id} sx={{ alignSelf: m.direcao === "SAIDA" ? "flex-end" : "flex-start", textAlign: m.direcao === "SAIDA" ? "left" : "right", my: 0.8 }}><Box sx={{ display: "inline-block", maxWidth: "88%", p: 1, px: 1.4, borderRadius: 3, bgcolor: m.direcao === "SAIDA" ? "action.hover" : "primary.main", color: m.direcao === "SAIDA" ? "text.primary" : "primary.contrastText", textAlign: "left" }}><Typography variant="caption" sx={{ fontWeight: 700 }}>{m.direcao === "SAIDA" ? (m.autorTipo === "IA" ? "Assistente" : "Atendente") : "Você"}</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{m.conteudo}</Typography></Box></Box>)}
        {!d?.mensagens && <Typography color="text.secondary">Escreva sua dúvida abaixo. O assistente responde o que souber; caso contrário, um atendente assume.</Typography>}
        {d && ["RESOLVIDO", "FECHADO"].includes(d.status) && !d.csatNota && <Box sx={{ mt: 2 }}><Typography>Como foi o atendimento?</Typography><Rating onChange={(_, v) => { if (v) void call("POST", `${A}/portal/atendimentos/${d.id}/avaliacao`, { nota: v }).then(() => { toast({ type: "success", text: "Obrigado pela avaliação!" }); reload(); }).catch((e) => toast({ type: "error", text: e.message })); }} /></Box>}
      </DialogContent>
      <DialogActions sx={{ gap: 1, flexWrap: "wrap" }}>
        <TextField size="small" fullWidth label="Sua mensagem" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && txt.trim()) void enviar(); }} />
        <Button onClick={onClose}>Fechar</Button><Button variant="contained" disabled={!txt.trim()} onClick={enviar}>Enviar</Button>
      </DialogActions>
    </Dialog>
  );
}
