import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Bars, FormDialog, Light, Panel, Stat, StatGrid, SubNav, Tag, brl, fmtDate, fmtDateTime, itemsOf, label, num, pct, useApi, useToast } from "../infraestrutura/kit";
import InventarioSup from "./InventarioSup";
import KitsPanel from "./KitsPanel";
import { useAlmoxarifados, useItens } from "./lookups";

const PRIO_TONE: Record<string, "error" | "warning" | "default"> = { CRITICA: "error", ALTA: "warning", NORMAL: "default" };

function Saldos() {
  const almox = useAlmoxarifados();
  const [abaixo, setAbaixo] = useState(false);
  return (
    <ListTable path="/suprimentos/estoque/saldos" extraQuery={abaixo ? { abaixoMinimo: "true" } : {}}
      filters={[{ key: "almoxarifadoId", label: "Almoxarifado", options: almox }]}
      toolbar={<FormControlLabel control={<Checkbox checked={abaixo} onChange={(e) => setAbaixo(e.target.checked)} />} label="Somente abaixo do mínimo" />}
      columns={[
        { key: "item", label: "Item", render: (r) => <span><b>{r.item?.codigo}</b> {r.item?.nome}</span> }, { key: "almoxarifado", label: "Almoxarifado", render: (r) => r.almoxarifado?.nome || "—" },
        { key: "quantidade", label: "Saldo", align: "right", render: (r) => `${num(r.quantidade, 3)} ${r.item?.unidade || ""}` }, { key: "minimo", label: "Mínimo", align: "right", render: (r) => num(r.item?.estoqueMinimo, 3) },
        { key: "custoMedio", label: "Custo médio", align: "right", render: (r) => brl(r.custoMedio) }, { key: "valorTotal", label: "Valor", align: "right", render: (r) => brl(r.valorTotal) },
        { key: "abaixoMinimo", label: "Situação", render: (r) => <Light tone={r.quantidade <= 0 ? "error" : r.abaixoMinimo ? "warning" : "success"} text={r.quantidade <= 0 ? "Zerado" : r.abaixoMinimo ? "Abaixo do mínimo" : "Normal"} /> },
      ]} />
  );
}

function Movimentacoes() {
  const [key, setKey] = useState(0);
  const [nova, setNova] = useState(false);
  const itens = useItens();
  const almox = useAlmoxarifados();
  const toast = useToast();
  return (
    <Box>
      <ListTable path="/suprimentos/estoque/movimentacoes" refreshKey={key} searchable={false}
        filters={[{ key: "tipo", label: "Tipo", options: ["ENTRADA", "SAIDA", "TRANSFERENCIA", "AJUSTE", "PERDA", "DEVOLUCAO"] }, { key: "almoxarifadoId", label: "Almoxarifado", options: almox }]}
        toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNova(true)}>Nova movimentação</Button>}
        columns={[
          { key: "createdAt", label: "Data", render: (r) => fmtDateTime(r.createdAt) }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} tone={r.tipo === "ENTRADA" || r.tipo === "DEVOLUCAO" ? "success" : r.tipo === "PERDA" ? "error" : "default"} /> },
          { key: "item", label: "Item", render: (r) => r.item?.nome || r.itemId }, { key: "quantidade", label: "Qtd", align: "right", render: (r) => num(r.quantidade, 3) },
          { key: "valorTotal", label: "Valor", align: "right", render: (r) => brl(r.valorTotal) }, { key: "origemTipo", label: "Origem", render: (r) => label(r.origemTipo) }, { key: "motivo", label: "Motivo" },
        ]} />
      <FormDialog open={nova} onClose={() => setNova(false)} title="Nova movimentação de estoque"
        fields={[
          { key: "tipo", label: "Tipo", type: "select", options: ["ENTRADA", "SAIDA", "TRANSFERENCIA", "AJUSTE", "PERDA"], required: true }, { key: "itemId", label: "Item", type: "select", options: itens, required: true },
          { key: "almoxarifadoId", label: "Almoxarifado (origem)", type: "select", options: almox, required: true }, { key: "almoxarifadoDestinoId", label: "Almoxarifado de destino (transferência)", type: "select", options: almox },
          { key: "quantidade", label: "Quantidade", type: "number", required: true }, { key: "sentido", label: "Sentido do ajuste", type: "select", options: [{ value: "1", label: "Aumenta o saldo" }, { value: "-1", label: "Reduz o saldo" }] },
          { key: "custoUnitario", label: "Custo unitário (entrada)", type: "number" }, { key: "loteNumero", label: "Lote" }, { key: "validade", label: "Validade do lote", type: "date" }, { key: "motivo", label: "Motivo (obrigatório em ajuste/perda)", full: true },
        ]}
        onSubmit={async (b) => { await eduApi.post("/suprimentos/estoque/movimentacoes", { ...b, sentido: b.sentido ? Number(b.sentido) : undefined }); toast.ok("Movimentação registrada."); setKey((k) => k + 1); }} />
      {toast.node}
    </Box>
  );
}

