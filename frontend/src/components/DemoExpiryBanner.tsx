import { useEffect, useState } from "react";
import { Box } from "@mui/material";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

/** Faixa discreta com o prazo da demonstração (aparece só quando o servidor define DEMO_EXPIRES_AT). */
export default function DemoExpiryBanner() {
  const [info, setInfo] = useState<{ expiresAt: string | null; expired: boolean; daysLeft: number | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`${API}/demo-info`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo) setInfo(j); }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  if (!info?.expiresAt) return null;
  const data = new Date(info.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const texto = info.expired
    ? `Demonstração encerrada em ${data}.`
    : `Ambiente de demonstração disponível até ${data} (${info.daysLeft} ${info.daysLeft === 1 ? "dia restante" : "dias restantes"}).`;
  return (
    <Box className="no-print" sx={{ bgcolor: "primary.main", color: "primary.contrastText", textAlign: "center", fontSize: 13, fontWeight: 600, py: 0.5, px: 1.5 }}>
      {texto}
    </Box>
  );
}
