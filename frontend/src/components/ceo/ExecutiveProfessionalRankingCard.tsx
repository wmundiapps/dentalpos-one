import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ProfessionalRankingItem {
  id: number;
  name: string;
  specialty: string;
  production: number;
}

export interface ExecutiveProfessionalRankingCardProps {
  professionals: ProfessionalRankingItem[];
}

export default function ExecutiveProfessionalRankingCard({
  professionals,
}: ExecutiveProfessionalRankingCardProps) {
  const money = (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        height: "100%",
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
          Ranking de Profissionais
        </Box>

        {professionals.map((professional, index) => (
          <Box
            key={professional.id}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              py: 1.5,
              borderBottom:
                index === professionals.length - 1
                  ? "none"
                  : "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <Avatar>
                {professional.name.charAt(0)}
              </Avatar>

              <Box>
                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {professional.name}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.85rem",
                  }}
                >
                  {professional.specialty}
                </Box>
              </Box>
            </Box>

            <Chip
              color={
                index === 0
                  ? "success"
                  : index === 1
                  ? "primary"
                  : "default"
              }
              label={money(professional.production)}
            />
          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
