import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Paper, Stack, TextField, Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import RecoveryCodesPanel from "../components/security/RecoveryCodesPanel";
import TwoFactorSetupPanel from "../components/security/TwoFactorSetupPanel";
import { minutosDeInatividade } from "../security/sessionGuard";
import { readSessionUser } from "../services/DemoAccess";
import { securityApi, SecurityApiError } from "../services/SecurityApi";
import type { TwoFactorStatus } from "../services/SecurityApi";

const PAPEIS_ADMIN = new Set(["ADMIN", "OWNER", "ADMINISTRACAO", "GESTOR", "SUPER_ADMIN", "PLATFORM_ADMIN"]);

function dataBr(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

type Acao = null | "desativar" | "recuperacao";

export default function AccountSecurity() {
  const navigate = useNavigate();
  const user = readSessionUser();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [acao, setAcao] = useState<Acao>(null);
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [dlgError, setDlgError] = useState("");
  const [novosCodigos, setNovosCodigos] = useState<string[] | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await securityApi.status());
    } catch (e) {
      setStatus(null);
      setError(
        e instanceof SecurityApiError && e.status === 404
          ? "A verificação em duas etapas ainda não está disponível neste ambiente."
          : e instanceof Error ? e.message : "Não foi possível carregar o estado da segurança.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function fechar() {
    setAcao(null);
    setSenha("");
    setCodigo("");
    setDlgError("");
  }

  async function executar() {
    setBusy(true);
    setDlgError("");
    try {
      const limpo = codigo.replace(/\s/g, "");
      if (acao === "desativar") {
        await securityApi.disable(senha, limpo);
        setMsg("Verificação em duas etapas desativada.");
        fechar();
        await carregar();
      } else if (acao === "recuperacao") {
        const r = await securityApi.recoveryCodes(limpo);
        fechar();
        setNovosCodigos(r.recoveryCodes || []);
      }
    } catch (e) {
      setDlgError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  const ehAdmin = PAPEIS_ADMIN.has(String(user?.role || "").toUpperCase());
  const idle = minutosDeInatividade();

  return (
    <Box sx={{ maxWidth: 860 }}>
      <PageHeader title="Segurança da conta" description="Proteja o acesso com verificação em duas etapas (2FA) e códigos de recuperação." />

      {msg ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMsg("")}>{msg}</Alert> : null}
      {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Verificação em duas etapas</Typography>
          {loading ? <CircularProgress size={18} /> : status ? (
            <Chip size="small" color={status.enabled ? "success" : "default"} label={status.enabled ? "Ativada" : "Desativada"} />
          ) : null}
          {status?.required && !status.enabled ? <Chip size="small" color="warning" label="Exigida para o seu perfil" /> : null}
        </Box>

        {novosCodigos ? (
          <Stack spacing={2}>
            <Alert severity="info">Novos códigos gerados. Os códigos anteriores deixaram de valer.</Alert>
            <RecoveryCodesPanel codes={novosCodigos} onDone={() => { setNovosCodigos(null); void carregar(); }} />
          </Stack>
        ) : status?.enabled ? (
          <Stack spacing={2}>
            <Typography color="text.secondary">
              {status.enabledAt ? `Ativada em ${dataBr(status.enabledAt)}. ` : ""}
              {typeof status.recoveryCodesRemaining === "number" ? `Códigos de recuperação restantes: ${status.recoveryCodesRemaining}.` : ""}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => setAcao("recuperacao")}>Gerar novos códigos de recuperação</Button>
              <Button variant="outlined" color="error" onClick={() => setAcao("desativar")}>Desativar 2FA</Button>
            </Box>
          </Stack>
        ) : status ? (
          <TwoFactorSetupPanel onActivated={() => { setMsg("Verificação em duas etapas ativada."); void carregar(); }} />
        ) : null}
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Sessão neste navegador</Typography>
        <Typography color="text.secondary">
          {idle > 0
            ? `Por segurança, você sai automaticamente após ${idle >= 60 ? `${Math.round(idle / 60 * 10) / 10} h` : `${idle} min`} sem usar o sistema. `
            : "O encerramento automático por inatividade está desligado neste ambiente. "}
          Ao sair em uma aba, as demais abas também saem.
        </Typography>
      </Paper>

      {ehAdmin ? (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Eventos de segurança</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Entradas, falhas, bloqueios e mudanças de 2FA registrados pelo servidor.</Typography>
          <Button variant="outlined" onClick={() => navigate("/seguranca/eventos")}>Ver eventos de segurança</Button>
        </Paper>
      ) : null}

      <Dialog open={acao !== null} onClose={busy ? undefined : fechar} fullWidth maxWidth="xs">
        <DialogTitle>{acao === "desativar" ? "Desativar verificação em duas etapas" : "Gerar novos códigos de recuperação"}</DialogTitle>
        <DialogContent sx={{ pt: "12px!important" }}>
          {dlgError ? <Alert severity="error" sx={{ mb: 2 }}>{dlgError}</Alert> : null}
          {acao === "desativar" ? (
            <TextField fullWidth type="password" label="Senha atual" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" sx={{ mb: 2 }} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Os códigos atuais serão invalidados.</Typography>
          )}
          <TextField
            fullWidth
            label="Código de 6 dígitos do app"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            slotProps={{ htmlInput: { inputMode: "numeric", autoComplete: "one-time-code", maxLength: 6 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={fechar} disabled={busy}>Cancelar</Button>
          <Button
            variant="contained"
            color={acao === "desativar" ? "error" : "primary"}
            onClick={() => void executar()}
            disabled={busy || codigo.length !== 6 || (acao === "desativar" && !senha)}
          >
            {busy ? "Aguarde..." : "Confirmar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
