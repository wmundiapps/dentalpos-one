import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useEffect, useRef, useState } from "react";
import { AS, Estado, dataHora, host, useApi, useRun, useToast } from "../comum2/kit";

/** Avisos FIXOS: aparecem na tela do chat o tempo todo, independente da resposta. */
export function AvisosFixos({ aviso, lgpd }: { aviso?: string; lgpd?: string }) {
  return (
    <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 3 }} role="note">
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{aviso || "Sou um assistente automatizado, não sou contador e esta resposta não substitui orientação profissional; valide com seu contador antes de decidir ou enviar qualquer coisa."}</Typography>
      <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>{lgpd || "Seus dados são tratados conforme a LGPD: não envie dados pessoais desnecessários. As conversas são registradas por tempo limitado e auditadas."}</Typography>
    </Alert>
  );
}

function Mensagem({ m, rev, onRevisar }: { m: any; rev?: any; onRevisar: (m: any) => void }) {
  const meu = m.papel === "USUARIO";
  return (
    <Box sx={{ display: "flex", justifyContent: meu ? "flex-end" : "flex-start", mb: 1.5 }}>
      <Paper elevation={0} sx={{ maxWidth: { xs: "94%", md: "78%" }, p: 1.5, borderRadius: 3, bgcolor: meu ? "primary.main" : m.sensivel ? "warning.light" : "action.hover", color: meu ? "primary.contrastText" : "text.primary" }}>
        {!meu ? <Typography variant="caption" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 0.5 }}><SmartToyOutlinedIcon fontSize="inherit" /> Assistente Contábil {m.provedor === "LLM_EXTERNO" ? "(modelo externo)" : ""}</Typography> : null}
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.conteudo}</Typography>
        {!meu && m.fontes?.length ? <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>{m.fontes.map((f: any) => <Chip key={f.slug} size="small" variant="outlined" label={`Fonte: ${f.titulo}`} />)}</Box> : null}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>{dataHora(m.createdAt)}</Typography>
          {!meu ? (rev ? <Chip size="small" label={`Revisão: ${rev.status === "PENDENTE" ? "aguardando o contador" : rev.status === "APROVADO" ? "aprovada" : "ajustar"}`} color={rev.status === "APROVADO" ? "success" : rev.status === "AJUSTAR" ? "error" : "warning"} /> : <Button size="small" variant="outlined" onClick={() => onRevisar(m)}>Solicitar revisão do contador</Button>) : null}
        </Box>
        {rev?.parecer ? <Alert severity={rev.status === "APROVADO" ? "success" : "warning"} sx={{ mt: 1 }}><b>Parecer do contador:</b> {rev.parecer}</Alert> : null}
      </Paper>
    </Box>
  );
}

