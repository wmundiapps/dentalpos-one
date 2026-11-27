import { Alert, Box, Button, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import EduResourcePage, { StatusChip } from "../EduResourcePage";
import { EduApiError, eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { Async, Bars, FormDialog, Panel, Stat, StatGrid, SubNav, Tag, brl, fmtDateTime, label, num, openHtml, useApi, useToast } from "../infraestrutura/kit";
import { useAlmoxarifados, useItens } from "./lookups";
import PdvPanel, { AbrirCaixa, CANAIS, CaixaPanel } from "./PdvPanel";

function Vendas() {
  const [key, setKey] = useState(0);
  const [dev, setDev] = useState<any | null>(null);
  const toast = useToast();
  return (
    <Box>
      <ListTable path="/suprimentos/vendas" refreshKey={key} searchable={false}
        filters={[{ key: "status", label: "Situação", options: ["CONCLUIDA", "PARCIALMENTE_DEVOLVIDA", "DEVOLVIDA", "CANCELADA"] }, { key: "tipo", label: "Tipo", options: ["A_VISTA", "LANCADA_ALUNO"] }]}
        columns={[
          { key: "numero", label: "Venda" }, { key: "createdAt", label: "Data", render: (r) => fmtDateTime(r.createdAt) }, { key: "tipo", label: "Tipo", render: (r) => <Tag text={label(r.tipo)} /> },
          { key: "formaPagamento", label: "Pagamento", render: (r) => label(r.formaPagamento) }, { key: "itens", label: "Itens", render: (r) => (r.itens || []).length },
          { key: "total", label: "Total", align: "right", render: (r) => brl(r.total) }, { key: "totalDevolvido", label: "Devolvido", align: "right", render: (r) => (r.totalDevolvido ? brl(r.totalDevolvido) : "—") }, { key: "status", label: "Situação", render: (r) => <StatusChip value={r.status} /> },
        ]}
        actions={(r) => (
          <>
            <Button size="small" onClick={() => toast.run(() => openHtml(`/suprimentos/vendas/${r.id}/recibo`), "Recibo aberto em nova aba.")}>Recibo</Button>
            {["CONCLUIDA", "PARCIALMENTE_DEVOLVIDA"].includes(r.status) && <Button size="small" color="warning" onClick={() => setDev(r)}>Devolução</Button>}
          </>
        )} />
      {dev && <Devolucao venda={dev} onClose={() => setDev(null)} onDone={() => { toast.ok("Devolução registrada."); setKey((k) => k + 1); }} />}
      {toast.node}
    </Box>
  );
}

function Devolucao({ venda, onClose, onDone }: { venda: any; onClose: () => void; onDone: () => void }) {
  const pend = (venda.itens || []).filter((i: any) => i.quantidade - i.quantidadeDevolvida > 0);
  return (
    <FormDialog open title={`Devolução — venda ${venda.numero}`} onClose={onClose} submitLabel="Registrar devolução"
      fields={[{ key: "motivo", label: "Motivo da devolução", required: true, full: true }, ...pend.map((i: any) => ({ key: `q_${i.id}`, label: `${i.descricao} (máx. ${num(i.quantidade - i.quantidadeDevolvida, 3)})`, type: "number" as const }))]}
      onSubmit={async (b) => {
        const itens = pend.filter((i: any) => Number(b[`q_${i.id}`]) > 0).map((i: any) => ({ vendaItemId: i.id, quantidade: Number(b[`q_${i.id}`]) }));
        if (!itens.length) throw new Error("Informe a quantidade devolvida de ao menos um item.");
        await eduApi.post(`/suprimentos/vendas/${venda.id}/devolucao`, { motivo: b.motivo, itens });
        onDone();
      }} />
  );
}

function Relatorio() {
  const st = useApi<any>("/suprimentos/vendas-relatorio");
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid>
            <Stat label="Receita líquida (30 dias)" value={brl(d.receita)} tone="success" /><Stat label="Vendas" value={num(d.vendas, 0)} hint={`Ticket médio ${brl(d.ticketMedio)}`} />
            <Stat label="Custo da mercadoria" value={brl(d.custoMercadoria)} /><Stat label="Margem" value={brl(d.margem)} tone={d.margem >= 0 ? "success" : "error"} /><Stat label="Devolvido" value={brl(d.devolvido)} />
          </StatGrid>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Panel title="Receita por dia"><Bars format={brl} items={Object.entries(d.porDia || {}).sort().slice(-14).map(([k, v]: any) => ({ label: k.split("-").reverse().join("/"), value: v }))} /></Panel>
            <Panel title="Por forma de pagamento"><Bars format={brl} items={Object.entries(d.porFormaPagamento || {}).map(([k, v]: any) => ({ label: label(k), value: v, color: "#7b1fa2" }))} /></Panel>
            <Panel title="Por canal"><Bars format={brl} items={Object.entries(d.porCanal || {}).map(([k, v]: any) => ({ label: label(k), value: v, color: "#ed6c02" }))} /></Panel>
            <Panel title="Mais vendidos"><Bars format={brl} items={(d.maisVendidos || []).slice(0, 8).map((p: any) => ({ label: p.descricao, value: p.receita, hint: `${num(p.quantidade, 0)} un.`, color: "#2e7d32" }))} /></Panel>
          </Box>
        </Box>
      )}
    </Async>
  );
}

