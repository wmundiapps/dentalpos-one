import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import ErrorIcon from "@mui/icons-material/Error";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PageHeader from "../components/PageHeader";
import { FiscalApi, type FiscalAlertRow, type FiscalDoc, type FiscalRuleData, type FiscalSendRow, type FiscalSummaryData } from "../services/FiscalApi";

type Cor = "default" | "success" | "info" | "warning" | "error";
const STATUS: Record<string, { label: string; color: Cor }> = {
  AGUARDANDO_EMISSAO: { label: "Aguardando emiss\u00e3o", color: "warning" },
  PROGRAMADO: { label: "Programado", color: "warning" },
  AGUARDANDO_RECEITA_SAUDE: { label: "Aguardando Receita Sa\u00fade", color: "warning" },
  EMITIDO: { label: "Emitido", color: "info" },
  ENVIADO: { label: "Enviado", color: "info" },
  CONCLUIDO: { label: "Conclu\u00eddo", color: "success" },
  FALHA: { label: "Falha na emiss\u00e3o", color: "error" },
  CANCELADO: { label: "Cancelado", color: "default" },
};
const KIND: Record<string, string> = { NFSE: "NFS-e", RECEITA_SAUDE: "Receita Sa\u00fade", RECIBO: "Recibo", INDEFINIDO: "A definir" };
const PRIO: Record<string, Cor> = { CRITICA: "error", ALTA: "warning", MEDIA: "info", BAIXA: "default" };
const ENVIO: Record<string, Cor> = { ENVIADO: "info", ENTREGUE: "success", LIDO: "success", PROGRAMADO: "warning", FALHOU: "error", NAO_ENVIADO: "default" };
const PENDENTES = ["AGUARDANDO_EMISSAO", "PROGRAMADO", "AGUARDANDO_RECEITA_SAUDE", "FALHA"];
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "-");
const hora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "-");

