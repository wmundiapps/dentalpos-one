import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from "@mui/material";
import { createBackendSchedule, deleteBackendSchedule, loadBackendSchedules, type BackendSchedule } from "../services/ScheduleApi";

const DAYS = [["Segunda-feira", 1], ["Terça-feira", 2], ["Quarta-feira", 3], ["Quinta-feira", 4], ["Sexta-feira", 5], ["Sábado", 6], ["Domingo", 0]] as const;
type Row = { on: boolean; start: string; end: string; step: number; multi: boolean };

// Dias e horários de atendimento do profissional. Com pelo menos um dia marcado, os demais dias ficam com a agenda fechada.
export default function DoctorWeekScheduleDialog({ doctor, onClose }: { doctor: { id: string; name: string } | null; onClose: () => void }) {
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [existing, setExisting] = useState<BackendSchedule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!doctor) return;
    setError("");
    loadBackendSchedules().then((all) => {
      const mine = all.filter((s) => s.doctorId === doctor.id);
      setExisting(mine);
      const next: Record<number, Row> = {};
      for (const [, dow] of DAYS) {
        const ds = mine.filter((s) => s.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime));
        next[dow] = ds.length ? { on: true, start: ds[0].startTime, end: ds[ds.length - 1].endTime, step: ds[0].slotDuration || 30, multi: ds.length > 1 } : { on: false, start: "08:00", end: "18:00", step: 30, multi: false };
      }
      setRows(next);
    }).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar."));
  }, [doctor]);

  const set = (dow: number, patch: Partial<Row>) => setRows((cur) => ({ ...cur, [dow]: { ...cur[dow], ...patch } }));
  const invalid = Object.values(rows).some((r) => r.on && !r.multi && (!r.start || !r.end || r.end <= r.start));

  const save = async () => {
    if (!doctor) return;
    setBusy(true); setError("");
    try {
      for (const [, dow] of DAYS) {
        const r = rows[dow];
        if (!r || r.multi) continue; // dias com mais de um período continuam como estão (ajuste em Agenda > configurações)
        for (const s of existing.filter((x) => x.dayOfWeek === dow)) await deleteBackendSchedule(s.id);
        if (r.on) await createBackendSchedule({ doctorId: doctor.id, dayOfWeek: dow, startTime: r.start, endTime: r.end, slotDuration: r.step });
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={Boolean(doctor)} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Dias e horários de atendimento — {doctor?.name}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Marque os dias em que o profissional atende. Nos dias não marcados a agenda dele fica fechada. Se nenhum dia for marcado, a agenda segue o horário padrão da clínica.</Typography>
        {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
        {DAYS.map(([label, dow]) => {
          const r = rows[dow];
          if (!r) return null;
          return (
            <Box key={dow} sx={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr", gap: 1.5, alignItems: "center", py: 0.6 }}>
              <FormControlLabel control={<Checkbox checked={r.on} onChange={(e) => set(dow, { on: e.target.checked })} />} label={label} />
              {r.multi ? <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "2 / 4" }}>Mais de um período neste dia — ajuste em Agenda &gt; configurações.</Typography> : (<>
                <TextField size="small" type="time" label="Início" value={r.start} disabled={!r.on} onChange={(e) => set(dow, { start: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label="Fim" value={r.end} disabled={!r.on} onChange={(e) => set(dow, { end: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} error={r.on && r.end <= r.start} />
              </>)}
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={busy || invalid} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</Button>
      </DialogActions>
    </Dialog>
  );
}
