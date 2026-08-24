import {
  Box,
  Card,
  CardContent,
  Chip,
} from "@mui/material";

export interface ExecutiveKPIProps {
  title: string;
  value: string;
  comparison: string;
  variation: number;
  area: string;
}

export default function ExecutiveKPI({
  title,
  value,
  comparison,
  variation,
  area,
}: ExecutiveKPIProps) {
  const positive = variation >= 0;

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
              fontWeight: 700,
              fontSize: ".95rem",
            }}
          >
            {title}
          </Box>

          <Chip
            size="small"
            label={area}
            variant="outlined"
          />
        </Box>

        <Box
          component="h2"
          sx={{
            m: 0,
            mt: 3,
            fontSize: "2.2rem",
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          {value}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 1,
            mb: 0,
            color: "text.secondary",
          }}
        >
          {comparison}
        </Box>

        <Box
          component="p"
          sx={{
            mt: 2,
            mb: 0,
            fontWeight: 700,
            color: positive
              ? "success.main"
              : "error.main",
          }}
        >
          {positive ? "+" : ""}
          {variation}%
        </Box>
      </CardContent>
    </Card>
  );
}
