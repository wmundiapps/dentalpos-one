import { useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, TextField, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { AppointmentMarkerApi, type AppointmentMarker } from "../services/AppointmentMarkerApi";

const PRESETS = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#3949AB", "#8E24AA", "#6D4C41", "#757575"];

// Marcadores do agendamento (ex.: LABORATÓRIO FAZER vermelho / LABORATÓRIO FEITO verde): escolher, criar e remover.
export default function AgendaMarkerPicker({ appointmentId, defs, selected, onChange, onDefsChanged }: { appointmentId: string; defs: AppointmentMarker[]; selected: string[]; onChange: (ids: string[]) => void; onDefsChanged: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [manage, setManage] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESETS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async (ids: string[]) => {
    setBusy(true); setError("");
    try { await AppointmentMarkerApi.set(appointmentId, ids); onChange(ids); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o marcador."); } finally { setBusy(false); }
  };
  const toggle = (id: string) => void apply(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const create = async () => {
    setBusy(true); setError("");
    try { const m = await AppointmentMarkerApi.create(name, color); setName(""); onDefsChanged(); await apply([...selected, m.id]); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível criar o marcador."); setBusy(false); }
  };
  const remove = async (m: AppointmentMarker) => {
    if (!window.confirm(`Remover o marcador "${m.name}" de toda a agenda?`)) return;
    try { await AppointmentMarkerApi.update(m.id, { isActive: false }); onChange(selected.filter((x) => x !== m.id)); onDefsChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover."); }
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">Categoria e marcadores</Typography>
        <Button size="small" onClick={(e) => setAnchor(e.currentTarget)}>Adicionar</Button>
      </Box>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", minHeight: 28 }}>
        {selected.length === 0 && <Typography variant="caption" color="text.secondary">Nenhum marcador.</Typography>}
        {selected.map((id) => { const m = defs.find((d) => d.id === id); return m ? <Chip key={id} size="small" label={m.name} onDelete={() => toggle(id)} disabled={busy} sx={{ bgcolor: m.color, color: "#fff", fontWeight: 800, "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,.8)" } }} /> : null; })}
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setError("")}>{error}</Alert>}
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Typography variant="caption" sx={{ px: 2, fontWeight: 700 }}>Selecione um marcador</Typography>
        {defs.map((m) => (
          <MenuItem key={m.id} selected={selected.includes(m.id)} onClick={() => toggle(m.id)}>
            <Box component="span" sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: m.color, mr: 1.25, border: "1px solid rgba(0,0,0,.3)" }} />{m.name}
          </MenuItem>
        ))}
        <MenuItem onClick={() => { setAnchor(null); setManage(true); }} sx={{ color: "primary.main", fontWeight: 700 }}>+ Novo marcador / gerenciar</MenuItem>
      </Menu>
      <Dialog open={manage} onClose={() => setManage(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>Marcadores da agenda</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, pt: "12px!important" }}>
          <Typography variant="body2" color="text.secondary">Crie marcadores coloridos para acompanhar os agendamentos (ex.: LABORATÓRIO FAZER = vermelho, LABORATÓRIO FEITO = verde).</Typography>
          <TextField size="small" label="Nome do marcador" value={name} onChange={(e) => setName(e.target.value)} />
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
            {PRESETS.map((c) => <Box key={c} onClick={() => setColor(c)} sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: c, cursor: "pointer", border: color === c ? "3px solid #111" : "1px solid rgba(0,0,0,.3)" }} />)}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 32, height: 28, border: 0, background: "none" }} />
          </Box>
          <Button variant="contained" disabled={busy || name.trim().length < 2} onClick={() => void create()}>Criar e aplicar neste agendamento</Button>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography sx={{ fontWeight: 800, mt: 1 }}>Marcadores existentes</Typography>
          {defs.map((m) => (
            <Box key={m.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: m.color }} /><Typography sx={{ flex: 1 }}>{m.name}</Typography>
              <IconButton size="small" onClick={() => void remove(m)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={() => setManage(false)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
