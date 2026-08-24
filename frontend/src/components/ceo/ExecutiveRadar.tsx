import {
  Box,
  Card,
  CardContent,
} from "@mui/material";

export interface RadarItem {
  area: string;
  score: number;
  target: number;
  variation: number;
}

export interface ExecutiveRadarProps {
  items: RadarItem[];
}

export default function ExecutiveRadar({
  items,
}: ExecutiveRadarProps) {
  return (
    <Card
      elevation={0}
      sx={{
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
            fontSize: "1.30rem",
            fontWeight: 800,
          }}
        >
          Radar Executivo
        </Box>

        {items.map((item) => (
          <Box
            key={item.area}
            sx={{
              mb: 3,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Box
                component="span"
                sx={{
                  fontWeight: 700,
                }}
              >
                {item.area}
              </Box>

              <Box
                component="span"
                sx={{
                  color:
                    item.score >= item.target
                      ? "success.main"
                      : "warning.main",
                  fontWeight: 700,
                }}
              >
                {item.score} / {item.target}
              </Box>
            </Box>

            <Box
              sx={{
                width: "100%",
                height: 10,
                borderRadius: 10,
                overflow: "hidden",
                bgcolor: "grey.200",
              }}
            >
              <Box
                sx={{
                  width: `${Math.min(item.score,100)}%`,
                  height: "100%",
                  bgcolor:
                    item.score >= item.target
                      ? "success.main"
                      : "warning.main",
                }}
              />
            </Box>

            <Box
              component="p"
              sx={{
                mt: 1,
                mb: 0,
                fontSize: ".85rem",
                color:
                  item.variation >= 0
                    ? "success.main"
                    : "error.main",
              }}
            >
              {item.variation >= 0 ? "+" : ""}
              {item.variation}%
            </Box>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}
