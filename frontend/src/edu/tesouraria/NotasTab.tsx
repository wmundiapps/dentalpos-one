import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog } from "../desempenho/kit";
import { Async, Panel, Situacao, Stat, StatGrid, Sub, TES, baixarArquivo, brl, erroCompleto, fmtDate, isoDia, label, num, useApi, useContas, useMotivo, useToast } from "./tes";

function Conciliacao() {
  const st = useApi<any>(`${TES}/notas/conciliacao`);
  return (
    <Async state={st}>
      {(d) => (
        <Box sx={{ display: "grid", gap: 2 }}>
          <StatGrid min={160}>
            <Stat label="Notas sem vínculo" value={num(d.totais.notasSemVinculo, 0)} tone={d.totais.notasSemVinculo ? "warning" : "success"} />
            <Stat label="Notas divergentes" value={num(d.totais.notasDivergentes, 0)} tone={d.totais.notasDivergentes ? "error" : "success"} />
            <Stat label="Pagamentos sem nota" value={num(d.totais.titulosSemNota, 0)} tone={d.totais.titulosSemNota ? "warning" : "success"} />
            <Stat label="Recebimentos sem NFS-e" value={num(d.totais.recebimentosSemNotaSaida, 0)} />
          </StatGrid>
          <Panel title="Notas divergentes do título/recebível vinculado">
            {d.notasDivergentes.map((n: any) => <Sub key={n.id}>{n.direcao} {n.modelo} {n.numero}/{n.serie} — {n.participanteNome} — nota {brl(n.valorTotal)} · diferença {brl(n.diferenca)}</Sub>)}
            {!d.notasDivergentes.length && <Typography variant="body2" color="text.secondary">Nenhuma divergência.</Typography>}
          </Panel>
          <Panel title="Notas lançadas sem vínculo com conta a pagar/receber">
            {d.notasSemVinculo.map((n: any) => <Sub key={n.id}>{n.direcao} {n.modelo} {n.numero}/{n.serie} — {n.participanteNome} — {brl(n.valorTotal)} ({fmtDate(n.emissao)})</Sub>)}
            {!d.notasSemVinculo.length && <Typography variant="body2" color="text.secondary">Todas vinculadas.</Typography>}
          </Panel>
          <Panel title="Pagamentos (compras, contratos, terceiros) sem nota fiscal">
            {d.titulosSemNota.map((t: any) => <Sub key={t.id}>{t.numero} — {t.fornecedor} — {brl(t.valorBruto)} ({label(t.status)})</Sub>)}
            {!d.titulosSemNota.length && <Typography variant="body2" color="text.secondary">Nada pendente.</Typography>}
          </Panel>
        </Box>
      )}
    </Async>
  );
}

