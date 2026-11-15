import { Alert, Box, Button, Chip, LinearProgress, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { useState } from "react";
import { Async, Empty, FormDialog, Panel, Stat, StatGrid, Tabela, brl, fmtDate, fmtDateTime, useApi, useToast } from "./host";
import { FaixaLegal, Situacao, api, baixar, compMes, lerArquivo } from "./kit";

const P = "/contabil/carteira/portal";
const TIPOS = [{ value: "EXTRATO", label: "Extrato bancário" }, { value: "NOTAS_EMITIDAS", label: "Notas emitidas" }, { value: "NOTAS_RECEBIDAS", label: "Notas recebidas" }, { value: "FOLHA", label: "Folha / RH" }, { value: "OUTRO", label: "Outro documento" }];
const ROTULO: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

function Resumo({ go }: { go: (n: number) => void }) {
  const st = useApi<any>(`${P}/resumo`);
  return (
    <Async state={st}>{(r) => (
      <>
        <Alert severity="info" sx={{ mb: 2 }}>Olá! Este é o portal de <b>{r.cliente.nomeFantasia || r.cliente.nome}</b> no escritório <b>{r.escritorio}</b>. {r.cliente.responsavel ? `Seu contador responsável: ${r.cliente.responsavel}.` : ""}</Alert>
        <StatGrid>
          <Stat label="Guias a pagar" value={r.guiasAPagar} tone={r.guiasVencidas ? "error" : "default"} hint={r.proximaGuia ? `próxima: ${r.proximaGuia.tipo} ${brl(r.proximaGuia.valor)} em ${fmtDate(r.proximaGuia.vencimento)}` : "nenhuma guia em aberto"} />
          <Stat label="Documentos pendentes" value={r.documentosFaltando.length} tone={r.documentosFaltando.length ? "warning" : "success"} hint={r.documentosFaltando.length ? r.documentosFaltando.map((d: string) => ROTULO[d] || d).join(", ") : `competência ${r.competenciaDocumentos}: tudo enviado`} />
          <Stat label="Honorários em aberto" value={r.honorariosAbertos} hint={brl(r.valorHonorarios)} />
          <Stat label="Mensagens novas" value={r.mensagensNaoLidas} tone={r.mensagensNaoLidas ? "info" : "default"} />
        </StatGrid>
        {r.documentosFaltando.length ? <Alert severity="warning" action={<Button size="small" onClick={() => go(2)}>Enviar agora</Button>} sx={{ mb: 1 }}>Faltam documentos de {r.competenciaDocumentos} para o fechamento: {r.documentosFaltando.map((d: string) => ROTULO[d] || d).join(", ")}.</Alert> : null}
        {r.guiasVencidas ? <Alert severity="error" sx={{ mb: 1 }}>Há {r.guiasVencidas} guia(s) vencida(s). Fale com o escritório antes de pagar, pois podem incidir multa e juros.</Alert> : null}
        {r.fiscalSimulado ? <Typography variant="caption" color="text.secondary">As guias exibidas foram lançadas pelo escritório e são estimativas/simulações.</Typography> : null}
      </>
    )}</Async>
  );
}

function Guias() {
  const st = useApi<any>(`${P}/guias`);
  return <Panel title="Guias a pagar" subtitle="Estimativas/simulações. Valide com seu contador antes de pagar."><Async state={st}>{(d) => <Tabela rows={d.items} vazio="Nenhuma guia no momento." cols={[{ h: "Guia", r: (r: any) => r.tipo }, { h: "Competência", r: (r: any) => r.competencia || "—" }, { h: "Vencimento", r: (r: any) => <span style={{ color: r.vencida ? "#d32f2f" : undefined }}>{fmtDate(r.vencimento)}</span> }, { h: "Valor", r: (r: any) => brl(r.valor) }, { h: "Situação", r: (r: any) => <Situacao value={r.vencida ? "ATRASADO" : r.status} /> }, { h: "Código", r: (r: any) => r.codigo || "—", hideMobile: true }]} />}</Async></Panel>;
}

function Documentos() {
  const [comp, setComp] = useState(compMes(-1));
  const [tipo, setTipo] = useState("EXTRATO");
  const docs = useApi<any>(`${P}/documentos`);
  const pend = useApi<any>(`${P}/pendencias?competencia=${comp}`);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const enviar = async (f: File) => {
    setBusy(true);
    await toast.run(async () => { const r = await api.post("/portal/documentos", { tipo, competencia: comp, nome: f.name, dataUrl: await lerArquivo(f) }); toast.ok(r.pendencias.faltando.length ? `Recebido! Ainda falta: ${r.pendencias.faltando.map((d: string) => ROTULO[d] || d).join(", ")}.` : "Recebido! Todos os documentos do mês foram enviados."); }, "", () => { docs.reload(); pend.reload(); });
    setBusy(false);
  };
  return (
    <>
      <Panel title="Enviar documentos" subtitle="Notas fiscais, extratos e outros arquivos (PDF, imagem, XML, CSV, OFX, planilha — até 3 MB).">
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <TextField size="small" type="month" label="Competência" value={comp} onChange={(e) => setComp(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 200 }}>{TIPOS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}</TextField>
          <Button variant="contained" component="label" startIcon={<UploadFileOutlinedIcon />} disabled={busy}>Escolher arquivo<input hidden type="file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviar(f); }} /></Button>
        </Box>
        {busy ? <LinearProgress sx={{ mb: 1 }} /> : null}
        <Async state={pend}>{(p) => <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{p.itens.map((i: any) => <Chip key={i.tipo} label={`${ROTULO[i.tipo] || i.tipo}: ${i.recebido ? (i.comPendencia ? "com pendência" : i.conferido ? "conferido" : "recebido") : "faltando"}`} color={!i.recebido ? "warning" : i.comPendencia ? "error" : "success"} variant={i.recebido ? "filled" : "outlined"} />)}</Box>}</Async>
      </Panel>
      <Panel title="Documentos enviados" sx={{ mt: 2 }}>
        <Async state={docs}>{(d) => <Tabela rows={d.items} vazio="Você ainda não enviou documentos." cols={[{ h: "Arquivo", r: (r: any) => r.nome }, { h: "Tipo", r: (r: any) => ROTULO[r.tipo] || r.tipo }, { h: "Competência", r: (r: any) => r.competencia || "—" }, { h: "Situação", r: (r: any) => <><Situacao value={r.status} />{r.observacao ? <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>{r.observacao}</Typography> : null}</> }, { h: "Enviado em", r: (r: any) => fmtDateTime(r.createdAt) }, { h: "", r: (r: any) => <Button size="small" onClick={() => toast.run(() => baixar(`/portal/documentos/${r.id}/download`, r.nome))}>Baixar</Button> }]} />}</Async>
      </Panel>
      {toast.node}
    </>
  );
}

function Mensagens() {
  const st = useApi<any>(`${P}/mensagens`);
  const [txt, setTxt] = useState("");
  const toast = useToast();
  return (
    <Panel title="Mensagens com o escritório">
      <Async state={st}>{(d) => (
        <>
          <Box sx={{ display: "grid", gap: 1, mb: 2, maxHeight: 420, overflowY: "auto" }}>
            {d.items.length ? d.items.map((m: any) => (
              <Box key={m.id} sx={{ p: 1.25, borderRadius: 2, maxWidth: "88%", ml: m.autorTipo === "CLIENTE" ? "auto" : 0, bgcolor: m.autorTipo === "CLIENTE" ? "primary.main" : "action.hover", color: m.autorTipo === "CLIENTE" ? "primary.contrastText" : "text.primary" }}>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>{m.autorTipo === "CLIENTE" ? "Você" : "Escritório"} · {fmtDateTime(m.createdAt)}</Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{m.texto}</Typography>
              </Box>
            )) : <Empty text="Nenhuma mensagem ainda. Escreva abaixo para falar com o escritório." />}
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField fullWidth size="small" multiline maxRows={4} placeholder="Escreva sua mensagem" value={txt} onChange={(e) => setTxt(e.target.value)} />
            <Button variant="contained" disabled={!txt.trim()} onClick={() => toast.run(() => api.post("/portal/mensagens", { texto: txt }), "", () => { setTxt(""); st.reload(); })}>Enviar</Button>
          </Box>
        </>
      )}</Async>
      {toast.node}
    </Panel>
  );
}

function Honorarios() {
  const st = useApi<any>(`${P}/honorarios`);
  return <Panel title="Honorários do escritório"><Async state={st}>{(d) => <Tabela rows={d.items} vazio="Sem cobranças." cols={[{ h: "Competência", r: (r: any) => r.competencia }, { h: "Descrição", r: (r: any) => r.descricao || "—", hideMobile: true }, { h: "Vencimento", r: (r: any) => fmtDate(r.vencimento) }, { h: "Valor", r: (r: any) => brl(r.valor) }, { h: "Situação", r: (r: any) => <Situacao value={r.situacao} /> }]} />}</Async></Panel>;
}

function Dados() {
  const st = useApi<any>(`${P}/meus-dados`);
  const [nps, setNps] = useState(false);
  const toast = useToast();
  return (
    <>
      <Panel title="Seus dados no escritório" subtitle="Transparência (LGPD): é isto que o escritório guarda sobre o seu cadastro." actions={<Button size="small" onClick={() => setNps(true)}>Avaliar o atendimento</Button>}>
        <Async state={st}>{(d) => (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
              {[["Nome", d.cadastro.nome], ["Documento", d.cadastro.documento], ["E-mail", d.cadastro.email], ["Telefone", d.cadastro.telefone], ["Regime", d.cadastro.regime], ["Base legal do tratamento", d.baseLegal?.replace(/_/g, " ")]].map(([k, v]) => <Typography key={String(k)} variant="body2"><Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>{k}</Typography>{(v as string) || "—"}</Typography>)}
            </Box>
            <Typography variant="subtitle2" sx={{ mt: 2, fontWeight: 800 }}>Contatos</Typography>
            {d.contatos.length ? d.contatos.map((c: any, i: number) => <Typography key={i} variant="body2">{c.nome} ({c.papel.replace(/_/g, " ")}) — {c.email || c.telefone || "sem contato"}</Typography>) : <Typography variant="body2" color="text.secondary">Nenhum.</Typography>}
            <Alert severity="info" sx={{ mt: 2 }}>Para corrigir seus dados ou exercer os direitos da LGPD (acesso, correção, anonimização), envie uma mensagem ao escritório.</Alert>
          </>
        )}</Async>
      </Panel>
      <FormDialog open={nps} title="Como foi o atendimento?" fields={[{ key: "nota", label: "De 0 (muito ruim) a 10 (excelente)", type: "number", required: true, def: 10 }, { key: "comentario", label: "Comentário (opcional)", type: "textarea" }]} submitLabel="Enviar avaliação" onClose={() => setNps(false)} onSubmit={async (b) => { await api.post("/portal/nps", b); toast.ok("Obrigado pela avaliação!"); }} />
      {toast.node}
    </>
  );
}

/** Portal do cliente final da contabilidade (cargo CLIENTE_CONTABIL): só enxerga os próprios dados. */
export default function PortalCliente() {
  const [aba, setAba] = useState(0);
  return (
    <>
      <Tabs value={aba} onChange={(_, v) => setAba(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }}>
        {["Resumo", "Guias a pagar", "Documentos", "Mensagens", "Honorários", "Meus dados"].map((n) => <Tab key={n} label={n} />)}
      </Tabs>
      {aba === 0 && <Resumo go={setAba} />}{aba === 1 && <Guias />}{aba === 2 && <Documentos />}{aba === 3 && <Mensagens />}{aba === 4 && <Honorarios />}{aba === 5 && <Dados />}
      <FaixaLegal />
    </>
  );
}
