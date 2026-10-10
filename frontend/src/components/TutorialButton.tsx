import { useState } from "react";
import { Box, Divider, Drawer, IconButton, Tooltip, Typography } from "@mui/material";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useLocation } from "react-router-dom";
import { tutorialFor } from "../config/tutorials";

/** Ícone de ajuda no cabeçalho: abre o guia do módulo em que o usuário está. */
export default function TutorialButton() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const t = tutorialFor(pathname);
  return (
    <>
      <Tooltip title="Como usar esta tela">
        <IconButton onClick={() => setOpen(true)} aria-label="Como usar esta tela">
          <HelpIcon />
        </IconButton>
      </Tooltip>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 400 }, p: 3 } } }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Typography variant="h6" sx={{ flex: 1, fontWeight: 800 }}>{t.title}</Typography>
          <IconButton onClick={() => setOpen(false)} aria-label="Fechar"><CloseIcon /></IconButton>
        </Box>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{t.what}</Typography>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Passo a passo</Typography>
        <Box component="ol" sx={{ pl: 2.5, m: 0, display: "grid", gap: 1 }}>
          {t.steps.map((s, i) => <li key={i}><Typography variant="body2">{s}</Typography></li>)}
        </Box>
        {t.tips && (
          <Box sx={{ mt: 2.5, p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Dicas</Typography>
            {t.tips.map((s, i) => <Typography key={i} variant="body2" sx={{ mt: 0.5 }}>{s}</Typography>)}
          </Box>
        )}
      </Drawer>
    </>
  );
}
