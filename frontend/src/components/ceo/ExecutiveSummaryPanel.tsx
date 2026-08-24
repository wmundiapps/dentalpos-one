import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveSummaryItem {
  id: number;
  title: string;
  value: string;
  status: "success" | "warning" | "error" | "info";
  observation?: string;
}

export interface ExecutiveSummaryPanelProps {
  items: ExecutiveSummaryItem[];
}

export default function ExecutiveSummaryPanel({
  items,
}: ExecutiveSummaryPanelProps) {
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
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          Resumo Executivo
        </Box>

        {items.map((item, index) => (
          <Box key={item.id}>

            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                py: 2,
              }}
            >
              <Box sx={{ flex: 1 }}>

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
                    fontSize: "1.35rem",
                    fontWeight: 800,
                  }}
                >
                  {item.value}
                </Box>

                {item.observation && (
                  <Box
                    component="div"
                    sx={{
                      mt: .5,
                      color: "text.secondary",
                      fontSize: ".9rem",
                    }}
                  >
                    {item.observation}
                  </Box>
                )}

              </Box>

              <Chip
                color={item.status}
                label={item.status.toUpperCase()}
              />

            </Box>

            {index < items.length - 1 && (
              <Divider />
            )}

          </Box>
        ))}

      </CardContent>
    </Card>
  );
}
