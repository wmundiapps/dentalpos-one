import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useState } from "react";
import { FormDialog, Lista, LoadBox, M, ORIGENS, Section, Status, call, fmtDateTime, label, opts, useApi, useToast } from "./kit";

const TIPOS = ["HERO", "TEXTO", "CURSOS", "SIMULADOR", "FORM", "FAQ", "EVENTOS", "DEPOIMENTOS", "CTA", "CHAT", "NUMEROS"];
const ROT: Record<string, string> = { HERO: "Destaque", TEXTO: "Texto", CURSOS: "Vitrine de cursos com inscrição", SIMULADOR: "Simulador de mensalidade", FORM: "Formulário de captação", FAQ: "Perguntas frequentes", EVENTOS: "Eventos", DEPOIMENTOS: "Depoimentos", CTA: "Chamada final", CHAT: "Chat com IA", NUMEROS: "Números" };

function Editor({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<any>({ titulo: "", slug: "", tipo: "LANDING", seoTitulo: "", seoDescricao: "", noMenu: false, blocos: [{ tipo: "HERO", titulo: "", texto: "" }] });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forms = useApi<any>(`${M}/formularios`);
  useEffect(() => { if (id) call("GET", `${M}/paginas/${id}`).then((r: any) => setP(r)).catch((e) => setErr(e.message)); }, [id]);
  const set = (k: string, v: any) => setP((o: any) => ({ ...o, [k]: v }));
  const setB = (i: number, k: string, v: any) => set("blocos", p.blocos.map((b: any, j: number) => (j === i ? { ...b, [k]: v } : b)));
  const move = (i: number, d: number) => { const a = [...p.blocos]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set("blocos", a); };
  async function salvar(publicar = false) {
    setBusy(true); setErr(null);
    try {
      const body = { titulo: p.titulo, tipo: p.tipo, seoTitulo: p.seoTitulo || undefined, seoDescricao: p.seoDescricao || undefined, noMenu: !!p.noMenu, blocos: p.blocos.map((b: any) => ({ tipo: b.tipo, titulo: b.titulo || undefined, texto: b.texto || undefined, botaoRotulo: b.botaoRotulo || undefined, botaoUrl: b.botaoUrl || undefined, formularioSlug: b.formularioSlug || undefined, itens: b.itens })) };
      const r: any = id ? await call("PATCH", `${M}/paginas/${id}`, body) : await call("POST", `${M}/paginas`, { ...body, slug: p.slug || undefined });
      if (publicar) await call("POST", `${M}/paginas/${r.id}/publicar`);
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{id ? "Editar página" : "Nova página"}</DialogTitle>
      <DialogContent dividers>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 2 }}>
          <TextField size="small" label="Título" value={p.titulo} onChange={(e) => set("titulo", e.target.value)} required />
          <TextField size="small" label="Endereço (slug)" value={p.slug} disabled={!!id} onChange={(e) => set("slug", e.target.value)} helperText="Gerado do título se vazio" />
          <TextField size="small" select label="Tipo" value={p.tipo} onChange={(e) => set("tipo", e.target.value)}>{["HOME", "LANDING", "CURSO", "EVENTO", "FAQ"].map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <TextField size="small" select label="Aparece no menu" value={p.noMenu ? "1" : "0"} onChange={(e) => set("noMenu", e.target.value === "1")}><MenuItem value="0">Não</MenuItem><MenuItem value="1">Sim</MenuItem></TextField>
          <TextField size="small" label="Título SEO (até 70)" value={p.seoTitulo ?? ""} onChange={(e) => set("seoTitulo", e.target.value)} slotProps={{ htmlInput: { maxLength: 70 } }} />
          <TextField size="small" label="Descrição SEO (até 160)" value={p.seoDescricao ?? ""} onChange={(e) => set("seoDescricao", e.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Blocos</Typography>
        {p.blocos.map((b: any, i: number) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
              <TextField size="small" select label="Bloco" value={b.tipo} onChange={(e) => setB(i, "tipo", e.target.value)} sx={{ minWidth: 240 }}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{ROT[t]}</MenuItem>)}</TextField>
              <Box sx={{ flex: 1 }} />
              <IconButton aria-label="Subir" size="small" onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
              <IconButton aria-label="Descer" size="small" onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
              <IconButton aria-label="Remover bloco" size="small" color="error" onClick={() => set("blocos", p.blocos.filter((_: any, j: number) => j !== i))}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
            {["HERO", "TEXTO", "CTA", "CURSOS", "SIMULADOR", "FAQ", "EVENTOS", "FORM", "DEPOIMENTOS", "NUMEROS"].includes(b.tipo) && <TextField size="small" fullWidth label="Título" value={b.titulo ?? ""} onChange={(e) => setB(i, "titulo", e.target.value)} sx={{ mb: 1 }} />}
            {["HERO", "TEXTO", "CTA"].includes(b.tipo) && <TextField size="small" fullWidth multiline minRows={2} label="Texto" value={b.texto ?? ""} onChange={(e) => setB(i, "texto", e.target.value)} sx={{ mb: 1 }} />}
            {["HERO", "CTA", "TEXTO"].includes(b.tipo) && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}><TextField size="small" label="Rótulo do botão" value={b.botaoRotulo ?? ""} onChange={(e) => setB(i, "botaoRotulo", e.target.value)} /><TextField size="small" label="Link do botão (https, / ou #)" value={b.botaoUrl ?? ""} onChange={(e) => setB(i, "botaoUrl", e.target.value)} /></Box>}
            {b.tipo === "FORM" && <TextField size="small" select fullWidth label="Formulário" value={b.formularioSlug ?? ""} onChange={(e) => setB(i, "formularioSlug", e.target.value)}>{(forms.data?.items ?? []).filter((f: any) => f.ativo).map((f: any) => <MenuItem key={f.slug} value={f.slug}>{f.nome}</MenuItem>)}</TextField>}
            {["DEPOIMENTOS", "FAQ", "NUMEROS"].includes(b.tipo) && <TextField size="small" fullWidth multiline minRows={3} label={b.tipo === "FAQ" ? "Itens (pergunta | resposta por linha; vazio = FAQ da Comunicação)" : b.tipo === "NUMEROS" ? "Itens (valor | rótulo por linha)" : "Itens (autor | texto por linha)"} value={(b.itens ?? []).map((x: any) => b.tipo === "FAQ" ? `${x.pergunta} | ${x.resposta}` : b.tipo === "NUMEROS" ? `${x.valor} | ${x.rotulo}` : `${x.autor} | ${x.texto}`).join("\n")}
              onChange={(e) => setB(i, "itens", e.target.value.split("\n").filter(Boolean).map((l: string) => { const [a, ...r] = l.split("|"); const t = r.join("|").trim(); return b.tipo === "FAQ" ? { pergunta: a.trim(), resposta: t } : b.tipo === "NUMEROS" ? { valor: a.trim(), rotulo: t } : { autor: a.trim(), texto: t }; }))} />}
          </Paper>
        ))}
        <Button size="small" onClick={() => set("blocos", [...p.blocos, { tipo: "TEXTO", titulo: "", texto: "" }])}>+ Adicionar bloco</Button>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={() => salvar(false)}>Salvar rascunho</Button><Button variant="contained" disabled={busy} onClick={() => salvar(true)}>Salvar e publicar</Button></DialogActions>
    </Dialog>
  );
}

