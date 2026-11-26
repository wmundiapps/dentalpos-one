import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import HandshakeIcon from "@mui/icons-material/Handshake";
import { authorizePartners, loadPartnerStatus, type PartnerClinicStatus } from "../services/StockPartnersApi";

// Botão do dentista para autorizar (ou revogar) o aviso de estoque baixo a empresas parceiras.
export default function StockPartnersCard() {
  const [data, setData] = useState<PartnerClinicStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => { loadPartnerStatus().then(setData).catch(() => setData(null)); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;

  const change = async (value: boolean) => {
    setBusy(true); setError("");
    try { await authorizePartners(value); load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <HandshakeIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Parcerias de reposição</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Quando um item do estoque chegar ao mínimo, o CompletoDonto avisa por e-mail empresas parceiras (fornecedores) para elas oferecerem reposição direto à sua clínica. Só são avisadas empresas parceiras ativas e em dia. O aviso informa o nome da clínica, o telefone e e-mail de contato e os itens com estoque baixo (nome, saldo e mínimo). Nenhum dado de paciente é compartilhado. Você pode revogar a qualquer momento.
      </Typography>
      {data.authorized ? (
        <Alert severity="success" sx={{ mb: 2 }}>Autorizado{data.authorizedBy ? ` por ${data.authorizedBy}` : ""}{data.authorizedAt ? ` em ${new Date(data.authorizedAt).toLocaleDateString("pt-BR")}` : ""}. Avisos enviados nos últimos 30 dias: {data.noticesLast30Days}.</Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>Desligado. Nenhum parceiro é avisado enquanto você não autorizar.</Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {data.authorized
        ? <Button color="error" variant="outlined" disabled={busy} onClick={() => void change(false)}>Revogar autorização</Button>
        : <Button variant="contained" disabled={busy} onClick={() => void change(true)}>Autorizar avisos a empresas parceiras</Button>}
    </Paper>
  );
}
