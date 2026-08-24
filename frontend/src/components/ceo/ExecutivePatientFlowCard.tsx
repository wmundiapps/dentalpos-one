import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutivePatientFlow {
  id: number;
  stage: string;
  quantity: number;
  conversion: number;
}

export interface ExecutivePatientFlowCardProps {
  stages: ExecutivePatientFlow[];
}

export default function ExecutivePatientFlowCard({
  stages,
}: ExecutivePatientFlowCardProps) {
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
          Funil de Pacientes
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
                  {stage.quantity} pacientes
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
