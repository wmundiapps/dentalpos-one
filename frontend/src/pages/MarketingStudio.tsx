import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MovieIcon from "@mui/icons-material/Movie";
import PageHeader from "../components/PageHeader";
import { getAiBalance, type AiBalance } from "../services/AiApi";
import { criarVideo, getAvatar, getVideo, gerarConteudo, saveAvatar, type AvatarInfo, type ConteudoIA, type Formato, type VideoAvatar } from "../services/MarketingStudioApi";

// Estúdio de Marketing: o agente escreve post, story ou reel e, se a clínica quiser, grava o vídeo com o avatar de quem autorizou.
export default function MarketingStudio() {
  const [saldo, setSaldo] = useState<AiBalance | null>(null);
  const [formato, setFormato] = useState<Formato>("REEL");
  const [tema, setTema] = useState("");
  const [conteudo, setConteudo] = useState<ConteudoIA | null>(null);
  const [fala, setFala] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState("");

  const [avatar, setAvatar] = useState<AvatarInfo | null>(null);
  const [cad, setCad] = useState({ avatarId: "", voiceId: "", pessoa: "", autorizacao: false });
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [video, setVideo] = useState<VideoAvatar | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try { setSaldo(await getAiBalance()); } catch { setSaldo(null); }
    try { setAvatar(await getAvatar()); } catch { setAvatar(null); }
  }, []);
  useEffect(() => { void carregar(); return () => window.clearTimeout(timer.current); }, [carregar]);

  async function criar() {
    setBusy(true); setError(""); setConteudo(null); setVideo(null);
    try {
      const c = await gerarConteudo({ formato, tema });
      setConteudo(c); setFala(c.fala);
      void carregar();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível criar agora."); }
    finally { setBusy(false); }
  }

  async function copiar(chave: string, texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(chave); window.setTimeout(() => setCopiado(""), 1500); } catch { /* sem permissão de área de transferência */ }
  }

  async function cadastrarAvatar() {
    setSavingAvatar(true); setError("");
    try { await saveAvatar(cad); setCad({ avatarId: "", voiceId: "", pessoa: "", autorizacao: false }); await carregar(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o avatar."); }
    finally { setSavingAvatar(false); }
  }

  // Vídeo demora alguns minutos: consulta a cada 10 s até ficar pronto ou falhar.
  function acompanhar(id: string, tentativas = 0) {
    timer.current = window.setTimeout(async () => {
      try {
        const v = await getVideo(id);
        setVideo(v);
        if (v.status === "PROCESSANDO" && tentativas < 90) acompanhar(id, tentativas + 1);
        else { setVideoBusy(false); void carregar(); }
      } catch { if (tentativas < 90) acompanhar(id, tentativas + 1); else setVideoBusy(false); }
    }, 10000);
  }

  async function gerarVideo() {
    setVideoBusy(true); setError(""); setVideo({ status: "PROCESSANDO" });
    try { const r = await criarVideo(fala); void carregar(); acompanhar(r.videoId); }
    catch (e) { setVideoBusy(false); setVideo(null); setError(e instanceof Error ? e.message : "Não foi possível criar o vídeo."); }
  }

  return (
    <Box>
      <PageHeader title="Estúdio de Marketing" description="Diga o assunto e a IA escreve o post, o story ou o reel da clínica. Você revisa e publica." />

      {saldo && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Chip color="primary" label={`Plano ${saldo.plano}`} />
          <Typography variant="body2">{`Créditos disponíveis: ${saldo.disponivel}`}</Typography>
          <Button size="small" variant="outlined" href="/creditos?tipo=IA">Comprar créditos</Button>
        </Paper>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
        <Stack spacing={2}>
          <ToggleButtonGroup exclusive size="small" value={formato} onChange={(_, v: Formato | null) => v && setFormato(v)}>
            <ToggleButton value="POST">Post</ToggleButton>
            <ToggleButton value="STORY">Story (3 telas)</ToggleButton>
            <ToggleButton value="REEL">Reel (30 s)</ToggleButton>
          </ToggleButtonGroup>
          <TextField multiline minRows={2} label="Sobre o que é? (ex.: cuidados depois do clareamento)" value={tema} onChange={(e) => setTema(e.target.value)} />
          <Box><Button variant="contained" startIcon={<AutoAwesomeIcon />} disabled={busy || tema.trim().length < 5} onClick={() => void criar()}>{busy ? "Criando..." : "Criar com IA"}</Button></Box>
        </Stack>
      </Paper>

      {conteudo && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>Revise antes de publicar: o texto deve seguir as regras de publicidade do CFO e não pode prometer resultado.</Alert>
          <Typography variant="overline" color="text.secondary">Legenda</Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{conteudo.legenda}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{conteudo.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</Typography>
          <Button size="small" startIcon={<ContentCopyIcon />} sx={{ mt: 1 }} onClick={() => void copiar("legenda", `${conteudo.legenda}\n\n${conteudo.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`)}>{copiado === "legenda" ? "Copiado" : "Copiar legenda"}</Button>

          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 2 }}>Telas</Typography>
          <Stack spacing={1}>
            {conteudo.telas.map((t, i) => (
              <Paper key={i} variant="outlined" sx={{ p: 1.5 }}><Typography variant="subtitle2">{`${i + 1}. ${t.titulo}`}</Typography><Typography variant="body2">{t.texto}</Typography></Paper>
            ))}
          </Stack>
          {conteudo.ideiaVisual && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{`Ideia visual: ${conteudo.ideiaVisual}`}</Typography>}
        </Paper>
      )}

      {conteudo && formato !== "POST" && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Vídeo com avatar</Typography>
          {!avatar?.ativoNaPlataforma && <Alert severity="info">O vídeo com avatar ainda não foi ativado na plataforma. Fale com o suporte WMundi.</Alert>}

          {avatar?.ativoNaPlataforma && !avatar.avatar && (
            <Stack spacing={1.5}>
              <Alert severity="warning">Só cadastre o avatar de quem autorizou o uso da própria imagem e voz. Este aceite fica registrado.</Alert>
              <TextField size="small" label="Nome da pessoa que aparece no avatar" value={cad.pessoa} onChange={(e) => setCad({ ...cad, pessoa: e.target.value })} />
              <TextField size="small" label="Código do avatar (fornecido pela WMundi)" value={cad.avatarId} onChange={(e) => setCad({ ...cad, avatarId: e.target.value })} />
              <TextField size="small" label="Código da voz (fornecido pela WMundi)" value={cad.voiceId} onChange={(e) => setCad({ ...cad, voiceId: e.target.value })} />
              <FormControlLabel control={<Checkbox checked={cad.autorizacao} onChange={(e) => setCad({ ...cad, autorizacao: e.target.checked })} />} label="Confirmo que a pessoa acima autorizou, por escrito, o uso da sua imagem e voz em vídeos da clínica." />
              <Box><Button variant="outlined" disabled={savingAvatar || !cad.autorizacao || !cad.avatarId || !cad.voiceId || cad.pessoa.trim().length < 3} onClick={() => void cadastrarAvatar()}>Cadastrar avatar</Button></Box>
            </Stack>
          )}

          {avatar?.ativoNaPlataforma && avatar.avatar && (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">{`Avatar de ${avatar.avatar.pessoa}, autorizado em ${new Date(avatar.avatar.consentimentoEm).toLocaleDateString("pt-BR")}.`}</Typography>
              <TextField multiline minRows={4} label="O que o avatar vai falar (você pode editar)" value={fala} onChange={(e) => setFala(e.target.value.slice(0, 700))} helperText={`${fala.length}/700 caracteres. Cada vídeo usa ${avatar.creditosPorVideo} créditos.`} />
              <Box><Button variant="contained" startIcon={<MovieIcon />} disabled={videoBusy || fala.trim().length < 20} onClick={() => void gerarVideo()}>{videoBusy ? "Gravando o vídeo..." : "Gerar vídeo com avatar"}</Button></Box>
              {video?.status === "PROCESSANDO" && <Alert severity="info">O vídeo leva alguns minutos. Pode deixar esta tela aberta.</Alert>}
              {video?.status === "FALHOU" && <Alert severity="error">Não foi possível criar o vídeo. Os créditos foram devolvidos.</Alert>}
              {video?.status === "PRONTO" && video.videoUrl && (
                <Box>
                  <video src={video.videoUrl} controls style={{ maxWidth: 280, width: "100%", borderRadius: 12 }} />
                  <Box sx={{ mt: 1 }}><Button size="small" variant="outlined" href={video.videoUrl} target="_blank" rel="noopener noreferrer">Baixar vídeo</Button></Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Ao publicar, informe que o vídeo foi feito com inteligência artificial. O link expira em alguns dias, então baixe o arquivo.</Typography>
                </Box>
              )}
            </Stack>
          )}
        </Paper>
      )}
    </Box>
  );
}
