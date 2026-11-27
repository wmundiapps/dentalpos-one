import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SendIcon from "@mui/icons-material/Send";
import { useRef, useState } from "react";
import { eduApi } from "../../services/EduApi";
import EduResourcePage, { StatusChip, type FieldDef } from "../EduResourcePage";
import { BASE, Section, StateBox, StatusPill, asList, useLoad, type Toast } from "./common";

const MODELO = {
  inicio: "raiz",
  nos: {
    raiz: {
      texto: "Olá! Como posso ajudar?",
      opcoes: [{ rotulo: "Segunda via do boleto", gatilhos: ["boleto"], acao: "BOLETO" }, { rotulo: "Falar com atendente", acao: "HANDOFF" }],
    },
  },
};

function FluxoDialog({ fluxo, open, onClose, toast, onDone }: { fluxo: any | null; open: boolean; onClose: () => void; toast: (t: Toast) => void; onDone: () => void }) {
  const [f, setF] = useState<any>({});
  const [json, setJson] = useState("");
  const [erros, setErros] = useState<string[] | null>(null);
  const [ref, setRef] = useState<any>(null);
  if (open && ref !== (fluxo ?? "novo")) {
    setRef(fluxo ?? "novo");
    setF(fluxo ? { nome: fluxo.nome, intencao: fluxo.intencao, gatilhos: (fluxo.gatilhos || []).join(", "), prioridade: fluxo.prioridade ?? 0, ativo: fluxo.ativo } : { prioridade: 0, ativo: true });
    setJson(JSON.stringify(fluxo?.definicao ?? MODELO, null, 2)); setErros(null);
  }
  if (!open && ref !== null) setRef(null);

  function parse() { try { return JSON.parse(json); } catch { setErros(["JSON inválido: confira vírgulas e aspas."]); return undefined; } }
  async function validar() {
    const d = parse(); if (d === undefined) return;
    try { const r = await eduApi.post(`${BASE}/bot/validar`, { definicao: d }); setErros(r.valido ? [] : r.erros); } catch (e: any) { setErros([e.message]); }
  }
  async function salvar() {
    const d = parse(); if (d === undefined) return;
    const body = { nome: f.nome, intencao: f.intencao, gatilhos: String(f.gatilhos || "").split(",").map((s) => s.trim()).filter(Boolean), definicao: d, prioridade: Number(f.prioridade) || 0, ativo: !!f.ativo };
    try {
      if (fluxo) await eduApi.put(`${BASE}/bot/fluxos/${fluxo.id}`, body); else await eduApi.post(`${BASE}/bot/fluxos`, body);
      toast({ type: "success", text: "Fluxo salvo." }); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{fluxo ? "Editar fluxo" : "Novo fluxo do chatbot"}</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <TextField size="small" label="Nome" value={f.nome || ""} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <TextField size="small" label="Intenção" value={f.intencao || ""} onChange={(e) => setF({ ...f, intencao: e.target.value })} helperText="Ex.: MENU_PRINCIPAL, SEGUNDA_VIA_BOLETO" />
          <TextField size="small" label="Palavras-gatilho" value={f.gatilhos || ""} onChange={(e) => setF({ ...f, gatilhos: e.target.value })} helperText="Separadas por vírgula" />
          <TextField size="small" type="number" label="Prioridade" value={f.prioridade ?? 0} onChange={(e) => setF({ ...f, prioridade: e.target.value })} />
        </Box>
        <FormControlLabel label="Fluxo ativo" control={<Checkbox checked={!!f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />} />
        <TextField multiline minRows={12} label="Definição (JSON: inicio + nos)" value={json} onChange={(e) => setJson(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 13 } } }}
          helperText="Cada nó tem texto e opções (rótulo, gatilhos, proximo ou acao: BOLETO, NOTAS, CALENDARIO, FAQ, HANDOFF, FIM)." />
        {erros ? (erros.length ? <Alert severity="error">{erros.map((e) => <div key={e}>{e}</div>)}</Alert> : <Alert severity="success">Fluxo válido.</Alert>) : null}
      </DialogContent>
      <DialogActions><Button onClick={validar}>Validar</Button><Box sx={{ flex: 1 }} /><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.nome || !f.intencao} onClick={salvar}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

function Fluxos({ toast }: { toast: (t: Toast) => void }) {
  const list = useLoad<any>(`${BASE}/bot/fluxos?pageSize=100`);
  const [edit, setEdit] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const rows = asList(list.data);
  async function remover(f: any) {
    if (!window.confirm(`Remover o fluxo “${f.nome}”?`)) return;
    try { await eduApi.del(`${BASE}/bot/fluxos/${f.id}`); toast({ type: "success", text: "Fluxo removido." }); list.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Fluxos do chatbot" description="Menus e roteiros de atendimento automático, acionados por palavras-gatilho."
      actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEdit(null); setOpen(true); }}>Novo fluxo</Button>}>
      <StateBox loading={list.loading} error={list.error} onRetry={list.reload} empty={!rows.length} emptyText="Nenhum fluxo. Use “Preparar dados padrão” no Painel para criar o menu inicial.">
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {rows.map((f) => (
            <Paper key={f.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800 }}>{f.nome} <Chip size="small" variant="outlined" label={f.intencao} /></Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>{(f.gatilhos || []).map((g: string) => <Chip key={g} size="small" label={g} />)}</Box>
              </Box>
              <Typography variant="caption" color="text.secondary">prioridade {f.prioridade}</Typography>
              <StatusPill value={f.ativo ? "ATIVO" : "INATIVO"} />
              <Button size="small" onClick={() => { setEdit(f); setOpen(true); }}>Editar</Button>
              <Button size="small" color="error" onClick={() => remover(f)}>Remover</Button>
            </Paper>
          ))}
        </Box>
      </StateBox>
      <FluxoDialog fluxo={edit} open={open} onClose={() => setOpen(false)} toast={toast} onDone={list.reload} />
    </Section>
  );
}

