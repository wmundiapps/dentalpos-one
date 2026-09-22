import { Box, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
}

export default function PageHeader({
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: {
          xs: "column",
          md: "row",
        },
        alignItems: {
          xs: "stretch",
          md: "center",
        },
        justifyContent: "space-between",
        gap: 2,
        mb: 4,
      }}
    >
      <Box>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
          }}
        >
          {title}
        </Typography>

        {description && (
          <Typography
            color="text.secondary"
            sx={{
              mt: 1,
            }}
          >
            {description}
          </Typography>
        )}
      </Box>

      {actionLabel && (
        <Button
          variant="contained"
          size="large"
          startIcon={actionIcon}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}