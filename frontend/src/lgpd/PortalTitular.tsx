import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import PublicShell, { H, P, useInstituicao } from "./PublicShell";
import { ROTULOS_TIPO, instituicaoRef, pub } from "./publicApi";

const cpfMask = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 11); return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); };
const STATUS: Record<string, { rot: string; cor: "default" | "info" | "warning" | "success" | "error" }> = {
  ABERTA: { rot: "Recebida", cor: "info" }, EM_ANALISE: { rot: "Em análise", cor: "warning" }, AGUARDANDO_TITULAR: { rot: "Aguardando você", cor: "warning" },
  ATENDIDA: { rot: "Atendida", cor: "success" }, ATENDIDA_PARCIALMENTE: { rot: "Atendida parcialmente", cor: "warning" }, NEGADA: { rot: "Negada (veja a justificativa)", cor: "error" }, CANCELADA: { rot: "Cancelada", cor: "default" },
};

function NovaSolicitacao() {
  const [f, setF] = useState<Record<string, any>>({ tipo: "ACESSO", menor: false });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState<null | { protocolo: string; codigoAcompanhamento: string; prazoEm: string; aviso: string }>(null);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  async function enviar() {
    setErro("");
    if (!f.nome || !f.email) { setErro("Informe seu nome completo e e-mail."); return; }
    setBusy(true);
    try {
      const body: any = { tipo: f.tipo, nome: f.nome, email: f.email, telefone: f.telefone || undefined, documento: f.documento || undefined, descricao: f.descricao || undefined, menor: f.menor || undefined, responsavelNome: f.menor ? f.responsavelNome : undefined, responsavelParentesco: f.menor ? f.responsavelParentesco : undefined, website: f.website };
      setOk(await pub("POST", "/solicitacoes", body));
    } catch (e: any) { setErro(e?.message || "Não foi possível enviar."); } finally { setBusy(false); }
  }
  if (ok) {
    return (
      <Box>
        <Alert severity="success" sx={{ mb: 2 }}>Solicitação registrada. Prazo de resposta: <b>{new Date(ok.prazoEm).toLocaleDateString("pt-BR")}</b> (15 dias).</Alert>
        <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2, mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Protocolo</Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: "monospace" }}>{ok.protocolo}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>Código de acompanhamento</Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, fontFamily: "monospace" }}>{ok.codigoAcompanhamento}</Typography>
        </Box>
        <Alert severity="warning">{ok.aviso}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => { setOk(null); setF({ tipo: "ACESSO", menor: false }); }}>Abrir outra solicitação</Button>
      </Box>
    );
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TextField select label="O que você deseja?" value={f.tipo} onChange={(e) => set("tipo", e.target.value)} helperText={ROTULOS_TIPO[f.tipo]?.ajuda}>
        {Object.entries(ROTULOS_TIPO).map(([k, v]) => <MenuItem key={k} value={k}>{v.titulo}</MenuItem>)}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
        <TextField label="Nome completo" required value={f.nome || ""} onChange={(e) => set("nome", e.target.value)} />
        <TextField label="E-mail" type="email" required value={f.email || ""} onChange={(e) => set("email", e.target.value)} helperText="Enviaremos o aviso de resposta para este e-mail." />
        <TextField label="CPF (opcional, ajuda a localizar seus dados)" value={f.documento || ""} onChange={(e) => set("documento", cpfMask(e.target.value))} />
        <TextField label="Telefone (opcional)" value={f.telefone || ""} onChange={(e) => set("telefone", e.target.value)} />
      </Box>
      <TextField label="Detalhes do pedido" multiline minRows={3} value={f.descricao || ""} onChange={(e) => set("descricao", e.target.value)} helperText={f.tipo === "CORRECAO" ? "Diga qual dado está incorreto e qual é o correto." : "Quanto mais claro, mais rápido conseguimos atender."} required={f.tipo === "CORRECAO"} />
      <FormControlLabel control={<Checkbox checked={!!f.menor} onChange={(e) => set("menor", e.target.checked)} />} label="O pedido é sobre dados de uma pessoa menor de 18 anos (faço o pedido como responsável legal)" />
      {f.menor && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Nome do responsável legal" required value={f.responsavelNome || ""} onChange={(e) => set("responsavelNome", e.target.value)} />
          <TextField label="Parentesco / qualidade" required value={f.responsavelParentesco || ""} onChange={(e) => set("responsavelParentesco", e.target.value)} />
        </Box>
      )}
      {/* campo-isca anti-robô: deve ficar vazio */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden value={f.website || ""} onChange={(e) => set("website", e.target.value)} style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
      <Alert severity="info">Para sua segurança, podemos pedir a confirmação da sua identidade antes de entregar ou alterar dados. Respondemos em até 15 dias.</Alert>
      {erro && <Alert severity="error">{erro}</Alert>}
      <Box><Button variant="contained" disabled={busy} onClick={enviar}>{busy ? "Enviando…" : "Enviar solicitação"}</Button></Box>
    </Box>
  );
}