function Paginas() {
  const [rev, setRev] = useState(0);
  const [ed, setEd] = useState<{ id: string | null } | null>(null);
  const s = useApi<any>(`${M}/site`, [rev]);
  const { toast, node } = useToast();
  const [cfg, setCfg] = useState(false);
  const site = s.data?.site;
  return (
    <>
      {node}
      <Section title="Site institucional" actions={<><Button onClick={() => setCfg(true)}>{site ? "Configurar site" : "Criar site"}</Button>{site && <Button variant="contained" onClick={() => setEd({ id: null })}>Nova página</Button>}</>}>
        <LoadBox loading={s.loading} error={s.error} onRetry={s.reload}>
          {!site ? <Alert severity="info">Crie o site para definir o endereço público e começar a montar páginas de captação.</Alert> : (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>Endereço público: <a href={s.data.urlPublica} target="_blank" rel="noreferrer">{s.data.urlPublica}</a> · Chat com IA: {site.chatAtivo ? "ativo" : "desligado"}</Typography>
              {(s.data.paginas ?? []).map((p: any) => (
                <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 2, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}><b>{p.titulo}</b><Typography variant="caption" component="div" color="text.secondary">/{p.slug} · {label(p.tipo)} · {p.visitas} visitas · {p.conversoes} conversões</Typography></Box>
                  <Status value={p.status} />
                  <Button size="small" onClick={() => setEd({ id: p.id })}>Editar</Button>
                  {p.status === "PUBLICADA" ? <><Button size="small" component="a" href={`${s.data.urlPublica}/${p.slug}`} target="_blank" rel="noreferrer">Abrir</Button><Button size="small" onClick={() => call("POST", `${M}/paginas/${p.id}/despublicar`).then(() => setRev((x) => x + 1))}>Despublicar</Button></> : <Button size="small" onClick={() => call("POST", `${M}/paginas/${p.id}/publicar`).then(() => { setRev((x) => x + 1); toast({ type: "success", text: "Publicada." }); }).catch((e) => toast({ type: "error", text: e.message }))}>Publicar</Button>}
                </Paper>
              ))}
            </>
          )}
        </LoadBox>
      </Section>
      {ed && <Editor id={ed.id} onClose={() => setEd(null)} onSaved={() => { setRev((x) => x + 1); toast({ type: "success", text: "Página salva." }); }} />}
      <FormDialog open={cfg} title="Configuração do site" onClose={() => setCfg(false)} maxWidth="sm" initial={{ ...(site ?? {}), ativo: true, chatAtivo: true, ...(site ?? {}) }}
        fields={[{ key: "nome", label: "Nome", required: true }, { key: "slug", label: "Endereço (slug)", helper: "Ex.: ravel -> /site/ravel" }, { key: "descricao", label: "Descrição", full: true }, { key: "whatsapp", label: "WhatsApp" }, { key: "corPrimaria", label: "Cor primária (#RRGGBB)" }, { key: "rodape", label: "Rodapé", type: "textarea" }, { key: "ativo", label: "Site no ar", type: "bool" }, { key: "chatAtivo", label: "Chat com IA ativo", type: "bool" }]}
        onSubmit={async (b) => { await call("PUT", `${M}/site`, b); setRev((x) => x + 1); }} />
    </>
  );
}

