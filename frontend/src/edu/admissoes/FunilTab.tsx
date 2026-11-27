import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useCallback, useEffect, useState } from "react";
import { eduApi, qsOf } from "../../services/EduApi";
import CandidatoDialog from "./CandidatoDialog";
import { FunilBars } from "./PainelTab";
import { BASE, Section, asList, useLoad, type Toast } from "./common";

const COLUNAS = [
  { status: "LEAD", label: "Leads", cor: "#607d8b" }, { status: "INSCRITO", label: "Inscritos", cor: "#1976d2" }, { status: "PROVA", label: "Em prova", cor: "#7b1fa2" },
  { status: "APROVADO", label: "Aprovados", cor: "#2e7d32" }, { status: "CONVOCADO", label: "Convocados", cor: "#ed6c02" }, { status: "MATRICULADO", label: "Matriculados", cor: "#00897b" },
  { status: "DESISTENTE", label: "Desistentes", cor: "#9e9e9e" }, { status: "REPROVADO", label: "Reprovados", cor: "#d32f2f" },
];
// Espelha as transições permitidas pelo backend (logic.ts).
const TRANS: Record<string, string[]> = {
  LEAD: ["INSCRITO", "DESISTENTE"], INSCRITO: ["PROVA", "APROVADO", "REPROVADO", "DESISTENTE"], PROVA: ["APROVADO", "REPROVADO", "DESISTENTE"],
  APROVADO: ["REPROVADO", "DESISTENTE"], CONVOCADO: ["APROVADO", "DESISTENTE"], MATRICULADO: ["DESISTENTE"], DESISTENTE: ["LEAD", "INSCRITO"], REPROVADO: ["INSCRITO"],
};
const PAGE = 40;

function NovoCandidato({ open, onClose, processos, toast, onDone }: { open: boolean; onClose: () => void; processos: any[]; toast: (t: Toast) => void; onDone: () => void }) {
  const [f, setF] = useState<Record<string, any>>({});
  const ofertas = processos.find((p) => p.id === f.processoId)?.ofertas || [];
  async function save() {
    try {
      const body: Record<string, any> = {};
      Object.entries(f).forEach(([k, v]) => { if (v !== "" && v !== undefined) body[k] = v; });
      body.consentimentoLgpd = true;
      await eduApi.post(`${BASE}/candidatos`, body);
      toast({ type: "success", text: body.processoId ? "Candidato inscrito." : "Lead cadastrado." });
      setF({}); onClose(); onDone();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Novo candidato / lead</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2, pt: 2 }}>
        <Alert severity="info">Sem processo seletivo, o cadastro entra como lead. Com processo, vira inscrito e a taxa é cobrada.</Alert>
        <TextField size="small" label="Nome completo" required value={f.nome || ""} onChange={set("nome")} />
        <TextField size="small" label="CPF" value={f.cpf || ""} onChange={set("cpf")} />
        <TextField size="small" label="E-mail" value={f.email || ""} onChange={set("email")} />
        <TextField size="small" label="Telefone" value={f.telefone || ""} onChange={set("telefone")} />
        <TextField size="small" label="Origem" value={f.origem || ""} onChange={set("origem")} helperText="Ex.: indicação, balcão, feira" />
        <TextField select size="small" label="Processo seletivo" value={f.processoId || ""} onChange={(e) => setF({ ...f, processoId: e.target.value, ofertaId: "" })}>
          <MenuItem value="">— Apenas lead —</MenuItem>
          {processos.map((p) => <MenuItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</MenuItem>)}
        </TextField>
        {f.processoId ? (
          <TextField select size="small" label="Curso (1ª opção)" value={f.ofertaId || ""} onChange={set("ofertaId")}>
            {ofertas.map((o: any) => <MenuItem key={o.id} value={o.id}>{o.nomeCurso} — {String(o.turno).toLowerCase()}</MenuItem>)}
          </TextField>
        ) : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={!f.nome || f.nome.length < 3} onClick={save}>Salvar</Button></DialogActions>
    </Dialog>
  );
}

