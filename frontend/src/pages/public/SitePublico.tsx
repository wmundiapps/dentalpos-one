import { Alert, Accordion, AccordionDetails, AccordionSummary, AppBar, Box, Button, Checkbox, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Fab, FormControlLabel, IconButton, MenuItem, Paper, TextField, Toolbar, Typography } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const PUB = `${API}/public/edu/marketing`;
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function pj(path: string, body?: unknown) {
  const r = await fetch(`${PUB}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Erro ${r.status}`);
  return j;
}
/** UTM, cupom e código de indicação ficam guardados na sessão para atribuir o lead mesmo após navegar pelo site. */
function atribuicao() {
  const q = new URLSearchParams(window.location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "cupom", "ref"];
  try {
    const salvo = JSON.parse(sessionStorage.getItem("mkt.attr") || "{}");
    keys.forEach((k) => { const v = q.get(k); if (v) salvo[k] = v.slice(0, 150); });
    sessionStorage.setItem("mkt.attr", JSON.stringify(salvo));
    return salvo as Record<string, string>;
  } catch { return Object.fromEntries(keys.filter((k) => q.get(k)).map((k) => [k, q.get(k)!])); }
}
const sessaoChat = () => { try { let s = localStorage.getItem("mkt.chat"); if (!s) { s = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("mkt.chat", s); } return s; } catch { return "v" + Math.random().toString(36).slice(2, 14); } };

function Formulario({ f, paginaId, curso }: { f: any; paginaId?: string; curso?: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [c1, setC1] = useState(false); const [c2, setC2] = useState(false);
  const [estado, setEstado] = useState<"idle" | "env" | "ok">("idle"); const [erro, setErro] = useState(""); const [hp, setHp] = useState("");
  const t0 = useRef(Date.now());
  if (!f) return <Alert severity="info">Formulário indisponível.</Alert>;
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErro(""); setEstado("env");
    try {
      const a = atribuicao();
      await pj(`/site/${window.location.pathname.split("/")[2]}/formularios/${f.slug}/enviar`, { dados: v, curso, consentimentoContato: c1, consentimentoMarketing: c2, website: hp, tempoPreenchimentoMs: Date.now() - t0.current, paginaId, cupom: a.cupom, ref: a.ref, utm: a });
      setEstado("ok");
    } catch (er: any) { setErro(er.message); setEstado("idle"); }
  }
  if (estado === "ok") return <Alert severity="success">{f.mensagemSucesso}</Alert>;
  return (
    <Box component="form" onSubmit={enviar} sx={{ display: "grid", gap: 2 }} aria-label={f.nome}>
      {erro && <Alert severity="error">{erro}</Alert>}
      {f.campos.map((c: any) => (
        <TextField key={c.chave} label={c.rotulo} required={c.obrigatorio} value={v[c.chave] ?? ""} onChange={(e) => setV((o) => ({ ...o, [c.chave]: e.target.value }))} type={c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : "text"} select={c.tipo === "select"} fullWidth>
          {c.tipo === "select" && (c.opcoes ?? []).map((o: string) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </TextField>
      ))}
      <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, width: 0 }} />
      <FormControlLabel control={<Checkbox checked={c1} onChange={(e) => setC1(e.target.checked)} required />} label={<Typography variant="body2">{f.textoConsentimento} <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a></Typography>} />
      <FormControlLabel control={<Checkbox checked={c2} onChange={(e) => setC2(e.target.checked)} />} label={<Typography variant="body2">{f.textoMarketing}</Typography>} />
      <Button type="submit" variant="contained" size="large" disabled={estado === "env"}>{estado === "env" ? "Enviando…" : "Quero receber contato"}</Button>
    </Box>
  );
}

