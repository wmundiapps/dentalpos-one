import { useState } from "react";
import { Box, ButtonBase, CircularProgress, Tooltip, Typography } from "@mui/material";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import { readSessionUser } from "../services/DemoAccess";

// Acesso master ao Gerenciador WMundi (programa de representantes da WMundi Marketing).
// O botão só aparece para os e-mails abaixo; a liberação de verdade é feita no servidor
// do gerenciador, que confere a sessão do CompletoDonto e a própria lista de e-mails master.
const MASTER_EMAILS = ["robsonravel@wmundi.com"];
const GERENCIADOR_URL = "https://wmundi-marketing-wmundiapps-projects.vercel.app/";
const SSO_URL = "https://ggumdqwqtggnuvtkaret.supabase.co/functions/v1/sso-completodonto";

export function isGerenciadorMaster(): boolean {
  const email = (readSessionUser()?.email || "").trim().toLowerCase();
  return MASTER_EMAILS.includes(email);
}

export default function GerenciadorWmundiButton({ collapsed }: { collapsed: boolean }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  if (!isGerenciadorMaster()) return null;

  async function abrir() {
    setErro("");
    setLoading(true);
    // Abre a aba já no clique para o navegador não bloquear a janela.
    const win = window.open("about:blank", "_blank");
    try {
      const response = await fetch(SSO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: localStorage.getItem("dentalpos.token") || "",
          clinicId: localStorage.getItem("dentalpos.clinicId") || "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token_hash) throw new Error(data.erro || "Não foi possível abrir o Gerenciador WMundi.");
      const url = `${GERENCIADOR_URL}#sso=${encodeURIComponent(data.token_hash)}`;
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      if (win) win.close();
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o Gerenciador WMundi.");
    } finally {
      setLoading(false);
    }
  }

  const button = (
    <ButtonBase
      onClick={abrir}
      disabled={loading}
      sx={{
        width: "100%", borderRadius: 2, px: collapsed ? 0 : 1.2, py: collapsed ? 1 : 1.1,
        display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: 1,
        bgcolor: "#FFB53F", color: "#0D0D0D", boxShadow: "0 4px 14px rgba(255,181,63,.35)",
        "&:hover": { bgcolor: "#FFC566" },
      }}
    >
      {loading ? <CircularProgress size={18} sx={{ color: "#0D0D0D" }} /> : <DashboardCustomizeIcon fontSize="small" />}
      {!collapsed && (
        <Typography component="span" sx={{ fontWeight: 900, fontSize: 13, letterSpacing: ".4px", textAlign: "left", lineHeight: 1.15 }}>
          GERENCIADOR WMUNDI
        </Typography>
      )}
    </ButtonBase>
  );

  return (
    <Box sx={{ px: collapsed ? 0.5 : 1.2, pt: 1, pb: 0.5 }}>
      {collapsed ? <Tooltip title="GERENCIADOR WMUNDI" placement="right" arrow>{button}</Tooltip> : button}
      {erro && !collapsed && <Typography sx={{ color: "#FCA5A5", fontSize: 11, mt: 0.5 }}>{erro}</Typography>}
    </Box>
  );
}
