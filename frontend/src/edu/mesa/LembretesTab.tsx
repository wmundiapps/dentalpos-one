import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useCallback, useEffect, useState } from "react";
import { eduApi } from "../../services/EduApi";
import { fmtData, msgErro } from "../reitoria/common";
import { AdiarDialog, useConfirmAcao } from "./acoes";

import { moduloLabel } from "./PendenciasTab";
interface Lembrete { id: string; titulo: string; descricao?: string | null; dueAt: string; status: string; severity: string; modulo: string; atrasado?: boolean }

function NovoLembrete({ aberto, onClose, onDone }: { aberto: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ titulo: "", descricao: "", dueAt: "", severity: "INFO" });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = async () => {
    if (f.titulo.trim().length < 2 || !f.dueAt) { setErro("Informe o título e a data."); return; }
    setBusy(true); setErro(null);
    try {
      await eduApi.post("/core/lembretes", { titulo: f.titulo.trim(), descricao: f.descricao || undefined, dueAt: new Date(`${f.dueAt}T12:00:00`).toISOString(), severity: f.severity });
      setF({ titulo: "", descricao: "", dueAt: "", severity: "INFO" }); onDone();
    } catch (e) { setErro(msgErro(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={aberto} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Novo lembrete</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {erro && <Alert severity="error">{erro}</Alert>}
        <TextField label="Título" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} fullWidth autoFocus />
        <TextField label="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} multiline minRows={2} fullWidth />
        <TextField label="Data" type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        <TextField select label="Severidade" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} fullWidth>
          <MenuItem value="INFO">Normal</MenuItem><MenuItem value="ATENCAO">Atenção</MenuItem><MenuItem value="CRITICO">Crítico</MenuItem>
        </TextField>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={salvar} disabled={busy}>Criar</Button></DialogActions>
    </Dialog>
  );
}

export default function LembretesTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Lembrete[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [adiar, setAdiar] = useState<Lembrete | null>(null);
  const { run, aviso } = useConfirmAcao();

  const carregar = useCallback(async () => {
    setErro(null);
    try { setItems((await eduApi.get<{ items: Lembrete[] }>("/core/lembretes?pageSize=100")).items || []); }
    catch (e) { setErro(msgErro(e)); setItems([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const depois = () => { carregar(); onChanged(); };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => setNovo(true)}>Novo lembrete</Button></Box>
      {erro && <Alert severity="warning" sx={{ mb: 2 }}>Não foi possível carregar os lembretes: {erro}</Alert>}
      {items === null && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress /></Box>}
      {items && !erro && items.length === 0 && <Alert severity="info">Você não tem lembretes abertos.</Alert>}
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {(items || []).map((l) => (
          <Paper key={l.id} variant="outlined" sx={{ p: 2, borderRadius: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography sx={{ fontWeight: 700 }}>{l.titulo}</Typography>
              {l.descricao && <Typography variant="body2" color="text.secondary">{l.descricao}</Typography>}
              <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                <Chip size="small" label={`Prazo ${fmtData(l.dueAt)}`} color={l.atrasado ? "error" : "default"} />
                <Chip size="small" variant="outlined" label={moduloLabel(l.modulo)} />
                {l.severity === "CRITICO" && <Chip size="small" color="error" label="Crítico" />}
                {l.status === "ADIADO" && <Chip size="small" color="warning" label="Adiado" />}
              </Box>
            </Box>
            <Button size="small" variant="contained" color="success" onClick={() => run(() => eduApi.post(`/core/lembretes/${l.id}/concluir`), "Lembrete concluído.", depois)}>Concluir</Button>
            <Button size="small" onClick={() => setAdiar(l)}>Adiar</Button>
          </Paper>
        ))}
      </Box>
      <NovoLembrete aberto={novo} onClose={() => setNovo(false)} onDone={() => { setNovo(false); depois(); }} />
      <AdiarDialog aberto={!!adiar} titulo={adiar?.titulo} onClose={() => setAdiar(null)}
        onConfirm={(dias) => run(() => eduApi.post(`/core/lembretes/${adiar!.id}/adiar`, { dias }), `Adiado em ${dias} dia(s).`, () => { setAdiar(null); depois(); })} />
      {aviso}
    </Box>
  );
}
