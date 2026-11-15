import { Alert, Box, Button, Checkbox, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Async, FormDialog, Panel, Stat, StatGrid, SubNav, Tabela, Tag, brl, num, useApi, useToast } from "./host";
import { ROTULO_CARGO, Situacao, api, ehGestao } from "./kit";

const P = "/contabil/carteira";

function Distribuicao() {
  const dist = useApi<any>(`${P}/carteira/distribuicao`);
  const opt = useApi<any>(`${P}/clientes/opcoes`);
  const [de, setDe] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const lista = useApi<any>(de ? `${P}/clientes?pageSize=200&responsavelId=${de}` : `${P}/clientes?pageSize=200&semResponsavel=1`);
  const [dest, setDest] = useState(false);
  const [cap, setCap] = useState<any>(null);
  const toast = useToast();
  const equipe = (opt.data?.equipe || []).filter((u: any) => ["CONTADOR", "ANALISTA_CONTABIL", "GESTOR_CONTABIL", "ADMIN", "OWNER"].includes(u.cargo));
  const recarregar = () => { dist.reload(); lista.reload(); setSel([]); };
  return (
    <>
      <Panel title="Distribuição da carteira por responsável" subtitle="Clientes ativos × capacidade de cada contador.">
        <Async state={dist}>{(d) => <>
          {d.semResponsavel > 0 ? <Alert severity="warning" sx={{ mb: 1 }}>{d.semResponsavel} cliente(s) sem responsável.</Alert> : null}
          <Tabela rows={d.responsaveis.map((r: any) => ({ ...r, id: r.userId }))} vazio="Sem equipe cadastrada." cols={[{ h: "Responsável", r: (r: any) => <>{r.nome} <Tag text={ROTULO_CARGO[r.cargo] || r.cargo} /></> }, { h: "Ativos", r: (r: any) => r.ativos }, { h: "Capacidade", r: (r: any) => r.capacidade },
            { h: "Ocupação", r: (r: any) => <Tag text={`${r.ocupacaoPct ?? 0}%`} tone={r.sobrecarga ? "error" : r.ocupacaoPct >= 85 ? "warning" : "success"} /> }, { h: "Tarefas abertas", r: (r: any) => r.tarefasAbertas }, { h: "MRR sob responsabilidade", r: (r: any) => brl(r.mrr) },
            { h: "", r: (r: any) => ehGestao() ? <Button size="small" onClick={() => setCap(r)}>Capacidade</Button> : null }]} />
        </>}</Async>
      </Panel>
      {ehGestao() ? (
        <Panel title="Reatribuição em lote" subtitle="Escolha de quem tirar, marque os clientes e defina o novo responsável." sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
            <TextField size="small" select label="Carteira de" value={de} onChange={(e) => { setDe(e.target.value); setSel([]); }} sx={{ minWidth: 260 }}><MenuItem value="">Sem responsável</MenuItem>{equipe.map((u: any) => <MenuItem key={u.id} value={u.id}>{u.nome}</MenuItem>)}</TextField>
            <Button variant="contained" disabled={!sel.length} onClick={() => setDest(true)}>Reatribuir {sel.length} selecionado(s)</Button>
          </Box>
          <Async state={lista}>{(d) => <Tabela rows={d.items} vazio="Nenhum cliente nesta carteira." cols={[{ h: "", r: (r: any) => <Checkbox size="small" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /> }, { h: "Cliente", r: (r: any) => r.nome }, { h: "Situação", r: (r: any) => <Situacao value={r.status} /> }, { h: "Regime", r: (r: any) => r.regime || "—" }]} />}</Async>
        </Panel>
      ) : null}
      <FormDialog open={dest} title={`Reatribuir ${sel.length} cliente(s)`} fields={[{ key: "responsavelId", label: "Novo contador responsável", type: "select", options: equipe.map((u: any) => ({ value: u.id, label: u.nome })) }, { key: "analistaId", label: "Novo analista (opcional)", type: "select", options: equipe.map((u: any) => ({ value: u.id, label: u.nome })) }, { key: "motivo", label: "Motivo", type: "textarea", required: true }]}
        onClose={() => setDest(false)} onSubmit={async (b) => { const r = await api.post("/carteira/reatribuir", { ...b, clienteIds: sel }); toast.ok(`${r.reatribuidos} cliente(s) reatribuído(s).${r.avisos.length ? " Atenção: " + r.avisos.join(" ") : ""}`); recarregar(); }} />
      <FormDialog open={!!cap} title={`Capacidade de ${cap?.nome}`} fields={[{ key: "capacidade", label: "Clientes ativos que consegue atender", type: "number", required: true, def: cap?.capacidade }]} onClose={() => setCap(null)} onSubmit={async (b) => { await api.put("/carteira/capacidade", { userId: cap.userId, capacidade: b.capacidade }); toast.ok("Capacidade ajustada."); dist.reload(); }} />
      {toast.node}
    </>
  );
}

function Saude() {
  const [nivel, setNivel] = useState("");
  const st = useApi<any>(`${P}/carteira/saude${nivel ? `?nivel=${nivel}` : ""}`);
  const [, setParams] = useSearchParams();
  return (
    <Panel title="Saúde da carteira" subtitle="Pendências, guias, documentos faltando e risco de inadimplência/fiscal por cliente ativo.">
      <Async state={st}>{(d) => <>
        <StatGrid min={140}><Stat label="Clientes ativos" value={d.resumo.total} /><Stat label="Saudáveis" value={d.resumo.saudaveis} tone="success" /><Stat label="Atenção" value={d.resumo.atencao} tone="warning" /><Stat label="Em risco" value={d.resumo.risco} tone="error" /></StatGrid>
        {d.fiscal?.simulado ? <Alert severity="info" sx={{ mb: 1 }}>O módulo fiscal não está conectado: guias e pendências vêm da camada local do escritório (lançamento manual).</Alert> : null}
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>{["", "RISCO", "ATENCAO", "SAUDAVEL"].map((n) => <Button key={n} size="small" variant={nivel === n ? "contained" : "outlined"} onClick={() => setNivel(n)}>{n || "Todos"}</Button>)}</Box>
        <Tabela rows={d.items.map((i: any) => ({ ...i, id: i.clienteId }))} vazio="Nenhum cliente neste nível." onRow={(r: any) => setParams({ aba: "clientes", cliente: r.clienteId })} cols={[{ h: "Cliente", r: (r: any) => r.cliente }, { h: "Responsável", r: (r: any) => r.responsavelNome || "—" }, { h: "Saúde", r: (r: any) => <><b>{r.score}</b> <Situacao value={r.nivel} /></> }, { h: "Inadimplência", r: (r: any) => <Situacao value={r.riscoInadimplencia} /> }, { h: "Fiscal", r: (r: any) => <Situacao value={r.riscoFiscal} /> },
          { h: "Motivos", r: (r: any) => <Typography variant="caption">{r.motivos.join(" · ") || "—"}</Typography>, hideMobile: true }]} />
        <Typography variant="caption" color="text.secondary">Pontuação {num(100, 0)} = sem alertas. Clique para abrir a ficha.</Typography>
      </>}</Async>
    </Panel>
  );
}

export default function CarteiraTab() {
  const [params, setParams] = useSearchParams();
  const sub = params.get("v") || "distribuicao";
  return (
    <>
      <SubNav value={sub} onChange={(v) => setParams({ aba: "carteira", v })} items={[{ key: "distribuicao", label: "Distribuição e capacidade" }, { key: "saude", label: "Saúde dos clientes" }]} />
      {sub === "saude" ? <Saude /> : <Distribuicao />}
    </>
  );
}
