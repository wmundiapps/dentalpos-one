import { Box, Button, Chip, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import conteudo from "./conteudo.json";

/** Capa do ambiente de demonstração: apresenta o produto e a desenvolvedora (WMundi). */
export default function EduCapa() {
  const { produto, wmundi, curriculo, seguranca } = conteudo;
  const temCurriculo = Boolean(curriculo.nome || curriculo.resumo);
  return (
    <Box sx={{ color: "#fff", maxWidth: 620, display: { xs: "none", md: "block" } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
        <Box sx={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, background: "linear-gradient(135deg,#0F5FDB,#6366F1)", boxShadow: "0 4px 14px rgba(0,0,0,.35)" }}>EM</Box>
        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>{produto.completo}</Typography>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.25, mb: 1.5 }}>{produto.tagline}</Typography>
      <Typography sx={{ opacity: 0.85, mb: 3 }}>{produto.subtitulo}</Typography>

      <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", mb: 2.5 }}>
        <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 1.2 }}>Desenvolvido por</Typography>
        <Box component="img" src="/wmundi-logo.svg" alt="WMundi Technologies" sx={{ height: 40, bgcolor: "#fff", borderRadius: 1.5, px: 1.5, py: 0.5, mb: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{wmundi.nome}</Typography>
        <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>{wmundi.resumo}</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
          <Chip size="small" label="Apple · iOS" sx={{ bgcolor: "rgba(255,255,255,.16)", color: "#fff" }} />
          <Chip size="small" label="Android" sx={{ bgcolor: "rgba(255,255,255,.16)", color: "#fff" }} />
          <Chip size="small" label="Web e nuvem" sx={{ bgcolor: "rgba(255,255,255,.16)", color: "#fff" }} />
          <Chip size="small" label="IA aplicada" sx={{ bgcolor: "rgba(255,255,255,.16)", color: "#fff" }} />
        </Box>
        {temCurriculo ? (
          <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid rgba(255,255,255,.18)" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{curriculo.nome}{curriculo.cargo ? ` · ${curriculo.cargo}` : ""}</Typography>
            {curriculo.resumo ? <Typography variant="body2" sx={{ opacity: 0.9 }}>{curriculo.resumo}</Typography> : null}
          </Box>
        ) : null}
      </Box>

      <Box sx={{ display: "flex", gap: 1.2, alignItems: "flex-start", mb: 2.5 }}>
        <LockOutlinedIcon sx={{ mt: 0.3 }} />
        <Typography variant="body2" sx={{ opacity: 0.92 }}>
          <b>Tudo criptografado.</b> {seguranca.itens[0]}; dados sensíveis protegidos com AES-256. A tecnologia anti-código também reforça a proteção contra ataques.
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Button variant="contained" color="inherit" sx={{ color: "#0b2a5b", fontWeight: 700 }} href="/apresentacao">Ver a apresentação</Button>
        <Button variant="outlined" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.6)" }} startIcon={<PictureAsPdfOutlinedIcon />} href="/apresentacao-edumaster.pdf" target="_blank" rel="noopener">Baixar PDF</Button>
      </Box>
    </Box>
  );
}