function Simulador({ cursos, slug }: { cursos: any[]; slug: string }) {
  const [of, setOf] = useState(cursos[0]?.id ?? ""); const [bolsa, setBolsa] = useState("0"); const [pont, setPont] = useState("0");
  const [r, setR] = useState<any>(null); const [erro, setErro] = useState("");
  useEffect(() => { if (!of) return; pj(`/site/${slug}/simulador`, { ofertaId: of, bolsaPct: Number(bolsa) || 0, pontualidadePct: Number(pont) || 0 }).then((x) => { setR(x); setErro(""); }).catch((e) => setErro(e.message)); }, [of, bolsa, pont, slug]);
  if (!cursos.length) return <Typography color="text.secondary">Simulador disponível quando houver vestibular aberto.</Typography>;
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
      <Box sx={{ display: "grid", gap: 2 }}>
        <TextField select label="Curso" value={of} onChange={(e) => setOf(e.target.value)}>{cursos.map((c) => <MenuItem key={c.id} value={c.id}>{c.nome} ({c.modalidade})</MenuItem>)}</TextField>
        <TextField label="Bolsa / desconto (%)" type="number" value={bolsa} onChange={(e) => setBolsa(e.target.value)} slotProps={{ htmlInput: { min: 0, max: 100 } }} />
        <TextField label="Desconto de pontualidade (%)" type="number" value={pont} onChange={(e) => setPont(e.target.value)} slotProps={{ htmlInput: { min: 0, max: 30 } }} />
      </Box>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }} aria-live="polite">
        {erro ? <Alert severity="error">{erro}</Alert> : r ? (<>
          <Typography variant="overline">Sua mensalidade</Typography>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>{brl(r.mensalidadeComPontualidade)}</Typography>
          <Typography variant="body2">em {r.parcelas} parcelas · total do curso {brl(r.totalComPontualidade)}</Typography>
          <Typography variant="body2" color="text.secondary">Mensalidade cheia {brl(r.mensalidadeCheia)} · economia {brl(r.economiaTotal)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{r.aviso}</Typography>
        </>) : <CircularProgress size={24} />}
      </Paper>
    </Box>
  );
}

function Eventos({ eventos, slug }: { eventos: any[]; slug: string }) {
  const [ev, setEv] = useState<any>(null); const [v, setV] = useState<any>({ aceitaLembretes: true }); const [res, setRes] = useState<any>(null); const [erro, setErro] = useState(""); const [qr, setQr] = useState("");
  async function ir() {
    setErro("");
    try { const a = atribuicao(); const r = await pj(`/site/${slug}/eventos/${ev.slug}/inscricao`, { nome: v.nome, email: v.email, telefone: v.telefone, consentimentoContato: !!v.c1, consentimentoMarketing: !!v.c2, aceitaLembretes: !!v.aceitaLembretes, utm: a }); setRes(r); setQr(await QRCode.toDataURL(r.qrToken, { width: 220, margin: 1 })); } catch (e: any) { setErro(e.message); }
  }
  if (!eventos.length) return <Typography color="text.secondary">Em breve novos eventos.</Typography>;
  return (
    <>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" } }}>
        {eventos.map((e) => <Paper key={e.slug} variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontWeight: 800 }}>{e.titulo}</Typography><Typography variant="body2" color="text.secondary">{new Date(e.inicio).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}{e.local ? ` · ${e.local}` : ""}</Typography><Typography variant="body2" sx={{ my: 1 }}>{e.descricao}</Typography><Button variant="outlined" onClick={() => { setEv(e); setRes(null); setErro(""); }}>Quero participar</Button></Paper>)}
      </Box>
      <Dialog open={!!ev} onClose={() => setEv(null)} fullWidth maxWidth="xs">
        <DialogTitle>Inscrição — {ev?.titulo}</DialogTitle>
        <DialogContent>
          {res ? (<Box sx={{ textAlign: "center" }}><Alert severity={res.status === "LISTA_ESPERA" ? "warning" : "success"} sx={{ mb: 2 }}>{res.mensagem ?? "Você já está inscrito."}</Alert>{qr && <img src={qr} alt="QR code de presença" width={220} height={220} />}<Typography variant="caption" component="div">Apresente este QR na entrada. Código: {res.qrToken}</Typography></Box>) : (
            <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
              {erro && <Alert severity="error">{erro}</Alert>}
              <TextField label="Nome completo" value={v.nome ?? ""} onChange={(e) => setV({ ...v, nome: e.target.value })} required />
              <TextField label="E-mail" type="email" value={v.email ?? ""} onChange={(e) => setV({ ...v, email: e.target.value })} />
              <TextField label="WhatsApp" type="tel" value={v.telefone ?? ""} onChange={(e) => setV({ ...v, telefone: e.target.value })} />
              <FormControlLabel control={<Checkbox checked={!!v.c1} onChange={(e) => setV({ ...v, c1: e.target.checked })} />} label={<Typography variant="body2">Autorizo o tratamento dos meus dados para esta inscrição (LGPD).</Typography>} />
              <FormControlLabel control={<Checkbox checked={!!v.aceitaLembretes} onChange={(e) => setV({ ...v, aceitaLembretes: e.target.checked })} />} label={<Typography variant="body2">Quero receber um lembrete do evento.</Typography>} />
              <FormControlLabel control={<Checkbox checked={!!v.c2} onChange={(e) => setV({ ...v, c2: e.target.checked })} />} label={<Typography variant="body2">Aceito receber novidades e ofertas (opcional; descadastro em 1 clique).</Typography>} />
            </Box>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setEv(null)}>Fechar</Button>{!res && <Button variant="contained" onClick={ir} disabled={!v.nome || !v.c1}>Inscrever-me</Button>}</DialogActions>
      </Dialog>
    </>
  );
}

