import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import PageHeader from "../components/PageHeader";
import { loadBackendPatients, type BackendPatient } from "../services/PatientApi";
import { MembershipApi, type LedgerRow, type MembershipPlan, type MembershipRow, type MembershipSummary, type UsePreview } from "../services/MembershipApi";

const brl = (v: number | string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const STATUS: Record<string, { label: string; color: "success" | "warning" | "error" | "default" }> = {
  ATIVA: { label: "Ativa", color: "success" }, AGUARDANDO_PAGAMENTO: { label: "Aguardando 1º pagamento", color: "warning" },
  INADIMPLENTE: { label: "Em atraso", color: "error" }, PAUSADA: { label: "Pausada", color: "default" }, CANCELADA: { label: "Cancelada", color: "default" },
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Assinatura do paciente: mensalidade (Pix) vira crédito; ao usar o crédito num procedimento o paciente ganha desconto.
export default function Membership() {
  const [tab, setTab] = useState(0);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [patients, setPatients] = useState<BackendPatient[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [planDlg, setPlanDlg] = useState<Partial<MembershipPlan> | null>(null);
  const [newDlg, setNewDlg] = useState(false);
  const [newForm, setNewForm] = useState({ patientId: "", planId: "", billingDay: "5" });
  const [useDlg, setUseDlg] = useState<MembershipRow | null>(null);
  const [useForm, setUseForm] = useState({ value: "", description: "" });
  const [preview, setPreview] = useState<UsePreview | null>(null);
  const [ledgerDlg, setLedgerDlg] = useState<MembershipRow | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [pix, setPix] = useState<{ row: MembershipRow; text: string; phone: string; emailMsg: string } | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([MembershipApi.plans(), MembershipApi.members()]);
      setPlans(p); setRows(m.members); setSummary(m.summary);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar."); }
  }, []);
  useEffect(() => { void load(); loadBackendPatients().then(setPatients).catch(() => undefined); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(""); }
  };

  useEffect(() => {
    const v = Number(useForm.value.replace(",", "."));
    if (!useDlg || !(v > 0)) { setPreview(null); return; }
    const t = setTimeout(() => { MembershipApi.preview(useDlg.id, v).then(setPreview).catch(() => setPreview(null)); }, 250);
    return () => clearTimeout(t);
  }, [useDlg, useForm.value]);

  const shown = useMemo(() => rows.filter((r) => !filter || norm(r.patient?.fullName || "").includes(norm(filter))), [rows, filter]);
  const activePlans = plans.filter((p) => p.active);

  const sendPix = (r: MembershipRow) => run(`pix-${r.id}`, async () => {
    const res = await MembershipApi.sendPix(r.id);
    setPix({ row: r, text: res.text, phone: res.phone, emailMsg: res.email.sent ? `Enviado por e-mail para ${res.email.to}.` : `E-mail não enviado: ${res.email.reason || "sem e-mail"}.` });
  });

  return (
    <Box sx={{ textAlign: "left" }}>
      <PageHeader title="Assinatura do paciente" description="Mensalidade por Pix que vira crédito. Quem usa o crédito no tratamento ganha desconto." />
      {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2 }}>
        {[["Assinantes ativos", String(summary?.active ?? 0)], ["Receita mensal", brl(summary?.monthlyRevenue ?? 0)], ["Crédito dos pacientes", brl(summary?.creditBalance ?? 0)], ["Em atraso", String(summary?.late ?? 0)]].map(([k, v]) => (
          <Paper key={k} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="body2" color="text.secondary">{k}</Typography>
            <Typography sx={{ fontWeight: 900, fontSize: 24 }}>{v}</Typography>
          </Paper>
        ))}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Assinantes" /><Tab label="Planos" />
      </Tabs>

      {tab === 0 && (
        <>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            <TextField size="small" label="Buscar paciente" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 220 }} />
            <Button variant="contained" onClick={() => { setNewForm({ patientId: "", planId: activePlans[0]?.id || "", billingDay: "5" }); setNewDlg(true); }} disabled={!activePlans.length}>Nova assinatura</Button>
            {!activePlans.length && <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>Crie um plano na aba Planos para começar.</Typography>}
          </Box>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {shown.length === 0 && <Typography color="text.secondary">Nenhum assinante ainda.</Typography>}
            {shown.map((r) => {
              const st = STATUS[r.status] || STATUS.PAUSADA;
              return (
                <Paper key={r.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                    <Box sx={{ minWidth: 200 }}>
                      <Typography sx={{ fontWeight: 900, fontSize: 18 }}>{r.patient?.fullName || "Paciente"}</Typography>
                      <Typography variant="body2" color="text.secondary">{`${r.plan?.name || "Plano"} • ${brl(r.plan?.monthlyPrice || 0)} por mês • vence dia ${r.billingDay}`}</Typography>
                      <Chip size="small" color={st.color} label={st.label} sx={{ mt: 0.5 }} />
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="body2" color="text.secondary">Saldo de crédito</Typography>
                      <Typography sx={{ fontWeight: 900, fontSize: 26, color: r.balance > 0 ? "success.main" : "text.primary" }}>{brl(r.balance)}</Typography>
                    </Box>
                  </Box>
                  {r.openInvoice && (
                    <Alert severity={r.status === "INADIMPLENTE" ? "error" : "info"} sx={{ mt: 1.5 }}>
                      {`Mensalidade ${r.openInvoice.competence}: ${brl(r.openInvoice.amount)} • vence ${day(r.openInvoice.dueDate)} • ${r.openInvoice.pixCopyPaste ? "Pix gerado" : "sem Pix (baixa manual)"}`}
                    </Alert>
                  )}
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
                    <Button size="small" variant="contained" disabled={!!busy || r.status === "CANCELADA"} onClick={() => { setUseForm({ value: "", description: "" }); setPreview(null); setUseDlg(r); }}>Usar crédito (-{r.plan?.discountPct ?? 10}%)</Button>
                    {r.openInvoice ? (
                      <>
                        <Button size="small" variant="outlined" disabled={!!busy} onClick={() => void sendPix(r)}>Enviar Pix</Button>
                        <Button size="small" variant="outlined" disabled={!!busy} onClick={() => void run(`paid-${r.id}`, async () => { await MembershipApi.markPaid(r.openInvoice!.id); setNotice("Mensalidade baixada e crédito liberado."); })}>Pago na clínica</Button>
                      </>
                    ) : r.status !== "CANCELADA" && (
                      <Button size="small" variant="outlined" disabled={!!busy} onClick={() => void run(`charge-${r.id}`, async () => { const x = await MembershipApi.charge(r.id); setNotice(x.warning ? `Cobrança criada sem Pix: ${x.warning}` : "Cobrança do mês gerada."); })}>Gerar cobrança do mês</Button>
                    )}
                    <Button size="small" disabled={!!busy} onClick={() => { setLedger([]); setLedgerDlg(r); MembershipApi.ledger(r.id).then(setLedger).catch(() => undefined); }}>Extrato</Button>
                    {r.status === "ATIVA" && <Button size="small" color="inherit" disabled={!!busy} onClick={() => void run(`s-${r.id}`, () => MembershipApi.setStatus(r.id, "PAUSADA").then(() => undefined))}>Pausar</Button>}
                    {r.status === "PAUSADA" && <Button size="small" disabled={!!busy} onClick={() => void run(`s-${r.id}`, () => MembershipApi.setStatus(r.id, "ATIVA").then(() => undefined))}>Reativar</Button>}
                    {r.status !== "CANCELADA" && <Button size="small" color="error" disabled={!!busy} onClick={() => { if (window.confirm("Cancelar esta assinatura? O saldo continua registrado no extrato.")) void run(`s-${r.id}`, () => MembershipApi.setStatus(r.id, "CANCELADA").then(() => undefined)); }}>Cancelar</Button>}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </>
      )}

      {tab === 1 && (
        <>
          <Button variant="contained" sx={{ mb: 2 }} onClick={() => setPlanDlg({ name: "", monthlyPrice: "", monthlyCredit: "", discountPct: 10, active: true })}>Novo plano</Button>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
            {plans.length === 0 && <Typography color="text.secondary">Nenhum plano ainda. Exemplo: Plano Sorriso, R$ 99 por mês, vira R$ 99 de crédito, 10% de desconto no uso.</Typography>}
            {plans.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 2, borderRadius: 3, opacity: p.active ? 1 : 0.6 }}>
                <Typography sx={{ fontWeight: 900, fontSize: 18 }}>{p.name}</Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 28 }}>{brl(p.monthlyPrice)}<Typography component="span" color="text.secondary"> /mês</Typography></Typography>
                <Typography variant="body2">{`Vira ${brl(p.monthlyCredit)} de crédito`}</Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>{`${Number(p.discountPct)}% de desconto ao usar o crédito`}</Typography>
                {p.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{p.description}</Typography>}
                <Button size="small" onClick={() => setPlanDlg(p)}>Editar</Button>
              </Paper>
            ))}
          </Box>
        </>
      )}

      <Dialog open={!!planDlg} onClose={() => setPlanDlg(null)} fullWidth maxWidth="xs">
        <DialogTitle>{planDlg?.id ? "Editar plano" : "Novo plano"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Nome do plano" value={planDlg?.name || ""} onChange={(e) => setPlanDlg({ ...planDlg, name: e.target.value })} />
          <TextField label="Mensalidade (R$)" value={planDlg?.monthlyPrice ?? ""} onChange={(e) => setPlanDlg({ ...planDlg, monthlyPrice: e.target.value })} />
          <TextField label="Crédito liberado por mês (R$)" helperText="Se ficar vazio, vira o valor da mensalidade." value={planDlg?.monthlyCredit ?? ""} onChange={(e) => setPlanDlg({ ...planDlg, monthlyCredit: e.target.value })} />
          <TextField label="Desconto ao usar o crédito (%)" value={planDlg?.discountPct ?? 10} onChange={(e) => setPlanDlg({ ...planDlg, discountPct: e.target.value })} />
          <TextField label="Descrição (opcional)" value={planDlg?.description || ""} onChange={(e) => setPlanDlg({ ...planDlg, description: e.target.value })} />
          {planDlg?.id && <TextField select label="Situação" value={planDlg.active ? "1" : "0"} onChange={(e) => setPlanDlg({ ...planDlg, active: e.target.value === "1" })}><MenuItem value="1">Ativo</MenuItem><MenuItem value="0">Desativado (não aceita novos)</MenuItem></TextField>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDlg(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!!busy} onClick={() => void run("plan", async () => { await MembershipApi.savePlan({ ...planDlg, monthlyCredit: planDlg?.monthlyCredit === "" ? undefined : planDlg?.monthlyCredit }, planDlg?.id); setPlanDlg(null); })}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newDlg} onClose={() => setNewDlg(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nova assinatura</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Autocomplete options={patients} getOptionLabel={(p) => p.fullName} isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(o, s) => o.filter((p) => norm(p.fullName).includes(norm(s.inputValue))).slice(0, 40)}
            onChange={(_, v) => setNewForm({ ...newForm, patientId: v?.id || "" })} noOptionsText="Nenhum paciente encontrado"
            renderInput={(params) => <TextField {...params} label="Paciente" placeholder="Digite o nome" />} />
          <TextField select label="Plano" value={newForm.planId} onChange={(e) => setNewForm({ ...newForm, planId: e.target.value })}>
            {activePlans.map((p) => <MenuItem key={p.id} value={p.id}>{`${p.name} • ${brl(p.monthlyPrice)}`}</MenuItem>)}
          </TextField>
          <TextField label="Dia do vencimento (1 a 28)" value={newForm.billingDay} onChange={(e) => setNewForm({ ...newForm, billingDay: e.target.value })} />
          <Typography variant="body2" color="text.secondary">A primeira mensalidade é gerada agora com Pix. Quando o paciente pagar, o crédito é liberado sozinho.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewDlg(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!!busy || !newForm.patientId || !newForm.planId} onClick={() => void run("new", async () => { const r = await MembershipApi.subscribe(newForm.patientId, newForm.planId, Number(newForm.billingDay)); setNewDlg(false); setNotice(r.first?.warning ? `Assinatura criada, mas o Pix falhou: ${r.first.warning}` : r.first?.manual ? "Assinatura criada. Conecte o Asaas para gerar Pix automático; por enquanto use “Pago na clínica”." : "Assinatura criada e Pix gerado. Use “Enviar Pix”."); })}>Criar assinatura</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!useDlg} onClose={() => setUseDlg(null)} fullWidth maxWidth="xs">
        <DialogTitle>{`Usar crédito • ${useDlg?.patient?.fullName || ""}`}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <Typography>{`Saldo: ${brl(useDlg?.balance || 0)}`}</Typography>
          <TextField label="Procedimento" value={useForm.description} onChange={(e) => setUseForm({ ...useForm, description: e.target.value })} />
          <TextField label="Valor do procedimento (R$)" value={useForm.value} onChange={(e) => setUseForm({ ...useForm, value: e.target.value })} />
          {preview && (
            <Alert severity={preview.enough ? "success" : "warning"}>
              {`Desconto de ${preview.discountPct}%: -${brl(preview.discountAmount)}. Sai do crédito: ${brl(preview.debit)}.${preview.enough ? ` Sobra ${brl(preview.balance - preview.debit)}.` : " Saldo insuficiente."}`}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUseDlg(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!!busy || !preview?.enough || !useForm.description.trim()} onClick={() => void run("use", async () => { const r = await MembershipApi.use(useDlg!.id, Number(useForm.value.replace(",", ".")), useForm.description.trim()); setUseDlg(null); setNotice(`Crédito usado: debitado ${brl(r.debit)} (economia de ${brl(r.discountAmount)}). Novo saldo ${brl(r.balance)}.`); })}>Confirmar uso</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!ledgerDlg} onClose={() => setLedgerDlg(null)} fullWidth maxWidth="sm">
        <DialogTitle>{`Extrato • ${ledgerDlg?.patient?.fullName || ""}`}</DialogTitle>
        <DialogContent>
          {ledger.length === 0 ? <Typography color="text.secondary">Sem movimentos ainda.</Typography> : ledger.map((l) => (
            <Box key={l.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{l.description}</Typography><Typography variant="caption" color="text.secondary">{new Date(l.createdAt).toLocaleString("pt-BR")}</Typography></Box>
              <Box sx={{ textAlign: "right" }}><Typography sx={{ fontWeight: 900, color: l.amount >= 0 ? "success.main" : "text.primary" }}>{`${l.amount >= 0 ? "+" : ""}${brl(l.amount)}`}</Typography><Typography variant="caption" color="text.secondary">{`saldo ${brl(l.balanceAfter)}`}</Typography></Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setLedgerDlg(null)}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={!!pix} onClose={() => setPix(null)} fullWidth maxWidth="sm">
        <DialogTitle>{`Enviar Pix • ${pix?.row.patient?.fullName || ""}`}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, pt: "12px!important" }}>
          <Alert severity="info">{pix?.emailMsg}</Alert>
          <TextField multiline minRows={6} label="Mensagem pronta para WhatsApp" value={pix?.text || ""} slotProps={{ input: { readOnly: true } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { void navigator.clipboard?.writeText(pix?.text || ""); setNotice("Mensagem copiada."); }}>Copiar</Button>
          <Button variant="contained" disabled={!pix?.phone} onClick={() => { const p = pix!.phone.startsWith("55") ? pix!.phone : `55${pix!.phone}`; window.open(`https://wa.me/${p}?text=${encodeURIComponent(pix!.text)}`, "_blank", "noopener"); }}>Abrir no WhatsApp</Button>
          <Button onClick={() => setPix(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
