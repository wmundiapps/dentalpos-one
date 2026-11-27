import { Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { StatusChip } from "../EduResourcePage";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, FormDialog, Panel, Stat, StatGrid, SubNav, Tag, brl, label, num, useApi, useToast } from "../infraestrutura/kit";
import { abrirArquivo, baixarArquivo, useDepartamentos } from "../infraestrutura/cppKit";
import { useAlmoxarifados, useItens } from "./lookups";
import InventarioSup from "./InventarioSup";
import EduResourcePage from "../EduResourcePage";

const tomSit = (s: string) => (s === "RUPTURA" || s === "ABAIXO_MINIMO" ? "error" : s === "REPOR" ? "warning" : s === "EXCESSO" ? "info" : "success") as any;

function Painel() {
  const st = useApi<any>("/suprimentos/almoxarifado/painel");
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid min={150}>
            <Stat label="Valor em estoque" value={brl(d.valorEmEstoque)} /><Stat label="Rupturas" value={d.rupturas} tone={d.rupturas ? "error" : "success"} /><Stat label="Abaixo do mínimo" value={d.abaixoMinimo} tone={d.abaixoMinimo ? "error" : "success"} />
            <Stat label="A repor" value={d.aRepor} tone={d.aRepor ? "warning" : "success"} /><Stat label="Lotes vencendo (30 d)" value={d.lotesVencendo30d} /><Stat label="Devoluções pendentes" value={d.devolucoesPendentes} /><Stat label="Insumos a atender" value={d.requisicoesInsumoParaAtender} />
          </StatGrid>
          <Panel title="Itens críticos">{d.criticos.map((c: any) => <Box key={c.itemId + c.almoxarifadoId} sx={{ display: "flex", gap: 1, py: 0.25, flexWrap: "wrap" }}><Tag text={label(c.situacao)} tone={tomSit(c.situacao)} /><b>{c.codigo}</b> {c.item} — {c.almoxarifado}: saldo {num(c.saldo, 2)} (mín. {c.minimo})</Box>)}{!d.criticos.length && <Typography color="text.secondary">Nenhum item crítico.</Typography>}</Panel>
        </Box>
      )}
    </Async>
  );
}

function Reposicao() {
  const [key, setKey] = useState(0);
  const [edit, setEdit] = useState<any | null>(null);
  const [gerar, setGerar] = useState(false);
  const almox = useAlmoxarifados();
  const itens = useItens();
  const deps = useDepartamentos();
  const toast = useToast();
  return (
    <Box>
      <ListTable path="/suprimentos/almoxarifado/pontos-reposicao" refreshKey={key} searchable={false} filters={[{ key: "almoxarifadoId", label: "Almoxarifado", options: almox }, { key: "situacao", label: "Situação", options: ["RUPTURA", "ABAIXO_MINIMO", "REPOR", "OK", "EXCESSO"] }]}
        toolbar={<><Button onClick={() => setEdit({})}>Definir ponto</Button><Button variant="contained" onClick={() => setGerar(true)}>Gerar requisição de reposição</Button></>}
        columns={[{ key: "almoxarifado", label: "Almoxarifado" }, { key: "item", label: "Item", render: (r) => `${r.codigo} — ${r.item}` }, { key: "saldo", label: "Saldo", align: "right", render: (r) => num(r.saldo, 2) }, { key: "minimo", label: "Mín.", align: "right" }, { key: "pontoPedido", label: "Ponto", align: "right" }, { key: "maximo", label: "Máx.", align: "right", render: (r) => r.maximo ?? "—" },
          { key: "situacao", label: "Situação", render: (r) => <Tag text={label(r.situacao)} tone={tomSit(r.situacao)} /> }, { key: "quantidadeSugerida", label: "Repor", align: "right", render: (r) => r.quantidadeSugerida || "—" }]}
        actions={(r) => <Button size="small" onClick={() => setEdit(r)}>Ajustar</Button>} />
      <FormDialog open={!!edit} title="Ponto de reposição por almoxarifado" onClose={() => setEdit(null)} initial={edit}
        fields={[{ key: "almoxarifadoId", label: "Almoxarifado", type: "select", options: almox, required: true }, { key: "itemId", label: "Item", type: "select", options: itens, required: true }, { key: "minimo", label: "Estoque mínimo", type: "number", required: true }, { key: "pontoPedido", label: "Ponto de pedido", type: "number", required: true }, { key: "maximo", label: "Máximo", type: "number" }]}
        onSubmit={async (b) => { await eduApi.put("/suprimentos/almoxarifado/pontos-reposicao", b); toast.ok("Ponto de reposição salvo."); setKey((k) => k + 1); }} />
      <FormDialog open={gerar} title="Gerar requisição de reposição" submitLabel="Gerar" onClose={() => setGerar(false)}
        fields={[{ key: "almoxarifadoId", label: "Almoxarifado", type: "select", options: almox, required: true }, { key: "departamentoId", label: "Departamento (centro de custo)", type: "select", options: deps, required: true }]}
        onSubmit={async (b) => { const r: any = await eduApi.post("/suprimentos/almoxarifado/pontos-reposicao/gerar-requisicao", b); toast.ok(`Requisição ${r.numero} criada em rascunho.`); }} />
      {toast.node}
    </Box>
  );
}

