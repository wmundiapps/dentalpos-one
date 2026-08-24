import {
  Box,
  Chip,
  Typography,
} from "@mui/material";

import BrandName from "./BrandName";
import { appConfig } from "../config/app";

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        px: 3,
        py: 2,
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: {
          xs: "column",
          sm: "row",
        },
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
      >
        © 2026 <BrandName /> •{" "}
        <span
          translate="no"
          className="notranslate"
        >
          {appConfig.developer}
        </span>
      </Typography>

      <Chip
        size="small"
        label={appConfig.version}
        color="primary"
        variant="outlined"
      />
    </Box>
  );
}