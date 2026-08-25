import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AddIcon from "@mui/icons-material/Add";
import GroupsIcon from "@mui/icons-material/Groups";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import WorkIcon from "@mui/icons-material/Work";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { listFinanceEntries, saveFinanceEntries, type FinanceEntry } from "../services/FinanceHubService";
import {
  BackofficeApi,
  type AccountantAccessRow,
  type BackofficeDashboard,
  type SupplierRow,
  type TaxObligationRow,
} from "../services/BackofficeApi";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const brDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
};

const taxStatusColor = (status: string): "success" | "warning" | "error" | "info" | "default" => {
  if (["PAID", "TRANSMITTED"].includes(status)) return "success";
  if (["APPROVED", "PROGRAMMED"].includes(status)) return "info";
  if (["OVERDUE"].includes(status)) return "error";
  if (["TO_CALCULATE", "REVIEW", "PENDING"].includes(status)) return "warning";
  return "default";
};

export default function Backoffice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [dashboard, setDashboard] = useState<BackofficeDashboard | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [taxes, setTaxes] = useState<TaxObligationRow[]>([]);
  const [accountants, setAccountants] = useState<AccountantAccessRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [accountantOpen, setAccountantOpen] = useState(searchParams.get("secao") === "contador");
  const [supplierForm, setSupplierForm] = useState({ name: "", document: "", category: "Geral", email: "", phone: "" });
  const [taxForm, setTaxForm] = useState({ name: "", entityName: "", competence: new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }), dueDate: "", estimatedValue: "", responsible: "", requiresAccountantApproval: true });
  const [accountantForm, setAccountantForm] = useState({ name: "", email: "", canViewFinance: true, canViewTax: true, canViewPayroll: false, canExport: true, canApproveTax: false });

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [summary, supplierRows, taxRows, accountantRows] = await Promise.all([
        BackofficeApi.dashboard(),
        BackofficeApi.suppliers(),
        BackofficeApi.taxObligations(),
        BackofficeApi.accountantAccesses(),
      ]);
      setDashboard(summary);
      setSuppliers(supplierRows);
      setTaxes(taxRows);
      setAccountants(accountantRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o backoffice.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const taxOpenValue = useMemo(
    () => taxes.filter((row) => !["PAID", "TRANSMITTED"].includes(row.status)).reduce((total, row) => total + Number(row.finalValue ?? row.estimatedValue), 0),
    [taxes],
  );

  async function prepareAccounting() {
    setBusy(true);
    setError("");
    try {
      await Promise.all([BackofficeApi.bootstrapAccounts(), BackofficeApi.bootstrapCostCenters()]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preparar estrutura contábil.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSupplier() {
    if (!supplierForm.name.trim()) return;
    setBusy(true);
    try {
      await BackofficeApi.createSupplier(supplierForm);
      setSupplierOpen(false);
      setSupplierForm({ name: "", document: "", category: "Geral", email: "", phone: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar fornecedor.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTax() {
    if (!taxForm.name.trim() || !taxForm.entityName.trim() || !taxForm.dueDate) return;
    setBusy(true);
    try {
      await BackofficeApi.createTaxObligation({ ...taxForm, estimatedValue: Number(taxForm.estimatedValue || 0), legalEntity: "PJ" });
      setTaxOpen(false);
      setTaxForm({ name: "", entityName: "", competence: new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }), dueDate: "", estimatedValue: "", responsible: "", requiresAccountantApproval: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar obrigação fiscal.");
    } finally {
      setBusy(false);
    }
  }

  async function approveTax(row: TaxObligationRow) {
    setBusy(true);
    try {
      const approved = await BackofficeApi.approveTaxObligation(row.id, Number(row.finalValue ?? row.estimatedValue));
      const finance = listFinanceEntries().filter((entry) => !(entry.origin === "Fiscal" && entry.originId === row.id));
      const amount = Number(approved.finalValue ?? approved.estimatedValue);
      const localEntry: FinanceEntry = {
        id: Date.now(),
        description: `${approved.name} • ${approved.competence}`,
        category: "Tributos",
        personName: approved.entityName,
        type: "Despesa",
        status: "Pendente",
        value: amount,
        dueDate: approved.dueDate.slice(0, 10),
        competenceDate: approved.dueDate.slice(0, 10),
        paymentMethod: "Transferência",
        provider: "Manual",
        origin: "Fiscal",
        originId: row.id,
        notes: "Gerado automaticamente após aprovação no Contábil/Fiscal.",
      };
      saveFinanceEntries([localEntry, ...finance]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar obrigação fiscal.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAccountant() {
    if (!accountantForm.name.trim() || !accountantForm.email.trim()) return;
    setBusy(true);
    try {
      await BackofficeApi.createAccountantAccess(accountantForm);
      setAccountantOpen(false);
      setAccountantForm({ name: "", email: "", canViewFinance: true, canViewTax: true, canViewPayroll: false, canExport: true, canApproveTax: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao configurar acesso do contador.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <PageHeader
        title="Backoffice Integrado"
        description="Contas a pagar e receber, contábil/fiscal, fornecedores, folha e portal do contador em um único fluxo."
        actionLabel="Atualizar"
        actionIcon={<SyncAltIcon />}
        onAction={() => void load()}
      />

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      <Alert severity="info" sx={{ mb: 3 }}>
        Fechamentos do RH podem gerar contas a pagar automaticamente. Obrigações fiscais aprovadas pelo responsável também entram no financeiro sem retrabalho.
      </Alert>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 2, mb: 3 }}>
        <SummaryCard title="Contas a receber" value={money(dashboard?.receivable || 0)} icon={<PaymentsIcon />} helper={`${dashboard?.overdueCount || 0} vencimentos em atraso`} />
        <SummaryCard title="Contas a pagar" value={money(dashboard?.payable || 0)} icon={<ReceiptLongIcon />} helper={`Vencido: ${money(dashboard?.overdueValue || 0)}`} />
        <SummaryCard title="Caixa realizado no mês" value={money(dashboard?.cashResultThisMonth || 0)} icon={<AccountBalanceIcon />} helper={`Recebido ${money(dashboard?.receivedThisMonth || 0)}`} />
        <SummaryCard title="Fiscal pendente" value={money(dashboard?.taxPendingValue || taxOpenValue)} icon={<AccountBalanceIcon />} helper={`${dashboard?.taxPending || taxes.length} obrigações`} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.15fr .85fr" }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Financeiro empresarial</Typography>
              <Typography variant="body2" color="text.secondary">Recebimentos, despesas, vencidos, fornecedores e DRE.</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="contained" onClick={() => navigate("/financeiro?tipo=Receita")}>Contas a receber</Button>
              <Button variant="outlined" onClick={() => navigate("/financeiro?tipo=Despesa")}>Contas a pagar</Button>
              <Button onClick={() => navigate("/contabil-fiscal")}>DRE e contábil</Button>
            </Box>
          </Box>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.5 }}>
            <MiniMetric label="Conferência contábil" value={`${dashboard?.accountingPending || 0} lançamentos`} />
            <MiniMetric label="Fornecedores ativos" value={String(dashboard?.suppliers ?? suppliers.filter((row) => row.isActive).length)} />
            <MiniMetric label="Contadores ativos" value={String(dashboard?.activeAccountants ?? accountants.filter((row) => row.status === "ACTIVE").length)} />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Estrutura contábil</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Plano de contas e centros de custo separados por clínica/tenant.</Typography>
          <Button variant="contained" disabled={busy} onClick={() => void prepareAccounting()}>Preparar estrutura padrão</Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            A estrutura é operacional. Guias, transmissões e decisões tributárias continuam sujeitas à revisão do contador responsável.
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3, mt: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Obrigações fiscais</Typography>
              <Typography variant="body2" color="text.secondary">Aprovação cria automaticamente a conta a pagar correspondente.</Typography>
            </Box>
            <Button startIcon={<AddIcon />} onClick={() => setTaxOpen(true)}>Nova</Button>
          </Box>
          <Divider sx={{ my: 2 }} />
          {taxes.length === 0 ? (
            <Typography color="text.secondary">Nenhuma obrigação fiscal cadastrada.</Typography>
          ) : taxes.slice(0, 8).map((row) => (
            <Box key={row.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr auto" }, gap: 1.5, alignItems: "center", py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{row.name} • {row.competence}</Typography>
                <Typography variant="body2" color="text.secondary">{row.entityName} • vence {brDate(row.dueDate)} • {money(Number(row.finalValue ?? row.estimatedValue))}</Typography>
              </Box>
              <Chip size="small" label={row.status} color={taxStatusColor(row.status)} />
              <Button size="small" variant="outlined" disabled={busy || ["APPROVED", "PAID", "TRANSMITTED"].includes(row.status)} onClick={() => void approveTax(row)}>Aprovar</Button>
            </Box>
          ))}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>RH integrado ao financeiro</Typography>
              <Typography variant="body2" color="text.secondary">Folha líquida e encargos seguem para contas a pagar no fechamento.</Typography>
            </Box>
            <Button startIcon={<WorkIcon />} onClick={() => navigate("/rh")}>Abrir RH</Button>
          </Box>
          <Divider sx={{ my: 2 }} />
          {(dashboard?.payroll || []).length === 0 ? (
            <Typography color="text.secondary">Nenhum fechamento de folha encontrado.</Typography>
          ) : dashboard?.payroll.map((row) => (
            <Box key={row.id} sx={{ py: 1.3, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 800 }}>Folha {row.reference}</Typography>
                <Chip size="small" label={row.status} />
              </Box>
              <Typography variant="body2" color="text.secondary">Líquido {money(row.netPayroll)} • encargos {money(row.employerCharges)} • pagamento {brDate(row.paymentDate)}</Typography>
            </Box>
          ))}
        </Paper>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3, mt: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Fornecedores</Typography>
              <Typography variant="body2" color="text.secondary">Base única para compras, contas a pagar e classificação.</Typography>
            </Box>
            <Button startIcon={<AddIcon />} onClick={() => setSupplierOpen(true)}>Adicionar</Button>
          </Box>
          <Divider sx={{ my: 2 }} />
          {suppliers.slice(0, 8).map((row) => (
            <Box key={row.id} sx={{ py: 1.2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 800 }}>{row.name}</Typography>
              <Typography variant="body2" color="text.secondary">{row.category}{row.document ? ` • ${row.document}` : ""}</Typography>
            </Box>
          ))}
          {suppliers.length === 0 && <Typography color="text.secondary">Nenhum fornecedor cadastrado.</Typography>}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>Portal do Contador</Typography>
              <Typography variant="body2" color="text.secondary">Acesso restrito ao que a clínica autorizar.</Typography>
            </Box>
            <Button startIcon={<GroupsIcon />} onClick={() => setAccountantOpen(true)}>Convidar</Button>
          </Box>
          <Divider sx={{ my: 2 }} />
          {accountants.map((row) => (
            <Box key={row.id} sx={{ py: 1.2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 800 }}>{row.name}</Typography>
                <Chip size="small" label={row.status} color={row.status === "ACTIVE" ? "success" : "default"} />
              </Box>
              <Typography variant="body2" color="text.secondary">{row.email} • Financeiro {row.canViewFinance ? "sim" : "não"} • Fiscal {row.canViewTax ? "sim" : "não"} • Folha {row.canViewPayroll ? "sim" : "não"}</Typography>
            </Box>
          ))}
          {accountants.length === 0 && <Typography color="text.secondary">Nenhum contador convidado.</Typography>}
        </Paper>
      </Box>

      <Dialog open={supplierOpen} onClose={() => setSupplierOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo fornecedor</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Nome / razão social" required value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} />
          <TextField label="CPF/CNPJ" value={supplierForm.document} onChange={(event) => setSupplierForm({ ...supplierForm, document: event.target.value })} />
          <TextField label="Categoria" value={supplierForm.category} onChange={(event) => setSupplierForm({ ...supplierForm, category: event.target.value })} />
          <TextField label="E-mail" value={supplierForm.email} onChange={(event) => setSupplierForm({ ...supplierForm, email: event.target.value })} />
          <TextField label="Telefone" value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} />
        </DialogContent>
        <DialogActions><Button onClick={() => setSupplierOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy} onClick={() => void saveSupplier()}>Salvar</Button></DialogActions>
      </Dialog>

      <Dialog open={taxOpen} onClose={() => setTaxOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova obrigação fiscal</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          <TextField label="Obrigação / tributo" required value={taxForm.name} onChange={(event) => setTaxForm({ ...taxForm, name: event.target.value })} />
          <TextField label="Entidade / empresa" required value={taxForm.entityName} onChange={(event) => setTaxForm({ ...taxForm, entityName: event.target.value })} />
          <TextField label="Competência" value={taxForm.competence} onChange={(event) => setTaxForm({ ...taxForm, competence: event.target.value })} />
          <TextField label="Vencimento" type="date" slotProps={{ inputLabel: { shrink: true } }} value={taxForm.dueDate} onChange={(event) => setTaxForm({ ...taxForm, dueDate: event.target.value })} />
          <TextField label="Valor estimado" type="number" value={taxForm.estimatedValue} onChange={(event) => setTaxForm({ ...taxForm, estimatedValue: event.target.value })} />
          <TextField label="Responsável" value={taxForm.responsible} onChange={(event) => setTaxForm({ ...taxForm, responsible: event.target.value })} />
          <FormControlLabel control={<Switch checked={taxForm.requiresAccountantApproval} onChange={(event) => setTaxForm({ ...taxForm, requiresAccountantApproval: event.target.checked })} />} label="Exigir aprovação do contador/responsável" />
        </DialogContent>
        <DialogActions><Button onClick={() => setTaxOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy} onClick={() => void saveTax()}>Salvar</Button></DialogActions>
      </Dialog>

      <Dialog open={accountantOpen} onClose={() => setAccountantOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Portal do Contador</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1, pt: "12px!important" }}>
          <TextField label="Nome" required value={accountantForm.name} onChange={(event) => setAccountantForm({ ...accountantForm, name: event.target.value })} />
          <TextField label="E-mail" type="email" required value={accountantForm.email} onChange={(event) => setAccountantForm({ ...accountantForm, email: event.target.value })} />
          <FormControlLabel control={<Switch checked={accountantForm.canViewFinance} onChange={(event) => setAccountantForm({ ...accountantForm, canViewFinance: event.target.checked })} />} label="Ver financeiro" />
          <FormControlLabel control={<Switch checked={accountantForm.canViewTax} onChange={(event) => setAccountantForm({ ...accountantForm, canViewTax: event.target.checked })} />} label="Ver contábil e fiscal" />
          <FormControlLabel control={<Switch checked={accountantForm.canViewPayroll} onChange={(event) => setAccountantForm({ ...accountantForm, canViewPayroll: event.target.checked })} />} label="Ver dados de folha autorizados" />
          <FormControlLabel control={<Switch checked={accountantForm.canExport} onChange={(event) => setAccountantForm({ ...accountantForm, canExport: event.target.checked })} />} label="Exportar relatórios/documentos" />
          <FormControlLabel control={<Switch checked={accountantForm.canApproveTax} onChange={(event) => setAccountantForm({ ...accountantForm, canApproveTax: event.target.checked })} />} label="Aprovar obrigações fiscais" />
        </DialogContent>
        <DialogActions><Button onClick={() => setAccountantOpen(false)}>Cancelar</Button><Button variant="contained" disabled={busy} onClick={() => void saveAccountant()}>Criar acesso</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

function SummaryCard({ title, value, helper, icon }: { title: string; value: string; helper: string; icon: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
        <Box>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 900, my: 0.5 }}>{value}</Typography>
          <Typography variant="caption" color="text.secondary">{helper}</Typography>
        </Box>
        <Box sx={{ color: "primary.main" }}>{icon}</Box>
      </Box>
    </Paper>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 900 }}>{value}</Typography>
    </Box>
  );
}
