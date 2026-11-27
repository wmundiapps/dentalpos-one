import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtDate, fmtDateTime, label, Section, Status, useApi, useToast } from "./ui";

const TIPOS = ["PORTARIA", "RELATORIO_AVALIACAO", "DILIGENCIA", "OUTRO"];

function Resultado({ r, analiseId, onTasks }: { r: any; analiseId: string; onTasks: () => void }) {
  const [sel, setSel] = useState<number[]>((r.tarefasSugeridas || []).map((_: any, i: number) => i));
  const { toast, node } = useToast();
  async function criar() {
    try {
      const tarefas = sel.map((i) => r.tarefasSugeridas[i]).map((t: any) => ({ titulo: t.titulo, prazo: t.prazo || undefined, prazoDias: t.prazo ? undefined : t.prazoDias, severity: t.severity || "ATENCAO" }));
      const x = await eduApi.post(`/regulatorio/analise-documentos/${analiseId}/criar-tarefas`, { tarefas });
      toast({ type: "success", text: `${x.criadas?.length || 0} lembrete(s) criado(s).` }); onTasks();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Box sx={{ mt: 2 }}>
      <Chip size="small" color={r.modo === "IA" ? "success" : "warning"} label={r.modo === "IA" ? "Análise por IA" : "Análise heurística"} sx={{ mb: 1 }} />
      {r.aviso && <Alert severity="warning" sx={{ mb: 1 }}>{r.aviso}</Alert>}
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Resumo</Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>{r.resumo}{r.numeroAto ? `\nAto identificado: ${r.numeroAto}` : ""}</Typography>
      {(r.prazos || []).length > 0 && <>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Prazos identificados</Typography>
        {r.prazos.map((p: any, i: number) => <Typography key={i} variant="body2">• {p.data ? fmtDate(p.data) : p.dias != null ? `${p.dias} dia(s)` : "?"} — {p.texto || p.contexto}</Typography>)}
      </>}
      {(r.exigencias || []).length > 0 && <>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Exigências</Typography>
        {r.exigencias.map((e: string, i: number) => <Typography key={i} variant="body2">• {e}</Typography>)}
      </>}
      {(r.riscos || []).length > 0 && <>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Riscos</Typography>
        {r.riscos.map((e: string, i: number) => <Typography key={i} variant="body2" color="error">• {e}</Typography>)}
      </>}
      {(r.tarefasSugeridas || []).length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Tarefas sugeridas (viram lembretes)</Typography>
          {r.tarefasSugeridas.map((t: any, i: number) => (
            <FormControlLabel key={i} sx={{ display: "flex" }} control={<Checkbox size="small" checked={sel.includes(i)} onChange={(e) => setSel(e.target.checked ? [...sel, i] : sel.filter((x) => x !== i))} />}
              label={`${t.titulo} — ${t.prazo ? fmtDate(t.prazo) : `${t.prazoDias ?? 15} dia(s)`} (${label(t.severity)})`} />
          ))}
          {(r.tarefasCriadas || []).length > 0 ? <Typography variant="caption" color="success.main">{r.tarefasCriadas.length} tarefa(s) já criada(s).</Typography>
            : <Button size="small" variant="contained" disabled={!sel.length} onClick={criar} sx={{ mt: 1 }}>Criar lembretes selecionados</Button>}
        </Paper>
      )}
      {node}
    </Box>
  );
}

export default function AnaliseIaTab() {
  const [f, setF] = useState<Record<string, any>>({ tipoDocumento: "PORTARIA" });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const { data: hist, reload, loading, error } = useApi<any>("/regulatorio/analise-documentos?pageSize=15");
  const { data: procs } = useApi<any>("/regulatorio/processos?pageSize=100");
  const pr: any[] = (Array.isArray(procs) ? procs : procs?.items) || [];
  const { toast, node } = useToast();
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  async function analisar() {
    setBusy(true); setRes(null);
    try { setRes(await eduApi.post("/regulatorio/analise-documentos", { texto: f.texto, tipoDocumento: f.tipoDocumento, titulo: f.titulo || undefined, processoId: f.processoId || undefined, criarTarefas: !!f.criarTarefas })); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function abrir(id: string) {
    try {
      const a = await eduApi.get(`/regulatorio/analise-documentos/${id}`);
      setRes({ id: a.id, modo: a.modo, resumo: a.resumo, prazos: a.prazos, exigencias: a.exigencias, tarefasSugeridas: [], tarefasCriadas: a.tarefasCriadas });
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const items: any[] = hist?.items || [];
  return (
    <Box>
      <Section title="Análise de documentos regulatórios por IA">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Cole o texto de uma portaria, relatório de avaliação ou diligência. A IA extrai prazos, exigências e tarefas; sem IA disponível, usa análise heurística. Sempre revise o resultado.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 2, mb: 2 }}>
          <TextField size="small" select label="Tipo do documento" value={f.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)}>{TIPOS.map((t) => <MenuItem key={t} value={t}>{label(t)}</MenuItem>)}</TextField>
          <TextField size="small" label="Título" value={f.titulo || ""} onChange={(e) => set("titulo", e.target.value)} />
          <TextField size="small" select label="Processo vinculado" value={f.processoId || ""} onChange={(e) => set("processoId", e.target.value)}><MenuItem value="">—</MenuItem>{pr.map((p) => <MenuItem key={p.id} value={p.id}>{p.titulo}</MenuItem>)}</TextField>
        </Box>
        <TextField fullWidth multiline minRows={8} label="Texto do documento (mín. 30 caracteres)" value={f.texto || ""} onChange={(e) => set("texto", e.target.value)} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1 }}>
          <FormControlLabel control={<Checkbox checked={!!f.criarTarefas} onChange={(e) => set("criarTarefas", e.target.checked)} />} label="Já criar lembretes das tarefas sugeridas" />
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AutoAwesomeIcon />} disabled={busy || (f.texto || "").trim().length < 30} onClick={analisar}>{busy ? "Analisando…" : "Analisar"}</Button>
        </Box>
        {res && <Resultado key={res.id} r={res} analiseId={res.id} onTasks={reload} />}
      </Section>
      <Section title="Análises anteriores">
        <Status loading={loading && !hist} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhuma análise realizada.">
          {items.map((a) => (
            <Box key={a.id} sx={{ display: "flex", gap: 1.5, alignItems: "center", py: 0.5 }}>
              <Chip size="small" label={a.modo} /><Typography variant="body2" sx={{ flex: 1 }}>{a.titulo || label(a.tipoDocumento)} · {fmtDateTime(a.createdAt)}</Typography>
              <Button size="small" onClick={() => abrir(a.id)}>Abrir</Button>
            </Box>
          ))}
        </Status>
      </Section>
      {node}
    </Box>
  );
}
