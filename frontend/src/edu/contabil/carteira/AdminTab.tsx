import { Alert, Box, Button, Typography } from "@mui/material";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Async, FormDialog, Panel, SubNav, Tabela, Tag, fmtDate, fmtDateTime, useApi, useToast } from "./host";
import { api, ehGestao } from "./kit";

const P = "/contabil/carteira";

function Config() {
  const st = useApi<any>(`${P}/config`);
  const meta = useApi<any>(`${P}/meta`);
  const [edit, setEdit] = useState(false);
  const toast = useToast();
  return (
    <Panel title="Configurações do escritório" actions={ehGestao() ? <Button size="small" onClick={() => setEdit(true)}>Editar</Button> : null}>
      <Async state={st}>{(c) => (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
            {[["Nome do escritório", c.nomeEscritorio], ["Retenção após encerramento (LGPD)", `${c.retencaoAnos} ano(s)`], ["Capacidade padrão por contador", `${c.capacidadePadrao} clientes ativos`], ["Custo-hora interno (rentabilidade)", `R$ ${c.custoHora}`], ["Risco de inadimplência a partir de", `${c.diasRiscoInadimplencia} dias`], ["Documentos esperados por mês", (c.documentosEsperados || []).join(", ")]].map(([k, v]) => <Typography key={String(k)} variant="body2"><Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>{k}</Typography>{v}</Typography>)}
          </Box>
          <Async state={meta}>{(m) => <Alert severity="info" sx={{ mt: 2 }}>Provedores: fiscal <b>{m.provedores.fiscal.nome}</b>{m.provedores.fiscal.simulado ? " (camada local/simulada)" : ""} · mensagens <b>{m.provedores.mensagem.nome}</b>{m.provedores.mensagem.simulado ? " (SIMULADO)" : ""} · assinatura <b>{m.provedores.assinatura.nome}</b>{m.provedores.assinatura.simulado ? " (SIMULADA)" : ""}. Integrações reais entram por interface de provedor no servidor.</Alert>}</Async>
          <FormDialog open={edit} title="Configurações" initial={c} fields={[{ key: "nomeEscritorio", label: "Nome do escritório", required: true }, { key: "retencaoAnos", label: "Retenção (anos)", type: "number" }, { key: "capacidadePadrao", label: "Capacidade padrão", type: "number" }, { key: "custoHora", label: "Custo-hora interno (R$)", type: "number" }, { key: "diasRiscoInadimplencia", label: "Dias para risco alto de inadimplência", type: "number" }, { key: "documentosEsperados", label: "Documentos esperados (EXTRATO, NOTAS_EMITIDAS, NOTAS_RECEBIDAS, FOLHA...)", type: "list" }]}
            onClose={() => setEdit(false)} onSubmit={async (b) => { await api.put("/config", b); toast.ok("Configurações salvas."); st.reload(); }} />
        </>
      )}</Async>
      {toast.node}
    </Panel>
  );
}

function Lgpd() {
  const ret = useApi<any>(`${P}/lgpd/retencao`);
  const ac = useApi<any>(`${P}/lgpd/acessos?pageSize=30`);
  const [, setParams] = useSearchParams();
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>Base legal, exportação dos dados do titular, anonimização e exclusão ficam na ficha de cada cliente (aba LGPD). Aqui está a visão geral do escritório.</Alert>
      <Panel title="Retenção de clientes encerrados">
        <Async state={ret}>{(d) => <Tabela rows={d.items} vazio="Nenhum cliente encerrado." onRow={(r: any) => setParams({ aba: "clientes", cliente: r.id })} cols={[{ h: "Cliente", r: (r: any) => r.nome }, { h: "Encerrado em", r: (r: any) => fmtDate(r.encerradoEm) }, { h: `Guarda até (${d.retencaoAnos} anos)`, r: (r: any) => fmtDate(r.retencaoAte) }, { h: "Situação", r: (r: any) => (r.anonimizadoEm ? <Tag text="anonimizado" tone="info" /> : <Tag text={r.podeExcluir ? "pode excluir" : "em retenção"} tone={r.podeExcluir ? "warning" : "default"} />) }]} />}</Async>
      </Panel>
      <Panel title="Últimos acessos a dados pessoais" sx={{ mt: 2 }}>
        <Async state={ac}>{(d) => <Tabela rows={d.items} vazio="Sem registros." cols={[{ h: "Quando", r: (r: any) => fmtDateTime(r.em) }, { h: "Quem", r: (r: any) => r.userNome || "—" }, { h: "Cliente", r: (r: any) => r.clienteNome }, { h: "Ação", r: (r: any) => <Tag text={r.acao.replace(/_/g, " ")} /> }]} />}</Async>
      </Panel>
    </>
  );
}

export default function AdminTab() {
  const [params, setParams] = useSearchParams();
  const sub = params.get("v") || "config";
  return (
    <>
      <SubNav value={sub} onChange={(v) => setParams({ aba: "config", v })} items={[{ key: "config", label: "Escritório" }, ...(ehGestao() ? [{ key: "lgpd", label: "LGPD" }] : [])]} />
      {sub === "lgpd" && ehGestao() ? <Lgpd /> : <Config />}
    </>
  );
}
