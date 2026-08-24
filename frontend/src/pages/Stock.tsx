import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  calculateInventoryValue,
  inventoryItems,
} from "../services/InventoryService";
import type {
  InventoryStatus,
} from "../types/inventory";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getStatusColor(status: InventoryStatus) {
  switch (status) {
    case "Normal":
      return "success";

    case "Estoque baixo":
      return "warning";

    case "Crítico":
      return "error";

    case "Vencimento próximo":
      return "info";

    default:
      return "default";
  }
}

export default function Stock() {
  const lowStockItems = inventoryItems.filter(
    (item) =>
      item.status === "Estoque baixo" ||
      item.status === "Crítico",
  ).length;

  const expirationAlerts = inventoryItems.filter(
    (item) => item.status === "Vencimento próximo",
  ).length;

  const inventoryValue =
    calculateInventoryValue(inventoryItems);

  return (
    <Box>
      <PageHeader
        title="Estoque"
        description="Produtos, materiais, lotes, vencimentos e reposições."
        actionLabel="Novo produto"
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
        <StockSummary
          title="Itens cadastrados"
          value={String(inventoryItems.length)}
          icon={<Inventory2Icon />}
        />

        <StockSummary
          title="Estoque baixo"
          value={String(lowStockItems)}
          icon={<WarningAmberIcon />}
        />

        <StockSummary
          title="Vencimentos próximos"
          value={String(expirationAlerts)}
          icon={<LocalShippingIcon />}
        />

        <StockSummary
          title="Valor em estoque"
          value={formatCurrency(inventoryValue)}
          icon={<MonetizationOnIcon />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
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
              xs: "1fr 110px",
              lg: "110px 1.5fr 1fr 110px 130px 130px 150px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                lg: "block",
              },
            }}
          >
            Código
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Produto
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                lg: "block",
              },
            }}
          >
            Categoria
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Quantidade
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                lg: "block",
              },
            }}
          >
            Lote
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                lg: "block",
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
                lg: "block",
              },
            }}
          >
            Status
          </Typography>
        </Box>

        {inventoryItems.map((item) => (
          <Box
            key={item.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 110px",
                lg: "110px 1.5fr 1fr 110px 130px 130px 150px",
              },
              gap: 2,
              alignItems: "center",
              px: 3,
              py: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: {
                  xs: "none",
                  lg: "block",
                },
              }}
            >
              {item.code}
            </Typography>

            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                {item.name}
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                {item.location}
              </Typography>
            </Box>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  lg: "block",
                },
              }}
            >
              {item.category}
            </Typography>

            <Box>
              <Typography sx={{ fontWeight: 800 }}>
                {item.currentQuantity}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                {item.unit}
              </Typography>
            </Box>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  lg: "block",
                },
              }}
            >
              {item.batch}
            </Typography>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  lg: "block",
                },
              }}
            >
              {item.expirationDate ?? "Não informado"}
            </Typography>

            <Box
              sx={{
                display: {
                  xs: "none",
                  lg: "block",
                },
              }}
            >
              <Chip
                size="small"
                label={item.status}
                color={getStatusColor(item.status)}
              />
            </Box>
          </Box>
        ))}
      </Paper>

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          mt: 3,
        }}
      >
        <Button
          variant="contained"
          startIcon={<LocalShippingIcon />}
        >
          Gerar solicitação de compras
        </Button>
      </Box>
    </Box>
  );
}

interface StockSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function StockSummary({
  title,
  value,
  icon,
}: StockSummaryProps) {
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
          fontWeight: 800,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}