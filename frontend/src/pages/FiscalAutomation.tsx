import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import EmailIcon from "@mui/icons-material/Email";
import ErrorIcon from "@mui/icons-material/Error";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend";
import SendIcon from "@mui/icons-material/Send";
import SmsIcon from "@mui/icons-material/Sms";
import TelegramIcon from "@mui/icons-material/Telegram";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";

import {
  fiscalAlerts,
  fiscalPayments,
  fiscalSendRecords,
  formatFiscalMoney,
  getFiscalAutomationSummary,
  getFiscalDocumentLabel,
  requiresImmediateFiscalAction,
} from "../services/FiscalAutomationService";

import type {
  FiscalAutomationStatus,
  FiscalPriority,
  FiscalSendChannel,
  FiscalSendStatus,
} from "../types/fiscalAutomation";

function getFiscalStatusColor(
  status: FiscalAutomationStatus,
) {
  switch (status) {
    case "Fiscalmente concluído":
    case "Documento entregue":
      return "success" as const;

    case "Documento emitido":
    case "Documento enviado":
      return "info" as const;

    case "Nota programada":
    case "Aguardando Receita Saúde":
    case "Documento aguardando emissão":
      return "warning" as const;

    case "Falha na emissão":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getSendStatusColor(
  status: FiscalSendStatus,
) {
  switch (status) {
    case "Entregue":
    case "Lido":
      return "success" as const;

    case "Enviado":
      return "info" as const;

    case "Programado":
      return "warning" as const;

    case "Falhou":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getPriorityColor(priority: FiscalPriority) {
  switch (priority) {
    case "Crítica":
      return "error" as const;

    case "Alta":
      return "warning" as const;

    case "Média":
      return "info" as const;

    default:
      return "default" as const;
  }
}

function getChannelIcon(
  channel: FiscalSendChannel,
): ReactNode {
  switch (channel) {
    case "E-mail":
      return <EmailIcon />;

    case "WhatsApp":
      return <WhatsAppIcon />;

    case "SMS":
      return <SmsIcon />;

    case "Telegram":
      return <TelegramIcon />;

    default:
      return <SendIcon />;
  }
}

export default function FiscalAutomation() {
  const summary = getFiscalAutomationSummary();

  return (
    <Box>
      <PageHeader
        title="Automação Fiscal"
        description="Emissão de recibos, Receita Saúde, notas fiscais, protocolos e envio automático aos pagadores."
        actionLabel="Novo processamento"
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
              Emissão assistida e controlada
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              O sistema prepara, programa e acompanha os
              documentos. Transmissões oficiais exigirão
              integrações autorizadas e validação fiscal.
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
            xl: "repeat(5, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <FiscalSummary
          title="Pagamentos confirmados"
          value={String(summary.confirmedPayments)}
          icon={<PaymentsIcon />}
        />

        <FiscalSummary
          title="Documentos pendentes"
          value={String(summary.pendingDocuments)}
          icon={<WarningAmberIcon />}
        />

        <FiscalSummary
          title="Documentos emitidos"
          value={String(summary.issuedDocuments)}
          icon={<DescriptionIcon />}
        />

        <FiscalSummary
          title="Falhas de envio"
          value={String(summary.deliveryFailures)}
          icon={<ErrorIcon />}
        />

        <FiscalSummary
          title="Valor pendente fiscal"
          value={formatFiscalMoney(
            summary.pendingTaxValue,
          )}
          icon={<ReceiptLongIcon />}
        />
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
              xs: "1fr 130px",
              xl: "1.4fr 1fr 130px 130px 160px 190px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Pagamento
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Status
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
            Pagador
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
            Ação
          </Typography>
        </Box>

        {fiscalPayments.map((payment) => (
          <Box
            key={payment.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 130px",
                xl: "1.4fr 1fr 130px 130px 160px 190px",
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
                {payment.treatmentReference}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {payment.paymentCode} •{" "}
                {payment.paymentDate} •{" "}
                {payment.paymentMethod}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Emissor: {payment.issuerName}
              </Typography>
            </Box>

            <Chip
              size="small"
              label={payment.status}
              color={getFiscalStatusColor(
                payment.status,
              )}
            />

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
                fontWeight: 800,
              }}
            >
              {getFiscalDocumentLabel(payment)}
            </Typography>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
                fontWeight: 900,
              }}
            >
              {formatFiscalMoney(
                payment.receivedValue,
              )}
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
                {payment.payer.name}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {payment.payer.document ||
                  "Documento ausente"}
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
              {requiresImmediateFiscalAction(
                payment.status,
              ) ? (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<ReceiptLongIcon />}
                >
                  Resolver pendência
                </Button>
              ) : payment.status ===
                "Nota programada" ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ScheduleSendIcon />}
                >
                  Ver programação
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DescriptionIcon />}
                >
                  Abrir documento
                </Button>
              )}
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
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Alertas fiscais
          </Typography>

          {fiscalAlerts.map((alert) => (
            <Paper
              key={alert.id}
              variant="outlined"
              sx={{
                p: 2.5,
                mb: 2,
                borderRadius: 2,
                opacity: alert.resolved ? 0.65 : 1,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>
                    {alert.title}
                  </Typography>

                  <Typography
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {alert.description}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={
                    alert.resolved
                      ? "Resolvido"
                      : alert.priority
                  }
                  color={
                    alert.resolved
                      ? "success"
                      : getPriorityColor(
                          alert.priority,
                        )
                  }
                />
              </Box>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  mt: 2,
                }}
              >
                Criado em {alert.createdAt}
              </Typography>
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
          <Typography
            variant="h6"
            sx={{
              fontWeight: 900,
              mb: 3,
            }}
          >
            Histórico de envios
          </Typography>

          {fiscalSendRecords.map((record) => (
            <Paper
              key={record.id}
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
                  alignItems: "flex-start",
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2,
                    bgcolor: "primary.main",
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {getChannelIcon(record.channel)}
                </Box>

                <Box sx={{ flexGrow: 1 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <Box>
                      <Typography
                        sx={{ fontWeight: 900 }}
                      >
                        {record.recipientName}
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {record.channel} •{" "}
                        {record.destination}
                      </Typography>
                    </Box>

                    <Chip
                      size="small"
                      label={record.status}
                      color={getSendStatusColor(
                        record.status,
                      )}
                    />
                  </Box>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      mt: 1.5,
                    }}
                  >
                    {record.readAt
                      ? `Lido em ${record.readAt}`
                      : record.deliveredAt
                        ? `Entregue em ${record.deliveredAt}`
                        : record.sentAt
                          ? `Enviado em ${record.sentAt}`
                          : record.scheduledAt
                            ? `Programado para ${record.scheduledAt}`
                            : "Ainda não enviado"}
                  </Typography>

                  {record.failureReason && (
                    <Typography
                      variant="body2"
                      color="error.main"
                      sx={{ mt: 1 }}
                    >
                      {record.failureReason}
                    </Typography>
                  )}
                </Box>
              </Box>
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
            mb: 3,
          }}
        >
          Fluxo automático configurado
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(3, 1fr)",
              xl: "repeat(6, 1fr)",
            },
            gap: 2,
          }}
        >
          <AutomationStep
            number="1"
            title="Pagamento"
            description="Confirmação bancária."
          />

          <AutomationStep
            number="2"
            title="Identificação"
            description="PF, PJ, pagador e paciente."
          />

          <AutomationStep
            number="3"
            title="Documento"
            description="Receita Saúde ou NFS-e."
          />

          <AutomationStep
            number="4"
            title="Protocolo"
            description="Número e comprovante."
          />

          <AutomationStep
            number="5"
            title="Envio"
            description="Canais configurados."
          />

          <AutomationStep
            number="6"
            title="Conclusão"
            description="Baixa fiscal e contábil."
          />
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
            startIcon={<ScheduleSendIcon />}
          >
            Configurar regras de emissão
          </Button>

          <Button
            variant="contained"
            startIcon={<CheckCircleIcon />}
          >
            Processar pendências
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

interface FiscalSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function FiscalSummary({
  title,
  value,
  icon,
}: FiscalSummaryProps) {
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

interface AutomationStepProps {
  number: string;
  title: string;
  description: string;
}

function AutomationStep({
  number,
  title,
  description,
}: AutomationStepProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          mx: "auto",
          mb: 1.5,
          borderRadius: "50%",
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
        }}
      >
        {number}
      </Box>

      <Typography sx={{ fontWeight: 900 }}>
        {title}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.5 }}
      >
        {description}
      </Typography>
    </Paper>
  );
}