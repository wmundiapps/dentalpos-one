
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
} from "@mui/material";

export interface ExecutiveTimelineItem {
  id: number;
  title: string;
  description: string;
  date: string;
  status: "success" | "info" | "warning" | "error";
}

export interface ExecutiveTimelineCardProps {
  items: ExecutiveTimelineItem[];
}

export default function ExecutiveTimelineCard({
  items,
}: ExecutiveTimelineCardProps) {
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
            fontSize: "1.2rem",
            fontWeight: 800,
          }}
        >
          Linha do Tempo
        </Box>

        {items.map((item, index) => (
          <Box key={item.id} sx={{ mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Box
                sx={{
                  fontWeight: 700,
                }}
              >
                {item.title}
              </Box>

              <Chip
                size="small"
                color={item.status}
                label={item.date}
              />
            </Box>

            <Box
              sx={{
                color: "text.secondary",
                mb: 2,
              }}
            >
              {item.description}
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