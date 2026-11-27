import { Alert, Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { useCallback, useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtDataHora, msgErro } from "../reitoria/common";
import { useConfirmAcao } from "./acoes";

interface Notif { id: string; assunto?: string | null; mensagem: string; createdAt: string; lidaEm?: string | null }

export default function NotificacoesTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const { run, aviso } = useConfirmAcao();

  const carregar = useCallback(async () => {
    setErro(null);
    try { const r = await eduApi.get<{ items: Notif[]; naoLidas: number }>("/core/notificacoes?pageSize=50"); setItems(r.items || []); setNaoLidas(r.naoLidas || 0); }
    catch (e) { setErro(msgErro(e)); setItems([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const depois = () => { carregar(); onChanged(); };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography color="text.secondary">{naoLidas} não lida(s)</Typography>
        <Button startIcon={<DoneAllIcon />} disabled={!naoLidas} onClick={() => run(() => eduApi.post("/reitoria/mesa/notificacoes/lidas"), "Todas marcadas como lidas.", depois)}>Marcar todas como lidas</Button>
      </Box>
      {erro && <Alert severity="warning" sx={{ mb: 2 }}>Não foi possível carregar as notificações: {erro}</Alert>}
      {items === null && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress /></Box>}
      {items && !erro && items.length === 0 && <Alert severity="info">Nenhuma notificação.</Alert>}
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {(items || []).map((n) => (
          <Paper key={n.id} variant="outlined" sx={{ p: 2, borderRadius: 3, opacity: n.lidaEm ? 0.65 : 1, borderLeft: n.lidaEm ? undefined : "6px solid #2E7DD6", display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography sx={{ fontWeight: n.lidaEm ? 500 : 700 }}>{n.assunto || n.mensagem}</Typography>
              {n.assunto && <Typography variant="body2" color="text.secondary">{n.mensagem}</Typography>}
              <Typography variant="caption" color="text.secondary">{fmtDataHora(n.createdAt)}</Typography>
            </Box>
            {!n.lidaEm && <Button size="small" onClick={() => run(() => eduApi.post(`/core/notificacoes/${n.id}/lida`), "Marcada como lida.", depois)}>Marcar como lida</Button>}
          </Paper>
        ))}
      </Box>
      {aviso}
    </Box>
  );
}
