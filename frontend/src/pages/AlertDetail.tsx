import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useCriticalAlerts } from "../hooks/useCriticalAlerts";
import { departmentOf } from "../components/home/AlertsPanel";
import { guideFor } from "../utils/alertGuide";
import { dismissOperationalAlert } from "../services/OperationalAlertResolutionApi";
import { loadBrandKit, type ControlledText } from "../services/BrandKitApi";
import { OPEN_ALERTS_EVENT } from "../components/alerts/AlertsMenu";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Tela do problema: o que está acontecendo, o que fazer para resolver e a instrução de trabalho ou POP da clínica relacionada.
export default function AlertDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const alertId = decodeURIComponent(id);
  const { alerts } = useCriticalAlerts();
  const alert = alerts.find((a) => a.id === alertId);
  const [docs, setDocs] = useState<Array<{ kind: "IT" | "POP" | "Manual"; doc: ControlledText }>>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    loadBrandKit()
      .then((r) => {
        const t = r.kit.texts || {};
        const list: Array<{ kind: "IT" | "POP" | "Manual"; doc: ControlledText }> = [];
        if (t.it?.texto?.trim()) list.push({ kind: "IT", doc: t.it });
        if (t.pop?.texto?.trim()) list.push({ kind: "POP", doc: t.pop });
        if (t.manual?.texto?.trim()) list.push({ kind: "Manual", doc: t.manual });
        setDocs(list);
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoaded(true));
  }, []);

  if (!alert) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/")}>Voltar ao início</Button>
        <Alert severity="info" sx={{ mt: 2, maxWidth: 640 }}>Este alerta não está mais ativo. Ele já foi resolvido ou retirado da equipe.</Alert>
      </Box>
    );
  }

  const guide = guideFor(alert);
  const dept = departmentOf(alert);
  const related = docs.filter(({ doc }) => guide.keywords.some((k) => norm(`${doc.titulo} ${doc.texto}`).includes(norm(k))));

  const confirmDismiss = async () => {
    if (!reason.trim()) return;
    setBusy(true); setError("");
    try {
      await dismissOperationalAlert(alert, reason.trim(), note.trim() || undefined);
      setDismissOpen(false);
      navigate("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível dispensar o aviso."); }
    finally { setBusy(false); }
  };

  return (
    <Box sx={{ maxWidth: 820, textAlign: "left" }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ALERTS_EVENT, { detail: dept }))}>Voltar à lista de {dept}</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        <Chip size="small" color={alert.severity === "error" ? "error" : "warning"} label={alert.severity === "error" ? "Crítico" : "Atenção"} />
        <Chip size="small" variant="outlined" label={dept} />
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 900, mb: 2 }}>{alert.title}</Typography>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 900, mb: 0.5 }}>O que está acontecendo</Typography>
        <Typography sx={{ mb: 1 }}>{alert.description}</Typography>
        <Typography color="text.secondary">{guide.problem}</Typography>
        <Typography sx={{ fontWeight: 900, mt: 2, mb: 0.5 }}>Por que importa</Typography>
        <Typography color="text.secondary">{guide.why}</Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>O que fazer para resolver</Typography>
        <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.8 }}>
          {guide.steps.map((s, i) => <Typography component="li" key={i}>{s}</Typography>)}
        </Box>
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
          <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => navigate(alert.route)}>Resolver na origem</Button>
          <Button color="inherit" onClick={() => { setReason(""); setNote(""); setError(""); setDismissOpen(true); }}>Dispensar aviso</Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 900, mb: 1 }}>Instrução de trabalho e POP da clínica</Typography>
        {!docsLoaded && <Typography color="text.secondary">Procurando instruções...</Typography>}
        {docsLoaded && related.length === 0 && (
          <Alert severity="info" action={<Button size="small" onClick={() => navigate("/kit-clinica")}>Abrir Kit da Clínica</Button>}>
            Ainda não há instrução de trabalho nem POP cadastrado para este problema. Cadastre no Kit da Clínica para aparecer aqui.
          </Alert>
        )}
        <Box sx={{ display: "grid", gap: 1 }}>
          {related.map(({ kind, doc }) => (
            <Paper key={kind} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" color="primary" label={kind} />
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{doc.titulo}{doc.codigo ? ` • ${doc.codigo}` : ""}</Typography>
                <Button size="small" onClick={() => setShown(shown === kind ? null : kind)}>{shown === kind ? "Ocultar" : "Ler"}</Button>
              </Box>
              {shown === kind && <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }} variant="body2">{doc.texto}</Typography>}
            </Paper>
          ))}
        </Box>
      </Paper>

      <Dialog open={dismissOpen} onClose={() => !busy && setDismissOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Dispensar aviso</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Use somente quando o aviso for improcedente, duplicado, demonstrativo ou não aplicável. Para uma pendência real, use “Resolver na origem”.</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField autoFocus fullWidth required label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mb: 2 }} />
          <TextField fullWidth multiline minRows={2} label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDismissOpen(false)} disabled={busy}>Cancelar</Button>
          <Button variant="contained" onClick={() => void confirmDismiss()} disabled={busy || !reason.trim()}>Confirmar e retirar da equipe</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
