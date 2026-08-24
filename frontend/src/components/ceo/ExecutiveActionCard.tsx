import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveActionCardProps {
  title: string;
  description: string;
  sector: string;
  priority: "Alta" | "Média" | "Baixa";
  actionLabel: string;
  onAction?: () => void;
}

export default function ExecutiveActionCard({
  title,
  description,
  sector,
  priority,
  actionLabel,
  onAction,
}: ExecutiveActionCardProps) {
  const color =
    priority === "Alta"
      ? "error"
      : priority === "Média"
      ? "warning"
      : "success";

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
            mb: 2,
          }}
        >
          <Box
            component="h2"
            sx={{
              m: 0,
              fontSize: "1.15rem",
              fontWeight: 800,
            }}
          >
            {title}
          </Box>

          <Chip
            size="small"
            color={color}
            label={priority}
          />
        </Box>

        <Box
          component="p"
          sx={{
            mt: 0,
            mb: 2,
            color: "text.secondary",
            lineHeight: 1.7,
          }}
        >
          {description}
        </Box>

        <Chip
          label={sector}
          variant="outlined"
          size="small"
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            mt: 3,
          }}
        >
          <Button
            variant="contained"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
