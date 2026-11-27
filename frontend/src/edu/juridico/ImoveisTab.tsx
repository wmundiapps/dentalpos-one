import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, Typography } from "@mui/material";
import { useState } from "react";
import { AlertaChip, COLORS, DataList, J, Kpi, KpiRow, LoadBox, PromptDialog, ResourceTab, Section, Status, call, fmtDate, fmtMoney, itemsOf, opts, useApi, useJurOptions, useRunner, useToast, type FormField } from "./kit";

function Parcelas({ loc, onClose }: { loc: any; onClose: () => void }) {
  const [rev, setRev] = useState(0);
  const [st, setSt] = useState("ABERTA");
  const l = useApi<any>(`${J}/parcelas?locacaoId=${loc.id}&status=${st}&pageSize=100`, [rev, st]);
  const { toast, node } = useToast();
  const run = useRunner(toast, () => setRev((x) => x + 1));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Parcelas — {loc.codigo}</DialogTitle>
      <DialogContent dividers>
        {node}
        <Tabs value={st} onChange={(_, v) => setSt(v)} variant="scrollable" sx={{ mb: 1 }}>
          {[["ABERTA", "Em aberto"], ["ATRASADA", "Atrasadas"], ["PAGA", "Pagas"], ["CANCELADA", "Canceladas"]].map(([v, t]) => <Tab key={v} value={v} label={t} />)}
        </Tabs>
        <LoadBox loading={l.loading} error={l.error} empty={!itemsOf(l.data).length} emptyText="Nenhuma parcela." onRetry={l.reload}>
          <DataList rows={itemsOf(l.data)} columns={[
            { label: "Competência", primary: true, render: (p: any) => p.competencia }, { label: "Vencimento", render: (p: any) => fmtDate(p.vencimento) }, { label: "Valor", render: (p: any) => fmtMoney(p.valor) },
            { label: "Situação", render: (p: any) => (p.atrasada ? <Status value={`ATRASADA ${p.diasAtraso}d`} /> : <Status value={p.status} />) },
            { label: "Pago em", render: (p: any) => (p.pagoEm ? `${fmtDate(p.pagoEm)} · ${fmtMoney(p.valorPago)}` : "—") },
          ]} actions={(p: any) => p.status === "ABERTA" ? (
            <>
              <Button size="small" onClick={() => run(() => call("POST", `${J}/parcelas/${p.id}/pagar`, {}), "Parcela paga.")}>Pagar</Button>
              <Button size="small" color="error" onClick={() => run(() => call("POST", `${J}/parcelas/${p.id}/cancelar`), "Parcela cancelada.", "Cancelar esta parcela?")}>Cancelar</Button>
            </>
          ) : null} />
        </LoadBox>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

const IMOVEL: FormField[] = [
  { key: "apelido", label: "Apelido do imóvel", required: true }, { key: "tipo", label: "Tipo", type: "select", options: opts(["PREDIO", "TERRENO", "SALA", "POLO", "GALPAO", "OUTRO"]) },
  { key: "propriedade", label: "Situação do imóvel", type: "select", options: opts(["PROPRIO", "ALUGADO", "CEDIDO", "EM_NEGOCIACAO"]) },
  { key: "logradouro", label: "Logradouro" }, { key: "numero", label: "Número" }, { key: "bairro", label: "Bairro" }, { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF" }, { key: "cep", label: "CEP" },
  { key: "matricula", label: "Matrícula" }, { key: "inscricaoIptu", label: "Inscrição IPTU" }, { key: "areaM2", label: "Área (m²)", type: "number" }, { key: "observacoes", label: "Observações", type: "textarea" },
];

export default function ImoveisTab() {
  const [sub, setSub] = useState(0);
  const [par, setPar] = useState<any>(null);
  const [dlg, setDlg] = useState<null | { kind: "renovar" | "rescindir" | "reajustar"; row: any }>(null);
  const [rev, setRev] = useState(0);
  const res = useApi<any>(`${J}/imoveis-resumo`, [rev]);
  const imoveis = useJurOptions("/imoveis?pageSize=200", (i) => ({ value: i.id, label: i.apelido }));
  const d = res.data;
  const LOC: FormField[] = [
    { key: "imovelId", label: "Imóvel", type: "select", required: true, options: imoveis },
    { key: "natureza", label: "Natureza", type: "select", options: opts(["LOCACAO_PAGA", "LOCACAO_RECEBIDA", "COMPRA", "VENDA", "COMODATO"]), helper: "Paga = a instituição é locatária" },
    { key: "locadorNome", label: "Locador", required: true }, { key: "locadorDoc", label: "CPF/CNPJ do locador" }, { key: "locatarioNome", label: "Locatário", required: true }, { key: "locatarioDoc", label: "CPF/CNPJ do locatário" },
    { key: "valorMensal", label: "Valor mensal (R$)", type: "number", required: true }, { key: "diaVencimento", label: "Dia do vencimento", type: "number" },
    { key: "indiceReajuste", label: "Índice de reajuste", type: "select", options: opts(["IGPM", "IPCA", "INPC", "FIXO", "NENHUM"]) }, { key: "percentualFixo", label: "% fixo (se índice FIXO)", type: "number" }, { key: "mesReajuste", label: "Mês do reajuste", type: "number" },
    { key: "vigenciaInicio", label: "Início", type: "date", required: true }, { key: "vigenciaFim", label: "Fim (vencimento)", type: "date", required: true },
    { key: "garantiaTipo", label: "Garantia", type: "select", options: opts(["NENHUMA", "CAUCAO", "FIADOR", "SEGURO_FIANCA", "TITULO_CAPITALIZACAO"]) }, { key: "garantiaValor", label: "Valor da garantia (R$)", type: "number" }, { key: "garantiaDetalhe", label: "Detalhe da garantia" },
    { key: "multaRescisoria", label: "Multa rescisória" }, { key: "condicoes", label: "Condições / cláusulas relevantes", type: "textarea" }, { key: "emNegociacao", label: "Em negociação (ainda não assinado)", type: "bool" },
  ];
  return (
    <>
      <Section title="Imóveis e aluguéis">
        <LoadBox loading={res.loading} error={res.error} onRetry={res.reload}>
          {d && <KpiRow>
            <Kpi title="Imóveis ativos" value={d.imoveis.total} hint={Object.entries(d.imoveis.porPropriedade).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(" · ")} />
            <Kpi title="Custo mensal de aluguéis" value={fmtMoney(d.custoMensalAlugueis)} hint={`${d.locacoesVigentes} locações vigentes`} />
            <Kpi title="Receita mensal de aluguéis" value={fmtMoney(d.receitaMensalAlugueis)} color={COLORS.ok} />
            <Kpi title="Parcelas em atraso" value={fmtMoney(d.parcelasAtrasadas.valor)} hint={`${d.parcelasAtrasadas.qtd} parcela(s)`} color={d.parcelasAtrasadas.qtd ? COLORS.bad : COLORS.ok} />
            <Kpi title="A vencer em 90 dias" value={fmtMoney(d.parcelasProximos90Dias.valor)} hint={`${d.parcelasProximos90Dias.qtd} parcela(s)`} />
          </KpiRow>}
        </LoadBox>
        <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable"><Tab label="Contratos de locação e negociação" /><Tab label="Cadastro de imóveis" /></Tabs>
      </Section>
      {sub === 0 && <>
        <ResourceTab title="Locações" path="/locacoes" fields={LOC} editFields={LOC.filter((f) => !["imovelId", "valorMensal", "emNegociacao"].includes(f.key))} vencimento newLabel="Nova locação / negociação" anexoRef="Locacao" refreshKey={rev}
          filters={[{ key: "status", label: "Situação", options: opts(["RASCUNHO", "EM_NEGOCIACAO", "VIGENTE", "ENCERRADO", "RESCINDIDO"]) }, { key: "natureza", label: "Natureza", options: opts(["LOCACAO_PAGA", "LOCACAO_RECEBIDA", "COMPRA", "VENDA", "COMODATO"]) }]}
          columns={[
            { label: "Contrato", primary: true, render: (r) => <><b>{r.imovel?.apelido}</b><Typography variant="caption" component="div" color="text.secondary">{r.codigo} · {r.natureza.replace(/_/g, " ")}</Typography></> },
            { label: "Locador → Locatário", render: (r) => `${r.locadorNome} → ${r.locatarioNome}` }, { label: "Mensal", render: (r) => fmtMoney(r.valorMensal) },
            { label: "Reajuste", hideOnMobile: true, render: (r) => `${r.indiceReajuste}${r.indiceReajuste === "FIXO" ? ` ${r.percentualFixo}%` : ""}` },
            { label: "Garantia", hideOnMobile: true, render: (r) => r.garantiaTipo.replace(/_/g, " ") },
            { label: "Vence", render: (r) => fmtDate(r.vigenciaFim) }, { label: "Prazo", render: (r) => (r.status === "VIGENTE" ? <AlertaChip alerta={r.alerta} /> : "—") }, { label: "Situação", render: (r) => <Status value={r.status} /> },
          ]}
          rowActions={(r, { run }) => [
            { label: "Parcelas", onClick: () => setPar(r) },
            { label: "Ativar", show: ["RASCUNHO", "EM_NEGOCIACAO"].includes(r.status), onClick: () => { void run(() => call("POST", `${J}/locacoes/${r.id}/ativar`), "Contrato ativado."); } },
            { label: "Gerar parcelas da vigência", show: r.status === "VIGENTE", onClick: () => { void run(async () => { const x = await call("POST", `${J}/locacoes/${r.id}/parcelas/gerar`); setRev((n) => n + 1); return x; }, "Parcelas geradas (as já existentes foram preservadas)."); } },
            { label: "Reajustar aluguel", show: r.status === "VIGENTE" && r.indiceReajuste !== "NENHUM", onClick: () => setDlg({ kind: "reajustar", row: r }) },
            { label: "Renovar", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "renovar", row: r }) },
            { label: "Encerrar", show: r.status === "VIGENTE", onClick: () => { void run(() => call("POST", `${J}/locacoes/${r.id}/encerrar`), "Locação encerrada.", "Encerrar a locação?"); } },
            { label: "Rescindir", color: "error", show: r.status === "VIGENTE", onClick: () => setDlg({ kind: "rescindir", row: r }) },
          ]} />
      </>}
      {sub === 1 && <ResourceTab title="Cadastro de imóveis" path="/imoveis" fields={IMOVEL} newLabel="Novo imóvel" anexoRef="Imovel" deletable refreshKey={rev}
        filters={[{ key: "propriedade", label: "Situação", options: opts(["PROPRIO", "ALUGADO", "CEDIDO", "EM_NEGOCIACAO"]) }]}
        columns={[
          { label: "Imóvel", primary: true, render: (r) => <b>{r.apelido}</b> }, { label: "Situação", render: (r) => <Status value={r.propriedade} /> },
          { label: "Local", render: (r) => [r.logradouro, r.numero, r.cidade && `${r.cidade}/${r.uf ?? ""}`].filter(Boolean).join(", ") || "—" },
          { label: "Área", hideOnMobile: true, render: (r) => (r.areaM2 ? `${r.areaM2} m²` : "—") }, { label: "Matrícula", hideOnMobile: true, render: (r) => r.matricula || "—" },
          { label: "Contratos", render: (r) => r.locacoes?.length ?? 0 },
        ]} />}
      {par && <Parcelas loc={par} onClose={() => { setPar(null); setRev((x) => x + 1); }} />}
      <PromptDialog open={dlg?.kind === "reajustar"} title="Reajustar aluguel" onClose={() => setDlg(null)}
        intro={<Typography variant="body2" sx={{ mb: 1 }}>Informe o percentual acumulado do índice ({dlg?.row?.indiceReajuste}) — o sistema não consulta índices externos. As parcelas em aberto a partir de hoje são recalculadas.</Typography>}
        fields={[{ key: "percentual", label: "Percentual acumulado (%)", type: "number", required: dlg?.row?.indiceReajuste !== "FIXO" }]}
        onSubmit={async (b) => { await call("POST", `${J}/locacoes/${dlg!.row.id}/reajustar`, b); setRev((x) => x + 1); }} />
      <PromptDialog open={dlg?.kind === "renovar"} title="Renovar locação" onClose={() => setDlg(null)} fields={[{ key: "novaVigenciaFim", label: "Nova data final", type: "date", required: true }, { key: "novoValor", label: "Novo valor mensal (R$)", type: "number" }]}
        onSubmit={async (b) => { await call("POST", `${J}/locacoes/${dlg!.row.id}/renovar`, b); setRev((x) => x + 1); }} />
      <PromptDialog open={dlg?.kind === "rescindir"} title="Rescindir locação" onClose={() => setDlg(null)} fields={[{ key: "motivo", label: "Motivo", type: "textarea", required: true }, { key: "data", label: "Data", type: "date" }]}
        onSubmit={async (b) => { await call("POST", `${J}/locacoes/${dlg!.row.id}/rescindir`, b); setRev((x) => x + 1); }} />
    </>
  );
}
