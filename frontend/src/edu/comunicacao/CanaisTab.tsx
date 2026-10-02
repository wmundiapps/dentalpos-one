import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Pagination, Paper, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { BASE, ROTULO_CANAL, Section, StateBox, StatusPill, asList, fmtDateTime, useLoad, type Toast } from "./common";

const SECRETOS = /(token|secret|senha|password|key|sid)/i;

function CanalDialog({ open, onClose, toast, onDone }: { open: boolean; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const prov = useLoad<any[]>(open ? `${BASE}/canais/provedores` : null);
  const [tipo, setTipo] = useState("");
  const [provedor, setProvedor] = useState("");
  const [nome, setNome] = useState("");
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const opcoes = (prov.data || []).find((p) => p.tipo === tipo)?.provedores || [];
  const campos: string[] = opcoes.find((p: any) => p.provedor === provedor)?.campos || [];
  useEffect(() => { setProvedor(""); setCfg({}); }, [tipo]);

  async function salvar() {
    try {
      await eduApi.post(`${BASE}/canais`, { tipo, provedor, nome, config: cfg });
      toast({ type: "success", text: "Canal criado. Use “Testar” para validar as credenciais." });
      setTipo(""); setNome(""); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo canal</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Alert severity="info">As credenciais são guardadas cifradas e nunca são exibidas novamente. Somente administradores podem cadastrar canais.</Alert>
        <StateBox loading={prov.loading} error={prov.error}>
          <TextField select size="small" label="Tipo de canal" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {(prov.data || []).map((p) => <MenuItem key={p.tipo} value={p.tipo}>{ROTULO_CANAL[p.tipo] || p.tipo}</MenuItem>)}
          </TextField>
          {tipo ? (
            <TextField select size="small" label="Provedor" value={provedor} onChange={(e) => { setProvedor(e.target.value); setCfg({}); }}>
              {opcoes.map((p: any) => <MenuItem key={p.provedor} value={p.provedor}>{p.provedor}</MenuItem>)}
            </TextField>
          ) : null}
          <TextField size="small" label="Nome do canal" value={nome} onChange={(e) => setNome(e.target.value)} helperText="Ex.: WhatsApp da Secretaria" />
          {campos.map((c) => (
            <TextField key={c} size="small" label={c} type={SECRETOS.test(c) ? "password" : "text"} value={cfg[c] || ""} onChange={(e) => setCfg({ ...cfg, [c]: e.target.value })} autoComplete="off" />
          ))}
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!tipo || !provedor || nome.length < 2} onClick={salvar}>Criar canal</Button></DialogActions>
    </Dialog>
  );
}

function WebhookDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const info = useLoad<any>(id ? `${BASE}/canais/${id}/webhook-info` : null);
  const d = info.data;
  return (
    <Dialog open={!!id} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Webhooks do canal</DialogTitle>
      <DialogContent dividers>
        <StateBox loading={info.loading} error={info.error} onRetry={info.reload}>
          {d ? (
            <Box sx={{ display: "grid", gap: 1 }}>
              {[["URL de mensagens", d.urlMensagens], ["URL de status", d.urlStatus], ["URL da URA de voz", d.urlUraVoz], ["Token de verificação (Meta)", d.verifyToken], ["URL do chat do site", d.urlSiteChat], ["Chave do chat do site", d.chaveSiteChat]]
                .filter(([, v]) => v).map(([k, v]) => (
                  <Box key={k as string}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{v}</Typography></Box>
                ))}
              <Alert severity="info" sx={{ mt: 1 }}>{d.observacao}</Alert>
            </Box>
          ) : null}
        </StateBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function Canais({ toast }: { toast: (t: Toast) => void }) {
  const canais = useLoad<any>(`${BASE}/canais`);
  const revah = useLoad<any>(`${BASE}/revah/status`);
  const [novo, setNovo] = useState(false);
  const [hook, setHook] = useState<string | null>(null);
  const rows = asList(canais.data);

  async function act(fn: () => Promise<any>, ok: (r: any) => { type: "success" | "error"; text: string }) {
    try { const r = await fn(); toast(ok(r)); canais.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <>
      <Section title="Canais de comunicação" description="WhatsApp, Telegram, e-mail, SMS, voz, redes e chat do site. Canal sem credencial não envia nada."
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo canal</Button>}>
        <StateBox loading={canais.loading} error={canais.error} onRetry={canais.reload} empty={!rows.length} emptyText="Nenhum canal cadastrado. Cadastre o primeiro para começar a enviar e receber mensagens.">
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {rows.map((c) => (
              <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 800, flex: 1 }}>{c.nome}</Typography>
                  <Chip size="small" label={ROTULO_CANAL[c.tipo] || c.tipo} />
                  <Chip size="small" variant="outlined" label={c.provedor} />
                </Box>
                <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                  <Chip size="small" color={c.ativo ? "success" : "default"} label={c.ativo ? "Ativo" : "Desativado"} />
                  <Chip size="small" color={c.configurado ? "success" : "warning"} label={c.configurado ? "Credenciais OK" : "Sem credenciais"} />
                  {c.ultimoTesteOk != null ? <Chip size="small" color={c.ultimoTesteOk ? "success" : "error"} label={c.ultimoTesteOk ? "Teste OK" : "Teste falhou"} /> : null}
                  {c.delegarRevah ? <Chip size="small" label="Delegado ao REVAH" /> : null}
                </Box>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                  Limites: {c.limiteHora}/hora · {c.limiteDia}/dia{c.restringirHorario ? " · só em horário comercial" : ""}
                  {c.ultimoTesteMsg ? ` · ${c.ultimoTesteMsg}` : ""}
                </Typography>
                {!c.configurado && c.camposObrigatorios?.length ? <Typography variant="caption" color="warning.main" component="div">Faltam: {c.camposObrigatorios.filter((x: string) => !(c.camposConfigurados || []).includes(x)).join(", ")}</Typography> : null}
                <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
                  <Button size="small" onClick={() => act(() => eduApi.post(`${BASE}/canais/${c.id}/testar`), (r) => ({ type: r.ok ? "success" : "error", text: r.mensagem || (r.ok ? "Conexão OK." : "Falha no teste.") }))}>Testar</Button>
                  <Button size="small" onClick={() => act(() => eduApi.patch(`${BASE}/canais/${c.id}`, { ativo: !c.ativo }), () => ({ type: "success", text: c.ativo ? "Canal desativado." : "Canal ativado." }))}>{c.ativo ? "Desativar" : "Ativar"}</Button>
                  <Button size="small" onClick={() => setHook(c.id)}>Webhooks</Button>
                  <Button size="small" color="error" onClick={() => { if (window.confirm(`Remover o canal “${c.nome}”? As conversas existentes perdem o vínculo.`)) act(() => eduApi.del(`${BASE}/canais/${c.id}`), () => ({ type: "success", text: "Canal removido." })); }}>Remover</Button>
                </Box>
              </Paper>
            ))}
          </Box>
        </StateBox>
        {revah.data ? <Alert severity={revah.data.revahConfigurado ? "success" : "info"} sx={{ mt: 2 }}>{revah.data.orientacao}</Alert> : null}
      </Section>
      <CanalDialog open={novo} onClose={() => setNovo(false)} toast={toast} onDone={canais.reload} />
      <WebhookDialog id={hook} onClose={() => setHook(null)} />
    </>
  );
}

