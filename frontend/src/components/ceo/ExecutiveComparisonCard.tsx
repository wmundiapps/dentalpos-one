import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveComparisonItem {
  id: number;
  title: string;
  currentValue: number;
  previousValue: number;
}

export interface ExecutiveComparisonCardProps {
  items: ExecutiveComparisonItem[];
}

export default function ExecutiveComparisonCard({
  items,
}: ExecutiveComparisonCardProps) {
  const percent = (
    current: number,
    previous: number,
  ) =>
    previous === 0
      ? 0
      : ((current - previous) / previous) * 100;

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
          Comparativo de Períodos
        </Box>

        {items.map((item, index) => {
          const variation = percent(
            item.currentValue,
            item.previousValue,
          );

          return (
            <Box key={item.id}>

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
                    {item.title}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      mt: .5,
                      color: "text.secondary",
                      fontSize: ".9rem",
                    }}
                  >
                    Atual: {item.currentValue}
                  </Box>

                  <Box
                    component="div"
                    sx={{
                      color: "text.secondary",
                      fontSize: ".9rem",
                    }}
                  >
                    Anterior: {item.previousValue}
                  </Box>

                </Box>

                <Chip
                  color={
                    variation >= 0
                      ? "success"
                      : "error"
                  }
                  label={`${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                />

              </Box>

              {index < items.length - 1 && (
                <Divider />
              )}

            </Box>
          );
        })}

      </CardContent>
    </Card>
  );
}
