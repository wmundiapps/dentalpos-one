import {
  Box,
  Card,
  CardContent,
  Grid,
} from "@mui/material";

export interface ExecutiveBoardItem {
  id: number;
  title: string;
  value: string;
  color:
    | "success"
    | "warning"
    | "error"
    | "info";
}

export interface ExecutiveBoardProps {
  items: ExecutiveBoardItem[];
}

export default function ExecutiveBoard({
  items,
}: ExecutiveBoardProps) {
  return (
    <Grid container spacing={2}>
      {items.map((item) => (
        <Grid
          key={item.id}
          size={{ xs: 12, sm: 6, md: 3 }}
        >
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
                component="h3"
                sx={{
                  m: 0,
                  color: "text.secondary",
                  fontSize: ".95rem",
                  fontWeight: 700,
                }}
              >
                {item.title}
              </Box>

              <Box
                component="p"
                sx={{
                  mt: 2,
                  mb: 0,
                  fontSize: "2rem",
                  fontWeight: 900,
                  color: `${item.color}.main`,
                }}
              >
                {item.value}
              </Box>

            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