function Chat({ slug, nome }: { slug: string; nome: string }) {
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState<Array<{ de: "eu" | "ia"; t: string }>>([{ de: "ia", t: `Olá! Sou a assistente virtual de ${nome}. Posso falar sobre cursos, mensalidades, vestibular e eventos.` }]);
  const [t, setT] = useState(""); const [busy, setBusy] = useState(false); const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView?.({ behavior: "smooth" }); }, [msgs, open]);
  async function enviar() {
    const texto = t.trim(); if (!texto) return; setT(""); setMsgs((m) => [...m, { de: "eu", t: texto }]); setBusy(true);
    try { const r = await pj(`/site/${slug}/chat`, { sessao: sessaoChat(), texto }); const resp = r.resposta ?? r.aviso; if (resp) setMsgs((m) => [...m, { de: "ia", t: resp + (r.escalonado && r.resposta ? "\n(Um consultor dará continuidade.)" : "") }]); }
    catch (e: any) { setMsgs((m) => [...m, { de: "ia", t: e.message }]); } finally { setBusy(false); }
  }
  return (
    <>
      <Fab color="primary" aria-label="Abrir chat" onClick={() => setOpen(true)} sx={{ position: "fixed", right: 16, bottom: 16, display: open ? "none" : "flex" }}><ChatIcon /></Fab>
      {open && (
        <Paper elevation={8} sx={{ position: "fixed", right: { xs: 8, sm: 16 }, bottom: 16, width: { xs: "calc(100vw - 16px)", sm: 360 }, maxHeight: "70vh", display: "flex", flexDirection: "column", borderRadius: 3, overflow: "hidden", zIndex: 1300 }}>
          <Box sx={{ bgcolor: "primary.main", color: "#fff", p: 1.5, display: "flex", alignItems: "center" }}><Typography sx={{ flex: 1, fontWeight: 700 }}>Assistente {nome}</Typography><IconButton size="small" color="inherit" aria-label="Fechar chat" onClick={() => setOpen(false)}><CloseIcon /></IconButton></Box>
          <Box sx={{ p: 1.5, overflowY: "auto", flex: 1, minHeight: 200 }} aria-live="polite">
            {msgs.map((m, i) => <Box key={i} sx={{ mb: 1, textAlign: m.de === "eu" ? "right" : "left" }}><Paper variant="outlined" sx={{ p: 1, display: "inline-block", maxWidth: "88%", whiteSpace: "pre-line", bgcolor: m.de === "eu" ? "action.selected" : undefined }}>{m.t}</Paper></Box>)}
            {busy && <CircularProgress size={18} />}<div ref={fim} />
          </Box>
          <Box sx={{ p: 1, display: "flex", gap: 1, borderTop: 1, borderColor: "divider" }}><TextField size="small" fullWidth placeholder="Digite sua dúvida…" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} slotProps={{ htmlInput: { maxLength: 500 } }} /><Button variant="contained" onClick={enviar} disabled={busy}>Enviar</Button></Box>
        </Paper>
      )}
    </>
  );
}

