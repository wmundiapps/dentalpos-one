import { Box, Typography } from "@mui/material";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import { useEffect, useState } from "react";
import { loadBranding, type Branding } from "../services/EduApi";

export function useBranding() {
  const [branding, setBranding] = useState<Branding | null>(null);
  useEffect(() => {
    let alive = true;
    loadBranding().then((b) => alive && setBranding(b)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return branding;
}

interface Props {
  /** "hero": faixa de destaque (portal/painéis); "header": barra superior; "sidebar": menu; "stamp": documento impresso */
  variant?: "hero" | "header" | "sidebar" | "stamp";
  kind?: "LOGO_PRINCIPAL" | "LOGO_HORIZONTAL" | "BRASAO";
  showName?: boolean;
  onPlaceholderClick?: () => void;
}

const SIZE = {
  hero: { h: 120, w: 280 },
  header: { h: 52, w: 190 },
  sidebar: { h: 56, w: 180 },
  stamp: { h: 96, w: 260 },
} as const;

/** Logomarca da instituição, com área reservada e destacada mesmo quando ainda não foi enviada. */
export default function InstitutionLogo({ variant = "header", kind = "LOGO_PRINCIPAL", showName = false, onPlaceholderClick }: Props) {
  const b = useBranding();
  const s = SIZE[variant];
  const src = b ? b.logos?.[kind] || b.logoPrincipal : null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      {src ? (
        <Box component="img" src={src} alt={b?.nome || "Logomarca"} sx={{ height: s.h, maxWidth: s.w, objectFit: "contain", flexShrink: 0 }} />
      ) : (
        <Box
          onClick={onPlaceholderClick}
          role={onPlaceholderClick ? "button" : undefined}
          sx={{
            height: s.h, width: variant === "hero" || variant === "stamp" ? s.w : s.h * 1.9, flexShrink: 0, cursor: onPlaceholderClick ? "pointer" : "default",
            border: "2px dashed", borderColor: b?.cores.primaria || "divider", borderRadius: 3, color: b?.cores.primaria || "text.secondary",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.25, opacity: 0.85,
          }}
        >
          <AccountBalanceOutlinedIcon sx={{ fontSize: variant === "hero" ? 40 : 24 }} />
          <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: ".08em", lineHeight: 1 }}>LOGOMARCA</Typography>
          {variant === "hero" && <Typography variant="caption" color="text.secondary">Clique para enviar a logo da instituição</Typography>}
        </Box>
      )}
      {showName && b && (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.15 }} noWrap>{b.nome}</Typography>
          {b.sigla ? <Typography variant="caption" color="text.secondary">{b.sigla}{b.codigoEmec ? ` · e-MEC ${b.codigoEmec}` : ""}</Typography> : null}
        </Box>
      )}
    </Box>
  );
}