export default function VendasTab() {
  const [sub, setSub] = useState("pdv");
  const [caixa, setCaixa] = useState<any | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const itens = useItens();
  const almox = useAlmoxarifados();
  const loadCaixa = useCallback(async () => {
    setErro(null);
    try { setCaixa(await eduApi.get("/suprimentos/caixa/atual")); }
    catch (e: any) { if (e instanceof EduApiError && e.status === 404) setCaixa(null); else { setErro(e?.message || "Falha ao consultar o caixa."); setCaixa(null); } }
  }, []);
  useEffect(() => { loadCaixa(); }, [loadCaixa]);
  return (
    <Box>
      <SubNav value={sub} onChange={setSub} items={[{ key: "pdv", label: "PDV" }, { key: "caixa", label: "Caixa" }, { key: "vendas", label: "Vendas" }, { key: "produtos", label: "Produtos" }, { key: "relatorio", label: "Relatório" }]} />
      {erro && <Alert severity="warning" sx={{ mb: 2 }}>{erro}</Alert>}
      {(sub === "pdv" || sub === "caixa") && (caixa === undefined ? <Typography color="text.secondary">Consultando caixa…</Typography> : caixa === null ? <AbrirCaixa onOpened={loadCaixa} /> :
        sub === "pdv" ? <PdvPanel caixa={caixa} onSold={loadCaixa} /> : <CaixaPanel caixa={caixa} reload={loadCaixa} />)}
      {sub === "vendas" && <Vendas />}
      {sub === "produtos" && (
        <EduResourcePage title="Produtos à venda" base="/suprimentos" resource="/produtos" dense filters={[{ key: "canal", label: "Canal", options: CANAIS }]}
          columns={[{ key: "nome", label: "Produto" }, { key: "canal", label: "Canal", render: (r) => label(r.canal) }, { key: "preco", label: "Preço", render: (r) => brl(r.preco) }, { key: "permiteLancarAluno", label: "Lançar ao aluno", render: (r) => (r.permiteLancarAluno ? "Sim" : "Não") }, { key: "ativo", label: "Ativo" }]}
          fields={[{ key: "nome", label: "Nome", required: true }, { key: "itemId", label: "Item de estoque", type: "select", options: itens, required: true, createOnly: true }, { key: "almoxarifadoId", label: "Almoxarifado de saída", type: "select", options: almox, required: true, createOnly: true },
            { key: "canal", label: "Canal", type: "select", options: CANAIS }, { key: "preco", label: "Preço (R$)", type: "number", required: true }, { key: "permiteLancarAluno", label: "Permite lançar na conta do aluno", type: "bool" }, { key: "ativo", label: "Ativo", type: "bool" }]} />
      )}
      {sub === "relatorio" && <Relatorio />}
    </Box>
  );
}
