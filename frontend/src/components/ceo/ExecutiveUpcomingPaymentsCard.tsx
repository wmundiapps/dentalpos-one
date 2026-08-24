import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveUpcomingPayment {
  id: number;
  description: string;
  supplier: string;
  dueDate: string;
  amount: number;
  daysRemaining: number;
}

export interface ExecutiveUpcomingPaymentsCardProps {
  payments: ExecutiveUpcomingPayment[];
}

export default function ExecutiveUpcomingPaymentsCard({
  payments,
}: ExecutiveUpcomingPaymentsCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  function getColor(days: number) {
    if (days <= 0) return "error";
    if (days <= 7) return "warning";
    return "success";
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
          Próximos Vencimentos
        </Box>

        {payments.map((payment, index) => (
          <Box key={payment.id}>

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
                  {payment.description}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {payment.supplier}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".85rem",
                  }}
                >
                  Vence em {payment.dueDate}
                </Box>

              </Box>

              <Box
                sx={{
                  textAlign: "right",
                }}
              >
                <Box
                  sx={{
                    fontWeight: 700,
                    color: "primary.main",
                    mb: 1,
                  }}
                >
                  {money(payment.amount)}
                </Box>

                <Chip
                  size="small"
                  color={getColor(payment.daysRemaining)}
                  label={
                    payment.daysRemaining <= 0
                      ? "Hoje"
                      : `${payment.daysRemaining} dias`
                  }
                />
              </Box>

            </Box>

            {index < payments.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