function Bloco({ b, slug, site, paginaId }: { b: any; slug: string; site: any; paginaId: string }) {
  const [cursoSel, setCursoSel] = useState<string | undefined>();
  const [dlg, setDlg] = useState(false);
  const link = (url?: string) => (url && /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(url) ? url : "#");
  switch (b.tipo) {
    case "HERO": return <Box sx={{ background: `linear-gradient(120deg, ${site.corSecundaria}, ${site.corPrimaria})`, color: "#fff", py: { xs: 6, md: 10 }, px: 2, textAlign: "center" }}><Container maxWidth="md"><Typography component="h1" variant="h3" sx={{ fontWeight: 800, fontSize: { xs: 30, md: 44 } }}>{b.titulo}</Typography><Typography sx={{ mt: 2, fontSize: 18, opacity: 0.95 }}>{b.texto}</Typography>{b.botaoRotulo && <Button href={link(b.botaoUrl)} variant="contained" size="large" sx={{ mt: 3, bgcolor: "#fff", color: "#14213d", "&:hover": { bgcolor: "#eee" } }}>{b.botaoRotulo}</Button>}</Container></Box>;
    case "CTA": return <Box sx={{ bgcolor: site.corPrimaria, color: "#fff", py: 6, px: 2, textAlign: "center" }}><Typography variant="h4" sx={{ fontWeight: 800 }}>{b.titulo}</Typography><Typography sx={{ my: 1 }}>{b.texto}</Typography>{b.botaoRotulo && <Button href={link(b.botaoUrl)} variant="contained" sx={{ bgcolor: "#fff", color: "#14213d" }}>{b.botaoRotulo}</Button>}</Box>;
    case "CHAT": return null;
  }
  return (
    <Container maxWidth="md" sx={{ py: 4 }} id={b.tipo === "FORM" ? "formulario" : undefined}>
      {b.titulo && <Typography component="h2" variant="h4" sx={{ fontWeight: 800, mb: 2 }}>{b.titulo}</Typography>}
      {b.tipo === "TEXTO" && (<><Typography sx={{ whiteSpace: "pre-line" }}>{b.texto}</Typography>{b.botaoRotulo && <Button href={link(b.botaoUrl)} variant="outlined" sx={{ mt: 2 }}>{b.botaoRotulo}</Button>}</>)}
      {b.tipo === "CURSOS" && (<Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>{(b.cursos ?? []).map((c: any) => <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontWeight: 800 }}>{c.nome}</Typography><Box sx={{ my: 0.5 }}><Chip size="small" label={c.modalidade} sx={{ mr: 0.5 }} /><Chip size="small" label={c.turno} /></Box><Typography variant="body2">{brl(c.mensalidade)} em {c.parcelas}x · {c.vagas} vagas</Typography><Button sx={{ mt: 1 }} variant="contained" onClick={() => { setCursoSel(c.nome); setDlg(true); }}>Quero me inscrever</Button></Paper>)}{!(b.cursos ?? []).length && <Typography color="text.secondary">Os cursos serão divulgados em breve.</Typography>}</Box>)}
      {b.tipo === "SIMULADOR" && <Simulador cursos={b.cursos ?? []} slug={slug} />}
      {b.tipo === "FAQ" && (b.itens ?? []).map((i: any, k: number) => <Accordion key={k} disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ fontWeight: 700 }}>{i.pergunta}</Typography></AccordionSummary><AccordionDetails><Typography>{i.resposta}</Typography></AccordionDetails></Accordion>)}
      {b.tipo === "EVENTOS" && <Eventos eventos={b.eventos ?? []} slug={slug} />}
      {b.tipo === "DEPOIMENTOS" && <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" } }}>{(b.itens ?? []).map((i: any, k: number) => <Paper key={k} variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Typography sx={{ fontStyle: "italic" }}>“{i.texto}”</Typography><Typography variant="caption" color="text.secondary">— {i.autor}</Typography></Paper>)}</Box>}
      {b.tipo === "NUMEROS" && <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{(b.itens ?? []).map((i: any, k: number) => <Box key={k}><Typography variant="h4" sx={{ fontWeight: 800, color: site.corPrimaria }}>{i.valor}</Typography><Typography variant="body2">{i.rotulo}</Typography></Box>)}</Box>}
      {b.tipo === "FORM" && (b.formulario ? <Formulario f={b.formulario} paginaId={paginaId} /> : <Alert severity="info">Formulário indisponível.</Alert>)}
      <Dialog open={dlg} onClose={() => setDlg(false)} fullWidth maxWidth="sm"><DialogTitle>Inscrição — {cursoSel}</DialogTitle><DialogContent><InscricaoRapida slug={slug} curso={cursoSel} paginaId={paginaId} /></DialogContent><DialogActions><Button onClick={() => setDlg(false)}>Fechar</Button></DialogActions></Dialog>
    </Container>
  );
}

