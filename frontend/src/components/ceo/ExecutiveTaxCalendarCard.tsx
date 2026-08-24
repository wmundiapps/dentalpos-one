import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveTaxCalendarItem {
  id: number;
  tax: string;
  dueDate: string;
  amount: number;
  status: "Pago" | "Pendente" | "Vencendo" | "Vencido";
}

export interface ExecutiveTaxCalendarCardProps {
  items: ExecutiveTaxCalendarItem[];
}

export default function ExecutiveTaxCalendarCard({
  items,
}: ExecutiveTaxCalendarCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  function getColor(
    status: ExecutiveTaxCalendarItem["status"],
  ): "success" | "warning" | "error" | "info" {
    switch (status) {
      case "Pago":
        return "success";

      case "Vencendo":
        return "warning";

      case "Vencido":
        return "error";

      default:
        return "info";
    }
  }

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
          Calendário Tributário
        </Box>

        {items.map((item, index) => (
          <Box key={item.id}>

            <Box
              sx={{
                py: 2,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {item.tax}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  Vencimento: {item.dueDate}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "primary.main",
                    fontWeight: 700,
                  }}
                >
                  {money(item.amount)}
                </Box>

              </Box>

              <Chip
                color={getColor(item.status)}
                label={item.status}
              />

            </Box>

            {index < items.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
