import { useState } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import LockClockIcon from "@mui/icons-material/LockClock";
import { eduApi } from "../services/EduApi";

/**
 * Tela padrão para uma funcionalidade ainda não ativada no perfil do usuário (ou que depende de uma
 * integração externa ainda não instalada). Em vez de esconder o item ou mostrar um erro cru, explica
 * a situação e deixa o usuário pedir a ativação direto para o desenvolvedor.
 */
export default function FuncionalidadeIndisponivel({ nome, dependeDeIntegracaoExterna = false }: { nome?: string; dependeDeIntegracaoExterna?: boolean }) {
  const [mensagem, setMensagem] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviarPedido() {
    if (!mensagem.trim()) return;
    setEnviando(true);
    setErro("");
    try {
      await eduApi.post("/feedback/itens", {
        tipo: "SUGESTAO",
        categoria: "OUTRO",
        prioridade: "MEDIA",
        titulo: `Habilitar funcionalidade${nome ? `: ${nome}` : ""}`.slice(0, 160),
        descricao: mensagem.trim(),
        contexto: { rota: window.location.pathname, tela: nome },
      });
      setEnviado(true);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível enviar o pedido agora. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, maxWidth: 560, mx: "auto", mt: 4 }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", mb: 2 }}>
        <LockClockIcon color="disabled" sx={{ mt: 0.3 }} />
        <Box>
          <Typography sx={{ fontWeight: 700 }}>Esta funcionalidade não está ativa no seu perfil</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Caso deseje utilizar esta funcionalidade, envie na caixa de mensagem abaixo um pedido para o desenvolvedor habilitar para você.
          </Typography>
          {dependeDeIntegracaoExterna ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              Se a funcionalidade depende de integração com bancos, Meta ou outro sistema externo, o TI da sua empresa deve instalar a
              integração. (Pode ter custo adicional)
            </Alert>
          ) : null}
        </Box>
      </Box>

      {enviado ? (
        <Alert severity="success">Pedido enviado. O desenvolvedor foi avisado.</Alert>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <TextField
            multiline minRows={3} size="small" placeholder="Descreva o que você precisa usar e por quê..."
            value={mensagem} onChange={(e) => setMensagem(e.target.value)}
          />
          {erro ? <Alert severity="error">{erro}</Alert> : null}
          <Button variant="contained" disabled={!mensagem.trim() || enviando} onClick={enviarPedido} sx={{ justifySelf: "flex-start" }}>
            Enviar pedido
          </Button>
        </Box>
      )}
    </Paper>
  );
}
