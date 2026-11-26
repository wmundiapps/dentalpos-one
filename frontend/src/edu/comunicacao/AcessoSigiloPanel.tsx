import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, TextField, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { BASE, fmtDateTime, useLoad, type Toast } from "./common";

/** Botão "Ampla/Sigilosa" + pedido de acesso quando o atendente fica sem permissão de ver a conversa. */
export function BotaoSigilo({ id, sigilosa, toast, onChanged }: { id: string; sigilosa: boolean; toast: (t: Toast) => void; onChanged: () => void }) {
  async function alternar() {
    try {
      await eduApi.post(`${BASE}/conversas/${id}/sigilo`, { sigilosa: !sigilosa });
      toast({ type: "success", text: sigilosa ? "Conversa voltou a ser ampla." : "Conversa marcada como sigilosa." });
      onChanged();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Chip
      size="small"
      icon={sigilosa ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
      label={sigilosa ? "Sigilosa" : "Ampla"}
      color={sigilosa ? "error" : "default"}
      variant={sigilosa ? "filled" : "outlined"}
      onClick={alternar}
      sx={{ cursor: "pointer" }}
    />
  );
}

/** Mostrado quando o backend recusa o GET da conversa por sigilo (403): deixa pedir acesso ao Jurídico/Reitoria. */
export function SemAcessoSigilo({ id, toast }: { id: string; toast: (t: Toast) => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviado, setEnviado] = useState(false);
  async function solicitar() {
    try {
      await eduApi.post(`${BASE}/conversas/${id}/acesso/solicitar`, { motivo: motivo.trim() });
      setEnviado(true);
      toast({ type: "success", text: "Pedido enviado ao Jurídico e à Reitoria." });
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box sx={{ p: 4, textAlign: "center", maxWidth: 420, mx: "auto" }}>
      <LockIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
      <Typography sx={{ fontWeight: 800, mb: 1 }}>Conversa sigilosa</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Você não tem acesso a esta conversa. Quem está atendendo agora pode vê-la; para qualquer outra pessoa, o acesso
        precisa ser liberado pelo Jurídico ou pela Reitoria.
      </Typography>
      {enviado ? (
        <Alert severity="success">Pedido enviado. Você será avisado quando for decidido.</Alert>
      ) : (
        <>
          <TextField fullWidth multiline minRows={2} size="small" placeholder="Por que você precisa ver esta conversa?" value={motivo} onChange={(e) => setMotivo(e.target.value)} sx={{ mb: 1 }} />
          <Button variant="contained" disabled={motivo.trim().length < 3} onClick={solicitar}>Solicitar acesso</Button>
        </>
      )}
    </Box>
  );
}

/** Painel do Jurídico/Reitoria: decidir pedidos pendentes desta conversa, e ver o log de quem acessou. */
export function AcessoAuditoriaDialog({ id, open, onClose, toast }: { id: string; open: boolean; onClose: () => void; toast: (t: Toast) => void }) {
  const info = useLoad<{ solicitacoes: any[]; log: any[] }>(open ? `${BASE}/conversas/${id}/acesso` : null);
  async function decidir(solicitacaoId: string, aprovar: boolean) {
    try {
      await eduApi.post(`${BASE}/acesso/solicitacoes/${solicitacaoId}/decidir`, { aprovar });
      toast({ type: "success", text: aprovar ? "Acesso aprovado." : "Pedido negado." });
      info.reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const pendentes = (info.data?.solicitacoes || []).filter((s) => s.status === "PENDENTE");
  const decididas = (info.data?.solicitacoes || []).filter((s) => s.status !== "PENDENTE");
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Acesso sigiloso e auditoria</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {info.error ? <Alert severity="info">{info.error.includes("permissão") ? "Só o Jurídico ou a Reitoria veem os pedidos de acesso." : info.error}</Alert> : null}
        {pendentes.length > 0 && (
          <Box>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Pedidos pendentes</Typography>
            {pendentes.map((s) => (
              <Box key={s.id} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, mb: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{s.solicitanteNome}</Typography>
                <Typography variant="body2" color="text.secondary">{s.motivo}</Typography>
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button size="small" variant="contained" color="success" onClick={() => decidir(s.id, true)}>Aprovar</Button>
                  <Button size="small" variant="outlined" color="error" onClick={() => decidir(s.id, false)}>Negar</Button>
                </Box>
              </Box>
            ))}
            <Divider sx={{ my: 1.5 }} />
          </Box>
        )}
        {decididas.length > 0 && (
          <Box>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>Pedidos já decididos</Typography>
            {decididas.map((s) => (
              <Typography key={s.id} variant="body2" sx={{ mb: 0.5 }}>
                {s.solicitanteNome}: <b>{s.status === "APROVADO" ? "aprovado" : "negado"}</b> por {s.decisorNome} em {fmtDateTime(s.decididoEm)}
              </Typography>
            ))}
            <Divider sx={{ my: 1.5 }} />
          </Box>
        )}
        <Box>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>Quem acessou (auditoria)</Typography>
          {(info.data?.log || []).length === 0 ? <Typography color="text.secondary">Sem registros ainda.</Typography> : null}
          {(info.data?.log || []).map((l) => (
            <Typography key={l.id} variant="caption" sx={{ display: "block" }}>{fmtDateTime(l.createdAt)} — {l.userNome}: {l.acao.replace(/_/g, " ").toLowerCase()}</Typography>
          ))}
        </Box>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}
