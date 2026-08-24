import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CampaignIcon from "@mui/icons-material/Campaign";
import GroupsIcon from "@mui/icons-material/Groups";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  calculateCampaignConversionRate,
  calculateCampaignReturn,
  marketingCampaigns,
} from "../services/MarketingService";
import type {
  MarketingCampaignStatus,
} from "../types/marketing";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getStatusColor(
  status: MarketingCampaignStatus,
) {
  switch (status) {
    case "Em execução":
      return "success" as const;

    case "Agendada":
      return "info" as const;

    case "Aguardando aprovação":
      return "warning" as const;

    case "Pausada":
      return "error" as const;

    case "Finalizada":
      return "default" as const;

    default:
      return "default" as const;
  }
}

export default function Marketing() {
  const totalBudget = marketingCampaigns.reduce(
    (total, campaign) => total + campaign.budget,
    0,
  );

  const totalLeads = marketingCampaigns.reduce(
    (total, campaign) => total + campaign.leads,
    0,
  );

  const totalRevenue = marketingCampaigns.reduce(
    (total, campaign) => total + campaign.revenue,
    0,
  );

  const totalConversions = marketingCampaigns.reduce(
    (total, campaign) => total + campaign.conversions,
    0,
  );

  const averageConversion =
    totalLeads === 0
      ? 0
      : (totalConversions / totalLeads) * 100;

  return (
    <Box>
      <PageHeader
        title="Marketing"
        description="Campanhas, públicos, canais, investimento, leads e resultados."
        actionLabel="Nova campanha"
        actionIcon={<AddIcon />}
      />

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
        <MarketingSummary
          title="Investimento"
          value={formatCurrency(totalBudget)}
          icon={<MonetizationOnIcon />}
        />

        <MarketingSummary
          title="Leads gerados"
          value={String(totalLeads)}
          icon={<GroupsIcon />}
        />

        <MarketingSummary
          title="Conversão média"
          value={`${averageConversion.toFixed(1)}%`}
          icon={<TrendingUpIcon />}
        />

        <MarketingSummary
          title="Receita atribuída"
          value={formatCurrency(totalRevenue)}
          icon={<CampaignIcon />}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            xl: "repeat(2, 1fr)",
          },
          gap: 3,
        }}
      >
        {marketingCampaigns.map((campaign) => {
          const conversionRate =
            calculateCampaignConversionRate(
              campaign.leads,
              campaign.conversions,
            );

          const returnRate = calculateCampaignReturn(
            campaign.budget,
            campaign.revenue,
          );

          return (
            <Paper
              key={campaign.id}
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
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                  mb: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {campaign.name}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 0.5,
                    }}
                  >
                    {campaign.objective}
                  </Typography>
                </Box>

                <Chip
                  label={campaign.status}
                  color={getStatusColor(
                    campaign.status,
                  )}
                />
              </Box>

              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  mb: 3,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  Público
                </Typography>

                <Typography sx={{ fontWeight: 700 }}>
                  {campaign.audience}
                </Typography>
              </Paper>

              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  mb: 3,
                }}
              >
                {campaign.channels.map((channel) => (
                  <Chip
                    key={channel}
                    size="small"
                    label={channel}
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr 1fr",
                    md: "repeat(4, 1fr)",
                  },
                  gap: 2,
                  mb: 3,
                }}
              >
                <ResultBox
                  title="Orçamento"
                  value={formatCurrency(campaign.budget)}
                />

                <ResultBox
                  title="Leads"
                  value={String(campaign.leads)}
                />

                <ResultBox
                  title="Conversões"
                  value={String(campaign.conversions)}
                />

                <ResultBox
                  title="Retorno"
                  value={`${returnRate.toFixed(1)}x`}
                />
              </Box>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1,
                }}
              >
                Taxa de conversão:{" "}
                {conversionRate.toFixed(1)}%
              </Typography>

              <LinearProgress
                variant="determinate"
                value={Math.min(conversionRate * 4, 100)}
                sx={{
                  height: 9,
                  borderRadius: 10,
                  mb: 3,
                }}
              />

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                  mb: 3,
                }}
              >
                <Typography variant="body2">
                  Início: {campaign.startDate}
                </Typography>

                <Typography variant="body2">
                  Término: {campaign.endDate}
                </Typography>

                <Typography variant="body2">
                  Responsável: {campaign.responsible}
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 2,
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                >
                  Sugestões da IA
                </Button>

                <Button variant="contained">
                  Abrir campanha
                </Button>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}

interface MarketingSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function MarketingSummary({
  title,
  value,
  icon,
}: MarketingSummaryProps) {
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
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
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

interface ResultBoxProps {
  title: string;
  value: string;
}

function ResultBox({
  title,
  value,
}: ResultBoxProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {title}
      </Typography>

      <Typography sx={{ fontWeight: 800 }}>
        {value}
      </Typography>
    </Paper>
  );
}