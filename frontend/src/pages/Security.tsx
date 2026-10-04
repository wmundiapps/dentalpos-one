import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import {
  twoFactorDisable,
  twoFactorEnable,
  twoFactorSetup,
  twoFactorStatus,
} from "../services/SecurityApi";

/** Segurança da conta: verificação em 2 etapas (app autenticador) com códigos de recuperação. */
export default function Security() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [left, setLeft] = useState(0);
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const s = await twoFactorStatus();
      setEnabled(s.enabled);
      setLeft(s.backupCodesLeft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Falha na operação."); } finally { setBusy(false); }
  }

  const start = () => run(async () => {
    const s = await twoFactorSetup();
    setSecret(s.secret);
    setQr(await QRCode.toDataURL(s.otpauthUri, { margin: 1, width: 220 }));
  });

  const confirm = () => run(async () => {
    const r = await twoFactorEnable(code.trim());
    setCodes(r.backupCodes);
    setSecret(""); setQr(""); setCode("");
    setMsg("Verificação em 2 etapas ativada. Guarde os códigos de recuperação abaixo.");
    await refresh();
  });

  const disable = () => run(async () => {
    await twoFactorDisable(password, code.trim());
    setPassword(""); setCode(""); setCodes([]);
    setMsg("Verificação em 2 etapas desativada.");
    await refresh();
  });

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Segurança da conta</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Proteja seu acesso com um segundo passo: além da senha, o login pede um código de 6 dígitos gerado no seu celular.
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {msg && <Alert severity="success" sx={{ mb: 2 }}>{msg}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Verificação em 2 etapas</Typography>
          {enabled !== null && <Chip size="small" color={enabled ? "success" : "warning"} label={enabled ? "Ativa" : "Desativada"} />}
          {enabled && <Typography variant="caption" color="text.secondary">{left} código(s) de recuperação restante(s)</Typography>}
        </Box>

        {enabled === false && !qr && (
          <Button variant="contained" onClick={() => void start()} disabled={busy}>Ativar agora</Button>
        )}

        {qr && (
          <Box>
            <Typography sx={{ mb: 1 }}>1. Abra o Google Authenticator, Microsoft Authenticator ou Authy e escaneie:</Typography>
            <img src={qr} alt="QR Code para o aplicativo autenticador" width={220} height={220} />
            <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
              Sem câmera? Digite esta chave manualmente: <b style={{ letterSpacing: 1 }}>{secret}</b>
            </Typography>
            <Typography sx={{ mb: 1 }}>2. Digite o código de 6 dígitos exibido no aplicativo:</Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField size="small" value={code} onChange={(e) => setCode(e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6, autoComplete: "one-time-code" } }} placeholder="000000" />
              <Button variant="contained" onClick={() => void confirm()} disabled={busy || code.trim().length !== 6}>Confirmar</Button>
            </Box>
          </Box>
        )}

        {codes.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <b>Códigos de recuperação (aparecem só agora).</b> Cada um vale para um único login, caso você perca o celular. Guarde em local seguro:
            <Box component="pre" sx={{ m: 1, fontSize: 15, lineHeight: 1.7 }}>{codes.join("\n")}</Box>
          </Alert>
        )}

        {enabled && (
          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Desativar (exige senha e um código)</Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <TextField size="small" type="password" label="Senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <TextField size="small" label="Código" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button color="error" variant="outlined" onClick={() => void disable()} disabled={busy || !password || !code.trim()}>Desativar</Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