function Acompanhar() {
  const [protocolo, setProtocolo] = useState(new URLSearchParams(window.location.search).get("protocolo") || "");
  const [codigo, setCodigo] = useState("");
  const [r, setR] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function consultar() {
    setErro(""); setBusy(true);
    try { setR(await pub("POST", "/solicitacoes/consulta", { protocolo: protocolo.trim(), codigo: codigo.trim() })); } catch (e: any) { setR(null); setErro(e?.message || "Não foi possível consultar."); } finally { setBusy(false); }
  }
  async function complementar() {
    setBusy(true); setErro("");
    try { await pub("POST", "/solicitacoes/responder", { protocolo: protocolo.trim(), codigo: codigo.trim(), mensagem: msg }); setMsg(""); await consultar(); } catch (e: any) { setErro(e?.message || "Não foi possível enviar."); } finally { setBusy(false); }
  }
  const st = r ? STATUS[r.status] : null;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" }, gap: 2, alignItems: "start" }}>
        <TextField label="Protocolo" placeholder="LGPD-2026-00001" value={protocolo} onChange={(e) => setProtocolo(e.target.value.toUpperCase())} />
        <TextField label="Código de acompanhamento" placeholder="XXXX-XXXX-XXXX-XXXX" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
        <Button variant="contained" sx={{ height: 56 }} disabled={busy || !protocolo || !codigo} onClick={consultar}>Consultar</Button>
      </Box>
      {erro && <Alert severity="error">{erro}</Alert>}
      {r && (
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{r.protocolo}</Typography>
            <Chip size="small" color={st?.cor} label={st?.rot ?? r.status} />
            <Chip size="small" variant="outlined" label={r.tipoRotulo} />
          </Box>
          <Typography variant="body2" color="text.secondary">Aberta em {new Date(r.abertaEm).toLocaleDateString("pt-BR")} · prazo de resposta: <b>{new Date(r.prazoEm).toLocaleDateString("pt-BR")}</b>{r.prorrogada ? " (prorrogado)" : ""}</Typography>
          {r.resposta && <Alert severity={r.status === "NEGADA" ? "error" : "success"} sx={{ mt: 2, whiteSpace: "pre-wrap" }}><b>Resposta:</b> {r.resposta}{r.justificativa ? `\n\nJustificativa: ${r.justificativa}` : ""}</Alert>}
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Andamento</Typography>
          {(r.andamentos || []).map((a: any, i: number) => <Typography key={i} variant="body2">• {new Date(a.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} — {a.texto}</Typography>)}
          {r.podeResponder && (
            <Box sx={{ mt: 2, display: "grid", gap: 1 }}>
              <Alert severity="warning">A instituição aguarda informações suas.</Alert>
              <TextField label="Sua resposta" multiline minRows={2} value={msg} onChange={(e) => setMsg(e.target.value)} />
              <Box><Button variant="contained" disabled={busy || msg.length < 3} onClick={complementar}>Enviar</Button></Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function Consentimentos() {
  const [id, setId] = useState("");
  const [recibo, setRecibo] = useState("");
  const [res, setRes] = useState<string>("");
  const [erro, setErro] = useState("");
  async function revogar() {
    setErro(""); setRes("");
    try { const r: any = await pub("POST", "/consentimentos/revogar", { id: id.trim(), recibo: recibo.trim(), motivo: "Revogado pelo Portal do Titular" }); setRes(r.mensagem); } catch (e: any) { setErro(e?.message || "Não foi possível revogar."); }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <P>Se você deu um consentimento (por exemplo, para receber divulgação) e guardou o <b>recibo</b>, pode revogá-lo aqui, de graça e a qualquer momento. Sem o recibo, abra uma solicitação do tipo “Revogar consentimento”. Para cookies, use o botão “Cookies” no rodapé.</P>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
        <TextField label="Código do consentimento" value={id} onChange={(e) => setId(e.target.value)} />
        <TextField label="Recibo" value={recibo} onChange={(e) => setRecibo(e.target.value.toUpperCase())} />
      </Box>
      {erro && <Alert severity="error">{erro}</Alert>}
      {res && <Alert severity="success">{res}</Alert>}
      <Box><Button variant="contained" disabled={!id || !recibo} onClick={revogar}>Revogar consentimento</Button></Box>
    </Box>
  );
}

function Encarregado() {
  const { dados, erro } = useInstituicao("/dpo");
  const d = dados?.encarregado;
  return (
    <Box>
      {erro && <Alert severity="info">{erro}</Alert>}
      {d ? (
        <>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{d.nome}</Typography>
          <P>{d.cargo || "Encarregado(a) pelo tratamento de dados pessoais"}{d.empresa ? ` — ${d.empresa}` : ""}</P>
          <P>E-mail: <b>{d.email}</b>{d.telefone ? <> · Telefone: <b>{d.telefone}</b></> : null}{d.horarioAtendimento ? <> · Atendimento: {d.horarioAtendimento}</> : null}</P>
          {d.endereco && <P>Endereço: {d.endereco}</P>}
        </>
      ) : <Alert severity="info">{dados?.aviso || "Encarregado ainda não divulgado."}</Alert>}
      <P>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD) se entender que seus direitos não foram atendidos.</P>
    </Box>
  );
}

export default function PortalTitular() {
  const [aba, setAba] = useState(0);
  const { dados } = useInstituicao("/dpo");
  return (
    <PublicShell titulo="Portal do Titular" subtitulo="Exerça seus direitos sobre seus dados pessoais, de forma simples e gratuita." instituicao={dados?.instituicao?.nome}>
      {!instituicaoRef() && <Alert severity="error" sx={{ mb: 2 }}>Instituição não identificada. Acesse pelo link oferecido pela sua instituição (endereço terminado em <code>?i=sigla</code>).</Alert>}
      <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Abrir solicitação" /><Tab label="Acompanhar" /><Tab label="Consentimentos" /><Tab label="Encarregado (DPO)" />
      </Tabs>
      {aba === 0 && <NovaSolicitacao />}
      {aba === 1 && <Acompanhar />}
      {aba === 2 && <Consentimentos />}
      {aba === 3 && <Encarregado />}
      <H>Seus direitos</H>
      <P>A LGPD garante a você acesso, correção, anonimização, eliminação, portabilidade, informação sobre compartilhamento e revogação de consentimento. Alguns dados, como histórico escolar e registros fiscais, precisam ser mantidos por lei (art. 16) — explicaremos caso seu pedido não possa ser atendido por completo.</P>
    </PublicShell>
  );
}
