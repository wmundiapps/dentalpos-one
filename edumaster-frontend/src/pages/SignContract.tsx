import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import SchoolIcon from "@mui/icons-material/School";
import { getContractByToken, signContractByToken } from "../services/ContractApi";

interface ContractView {
  contractNumber: string; institutionName: string; studentName: string; programName: string; termName: string;
  monthlyFee: number | null; tuitionDueDay: number; termsText: string; status: string; signedAt: string | null; signedByName: string | null;
}

export default function SignContract({ token }: { token: string }) {
  const [contract, setContract] = useState<ContractView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try {
      const data = await getContractByToken(token);
      setContract(data);
      setName(data.signedByName || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar contrato."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [token]);

  const sign = async () => {
    if (!name.trim() || name.trim().length < 2) { setError("Informe seu nome completo para confirmar a assinatura."); return; }
    setSigning(true); setError("");
    try {
      await signContractByToken(token, name.trim());
      setSigned(true);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao assinar contrato."); }
    finally { setSigning(false); }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 4, md: 8 }, px: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <SchoolIcon color="primary" />
          <Typography variant="overline" sx={{ fontWeight: 900, letterSpacing: 2 }}>EDUMASTER PRO — ASSINATURA ELETRÔNICA</Typography>
        </Box>

        {loading && <Typography color="text.secondary">Carregando contrato…</Typography>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {contract && (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>Contrato {contract.contractNumber}</Typography>
                <Typography color="text.secondary">{contract.institutionName}</Typography>
              </Box>
              <Chip
                label={contract.status === "ASSINADO" ? "Assinado" : contract.status === "CANCELADO" ? "Cancelado" : "Pendente de assinatura"}
                color={contract.status === "ASSINADO" ? "success" : contract.status === "CANCELADO" ? "error" : "warning"}
              />
            </Box>

            <Typography
              component="pre"
              sx={{
                whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, lineHeight: 1.7,
                bgcolor: "action.hover", borderRadius: 2, p: 2, mb: 3, maxHeight: 420, overflow: "auto",
              }}
            >
              {contract.termsText}
            </Typography>

            {contract.status === "ASSINADO" || signed ? (
              <Alert severity="success">
                Contrato assinado eletronicamente por <strong>{contract.signedByName || name}</strong>
                {contract.signedAt ? ` em ${new Date(contract.signedAt).toLocaleString("pt-BR")}` : ""}.
              </Alert>
            ) : contract.status === "CANCELADO" ? (
              <Alert severity="error">Este contrato foi cancelado pela instituição e não pode mais ser assinado.</Alert>
            ) : (
              <Box sx={{ display: "grid", gap: 2 }}>
                <TextField
                  label="Nome completo (para confirmar a assinatura)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                />
                <Button variant="contained" size="large" disabled={signing} onClick={() => void sign()}>
                  {signing ? "Assinando…" : "Confirmar e assinar o contrato"}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Ao clicar em "Confirmar e assinar", você concorda eletronicamente com os termos acima. Serão registrados o nome informado, o horário e o endereço IP como evidência da assinatura.
                </Typography>
              </Box>
            )}
          </Paper>
        )}
      </Box>
    </Box>
  );
}
