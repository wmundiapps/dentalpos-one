import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AddIcon from "@mui/icons-material/Add";
import AssessmentIcon from "@mui/icons-material/Assessment";
import CalculateIcon from "@mui/icons-material/Calculate";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  accountingEntries,
  bankTransactions,
  formatAccountingMoney,
  getAccountingSummary,
  getPFRevenue,
  getPJRevenue,
  taxObligations,
  taxRegimeSimulations,
} from "../services/AccountingService";

import type {
  AccountingEntryStatus,
  BankReconciliationStatus,
  TaxObligationStatus,
} from "../types/accounting";

function getEntryStatusColor(
  status: AccountingEntryStatus,
) {
  switch (status) {
    case "Pago":
    case "Recebido":
    case "Conciliado":
      return "success" as const;

    case "Pendente":
      return "warning" as const;

    case "Vencido":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getObligationStatusColor(
  status: TaxObligationStatus,
) {
  switch (status) {
    case "Paga":
    case "Transmitida":
      return "success" as const;

    case "Programada":
      return "primary" as const;

    case "Em conferência":
    case "Aguardando aprovação":
      return "warning" as const;

    case "Vencida":
      return "error" as const;

    default:
      return "info" as const;
  }
}

function getReconciliationColor(
  status: BankReconciliationStatus,
) {
  switch (status) {
    case "Conciliado":
      return "success" as const;

    case "Sugestão encontrada":
      return "info" as const;

    case "Não identificado":
      return "warning" as const;

    default:
      return "default" as const;
  }
}

export default function Accounting() {
  const summary = getAccountingSummary();
  const pfRevenue = getPFRevenue();
  const pjRevenue = getPJRevenue();

  return (
    <Box>
      <PageHeader
        title="Contábil e Fiscal"
        description="Escrituração, livro-caixa, conciliação bancária, obrigações fiscais e análise tributária."
        actionLabel="Novo lançamento"
        actionIcon={<AddIcon />}
      />

      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 4,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "warning.main",
          bgcolor: "warning.50",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
          }}
        >
          <WarningAmberIcon color="warning" />

          <Box>
            <Typography sx={{ fontWeight: 900 }}>
              Ambiente de preparação e conferência
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              Guias, declarações, retenções e escolhas de
              regime deverão ser revisadas pelo contador
              responsável antes da transmissão ou pagamento.
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <AccountingSummaryCard
          title="Receitas líquidas"
          value={formatAccountingMoney(
            summary.totalRevenue,
          )}
          icon={<PaymentsIcon />}
        />

        <AccountingSummaryCard
          title="Despesas e pró-labore"
          value={formatAccountingMoney(
            summary.totalExpenses,
          )}
          icon={<ReceiptLongIcon />}
        />

        <AccountingSummaryCard
          title="Tributos estimados"
          value={formatAccountingMoney(
            summary.totalTaxes,
          )}
          icon={<CalculateIcon />}
        />

        <AccountingSummaryCard
          title="Fluxo líquido registrado"
          value={formatAccountingMoney(
            summary.netCashFlow,
          )}
          icon={<AssessmentIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            color="text.secondary"
          >
            Receitas registradas em pessoa física
          </Typography>

          <Typography
            variant="h4"
            sx={{
              mt: 1,
              fontWeight: 900,
            }}
          >
            {formatAccountingMoney(pfRevenue)}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            Recibos e rendimentos vinculados diretamente
            ao profissional.
          </Typography>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography color="text.secondary">
            Receitas registradas em pessoa jurídica
          </Typography>

          <Typography
            variant="h4"
            sx={{
              mt: 1,
              fontWeight: 900,
            }}
          >
            {formatAccountingMoney(pjRevenue)}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            Notas fiscais e receitas vinculadas às
            empresas do grupo.
          </Typography>
        </Paper>
      </Box>

      <Paper
        elevation={0}
        sx={{
          mb: 4,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr 120px",
              xl: "1.4fr 120px 1fr 130px 130px 140px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Lançamento
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Valor
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Entidade
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Documento
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Vencimento
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Status
          </Typography>
        </Box>

        {accountingEntries.map((entry) => (
          <Box
            key={entry.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 120px",
                xl: "1.4fr 120px 1fr 130px 130px 140px",
              },
              gap: 2,
              alignItems: "center",
              px: 3,
              py: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 900 }}>
                {entry.description}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {entry.accountCode} — {entry.accountName}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Centro de custo: {entry.costCenter}
              </Typography>
            </Box>

            <Typography
              sx={{
                fontWeight: 900,
                color:
                  entry.entryType === "Receita"
                    ? "success.main"
                    : "error.main",
              }}
            >
              {formatAccountingMoney(entry.netValue)}
            </Typography>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                {entry.legalEntity}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {entry.personName}
              </Typography>
            </Box>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              <Typography>
                {entry.documentType}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {entry.documentNumber ?? "Sem número"}
              </Typography>
            </Box>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {entry.dueDate}
            </Typography>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              <Chip
                size="small"
                label={entry.status}
                color={getEntryStatusColor(
                  entry.status,
                )}
              />
            </Box>
          </Box>
        ))}
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "1.1fr 1fr",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <AccountBalanceIcon color="primary" />

            <Typography
              variant="h6"
              sx={{ fontWeight: 900 }}
            >
              Conciliação bancária
            </Typography>
          </Box>

          {bankTransactions.map((transaction) => (
            <Paper
              key={transaction.id}
              variant="outlined"
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>
                    {transaction.description}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    {transaction.bankName} •{" "}
                    {transaction.accountName} •{" "}
                    {transaction.transactionDate}
                  </Typography>
                </Box>

                <Typography
                  sx={{
                    fontWeight: 900,
                    color:
                      transaction.transactionType ===
                      "Crédito"
                        ? "success.main"
                        : "error.main",
                  }}
                >
                  {transaction.transactionType ===
                  "Crédito"
                    ? "+"
                    : "-"}
                  {formatAccountingMoney(
                    transaction.value,
                  )}
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  flexWrap: "wrap",
                  mt: 2,
                }}
              >
                <Chip
                  size="small"
                  label={
                    transaction.reconciliationStatus
                  }
                  color={getReconciliationColor(
                    transaction.reconciliationStatus,
                  )}
                />

                {transaction.reconciliationStatus !==
                  "Conciliado" && (
                  <Button
                    size="small"
                    startIcon={<SyncAltIcon />}
                  >
                    Conciliar
                  </Button>
                )}
              </Box>
            </Paper>
          ))}
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 3,
            }}
          >
            <DescriptionIcon color="primary" />

            <Typography
              variant="h6"
              sx={{ fontWeight: 900 }}
            >
              Obrigações e guias
            </Typography>
          </Box>

          {taxObligations.map((obligation) => (
            <Paper
              key={obligation.id}
              variant="outlined"
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>
                    {obligation.name}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    {obligation.entityName} •{" "}
                    {obligation.competence}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={obligation.status}
                  color={getObligationStatusColor(
                    obligation.status,
                  )}
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(3, 1fr)",
                  },
                  gap: 2,
                  mt: 2,
                }}
              >
                <SmallValue
                  title="Valor estimado"
                  value={formatAccountingMoney(
                    obligation.estimatedValue,
                  )}
                />

                <SmallValue
                  title="Vencimento"
                  value={obligation.dueDate}
                />

                <SmallValue
                  title="Responsável"
                  value={obligation.responsible}
                />
              </Box>

              {obligation.requiresAccountantApproval && (
                <Typography
                  variant="caption"
                  color="warning.main"
                  sx={{
                    display: "block",
                    mt: 2,
                    fontWeight: 800,
                  }}
                >
                  Exige validação do contador antes da
                  transmissão ou pagamento.
                </Typography>
              )}
            </Paper>
          ))}
        </Paper>
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 900,
            mb: 1,
          }}
        >
          Comparador de regime tributário
        </Typography>

        <Typography
          color="text.secondary"
          sx={{
            mb: 3,
          }}
        >
          Simulação baseada em faturamento, despesas,
          folha, margem e custo de conformidade.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              xl: "repeat(3, 1fr)",
            },
            gap: 3,
          }}
        >
          {taxRegimeSimulations.map((simulation) => (
            <Paper
              key={simulation.regime}
              variant="outlined"
              sx={{
                p: 3,
                borderRadius: 3,
                borderWidth: simulation.recommended
                  ? 2
                  : 1,
                borderColor: simulation.recommended
                  ? "primary.main"
                  : "divider",
              }}
            >
              {simulation.recommended && (
                <Chip
                  size="small"
                  label="Melhor cenário simulado"
                  color="primary"
                  icon={<CheckCircleIcon />}
                  sx={{ mb: 2 }}
                />
              )}

              <Typography
                variant="h6"
                sx={{ fontWeight: 900 }}
              >
                {simulation.regime}
              </Typography>

              <Typography
                variant="h5"
                sx={{
                  mt: 2,
                  fontWeight: 900,
                }}
              >
                {formatAccountingMoney(
                  simulation.estimatedMonthlyTax,
                )}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                Tributo mensal estimado
              </Typography>

              <Box sx={{ mt: 3 }}>
                <SmallValue
                  title="Alíquota efetiva estimada"
                  value={`${simulation.effectiveRate.toFixed(
                    2,
                  )}%`}
                />

                <LinearProgress
                  variant="determinate"
                  value={Math.min(
                    simulation.effectiveRate * 4,
                    100,
                  )}
                  sx={{
                    height: 9,
                    borderRadius: 10,
                    my: 2,
                  }}
                />

                <SmallValue
                  title="Custo de conformidade"
                  value={formatAccountingMoney(
                    simulation.complianceCost,
                  )}
                />

                <SmallValue
                  title="Resultado líquido projetado"
                  value={formatAccountingMoney(
                    simulation.projectedNetResult,
                  )}
                />
              </Box>

              <Typography
                sx={{
                  mt: 3,
                  fontWeight: 900,
                }}
              >
                Vantagens
              </Typography>

              {simulation.advantages.map(
                (advantage) => (
                  <Typography
                    key={advantage}
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    • {advantage}
                  </Typography>
                ),
              )}

              <Typography
                sx={{
                  mt: 3,
                  fontWeight: 900,
                }}
              >
                Pontos de atenção
              </Typography>

              {simulation.attentionPoints.map(
                (point) => (
                  <Typography
                    key={point}
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    • {point}
                  </Typography>
                ),
              )}
            </Paper>
          ))}
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 2,
            flexWrap: "wrap",
            mt: 3,
          }}
        >
          <Button
            variant="outlined"
            startIcon={<AssessmentIcon />}
          >
            Gerar relatório para contador
          </Button>

          <Button
            variant="contained"
            startIcon={<CalculateIcon />}
          >
            Atualizar simulação
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

interface AccountingSummaryCardProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function AccountingSummaryCard({
  title,
  value,
  icon,
}: AccountingSummaryCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          width: 46,
          height: 46,
          mb: 2,
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </Box>

      <Typography color="text.secondary">
        {title}
      </Typography>

      <Typography
        variant="h5"
        sx={{
          mt: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

interface SmallValueProps {
  title: string;
  value: string;
}

function SmallValue({
  title,
  value,
}: SmallValueProps) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {title}
      </Typography>

      <Typography sx={{ fontWeight: 900 }}>
        {value}
      </Typography>
    </Box>
  );
}