export default function FunilTab({ toast }: { toast: (t: Toast) => void }) {
  const procs = useLoad<any>(`${BASE}/processos?pageSize=200`);
  const lista = asList(procs.data);
  const [pid, setPid] = useState("");
  const [q, setQ] = useState("");
  const [cols, setCols] = useState<Record<string, { items: any[]; total: number }>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<any | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const funil = useLoad<any>(`${BASE}/funil${qsOf({ processoId: pid })}`);

  const load = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const res = await Promise.all(COLUNAS.map((c) => eduApi.get(`${BASE}/candidatos${qsOf({ status: c.status, processoId: pid, q, pageSize: PAGE })}`)));
      const out: Record<string, { items: any[]; total: number }> = {};
      COLUNAS.forEach((c, i) => { out[c.status] = { items: res[i].items || [], total: res[i].total ?? 0 }; });
      setCols(out);
    } catch (e: any) { setErro(e.message); } finally { setLoading(false); }
  }, [pid, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function mover(c: any, para: string) {
    if (c.status === para) return;
    if (para === "CONVOCADO" || para === "MATRICULADO") { toast({ type: "error", text: "Convocação e matrícula são feitas pelas abas Classificação e Matrícula." }); return; }
    if (!TRANS[c.status]?.includes(para)) { toast({ type: "error", text: `Não é possível mover de ${c.status} para ${para}.` }); return; }
    let motivo: string | undefined;
    if (para === "DESISTENTE" || para === "REPROVADO") {
      const m = window.prompt(`Motivo (${para === "DESISTENTE" ? "desistência" : "reprovação"}):`);
      if (m === null) return;
      motivo = m || undefined;
    }
    try {
      await eduApi.post(`${BASE}/candidatos/${c.id}/status`, { status: para, motivo });
      toast({ type: "success", text: `${c.nome} movido para ${para.toLowerCase()}.` });
      load(); funil.reload();
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }

  const processosFull = lista;
  return (
    <>
      <Section title="Funil de candidatos" description="Arraste os cartões entre as colunas para atualizar a etapa do candidato. Clique no cartão para abrir a ficha."
        actions={<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" label="Processo" value={pid} onChange={(e) => setPid(e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">Todos (inclui leads)</MenuItem>
            {lista.map((p) => <MenuItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder="Nome, CPF, protocolo…" value={q} onChange={(e) => setQ(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo</Button>
        </Box>}>
        {funil.data ? <Box sx={{ mb: 3 }}><FunilBars funil={funil.data} /></Box> : null}
        {erro ? <Alert severity="warning" action={<Button color="inherit" size="small" onClick={load}>Tentar de novo</Button>}>Não foi possível carregar os candidatos: {erro}</Alert> : null}
        <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1, opacity: loading ? 0.6 : 1 }}>
          {COLUNAS.map((col) => {
            const d = cols[col.status] || { items: [], total: 0 };
            return (
              <Paper key={col.status} variant="outlined"
                onDragOver={(e) => { e.preventDefault(); setOver(col.status); }} onDragLeave={() => setOver(null)}
                onDrop={() => { setOver(null); if (drag) mover(drag, col.status); setDrag(null); }}
                sx={{ minWidth: 185, flex: "1 1 0", p: 1, borderRadius: 3, bgcolor: over === col.status ? "action.selected" : "action.hover", borderTop: `4px solid ${col.cor}` }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography sx={{ fontWeight: 800 }}>{col.label}</Typography><Chip size="small" label={d.total} />
                </Box>
                <Box sx={{ display: "grid", gap: 1, maxHeight: 460, overflowY: "auto" }}>
                  {d.items.map((c) => (
                    <Paper key={c.id} draggable onDragStart={() => setDrag(c)} onDragEnd={() => setDrag(null)} onClick={() => setDetalhe(c.id)} elevation={1}
                      sx={{ p: 1, borderRadius: 2, cursor: "grab", "&:hover": { boxShadow: 4 } }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.nome}</Typography>
                      <Typography variant="caption" color="text.secondary" component="div">{c.protocolo}{c.origem ? ` · ${c.origem}` : ""}</Typography>
                      {c.notaFinal != null ? <Typography variant="caption" component="div">Nota {Number(c.notaFinal).toFixed(1)}{c.classificacao ? ` · ${c.classificacao}º` : ""}</Typography> : null}
                      {c.proximoContatoEm && new Date(c.proximoContatoEm) <= new Date() ? <Chip size="small" color="error" label="Follow-up vencido" sx={{ mt: 0.5 }} /> : null}
                    </Paper>
                  ))}
                  {!d.items.length ? <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>{loading ? "Carregando…" : "Vazio"}</Typography> : null}
                  {d.total > d.items.length ? <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>+{d.total - d.items.length} (use a busca)</Typography> : null}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Section>
      <CandidatoDialog id={detalhe} onClose={() => setDetalhe(null)} toast={toast} onChanged={() => { load(); funil.reload(); }} />
      <NovoCandidato open={novo} onClose={() => setNovo(false)} processos={processosFull} toast={toast} onDone={() => { load(); funil.reload(); }} />
    </>
  );
}
