import { Box, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
}

export default function PageHeader({
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
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
        mb: compact ? 1 : 4,
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

      {secondaryLabel && (
        <Button variant="outlined" size="large" onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      )}
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