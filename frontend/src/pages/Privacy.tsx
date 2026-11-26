import { Box, Paper, Typography } from "@mui/material";
import { PRIVACY_META, PRIVACY_SECTIONS, PRIVACY_TITLE } from "./privacyContent";

// Texto em **negrito** do documento vira <strong>.
function rich(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

// Política de privacidade pública (a Meta exige uma URL para publicar o app do WhatsApp).
export default function Privacy() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", justifyItems: "center", p: 2, bgcolor: "background.default" }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, width: "min(860px,100%)", my: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>{PRIVACY_TITLE}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>{PRIVACY_META}</Typography>
        {PRIVACY_SECTIONS.map((s) => (
          <Box key={s.h} sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{s.h}</Typography>
            {s.items.map((it, i) =>
              it.t === "li" ? (
                <Typography key={i} component="li" sx={{ ml: 3, mb: 0.5 }}>{rich(it.x)}</Typography>
              ) : (
                <Typography key={i} sx={{ mb: 1 }}>{rich(it.x)}</Typography>
              ),
            )}
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
