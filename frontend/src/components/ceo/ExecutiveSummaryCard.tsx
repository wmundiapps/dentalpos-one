import {
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveSummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  status: string;
  color:
    | "success"
    | "warning"
    | "error"
    | "info";
}

export default function ExecutiveSummaryCard({
  title,
  value,
  subtitle,
  status,
  color,
}: ExecutiveSummaryCardProps) {
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
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Box
            component="span"
            sx={{
              fontWeight: 800,
              fontSize: "1rem",
            }}
          >
            {title}
          </Box>

          <Chip
            size="small"
            color={color}
            label={status}
          />
        </Box>

        <Box
          component="h1"
          sx={{
            mt: 3,
            mb: 0,
            fontSize: "2.4rem",
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          {value}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 2,
            mb: 0,
            color: "text.secondary",
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </Box>
      </CardContent>
    </Card>
  );
}
