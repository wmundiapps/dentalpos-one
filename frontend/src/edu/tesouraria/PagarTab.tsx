import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import ListTable from "../infraestrutura/ListTable";
import { FormDialog } from "../desempenho/kit";
import { Async, FORMAS_PAGAMENTO, Light, Panel, Situacao, Stat, StatGrid, Sub, TES, brl, comReauth, erroCompleto, fmtDate, fmtDateTime, isoDia, label, num, useApi, useContas, useMotivo, useToast } from "./tes";

export function TituloDetalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useApi<any>(`${TES}/titulos/${id}`);
  const { contas } = useContas();
  const toast = useToast();
  const motivo = useMotivo();
  const [conta, setConta] = useState("");

  async function acao(path: string, ok: string, body: any = {}, comMotivo?: string) {
    let b = body;
    if (comMotivo) { const m = await motivo.ask(comMotivo); if (!m) return; b = { ...body, motivo: m }; }
    try { await comReauth((x) => eduApi.post(`${TES}/titulos/${id}/${path}`, { ...b, ...x })); toast.ok(ok); st.reload(); onChanged(); } catch (e: any) { toast.err(erroCompleto(e)); }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Título a pagar</DialogTitle>
      <DialogContent dividers>
        <Async state={st}>
          {(t) => (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>{t.numero}</Typography><Situacao value={t.status} />
                <Typography variant="body2">{t.descricao}</Typography>
              </Box>
              <StatGrid min={140}>
                <Stat label="Favorecido" value={t.fornecedor} hint={t.fornecedorDocumento || undefined} />
                <Stat label="Bruto" value={brl(t.valorBruto)} />
                <Stat label="Retenções" value={brl(t.retencaoInss + t.retencaoIrrf + t.retencaoIss + t.retencaoOutras)} hint={`INSS ${brl(t.retencaoInss)} · IRRF ${brl(t.retencaoIrrf)} · ISS ${brl(t.retencaoIss)}`} />
                <Stat label="Líquido a pagar" value={brl(t.valorLiquido)} tone="success" />
                <Stat label="Vencimento" value={fmtDate(t.vencimento)} hint={label(t.formaPagamento)} />
              </StatGrid>
              {t.pendencias?.length > 0 && t.status === "RASCUNHO" && <Alert severity="warning">Pendências para conferir: {t.pendencias.join(" · ")}</Alert>}
              {t.motivoRejeicao && <Alert severity="error">Motivo registrado: {t.motivoRejeicao}</Alert>}
              {t.ultimoErroBanco && <Alert severity="error">Último retorno do banco: {t.ultimoErroBanco}</Alert>}
              {t.integridadeOk === false && <Alert severity="error">Integridade: o título foi alterado após a autorização. Devolva e autorize novamente.</Alert>}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Dados de pagamento</Typography>
                  <Typography variant="body2">Forma: {label(t.formaPagamento)}</Typography>
                  {t.chavePix && <Typography variant="body2">Chave Pix ({t.tipoChavePix}): {t.chavePix}</Typography>}
                  {t.favorecidoConta && <Typography variant="body2">Banco {t.favorecidoBanco} · ag. {t.favorecidoAgencia} · conta {t.favorecidoConta}</Typography>}
                  {t.codigoBarras && <Typography variant="body2" sx={{ wordBreak: "break-all" }}>Boleto: {t.codigoBarras}</Typography>}
                  {t.nota && <Typography variant="body2">Nota fiscal {t.nota.numero}/{t.nota.serie} — {t.nota.conciliacaoFiscal}</Typography>}
                  {t.remessa && <Typography variant="body2">Remessa nº {t.remessa.numero} ({t.remessa.status})</Typography>}
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Alçada e aprovações</Typography>
                  <Typography variant="body2">{t.faixa}</Typography>
                  <Typography variant="body2">Aprovações: <b>{t.aprovacoesFeitas}/{t.aprovacoesNecessarias}</b>{t.exige2fa ? " · exige 2FA" : ""}</Typography>
                  {t.aprovacoes.map((a: any) => <Sub key={a.id}>{a.tipo === "CONFERENCIA" ? "Conferência" : `Autorização ${a.nivel}`}: {t.nomes[a.userId] || a.userId} ({a.papel}) em {fmtDateTime(a.createdAt)}{a.usou2fa ? " · 2FA" : ""}</Sub>)}
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Trilha de auditoria</Typography>
                {t.eventos.map((e: any) => (
                  <Box key={e.id} sx={{ display: "flex", gap: 1, flexWrap: "wrap", py: 0.3, borderBottom: 1, borderColor: "divider" }}>
                    <Typography variant="caption" sx={{ minWidth: 120 }}>{fmtDateTime(e.createdAt)}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 130 }}>{label(e.acao)}</Typography>
                    <Typography variant="caption" color="text.secondary">{e.userNome || "—"} {e.papel ? `(${e.papel})` : ""} {e.de && e.para ? `· ${e.de} → ${e.para}` : ""}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                {t.podeConferir && <Button variant="contained" onClick={() => acao("conferir", "Título conferido.")}>Conferir</Button>}
                {t.podeAutorizar && <Button variant="contained" color="success" onClick={() => acao("autorizar", "Aprovação registrada.")}>Autorizar{t.aprovacoesNecessarias > 1 ? ` (${t.aprovacoesFeitas + 1}/${t.aprovacoesNecessarias})` : ""}</Button>}
                {t.status === "CONFERIDO" && <Button color="error" onClick={() => acao("rejeitar", "Título rejeitado.", {}, "Motivo da rejeição")}>Rejeitar</Button>}
                {["CONFERIDO", "AUTORIZADO", "REJEITADO"].includes(t.status) && !t.remessaId && <Button onClick={() => acao("devolver", "Devolvido para rascunho.", {}, "Motivo da devolução")}>Devolver ao rascunho</Button>}
                {["RASCUNHO", "CONFERIDO", "AUTORIZADO", "REJEITADO"].includes(t.status) && !t.remessaId && <Button color="error" onClick={() => acao("cancelar", "Título cancelado.", {}, "Motivo do cancelamento")}>Cancelar</Button>}
                {["AUTORIZADO", "ENVIADO_BANCO"].includes(t.status) && (
                  <>
                    <TextField select size="small" label="Conta pagadora" value={conta || t.contaBancariaId || ""} onChange={(e) => setConta(e.target.value)} sx={{ minWidth: 200 }}>
                      {contas.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                    </TextField>
                    <Button color="warning" onClick={() => acao("baixa", "Pagamento baixado.", { contaId: conta || t.contaBancariaId || undefined })}>Baixar manualmente</Button>
                  </>
                )}
              </Box>
            </Box>
          )}
        </Async>
        {toast.node}{motivo.node}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}

function ImportarFolha({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [tab, setTab] = useState(0);
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [json, setJson] = useState('[\n  { "tipo": "SALARIO", "favorecidoNome": "Nome do funcionário", "documento": "00000000000", "funcionarioId": "f1", "bruto": 3000, "inss": 270, "irrf": 0, "chavePix": "00000000000", "tipoChavePix": "CPF" },\n  { "tipo": "RPA", "favorecidoNome": "Prestador autônomo", "documento": "00000000000", "bruto": 2000, "issAliquota": 5, "chavePix": "email@exemplo.com", "tipoChavePix": "EMAIL" }\n]');
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null); setRes(null);
    try {
      let r;
      if (tab === 0) r = await eduApi.post(`${TES}/folha/gerar`, { competencia: comp });
      else {
        let lancamentos: any;
        try { lancamentos = JSON.parse(json); } catch { throw new Error("JSON inválido."); }
        r = await eduApi.post(`${TES}/folha/importar`, { competencia: comp, tipo: "MISTO", lancamentos });
      }
      setRes(r); onDone(`${r.criados.length} título(s) criado(s) em rascunho para conferência; ${r.ignorados.length} ignorado(s).`);
    } catch (e: any) { setErr(erroCompleto(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800 }}>Folha, pró-labore e terceiros</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>Cada lançamento vira um título em <b>RASCUNHO</b> pronto para a fila de conferência. A importação é idempotente por competência, tipo e funcionário/documento. Retenções de RPA/PJ/pró-labore são calculadas por modelo quando não informadas (validar com o contador).</Alert>
        {err ? <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert> : null}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}><Tab label="Buscar do RH" /><Tab label="Colar lançamentos (JSON)" /></Tabs>
        <TextField size="small" label="Competência (AAAA-MM)" value={comp} onChange={(e) => setComp(e.target.value)} sx={{ mb: 2 }} />
        {tab === 1 && <TextField fullWidth multiline minRows={8} size="small" label="Lançamentos" value={json} onChange={(e) => setJson(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }} />}
        {res && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Resultado: {res.criados.length} criado(s), {res.ignorados.length} ignorado(s) — bruto {brl(res.lote.valorBruto)}, retenções {brl(res.lote.valorRetencoes)}, líquido {brl(res.lote.valorLiquido)}</Typography>
            {res.semContaPagadora && <Alert severity="warning" sx={{ my: 1 }}>Sem conta pagadora padrão: defina a conta nos títulos antes de conferir.</Alert>}
            {res.criados.map((c: any) => <Sub key={c.id}>{c.numero} · {c.favorecido} · {brl(c.liquido)}{c.pendencias.length ? ` · pendências: ${c.pendencias.join("; ")}` : ""}</Sub>)}
            {res.ignorados.map((c: any, i: number) => <Sub key={i}>Ignorado: {c.favorecido} — {c.motivo}</Sub>)}
          </Box>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button><Button variant="contained" onClick={go} disabled={busy}>{tab === 0 ? "Buscar e criar títulos" : "Importar"}</Button></DialogActions>
    </Dialog>
  );
}

const ORIGENS = ["MANUAL", "FOLHA", "PROLABORE", "TERCEIRO", "COMPRA", "CONTRATO", "NOTA_FISCAL", "IMPOSTO"];

export default function PagarTab() {
  const [key, setKey] = useState(0);
  const [novo, setNovo] = useState<any | null>(null);
  const [det, setDet] = useState<string | null>(null);
  const [folha, setFolha] = useState(false);
  const { contas } = useContas();
  const toast = useToast();
  const reload = () => setKey((k) => k + 1);
  const resumo = useApi<any>(`${TES}/titulos?pageSize=1&_=${key}`);

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Async state={resumo}>
        {(r) => (
          <StatGrid min={140}>
            {["RASCUNHO", "CONFERIDO", "AUTORIZADO", "ENVIADO_BANCO", "PAGO", "CONCILIADO"].map((s) => {
              const x = (r.resumo || []).find((y: any) => y.status === s);
              return <Stat key={s} label={label(s)} value={num(x?.qtd ?? 0, 0)} hint={brl(x?.valor ?? 0)} />;
            })}
          </StatGrid>
        )}
      </Async>
      <Panel>
        <ListTable path={`${TES}/titulos`} refreshKey={key}
          filters={[{ key: "status", label: "Situação", options: ["RASCUNHO", "CONFERIDO", "AUTORIZADO", "ENVIADO_BANCO", "PAGO", "CONCILIADO", "REJEITADO", "CANCELADO"] }, { key: "origem", label: "Origem", options: ORIGENS }]}
          toolbar={
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({ origem: "MANUAL", formaPagamento: "PIX", vencimento: isoDia(7) })}>Novo título</Button>
              <Button onClick={() => setFolha(true)}>Folha / terceiros</Button>
            </Box>
          }
          columns={[
            { key: "numero", label: "Nº" },
            { key: "fornecedor", label: "Favorecido", render: (t) => <><b>{t.fornecedor}</b><Sub>{t.descricao}</Sub></> },
            { key: "origem", label: "Origem", render: (t) => label(t.origem) },
            { key: "vencimento", label: "Vencimento", render: (t) => <Light tone={new Date(t.vencimento) < new Date() && !["PAGO", "CONCILIADO", "CANCELADO"].includes(t.status) ? "error" : "default"} text={fmtDate(t.vencimento)} /> },
            { key: "valorLiquido", label: "Líquido", align: "right", render: (t) => <>{brl(t.valorLiquido)}{t.valorBruto !== t.valorLiquido && <Sub>bruto {brl(t.valorBruto)}</Sub>}</> },
            { key: "formaPagamento", label: "Forma", render: (t) => label(t.formaPagamento) },
            { key: "aprov", label: "Aprovações", render: (t) => (t.status === "CONFERIDO" ? `${t.aprovacoesFeitas}/${t.aprovacoesNecessarias}` : "—") },
            { key: "status", label: "Situação", render: (t) => <Situacao value={t.status} /> },
          ]}
          actions={(t) => (
            <>
              <Button size="small" onClick={() => setDet(t.id)}>Abrir</Button>
              {["RASCUNHO", "REJEITADO"].includes(t.status) && <Button size="small" onClick={() => setNovo({ ...t, vencimento: String(t.vencimento).slice(0, 10), _id: t.id })}>Editar</Button>}
            </>
          )} />
      </Panel>
      <FormDialog open={!!novo} title={novo?._id ? "Editar título (volta para rascunho)" : "Novo título a pagar"} onClose={() => setNovo(null)} initial={novo || {}}
        intro={<Alert severity="info" sx={{ mb: 2 }}>O título nasce como <b>rascunho</b>. Depois de lançado, outra pessoa (coordenação) confere e autoriza — quem lança não autoriza.</Alert>}
        fields={[
          { key: "origem", label: "Origem", type: "select", options: ORIGENS, required: true },
          { key: "descricao", label: "Descrição", required: true, full: true },
          { key: "fornecedor", label: "Favorecido / fornecedor", required: true },
          { key: "fornecedorDocumento", label: "CPF/CNPJ do favorecido" },
          { key: "categoria", label: "Categoria" },
          { key: "valorBruto", label: "Valor bruto (R$)", type: "number", required: true },
          { key: "retencaoInss", label: "Retenção INSS (R$)", type: "number" }, { key: "retencaoIrrf", label: "Retenção IRRF (R$)", type: "number" },
          { key: "retencaoIss", label: "Retenção ISS (R$)", type: "number" }, { key: "retencaoOutras", label: "Outras retenções (R$)", type: "number" },
          { key: "vencimento", label: "Vencimento", type: "date", required: true },
          { key: "contaBancariaId", label: "Conta pagadora", type: "select", options: contas },
          { key: "formaPagamento", label: "Forma de pagamento", type: "select", options: FORMAS_PAGAMENTO, required: true },
          { key: "tipoChavePix", label: "Tipo da chave Pix", type: "select", options: ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"], hidden: (v) => v.formaPagamento !== "PIX" },
          { key: "chavePix", label: "Chave Pix", hidden: (v) => v.formaPagamento !== "PIX" },
          { key: "favorecidoBanco", label: "Banco do favorecido (3 dígitos)", hidden: (v) => !["TED", "CREDITO_CONTA"].includes(v.formaPagamento) },
          { key: "favorecidoAgencia", label: "Agência", hidden: (v) => !["TED", "CREDITO_CONTA"].includes(v.formaPagamento) },
          { key: "favorecidoConta", label: "Conta com dígito", hidden: (v) => !["TED", "CREDITO_CONTA"].includes(v.formaPagamento) },
          { key: "codigoBarras", label: "Linha digitável / código de barras", full: true, hidden: (v) => v.formaPagamento !== "BOLETO" },
        ]}
        onSubmit={async (b) => {
          if (novo?._id) { await eduApi.put(`${TES}/titulos/${novo._id}`, b); toast.ok("Título atualizado e devolvido ao rascunho."); }
          else { const t = await eduApi.post(`${TES}/titulos`, b); toast.ok(`Título ${t.numero} lançado como rascunho.`); }
          reload();
        }} />
      {det && <TituloDetalhe id={det} onClose={() => setDet(null)} onChanged={reload} />}
      <ImportarFolha open={folha} onClose={() => setFolha(false)} onDone={(m) => { toast.ok(m); reload(); }} />
      {toast.node}
    </Box>
  );
}
