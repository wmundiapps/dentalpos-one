import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Link, Stack, TextField, Typography } from "@mui/material";
import QRCode from "qrcode";
import { securityApi } from "../../services/SecurityApi";
import type { TwoFactorSetup } from "../../services/SecurityApi";
import RecoveryCodesPanel from "./RecoveryCodesPanel";

interface Props {
  /** Token restrito do login (quando o papel exige 2FA e ainda não foi configurado). */
  token?: string;
  /** Chamado ao concluir; recebe a resposta de confirmação (pode trazer novo token). */
  onActivated: (resposta?: { token?: string; accessToken?: string; user?: unknown }) => void;
}

function emBlocos(secret: string) {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export default function TwoFactorSetupPanel({ token, onActivated }: Props) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [resposta, setResposta] = useState<{ token?: string; accessToken?: string; user?: unknown } | undefined>();

  async function iniciar() {
    setBusy(true);
    setError("");
    try {
      const s = await securityApi.setup(token);
      setSetup(s);
      try {
        setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 220, errorCorrectionLevel: "M" }));
      } catch {
        setQr("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar a ativação.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    setBusy(true);
    setError("");
    try {
      const r = await securityApi.confirm(code.replace(/\s/g, ""), token);
      setResposta(r);
      setCodes(r.recoveryCodes || []);
      setSetup(null);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <Stack spacing={2}>
        <Alert severity="success">Verificação em duas etapas ativada.</Alert>
        {codes.length ? (
          <RecoveryCodesPanel codes={codes} onDone={() => onActivated(resposta)} />
        ) : (
          <Button variant="contained" onClick={() => onActivated(resposta)}>Concluir</Button>
        )}
      </Stack>
    );
  }

  if (!setup) {
    return (
      <Stack spacing={2}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Typography color="text.secondary">
          Use um app autenticador (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). A cada entrada, além da senha, será pedido um código de 6 dígitos.
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => void iniciar()} disabled={busy} startIcon={busy ? <CircularProgress size={16} /> : undefined}>
            Ativar verificação em duas etapas
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Typography sx={{ fontWeight: 800 }}>1. Adicione a conta no seu app autenticador</Typography>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
        {qr ? <Box component="img" src={qr} alt="QR code para o app autenticador" sx={{ width: 220, height: 220, bgcolor: "#fff", p: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }} /> : null}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">Ou digite a chave manualmente:</Typography>
          <Typography
            aria-label="Chave secreta do autenticador"
            sx={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontWeight: 800, fontSize: 18, letterSpacing: 1, wordBreak: "break-word", my: 0.5 }}
          >
            {emBlocos(setup.secret)}
          </Typography>
          <Link href={setup.otpauthUri} variant="body2">Abrir no app autenticador deste aparelho</Link>
        </Box>
      </Box>
      <Typography sx={{ fontWeight: 800 }}>2. Digite o código de 6 dígitos gerado</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="Código de 6 dígitos"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "one-time-code", maxLength: 6 } }}
          onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) void confirmar(); }}
        />
        <Button variant="contained" onClick={() => void confirmar()} disabled={busy || code.length !== 6}>
          {busy ? "Confirmando..." : "Confirmar e ativar"}
        </Button>
      </Box>
    </Stack>
  );
}