function Reposicao() {
  const [key, setKey] = useState(0);
  const st = useApi<any>(`/suprimentos/estoque/reposicao?k=${key}`);
  const [sel, setSel] = useState<string[]>([]);
  const toast = useToast();
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Async state={st}>
      {(d) => {
        const rows = itemsOf(d);
        return (
          <Panel title="Sugestão de reposição" subtitle="Itens no ou abaixo do ponto de pedido, considerando consumo, prazo de reposição e pedidos em andamento."
            actions={<Button variant="contained" disabled={!rows.length} onClick={() => toast.run(() => eduApi.post("/suprimentos/estoque/reposicao/gerar-requisicao", sel.length ? { itemIds: sel } : {}), sel.length ? "Requisição gerada para os itens selecionados." : "Requisição de reposição gerada.", () => { setSel([]); setKey((k) => k + 1); }, "Gerar requisição de compra com os itens sugeridos?")}>Gerar requisição{sel.length ? ` (${sel.length})` : ""}</Button>}>
            {!rows.length ? <Alert severity="success">Nenhum item precisa de reposição agora.</Alert> : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell /><TableCell>Item</TableCell><TableCell align="right">Saldo</TableCell><TableCell align="right">Em pedido</TableCell><TableCell align="right">Ponto de pedido</TableCell><TableCell align="right">Cobertura</TableCell><TableCell align="right">Sugerido</TableCell><TableCell>Prioridade</TableCell></TableRow></TableHead>
                  <TableBody>
                    {rows.map((r: any) => (
                      <TableRow key={r.itemId} hover>
                        <TableCell padding="checkbox"><Checkbox size="small" checked={sel.includes(r.itemId)} onChange={() => toggle(r.itemId)} /></TableCell>
                        <TableCell>{r.nome || r.itemId}</TableCell><TableCell align="right">{num(r.saldo, 3)}</TableCell><TableCell align="right">{num(r.emPedido, 3)}</TableCell><TableCell align="right">{num(r.pontoPedido, 3)}</TableCell>
                        <TableCell align="right">{r.diasCobertura == null ? "—" : `${num(r.diasCobertura, 0)} d`}</TableCell><TableCell align="right"><b>{num(r.quantidadeSugerida, 3)}</b></TableCell>
                        <TableCell><Tag text={r.prioridade} tone={PRIO_TONE[r.prioridade]} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Panel>
        );
      }}
    </Async>
  );
}

function CurvaABC() {
  const [base, setBase] = useState("CONSUMO");
  const st = useApi<any>(`/suprimentos/estoque/curva-abc?base=${base}`);
  const COR: Record<string, string> = { A: "#d32f2f", B: "#ed6c02", C: "#2e7d32" };
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TextField select size="small" label="Base de cálculo" value={base} onChange={(e) => setBase(e.target.value)} sx={{ width: 240 }}>
        <MenuItem value="CONSUMO">Consumo (últimos 180 dias)</MenuItem><MenuItem value="ESTOQUE">Valor em estoque</MenuItem>
      </TextField>
      <Async state={st}>
        {(d) => (
          <>
            <StatGrid min={140}>{["A", "B", "C"].map((c) => <Stat key={c} label={`Classe ${c}`} value={`${d.totais?.[c] ?? 0} item(ns)`} tone={c === "A" ? "error" : c === "B" ? "warning" : "success"} />)}</StatGrid>
            <Panel title="Curva ABC (Pareto)" subtitle="Classe A concentra ~80% do valor; B até 95%; C o restante.">
              <Bars format={(v) => pct(v)} items={(d.itens || []).slice(0, 15).map((i: any) => ({ label: `${i.codigo || ""} ${i.nome || i.id}`.trim(), value: (i.participacao || 0) * 100, color: COR[i.classe], hint: `Classe ${i.classe} · acumulado ${pct((i.acumulado || 0) * 100)} · ${brl(i.valor)}` }))} empty="Sem movimentação para calcular a curva." />
            </Panel>
          </>
        )}
      </Async>
    </Box>
  );
}

function Lotes() {
  const [dias, setDias] = useState("");
  const st = useApi<any>(`/suprimentos/estoque/lotes${dias ? `?vencendoEmDias=${dias}` : ""}`);
  const TONE: Record<string, "error" | "warning" | "success" | "default"> = { VENCIDO: "error", CRITICO: "error", ATENCAO: "warning", OK: "success", SEM_VALIDADE: "default" };
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TextField select size="small" label="Filtro de validade" value={dias} onChange={(e) => setDias(e.target.value)} sx={{ width: 240 }}>
        <MenuItem value="">Todos os lotes</MenuItem><MenuItem value="30">Vencem em 30 dias</MenuItem><MenuItem value="60">Vencem em 60 dias</MenuItem><MenuItem value="90">Vencem em 90 dias</MenuItem>
      </TextField>
      <Async state={st}>
        {(d) => (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>Item</TableCell><TableCell>Lote</TableCell><TableCell align="right">Qtd</TableCell><TableCell>Validade</TableCell><TableCell>Situação</TableCell></TableRow></TableHead>
              <TableBody>
                {itemsOf(d).map((l: any) => <TableRow key={l.id} hover><TableCell>{l.item?.nome}</TableCell><TableCell>{l.numero || l.loteNumero || "—"}</TableCell><TableCell align="right">{num(l.quantidade, 3)}</TableCell><TableCell>{fmtDate(l.validade)}</TableCell><TableCell><Light tone={TONE[l.statusValidade] || "default"} text={label(l.statusValidade)} /></TableCell></TableRow>)}
                {!itemsOf(d).length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ textAlign: "center", py: 2 }}>Nenhum lote encontrado.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}
      </Async>
    </Box>
  );
}

export default function EstoqueTab() {
  const [sub, setSub] = useState("saldos");
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "saldos", label: "Saldos" }, { key: "mov", label: "Movimentações" }, { key: "reposicao", label: "Reposição" }, { key: "abc", label: "Curva ABC" }, { key: "lotes", label: "Lotes e validade" }, { key: "inventarios", label: "Inventários" }, { key: "kits", label: "Kits de insumos" }]} />
      {sub === "saldos" && <Saldos />}{sub === "mov" && <Movimentacoes />}{sub === "reposicao" && <Reposicao />}{sub === "abc" && <CurvaABC />}{sub === "lotes" && <Lotes />}
      {sub === "inventarios" && <InventarioSup />}{sub === "kits" && <KitsPanel />}
    </Box>
  );
}
