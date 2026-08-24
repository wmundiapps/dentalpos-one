import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveRevenueSource {
  id: number;
  source: string;
  amount: number;
  percentage: number;
}

export interface ExecutiveRevenueSourcesCardProps {
  sources: ExecutiveRevenueSource[];
}

export default function ExecutiveRevenueSourcesCard({
  sources,
}: ExecutiveRevenueSourcesCardProps) {
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
          Fontes de Receita
        </Box>

        {sources.map((source, index) => (
          <Box key={source.id}>

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
                  {source.source}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "success.main",
                    fontWeight: 700,
                  }}
                >
                  {money(source.amount)}
                </Box>

              </Box>

              <Chip
                color="primary"
                label={`${source.percentage.toFixed(1)}%`}
              />

            </Box>

            {index < sources.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
