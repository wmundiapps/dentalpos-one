import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveInventoryCardProps {
  totalItems: number;
  lowStock: number;
  outOfStock: number;
  inventoryValue: number;
}

export default function ExecutiveInventoryCard({
  totalItems,
  lowStock,
  outOfStock,
  inventoryValue,
}: ExecutiveInventoryCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const healthy =
    totalItems === 0
      ? 100
      : Math.max(
          0,
          ((totalItems - lowStock - outOfStock) /
            totalItems) *
            100,
        );

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <CardContent>

        <Box
          component="h2"
          sx={{
            m: 0,
            mb: 3,
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          Estoque
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Itens Cadastrados
          </Box>

          <Box>{totalItems}</Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Estoque Baixo
          </Box>

          <Box
            sx={{
              color: "warning.main",
              fontWeight: 700,
            }}
          >
            {lowStock}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Sem Estoque
          </Box>

          <Box
            sx={{
              color: "error.main",
              fontWeight: 700,
            }}
          >
            {outOfStock}
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            Valor do Estoque
          </Box>

          <Box
            sx={{
              color: "success.main",
              fontWeight: 700,
            }}
          >
            {money(inventoryValue)}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={healthy}
          sx={{
            height: 10,
            borderRadius: 10,
          }}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 2,
          }}
        >
          <Chip
            color={
              healthy >= 90
                ? "success"
                : healthy >= 70
                ? "warning"
                : "error"
            }
            label={`${healthy.toFixed(1)}% saudável`}
          />
        </Box>

      </CardContent>
    </Card>
  );
}
