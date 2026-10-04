import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Paper, Switch, TextField, Tooltip, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { useMemo, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import { corDe, DIAS_CURTO, fmtDT, itemsOf, rotuloTipo, TIPOS_EVENTO, toISO, useGet, useTerms, useToast } from "./kit";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function MesTab() {
  const today = new Date();
  const [ref, setRef] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ tipo: "EVENTO_INSTITUCIONAL", diaInteiro: true, publico: "TODOS" });
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const terms = useTerms();

  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // segunda-feira
  const end = new Date(start); end.setDate(start.getDate() + 42);
  const { data, loading, error, reload } = useGet<any>(`/calendario/eventos${qsOf({ de: start.toISOString(), ate: end.toISOString(), tipo: tipoFiltro })}`);
  const cats = useGet<any>("/calendario/categorias?pageSize=100");

  const porDia = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const e of itemsOf(data)) {
      const ini = new Date(e.inicio); const fim = e.fim ? new Date(e.fim) : ini;
      const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
      for (let i = 0; i < 31 && d <= fim; i++) { (m[keyOf(d)] ||= []).push(e); d.setDate(d.getDate() + 1); if (!e.diaInteiro) break; }
    }
    return m;
  }, [data]);

  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const tituloBruto = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const titulo = tituloBruto.charAt(0).toUpperCase() + tituloBruto.slice(1);

  async function salvar() {
    setBusy(true);
    try {
      await eduApi.post("/calendario/eventos", {
        titulo: form.titulo, tipo: form.tipo, descricao: form.descricao || undefined, local: form.local || undefined,
        inicio: form.diaInteiro ? new Date(`${form.inicio}T00:00:00`).toISOString() : toISO(form.inicio),
        fim: form.fim ? (form.diaInteiro ? new Date(`${form.fim}T23:59:00`).toISOString() : toISO(form.fim)) : undefined,
        diaInteiro: !!form.diaInteiro, publico: form.publico, termId: form.termId || undefined, recorrencia: form.recorrencia || "NENHUMA",
      });
      toast({ type: "success", text: "Evento criado." });
      setNovo(false); reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); } finally { setBusy(false); }
  }
  async function remover(e: any) {
    if (!window.confirm(`Excluir o evento "${e.titulo}"${e.recorrente ? " (toda a série)" : ""}?`)) return;
    try { await eduApi.del(`/calendario/eventos/${e.eventoId}`); toast({ type: "success", text: "Evento excluído." }); reload(); } catch (er: any) { toast({ type: "error", text: er.message }); }
  }
  async function bootstrap() {
    if (!window.confirm("Criar categorias padrão, malha de horários e feriados nacionais? Itens existentes são preservados.")) return;
    try { const r = await eduApi.post("/calendario/bootstrap", {}); toast({ type: "success", text: `Pronto: ${JSON.stringify(r)}` }); reload(); cats.reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function gerarPeriodo() {
    const termId = form.termId;
    if (!termId) return toast({ type: "info", text: "Selecione o período letivo no formulário de novo evento para gerar o calendário padrão." });
    if (!window.confirm("Gerar o calendário padrão (modelo + prazos) para o período selecionado?")) return;
    try { const r = await eduApi.post(`/calendario/periodos/${termId}/gerar-calendario`, {}); toast({ type: "success", text: `Calendário gerado: ${JSON.stringify(r)}` }); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  const eventosDoDia = dia ? porDia[dia] || [] : [];
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <IconButton onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))} aria-label="Mês anterior"><ChevronLeftIcon /></IconButton>
        <Typography variant="h6" sx={{ minWidth: 190, textAlign: "center", fontWeight: 700 }}>{titulo}</Typography>
        <IconButton onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))} aria-label="Próximo mês"><ChevronRightIcon /></IconButton>
        <Button size="small" onClick={() => setRef(new Date(today.getFullYear(), today.getMonth(), 1))}>Hoje</Button>
        <TextField select size="small" label="Tipo" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} sx={{ minWidth: 190 }}>
          <MenuItem value="">Todos</MenuItem>
          {TIPOS_EVENTO.map((t) => <MenuItem key={t} value={t}>{rotuloTipo(t)}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AutoFixHighIcon />} onClick={bootstrap}>Preparar base</Button>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => { setForm({ tipo: "EVENTO_INSTITUCIONAL", diaInteiro: true, publico: "TODOS" }); setNovo(true); }}>Novo evento</Button>
      </Box>
      {error ? <Alert severity="warning" sx={{ mb: 2 }}>Não foi possível carregar os eventos: {error}</Alert> : null}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", opacity: loading ? 0.6 : 1 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", bgcolor: "action.hover" }}>
          {DIAS_CURTO.slice(1).map((d) => <Typography key={d} variant="caption" sx={{ p: 1, fontWeight: 800, textAlign: "center" }}>{d}</Typography>)}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {cells.map((d) => {
            const k = keyOf(d); const evs = porDia[k] || []; const fora = d.getMonth() !== ref.getMonth(); const hoje = k === keyOf(today);
            return (
              <Box key={k} onClick={() => setDia(k)} sx={{ minHeight: { xs: 64, md: 104 }, p: 0.5, borderTop: 1, borderLeft: 1, borderColor: "divider", cursor: "pointer", bgcolor: fora ? "action.hover" : "transparent", "&:hover": { bgcolor: "action.selected" } }}>
                <Typography variant="caption" sx={{ fontWeight: hoje ? 800 : 500, color: hoje ? "#fff" : fora ? "text.disabled" : "text.primary", bgcolor: hoje ? "primary.main" : "transparent", borderRadius: 4, px: 0.8 }}>{d.getDate()}</Typography>
                {evs.slice(0, 3).map((e, i) => (
                  <Tooltip key={e.id + i} title={`${e.titulo} — ${rotuloTipo(e.tipo)}`}>
                    <Box sx={{ mt: 0.3, px: 0.6, borderRadius: 1, bgcolor: corDe(e), color: "#fff", fontSize: 11, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.titulo}</Box>
                  </Tooltip>
                ))}
                {evs.length > 3 ? <Typography variant="caption" color="text.secondary">+{evs.length - 3} mais</Typography> : null}
              </Box>
            );
          })}
        </Box>
      </Paper>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
        {itemsOf(cats.data).map((c: any) => <Chip key={c.id} size="small" label={c.nome} sx={{ bgcolor: c.cor, color: "#fff" }} />)}
        {!itemsOf(cats.data).length && !cats.loading ? <Typography variant="caption" color="text.secondary">Sem categorias cadastradas. Use "Preparar base" para criar as padrão.</Typography> : null}
      </Box>

      <Dialog open={!!dia} onClose={() => setDia(null)} fullWidth maxWidth="sm">
        <DialogTitle>{dia ? new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "full" }) : ""}</DialogTitle>
        <DialogContent>
          {!eventosDoDia.length ? <Typography color="text.secondary">Nenhum evento neste dia.</Typography> : eventosDoDia.map((e, i) => (
            <Paper key={e.id + i} variant="outlined" sx={{ p: 1.5, mb: 1, borderLeft: `5px solid ${corDe(e)}`, display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{e.titulo}</Typography>
                <Typography variant="caption" color="text.secondary">{rotuloTipo(e.tipo)} · {e.diaInteiro ? "Dia inteiro" : fmtDT(e.inicio)}{e.local ? ` · ${e.local}` : ""}{e.bloqueiaAulas ? " · bloqueia aulas" : ""}</Typography>
                {e.descricao ? <Typography variant="body2">{e.descricao}</Typography> : null}
              </Box>
              <Tooltip title="Excluir"><IconButton size="small" onClick={() => remover(e)}><DeleteOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            </Paper>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setDia(null)}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={novo} onClose={() => setNovo(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo evento</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField label="Título" required value={form.titulo || ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <TextField select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS_EVENTO.map((t) => <MenuItem key={t} value={t}>{rotuloTipo(t)}</MenuItem>)}</TextField>
          <FormControlLabel control={<Switch checked={!!form.diaInteiro} onChange={(e) => setForm({ ...form, diaInteiro: e.target.checked, inicio: "", fim: "" })} />} label="Dia inteiro" />
          <TextField label="Início" required type={form.diaInteiro ? "date" : "datetime-local"} slotProps={{ inputLabel: { shrink: true } }} value={form.inicio || ""} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
          <TextField label="Fim (opcional)" type={form.diaInteiro ? "date" : "datetime-local"} slotProps={{ inputLabel: { shrink: true } }} value={form.fim || ""} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
          <TextField select label="Público" value={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.value })}>
            {["TODOS", "ALUNOS", "PROFESSORES", "COORDENACAO", "ADMINISTRATIVO"].map((t) => <MenuItem key={t} value={t}>{rotuloTipo(t)}</MenuItem>)}
          </TextField>
          <TextField select label="Recorrência" value={form.recorrencia || "NENHUMA"} onChange={(e) => setForm({ ...form, recorrencia: e.target.value })}>
            {["NENHUMA", "DIARIA", "SEMANAL", "QUINZENAL", "MENSAL", "ANUAL"].map((t) => <MenuItem key={t} value={t}>{rotuloTipo(t)}</MenuItem>)}
          </TextField>
          <TextField select label="Período letivo (opcional)" value={form.termId || ""} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
            <MenuItem value="">Nenhum</MenuItem>{terms.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <TextField label="Local" value={form.local || ""} onChange={(e) => setForm({ ...form, local: e.target.value })} />
          <TextField label="Descrição" multiline minRows={2} value={form.descricao || ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={gerarPeriodo} disabled={!form.termId}>Gerar calendário padrão do período</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setNovo(false)}>Cancelar</Button>
          <Button variant="contained" disabled={busy || !form.titulo || !form.inicio} onClick={salvar}>Salvar</Button>
        </DialogActions>
      </Dialog>
      {node}
    </Box>
  );
}
