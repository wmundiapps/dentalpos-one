import { Alert, Box, Button, Chip, CircularProgress, Paper, Snackbar, TextField, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import SendIcon from "@mui/icons-material/Send";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { eduApi, qsOf } from "../../services/EduApi";
import { SEMAFORO_COR, abrirHtml, baixarArquivo, fetchTexto, mapRota, msgErro } from "./common";

/** Botões do relatório executivo: HTML imprimível e CSV. */
export function ReportButtons({ perfil, programId }: { perfil: string; programId?: string }) {
  const [busy, setBusy] = useState<"html" | "csv" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (formato: "html" | "csv") => {
    setBusy(formato);
    try {
      const txt = await fetchTexto(`/reitoria/relatorio/executivo${qsOf({ formato, perfil, programId })}`);
      if (formato === "csv") baixarArquivo(`relatorio-executivo-${perfil}.csv`, "﻿" + txt, "text/csv;charset=utf-8");
      else abrirHtml(txt);
    } catch (e) { setMsg(msgErro(e)); } finally { setBusy(null); }
  };
  return (
    <>
      <Button variant="contained" color="inherit" startIcon={busy === "html" ? <CircularProgress size={16} /> : <PrintIcon />} disabled={!!busy} onClick={() => run("html")} sx={{ bgcolor: "rgba(255,255,255,.95)", color: "#0B1F3A" }}>Relatório (imprimir)</Button>
      <Button variant="outlined" startIcon={busy === "csv" ? <CircularProgress size={16} /> : <DownloadIcon />} disabled={!!busy} onClick={() => run("csv")} sx={{ color: "#fff", borderColor: "rgba(255,255,255,.7)" }}>CSV</Button>
      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg(null)}><Alert severity="error" onClose={() => setMsg(null)}>{msg}</Alert></Snackbar>
    </>
  );
}

interface Resposta { resposta: string; modo: string; aviso?: string | null; indicadoresCitados: Array<{ chave: string; titulo: string; valor: number | null; unidade: string; semaforo: string; rota: string }> }

const SUGESTOES = ["Quais indicadores estão críticos hoje?", "Como está a evasão?", "O que mudou na inadimplência?", "Quais são as três prioridades da semana?"];

/** Assistente por IA: pergunta em linguagem natural sobre os indicadores do perfil. */
export function AssistantBox({ perfil, programId }: { perfil: string; programId?: string }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const perguntar = async (texto: string) => {
    const pergunta = texto.trim();
    if (pergunta.length < 3) { setErro("Escreva uma pergunta com pelo menos 3 caracteres."); return; }
    setBusy(true); setErro(null);
    try { setRes(await eduApi.post<Resposta>("/reitoria/assistente/perguntar", { pergunta, perfil, programId: programId || undefined })); }
    catch (e) { setErro(msgErro(e)); } finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <AutoAwesomeIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Assistente executivo</Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField fullWidth size="small" placeholder="Pergunte sobre os indicadores da instituição…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) perguntar(q); }} inputProps={{ maxLength: 1000 }} />
        <Button variant="contained" onClick={() => perguntar(q)} disabled={busy} endIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}>Perguntar</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
        {SUGESTOES.map((s) => <Chip key={s} size="small" label={s} onClick={() => { setQ(s); perguntar(s); }} disabled={busy} />)}
      </Box>
      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {res && (
        <Box sx={{ mt: 2 }}>
          {res.aviso && <Alert severity="warning" sx={{ mb: 1 }}>{res.aviso}</Alert>}
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{res.resposta}</Typography>
          <Typography variant="caption" color="text.secondary">{res.modo === "IA" ? "Resposta gerada por IA a partir dos indicadores." : "Resumo automático por regras (IA indisponível)."}</Typography>
          {res.indicadoresCitados?.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
              {res.indicadoresCitados.map((i) => {
                const r = mapRota(i.rota, null);
                return <Chip key={i.chave} size="small" variant="outlined" label={i.titulo} onClick={r ? () => nav(r) : undefined}
                  avatar={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: SEMAFORO_COR[i.semaforo] || SEMAFORO_COR.CINZA, ml: "8px !important" }} />} />;
              })}
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
}