function Exportar() {
  const [conjunto, setConjunto] = useState("lancamentos");
  const [de, setDe] = useState(isoDia(-30));
  const [ate, setAte] = useState(isoDia(0));
  const plano = useApi<any>(`${TES}/contabil/plano`);
  const toast = useToast();
  async function baixar() {
    try {
      const r = await eduApi.get(`${TES}/contabil/exportar?conjunto=${conjunto}&de=${de}&ate=${ate}`);
      baixarArquivo(r.nomeArquivo, r.conteudo, "text/csv;charset=utf-8");
      toast.ok(`${r.linhas} linha(s) exportada(s) (regime ${label(r.regime)}).`);
    } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Panel title="Espelho para a integração fiscal/contábil" subtitle="Arquivos CSV (separador ';', UTF-8 com BOM) em layout genérico para importar no sistema do contador.">
        <Async state={plano}>{(p) => <Typography variant="body2" sx={{ mb: 1.5 }}>Regime: <b>{label(p.regime)}</b> · sistema de destino: <b>{p.sistemaContabil || "não informado"}</b> · {p.contas.length} conta(s) no plano · {p.centros.length} centro(s) de custo</Typography>}</Async>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label="Conjunto" value={conjunto} onChange={(e) => setConjunto(e.target.value)} sx={{ minWidth: 240 }}>
            <MenuItem value="lancamentos">Lançamentos contábeis (partidas dobradas)</MenuItem><MenuItem value="notas">Notas fiscais (livros de entrada/saída)</MenuItem>
            <MenuItem value="plano">Plano de contas</MenuItem><MenuItem value="centros">Centros de custo</MenuItem>
          </TextField>
          <TextField size="small" type="date" label="De" value={de} onChange={(e) => setDe(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={["plano", "centros"].includes(conjunto)} />
          <TextField size="small" type="date" label="Até" value={ate} onChange={(e) => setAte(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={["plano", "centros"].includes(conjunto)} />
          <Button variant="contained" onClick={baixar}>Baixar CSV</Button>
        </Box>
        <Alert severity="warning" sx={{ mt: 2 }}>Integração fiscal real (SEFAZ/prefeitura/ERP contábil) exige certificado, credenciais e homologação. Os cálculos de retenção são modelos a validar por contador.</Alert>
      </Panel>
      {toast.node}
    </Box>
  );
}

export default function NotasTab() {
  const [sub, setSub] = useState("notas");
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState(false);
  const [gerar, setGerar] = useState<any | null>(null);
  const { contas } = useContas();
  const toast = useToast();
  const motivo = useMotivo();
  const reload = () => setKey((k) => k + 1);

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[["notas", "Notas lançadas"], ["conc", "Conciliação fiscal"], ["exp", "Exportação contábil"]].map(([k, l]) => (
          <Button key={k} variant={sub === k ? "contained" : "outlined"} size="small" onClick={() => setSub(k)} sx={{ textTransform: "none", fontWeight: 700 }}>{l}</Button>
        ))}
      </Box>
      {sub === "conc" ? <Conciliacao /> : sub === "exp" ? <Exportar /> : (
        <>
          <ListTable path={`${TES}/notas`} refreshKey={key}
            filters={[
              { key: "direcao", label: "Direção", options: ["ENTRADA", "SAIDA"] }, { key: "modelo", label: "Modelo", options: ["NFSE", "NFE", "OUTRA"] },
              { key: "conciliacao", label: "Conciliação fiscal", options: ["PENDENTE", "OK", "DIVERGENTE"] }, { key: "status", label: "Situação", options: ["LANCADA", "CANCELADA"] },
            ]}
            toolbar={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Lançar nota</Button>}
            columns={[
              { key: "direcao", label: "Direção", render: (n) => <Situacao value={n.direcao === "ENTRADA" ? "PENDENTE" : "OK"} /> },
              { key: "numero", label: "Nº / série", render: (n) => <>{label(n.modelo)} {n.numero}/{n.serie}{n.chave && <Sub>chave …{String(n.chave).slice(-8)}</Sub>}</> },
              { key: "participanteNome", label: "Participante", render: (n) => <>{n.participanteNome}<Sub>{n.participanteDocumento}</Sub></> },
              { key: "emissao", label: "Emissão", render: (n) => fmtDate(n.emissao) },
              { key: "valorTotal", label: "Total", align: "right", render: (n) => brl(n.valorTotal) },
              { key: "totalRetencoes", label: "Retenções", align: "right", render: (n) => (n.totalRetencoes ? brl(n.totalRetencoes) : "—") },
              { key: "valorLiquido", label: "Líquido", align: "right", render: (n) => brl(n.valorLiquido) },
              { key: "conciliacaoFiscal", label: "Fiscal", render: (n) => <><Situacao value={n.status === "CANCELADA" ? "CANCELADO" : n.conciliacaoFiscal} />{n.conciliacaoFiscal === "DIVERGENTE" && <Sub>dif. {brl(n.diferenca)}</Sub>}</> },
            ]}
            actions={(n) => n.status === "LANCADA" ? (
              <>
                {n.direcao === "ENTRADA" && !n.tituloId && <Button size="small" onClick={() => setGerar(n)}>Gerar título a pagar</Button>}
                {(n.tituloId || n.receivableId) && <Button size="small" onClick={() => toast.run(() => eduApi.post(`${TES}/notas/${n.id}/conciliar-fiscal`, {}), "Conciliação fiscal recalculada.", reload)}>Conciliar</Button>}
                <Button size="small" color="error" onClick={async () => { const m = await motivo.ask(`Cancelar nota ${n.numero}`); if (!m) return; try { await eduApi.post(`${TES}/notas/${n.id}/cancelar`, { motivo: m }); toast.ok("Nota cancelada."); reload(); } catch (e: any) { toast.err(erroCompleto(e)); } }}>Cancelar</Button>
              </>
            ) : null} />
          <FormDialog open={novo} title="Lançar nota fiscal" onClose={() => setNovo(false)} maxWidth="lg"
            initial={{ direcao: "ENTRADA", modelo: "NFSE", serie: "1", emissao: isoDia(0) }}
            intro={<Alert severity="info" sx={{ mb: 2 }}>Notas de ENTRADA vinculam a títulos a pagar; notas de SAÍDA, a mensalidades/recebíveis. NF-e exige a chave de 44 dígitos (dígito verificador conferido). O total, o ISS e o líquido são calculados se você não informar.</Alert>}
            fields={[
              { key: "direcao", label: "Direção", type: "select", options: ["ENTRADA", "SAIDA"], required: true }, { key: "modelo", label: "Modelo", type: "select", options: ["NFSE", "NFE", "OUTRA"], required: true },
              { key: "numero", label: "Número", required: true }, { key: "serie", label: "Série" },
              { key: "chave", label: "Chave de acesso (NF-e, 44 dígitos)", full: true }, { key: "emissao", label: "Emissão", type: "date", required: true },
              { key: "participanteNome", label: "Emitente / tomador", required: true }, { key: "participanteDocumento", label: "CPF/CNPJ" },
              { key: "descricao", label: "Descrição", full: true },
              { key: "valorServicos", label: "Serviços (R$)", type: "number" }, { key: "valorProdutos", label: "Produtos (R$)", type: "number" }, { key: "valorDescontos", label: "Descontos (R$)", type: "number" },
              { key: "issAliquota", label: "ISS (%)", type: "number" }, { key: "issRetido", label: "ISS retido pelo tomador", type: "bool" },
              { key: "retencaoIrrf", label: "IRRF (R$)", type: "number" }, { key: "retencaoPis", label: "PIS (R$)", type: "number" }, { key: "retencaoCofins", label: "COFINS (R$)", type: "number" },
              { key: "retencaoCsll", label: "CSLL (R$)", type: "number" }, { key: "retencaoInss", label: "INSS (R$)", type: "number" }, { key: "retencaoOutras", label: "Outras retenções (R$)", type: "number" },
            ]}
            onSubmit={async (b) => { const n = await eduApi.post(`${TES}/notas`, b); toast.ok(`Nota lançada — líquido ${brl(n.valorLiquido)}.`); reload(); }} />
          <FormDialog open={!!gerar} title={`Gerar título a pagar — NF ${gerar?.numero ?? ""}`} onClose={() => setGerar(null)} initial={{ vencimento: isoDia(10), formaPagamento: "PIX" }}
            intro={<Alert severity="info" sx={{ mb: 2 }}>O título nasce em rascunho, já com as retenções da nota ({gerar ? brl(gerar.totalRetencoes) : ""}), e segue para conferência/autorização.</Alert>}
            fields={[
              { key: "vencimento", label: "Vencimento", type: "date", required: true }, { key: "formaPagamento", label: "Forma", type: "select", options: ["PIX", "TED", "BOLETO", "CREDITO_CONTA"], required: true },
              { key: "contaBancariaId", label: "Conta pagadora", type: "select", options: contas },
              { key: "tipoChavePix", label: "Tipo da chave Pix", type: "select", options: ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"], hidden: (v) => v.formaPagamento !== "PIX" }, { key: "chavePix", label: "Chave Pix", hidden: (v) => v.formaPagamento !== "PIX" },
              { key: "favorecidoBanco", label: "Banco (3 dígitos)", hidden: (v) => !["TED", "CREDITO_CONTA"].includes(v.formaPagamento) }, { key: "favorecidoAgencia", label: "Agência", hidden: (v) => !["TED", "CREDITO_CONTA"].includes(v.formaPagamento) },
              { key: "favorecidoConta", label: "Conta", hidden: (v) => !["TED", "CREDITO_CONTA"].includes(v.formaPagamento) }, { key: "codigoBarras", label: "Linha digitável", full: true, hidden: (v) => v.formaPagamento !== "BOLETO" },
            ]}
            onSubmit={async (b) => { const t = await eduApi.post(`${TES}/notas/${gerar.id}/gerar-titulo`, b); toast.ok(`Título ${t.numero} criado em rascunho.`); reload(); }} />
        </>
      )}
      {toast.node}{motivo.node}
    </Box>
  );
}
