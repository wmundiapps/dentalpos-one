import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveSalesStage {
  id: number;
  stage: string;
  opportunities: number;
  value: number;
  conversion: number;
}

export interface ExecutiveSalesPipelineCardProps {
  stages: ExecutiveSalesStage[];
}

export default function ExecutiveSalesPipelineCard({
  stages,
}: ExecutiveSalesPipelineCardProps) {
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
          Pipeline Comercial
        </Box>

        {stages.map((stage) => (
          <Box
            key={stage.id}
            sx={{ mb: 3 }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Box>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {stage.stage}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {stage.opportunities} oportunidades
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "success.main",
                    fontWeight: 700,
                  }}
                >
                  {money(stage.value)}
                </Box>

              </Box>

              <Chip
                color={
                  stage.conversion >= 70
                    ? "success"
                    : stage.conversion >= 40
                    ? "warning"
                    : "error"
                }
                label={`${stage.conversion.toFixed(0)}%`}
              />
            </Box>

            <LinearProgress
              variant="determinate"
              value={stage.conversion}
              sx={{
                height: 10,
                borderRadius: 10,
              }}
            />
          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
