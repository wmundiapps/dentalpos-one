import { useState } from "react";
import type { FormEvent } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export default function Login() {
  const [clinicId, setClinicId] = useState(localStorage.getItem("dentalpos.clinicId") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha no login");

      const token = data.token || data.accessToken;
      if (!token) throw new Error("Token não retornado");

      localStorage.setItem("dentalpos.token", token);
      localStorage.setItem("dentalpos.clinicId", clinicId);
      window.location.href = "/";
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

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Clínica / ID"
          value={clinicId}
          onChange={(event) => setClinicId(event.target.value)}
          sx={{ mb: 2 }}
          required
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
        <Button
          fullWidth
          sx={{ mt: 1 }}
          onClick={() => alert("Recuperação de senha será enviada pelo backend configurado.")}
        >
          Esqueci minha senha
        </Button>
      </Paper>
    </Box>
  );
}
