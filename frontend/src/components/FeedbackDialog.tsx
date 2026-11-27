import { useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogContent, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import EmojiObjectsIcon from "@mui/icons-material/EmojiObjects";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CloseIcon from "@mui/icons-material/Close";
import { useLocation } from "react-router-dom";
import { navigationItems } from "../config/navigation";
import { createPlatformFeedback } from "../services/PlatformFeedbackApi";

function moduleFromPath(pathname: string): string {
  const exact = navigationItems.find((i) => i.path.split("?")[0] === pathname);
  if (exact) return exact.label;
  const partial = navigationItems
    .filter((i) => i.path !== "/" && pathname.startsWith(i.path.split("?")[0]))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (partial) return partial.label;
  return pathname === "/" ? "Dashboard" : pathname;
}

const DEPARTMENTS = ["Recepção / Agenda", "Clínico", "Financeiro", "Laboratório", "Estoque", "RH", "Marketing", "Outro / não sei"];
const ORANGE = "#E07B2E";

// Caixinha de sugestões: aberta pelo rodapé ou pelo cabeçalho, sem ficar flutuando sobre a tela do sistema.
export default function FeedbackDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent?: () => void }) {
  const location = useLocation();
  const [kind, setKind] = useState<"Sugestão" | "Bug">("Sugestão");
  const [department, setDepartment] = useState("Outro / não sei");
  const [description, setDescription] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const modulo = moduleFromPath(location.pathname);

  const close = () => {
    if (busy) return;
    setError("");
    setSent(false);
    onClose();
  };

  const submit = async () => {
    const text = description.trim();
    if (text.length < 5) { setError("Descreva a melhoria ou o erro que você encontrou."); return; }
    setBusy(true);
    setError("");
    try {
      await createPlatformFeedback({
        type: kind,
        priority: "Média",
        title: `${kind === "Bug" ? "Erro" : "Sugestão"}: ${text.replace(/\s+/g, " ").slice(0, 100)}`,
        description: `Departamento: ${department}\n\n${text}`,
        module: modulo,
        pagePath: `${location.pathname}${location.search}`,
        ...(rating >= 1 ? { rating } : {}),
      });
      setSent(true);
      setDescription("");
      setRating(0);
      setKind("Sugestão");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  };

  const field = { "& .MuiOutlinedInput-root": { borderRadius: 4, bgcolor: "background.paper" } } as const;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: 6, border: `3px solid ${ORANGE}`, bgcolor: (t) => (t.palette.mode === "light" ? "#EEF1E2" : "#1B2433"), m: { xs: 1.5, sm: 3 }, width: { xs: "calc(100% - 24px)", sm: undefined } } } }}>
      <DialogContent sx={{ p: { xs: 2, sm: 3 }, display: "grid", gap: 1.75, textAlign: "left" }}>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
          <EmojiObjectsIcon sx={{ color: ORANGE, fontSize: 44, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900, textTransform: "uppercase", fontSize: { xs: 17, sm: 20 }, lineHeight: 1.25 }}>
              Qual melhoria você gostaria de implementar? Nos conte aqui na caixinha de sugestões
            </Typography>
            <Typography sx={{ fontWeight: 800, textTransform: "uppercase", fontSize: { xs: 13, sm: 15 }, lineHeight: 1.25, mt: 0.75 }}>
              Caso queira relatar algum erro, pode usar esta mesma caixa
            </Typography>
          </Box>
          <IconButton aria-label="Fechar" onClick={close} size="small" sx={{ mt: -0.5 }}><CloseIcon /></IconButton>
        </Box>

        {sent ? (
          <>
            <Alert severity="success">Obrigado! Sua sugestão ou relato será avaliado e, se for aprovado, a melhoria será aplicada.</Alert>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button fullWidth variant="outlined" onClick={() => setSent(false)} sx={{ borderRadius: 4, color: ORANGE, borderColor: ORANGE }}>Enviar outra</Button>
              <Button fullWidth variant="contained" onClick={close} sx={{ borderRadius: 4, bgcolor: ORANGE, "&:hover": { bgcolor: "#C96A22" } }}>Fechar</Button>
            </Box>
          </>
        ) : (
          <>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Chip clickable label="Sugestão de melhoria" onClick={() => setKind("Sugestão")} sx={{ fontWeight: 800, bgcolor: kind === "Sugestão" ? ORANGE : "transparent", color: kind === "Sugestão" ? "#fff" : "text.primary", border: `1px solid ${ORANGE}` }} />
              <Chip clickable label="Relatar erro" onClick={() => setKind("Bug")} sx={{ fontWeight: 800, bgcolor: kind === "Bug" ? ORANGE : "transparent", color: kind === "Bug" ? "#fff" : "text.primary", border: `1px solid ${ORANGE}` }} />
            </Box>
            <TextField label="Tela / funcionalidade" value={modulo} helperText="Preenchido automaticamente com a tela onde você está" slotProps={{ input: { readOnly: true } }} sx={field} />
            <TextField select label="Para qual departamento é esta melhoria/erro?" value={department} onChange={(e) => setDepartment(e.target.value)} helperText={'Escolha o setor responsável; se não souber, deixe "Outro"'} sx={field}>
              {DEPARTMENTS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
            <TextField multiline minRows={5} placeholder="Descreva em detalhes o problema encontrado ou a melhoria que gostaria de implementar: o que acontece, o que era esperado, e em qual situação..." value={description} onChange={(e) => setDescription(e.target.value)} sx={field} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>Nota do sistema (opcional):</Typography>
              {[1, 2, 3, 4, 5].map((n) => (
                <IconButton key={n} size="small" aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => setRating(rating === n ? 0 : n)}>
                  {rating >= n ? <StarIcon fontSize="small" sx={{ color: "#F5A623" }} /> : <StarBorderIcon fontSize="small" sx={{ color: "#F5A623" }} />}
                </IconButton>
              ))}
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <Button fullWidth variant="contained" disabled={busy} onClick={() => void submit()} sx={{ borderRadius: 4, py: 1.4, fontWeight: 900, fontSize: 16, bgcolor: ORANGE, "&:hover": { bgcolor: "#C96A22" } }}>
              {busy ? "Enviando..." : "Enviar"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