export default function Chat() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const meta = useApi<any>(`${AS}/meta`);
  const emp = useApi<any>(`/contabil/societario/empresas-ref`);
  const lista = useApi<any>(`${AS}/conversas?pageSize=50`);
  const [sel, setSel] = useState<string | null>(null);
  const conv = useApi<any>(sel ? `${AS}/conversas/${sel}` : null);
  const { toast, node } = useToast();
  const run = useRun(toast);
  const [texto, setTexto] = useState(""); const [enviando, setEnviando] = useState(false);
  const [nova, setNova] = useState(false); const [empresaNova, setEmpresaNova] = useState("");
  const [rev, setRev] = useState<any | null>(null); const [obs, setObs] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const m = meta.data;
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [conv.data?.mensagens?.length]);
  const revisoes: any[] = conv.data?.revisoes || [];
  const revDe = (mid: string) => revisoes.find((r) => r.mensagemId === mid);

  async function enviar(t?: string) {
    const q = (t ?? texto).trim();
    if (q.length < 2 || !sel) return;
    setEnviando(true);
    try { await host.post(`${AS}/conversas/${sel}/mensagens`, { texto: q }); setTexto(""); conv.reload(); lista.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setEnviando(false); }
  }
  async function criar() {
    const nome = (emp.data?.itens || []).find((x: any) => x.id === empresaNova)?.nome;
    try { const c: any = await host.post(`${AS}/conversas`, empresaNova ? { empresaId: empresaNova, empresaNome: nome } : {}); setNova(false); setEmpresaNova(""); lista.reload(); setSel(c.id); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const painelLista = (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, width: { xs: "100%", md: 280 }, flexShrink: 0, maxHeight: { md: 640 }, overflowY: "auto" }}>
      <Button fullWidth variant="contained" onClick={() => setNova(true)} sx={{ mb: 1 }}>Nova conversa</Button>
      <Estado loading={lista.loading && !lista.data} error={lista.error} onRetry={lista.reload} vazio={!lista.data?.items?.length} textoVazio="Nenhuma conversa ainda.">
        {(lista.data?.items || []).map((c: any) => (
          <Box key={c.id} onClick={() => setSel(c.id)} sx={{ p: 1, borderRadius: 2, cursor: "pointer", bgcolor: c.id === sel ? "action.selected" : undefined, "&:hover": { bgcolor: "action.hover" }, display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{c.titulo}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{c.empresaNome || "Sem empresa"} · {dataHora(c.updatedAt)}</Typography></Box>
            <IconButton size="small" aria-label="Apagar conversa" onClick={(e) => { e.stopPropagation(); run(async () => { await host.del(`${AS}/conversas/${c.id}`); if (sel === c.id) setSel(null); lista.reload(); }, "Conversa apagada.", "Apagar esta conversa?"); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Box>
        ))}
      </Estado>
    </Paper>
  );
  return (
    <Box>
      {node}
      <AvisosFixos aviso={m?.avisoAssistente} lgpd={m?.avisoLgpd} />
      {m && !m.llm.ativoNoTenant ? <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>Respostas geradas pela base de conhecimento local (sem serviço externo). Pedidos de sonegação ou fraude são recusados.</Typography> : null}
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" }, alignItems: "stretch" }}>
        {(!mobile || !sel) ? painelLista : null}
        {(!mobile || sel) ? (
          <Paper variant="outlined" sx={{ flex: 1, borderRadius: 3, display: "flex", flexDirection: "column", minHeight: 460, minWidth: 0 }}>
            {!sel ? (
              <Box sx={{ p: 3, textAlign: "center" }}>
                <SmartToyOutlinedIcon sx={{ fontSize: 48, color: "text.secondary" }} />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Assistente Contábil</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>Tire dúvidas sobre regimes, guias, prazos, abertura de empresa, folha, rescisão, MEI e imposto de renda. Escolha uma conversa ou comece uma nova.</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>{(m?.sugestoes || []).map((s: string) => <Chip key={s} label={s} variant="outlined" onClick={() => setNova(true)} />)}</Box>
              </Box>
            ) : (
              <>
                <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
                  {mobile ? <Button size="small" onClick={() => setSel(null)}>Voltar</Button> : null}
                  <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 0 }} noWrap>{conv.data?.titulo || "Conversa"}</Typography>
                  {conv.data?.empresaNome ? <Chip size="small" label={`Empresa: ${conv.data.empresaNome}`} /> : <Chip size="small" variant="outlined" label="Sem empresa selecionada" />}
                </Box>
                <Box sx={{ p: 1.5, flex: 1, overflowY: "auto", maxHeight: { md: 520 } }}>
                  <Estado loading={conv.loading && !conv.data} error={conv.error} onRetry={conv.reload} vazio={!conv.data?.mensagens?.length} textoVazio="Faça sua primeira pergunta abaixo.">
                    {(conv.data?.mensagens || []).map((x: any) => <Mensagem key={x.id} m={x} rev={revDe(x.id)} onRevisar={(mm) => { setRev(mm); setObs(""); }} />)}
                    <div ref={fim} />
                  </Estado>
                </Box>
                <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>{(m?.sugestoes || []).slice(0, 3).map((s: string) => <Chip key={s} size="small" variant="outlined" label={s} onClick={() => enviar(s)} />)}</Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField fullWidth size="small" multiline maxRows={4} placeholder="Escreva sua dúvida (não inclua CPF, senhas ou dados de saúde)" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} slotProps={{ htmlInput: { maxLength: 2000, "aria-label": "Pergunta ao assistente" } }} />
                    <Button variant="contained" onClick={() => enviar()} disabled={enviando || texto.trim().length < 2} startIcon={<SendIcon />}>{enviando ? "..." : "Enviar"}</Button>
                  </Box>
                </Box>
              </>
            )}
          </Paper>
        ) : null}
      </Box>
      <Dialog open={nova} onClose={() => setNova(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nova conversa</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>Selecione a empresa para que o assistente use os dados dela (alvarás, folha, obrigações). Só os dados desta empresa são consultados.</Typography>
          <TextField fullWidth size="small" select label="Empresa do cliente (opcional)" value={empresaNova} onChange={(e) => setEmpresaNova(e.target.value)}><MenuItem value="">Sem empresa</MenuItem>{(emp.data?.itens || []).map((x: any) => <MenuItem key={x.id} value={x.id}>{x.nome || x.id}</MenuItem>)}</TextField>
        </DialogContent>
        <DialogActions><Button onClick={() => setNova(false)}>Cancelar</Button><Button variant="contained" onClick={criar}>Iniciar</Button></DialogActions>
      </Dialog>
      <Dialog open={!!rev} onClose={() => setRev(null)} fullWidth maxWidth="sm">
        <DialogTitle>Solicitar revisão do contador</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>A resposta selecionada entra na fila do contador (status pendente). O parecer final é sempre humano: aprovado ou ajustar.</Typography>
          <TextField fullWidth multiline minRows={3} size="small" label="Observação para o contador (opcional, sem dados pessoais)" value={obs} onChange={(e) => setObs(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setRev(null)}>Cancelar</Button><Button variant="contained" onClick={async () => { const ok = await run(() => host.post(`${AS}/conversas/${sel}/solicitar-revisao`, { mensagemId: rev.id, observacao: obs || undefined }), "Solicitação enviada ao contador."); if (ok) { setRev(null); conv.reload(); } }}>Enviar solicitação</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
