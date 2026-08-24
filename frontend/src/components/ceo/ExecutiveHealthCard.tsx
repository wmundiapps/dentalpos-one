import {
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Typography,
} from "@mui/material";

export interface ExecutiveHealthCardProps {
  financial: number;
  operational: number;
  commercial: number;
  clinical: number;
}

function HealthItem({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  const color =
    value >= 85
      ? "success.main"
      : value >= 70
      ? "warning.main"
      : "error.main";

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 0.5 }}>
        {title}
      </Typography>

      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color,
        }}
      >
        {value}%
      </Typography>

      <LinearProgress
        variant="determinate"
        value={value}
        sx={{
          height: 8,
          borderRadius: 4,
          mb: 2,
        }}
      />
    </Box>
  );
}

export default function ExecutiveHealthCard({
  financial,
  operational,
  commercial,
  clinical,
}: ExecutiveHealthCardProps) {
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
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            mb: 3,
          }}
        >
          Saúde da Clínica
        </Typography>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <HealthItem
              title="Financeiro"
              value={financial}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <HealthItem
              title="Operacional"
              value={operational}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <HealthItem
              title="Comercial"
              value={commercial}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <HealthItem
              title="Clínico"
              value={clinical}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}