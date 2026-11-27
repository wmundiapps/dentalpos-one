import { useState } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import EmojiObjectsIcon from "@mui/icons-material/EmojiObjects";

import BrandName from "./BrandName";
import FeedbackDialog from "./FeedbackDialog";
import { appConfig } from "../config/app";

export default function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <Box
      component="footer"
      className="no-print"
      sx={{
        px: 3,
        pt: 2, pb: { xs: 11, md: 2 },
        bgcolor: "background.paper",
        borderTop: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", justifyContent: "center" }}>
        <Typography variant="body2" color="text.secondary">
          © 2026 <BrandName /> •{" "}
          <span translate="no" className="notranslate">{appConfig.developer}</span>
        </Typography>
        <Box component="a" href="https://www.wmundi.com" target="_blank" rel="noopener noreferrer" aria-label="WMundi Marketing Digital" sx={{ display: "inline-flex", lineHeight: 0 }}>
          <Box component="img" src={`${import.meta.env.BASE_URL}brand/logo-wmundi.png`} alt="WMundi Marketing Digital" sx={{ height: 34, borderRadius: 1 }} />
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Button size="small" startIcon={<EmojiObjectsIcon />} onClick={() => setOpen(true)} sx={{ fontWeight: 800, color: "#E07B2E" }}>Caixinha de sugestões</Button>
        <Chip size="small" label={appConfig.version} color="primary" variant="outlined" />
      </Box>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </Box>
  );
}
