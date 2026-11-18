import { useState } from "react";
import type { MouseEvent } from "react";
import { Box, IconButton, Popover, Typography } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import type { HelpEntry } from "../config/menuHelp";

/** Ícone "?" que abre um balão com "Para que serve" e "Como usar". */
export default function MenuHelp({ titulo, ajuda }: { titulo: string; ajuda: HelpEntry }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const abrir = (ev: MouseEvent<HTMLElement>) => { ev.stopPropagation(); ev.preventDefault(); setAnchor(ev.currentTarget); };
  return <>
    <IconButton size="small" aria-label={`Ajuda: ${titulo}`} onClick={abrir}
      sx={{ p: .3, ml: .5, color: "#94A3B8", "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,.12)" } }}>
      <HelpOutlineIcon sx={{ fontSize: 16 }} />
    </IconButton>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={(ev: any) => { ev?.stopPropagation?.(); setAnchor(null); }}
      anchorOrigin={{ vertical: "center", horizontal: "right" }} transformOrigin={{ vertical: "center", horizontal: "left" }}
      slotProps={{ paper: { sx: { maxWidth: 320, p: 2, ml: 1 }, onClick: (ev: any) => ev.stopPropagation() } }}>
      <Typography sx={{ fontWeight: 800, mb: 1 }}>{titulo}</Typography>
      <Box sx={{ mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main" }}>PARA QUE SERVE</Typography>
        <Typography sx={{ fontSize: 13.5 }}>{ajuda.serve}</Typography>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 800, color: "primary.main" }}>COMO USAR</Typography>
        <Typography sx={{ fontSize: 13.5 }}>{ajuda.uso}</Typography>
      </Box>
    </Popover>
  </>;
}