/** Pré-inscrição pela vitrine de cursos: usa o primeiro formulário público da página. */
function InscricaoRapida({ slug, curso, paginaId }: { slug: string; curso?: string; paginaId: string }) {
  const [f, setF] = useState<any>(null);
  useEffect(() => { pj(`/site/${slug}/paginas/${window.location.pathname.split("/")[3] || "inicio"}`).then((p) => setF(p.blocos.find((x: any) => x.tipo === "FORM")?.formulario ?? null)).catch(() => setF(null)); }, [slug]);
  return f ? <Formulario f={f} curso={curso} paginaId={paginaId} /> : <Alert severity="info">Deixe seu contato pelo formulário da página ou fale com nossa assistente no chat.</Alert>;
}

export default function SitePublico() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const partes = window.location.pathname.replace(base, "").split("/").filter(Boolean);
  const slug = partes[1] || ""; const pagSlug = partes[2];
  const [site, setSite] = useState<any>(null); const [pag, setPag] = useState<any>(null); const [erro, setErro] = useState("");
  useEffect(() => {
    atribuicao();
    pj(`/site/${slug}`).then(async (s) => {
      setSite(s);
      const alvo = pagSlug || s.paginas.find((p: any) => p.tipo === "HOME")?.slug || s.paginas[0]?.slug;
      if (!alvo) { setErro("Este site ainda não tem páginas publicadas."); return; }
      const p = await pj(`/site/${slug}/paginas/${alvo}`); setPag(p);
      document.title = p.seoTitulo || p.titulo;
      let m = document.querySelector('meta[name="description"]'); if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); } m.setAttribute("content", p.seoDescricao || "");
    }).catch((e) => setErro(e.message));
  }, [slug, pagSlug]);
  if (erro) return <Container sx={{ py: 8 }}><Alert severity="error">{erro}</Alert></Container>;
  if (!site || !pag) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
  const s = site.site;
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff", color: "#14213d" }}>
      <AppBar position="sticky" color="inherit" elevation={1}><Toolbar sx={{ gap: 1, flexWrap: "wrap" }}>
        {s.logoUrl && /^(https?:\/\/|\/)/.test(s.logoUrl) && <img src={s.logoUrl} alt={s.nome} height={36} />}
        <Typography sx={{ fontWeight: 800, flex: 1, color: s.corSecundaria }}>{s.nome}</Typography>
        {site.menu.map((m: any) => <Button key={m.slug} href={`${base}/site/${s.slug}/${m.slug}`} size="small">{m.titulo}</Button>)}
      </Toolbar></AppBar>
      <main>{pag.blocos.map((b: any, i: number) => <Bloco key={i} b={b} slug={s.slug} site={s} paginaId={pag.id} />)}</main>
      <Box component="footer" sx={{ bgcolor: "#f4f6fb", py: 3, textAlign: "center", fontSize: 13 }}>{s.rodape || s.nome} · <a href={`${base}/privacidade`}>Política de Privacidade</a>{s.whatsapp ? ` · WhatsApp ${s.whatsapp}` : ""}</Box>
      {s.chatAtivo && <Chat slug={s.slug} nome={s.nome} />}
    </Box>
  );
}
