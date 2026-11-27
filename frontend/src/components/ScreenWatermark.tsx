import { Box } from "@mui/material";
import { readSessionUser } from "../services/DemoAccess";

/**
 * Marca d'água rastreável (nome/e-mail/data-hora de quem está vendo a tela), repetida em mosaico com baixa
 * opacidade. Não impede print/captura — nada no navegador impede isso — mas torna qualquer cópia rastreável
 * até a conta que a gerou. Some da impressão (classe no-print) para não poluir relatórios reais.
 */
export default function ScreenWatermark() {
  const u = readSessionUser();
  if (!u) return null;
  const nome = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
  const texto = `${nome} · ${u.email} · ${new Date().toLocaleString("pt-BR")}`;
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200"><text x="0" y="40" transform="rotate(-28 0,40)" font-family="Arial" font-size="15" fill="rgba(0,0,0,0.55)">${texto}</text></svg>`,
  );
  return (
    <Box
      className="no-print"
      aria-hidden
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        pointerEvents: "none",
        opacity: 0.06,
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,${svg}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}
