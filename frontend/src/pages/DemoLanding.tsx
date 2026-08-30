import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import LoginIcon from "@mui/icons-material/Login";
import {
  appRootUrl,
  publicBookingUrl,
} from "../services/DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

interface DemoConfig {
  enabled: boolean;
  durationDays: number;
  graceDays: number;
  modules: string[];
  termsVersion: string;
  temporary: boolean;
  message: string;
}

interface DemoRegistrationResult {
  clinicId: string;
  email: string;
  demo: {
    endAt: string | null;
    graceUntil: string | null;
  };
  message: string;
}

function randomPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `A7!${raw}`.slice(0, Math.max(12, length));
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function DemoLanding() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DemoRegistrationResult | null>(null);
  const [form, setForm] = useState({
    clinicName: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    cro: "",
    specialty: "",
    password: "",
    acceptTerms: false,
  });

  useEffect(() => {
    fetch(`${API}/demo/config`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Não foi possível consultar a demonstração.");
        setConfig(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir o cadastro."))
      .finally(() => setLoading(false));
  }, []);

  const loginUrl = useMemo(() => appRootUrl(), []);
  const bookingUrl = result ? publicBookingUrl(result.clinicId) : "";

  async function register() {
    setError("");

    if (!form.password || form.password.length < 10) {
      setError("Use uma senha com pelo menos 10 caracteres.");
      return;
    }

    if (!form.acceptTerms) {
      setError("É necessário aceitar os termos da demonstração.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API}/demo/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Não foi possível criar a demonstração.");
      setResult(body);
      localStorage.setItem("dentalpos.clinicId", body.clinicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a demonstração.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      window.prompt("Copie o conteúdo:", value);
    }
  }

  function credentialsText() {
    if (!result) return "";
    return [
      "DENTALPOS ONE — ACESSO DEMO",
      "",
      `Clínica: ${form.clinicName}`,
      `ID da clínica: ${result.clinicId}`,
      `E-mail: ${result.email}`,
      `Senha: ${form.password}`,
      `Login: ${loginUrl}`,
      `Agendamento online: ${bookingUrl}`,
      `Demo gratuita até: ${formatDate(result.demo.endAt)}`,
      "",
      "A demonstração é gratuita e temporária. Após o prazo informado, a continuidade do uso dependerá de contratação.",
    ].join("\r\n");
  }

  function downloadCredentials() {
    const blob = new Blob([credentialsText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `DentalPos-One-Demo-${result?.clinicId || "acesso"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#f4f7fb",
        backgroundImage:
          "radial-gradient(circle at 10% 0%, rgba(21,101,192,.16), transparent 30%), radial-gradient(circle at 100% 100%, rgba(33,199,168,.12), transparent 28%)",
        py: { xs: 3, md: 6 },
        px: 2,
      }}
    >
      <Paper
        elevation={10}
        sx={{
          width: "min(900px,100%)",
          mx: "auto",
          p: { xs: 3, md: 5 },
          borderRadius: 5,
        }}
      >
        <Typography variant="overline" color="primary" sx={{ fontWeight: 900 }}>
          DENTALPOS ONE • EARLY ACCESS
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 950, lineHeight: 1.05, mb: 1 }}>
          Experimente gratuitamente
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
          Agenda inteligente e cadastro de pacientes em um ambiente exclusivo para sua clínica.
        </Typography>

        <Alert severity="info" sx={{ mt: 3 }}>
          <strong>Demo gratuita por {config?.durationDays || 30} dias.</strong>{" "}
          O acesso é temporário. Ao final do período, será necessária a contratação de um plano para
          continuar utilizando o sistema. O vencimento da demo não apaga automaticamente os dados cadastrados.
        </Alert>

        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}

        {!config?.enabled ? (
          <Alert severity="warning" sx={{ mt: 3 }}>
            Novos cadastros de demonstração ainda não estão liberados neste ambiente.
          </Alert>
        ) : result ? (
          <Box sx={{ mt: 4 }}>
            <Alert severity="success" sx={{ mb: 3 }}>
              Demo criada. Guarde estas credenciais e envie-as somente às pessoas autorizadas da clínica.
            </Alert>

            <Box sx={{ display: "grid", gap: 1.5 }}>
              {[
                ["ID da clínica", result.clinicId],
                ["E-mail", result.email],
                ["Senha", form.password],
                ["Link de acesso", loginUrl],
                ["Link de agendamento online", bookingUrl],
                ["Demo gratuita até", formatDate(result.demo.endAt)],
              ].map(([label, value]) => (
                <Paper key={label} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: .25 }}>
                    <Typography sx={{ fontWeight: 800, wordBreak: "break-all", flex: 1 }}>
                      {value}
                    </Typography>
                    {label !== "Demo gratuita até" ? (
                      <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => void copy(value)}>
                        Copiar
                      </Button>
                    ) : null}
                  </Box>
                </Paper>
              ))}
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 3 }}>
              <Button variant="contained" startIcon={<LoginIcon />} onClick={() => { window.location.href = loginUrl; }}>
                Entrar agora
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={downloadCredentials}>
                Baixar credenciais
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setResult(null);
                  setForm({
                    clinicName: "",
                    firstName: "",
                    lastName: "",
                    phone: "",
                    email: "",
                    cro: "",
                    specialty: "",
                    password: "",
                    acceptTerms: false,
                  });
                }}
              >
                Cadastrar outra clínica
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            <Divider sx={{ my: 4 }} />

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField
                label="Nome da clínica"
                value={form.clinicName}
                onChange={(event) => setForm({ ...form, clinicName: event.target.value })}
                required
                sx={{ gridColumn: { md: "1/-1" } }}
              />
              <TextField
                label="Nome"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
              />
              <TextField
                label="Sobrenome"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
              />
              <TextField
                label="WhatsApp"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
              <TextField
                label="E-mail"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
              <TextField
                label="CRO (opcional)"
                value={form.cro}
                onChange={(event) => setForm({ ...form, cro: event.target.value })}
              />
              <TextField
                label="Especialidade (opcional)"
                value={form.specialty}
                onChange={(event) => setForm({ ...form, specialty: event.target.value })}
              />
              <TextField
                label="Senha"
                type="text"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                helperText="Mínimo de 10 caracteres. O DentalPos não exibe esta senha novamente."
                required
                sx={{ gridColumn: { md: "1/-1" } }}
              />

              <Box sx={{ gridColumn: { md: "1/-1" }, display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  onClick={() => setForm({ ...form, password: randomPassword(14) })}
                >
                  Gerar senha forte
                </Button>
                {form.password ? (
                  <Button startIcon={<ContentCopyIcon />} onClick={() => void copy(form.password)}>
                    Copiar senha
                  </Button>
                ) : null}
              </Box>
            </Box>

            <Paper variant="outlined" sx={{ mt: 3, p: 2.5, borderRadius: 3, bgcolor: "background.default" }}>
              <Typography sx={{ fontWeight: 900, mb: 1 }}>Condições da demonstração</Typography>
              <Typography variant="body2" color="text.secondary">
                O acesso é gratuito, temporário e faz parte do programa Early Access. A demonstração
                terá duração de {config?.durationDays || 30} dias a partir do cadastro. Novos módulos
                poderão ser liberados durante o programa. Após o término, o sistema poderá permanecer
                por até {config?.graceDays || 7} dias em modo somente leitura e, depois, o uso operacional
                ficará bloqueado até contratação. O término da demo não apaga automaticamente pacientes,
                agenda ou histórico. O usuário deve utilizar dados reais apenas quando tiver base legal
                e autorização para tratá-los.
              </Typography>
              <FormControlLabel
                sx={{ mt: 1.5, alignItems: "flex-start" }}
                control={
                  <Checkbox
                    checked={form.acceptTerms}
                    onChange={(event) => setForm({ ...form, acceptTerms: event.target.checked })}
                  />
                }
                label={`Li e aceito as condições da Demo DentalPos One — versão ${config?.termsVersion || "vigente"}.`}
              />
            </Paper>

            <Button
              fullWidth
              size="large"
              variant="contained"
              sx={{ mt: 3, py: 1.4 }}
              disabled={busy || !form.acceptTerms}
              onClick={() => void register()}
            >
              {busy ? "Criando ambiente..." : `Criar minha demo gratuita de ${config?.durationDays || 30} dias`}
            </Button>

            <Button fullWidth sx={{ mt: 1 }} onClick={() => { window.location.href = loginUrl; }}>
              Já tenho acesso
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
