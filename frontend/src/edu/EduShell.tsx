import { Box, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";
import InstitutionLogo, { useBranding } from "./InstitutionLogo";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Mostra a faixa grande com a logomarca (portais, painéis executivos). */
  hero?: boolean;
  onLogoClick?: () => void;
}

/** Moldura padrão das telas EduMaster: faixa institucional com espaço de destaque para a logomarca + conteúdo. */
export default function EduShell({ title, subtitle, actions, children, hero = true, onLogoClick }: Props) {
  const b = useBranding();
  const primary = b?.cores.primaria || "#0F5FDB";
  const secondary = b?.cores.secundaria || "#0B1F3A";
  return (
    <Box>
      {hero ? (
        <Paper
          elevation={0}
          sx={{
            mb: 3, p: { xs: 2, md: 3 }, borderRadius: 4, color: "#fff", overflow: "hidden", position: "relative",
            background: `linear-gradient(120deg, ${secondary} 0%, ${primary} 100%)`,
            display: "flex", alignItems: "center", gap: { xs: 2, md: 4 }, flexWrap: "wrap",
          }}
        >
          <Box sx={{ bgcolor: "rgba(255,255,255,.96)", borderRadius: 3, p: 1.5, display: "flex", alignItems: "center", justifyContent: "center", minWidth: { xs: 0, md: 260 }, maxWidth: "100%", boxSizing: "border-box", minHeight: 100, boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>
            <InstitutionLogo variant="hero" onPlaceholderClick={onLogoClick} />
          </Box>
          <Box sx={{ flex: 1, minWidth: { xs: 0, md: 220 }, flexBasis: { xs: "100%", md: "auto" } }}>
            <Typography variant="overline" sx={{ opacity: 0.8, fontWeight: 800 }}>{b?.nome || "EduMaster Pro"}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1 }}>{title}</Typography>
            {subtitle ? <Typography sx={{ opacity: 0.9, mt: 0.5 }}>{subtitle}</Typography> : null}
          </Box>
          {actions ? <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{actions}</Box> : null}
        </Paper>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 3, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{title}</Typography>
            {subtitle ? <Typography color="text.secondary">{subtitle}</Typography> : null}
          </Box>
          {actions}
        </Box>
      )}
      {children}
    </Box>
  );
}
