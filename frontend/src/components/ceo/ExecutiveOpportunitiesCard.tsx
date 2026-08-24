import {
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveOpportunity {
  id: number;
  title: string;
  expectedRevenue: number;
  probability: number;
  responsible: string;
}

export interface ExecutiveOpportunitiesCardProps {
  opportunities: ExecutiveOpportunity[];
}

export default function ExecutiveOpportunitiesCard({
  opportunities,
}: ExecutiveOpportunitiesCardProps) {
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
          Oportunidades
        </Box>

        {opportunities.map((item) => (
          <Box
            key={item.id}
            sx={{
              mb: 3,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Box
                component="span"
                sx={{
                  fontWeight: 700,
                }}
              >
                {item.title}
              </Box>

              <Chip
                color={
                  item.probability >= 80
                    ? "success"
                    : item.probability >= 50
                    ? "warning"
                    : "error"
                }
                size="small"
                label={`${item.probability}%`}
              />
            </Box>

            <Box
              sx={{
                color: "success.main",
                fontWeight: 700,
              }}
            >
              {money(item.expectedRevenue)}
            </Box>

            <Box
              sx={{
                mt: 1,
                color: "text.secondary",
                fontSize: ".9rem",
              }}
            >
              Responsável: {item.responsible}
            </Box>
          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
