import { Box, Button, Chip, Container, Paper, Typography } from "@mui/material";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import conteudo from "./conteudo.json";

/** Página pública de apresentação (sem login) — mesma fonte de conteúdo do PDF. */
export default function Apresentacao() {
  const { produto, pilares, seguranca, lgpd, wmundi, curriculo, contato } = conteudo;
  const temCurriculo = Boolean(curriculo.nome || curriculo.resumo || curriculo.itens.length);
  const temContato = Boolean(contato.email || contato.telefone);
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f4f6fb" }}>
      <Box sx={{ color: "#fff", py: { xs: 5, md: 8 }, background: "linear-gradient(135deg,#07111f,#102a43 55%,#0b5fff)" }}>
        <Container maxWidth="md">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Box sx={{ width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, background: "linear-gradient(135deg,#0F5FDB,#6366F1)" }}>EM</Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>{produto.completo}</Typography>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>{produto.tagline}</Typography>
          <Typography sx={{ opacity: 0.85, mb: 3 }}>{produto.subtitulo}</Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <Button variant="contained" color="inherit" sx={{ color: "#0b2a5b", fontWeight: 700 }} href="/">Acessar a demonstração</Button>
            <Button variant="outlined" sx={{ color: "#fff", borderColor: "rgba(255,255,255,.6)" }} startIcon={<PictureAsPdfOutlinedIcon />} href="/apresentacao-edumaster.pdf" target="_blank" rel="noopener">Baixar PDF</Button>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
          <Typography variant="overline" color="text.secondary">Desenvolvido por</Typography>
          <Box component="img" src="/wmundi-logo.svg" alt="WMundi Technologies" sx={{ height: 40, bgcolor: "#fff", borderRadius: 1.5, px: 1.5, py: 0.5, mb: 1 }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{wmundi.nome}</Typography>
          <Typography sx={{ mt: 1 }}>{wmundi.resumo}</Typography>
          <Box component="ul" sx={{ pl: 2.5, mt: 1.5, mb: 0 }}>{wmundi.itens.map((i) => <li key={i}><Typography variant="body2">{i}</Typography></li>)}</Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
            <Chip label="Apple · iOS" color="primary" variant="outlined" /><Chip label="Android" color="primary" variant="outlined" />
          </Box>
          {temCurriculo ? (
            <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{curriculo.nome}{curriculo.cargo ? ` · ${curriculo.cargo}` : ""}</Typography>
              {curriculo.resumo ? <Typography variant="body2" sx={{ mt: 0.5 }}>{curriculo.resumo}</Typography> : null}
              {curriculo.itens.length ? <Box component="ul" sx={{ pl: 2.5, mt: 1, mb: 0 }}>{curriculo.itens.map((i) => <li key={i}><Typography variant="body2">{i}</Typography></li>)}</Box> : null}
            </Box>
          ) : null}
        </Paper>

        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, mb: 3 }}>
          {pilares.map((p) => (
            <Paper key={p.titulo} sx={{ p: 2.5, borderRadius: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{p.titulo}</Typography>
              <Box component="ul" sx={{ pl: 2.5, m: 0 }}>{p.itens.map((i) => <li key={i}><Typography variant="body2">{i}</Typography></li>)}</Box>
            </Paper>
          ))}
        </Box>

        <Paper sx={{ p: 3, borderRadius: 4, mb: 3, borderLeft: "6px solid #0F5FDB" }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}><LockOutlinedIcon color="primary" /><Typography variant="h6" sx={{ fontWeight: 800 }}>{seguranca.titulo}</Typography></Box>
          <Box component="ul" sx={{ pl: 2.5, m: 0 }}>{seguranca.itens.map((i) => <li key={i}><Typography variant="body2">{i}</Typography></li>)}</Box>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 4, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{lgpd.titulo}</Typography>
          <Box component="ul" sx={{ pl: 2.5, m: 0 }}>{lgpd.itens.map((i) => <li key={i}><Typography variant="body2">{i}</Typography></li>)}</Box>
        </Paper>

        {temContato ? (
          <Paper sx={{ p: 3, borderRadius: 4 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Contato</Typography>
            <Typography variant="body2">{[contato.site, contato.email, `WhatsApp ${contato.telefone}`, contato.endereco].filter(Boolean).join(" · ")}</Typography>
          </Paper>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3, textAlign: "center" }}>
          {produto.completo} · desenvolvido por {wmundi.nome}. Ambiente de demonstração com dados fictícios.
        </Typography>
      </Container>
    </Box>
  );
}