export default function FiscalAutomation() {
  const [summary, setSummary] = useState<FiscalSummaryData | null>(null);
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [alerts, setAlerts] = useState<FiscalAlertRow[]>([]);
  const [sends, setSends] = useState<FiscalSendRow[]>([]);
  const [grupo, setGrupo] = useState("");
  const [sendFilter, setSendFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [doc, setDoc] = useState<FiscalDoc | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<FiscalRuleData | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d, a, e] = await Promise.all([FiscalApi.summary(), FiscalApi.documents(grupo), FiscalApi.alerts(), FiscalApi.sends(sendFilter)]);
      setSummary(s); setDocs(d); setAlerts(a); setSends(e);
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao carregar."); }
  }, [grupo, sendFilter]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: (r: any) => string) => {
    setBusy(true); setError(""); setNotice("");
    try { const r = await fn(); setNotice(ok(r)); setDoc(null); setRules(null); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Erro."); }
    finally { setBusy(false); }
  };

  const openDoc = (d: FiscalDoc) => {
    setDoc(d);
    setForm({ kind: d.kind === "INDEFINIDO" ? "NFSE" : d.kind, payerDocument: d.payerDocument || "", payerEmail: d.payerEmail || "", payerPhone: d.payerPhone || "", documentNumber: d.documentNumber || "", protocolNumber: d.protocolNumber || "", documentUrl: d.documentUrl || "" });
  };
  const openDocById = async (id?: string | null) => {
    if (!id) return;
    const lista = grupo ? await FiscalApi.documents() : docs;
    const d = lista.find((x) => x.id === id);
    if (d) openDoc(d);
  };
  const filtrar = (g: string) => { setGrupo(g); document.getElementById("lista-fiscal")?.scrollIntoView({ behavior: "smooth" }); };
  const verFalhas = () => { setSendFilter("FALHOU"); document.getElementById("envios-fiscais")?.scrollIntoView({ behavior: "smooth" }); };
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const emitido = doc ? ["EMITIDO", "ENVIADO", "CONCLUIDO"].includes(doc.status) : false;

  return (
    <Box>
      <PageHeader title={"Automa\u00e7\u00e3o Fiscal"} description={"Recibos, Receita Sa\u00fade e notas fiscais a partir dos pagamentos confirmados, com envio autom\u00e1tico ao pagador."} />

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} disabled={busy} onClick={() => void run(() => FiscalApi.sync(), (r) => `${r.criados} novo(s) documento(s) criado(s) a partir de ${r.encontrados} pagamento(s) confirmado(s).`)}>Novo processamento</Button>
        <Button variant="outlined" startIcon={<CheckCircleIcon />} disabled={busy} onClick={() => void run(() => FiscalApi.process(), (r) => `Processado: ${r.importados} importado(s), ${r.liberados} liberado(s) para emiss\u00e3o, ${r.enviados} enviado(s). ${r.aguardandoEmissao} aguardando emiss\u00e3o.`)}>{"Processar pend\u00eancias"}</Button>
        <Button variant="outlined" startIcon={<ScheduleSendIcon />} disabled={busy} onClick={async () => { try { setRules(await FiscalApi.rules()); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } }}>{"Configurar regras de emiss\u00e3o"}</Button>
      </Box>

      <Alert severity="warning" sx={{ mb: 3 }}>{"Receita Sa\u00fade n\u00e3o tem integra\u00e7\u00e3o p\u00fablica: lance no app da Receita e registre o protocolo aqui. NFS-e emitida fora do sistema tamb\u00e9m \u00e9 registrada aqui, com o n\u00famero da nota."}</Alert>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(5, 1fr)" }, gap: 2, mb: 3 }}>
        <Resumo titulo="Pagamentos confirmados" valor={String(summary?.confirmedPayments ?? "-")} icone={<PaymentsIcon />} onClick={() => filtrar("")} />
        <Resumo titulo="Documentos pendentes" valor={String(summary?.pendingDocuments ?? "-")} icone={<WarningAmberIcon />} onClick={() => filtrar("PENDENTES")} />
        <Resumo titulo="Documentos emitidos" valor={String(summary?.issuedDocuments ?? "-")} icone={<DescriptionIcon />} onClick={() => filtrar("EMITIDOS")} />
        <Resumo titulo="Falhas de envio" valor={String(summary?.deliveryFailures ?? "-")} icone={<ErrorIcon />} onClick={verFalhas} />
        <Resumo titulo="Valor pendente fiscal" valor={summary ? money(summary.pendingTaxValue) : "-"} icone={<ReceiptLongIcon />} onClick={() => filtrar("PENDENTES")} />
      </Box>

      <Paper id="lista-fiscal" variant="outlined" sx={{ borderRadius: 3, mb: 3, overflow: "hidden" }}>
        <Box sx={{ px: 3, py: 2, bgcolor: "primary.main", color: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <Typography sx={{ fontWeight: 800 }}>{grupo === "PENDENTES" ? "Documentos pendentes" : grupo === "EMITIDOS" ? "Documentos emitidos" : "Todos os documentos fiscais"}</Typography>
          {grupo && <Button size="small" sx={{ color: "#FFFFFF" }} onClick={() => setGrupo("")}>Mostrar todos</Button>}
        </Box>
        {docs.length === 0 && <Typography sx={{ p: 3 }} color="text.secondary">{"Nenhum documento. Clique em Novo processamento para importar os pagamentos confirmados do financeiro."}</Typography>}
        {docs.map((d) => (
          <Box key={d.id} sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }} onClick={() => openDoc(d)}>
            <Box sx={{ flex: "1 1 240px" }}>
              <Typography sx={{ fontWeight: 800 }}>{d.payerName}</Typography>
              <Typography variant="body2" color="text.secondary">{`${d.description || "Pagamento"} \u2022 ${dia(d.paymentDate)} \u2022 ${d.paymentMethod || "-"}`}</Typography>
            </Box>
            <Chip size="small" label={STATUS[d.status]?.label || d.status} color={STATUS[d.status]?.color || "default"} />
            <Typography sx={{ width: 120, fontWeight: 700 }}>{KIND[d.kind] || d.kind}</Typography>
            <Typography sx={{ width: 120, fontWeight: 800 }}>{money(d.amount)}</Typography>
            <Button size="small" variant={PENDENTES.includes(d.status) ? "contained" : "outlined"} onClick={(e) => { e.stopPropagation(); openDoc(d); }}>
              {PENDENTES.includes(d.status) ? (d.status === "PROGRAMADO" ? "Ver programa\u00e7\u00e3o" : "Resolver pend\u00eancia") : "Abrir documento"}
            </Button>
          </Box>
        ))}
      </Paper>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, mb: 2 }}>Alertas fiscais</Typography>
          {alerts.length === 0 && <Typography color="text.secondary">Nenhum alerta.</Typography>}
          {alerts.map((a) => (
            <Paper key={a.id} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2, opacity: a.resolved ? 0.6 : 1, cursor: a.fiscalDocumentId ? "pointer" : "default" }} onClick={() => void openDocById(a.fiscalDocumentId)}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{a.title}</Typography>
                <Chip size="small" label={a.resolved ? "Resolvido" : a.priority} color={a.resolved ? "success" : PRIO[a.priority] || "default"} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{a.description}</Typography>
            </Paper>
          ))}
        </Paper>

        <Paper id="envios-fiscais" variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>{"Hist\u00f3rico de envios"}</Typography>
            {sendFilter && <Button size="small" onClick={() => setSendFilter("")}>Mostrar todos</Button>}
          </Box>
          {sends.length === 0 && <Typography color="text.secondary">Nenhum envio registrado.</Typography>}
          {sends.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2, cursor: "pointer" }} onClick={() => void openDocById(s.fiscalDocumentId)}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{s.recipientName || s.destination}</Typography>
                <Chip size="small" label={s.status} color={ENVIO[s.status] || "default"} />
              </Box>
              <Typography variant="body2" color="text.secondary">{`${s.channel} \u2022 ${s.destination} \u2022 ${hora(s.sentAt || s.createdAt)}`}</Typography>
              {s.failureReason && <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>{s.failureReason}</Typography>}
            </Paper>
          ))}
        </Paper>
      </Box>

      <Dialog open={Boolean(doc)} onClose={() => { if (!busy) setDoc(null); }} fullWidth maxWidth="sm">
        <DialogTitle>{doc ? `${doc.payerName} \u2014 ${money(doc.amount)}` : ""}</DialogTitle>
        {doc && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Chip size="small" label={STATUS[doc.status]?.label || doc.status} color={STATUS[doc.status]?.color || "default"} />
              {doc.documentNumber && <Chip size="small" label={`N. ${doc.documentNumber}`} />}
              {doc.protocolNumber && <Chip size="small" label={`Protocolo ${doc.protocolNumber}`} />}
            </Box>
            {doc.status === "PROGRAMADO" && <Alert severity="info">{`Emiss\u00e3o programada para ${hora(doc.scheduledAt)}.`}</Alert>}
            {doc.failureReason && <Alert severity="error">{doc.failureReason}</Alert>}
            <TextField select label="Tipo de documento" value={form.kind || "NFSE"} onChange={f("kind")} disabled={emitido}>
              <MenuItem value="NFSE">NFS-e</MenuItem>
              <MenuItem value="RECEITA_SAUDE">{"Receita Sa\u00fade"}</MenuItem>
              <MenuItem value="RECIBO">Recibo</MenuItem>
            </TextField>
            <TextField label={"CPF ou CNPJ do pagador"} value={form.payerDocument || ""} onChange={f("payerDocument")} />
            <TextField label="E-mail do pagador" value={form.payerEmail || ""} onChange={f("payerEmail")} />
            <TextField label="Telefone do pagador" value={form.payerPhone || ""} onChange={f("payerPhone")} />
            <Typography sx={{ fontWeight: 800, mt: 1 }}>{emitido ? "Documento emitido" : "Registrar emiss\u00e3o"}</Typography>
            <TextField label={"N\u00famero da nota ou recibo"} value={form.documentNumber || ""} onChange={f("documentNumber")} disabled={emitido} />
            <TextField label={"Protocolo (Receita Sa\u00fade)"} value={form.protocolNumber || ""} onChange={f("protocolNumber")} disabled={emitido} />
            <TextField label="Link do documento (opcional)" value={form.documentUrl || ""} onChange={f("documentUrl")} disabled={emitido} />
          </DialogContent>
        )}
        {doc && (
          <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button disabled={busy} onClick={() => setDoc(null)}>Fechar</Button>
            <Button disabled={busy} onClick={() => void run(() => FiscalApi.update(doc.id, { kind: form.kind, payerDocument: form.payerDocument, payerEmail: form.payerEmail, payerPhone: form.payerPhone }), () => "Dados do pagador atualizados.")}>Salvar dados</Button>
            {!emitido && <Button variant="contained" disabled={busy} onClick={() => void run(async () => { await FiscalApi.update(doc.id, { kind: form.kind, payerDocument: form.payerDocument, payerEmail: form.payerEmail, payerPhone: form.payerPhone }); return FiscalApi.issue(doc.id, { documentNumber: form.documentNumber, protocolNumber: form.protocolNumber, documentUrl: form.documentUrl }); }, () => "Emiss\u00e3o registrada e documento enviado ao pagador.")}>{"Registrar emiss\u00e3o e enviar"}</Button>}
            {emitido && doc.documentUrl && <Button href={doc.documentUrl} target="_blank" rel="noopener">Abrir documento</Button>}
            {emitido && <Button disabled={busy} onClick={() => void run(() => FiscalApi.send(doc.id), () => "Documento reenviado.")}>Reenviar</Button>}
            {emitido && doc.status !== "CONCLUIDO" && <Button variant="contained" disabled={busy} onClick={() => void run(() => FiscalApi.conclude(doc.id), () => "Documento conclu\u00eddo.")}>Concluir</Button>}
          </DialogActions>
        )}
      </Dialog>

      <Dialog open={Boolean(rules)} onClose={() => { if (!busy) setRules(null); }} fullWidth maxWidth="sm">
        <DialogTitle>{"Regras de emiss\u00e3o"}</DialogTitle>
        {rules && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
            <FormControlLabel control={<Switch checked={rules.autoProcess} onChange={(e) => setRules({ ...rules, autoProcess: e.target.checked })} />} label={"Programar emiss\u00e3o automaticamente ap\u00f3s o pagamento"} />
            <TextField type="number" label="Prazo para programar (minutos)" value={rules.issueDelayMinutes} onChange={(e) => setRules({ ...rules, issueDelayMinutes: Number(e.target.value) })} />
            <TextField select label={"Documento padr\u00e3o da cl\u00ednica (PJ)"} value={rules.defaultKindPJ} onChange={(e) => setRules({ ...rules, defaultKindPJ: e.target.value })}>
              <MenuItem value="NFSE">NFS-e</MenuItem>
              <MenuItem value="RECIBO">Recibo</MenuItem>
            </TextField>
            <TextField select label={"Documento padr\u00e3o do profissional (PF)"} value={rules.defaultKindPF} onChange={(e) => setRules({ ...rules, defaultKindPF: e.target.value })}>
              <MenuItem value="RECEITA_SAUDE">{"Receita Sa\u00fade"}</MenuItem>
              <MenuItem value="RECIBO">Recibo</MenuItem>
            </TextField>
            <TextField label="Canais de envio (EMAIL, WHATSAPP, SMS)" value={rules.sendChannels} onChange={(e) => setRules({ ...rules, sendChannels: e.target.value })} helperText={"Separe por v\u00edrgula. E-mail funciona mesmo sem canal configurado."} />
            <TextField label={"C\u00f3digo do servi\u00e7o (NFS-e)"} value={rules.serviceCode || ""} onChange={(e) => setRules({ ...rules, serviceCode: e.target.value })} />
            <TextField type="number" label={"Al\u00edquota de ISS (%)"} value={rules.issRate ?? ""} onChange={(e) => setRules({ ...rules, issRate: e.target.value === "" ? null : Number(e.target.value) })} />
          </DialogContent>
        )}
        <DialogActions>
          <Button disabled={busy} onClick={() => setRules(null)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !rules} onClick={() => rules && void run(() => FiscalApi.saveRules(rules), () => "Regras salvas.")}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Resumo({ titulo, valor, icone, onClick }: { titulo: string; valor: string; icone: ReactNode; onClick: () => void }) {
  return (
    <Paper variant="outlined" onClick={onClick} sx={{ p: 2.5, borderRadius: 3, cursor: "pointer", transition: "0.15s", "&:hover": { borderColor: "primary.main", boxShadow: 2 } }}>
      <Box sx={{ width: 42, height: 42, mb: 1.5, borderRadius: 2, bgcolor: "primary.main", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>{icone}</Box>
      <Typography color="text.secondary">{titulo}</Typography>
      <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 900 }}>{valor}</Typography>
    </Paper>
  );
}