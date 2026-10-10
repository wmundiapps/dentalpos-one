import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from "@mui/material";
import { HrApi, STATUS_LABEL, fmtDate, fmtMin, type Employee, type TimeSettings } from "../../services/HrApi";

type Sheet = Awaited<ReturnType<typeof HrApi.timesheet>>;
type Detail = Awaited<ReturnType<typeof HrApi.employeeMonth>>;
const COLOR: Record<string, "default" | "success" | "warning" | "error" | "info"> = { OK: "success", ATRASO: "warning", FALTA: "error", ABONADA: "info", INCOMPLETO: "warning" };
const months = () => Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });

export default function TimesheetTab({ employees, canEdit }: { employees: Employee[]; canEdit: boolean }) {
  const [ref, setRef] = useState(new Date().toISOString().slice(0, 7));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [settings, setSettings] = useState<(Omit<TimeSettings, "allowedIps"> & { allowedIps: string }) | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState({ employeeId: "", date: new Date().toISOString().slice(0, 10), status: "Presente", clockIn: "08:00", clockOut: "18:00", observation: "" });

  const load = useCallback(async () => {
    try { setSheet(await HrApi.timesheet(ref)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o ponto."); }
  }, [ref]);
  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: string) => { try { setDetail(await HrApi.employeeMonth(id, ref)); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } };
  const openSettings = async () => { try { const s = await HrApi.settings(); setSettings({ ...s, allowedIps: s.allowedIps.join(", ") }); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } };
  const saveSettings = async () => {
    if (!settings) return;
    try { await HrApi.saveSettings({ ...settings, allowedIps: settings.allowedIps }); setSettings(null); setNotice("Regras do ponto salvas."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };
  const addManual = async () => {
    if (!manual.employeeId) return;
    try { await HrApi.addAttendance(manual); setNotice("Lançamento manual registrado."); setManual({ ...manual, observation: "" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível lançar."); }
  };

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label="Mês" value={ref} onChange={(e) => setRef(e.target.value)} sx={{ minWidth: 150 }}>{months().map((m) => <MenuItem key={m} value={m}>{m.split("-").reverse().join("/")}</MenuItem>)}</TextField>
        <Box sx={{ flex: 1 }} />
        {canEdit && <Button variant="outlined" onClick={() => void openSettings()}>Regras do ponto (jornada, IP, local)</Button>}
      </Box>
      <Alert severity="info" sx={{ mb: 2 }}>O colaborador bate o ponto em <b>Meu ponto</b>, com senha, IP e localização. O quadro abaixo soma horas, faltas, atrasos e banco de horas de cada um. Clique no nome para ver os dias e os registros.</Alert>
      {sheet && sheet.employees.length === 0 && <Typography color="text.secondary">Cadastre colaboradores na aba Colaboradores.</Typography>}
      {sheet && sheet.employees.length > 0 && (
        <Box sx={{ overflowX: "auto" }}>
          <Box sx={{ minWidth: 760 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "2fr repeat(6,1fr)", gap: 1, py: 1, fontWeight: 800 }}>
              {["Colaborador", "Trabalhadas", "Esperadas", "Banco de horas", "Horas extras", "Faltas", "Atrasos"].map((h) => <Typography key={h} variant="caption" sx={{ fontWeight: 800 }}>{h}</Typography>)}
            </Box>
            {sheet.employees.map((r) => (
              <Box key={r.employeeId} onClick={() => void openDetail(r.employeeId)} sx={{ display: "grid", gridTemplateColumns: "2fr repeat(6,1fr)", gap: 1, py: 1.1, borderTop: "1px solid", borderColor: "divider", cursor: "pointer", alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}>
                <Box><Typography sx={{ fontWeight: 700 }}>{r.name}</Typography><Typography variant="caption" color={r.email ? "text.secondary" : "error.main"}>{r.email ? r.position : "Sem e-mail de login"}</Typography></Box>
                <Typography variant="body2">{fmtMin(r.totals.workedMin)}</Typography>
                <Typography variant="body2">{fmtMin(r.totals.expectedMin)}</Typography>
                <Typography variant="body2" color={r.totals.balanceMin < 0 ? "error.main" : "text.primary"}>{fmtMin(r.totals.balanceMin)}</Typography>
                <Typography variant="body2">{fmtMin(r.totals.overtimeMin)}</Typography>
                <Typography variant="body2" color={r.totals.faltas ? "error.main" : "text.primary"}>{r.totals.faltas}</Typography>
                <Typography variant="body2" color={r.totals.atrasos ? "warning.main" : "text.primary"}>{r.totals.atrasos}{r.totals.lateMin ? ` (${r.totals.lateMin} min)` : ""}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {canEdit && (
        <Box sx={{ mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 800, mb: 1 }}>Lançamento manual (ajuste do RH)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Use para corrigir batida esquecida, registrar folga, férias ou atestado. Fica registrado.</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr 1fr 1fr 2fr auto" }, gap: 1.2 }}>
            <TextField select size="small" label="Colaborador" value={manual.employeeId} onChange={(e) => setManual({ ...manual, employeeId: e.target.value })}>{employees.filter((e) => e.status !== "TERMINATED").map((e) => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}</TextField>
            <TextField size="small" type="date" label="Data" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select size="small" label="Situação" value={manual.status} onChange={(e) => setManual({ ...manual, status: e.target.value })}>{["Presente", "Falta", "Atestado", "Falta abonada", "Folga", "Férias", "Home office"].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>
            <TextField size="small" label="Entrada" value={manual.clockIn} onChange={(e) => setManual({ ...manual, clockIn: e.target.value })} />
            <TextField size="small" label="Saída" value={manual.clockOut} onChange={(e) => setManual({ ...manual, clockOut: e.target.value })} />
            <TextField size="small" label="Observação" value={manual.observation} onChange={(e) => setManual({ ...manual, observation: e.target.value })} />
            <Button variant="contained" disabled={!manual.employeeId} onClick={() => void addManual()}>Lançar</Button>
          </Box>
        </Box>
      )}

      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>{detail?.employee.name} — {ref.split("-").reverse().join("/")}</DialogTitle>
        <DialogContent>
          {detail && (<>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Chip label={`Trabalhadas ${fmtMin(detail.totals.workedMin)}`} /><Chip label={`Banco ${fmtMin(detail.totals.balanceMin)}`} color={detail.totals.balanceMin < 0 ? "error" : "default"} />
              <Chip label={`Faltas ${detail.totals.faltas}`} color={detail.totals.faltas ? "error" : "default"} /><Chip label={`Atrasos ${detail.totals.atrasos}`} color={detail.totals.atrasos ? "warning" : "default"} />
              {detail.totals.incompletos > 0 && <Chip label={`Batidas incompletas ${detail.totals.incompletos}`} color="warning" />}
            </Box>
            {detail.days.map((d) => (
              <Box key={d.date} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "100px 130px 1fr 80px 80px" }, gap: 1, py: 0.8, borderTop: "1px solid", borderColor: "divider", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 700 }}>{fmtDate(d.date)}</Typography>
                <Chip size="small" color={COLOR[d.status] || "default"} label={STATUS_LABEL[d.status] || d.status} sx={{ width: "fit-content" }} />
                <Typography variant="body2" color="text.secondary">{d.punches.map((p) => `${p.time}${p.inside === false ? " (fora do local)" : ""}`).join(" · ") || d.note || "—"}</Typography>
                <Typography variant="body2">{fmtMin(d.workedMin)}</Typography>
                <Typography variant="body2" color={d.diffMin < 0 ? "error.main" : "text.secondary"}>{d.expectedMin ? fmtMin(d.diffMin) : ""}</Typography>
              </Box>
            ))}
            {detail.audit.length > 0 && (<>
              <Typography sx={{ fontWeight: 800, mt: 2, mb: 0.5 }}>Registros de batida (IP e local)</Typography>
              {detail.audit.map((a, i) => <Typography key={i} variant="caption" sx={{ display: "block" }}>{`${fmtDate(a.date)} ${a.time} • ${a.kind} • IP ${a.ip || "—"}${a.note ? ` • ${a.note}` : ""}${a.inside === false ? " • FORA DO LOCAL" : ""}`}</Typography>)}
            </>)}
          </>)}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetail(null)}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(settings)} onClose={() => setSettings(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Regras do ponto eletrônico</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {settings && (<>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField label="Horas por dia útil" type="number" value={settings.dailyHours} onChange={(e) => setSettings({ ...settings, dailyHours: Number(e.target.value) })} />
              <TextField label="Horas no sábado" type="number" value={settings.saturdayHours} onChange={(e) => setSettings({ ...settings, saturdayHours: Number(e.target.value) })} />
              <TextField label="Horário de entrada" value={settings.startTime} onChange={(e) => setSettings({ ...settings, startTime: e.target.value })} helperText="HH:MM" />
              <TextField label="Tolerância de atraso (min)" type="number" value={settings.toleranceMinutes} onChange={(e) => setSettings({ ...settings, toleranceMinutes: Number(e.target.value) })} />
            </Box>
            <TextField label="IPs autorizados (internet da clínica)" value={settings.allowedIps} onChange={(e) => setSettings({ ...settings, allowedIps: e.target.value })} helperText="Separe por vírgula. Deixe vazio para não conferir o IP." />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
              <TextField label="Latitude da clínica" type="number" value={settings.latitude ?? ""} onChange={(e) => setSettings({ ...settings, latitude: e.target.value === "" ? null : Number(e.target.value) })} />
              <TextField label="Longitude da clínica" type="number" value={settings.longitude ?? ""} onChange={(e) => setSettings({ ...settings, longitude: e.target.value === "" ? null : Number(e.target.value) })} />
              <TextField label="Raio (metros)" type="number" value={settings.radiusMeters} onChange={(e) => setSettings({ ...settings, radiusMeters: Number(e.target.value) })} />
            </Box>
            <FormControlLabel control={<Checkbox checked={settings.requireLocation} onChange={(_, v) => setSettings({ ...settings, requireLocation: v })} />} label="Exigir localização ativada para bater o ponto" />
            <FormControlLabel control={<Checkbox checked={settings.blockOutside} onChange={(_, v) => setSettings({ ...settings, blockOutside: v })} />} label="Bloquear ponto fora do local (se desmarcado, só avisa o RH)" />
            <TextField label="Prêmio de assiduidade (R$)" type="number" value={settings.assiduityBonus} onChange={(e) => setSettings({ ...settings, assiduityBonus: Number(e.target.value) })} helperText="Sugerido na folha para quem não teve falta nem atraso no mês. Deixe 0 para não sugerir." />
          </>)}
        </DialogContent>
        <DialogActions><Button onClick={() => setSettings(null)}>Cancelar</Button><Button variant="contained" onClick={() => void saveSettings()}>Salvar regras</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
