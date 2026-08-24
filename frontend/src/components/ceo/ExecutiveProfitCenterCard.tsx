import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveProfitCenter {
  id: number;
  center: string;
  revenue: number;
  profit: number;
}

export interface ExecutiveProfitCenterCardProps {
  centers: ExecutiveProfitCenter[];
}

export default function ExecutiveProfitCenterCard({
  centers,
}: ExecutiveProfitCenterCardProps) {
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
          Centros de Lucro
        </Box>

        {centers.map((center, index) => (
          <Box key={center.id}>

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
                  {center.center}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  Receita: {money(center.revenue)}
                </Box>

              </Box>

              <Chip
                color={
                  center.profit >= 0
                    ? "success"
                    : "error"
                }
                label={money(center.profit)}
              />

            </Box>

            {index < centers.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
