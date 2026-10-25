import { Box, Button, Typography } from "@mui/material";
import SavingsIcon from "@mui/icons-material/Savings";

// Endereço de adesão ao Cashbacksmart. Defina VITE_CASHBACKSMART_URL no ambiente; sem ele o botão aparece como "em breve".
export const CASHBACKSMART_URL = String(import.meta.env.VITE_CASHBACKSMART_URL || "").trim();

interface Props {
  /** "gestor" mostra o convite completo (painel); "paciente" mostra o convite curto (tela do paciente). */
  audience: "gestor" | "paciente";
}

export default function CashbacksmartButton({ audience }: Props) {
  const ready = Boolean(CASHBACKSMART_URL);
  const title = audience === "gestor" ? "Participe do Cashbacksmart" : "Ganhe dinheiro de volta";
  const text = audience === "gestor"
    ? "Seus pacientes e a sua equipe recebem dinheiro de volta nas compras. Cadastre a clínica e comece a participar."
    : "Participe do Cashbacksmart e receba dinheiro de volta nas suas compras.";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
        p: { xs: 2, md: 2.5 },
        borderRadius: 4,
        color: "#fff",
        background: "linear-gradient(120deg, #0B1B3A 0%, #1F6FEB 60%, #14A06B 100%)",
        boxShadow: "0 10px 28px rgba(31,111,235,.28)",
      }}
    >
      <Box sx={{ width: 52, height: 52, borderRadius: "50%", bgcolor: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <SavingsIcon sx={{ fontSize: 30 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Typography sx={{ fontWeight: 900, fontSize: { xs: 18, md: 20 }, lineHeight: 1.2 }}>{title}</Typography>
        <Typography sx={{ opacity: 0.92, fontSize: 14, mt: 0.3 }}>{text}</Typography>
      </Box>
      <Button
        variant="contained"
        size="large"
        disabled={!ready}
        {...(ready ? { href: CASHBACKSMART_URL, target: "_blank", rel: "noopener noreferrer" } : {})}
        sx={{
          fontWeight: 900,
          borderRadius: 99,
          px: 3.5,
          textTransform: "none",
          bgcolor: "#FF8A3D",
          color: "#0B1B3A",
          boxShadow: "0 6px 16px rgba(0,0,0,.25)",
          "&:hover": { bgcolor: "#FFA262" },
          "&.Mui-disabled": { bgcolor: "rgba(255,255,255,.28)", color: "rgba(255,255,255,.85)" },
        }}
      >
        {ready ? "Quero participar" : "Em breve"}
      </Button>
    </Box>
  );
}
