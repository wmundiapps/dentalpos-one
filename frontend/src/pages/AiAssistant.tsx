import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PageHeader from "../components/PageHeader";
import { getAiBalance, runAi, type AiBalance } from "../services/AiApi";

const ATALHOS = [
  {
    id: "META",
    titulo: "Como configurar meu WhatsApp na Meta",
    task: "TUTORIAL_META",
    prompt:
      "Explique em passo a passo simples, para um dentista sem conhecimento tecnico, como registrar o numero da clinica na WhatsApp Business Platform da Meta e obter o ID do numero e o token de acesso permanente. Avise que o numero nao pode estar em uso no WhatsApp comum nem no WhatsApp Business, e que a Meta cobra por mensagem no cartao da clinica.",
  },
  {
    id: "LEMBRETE",
    titulo: "Escrever um lembrete de consulta",
    task: "SUGESTAO_TEXTO",
    prompt: "Escreva uma mensagem curta e cordial de lembrete de consulta odontologica, para enviar ao paciente um dia antes.",
  },
  {
    id: "RETORNO",
    titulo: "Mensagem de retorno para paciente inativo",
    task: "SUGESTAO_TEXTO",
    prompt: "Escreva uma mensagem curta convidando um paciente que nao volta ha mais de um ano a agendar uma avaliacao. Sem tom de venda agressiva.",
  },
];

export default function AiAssistant() {
  const [saldo, setSaldo] = useState<AiBalance | null>(null);
  const [prompt, setPrompt] = useState("");
  const [task, setTask] = useState("SUGESTAO_TEXTO");
  const [resposta, setResposta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    try { setSaldo(await getAiBalance()); } catch { setSaldo(null); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const executar = async (texto: string, tipo: string) => {
    if (!texto.trim()) return;
    setBusy(true); setError(""); setResposta("");
    try {
      const r = await runAi({ task: tipo, prompt: texto });
      setResposta(r.texto);
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel usar a IA agora.");
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader title="Assistente de IA" description={"Use a intelig\u00eancia artificial para escrever mensagens, resumir e tirar d\u00favidas sobre a configura\u00e7\u00e3o do sistema."} />

      {saldo && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Chip color="primary" label={`Plano ${saldo.plano}`} />
          <Typography variant="body2">{`Franquia do m\u00eas: ${saldo.franquiaRestante} de ${saldo.franquiaMensal}`}</Typography>
          <Typography variant="body2" color="text.secondary">{`Cr\u00e9ditos comprados: ${saldo.saldoComprado}`}</Typography>
          {saldo.disponivel <= 0 && <Alert severity="warning" sx={{ py: 0 }}>{"Franquia esgotada. Compre um pacote para continuar."}</Alert>}
        </Paper>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {ATALHOS.map((a) => (
          <Button key={a.id} size="small" variant="outlined" disabled={busy} onClick={() => { setPrompt(a.prompt); setTask(a.task); void executar(a.prompt, a.task); }}>{a.titulo}</Button>
        ))}
      </Box>

      <TextField
        fullWidth multiline minRows={3}
        label="O que voc\u00ea precisa?"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        sx={{ mb: 2 }}
      />
      <Button variant="contained" startIcon={<AutoAwesomeIcon />} disabled={busy || !prompt.trim()} onClick={() => void executar(prompt, task)}>
        {busy ? "Pensando..." : "Perguntar"}
      </Button>

      {resposta && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mt: 3, whiteSpace: "pre-wrap" }}>
          <Typography variant="body1">{resposta}</Typography>
        </Paper>
      )}
    </Box>
  );
}