function Relatorios() {
  const [de, setDe] = useState("");
  const toast = useToast();
  const q = de ? `?de=${de}` : "";
  const itens: Array<[string, string]> = [["Posição valorizada", "posicao"], ["Consumo por departamento", "consumo-departamento"], ["Movimentação", "movimentacao"], ["Itens parados", "itens-parados"], ["Divergências de recebimento", "divergencias-recebimento"]];
  return (
    <Panel title="Relatórios do almoxarifado" subtitle="Baixe em CSV (abre no Excel).">
      <TextField size="small" type="date" label="A partir de" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ mb: 2 }} />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {itens.map(([t, p]) => <Button key={p} variant="outlined" onClick={() => toast.run(() => baixarArquivo(`/suprimentos/almoxarifado/relatorios/${p}${q}${q ? "&" : "?"}format=csv`, `${p}.csv`), "Arquivo gerado.")}>{t}</Button>)}
        <Button variant="outlined" onClick={() => toast.run(() => baixarArquivo(`/suprimentos/almoxarifado/requisicoes-departamento${q}${q ? "&" : "?"}format=csv`, "requisicoes-departamento.csv"), "Arquivo gerado.")}>Requisições por departamento</Button>
      </Box>
      {toast.node}
    </Panel>
  );
}

function ReqDepartamento() {
  const st = useApi<any>("/suprimentos/almoxarifado/requisicoes-departamento");
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Panel title="Resumo por departamento">{d.resumo.map((x: any) => <Box key={x.departamentoId} sx={{ display: "flex", gap: 2, flexWrap: "wrap", py: 0.25 }}><b>{x.departamento}</b><span>{x.requisicoes} requisição(ões)</span><span>{brl(x.valorEstimado)}</span><span>{x.atendidas} atendida(s)</span><span>{x.abertas} em aberto</span></Box>)}{!d.resumo.length && <Typography color="text.secondary">Nenhuma requisição com departamento.</Typography>}</Panel>
          <Box sx={{ overflowX: "auto" }}>{d.requisicoes.slice(0, 50).map((r: any) => <Box key={r.id} sx={{ display: "flex", gap: 1.5, py: 0.25, flexWrap: "wrap" }}><b>{r.numero}</b><span>{r.departamento}</span><Tag text={label(r.tipo)} /><StatusChip value={r.status} /><span>{brl(r.valorEstimado)}</span></Box>)}</Box>
        </Box>
      )}
    </Async>
  );
}

function Contagem() {
  const inv = useApi<any>("/suprimentos/inventarios");
  const [id, setId] = useState("");
  const toast = useToast();
  const lista: any[] = Array.isArray(inv.data) ? inv.data : inv.data?.items || [];
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <InventarioSup />
      <Panel title="Contagem cega, divergências e recontagem" subtitle="Folha para o contador sem o saldo do sistema; relatório de divergências valorizado; recontagem só dos itens divergentes.">
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label="Inventário" value={id} onChange={(e) => setId(e.target.value)} sx={{ minWidth: 260 }}>{lista.map((i: any) => <MenuItem key={i.id} value={i.id}>{label(i.tipo)} — {label(i.status)} — {new Date(i.createdAt).toLocaleDateString("pt-BR")}</MenuItem>)}</TextField>
          <Button disabled={!id} onClick={() => toast.run(() => abrirArquivo("GET", `/suprimentos/almoxarifado/inventarios/${id}/folha-contagem?format=html`), "Folha aberta para impressão.")}>Folha de contagem cega</Button>
          <Button disabled={!id} onClick={() => toast.run(() => baixarArquivo(`/suprimentos/almoxarifado/inventarios/${id}/divergencias?format=csv`, "divergencias-inventario.csv"), "Arquivo gerado.")}>Divergências (CSV)</Button>
          <Button disabled={!id} color="warning" onClick={() => toast.run(() => eduApi.post(`/suprimentos/almoxarifado/inventarios/${id}/recontagem`, {}), "Itens divergentes liberados para recontagem.", inv.reload, "Reabrir a contagem dos itens divergentes?")}>Recontagem</Button>
        </Box>
      </Panel>
      {toast.node}
    </Box>
  );
}

export default function AlmoxarifadoTab() {
  const [sub, setSub] = useState("painel");
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "painel", label: "Painel" }, { key: "reposicao", label: "Ponto de reposição" }, { key: "departamentos", label: "Requisições por departamento" }, { key: "contagem", label: "Inventário e contagem" }, { key: "relatorios", label: "Relatórios" }, { key: "cadastro", label: "Departamentos" }]} />
      {sub === "painel" && <Painel />}
      {sub === "reposicao" && <Reposicao />}
      {sub === "departamentos" && <ReqDepartamento />}
      {sub === "contagem" && <Contagem />}
      {sub === "relatorios" && <Relatorios />}
      {sub === "cadastro" && (
        <EduResourcePage title="Departamentos" description="Usados nas requisições, no almoxarifado e no patrimônio (etiquetas, termos e transferências)." base="/suprimentos" resource="/departamentos"
          columns={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "ativo", label: "Ativo" }]}
          fields={[{ key: "codigo", label: "Código", required: true }, { key: "nome", label: "Nome", required: true }, { key: "centroCustoId", label: "ID do centro de custo" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
    </Box>
  );
}
