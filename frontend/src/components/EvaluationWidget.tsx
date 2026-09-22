import { useState } from "react";
import { Box, Paper, IconButton, Typography, TextField, Button, Tooltip, Collapse, Alert } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CloseIcon from "@mui/icons-material/Close";
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined";
import { useLocation } from "react-router-dom";
import { createPlatformFeedback } from "../services/PlatformFeedbackApi";

const HIDDEN_KEY = "dentalpos.evalWidgetHiddenUntil";
const HIDE_HOURS = 24;

export default function EvaluationWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [closedForNow, setClosedForNow] = useState(() => {
    const until = Number(localStorage.getItem(HIDDEN_KEY) || 0);
    return until > Date.now();
  });

  if (closedForNow) return null;

  const hideForNow = () => {
    localStorage.setItem(HIDDEN_KEY, String(Date.now() + HIDE_HOURS * 60 * 60 * 1000));
    setClosedForNow(true);
  };

  const reset = () => {
    setOpen(false);
    setSent(false);
    setRating(0);
    setSuggestion("");
    setError("");
  };

  const submit = async () => {
    if (rating < 1) {
      setError("Escolha de 1 a 5 estrelas.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createPlatformFeedback({
        type: "Avaliação",
        priority: "Média",
        title: "",
        description: suggestion.trim(),
        rating,
        pagePath: `${location.pathname}${location.search}`,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ position: "fixed", right: { xs: 16, md: 24 }, bottom: { xs: 16, md: 24 }, zIndex: 1300 }}>
      <Collapse in={open} unmountOnExit>
        <Paper elevation={6} sx={{ width: 300, p: 2, borderRadius: 3, mb: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography sx={{ fontWeight: 800 }}>Avalie o sistema</Typography>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {sent ? (
            <>
              <Alert severity="success" sx={{ mb: 1 }}>Obrigado pela avaliação!</Alert>
              <Button fullWidth size="small" onClick={reset}>Fechar</Button>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Como está sua experiência até agora?
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, mb: 1.5 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <IconButton
                    key={n}
                    size="small"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                  >
                    {(hoverRating || rating) >= n ? (
                      <StarIcon fontSize="small" sx={{ color: "#F5A623" }} />
                    ) : (
                      <StarBorderIcon fontSize="small" sx={{ color: "#F5A623" }} />
                    )}
                  </IconButton>
                ))}
              </Box>
              <TextField
                fullWidth
                multiline
                minRows={2}
                size="small"
                placeholder="Alguma sugestão? (opcional)"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                sx={{ mb: 1.5 }}
              />
              {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" onClick={hideForNow}>Agora não</Button>
                <Button fullWidth size="small" variant="contained" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Enviando..." : "Enviar"}
                </Button>
              </Box>
            </>
          )}
        </Paper>
      </Collapse>

      {!open && (
        <Tooltip title="Avaliar o sistema">
          <Paper
            elevation={6}
            onClick={() => setOpen(true)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: 6,
              cursor: "pointer",
              bgcolor: "primary.main",
              color: "#fff",
              "&:hover": { bgcolor: "primary.dark" },
            }}
          >
            <ThumbUpAltOutlinedIcon fontSize="small" />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Avalie o sistema</Typography>
          </Paper>
        </Tooltip>
      )}
    </Box>
  );
}