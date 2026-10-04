import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, TextField, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtDate, label, Progress, Section, Status, toIso, useApi, useToast } from "./ui";

const ST = ["PENDENTE", "EM_ANDAMENTO", "ATENDIDO", "NAO_APLICAVEL"];

function ItemRow({ it, onChanged, toast }: { it: any; onChanged: () => void; toast: (m: any) => void }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [aplicar, setAplicar] = useState(false);
  const [conf, setConf] = useState<any>(it.conferenciaIA || null);
  async function patch(body: any) { try { await eduApi.patch(`/regulatorio/checklists/itens/${it.id}`, body); onChanged(); } catch (e: any) { toast({ type: "error", text: e.message }); } }
  async function conferir() {
    try { const r = await eduApi.post(`/regulatorio/checklists/itens/${it.id}/conferir`, { texto: doc, nomeDocumento: nome || undefined, aplicar }); setConf(r.conferencia); toast({ type: "success", text: "Conferência registrada. Revise o resultado." }); onChanged(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.2, mb: 1, borderRadius: 2 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Checkbox size="small" checked={it.status === "ATENDIDO"} onChange={(e) => patch({ status: e.target.checked ? "ATENDIDO" : "PENDENTE" })} />
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{it.titulo} {it.obrigatorio && <Chip size="small" color="error" variant="outlined" label="obrigatório" sx={{ ml: 0.5 }} />}</Typography>
          <Typography variant="caption" color="text.secondary">{label(it.dimensao)} · peso {it.peso} · prazo {fmtDate(it.prazo)}</Typography>
        </Box>
        <TextField select size="small" value={it.status} onChange={(e) => patch({ status: e.target.value })} sx={{ minWidth: 150 }}>
          {ST.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
        </TextField>
        <Button size="small" onClick={() => setOpen(!open)}>{open ? "Fechar" : "Evidência / IA"}</Button>
      </Box>
      {open && (
        <Box sx={{ mt: 1.5, display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField size="small" fullWidth label="Descrição da evidência" defaultValue={it.evidenciaTexto || ""} onChange={(e) => setTxt(e.target.value)} />
            <Button variant="outlined" disabled={!txt} onClick={() => patch({ evidenciaTexto: txt })}>Salvar</Button>
          </Box>
          <TextField size="small" label="Documento (nome)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField size="small" multiline minRows={4} label="Cole o texto do documento para conferir contra o requisito (IA)" value={doc} onChange={(e) => setDoc(e.target.value)} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Checkbox size="small" checked={aplicar} onChange={(e) => setAplicar(e.target.checked)} /><Typography variant="caption">Marcar como atendido se a conferência for positiva</Typography>
            <Box sx={{ flex: 1 }} /><Button startIcon={<SmartToyOutlinedIcon />} variant="contained" disabled={doc.trim().length < 20} onClick={conferir}>Conferir</Button>
          </Box>
          {conf && (
            <Paper variant="outlined" sx={{ p: 1.2, bgcolor: "action.hover" }}>
              <Typography variant="body2"><b>{conf.modo}</b> — {conf.atende === true ? "Atende" : conf.parcial ? "Atende parcialmente" : conf.atende === false ? "Não atende" : "Inconclusivo"}</Typography>
              <Typography variant="body2">{conf.justificativa}</Typography>
              {(conf.lacunas || []).length > 0 && <Typography variant="caption" sx={{ display: "block" }}>Lacunas: {conf.lacunas.join("; ")}</Typography>}
              {(conf.termosAusentes || []).length > 0 && <Typography variant="caption" sx={{ display: "block" }}>Termos ausentes: {conf.termosAusentes.join(", ")}</Typography>}
            </Paper>
          )}
        </Box>
      )}
    </Paper>
  );
}

function Detalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<any>(`/regulatorio/checklists/${id}`);
  const { toast, node } = useToast();
  const r = data?.resumo;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{data?.nome || "Checklist"}</DialogTitle>
      <DialogContent dividers>
        <Status loading={loading && !data} error={error} onRetry={reload} empty={!data}>
          {data && (<>
            <Box sx={{ mb: 2 }}>
              <Progress value={data.prontidao} height={14} />
              {r && <Typography variant="caption" color="text.secondary">{r.atendidos}/{r.total} atendidos · {r.obrigatoriosPendentes} obrigatório(s) pendente(s) · {r.atrasados} atrasado(s)</Typography>}
            </Box>
            {(data.itens || []).map((it: any) => <ItemRow key={it.id} it={it} toast={toast} onChanged={() => { reload(); onChanged(); }} />)}
          </>)}
        </Status>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
      {node}
    </Dialog>
  );
}

export default function ChecklistsTab() {
  const { data, loading, error, reload } = useApi<any>("/regulatorio/checklists?pageSize=100");
  const { data: modelos } = useApi<any>("/regulatorio/checklist-modelos?pageSize=100");
  const { data: procs } = useApi<any>("/regulatorio/processos?pageSize=100");
  const [sel, setSel] = useState<string | null>(null);
  const [novo, setNovo] = useState<Record<string, string> | null>(null);
  const { toast, node } = useToast();
  const items: any[] = data?.items || [];
  const mods: any[] = (Array.isArray(modelos) ? modelos : modelos?.items) || [];
  const pr: any[] = (Array.isArray(procs) ? procs : procs?.items) || [];

  async function criar() {
    try {
      const c = await eduApi.post("/regulatorio/checklists", { modeloId: novo!.modeloId, nome: novo!.nome || undefined, processoId: novo!.processoId || undefined, prazo: novo!.prazo ? toIso(novo!.prazo) : undefined });
      setNovo(null); toast({ type: "success", text: "Checklist criado." }); reload(); setSel(c.id);
    } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  async function remover(c: any) {
    if (!window.confirm(`Remover o checklist "${c.nome}" e seus itens?`)) return;
    try { await eduApi.del(`/regulatorio/checklists/${c.id}`); reload(); } catch (e: any) { toast({ type: "error", text: e.message }); }
  }
  return (
    <Section title="Checklists de prontidão" action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo({})}>Novo checklist</Button>}>
      <Status loading={loading && !data} error={error} onRetry={reload} empty={!items.length} emptyText="Nenhum checklist. Use 'Preparar modelos padrão' no Painel e crie um a partir de um modelo.">
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {items.map((c) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 2, borderRadius: 3, cursor: "pointer", "&:hover": { boxShadow: 3 } }} onClick={() => setSel(c.id)}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{c.nome}</Typography>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); remover(c); }}><DeleteOutlinedIcon fontSize="small" /></IconButton>
              </Box>
              <Typography variant="caption" color="text.secondary">{label(c.instrumento)} · prazo {fmtDate(c.prazo)}</Typography>
              <Box sx={{ mt: 1 }}><Progress value={c.prontidao} height={12} /></Box>
            </Paper>
          ))}
        </Box>
      </Status>
      {sel && <Detalhe id={sel} onClose={() => setSel(null)} onChanged={reload} />}
      <Dialog open={!!novo} onClose={() => setNovo(null)} fullWidth maxWidth="sm">
        <DialogTitle>Novo checklist</DialogTitle>
        <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
          <TextField select size="small" required label="Modelo" value={novo?.modeloId || ""} onChange={(e) => setNovo({ ...novo, modeloId: e.target.value })}>
            {mods.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Nome (opcional)" value={novo?.nome || ""} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <TextField select size="small" label="Processo vinculado (opcional)" value={novo?.processoId || ""} onChange={(e) => setNovo({ ...novo, processoId: e.target.value })}>
            <MenuItem value="">—</MenuItem>{pr.map((p) => <MenuItem key={p.id} value={p.id}>{p.titulo}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label="Prazo geral" value={novo?.prazo || ""} onChange={(e) => setNovo({ ...novo, prazo: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          {!mods.length && <Typography variant="caption" color="warning.main">Nenhum modelo disponível: rode "Preparar modelos padrão" no Painel.</Typography>}
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" disabled={!novo?.modeloId} onClick={criar}>Criar</Button></DialogActions>
      </Dialog>
      {node}
    </Section>
  );
}
