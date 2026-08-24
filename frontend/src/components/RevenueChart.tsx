import { Box, Typography } from "@mui/material";

const dados = [
  { mes: "Jan", valor: 38 },
  { mes: "Fev", valor: 52 },
  { mes: "Mar", valor: 47 },
  { mes: "Abr", valor: 68 },
  { mes: "Mai", valor: 74 },
  { mes: "Jun", valor: 91 },
];

export default function RevenueChart() {
  const maiorValor = Math.max(...dados.map((item) => item.valor));

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "end",
          gap: 2,
          height: 230,
          mt: 3,
          px: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        {dados.map((item) => {
          const altura = (item.valor / maiorValor) * 100;

          return (
            <Box
              key={item.mes}
              sx={{
                flex: 1,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "end",
                alignItems: "center",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  mb: 1,
                  fontWeight: 700,
                }}
              >
                R$ {item.valor} mil
              </Typography>

              <Box
                sx={{
                  width: "72%",
                  height: `${altura}%`,
                  minHeight: 20,
                  bgcolor: "primary.main",
                  borderRadius: "8px 8px 0 0",
                  transition: "0.3s",
                  "&:hover": {
                    opacity: 0.75,
                  },
                }}
              />

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, mb: 1 }}
              >
                {item.mes}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}