function Simulador() {
  const [msgs, setMsgs] = useState<Array<{ de: "eu" | "bot"; texto: string; nota?: string }>>([]);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  async function enviar() {
    const t = texto.trim(); if (!t) return;
    setTexto(""); setMsgs((m) => [...m, { de: "eu", texto: t }]); setBusy(true);
    try {
      const r = await eduApi.post(`${BASE}/bot/simular`, { texto: t, ...(estado ? { estado } : {}) });
      let resp = ""; let nota = r.origem === "FAQ" ? "Respondido pela FAQ" : r.origem === "FLUXO" ? `Fluxo: ${r.fluxo}` : "Sem fluxo/FAQ — iria para IA ou atendente";
      if (r.origem === "FAQ") resp = r.resposta;
      else if (r.origem === "FLUXO") {
        if (r.passo) { resp = r.passo.texto || r.passo.prefixo || (r.passo.tipo === "HANDOFF" ? "(transferiria para um atendente)" : r.passo.tipo === "NAO_ENTENDI" ? "Não entendi. Escolha uma das opções." : `(ação: ${r.passo.acao})`); setEstado(r.passo.estado?.no ? r.passo.estado : undefined); nota += ` · ${r.passo.tipo}`; }
        else { resp = typeof r.resposta === "string" ? r.resposta : r.resposta?.texto || JSON.stringify(r.resposta); setEstado(r.estado); }
      } else { resp = "—"; setEstado(undefined); }
      setMsgs((m) => [...m, { de: "bot", texto: resp, nota }]);
    } catch (e: any) { setMsgs((m) => [...m, { de: "bot", texto: `Erro: ${e.message}` }]); } finally { setBusy(false); setTimeout(() => fim.current?.scrollIntoView({ block: "end" }), 50); }
  }
  return (
    <Section title="Simulador" description="Teste o chatbot sem enviar nada nem criar conversa."
      actions={<Button size="small" onClick={() => { setMsgs([]); setEstado(undefined); }}>Reiniciar</Button>}>
      <Box sx={{ maxWidth: 560 }}>
        <Box sx={{ height: 320, overflowY: "auto", p: 1.5, bgcolor: "action.hover", borderRadius: 3, display: "flex", flexDirection: "column", gap: 1 }}>
          {!msgs.length ? <Typography color="text.secondary" sx={{ textAlign: "center", mt: 8 }}>Digite algo, como “boleto” ou “horário”.</Typography> : null}
          {msgs.map((m, i) => (
            <Box key={i} sx={{ alignSelf: m.de === "eu" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
              <Paper elevation={0} sx={{ p: 1, px: 1.5, borderRadius: 3, bgcolor: m.de === "eu" ? "primary.main" : "background.paper", color: m.de === "eu" ? "primary.contrastText" : "text.primary" }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.texto}</Typography>
              </Paper>
              {m.nota ? <Typography variant="caption" color="text.secondary">{m.nota}</Typography> : null}
            </Box>
          ))}
          <div ref={fim} />
        </Box>
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <TextField size="small" fullWidth placeholder="Mensagem do contato…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
          <Button variant="contained" endIcon={<SendIcon />} disabled={busy || !texto.trim()} onClick={enviar}>Enviar</Button>
        </Box>
      </Box>
    </Section>
  );
}

export default function BotTab({ toast }: { toast: (t: Toast) => void }) {
  const [sub, setSub] = useState(0);
  const faqFields: FieldDef[] = [
    { key: "categoria", label: "Categoria", type: "select", options: ["GERAL", "FINANCEIRO", "SECRETARIA", "ACADEMICO", "ADMISSOES"] },
    { key: "pergunta", label: "Pergunta", required: true },
    { key: "resposta", label: "Resposta", type: "textarea", required: true },
    { key: "palavrasChave", label: "Palavras-chave", type: "json-list", helper: "Separadas por vírgula" },
  ];
  return (
    <Box>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 2 }}><Tab label="Fluxos" /><Tab label="Perguntas frequentes (FAQ)" /><Tab label="Simulador" /></Tabs>
      {sub === 0 && <Fluxos toast={toast} />}
      {sub === 1 && (
        <EduResourcePage title="Perguntas frequentes" description="O bot responde pela FAQ quando nenhum fluxo casa com a mensagem." base={BASE} resource="/bot/faq" fields={faqFields}
          filters={[{ key: "categoria", label: "Categoria", options: ["GERAL", "FINANCEIRO", "SECRETARIA", "ACADEMICO", "ADMISSOES"] }]}
          columns={[
            { key: "categoria", label: "Categoria" }, { key: "pergunta", label: "Pergunta" },
            { key: "resposta", label: "Resposta", render: (r) => <Typography variant="body2" noWrap sx={{ maxWidth: 320 }} title={r.resposta}>{r.resposta}</Typography> },
            { key: "usos", label: "Usos" }, { key: "ativo", label: "Situação", render: (r) => <StatusChip value={r.ativo ? "ATIVO" : "INATIVO"} /> },
          ]} />
      )}
      {sub === 2 && <Simulador />}
    </Box>
  );
}