function Outbox({ toast }: { toast: (t: Toast) => void }) {
  const [status, setStatus] = useState("");
  const [canal, setCanal] = useState("");
  const [page, setPage] = useState(1);
  const list = useLoad<any>(`${BASE}/outbox${qsOf({ status, canal, page, pageSize: 20 })}`);
  const rows = asList(list.data);
  const total = list.data?.total ?? rows.length;
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState<any>({ canal: "WHATSAPP" });

  async function act(fn: () => Promise<any>, ok: string) {
    try { await fn(); toast({ type: "success", text: ok }); list.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Caixa de saída" description="Todas as mensagens enfileiradas pelos módulos, com o motivo de cada falha."
      actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <TextField select size="small" label="Situação" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">Todas</MenuItem>{["PENDENTE", "ENVIADA", "ENTREGUE", "LIDA", "FALHA", "CANCELADA"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Canal" value={canal} onChange={(e) => { setPage(1); setCanal(e.target.value); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">Todos</MenuItem>{["WHATSAPP", "EMAIL", "SMS", "TELEGRAM", "VOZ"].map((s) => <MenuItem key={s} value={s}>{ROTULO_CANAL[s]}</MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={() => setNovo(true)}>Enviar mensagem avulsa</Button>
      </Box>}>
      <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nenhuma mensagem encontrada.">
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead><TableRow>{["Quando", "Canal", "Destino", "Mensagem", "Situação", ""].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {rows.map((n) => (
                <TableRow key={n.id} hover>
                  <TableCell>{fmtDateTime(n.createdAt)}</TableCell><TableCell>{ROTULO_CANAL[n.canal] || n.canal}</TableCell><TableCell>{n.destino || "—"}</TableCell>
                  <TableCell sx={{ maxWidth: 360 }}><Typography variant="body2" noWrap title={n.mensagem}>{n.assunto ? `${n.assunto} — ` : ""}{n.mensagem}</Typography>
                    {n.erro ? <Typography variant="caption" color="error">{n.erro}</Typography> : null}</TableCell>
                  <TableCell><StatusPill value={n.status} />{n.tentativas ? <Typography variant="caption" component="div" color="text.secondary">{n.tentativas} tentativa(s)</Typography> : null}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {["FALHA", "CANCELADA"].includes(n.status) ? <Button size="small" onClick={() => act(() => eduApi.post(`${BASE}/outbox/${n.id}/reenviar`), "Mensagem reenfileirada.")}>Reenviar</Button> : null}
                    {n.status === "PENDENTE" ? <Button size="small" color="error" onClick={() => { if (window.confirm("Cancelar o envio desta mensagem?")) act(() => eduApi.post(`${BASE}/outbox/${n.id}/cancelar`), "Envio cancelado."); }}>Cancelar</Button> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {total > 20 ? <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}><Pagination count={Math.ceil(total / 20)} page={page} onChange={(_, v) => setPage(v)} /></Box> : null}
      </StateBox>
      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="sm">
        <DialogTitle>Enviar mensagem avulsa</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select size="small" label="Canal" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
            {["WHATSAPP", "EMAIL", "SMS", "TELEGRAM", "VOZ"].map((s) => <MenuItem key={s} value={s}>{ROTULO_CANAL[s]}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Destino (telefone, e-mail ou chat)" value={f.destino || ""} onChange={(e) => setF({ ...f, destino: e.target.value })} />
          <TextField size="small" label="Assunto (e-mail)" value={f.assunto || ""} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
          <TextField size="small" label="Mensagem" multiline minRows={3} value={f.mensagem || ""} onChange={(e) => setF({ ...f, mensagem: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={!!f.enviarAgora} onChange={(e) => setF({ ...f, enviarAgora: e.target.checked })} />} label="Enviar imediatamente" />
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!f.destino || !f.mensagem} onClick={() => act(async () => { await eduApi.post(`${BASE}/outbox`, { canal: f.canal, destino: f.destino, assunto: f.assunto || undefined, mensagem: f.mensagem, enviarAgora: !!f.enviarAgora }); setNovo(false); setF({ canal: "WHATSAPP" }); }, "Mensagem enfileirada.")}>Enviar</Button>
        </DialogActions>
      </Dialog>
    </Section>
  );
}

const CFG_CAMPOS: Array<[string, string, "text" | "number" | "multiline"]> = [
  ["horarioInicio", "Início do horário comercial (HH:MM)", "text"], ["horarioFim", "Fim do horário comercial (HH:MM)", "text"],
  ["maxTentativas", "Máximo de tentativas de envio", "number"], ["slaPrimeiraRespostaMin", "SLA de primeira resposta (min)", "number"], ["slaResolucaoMin", "SLA de resolução (min)", "number"],
  ["iaLimiteDiarioConversa", "Limite diário de respostas de IA por conversa", "number"],
  ["mensagemBoasVindas", "Mensagem de boas-vindas", "multiline"], ["mensagemHandoff", "Mensagem ao transferir para atendente", "multiline"], ["mensagemForaHorario", "Mensagem fora do horário", "multiline"],
];

function Config({ toast }: { toast: (t: Toast) => void }) {
  const cfg = useLoad<any>(`${BASE}/config`);
  const [f, setF] = useState<Record<string, any>>({});
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);
  const dias = [["Dom", 0], ["Seg", 1], ["Ter", 2], ["Qua", 3], ["Qui", 4], ["Sex", 5], ["Sáb", 6]] as const;

  async function salvar() {
    try {
      const body: Record<string, any> = {};
      CFG_CAMPOS.forEach(([k, , t]) => { if (f[k] !== undefined && f[k] !== "") body[k] = t === "number" ? Number(f[k]) : f[k]; });
      body.diasUteis = f.diasUteis; body.botAtivo = !!f.botAtivo; body.iaFallback = !!f.iaFallback;
      await eduApi.put(`${BASE}/config`, body);
      toast({ type: "success", text: "Configurações salvas." }); cfg.reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Regras gerais" description="Janela de envio, SLA do atendimento, chatbot e mensagens automáticas.">
      <StateBox loading={cfg.loading} error={cfg.error} onRetry={cfg.reload}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {CFG_CAMPOS.map(([k, l, t]) => (
            <TextField key={k} size="small" label={l} type={t === "number" ? "number" : "text"} multiline={t === "multiline"} minRows={t === "multiline" ? 2 : undefined}
              value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} sx={t === "multiline" ? { gridColumn: { md: "1 / -1" } } : undefined} />
          ))}
          <Box sx={{ gridColumn: { md: "1 / -1" } }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Dias de envio comercial</Typography>
            {dias.map(([l, n]) => (
              <FormControlLabel key={n} label={l} control={<Checkbox checked={(f.diasUteis || []).includes(n)} onChange={(e) => setF({ ...f, diasUteis: e.target.checked ? [...(f.diasUteis || []), n] : (f.diasUteis || []).filter((x: number) => x !== n) })} />} />
            ))}
          </Box>
          <FormControlLabel label="Chatbot ativo" control={<Checkbox checked={!!f.botAtivo} onChange={(e) => setF({ ...f, botAtivo: e.target.checked })} />} />
          <FormControlLabel label="Usar IA quando fluxo/FAQ não responder" control={<Checkbox checked={!!f.iaFallback} onChange={(e) => setF({ ...f, iaFallback: e.target.checked })} />} />
        </Box>
        <Button variant="contained" sx={{ mt: 2 }} onClick={salvar}>Salvar configurações</Button>
      </StateBox>
    </Section>
  );
}

export default function CanaisTab({ toast }: { toast: (t: Toast) => void }) {
  const [sub, setSub] = useState(0);
  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 2 }}><Tab label="Canais" /><Tab label="Caixa de saída" /><Tab label="Regras gerais" /></Tabs>
      {sub === 0 && <Canais toast={toast} />}
      {sub === 1 && <Outbox toast={toast} />}
      {sub === 2 && <Config toast={toast} />}
    </Box>
  );
}
