import { useState } from "react";
import type { FormEvent } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import {
  appRootUrl,
  clearClientSession,
  demoRegistrationUrl,
  demoSalesUrl,
  writeDemoAccess,
  writeSessionUser,
} from "../services/DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export default function Login() {
  const [clinicId, setClinicId] = useState(localStorage.getItem("dentalpos.clinicId") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setExpired(false);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(clinicId.trim() ? { clinicId: clinicId.trim() } : {}),
          email,
          password,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data?.code === "DEMO_ENDED") setExpired(true);
        throw new Error(data.error || "Falha no login");
      }

      const token = data.token || data.accessToken;
      if (!token) throw new Error("Token não retornado");

      clearClientSession();
      localStorage.setItem("dentalpos.token", token);
      localStorage.setItem("dentalpos.clinicId", data.user?.clinicId || clinicId.trim());
      writeSessionUser(data.user);
      writeDemoAccess(data.demo);
      window.location.href = appRootUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 2,
        background:
          "radial-gradient(circle at 15% 15%, rgba(21,101,192,.24), transparent 35%), linear-gradient(135deg,#07111f,#102a43 55%,#0b5fff)",
      }}
    >
      <Paper
        component="form"
        onSubmit={submit}
        elevation={18}
        sx={{
          width: "min(460px,100%)",
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          backdropFilter: "blur(18px)",
        }}
      >
        <Typography variant="overline" color="primary" sx={{ fontWeight: 900 }}>
          DENTALPOS ONE
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>
          Bem-vindo
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Acesso seguro e individualizado da sua clínica.
        </Typography>

        {error ? (
          <Alert severity={expired ? "warning" : "error"} sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        <TextField
          fullWidth
          label="ID da clínica (opcional)"
          value={clinicId}
          onChange={(event) => setClinicId(event.target.value)}
          helperText="Só é necessário quando o mesmo e-mail pertence a mais de uma clínica."
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          sx={{ mb: 2 }}
          required
        />
        <TextField
          fullWidth
          label="Senha"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          sx={{ mb: 2 }}
          required
        />
        <Button fullWidth size="large" variant="contained" type="submit" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </Button>

        {expired ? (
          <Button
            fullWidth
            variant="outlined"
            sx={{ mt: 1.5 }}
            onClick={() => {
              window.location.href = demoSalesUrl();
            }}
          >
            Solicitar proposta
          </Button>
        ) : null}

        <Box sx={{ mt: 3, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Ainda não usa o DentalPos One? A demonstração gratuita é temporária e informa claramente
            a data de encerramento.
          </Typography>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              window.location.href = demoRegistrationUrl();
            }}
          >
            Quero testar gratuitamente
          </Button>
        </Box>

        <Button
          fullWidth
          sx={{ mt: 1 }}
          onClick={() => alert("A recuperação de senha será disponibilizada no ambiente público.")}
        >
          Esqueci minha senha
        </Button>
      </Paper>
    </Box>
  );
}
