import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveCashAlert {
  id: number;
  date: string;
  description: string;
  expectedBalance: number;
}

export interface ExecutiveCashAlertCardProps {
  alerts: ExecutiveCashAlert[];
}

export default function ExecutiveCashAlertCard({
  alerts,
}: ExecutiveCashAlertCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

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
          Alertas de Fluxo de Caixa
        </Box>

        {alerts.map((alert, index) => (
          <Box key={alert.id}>

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
                  {alert.description}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {alert.date}
                </Box>

              </Box>

              <Chip
                color={
                  alert.expectedBalance >= 0
                    ? "success"
                    : "error"
                }
                label={money(alert.expectedBalance)}
              />

            </Box>

            {index < alerts.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
