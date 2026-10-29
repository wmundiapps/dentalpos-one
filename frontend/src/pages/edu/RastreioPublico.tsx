import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, LinearProgress, Paper, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useEffect, useState } from "react";

const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api";
const BASE = `${API}/public/edu/atendimento`;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

/** Página PÚBLICA de rastreio por código (sem login). Mostra só o que a instituição liberou e nada de dado pessoal excessivo. */
export default function RastreioPublico() {
  const inicial = new URLSearchParams(window.location.search).get("c") || "";
  const [codigo, setCodigo] = useState(inicial);
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function buscar(c = codigo) {
    const cod = c.trim();
    if (!cod) return;
    setLoading(true); setErro(null); setDados(null); setMsg(null);
    try {
      const r = await fetch(`${BASE}/rastreio/${encodeURIComponent(cod)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Erro ${r.status}`);
      setDados(j);
      window.history.replaceState(null, "", `?c=${encodeURIComponent(cod)}`);
    } catch (e: any) { setErro(e.message || "Não foi possível consultar."); } finally { setLoading(false); }
  }
  useEffect(() => { if (inicial) void buscar(inicial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function notif(receber: boolean) {
    try {
      const r = await fetch(`${BASE}/rastreio/${encodeURIComponent(codigo.trim())}/notificacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receber }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Falha ao salvar.");
      setDados((d: any) => ({ ...d, notificacoes: receber }));
      setMsg(receber ? "Você voltará a receber avisos de andamento." : "Pronto: você não receberá mais avisos de andamento deste protocolo.");
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", p: { xs: 1.5, sm: 3 }, display: "flex", justifyContent: "center" }}>
      <Box sx={{ width: "100%", maxWidth: 640 }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Acompanhe seu pedido</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Informe o código de rastreio recebido no comprovante, e-mail ou mensagem.</Typography>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" label="Código de rastreio" placeholder="XXXX-XXXX-XXXX" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") void buscar(); }} sx={{ flex: "1 1 220px" }} slotProps={{ htmlInput: { "aria-label": "Código de rastreio", maxLength: 20 } }} />
          <Button variant="contained" onClick={() => buscar()} disabled={loading || !codigo.trim()}>{loading ? <CircularProgress size={20} /> : "Consultar"}</Button>
        </Paper>
        {erro && <Alert severity="warning">{erro}</Alert>}
        {dados && (
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography variant="overline" color="text.secondary">{dados.instituicao}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{dados.servico}</Typography>
            <Typography variant="body2" color="text.secondary">Protocolo {dados.protocolo} · solicitante {dados.solicitante} · aberto em {fmt(dados.abertoEm)}</Typography>
            <Alert severity={dados.status === "CONCLUIDO" ? "success" : dados.status === "INDEFERIDO" || dados.status === "CANCELADO" ? "error" : dados.status === "PENDENTE_SOLICITANTE" ? "warning" : "info"} sx={{ my: 2 }}>
              <b>{dados.statusRotulo}</b>{dados.etapaAtual ? ` — etapa atual: ${dados.etapaAtual}` : ""}{dados.previsaoConclusao ? ` · previsão: ${fmt(dados.previsaoConclusao)}` : ""}{dados.concluidoEm ? ` · encerrado em ${fmt(dados.concluidoEm)}` : ""}
            </Alert>
            {dados.pendencia && <Alert severity={dados.pendencia.vencida ? "error" : "warning"} sx={{ mb: 2 }}>Há uma pendência a resolver com a instituição até {fmt(dados.pendencia.prazoEm)}{dados.pendencia.vencida ? " (prazo vencido)" : ""}. Entre em contato com o atendimento.</Alert>}
            <LinearProgress variant="determinate" value={dados.progresso} sx={{ height: 8, borderRadius: 4, mb: 2 }} aria-label={`Progresso ${dados.progresso}%`} />
            <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0 }}>
              {dados.etapas.map((e: any, i: number) => (
                <Box component="li" key={i} sx={{ display: "flex", gap: 1.2, py: 1, borderLeft: 3, borderColor: e.status === "CONCLUIDA" ? "success.main" : e.status === "EM_ANDAMENTO" ? "primary.main" : "divider", pl: 1.5, ml: 0.5 }}>
                  {e.status === "CONCLUIDA" ? <CheckCircleIcon color="success" /> : e.status === "EM_ANDAMENTO" ? <PlayCircleIcon color="primary" /> : <RadioButtonUncheckedIcon color="disabled" />}
                  <Box>
                    <Typography sx={{ fontWeight: e.status === "EM_ANDAMENTO" ? 800 : 500 }}>{e.nome}</Typography>
                    <Typography variant="caption" color="text.secondary">{e.status === "CONCLUIDA" ? `Concluída em ${fmt(e.concluidaEm)}` : e.status === "EM_ANDAMENTO" ? `Em andamento${e.prazoEm ? ` · prazo ${fmt(e.prazoEm)}` : ""}` : e.status === "PULADA" ? "Não necessária" : e.prazoEm ? `Previsto até ${fmt(e.prazoEm)}` : "Aguardando"}</Typography>
                    {e.mensagem && <Typography variant="body2">{e.mensagem}</Typography>}
                  </Box>
                </Box>
              ))}
            </Box>
            {dados.historico?.length > 0 && <><Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2 }}>Últimas atualizações</Typography>{dados.historico.slice(-6).reverse().map((h: any, i: number) => <Typography key={i} variant="body2" color="text.secondary">{fmt(h.em)} — {h.titulo}</Typography>)}</>}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel control={<Checkbox checked={!!dados.notificacoes} onChange={(e) => notif(e.target.checked)} />} label="Receber avisos de andamento por e-mail/WhatsApp" />
              {msg && <Alert severity="info" sx={{ mt: 1 }}>{msg}</Alert>}
            </Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>Por segurança, esta página não exibe documentos, CPF ou contatos. Para detalhes, procure o atendimento da instituição informando o número do protocolo.</Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