const CAMPOS_PADRAO = [{ chave: "nome", rotulo: "Nome completo", tipo: "texto", obrigatorio: true }, { chave: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true }, { chave: "telefone", rotulo: "WhatsApp", tipo: "telefone", obrigatorio: false }, { chave: "curso", rotulo: "Curso de interesse", tipo: "curso", obrigatorio: false }];
function Formularios() {
  return <Lista title="Formulários" path="/formularios" newLabel="Novo formulário" embedded search={false} editable={false}
    intro={<Alert severity="info" sx={{ mb: 1.5 }}>Cada formulário traz o texto de consentimento (versionado). O envio registra a prova: texto, versão, data, origem e hash do IP. A divulgação (marketing) é um aceite separado e opcional.</Alert>}
    fields={[{ key: "nome", label: "Nome", required: true }, { key: "slug", label: "Endereço (slug)" }, { key: "origemPadrao", label: "Origem dos leads", type: "select", required: true, options: opts(ORIGENS) }, { key: "cursoNome", label: "Curso fixo (opcional)" }, { key: "descricao", label: "Descrição", full: true },
      { key: "textoConsentimento", label: "Texto de consentimento (LGPD)", type: "textarea", full: true }]}
    defaults={{ origemPadrao: "SITE", textoConsentimento: "Autorizo o tratamento dos meus dados pessoais para que a instituição entre em contato sobre cursos e processos seletivos, conforme a Política de Privacidade. Posso revogar a qualquer momento." }}
    toBody={(b) => ({ ...b, campos: CAMPOS_PADRAO })}
    columns={[{ label: "Formulário", primary: true, render: (r) => <><b>{r.nome}</b><Typography variant="caption" component="div" color="text.secondary">/{r.slug} · texto v{r.versaoTexto}</Typography></> }, { label: "Origem", render: (r) => label(r.origemPadrao) }, { label: "Envios", render: (r) => r.envios }, { label: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") }]} />;
}

function Atendimento() {
  const [det, setDet] = useState<any>(null);
  const [sim, setSim] = useState(false);
  const [rev, setRev] = useState(0);
  const [msg, setMsg] = useState("");
  const { toast, node } = useToast();
  const d = useApi<any>(det ? `${M}/atendimentos/${det.id}` : null, [rev, det?.id]);
  return (
    <>
      {node}
      <Lista title="Atendimento com IA" path="/atendimentos" embedded search={false} refreshKey={rev} onRowClick={(r) => setDet(r)}
        extraActions={<Button onClick={() => setSim(true)} sx={{ mr: 1 }}>Simular mensagem recebida</Button>}
        intro={<Alert severity="info" sx={{ mb: 1.5 }}>A assistente responde dúvidas sobre cursos, mensalidades, vestibular e eventos em cada canal (site, WhatsApp, Instagram, Facebook, Telegram...). Pedidos de atendente, reclamações e dúvidas sem resposta confiável são <b>escalonados</b> a um consultor. “SAIR/PARAR” descadastra em todos os canais.</Alert>}
        filters={[{ key: "status", label: "Situação", options: opts(["IA", "ESCALONADO", "ENCERRADO"]) }, { key: "canal", label: "Canal", options: opts(["SITE", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "TELEGRAM", "EMAIL", "LINKEDIN", "TIKTOK", "THREADS"]) }]}
        columns={[{ label: "Conversa", primary: true, render: (r) => <><b>{r.nome ?? r.sessao.slice(0, 18)}</b><Typography variant="caption" component="div" color="text.secondary">{r.canal} · {fmtDateTime(r.ultimaMensagemEm)}</Typography></> }, { label: "Situação", render: (r) => <Status value={r.status} /> }, { label: "Consultor", render: (r) => r.consultorNome ?? "—" }, { label: "Motivo", hideOnMobile: true, render: (r) => r.motivoEscalonamento ?? "—" }, { label: "1ª resposta", hideOnMobile: true, render: (r) => (r.primeiraRespostaMs == null ? "—" : `${r.primeiraRespostaMs} ms`) }]} />
      <Dialog open={!!det} onClose={() => setDet(null)} fullWidth maxWidth="sm">
        <DialogTitle>Conversa — {det?.canal}</DialogTitle>
        <DialogContent dividers>
          <LoadBox loading={d.loading} error={d.error} onRetry={d.reload}>
            {(d.data?.mensagens ?? []).map((m: any) => <Box key={m.id} sx={{ mb: 1, textAlign: m.autor === "VISITANTE" ? "left" : "right" }}><Chip size="small" label={m.autor === "IA" ? "Assistente IA" : m.autor === "CONSULTOR" ? "Consultor" : "Visitante"} sx={{ mb: 0.3 }} /><Paper variant="outlined" sx={{ p: 1, display: "inline-block", maxWidth: "90%", textAlign: "left" }}>{m.texto}</Paper></Box>)}
          </LoadBox>
          <Box sx={{ display: "flex", gap: 1, mt: 2 }}><TextField size="small" fullWidth label="Responder como consultor" value={msg} onChange={(e) => setMsg(e.target.value)} /><Button variant="contained" disabled={!msg} onClick={() => call("POST", `${M}/atendimentos/${det.id}/responder`, { texto: msg }).then(() => { setMsg(""); setRev((x) => x + 1); }).catch((e) => toast({ type: "error", text: e.message }))}>Enviar</Button></Box>
        </DialogContent>
        <DialogActions><Button onClick={() => call("POST", `${M}/atendimentos/${det.id}/assumir`).then(() => setRev((x) => x + 1))}>Assumir</Button><Button onClick={() => call("POST", `${M}/atendimentos/${det.id}/encerrar`).then(() => { setRev((x) => x + 1); setDet(null); })}>Encerrar</Button><Button onClick={() => setDet(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <FormDialog open={sim} title="Simular mensagem recebida" onClose={() => setSim(false)} maxWidth="sm" initial={{ canal: "WHATSAPP", remetente: "5511999990000", texto: "Quanto custa a mensalidade?" }}
        fields={[{ key: "canal", label: "Canal", type: "select", required: true, options: opts(["SITE", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "TELEGRAM", "EMAIL", "LINKEDIN", "TIKTOK", "THREADS", "SMS"]) }, { key: "remetente", label: "Remetente (telefone / usuário)", required: true }, { key: "texto", label: "Mensagem", required: true, type: "textarea", full: true }]}
        onSubmit={async (b) => { const r: any = await call("POST", `${M}/atendimentos/entrada`, b); toast({ type: r.escalonado ? "info" : "success", text: `Resposta: ${r.resposta ?? r.aviso}${r.escalonado ? " (escalonado ao consultor)" : ""}` }); setRev((x) => x + 1); }} />
    </>
  );
}

export default function SiteTab() {
  const [t, setT] = useState(0);
  const SUB = [["Páginas", <Paginas key="p" />], ["Formulários", <Formularios key="f" />], ["Atendimento IA", <Atendimento key="a" />]] as const;
  return (<><Tabs value={t} onChange={(_, v) => setT(v)} sx={{ mb: 2 }}>{SUB.map(([l]) => <Tab key={l} label={l} />)}</Tabs>{SUB[t][1]}</>);
}
