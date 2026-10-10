import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Box, Chip, Paper, TextField, Typography } from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import CalculateIcon from "@mui/icons-material/Calculate";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PageHeader from "../components/PageHeader";
import { BackofficeApi, type AccountingOverview, type TaxObligationRow } from "../services/BackofficeApi";
import { readDemoAccess } from "../services/DemoAccess";
import { accountingEntries, formatAccountingMoney, getAccountingSummary } from "../services/AccountingService";

const money = formatAccountingMoney;
const ISSUER: Record<string, string> = { INSTITUTO_RAVEL: "Instituto Ravel", NAO_INFORMADO: "Não informado" };
const STATUS: Record<string, { label: string; color: "success" | "warning" | "error" | "info" | "default" }> = {
  TO_CALCULATE: { label: "A calcular", color: "info" },
  IN_REVIEW: { label: "Em conferência", color: "warning" },
  WAITING_APPROVAL: { label: "Aguardando aprovação", color: "warning" },
  SCHEDULED: { label: "Programada", color: "info" },
  TRANSMITTED: { label: "Transmitida", color: "success" },
  PAID: { label: "Paga", color: "success" },
  OVERDUE: { label: "Vencida", color: "error" },
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function demoOverview(month: string): AccountingOverview {
  const s = getAccountingSummary();
  return {
    month, entryCount: accountingEntries.length, revenue: s.totalRevenue, expenses: s.totalExpenses, result: s.netCashFlow,
    taxEstimated: s.totalTaxes, taxOpen: s.totalTaxes, pendingDocuments: 0, pendingReview: 0, overdue: 0,
    openObligations: s.pendingObligations, byIssuer: [], readyToClose: false, blockers: ["Dados de demonstração."],
    pendingDocumentList: [], activeAccountants: 0, activeBankConnections: 0,
  };
}

function Card({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
      <Box sx={{ width: 46, height: 46, mb: 2, borderRadius: 2, bgcolor: "primary.main", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</Box>
      <Typography color="text.secondary">{title}</Typography>
      <Typography variant="h5" sx={{ mt: 1, fontWeight: 900 }}>{value}</Typography>
    </Paper>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
      <Typography sx={{ fontWeight: 900, mb: 1.5 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

export default function Accounting() {
  const demo = Boolean(readDemoAccess()?.isDemo);
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<AccountingOverview | null>(null);
  const [obligations, setObligations] = useState<TaxObligationRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (demo) {
        setData(demoOverview(month));
        setObligations([]);
      } else {
        const [o, t] = await Promise.all([BackofficeApi.accountingOverview(month), BackofficeApi.taxObligations()]);
        setData(o);
        setObligations(t.filter((x) => x.competence === month));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os dados contábeis.");
    } finally {
      setLoading(false);
    }
  }, [demo, month]);

  useEffect(() => { void load(); }, [load]);

  const empty = useMemo(() => !loading && data !== null && data.entryCount === 0 && obligations.length === 0, [loading, data, obligations]);

  return (
    <Box>
      <PageHeader title="Contábil e Fiscal" description="Resumo contábil do mês a partir dos lançamentos financeiros, pendências de documentos e obrigações fiscais." />

      <Alert severity="info" sx={{ mb: 3 }}>
        Ambiente de preparação e conferência: os valores abaixo são derivados dos lançamentos registrados e não substituem a apuração oficial do contador responsável.
      </Alert>

      <Box sx={{ mb: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField type="month" label="Competência" size="small" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {data && (data.readyToClose
          ? <Chip color="success" label="Pronto para fechamento" />
          : <Chip color="warning" label={`${data.blockers.length} pendência(s) para o fechamento`} />)}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {loading && <Typography color="text.secondary">Carregando...</Typography>}
      {empty && <Alert severity="info" sx={{ mb: 3 }}>Nenhum lançamento nesta competência. Registre receitas e despesas no Financeiro para acompanhar o resumo contábil aqui.</Alert>}

      {data && !loading && (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 3, mb: 4 }}>
            <Card title="Receitas líquidas" value={money(data.revenue)} icon={<PaymentsIcon />} />
            <Card title="Despesas" value={money(data.expenses)} icon={<ReceiptLongIcon />} />
            <Card title="Resultado do mês (DRE simples)" value={money(data.result)} icon={<AssessmentIcon />} />
            <Card title="Obrigações fiscais cadastradas" value={money(data.taxEstimated)} icon={<CalculateIcon />} />
          </Box>

          <Panel title="Fechamento mensal">
            {data.blockers.length === 0
              ? <Typography color="text.secondary">Sem pendências: lançamentos conferidos, documentos anexados e obrigações quitadas.</Typography>
              : data.blockers.map((b) => <Typography key={b} color="text.secondary">• {b}</Typography>)}
          </Panel>

          {data.byIssuer.length > 0 && (
            <Panel title="Receitas e despesas por entidade emissora">
              {data.byIssuer.map((i) => (
                <Box key={i.issuerEntity} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{ISSUER[i.issuerEntity] || i.issuerEntity}</Typography>
                  <Typography color="text.secondary">Receitas {money(i.revenue)} · Despesas {money(i.expense)}</Typography>
                </Box>
              ))}
            </Panel>
          )}

          <Panel title="Pendências de documentos fiscais">
            {data.pendingDocumentList.length === 0
              ? <Typography color="text.secondary">Nenhum lançamento pago sem documento fiscal nesta competência.</Typography>
              : data.pendingDocumentList.map((p) => (
                <Box key={p.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
                  <Typography>{p.description} — {p.personName}</Typography>
                  <Typography sx={{ fontWeight: 700 }}>{money(p.amount)}</Typography>
                </Box>
              ))}
            {data.pendingDocuments > data.pendingDocumentList.length && <Typography variant="caption" color="text.secondary">Exibindo os primeiros {data.pendingDocumentList.length} de {data.pendingDocuments}.</Typography>}
          </Panel>

          <Panel title="Obrigações fiscais da competência">
            {obligations.length === 0
              ? <Typography color="text.secondary">{demo ? "Obrigações não exibidas no modo demonstração." : "Nenhuma obrigação cadastrada para esta competência. As obrigações são cadastradas no Backoffice."}</Typography>
              : obligations.map((o) => {
                const st = STATUS[o.status] || { label: o.status, color: "default" as const };
                return (
                  <Box key={o.id} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.75, flexWrap: "wrap" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{o.name} — {o.entityName}</Typography>
                      <Typography variant="caption" color="text.secondary">Vencimento {new Date(o.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                      <Typography sx={{ fontWeight: 700 }}>{money(Number(o.finalValue ?? o.estimatedValue))}</Typography>
                      <Chip size="small" color={st.color} label={st.label} />
                    </Box>
                  </Box>
                );
              })}
          </Panel>

          <Panel title="Conciliação bancária">
            <Typography color="text.secondary">
              {data.activeBankConnections > 0
                ? `${data.activeBankConnections} conta(s) bancária(s) conectada(s). A importação de extratos para conciliação ainda não está habilitada: configuração pendente.`
                : "Configuração pendente: nenhuma conta bancária conectada. A conciliação será exibida após a conexão e a importação de extratos."}
            </Typography>
          </Panel>

          <Panel title="Simulação de regime tributário e emissão de notas">
            <Typography color="text.secondary">
              Configuração pendente: a simulação entre regimes exige o regime atual, o anexo/atividade e o histórico de faturamento validados pelo contador. A emissão de notas fiscais depende de certificado digital e provedor fiscal configurados; os documentos a emitir ficam em Automação Fiscal.
            </Typography>
          </Panel>
        </>
      )}
    </Box>
  );
}
