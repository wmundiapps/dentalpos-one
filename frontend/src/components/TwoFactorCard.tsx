import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import ShieldIcon from "@mui/icons-material/Shield";
import QRCode from "qrcode";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  const response = await fetch(`${API}${path}`, {
    method: init?.method || "GET",
    headers: { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Erro ${response.status}`);
  return data as T;
}

// Verificação em 2 etapas com aplicativo autenticador. Qualquer usuário pode ativar para a própria conta.
export default function TwoFactorCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ key: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setEnabled((await call<{ enabled: boolean }>("/auth/2fa/status")).enabled); } catch { setEnabled(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (window.location.hash === "#duas-etapas") document.getElementById("duas-etapas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [enabled]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  };

  const start = () => run(async () => {
    const r = await call<{ key: string; uri: string }>("/auth/2fa/setup", { method: "POST", body: {} });
    setSetup({ key: r.key, qr: await QRCode.toDataURL(r.uri, { width: 220, margin: 1 }) });
    setCode("");
  });
  const enable = () => run(async () => {
    const r = await call<{ backupCodes: string[] }>("/auth/2fa/enable", { method: "POST", body: { code } });
    setCodes(r.backupCodes); setSetup(null); setCode(""); await load();
  });
  const disable = () => run(async () => {
    await call("/auth/2fa/disable", { method: "POST", body: { password, code } });
    setDisabling(false); setPassword(""); setCode(""); setCodes([]); await load();
  });
  const newCodes = () => run(async () => {
    const r = await call<{ backupCodes: string[] }>("/auth/2fa/backup-codes", { method: "POST", body: { code } });
    setCodes(r.backupCodes); setCode("");
  });

  if (enabled === null) return null;
  return (
    <Paper id="duas-etapas" variant="outlined" sx={{ p: 3, borderRadius: 4, mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1 }}>
        <ShieldIcon color={enabled ? "success" : "warning"} />
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Verificação em 2 etapas</Typography>
        <Chip size="small" color={enabled ? "success" : "warning"} label={enabled ? "Ativa" : "Desativada"} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Além da senha, o login pede um código de 6 números que muda a cada 30 segundos, gerado no seu celular (Google Authenticator, Microsoft Authenticator ou Authy). Mesmo que alguém descubra a sua senha, não consegue entrar.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {codes.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Guarde estes códigos reserva em lugar seguro. Eles aparecem só agora.</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>Cada um vale uma vez e serve se você perder o celular.</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 0.5, fontFamily: "monospace", fontSize: 16 }}>
            {codes.map((c) => <span key={c}>{c}</span>)}
          </Box>
        </Alert>
      )}

      {!enabled && !setup && <Button variant="contained" disabled={busy} onClick={() => void start()}>Ativar verificação em 2 etapas</Button>}
      {!enabled && setup && (
        <Box sx={{ display: "grid", gap: 1.5, maxWidth: 420 }}>
          <Typography variant="body2">1. No aplicativo autenticador, adicione uma conta e leia este QR Code.</Typography>
          <Box component="img" src={setup.qr} alt="QR Code para o aplicativo autenticador" sx={{ width: 220, height: 220 }} />
          <Typography variant="caption" color="text.secondary">Sem câmera? Digite a chave: <b>{setup.key}</b></Typography>
          <Typography variant="body2">2. Digite o código de 6 números que o aplicativo mostra agora.</Typography>
          <TextField size="small" label="Código" value={code} onChange={(e) => setCode(e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6, autoComplete: "one-time-code" } }} />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" disabled={busy || code.trim().length !== 6} onClick={() => void enable()}>Confirmar e ativar</Button>
            <Button disabled={busy} onClick={() => { setSetup(null); setCode(""); }}>Cancelar</Button>
          </Box>
        </Box>
      )}

      {enabled && !disabling && (
        <Box sx={{ display: "grid", gap: 1.5, maxWidth: 420 }}>
          <TextField size="small" label="Código do aplicativo (para gerar novos códigos reserva)" value={code} onChange={(e) => setCode(e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 6 } }} />
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" disabled={busy || code.trim().length !== 6} onClick={() => void newCodes()}>Gerar novos códigos reserva</Button>
            <Button color="error" onClick={() => { setDisabling(true); setCode(""); }}>Desativar</Button>
          </Box>
        </Box>
      )}
      {enabled && disabling && (
        <Box sx={{ display: "grid", gap: 1.5, maxWidth: 420 }}>
          <Typography variant="body2">Para desativar, confirme a sua senha e um código.</Typography>
          <TextField size="small" type="password" label="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <TextField size="small" label="Código do aplicativo ou código reserva" value={code} onChange={(e) => setCode(e.target.value)} />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button color="error" variant="contained" disabled={busy || !password || code.trim().length < 6} onClick={() => void disable()}>Desativar agora</Button>
            <Button disabled={busy} onClick={() => { setDisabling(false); setPassword(""); setCode(""); }}>Voltar</Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
