import { Alert, Box, Button, MenuItem, TextField } from "@mui/material";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Async, FormDialog, Panel, Stat, StatGrid, SubNav, Tabela, brl, fmtDate, num, useApi, useToast } from "./host";
import { Situacao, api, compMes, ehFinanceiro, hojeIso, usePrompt, abrirHtml } from "./kit";

const P = "/contabil/carteira";

export default function HonorariosTab() {
  const [params, setParams] = useSearchParams();
  const sub = params.get("v") || "lista";
  const [comp, setComp] = useState(compMes());
  const [status, setStatus] = useState("");
  const qs = `competencia=${comp}${status ? `&status=${status}` : ""}&pageSize=100`;
  const lista = useApi<any>(sub === "lista" ? `${P}/honorarios?${qs}` : null);
  const resumo = useApi<any>(`${P}/honorarios/resumo?competencia=${comp}`);
  const inad = useApi<any>(sub === "inadimplencia" ? `${P}/honorarios/inadimplencia` : null);
  const rent = useApi<any>(sub === "rentabilidade" ? `${P}/rentabilidade` : null);
  const horas = useApi<any>(sub === "horas" ? `${P}/apontamentos?pageSize=60` : null);
  const clientes = useApi<any>(`${P}/clientes?pageSize=200&status=ATIVO`);
  const [avulso, setAvulso] = useState(false);
  const [baixa, setBaixa] = useState<any>(null);
  const [hora, setHora] = useState(false);
  const toast = useToast();
  const pr = usePrompt();
  const recarregar = () => { lista.reload(); resumo.reload(); inad.reload(); };
  const optClientes = (clientes.data?.items || []).map((c: any) => ({ value: c.id, label: c.nome }));
  return (
    <>
      <SubNav value={sub} onChange={(v) => setParams({ aba: "honorarios", v })} items={[{ key: "lista", label: "Honorários" }, { key: "inadimplencia", label: "Inadimplência" }, { key: "rentabilidade", label: "Rentabilidade" }, { key: "horas", label: "Horas apontadas" }]} />
      {sub === "lista" && (
        <>
          <Async state={resumo}>{(r) => <StatGrid min={150}><Stat label="Emitido" value={brl(r.emitido)} hint={`${r.quantidade} cobrança(s)`} /><Stat label="Recebido" value={brl(r.recebido)} tone="success" /><Stat label="A vencer" value={brl(r.aVencer)} /><Stat label="Em atraso" value={brl(r.atrasado)} tone={r.atrasado > 0 ? "error" : "default"} hint={`${num(r.inadimplenciaPct, 1)}% do emitido`} /></StatGrid>}</Async>
          <Panel title="Cobranças de honorários" subtitle="A geração mensal cria uma cobrança por contrato vigente (aplicando o reajuste anual) e não duplica." actions={ehFinanceiro() ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="contained" onClick={() => toast.run(async () => { const r = await api.post("/honorarios/gerar", { competencia: comp }); toast.ok(`Competência ${r.competencia}: ${r.criados} criada(s), ${r.jaExistiam} já existia(m), valor ${brl(r.valorTotal)}.`); }, "", recarregar, `Gerar os honorários de ${comp}?`)}>Gerar {comp}</Button>
              <Button size="small" onClick={() => setAvulso(true)}>Cobrança avulsa</Button>
            </Box>) : null}>
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              <TextField size="small" type="month" label="Competência" value={comp} onChange={(e) => setComp(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" select label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}><MenuItem value="">Todas</MenuItem><MenuItem value="ABERTO">A vencer</MenuItem><MenuItem value="ATRASADO">Em atraso</MenuItem><MenuItem value="PAGO">Pagas</MenuItem><MenuItem value="CANCELADO">Canceladas</MenuItem></TextField>
            </Box>
            <Async state={lista}>{(d) => <Tabela rows={d.items} vazio="Nenhuma cobrança nesta competência. Gere os honorários do mês." cols={[{ h: "Cliente", r: (r: any) => r.clienteNome || "—" }, { h: "Competência", r: (r: any) => r.competencia }, { h: "Vencimento", r: (r: any) => fmtDate(r.vencimento) }, { h: "Valor", r: (r: any) => brl(r.valor) }, { h: "Situação", r: (r: any) => <Situacao value={r.situacao} /> }, { h: "Atraso", r: (r: any) => (r.diasAtraso ? `${r.diasAtraso} dia(s)` : "—"), hideMobile: true },
              { h: "", r: (r: any) => ehFinanceiro() && r.status === "ABERTO" ? <><Button size="small" color="success" onClick={() => setBaixa(r)}>Baixar</Button><Button size="small" color="error" onClick={async () => { const m = await pr.ask("Motivo do cancelamento", { min: 3 }); if (m) toast.run(() => api.post(`/honorarios/${r.id}/cancelar`, { motivo: m }), "Cobrança cancelada.", recarregar); }}>Cancelar</Button></> : null }]} />}</Async>
          </Panel>
        </>
      )}
      {sub === "inadimplencia" && (
        <Panel title="Inadimplência por cliente" actions={<Button size="small" onClick={() => toast.run(() => abrirHtml("/relatorios/inadimplencia?format=html"))}>Imprimir</Button>}>
          <Async state={inad}>{(d) => <><Alert severity={d.total ? "warning" : "success"} sx={{ mb: 1 }}>Total em atraso: <b>{brl(d.total)}</b> em {d.items.length} cliente(s).</Alert><Tabela rows={d.items.map((i: any) => ({ ...i, id: i.clienteId }))} vazio="Nenhum cliente inadimplente." cols={[{ h: "Cliente", r: (r: any) => r.clienteNome }, { h: "Responsável", r: (r: any) => r.responsavelNome || "—" }, { h: "Títulos", r: (r: any) => r.titulos }, { h: "Valor", r: (r: any) => brl(r.valor) }, { h: "Mais antigo", r: (r: any) => `${r.diasAtraso} dia(s)` }, { h: "Faixa", r: (r: any) => r.faixa }]} /></>}</Async>
        </Panel>
      )}
      {sub === "rentabilidade" && (
        <Panel title="Rentabilidade por cliente" subtitle="Margem estimada = honorário vigente − horas apontadas × custo-hora (Configurações)." actions={<Button size="small" onClick={() => toast.run(() => abrirHtml("/relatorios/rentabilidade?format=html"))}>Imprimir</Button>}>
          <Async state={rent}>{(d) => <><Alert severity="info" sx={{ mb: 1 }}>{d.aviso}</Alert><Tabela rows={d.items.map((i: any) => ({ ...i, id: i.clienteId }))} vazio="Sem clientes ativos." cols={[{ h: "#", r: (r: any) => d.items.indexOf(d.items.find((x: any) => x.clienteId === r.clienteId)) + 1 }, { h: "Cliente", r: (r: any) => r.cliente }, { h: "Honorário/mês", r: (r: any) => brl(r.receitaMensal) }, { h: "Horas/mês", r: (r: any) => (r.semApontamento ? "sem apontamento" : num(r.horasMes, 1)) }, { h: "Custo/mês", r: (r: any) => brl(r.custoMensal) }, { h: "Margem", r: (r: any) => <b style={{ color: r.margem < 0 ? "#d32f2f" : undefined }}>{brl(r.margem)}</b> }, { h: "Margem %", r: (r: any) => (r.margemPct === null ? "—" : `${num(r.margemPct, 0)}%`) }, { h: "R$/hora", r: (r: any) => (r.receitaPorHora === null ? "—" : brl(r.receitaPorHora)) }]} /></>}</Async>
        </Panel>
      )}
      {sub === "horas" && (
        <Panel title="Apontamento de horas" subtitle="Base do cálculo de esforço e rentabilidade por cliente." actions={<Button size="small" variant="contained" onClick={() => setHora(true)}>Apontar horas</Button>}>
          <Async state={horas}>{(d) => <><Alert severity="info" sx={{ mb: 1 }}>Total listado: <b>{num(d.totalMinutos / 60, 1)} h</b></Alert><Tabela rows={d.items} vazio="Nenhum apontamento." cols={[{ h: "Data", r: (r: any) => fmtDate(r.data) }, { h: "Cliente", r: (r: any) => r.clienteNome || "—" }, { h: "Quem", r: (r: any) => r.userNome || "—" }, { h: "Tempo", r: (r: any) => `${Math.floor(r.minutos / 60)}h${String(r.minutos % 60).padStart(2, "0")}` }, { h: "Categoria", r: (r: any) => r.categoria }, { h: "Descrição", r: (r: any) => r.descricao || "—", hideMobile: true },
            { h: "", r: (r: any) => <Button size="small" color="error" onClick={() => toast.run(() => api.del(`/apontamentos/${r.id}`), "Apontamento removido.", horas.reload, "Remover este apontamento?")}>Remover</Button> }]} /></>}</Async>
        </Panel>
      )}
      <FormDialog open={avulso} title="Cobrança avulsa" fields={[{ key: "clienteId", label: "Cliente", type: "select", options: optClientes, required: true }, { key: "competencia", label: "Competência (AAAA-MM)", required: true, def: comp }, { key: "descricao", label: "Descrição" }, { key: "valor", label: "Valor", type: "number", required: true }, { key: "vencimento", label: "Vencimento", type: "date", def: hojeIso(10) }]}
        onClose={() => setAvulso(false)} onSubmit={async (b) => { await api.post("/honorarios", { ...b, vencimento: b.vencimento ? String(b.vencimento).slice(0, 10) : undefined }); toast.ok("Cobrança lançada."); recarregar(); }} />
      <FormDialog open={!!baixa} title={`Baixar honorário de ${baixa?.clienteNome || ""}`} fields={[{ key: "valorPago", label: "Valor recebido", type: "number", def: baixa?.valor }, { key: "forma", label: "Forma", type: "select", options: ["PIX", "BOLETO", "TRANSFERENCIA", "CARTAO", "DINHEIRO"], def: "PIX" }, { key: "pagoEm", label: "Data do pagamento", type: "date", def: hojeIso() }]}
        onClose={() => setBaixa(null)} onSubmit={async (b) => { await api.post(`/honorarios/${baixa.id}/baixar`, { ...b, pagoEm: b.pagoEm ? String(b.pagoEm).slice(0, 10) : undefined }); toast.ok("Pagamento registrado."); recarregar(); }} />
      <FormDialog open={hora} title="Apontar horas" fields={[{ key: "clienteId", label: "Cliente", type: "select", options: optClientes, required: true }, { key: "data", label: "Data", type: "date", def: hojeIso() }, { key: "minutos", label: "Minutos", type: "number", required: true, def: 60 }, { key: "categoria", label: "Categoria", type: "select", options: ["GERAL", "FECHAMENTO", "FISCAL", "FOLHA", "IR", "ATENDIMENTO"], def: "GERAL" }, { key: "descricao", label: "Descrição", type: "textarea" }]}
        onClose={() => setHora(false)} onSubmit={async (b) => { await api.post("/apontamentos", { ...b, data: b.data ? String(b.data).slice(0, 10) : undefined }); toast.ok("Horas apontadas."); horas.reload(); }} />
      {toast.node}{pr.node}
    </>
  );
}
