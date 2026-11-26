import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import PageHeader from "../PageHeader";
import { HrVaultApi, type VaultStatus } from "../../services/HrVaultApi";

// Acesso exclusivo do RH: a clínica inteira usa o mesmo login do sistema, então esta área pede um login e uma senha próprios.
export default function HrVaultGate({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<VaultStatus | null>(null);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [f, setF] = useState({ login: "", password: "", confirm: "", recoveryEmail: "", code: "" });
  const [codeSent, setCodeSent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const refresh = useCallback(() => HrVaultApi.status().then((s) => { setSt(s); if (s.login) setF((v) => ({ ...v, login: v.login || s.login || "" })); }).catch((e) => setError(e instanceof Error ? e.message : "Erro ao verificar o acesso do RH.")), []);
  useEffect(() => { void refresh(); const h = () => void refresh(); window.addEventListener("completodonto:rh-locked", h); return () => window.removeEventListener("completodonto:rh-locked", h); }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); setF((v) => ({ ...v, password: "", confirm: "", code: "" })); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir."); } finally { setBusy(false); }
  };

  if (!st) return <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>{error ? <Alert severity="error">{error}</Alert> : <CircularProgress />}</Box>;
  if (st.unlocked) return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button size="small" startIcon={<LockIcon />} onClick={() => { HrVaultApi.lock(); void refresh(); }}>Bloquear o RH</Button>
      </Box>
      {children}
    </Box>
  );

  return (
    <Box>
      <PageHeader title="RH e Gestão de Pessoas" description="Área exclusiva do RH: salários e dados dos colaboradores só abrem com o login e a senha do RH." />
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, maxWidth: 480, mx: "auto", display: "grid", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><LockIcon color="primary" /><Typography variant="h6" sx={{ fontWeight: 900 }}>{!st.configured ? "Criar o acesso do RH" : mode === "reset" ? "Redefinir a senha do RH" : "Entrar no RH"}</Typography></Box>
        {error && <Alert severity="error">{error}</Alert>}
        {st.lockedUntil && <Alert severity="warning">Acesso bloqueado por tentativas incorretas. Tente de novo em alguns minutos.</Alert>}

        {!st.configured ? (<>
          <Typography variant="body2" color="text.secondary">Este é o primeiro acesso. Quem for o responsável pelo RH cria agora o login e a senha. <b>Só quem tiver esses dados verá salários e informações dos colaboradores.</b> Guarde-os com segurança.</Typography>
          <TextField label="Login do RH" value={f.login} onChange={set("login")} autoFocus />
          <TextField label="E-mail de recuperação (do responsável pelo RH)" value={f.recoveryEmail} onChange={set("recoveryEmail")} helperText="Se esquecer a senha, um código é enviado para este e-mail." />
          <TextField label="Senha (mínimo 8 caracteres)" type="password" value={f.password} onChange={set("password")} />
          <TextField label="Repita a senha" type="password" value={f.confirm} onChange={set("confirm")} />
          <Button variant="contained" disabled={busy || f.login.trim().length < 3 || f.password.length < 8} onClick={() => void run(() => HrVaultApi.setup({ login: f.login, password: f.password, confirm: f.confirm, recoveryEmail: f.recoveryEmail }))}>Criar acesso e entrar</Button>
        </>) : mode === "login" ? (<>
          <Typography variant="body2" color="text.secondary">Informe o login e a senha do RH. O acesso fecha sozinho depois de 30 minutos.</Typography>
          <TextField label="Login do RH" value={f.login} onChange={set("login")} autoFocus />
          <TextField label="Senha" type="password" value={f.password} onChange={set("password")} onKeyDown={(e) => { if (e.key === "Enter" && f.password) void run(() => HrVaultApi.unlock({ login: f.login, password: f.password })); }} />
          <Button variant="contained" disabled={busy || !f.login.trim() || !f.password} onClick={() => void run(() => HrVaultApi.unlock({ login: f.login, password: f.password }))}>Entrar</Button>
          <Button size="small" onClick={() => { setMode("reset"); setCodeSent(""); setError(""); }}>Esqueci a senha</Button>
        </>) : (<>
          {!codeSent ? (<>
            <Typography variant="body2" color="text.secondary">Vamos enviar um código de 6 números para o e-mail de recuperação cadastrado ({st.recoveryEmail}).</Typography>
            <Button variant="contained" disabled={busy} onClick={() => void run(async () => { const r = await HrVaultApi.requestReset(); setCodeSent(r.sentTo); })}>Enviar código</Button>
          </>) : (<>
            <Alert severity="success">Código enviado para {codeSent}. Vale por 15 minutos.</Alert>
            <TextField label="Código recebido" value={f.code} onChange={set("code")} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
            <TextField label="Login do RH (pode manter)" value={f.login} onChange={set("login")} />
            <TextField label="Nova senha (mínimo 8 caracteres)" type="password" value={f.password} onChange={set("password")} />
            <TextField label="Repita a nova senha" type="password" value={f.confirm} onChange={set("confirm")} />
            <Button variant="contained" disabled={busy || f.code.length < 6 || f.password.length < 8} onClick={() => void run(() => HrVaultApi.confirmReset({ code: f.code, password: f.password, confirm: f.confirm, login: f.login }))}>Redefinir e entrar</Button>
          </>)}
          <Button size="small" onClick={() => { setMode("login"); setError(""); }}>Voltar</Button>
        </>)}
      </Paper>
    </Box>
  );
}
