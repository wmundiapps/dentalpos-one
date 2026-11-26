import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, FormControlLabel, Paper, Switch, Typography } from "@mui/material";
import ShieldIcon from "@mui/icons-material/Shield";
import { listSessions, revokeOtherSessions, revokeSession, type SessionRow } from "../services/SecurityApi";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Sessões ativas: de onde cada pessoa está conectada; permite encerrar à força. Gestor e administrador veem a clínica toda.
export default function SessionsCard() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [all, setAll] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listSessions(all).then((d) => { setRows(d.sessions); setCanManage(d.canManage); setUnavailable(Boolean(d.unavailable)); }).catch(() => setUnavailable(true));
  }, [all]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(false); } };

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <ShieldIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Sessões ativas</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Aqui aparecem os aparelhos conectados à conta. Se vir um que não reconhece, encerre a sessão e troque a senha. O local é aproximado e vem do IP, então pode apontar para a operadora.
      </Typography>
      {canManage && <FormControlLabel control={<Switch checked={all} onChange={(_, v) => setAll(v)} />} label="Mostrar todas as pessoas da clínica" />}
      {unavailable && <Alert severity="info" sx={{ mb: 2 }}>As sessões ainda não estão disponíveis neste ambiente.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {rows.map((r) => (
          <Box key={r.id} sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", p: 1.5, border: "1px solid", borderColor: r.anomaly ? "error.main" : "divider", borderRadius: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{r.userName ? `${r.userName} · ` : ""}{r.device}{r.current && <Chip size="small" color="success" label="este aparelho" sx={{ ml: 1 }} />}{r.anomaly && <Chip size="small" color="error" label="uso estranho" sx={{ ml: 1 }} />}</Typography>
              <Typography variant="body2" color="text.secondary">{r.place} · IP {r.ip || "n/d"} · entrou {when(r.createdAt)} · último uso {when(r.lastSeenAt)}</Typography>
            </Box>
            {!r.current && <Button size="small" color="error" disabled={busy} onClick={() => void act(() => revokeSession(r.id))}>Encerrar</Button>}
          </Box>
        ))}
        {!rows.length && !unavailable && <Typography color="text.secondary">Nenhuma sessão ativa registrada ainda. Elas aparecem a partir do próximo login.</Typography>}
      </Box>
      {rows.some((r) => !r.current) && !all && <Button sx={{ mt: 2 }} variant="outlined" color="error" disabled={busy} onClick={() => void act(revokeOtherSessions)}>Encerrar todas as outras sessões</Button>}
    </Paper>
  );
}
