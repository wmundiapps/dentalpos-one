import EduCapa from "../edu/apresentacao/EduCapa";
import { EDU_ONLY, MARCA_TOPO } from "../config/appMode";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import TwoFactorSetupPanel from "../components/security/TwoFactorSetupPanel";
import FaceCamera, { type CapturaFacial } from "../edu/presenca/FaceCamera";
import { CHAVE_MOTIVO } from "../security/sessionGuard";
import { securityApi, SecurityApiError } from "../services/SecurityApi";
import { deviceFingerprint } from "../security/deviceFingerprint";
import {
  appRootUrl,
  clearClientSession,
  demoRegistrationUrl,
  demoSalesUrl,
  writeDemoAccess,
  writeSessionUser,
} from "../services/DemoAccess";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

type Etapa = "credenciais" | "codigo" | "configurar2fa" | "aguardandoDispositivo" | "trocarSenha";
type ModoLogin = "EMAIL" | "RA" | "LOGINALT";

export default function Login() {
  const [etapa, setEtapa] = useState<Etapa>("credenciais");
  const [modo, setModo] = useState<ModoLogin>("EMAIL");
  const [identificador, setIdentificador] = useState("");
  const [novaSenha1, setNovaSenha1] = useState("");
  const [novaSenha2, setNovaSenha2] = useState("");
  const [senhaErro, setSenhaErro] = useState("");
  const [senhaBusy, setSenhaBusy] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [deviceChallengeToken, setDeviceChallengeToken] = useState("");
  const [deviceRecusado, setDeviceRecusado] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [codigo, setCodigo] = useState("");
  const [usarRecuperacao, setUsarRecuperacao] = useState(false);
  const [aviso, setAviso] = useState("");
  const [bloqueioAte, setBloqueioAte] = useState(0);
  const [agora, setAgora] = useState(Date.now());

  const [clinicId, setClinicId] = useState(localStorage.getItem("dentalpos.clinicId") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);
  const [faceErro, setFaceErro] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetClinicId, setResetClinicId] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    try {
      const motivo = sessionStorage.getItem(CHAVE_MOTIVO);
      if (motivo) {
        sessionStorage.removeItem(CHAVE_MOTIVO);
        setAviso(
          motivo === "idle"
            ? "Sua sessão foi encerrada por inatividade. Entre novamente."
            : "Você saiu da conta em outra aba.",
        );
      }
    } catch {
      // Armazenamento indisponível.
    }
  }, []);

  useEffect(() => {
    if (bloqueioAte <= Date.now()) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [bloqueioAte]);

  const segundosBloqueio = Math.max(0, Math.ceil((bloqueioAte - agora) / 1000));

  // Dispositivo novo pendente de aprovação: consulta a cada 5s se o administrador já liberou (ou recusou) o acesso.
  useEffect(() => {
    if (etapa !== "aguardandoDispositivo" || !deviceChallengeToken) return;
    let ativo = true;
    const consultar = async () => {
      try {
        const r = await fetch(`${API}/auth/device/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceChallengeToken }),
        });
        const data = await r.json().catch(() => ({}));
        if (!ativo) return;
        if (r.status === 403 && data?.status === "recusado") {
          setDeviceRecusado(true);
          return;
        }
        if (!r.ok) {
          if (r.status === 401) { setEtapa("credenciais"); setError("A solicitação de acesso expirou. Faça o login novamente."); }
          return;
        }
        if (data?.status === "aprovado") { concluirLogin(data); return; }
      } catch {
        // Falha temporária de rede: tenta de novo no próximo ciclo.
      }
      if (ativo) timer = window.setTimeout(consultar, 5000);
    };
    let timer = window.setTimeout(consultar, 2000);
    return () => { ativo = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, deviceChallengeToken]);

  // Link de acesso direto à demonstração (?acesso=...): entra sem digitar usuário e senha.
  useEffect(() => {
    const chave = new URLSearchParams(window.location.search).get("acesso");
    if (!chave) return;
    window.history.replaceState({}, "", window.location.pathname);
    setBusy(true);
    fetch(`${API}/demo-acesso`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: chave }) })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Link de acesso inválido.");
        concluirLogin(data);
      })
      .catch((err) => { setError(err instanceof Error ? err.message : "Link de acesso inválido."); setBusy(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function concluirLogin(data: any) {
    const token = data.token || data.accessToken;
    if (!token) throw new Error("Token não retornado");

    clearClientSession();
    localStorage.setItem("dentalpos.token", token);
    localStorage.setItem("dentalpos.clinicId", data.user?.clinicId || clinicId.trim());
    writeSessionUser(data.user);
    writeDemoAccess(data.demo);
    if (data.user?.mustChangePassword) {
      setEtapa("trocarSenha");
      return;
    }
    window.location.href = appRootUrl();
  }

  // Troca obrigatória no 1º acesso (ou após reset pelo administrador): o backend dispensa a senha atual
  // quando mustChangePassword está marcado, já que o usuário acabou de provar que a sabe neste mesmo login.
  async function trocarSenhaObrigatoria(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSenhaErro("");
    if (novaSenha1 !== novaSenha2) { setSenhaErro("As senhas não coincidem."); return; }
    setSenhaBusy(true);
    try {
      const token = localStorage.getItem("dentalpos.token") || "";
      const response = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ novaSenha: novaSenha1 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível trocar a senha.");
      if (data.token) localStorage.setItem("dentalpos.token", data.token);
      window.location.href = appRootUrl();
    } catch (err) {
      setSenhaErro(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setSenhaBusy(false);
    }
  }

  async function verificarCodigo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (segundosBloqueio > 0) return;
    setBusy(true);
    setError("");
    try {
      const limpo = codigo.replace(/\s/g, "");
      const data = await securityApi.verifyLogin(
        challengeToken,
        usarRecuperacao ? { recoveryCode: limpo } : { code: limpo, fingerprint: deviceFingerprint() },
      );
      if (data?.deviceApprovalRequired && data.deviceChallengeToken) {
        setDeviceChallengeToken(data.deviceChallengeToken);
        setDeviceRecusado(false);
        setEtapa("aguardandoDispositivo");
        return;
      }
      concluirLogin(data);
    } catch (err) {
      if (err instanceof SecurityApiError) {
        if (err.bloqueado) {
          const segundos = err.retryAfter && err.retryAfter > 0 ? err.retryAfter : 60;
          setBloqueioAte(Date.now() + segundos * 1000);
          setAgora(Date.now());
          setError("Muitas tentativas incorretas. Por segurança, aguarde antes de tentar novamente.");
        } else if (/CHALLENGE|EXPIRED|EXPIRAD/i.test(err.code || "") || (err.status === 401 && /expirad/i.test(err.message))) {
          setEtapa("credenciais");
          setCodigo("");
          setError("A verificação expirou. Informe e-mail e senha novamente.");
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Falha na verificação");
      }
      setCodigo("");
    } finally {
      setBusy(false);
    }
  }

  // Entrada por reconhecimento facial (alternativa à senha): exige e-mail, cadastro prévio do rosto e prova de vivacidade.
  async function entrarComRosto(c: CapturaFacial) {
    setFaceErro("");
    const r = await fetch(`${API}/auth/face/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...(clinicId.trim() ? { clinicId: clinicId.trim() } : {}), embedding: c.embeddings[0], liveness: c.liveness }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setFaceErro(data.error || "Não foi possível confirmar o rosto."); return; }
    setFaceOpen(false);
    if (data.requires2fa) { setChallengeToken(data.challengeToken); setEtapa("codigo"); return; }
    if (data.requires2faSetup) { setSetupToken(data.setupToken); setEtapa("configurar2fa"); return; }
    concluirLogin(data);
  }

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
          ...(modo === "EMAIL" ? { email } : modo === "RA" ? { ra: identificador.trim() } : { loginAlt: identificador.trim() }),
          password,
          fingerprint: deviceFingerprint(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data?.code === "DEMO_ENDED") setExpired(true);
        throw new Error(data.error || "Falha no login");
      }

      if (data?.requires2fa && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setCodigo("");
        setUsarRecuperacao(false);
        setEtapa("codigo");
        return;
      }
      if (data?.requires2faSetup) {
        setSetupToken(data.token || data.accessToken || data.setupToken || "");
        setEtapa("configurar2fa");
        return;
      }
      if (data?.deviceApprovalRequired && data.deviceChallengeToken) {
        setDeviceChallengeToken(data.deviceChallengeToken);
        setDeviceRecusado(false);
        setEtapa("aguardandoDispositivo");
        return;
      }
      concluirLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    setResetBusy(true);
    setResetMessage("");
    setResetError("");
    try {
      const response = await fetch(`${API}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim(),
          ...(resetClinicId.trim() ? { clinicId: resetClinicId.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Falha ao solicitar redefinição.");
      setResetMessage(
        data.message ||
          "Se o e-mail estiver vinculado a uma conta elegível, enviaremos as instruções.",
      );
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Falha ao solicitar redefinição.");
    } finally {
      setResetBusy(false);
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
        ...(EDU_ONLY ? { gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 460px" }, columnGap: 6, justifyContent: "center", maxWidth: 1180, mx: "auto", width: "100%" } : {}),
      }}
    >
      {EDU_ONLY ? <EduCapa /> : null}
      <Paper
        component="form"
        onSubmit={etapa === "codigo" ? verificarCodigo : etapa === "credenciais" ? submit : etapa === "trocarSenha" ? trocarSenhaObrigatoria : (e: FormEvent) => e.preventDefault()}
        elevation={18}
        sx={{
          width: "min(460px,100%)",
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          backdropFilter: "blur(18px)",
        }}
      >
        <Typography variant="overline" color="primary" sx={{ fontWeight: 900 }}>
          {MARCA_TOPO}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 950 }}>
          Bem-vindo
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {EDU_ONLY ? "Acesso seguro e individualizado da sua instituição." : "Acesso seguro e individualizado da sua clínica."}
        </Typography>

        {aviso && etapa === "credenciais" ? <Alert severity="info" sx={{ mb: 2 }}>{aviso}</Alert> : null}
        {error ? (
          <Alert severity={expired ? "warning" : "error"} sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {etapa === "codigo" ? (
          <>
            <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Verificação em duas etapas</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {usarRecuperacao
                ? "Digite um dos códigos de recuperação que você guardou. Cada código vale uma única vez."
                : "Digite o código de 6 dígitos do seu app autenticador."}
            </Typography>
            <TextField
              fullWidth
              autoFocus
              label={usarRecuperacao ? "Código de recuperação" : "Código de 6 dígitos"}
              value={codigo}
              onChange={(event) =>
                setCodigo(usarRecuperacao ? event.target.value : event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              slotProps={{
                htmlInput: usarRecuperacao
                  ? { autoComplete: "off", autoCapitalize: "none", spellCheck: false }
                  : { inputMode: "numeric", autoComplete: "one-time-code", maxLength: 6, pattern: "[0-9]{6}" },
              }}
              disabled={segundosBloqueio > 0}
              sx={{ mb: 2 }}
              required
            />
            <Button
              fullWidth
              size="large"
              variant="contained"
              type="submit"
              disabled={busy || segundosBloqueio > 0 || (usarRecuperacao ? codigo.trim().length < 6 : codigo.length !== 6)}
            >
              {segundosBloqueio > 0
                ? `Aguarde ${segundosBloqueio}s`
                : busy
                  ? "Verificando..."
                  : "Verificar e entrar"}
            </Button>
            <Button
              fullWidth
              sx={{ mt: 1 }}
              onClick={() => {
                setUsarRecuperacao((v) => !v);
                setCodigo("");
                setError("");
              }}
            >
              {usarRecuperacao ? "Usar o código do app autenticador" : "Usar um código de recuperação"}
            </Button>
            <Button
              fullWidth
              color="inherit"
              onClick={() => {
                setEtapa("credenciais");
                setChallengeToken("");
                setCodigo("");
                setError("");
              }}
            >
              Voltar
            </Button>
          </>
        ) : null}

        {etapa === "configurar2fa" ? (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              O seu perfil exige verificação em duas etapas. Configure agora para continuar.
            </Alert>
            <TwoFactorSetupPanel
              token={setupToken}
              onActivated={(resposta) => {
                if (resposta?.token || resposta?.accessToken) {
                  try {
                    concluirLogin({ ...resposta, user: resposta.user });
                    return;
                  } catch {
                    // Segue para novo login abaixo.
                  }
                }
                setEtapa("credenciais");
                setSetupToken("");
                setPassword("");
                setAviso("Verificação em duas etapas ativada. Entre novamente com seu código.");
              }}
            />
          </>
        ) : null}

        {etapa === "aguardandoDispositivo" ? (
          <>
            {deviceRecusado ? (
              <>
                <Alert severity="error" sx={{ mb: 2 }}>
                  Este dispositivo foi recusado pelo administrador da conta. Se for engano, peça para liberar novamente.
                </Alert>
                <Button fullWidth variant="outlined" onClick={() => { setEtapa("credenciais"); setDeviceChallengeToken(""); setDeviceRecusado(false); }}>
                  Voltar
                </Button>
              </>
            ) : (
              <>
                <Typography sx={{ fontWeight: 800, mb: 0.5 }}>Dispositivo novo</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Este é um dispositivo novo para a sua conta. O administrador foi avisado e precisa aprovar o acesso antes de continuar.
                  Esta tela atualiza sozinha assim que a aprovação acontecer.
                </Typography>
                <Button fullWidth color="inherit" onClick={() => { setEtapa("credenciais"); setDeviceChallengeToken(""); }}>
                  Cancelar
                </Button>
              </>
            )}
          </>
        ) : null}

        {etapa === "credenciais" ? (
          <>
        <TextField
          fullWidth
          label={EDU_ONLY ? "ID da instituição (opcional)" : "ID da clínica (opcional)"}
          value={clinicId}
          onChange={(event) => setClinicId(event.target.value)}
          helperText={EDU_ONLY ? "Só é necessário quando o mesmo e-mail pertence a mais de uma instituição." : "Só é necessário quando o mesmo e-mail pertence a mais de uma clínica."}
          sx={{ mb: 2 }}
        />
        {EDU_ONLY ? (
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            {([["EMAIL", "E-mail"], ["RA", "Aluno (RA)"], ["LOGINALT", "Professor/Gestor"]] as [ModoLogin, string][]).map(([v, label]) => (
              <Button key={v} size="small" variant={modo === v ? "contained" : "outlined"} onClick={() => { setModo(v); setIdentificador(""); setError(""); }} sx={{ flex: 1 }}>
                {label}
              </Button>
            ))}
          </Box>
        ) : null}
        {modo === "EMAIL" ? (
          <TextField
            fullWidth
            label="E-mail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            sx={{ mb: 2 }}
            required
          />
        ) : (
          <TextField
            fullWidth
            label={modo === "RA" ? "RA (registro acadêmico)" : "Usuário (nome.sobrenome)"}
            value={identificador}
            onChange={(event) => setIdentificador(event.target.value)}
            helperText={modo === "RA" ? "O RA informado pela secretaria." : "Ex.: joao.silva, como informado pela coordenação."}
            sx={{ mb: 2 }}
            required
          />
        )}
        <TextField
          fullWidth
          label="Senha"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          helperText={modo !== "EMAIL" ? "No primeiro acesso, use sua data de nascimento (DDMMAAAA)." : undefined}
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

        {!EDU_ONLY ? (
        <Box sx={{ mt: 3, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Ainda não usa o DentalPos One? O EXPERIENCE é gratuito, temporário e informa claramente
            a data de encerramento.
          </Typography>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              window.location.href = demoRegistrationUrl();
            }}
          >
            Conhecer o EXPERIENCE
          </Button>
        </Box>
        ) : null}

        {modo === "EMAIL" ? (
          <Button
            fullWidth
            sx={{ mt: 1 }}
            disabled={!email.trim()}
            onClick={() => { setFaceErro(""); setFaceOpen(true); }}
          >
            Entrar com reconhecimento facial
          </Button>
        ) : null}
        <Button
          fullWidth
          sx={{ mt: 1 }}
          onClick={() => {
            setResetEmail(modo === "EMAIL" ? email : "");
            setResetClinicId(clinicId);
            setResetMessage("");
            setResetError("");
            setResetOpen(true);
          }}
        >
          Esqueci minha senha
        </Button>
        {modo !== "EMAIL" ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            A recuperação usa o e-mail cadastrado na sua ficha, mesmo fazendo login por {modo === "RA" ? "RA" : "usuário"}. Se não tiver acesso a ele, procure a administração.
          </Typography>
        ) : null}
          </>
        ) : null}

        {etapa === "trocarSenha" ? (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Por segurança, você precisa trocar sua senha agora antes de continuar.
            </Alert>
            {senhaErro ? <Alert severity="error" sx={{ mb: 2 }}>{senhaErro}</Alert> : null}
            <TextField
              fullWidth
              label="Nova senha"
              type="password"
              value={novaSenha1}
              onChange={(event) => setNovaSenha1(event.target.value)}
              helperText="Pelo menos 10 caracteres, sem ser previsível."
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Confirmar nova senha"
              type="password"
              value={novaSenha2}
              onChange={(event) => setNovaSenha2(event.target.value)}
              sx={{ mb: 2 }}
              required
            />
            <Button fullWidth size="large" variant="contained" type="submit" disabled={senhaBusy || !novaSenha1 || !novaSenha2}>
              {senhaBusy ? "Salvando..." : "Trocar senha e entrar"}
            </Button>
          </>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          <a href="/privacidade">Política de Privacidade</a> · <a href="/termos">Termos de Uso</a> · <a href="/portal-titular">Portal do Titular (LGPD)</a>
        </Typography>
      </Paper>

      <Dialog open={faceOpen} onClose={() => setFaceOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Entrar com o rosto</DialogTitle>
        <DialogContent sx={{ pt: "12px!important" }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>Conta: <b>{email}</b>. Posicione o rosto e siga a instrução (piscar ou virar a cabeça). Disponível para quem já cadastrou o rosto em “Minha biometria”.</Typography>
          {faceErro && <Alert severity="error" sx={{ mb: 1.5 }}>{faceErro}</Alert>}
          {faceOpen && <FaceCamera modo="identificar" esperaMs={4000} onCaptura={entrarComRosto}
            pedirDesafio={async () => { const r = await fetch(`${API}/auth/face/desafio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(clinicId.trim() ? { clinicId: clinicId.trim() } : {}) }) }); if (!r.ok) throw new Error("Falha ao iniciar a verificação."); return r.json(); }} />}
        </DialogContent>
        <DialogActions><Button onClick={() => setFaceOpen(false)}>Cancelar</Button></DialogActions>
      </Dialog>

      <Dialog open={resetOpen} onClose={resetBusy ? undefined : () => setResetOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Redefinir senha</DialogTitle>
        <DialogContent sx={{ pt: "12px!important" }}>
          {resetMessage && <Alert severity="success" sx={{ mb: 2 }}>{resetMessage}</Alert>}
          {resetError && <Alert severity="error" sx={{ mb: 2 }}>{resetError}</Alert>}
          <TextField
            fullWidth
            label="E-mail"
            type="email"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label={EDU_ONLY ? "ID da instituição (opcional)" : "ID da clínica (opcional)"}
            value={resetClinicId}
            onChange={(event) => setResetClinicId(event.target.value)}
            helperText={EDU_ONLY ? "Informe apenas quando o mesmo e-mail pertence a mais de uma instituição." : "Informe apenas quando o mesmo e-mail pertence a mais de uma clínica."}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)} disabled={resetBusy}>Fechar</Button>
          <Button
            variant="contained"
            onClick={() => void requestReset()}
            disabled={resetBusy || !resetEmail.trim()}
          >
            {resetBusy ? "Enviando..." : "Enviar instruções"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
