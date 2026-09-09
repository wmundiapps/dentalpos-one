import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { appRootUrl } from "../services/DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export default function PasswordReset() {
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    [],
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async () => {
    if (!token) {
      setError("Link de redefinição inválido.");
      return;
    }
    if (password.length < 10) {
      setError("A nova senha deve possuir pelo menos 10 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas informadas não são iguais.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Falha ao redefinir senha.");
      setSuccess(data.message || "Senha redefinida com sucesso.");
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao redefinir senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Paper variant="outlined" sx={{ p: 4, borderRadius: 4, width: "min(460px,100%)" }}>
        <Typography variant="overline" color="primary" sx={{ fontWeight: 900 }}>
          DENTALPOS ONE
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 950, mb: 1 }}>
          Nova senha
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Defina uma senha com pelo menos 10 caracteres.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {!success && (
          <>
            <TextField
              fullWidth
              type="password"
              label="Nova senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="password"
              label="Confirmar nova senha"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              disabled={busy || !token}
              onClick={() => void submit()}
            >
              {busy ? "Salvando..." : "Redefinir senha"}
            </Button>
          </>
        )}

        <Button
          fullWidth
          variant={success ? "contained" : "text"}
          sx={{ mt: 1.5 }}
          onClick={() => {
            window.location.href = appRootUrl();
          }}
        >
          Voltar ao login
        </Button>
      </Paper>
    </Box>
  );
}
