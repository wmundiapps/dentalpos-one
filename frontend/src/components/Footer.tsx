import {
  Box,
  Chip,
  Typography,
} from "@mui/material";

import BrandName from "./BrandName";
import { appConfig } from "../config/app";
import { EDU_ONLY } from "../config/appMode";

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

      {EDU_ONLY && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", justifyContent: "center" }}>
          <Box component="img" src="/wmundi-logo.png" alt="WMundi Technologies" sx={{ height: 24 }} />
          <Typography variant="caption" color="text.secondary">
            www.wmundi.com · info@wmundi.com · WhatsApp (44) 99946-6451 · Av. XV de Novembro, 255 · Maringá – PR
          </Typography>
        </Box>
      )}

      <Chip
        size="small"
        label={appConfig.version}
        color="primary"
        variant="outlined"
      />
    </Box>
  );
}