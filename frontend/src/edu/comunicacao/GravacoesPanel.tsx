import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { BASE, fmtDateTime, useLoad, type Toast } from "./common";

const GRAVAVEIS = ["WHATSAPP", "TELEGRAM", "VOZ"];

/** Gravação de voz (WhatsApp/Telegram/telefone) com aviso automático antes de começar, e arquivo das gravações concluídas. */
export default function GravacoesPanel({ id, canalTipo, toast }: { id: string; canalTipo: string; toast: (t: Toast) => void }) {
  const [avisoAberto, setAvisoAberto] = useState(false);
  const [ativa, setAtiva] = useState<{ id: string; avisoTexto: string } | null>(null);
  const lista = useLoad<{ items: any[] }>(`${BASE}/conversas/${id}/gravacoes`);

  if (!GRAVAVEIS.includes(canalTipo)) return null;

  async function confirmarEIniciar() {
    try {
      const g = await eduApi.post(`${BASE}/conversas/${id}/gravacoes/iniciar`, {});
      setAtiva({ id: g.id, avisoTexto: g.avisoTexto });
      setAvisoAberto(false);
      toast({ type: "success", text: "Gravação iniciada. O aviso foi dado antes de começar." });
    } catch (e: any) { toast({ type: "error", text: e.message }); setAvisoAberto(false); }
  }
  async function finalizar() {
    if (!ativa) return;
    try {
      await eduApi.post(`${BASE}/conversas/${id}/gravacoes/${ativa.id}/finalizar`, {});
      setAtiva(null);
      toast({ type: "success", text: "Gravação arquivada." });
      lista.reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  return (
    <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: "divider" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="caption" sx={{ fontWeight: 800 }}>Gravação de voz:</Typography>
        {ativa ? (
          <Button size="small" color="error" variant="contained" startIcon={<StopCircleIcon />} onClick={finalizar}>Finalizar e arquivar</Button>
        ) : (
          <Button size="small" variant="outlined" startIcon={<FiberManualRecordIcon />} onClick={() => setAvisoAberto(true)}>Gravar</Button>
        )}
        {(lista.data?.items || []).filter((g: any) => g.status === "CONCLUIDA").map((g: any) => (
          <Chip key={g.id} size="small" variant="outlined" label={`Gravação ${fmtDateTime(g.createdAt)}`} />
        ))}
      </Box>

      <Dialog open={avisoAberto} onClose={() => setAvisoAberto(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Aviso de gravação</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>
            Esta mensagem é dada automaticamente antes de qualquer gravação começar. Nunca se grava sem avisar.
          </Alert>
          <Typography>
            {canalTipo === "VOZ"
              ? "Esta chamada será gravada para fins de qualidade e segurança. Ao continuar, você concorda com a gravação."
              : "Esta conversa poderá ter trechos de voz gravados e arquivados para fins de qualidade e segurança."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvisoAberto(false)}>Cancelar</Button>
          <Button variant="contained" onClick={confirmarEIniciar}>Já avisei: começar a gravar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
