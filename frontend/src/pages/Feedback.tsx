import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import AddCommentIcon from "@mui/icons-material/AddComment";
import PageHeader from "../components/PageHeader";
import FeedbackDialog from "../components/FeedbackDialog";
import { isWmundiStaff } from "../components/WmundiStaffOnly";
import { FEEDBACK_STATUSES, listPlatformFeedbacks, updatePlatformFeedbackStatus, type PlatformFeedback } from "../services/PlatformFeedbackApi";

type ChipColor = "default" | "primary" | "info" | "success" | "warning" | "error";
const statusColor = (s: string): ChipColor => s === "Resolvido" ? "success" : s === "Em desenvolvimento" ? "primary" : s === "Em análise" ? "warning" : s === "Arquivado" ? "default" : "info";
const priorityColor = (p: string): ChipColor => p === "Crítica" ? "error" : p === "Alta" ? "warning" : p === "Média" ? "info" : "default";

export default function Feedback() {
  const staff = isWmundiStaff();
  const [rows, setRows] = useState<PlatformFeedback[]>([]);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows(await listPlatformFeedbacks(staff && all)); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar relatos."); }
    finally { setLoading(false); }
  }, [staff, all]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (id: string, status: string) => {
    try { await updatePlatformFeedbackStatus(id, status); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao atualizar."); }
  };

  const openCount = rows.filter((r) => r.status !== "Resolvido" && r.status !== "Arquivado").length;
  const critical = rows.filter((r) => r.priority === "Crítica" && r.status !== "Resolvido").length;
  const cards: [string, number][] = [["Relatos", rows.length], ["Em aberto", openCount], ["Críticos", critical]];

  return (
    <Box>
      <PageHeader title={"Sugestões e Problemas"} description={"Relate bugs, botões que não funcionam, correções e ideias de novas funcionalidades. Cada relato chega direto à equipe DentalPos One."} />
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <Button variant="contained" startIcon={<AddCommentIcon />} onClick={() => setOpen(true)}>Novo relato</Button>
        {staff && <FormControlLabel control={<Switch checked={all} onChange={(_, v) => setAll(v)} />} label={"Todas as clínicas (equipe WMundi)"} />}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 2, mb: 2 }}>
        {cards.map(([t, v]) => (
          <Paper key={t} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography color="text.secondary">{t}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 900 }}>{v}</Typography>
          </Paper>
        ))}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        {loading ? (
          <Typography color="text.secondary">Carregando...</Typography>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">{"Nenhum relato ainda. Use o botão acima ou o ícone de balão no topo de qualquer tela."}</Typography>
        ) : rows.map((r) => (
          <Paper key={r.id} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>{r.title}</Typography>
                <Typography variant="body2" color="text.secondary">{`${r.type} • ${r.module || "-"}`}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" label={r.priority} color={priorityColor(r.priority)} />
                {staff ? (
                  <TextField select size="small" value={r.status} onChange={(e) => void changeStatus(r.id, e.target.value)} sx={{ minWidth: 170 }}>
                    {FEEDBACK_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                ) : (
                  <Chip size="small" label={r.status} color={statusColor(r.status)} />
                )}
              </Box>
            </Box>
            <Typography color="text.secondary" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>{r.description}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {`Enviado por ${r.userName} em ${new Date(r.createdAt).toLocaleString("pt-BR")}${r.pagePath ? ` • tela ${r.pagePath}` : ""}`}
            </Typography>
          </Paper>
        ))}
      </Paper>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} onSent={() => void load()} />
    </Box>
  );
}