import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
} from "@mui/material";

export interface ExecutiveTeamMember {
  id: number;
  name: string;
  role: string;
  performance: number;
}

export interface ExecutiveTeamPerformanceCardProps {
  members: ExecutiveTeamMember[];
}

export default function ExecutiveTeamPerformanceCard({
  members,
}: ExecutiveTeamPerformanceCardProps) {
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
          Performance da Equipe
        </Box>

        {members.map((member) => (
          <Box
            key={member.id}
            sx={{
              mb: 3,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 1,
              }}
            >
              <Avatar>
                {member.name.charAt(0)}
              </Avatar>

              <Box sx={{ flex: 1 }}>

                <Box
                  component="div"
                  sx={{
                    fontWeight: 700,
                  }}
                >
                  {member.name}
                </Box>

                <Box
                  component="div"
                  sx={{
                    color: "text.secondary",
                    fontSize: ".9rem",
                  }}
                >
                  {member.role}
                </Box>

              </Box>

              <Chip
                color={
                  member.performance >= 90
                    ? "success"
                    : member.performance >= 70
                    ? "warning"
                    : "error"
                }
                label={`${member.performance}%`}
              />
            </Box>

            <LinearProgress
              variant="determinate"
              value={member.performance}
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
