import { Alert, Box, Button, Typography } from "@mui/material";
import { useState } from "react";
import { Async, FormDialog, Panel, Stat, StatGrid, Tabela, Tag, fmtDate, useApi, useToast } from "./host";
import { api, ehContador, Simulado } from "./kit";

const P = "/contabil/carteira";

/** Modelos de mensagem com variáveis, pesquisa de satisfação (NPS) e lembretes. */
export default function ComunicacaoTab() {
  const md = useApi<any>(`${P}/modelos-msg`);
  const nps = useApi<any>(`${P}/nps/resumo`);
  const al = useApi<any>(`${P}/alertas`);
  const [form, setForm] = useState<any>(null);
  const toast = useToast();
  return (
    <>
      <Alert severity="warning" sx={{ mb: 2 }}>Os envios de e-mail e WhatsApp feitos pelo sistema são <b>SIMULADOS</b> (ficam registrados no histórico do cliente, mas nada é enviado). Há uma interface de provedor para integrar o envio real. <Simulado /></Alert>
      <Async state={nps}>{(d) => (
        <StatGrid min={150}><Stat label="NPS (última resposta por cliente)" value={d.nps === null ? "—" : d.nps} hint={`${d.respostas} resposta(s) em 12 meses`} /><Stat label="Promotores" value={d.promotores} tone="success" /><Stat label="Neutros" value={d.neutros} /><Stat label="Detratores" value={d.detratores} tone={d.detratores ? "error" : "default"} /></StatGrid>
      )}</Async>
      <Panel title="Modelos de mensagem" subtitle="Use variáveis entre chaves duplas: cliente, nome_fantasia, documento, responsavel, contato, competencia, valor_honorario, vencimento, escritorio, data_hoje." actions={ehContador() ? <Button size="small" variant="contained" onClick={() => setForm({})}>Novo modelo</Button> : null}>
        <Async state={md}>{(d) => <Tabela rows={d.items} vazio="Nenhum modelo cadastrado." cols={[{ h: "Nome", r: (r: any) => r.nome }, { h: "Canal", r: (r: any) => r.canal }, { h: "Assunto", r: (r: any) => r.assunto || "—" }, { h: "Mensagem", r: (r: any) => <Typography variant="caption" sx={{ display: "block", maxWidth: 420 }} noWrap title={r.corpo}>{r.corpo}</Typography>, hideMobile: true }, { h: "Ativo", r: (r: any) => <Tag text={r.ativo ? "sim" : "não"} tone={r.ativo ? "success" : "default"} /> },
          { h: "", r: (r: any) => ehContador() ? <><Button size="small" onClick={() => setForm(r)}>Editar</Button><Button size="small" color="error" onClick={() => toast.run(() => api.del(`/modelos-msg/${r.id}`), "Modelo removido.", md.reload, "Remover este modelo?")}>Remover</Button></> : null }]} />}</Async>
      </Panel>
      <Panel title="Lembretes e aniversários" sx={{ mt: 2 }}>
        <Async state={al}>{(d) => <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Lembretes de contato</Typography>{d.lembretes.length ? d.lembretes.map((l: any) => <Typography key={l.id} variant="body2" sx={{ py: 0.3 }}><b>{l.cliente}</b> — {l.assunto || "retornar"} ({fmtDate(l.lembreteEm)}) <Button size="small" onClick={() => toast.run(() => api.patch(`/interacoes/${l.id}/lembrete-feito`, {}), "Lembrete concluído.", al.reload)}>Concluir</Button></Typography>) : <Typography variant="body2" color="text.secondary">Sem lembretes pendentes.</Typography>}</Box>
          <Box><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Aniversário de empresa (próximos 7 dias)</Typography>{d.aniversarios.length ? d.aniversarios.map((a: any) => <Typography key={a.clienteId} variant="body2" sx={{ py: 0.3 }}>🎂 {a.cliente}</Typography>) : <Typography variant="body2" color="text.secondary">Nenhum.</Typography>}</Box>
        </Box>}</Async>
      </Panel>
      <FormDialog open={!!form} title={form?.id ? "Editar modelo" : "Novo modelo"} initial={form} fields={[{ key: "nome", label: "Nome", required: true }, { key: "canal", label: "Canal", type: "select", options: ["EMAIL", "WHATSAPP"], def: "EMAIL" }, { key: "assunto", label: "Assunto (e-mail)" }, { key: "corpo", label: "Mensagem", type: "textarea", required: true }, { key: "ativo", label: "Ativo", type: "bool", def: true }]}
        onClose={() => setForm(null)} onSubmit={async (b) => { form?.id ? await api.put(`/modelos-msg/${form.id}`, b) : await api.post("/modelos-msg", b); toast.ok("Modelo salvo."); md.reload(); }} />
      {toast.node}
    </>
  );
}
