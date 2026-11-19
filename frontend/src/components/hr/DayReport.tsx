import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import { HrApi, type DayReportData, type DayReportRow, type DayStatus, type Workplace } from "../../services/HrApi";

const todayISO = () => new Date().toLocaleDateString("sv-SE");
const dmy = (d: string) => d.split("-").reverse().join("/");
const weekday = (d: string) => { const w = new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" }); return w.charAt(0).toUpperCase() + w.slice(1); };
const ORDER: Record<DayStatus, number> = { NAO_BATEU: 0, NA_TOLERANCIA: 1, AINDA_NAO: 2, BATEU: 3, JUSTIFICADO: 4, SEM_EXPEDIENTE: 5, FUTURO: 6 };
const LABEL: Record<DayStatus, string> = { BATEU: "Bateu", NAO_BATEU: "NÃO BATEU", AINDA_NAO: "Ainda não deu a hora", NA_TOLERANCIA: "Na tolerância", JUSTIFICADO: "Justificado", SEM_EXPEDIENTE: "Sem expediente", FUTURO: "Dia futuro" };
const COLOR: Record<DayStatus, "success" | "error" | "warning" | "info" | "default"> = { BATEU: "success", NAO_BATEU: "error", AINDA_NAO: "warning", NA_TOLERANCIA: "warning", JUSTIFICADO: "info", SEM_EXPEDIENTE: "default", FUTURO: "default" };
const SHORT: Record<string, string> = { ENTRADA: "Entrada", SAIDA_ALMOCO: "Saiu p/ almoço", VOLTA_ALMOCO: "Voltou do almoço", SAIDA: "Saída" };

// Conferência diária do RH: quem bateu o ponto, quem não bateu e quem está justificado, por polo.
export default function DayReport() {
  const [date, setDate] = useState(todayISO());
  const [polo, setPolo] = useState("");
  const [polos, setPolos] = useState<Workplace[]>([]);
  const [data, setData] = useState<DayReportData | null>(null);
  const [error, setError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => { HrApi.workplaces().then(setPolos).catch(() => setPolos([])); }, []);
  const load = useCallback(async () => {
    try { setData(await HrApi.dayReport(date, polo || undefined)); setError(""); setUpdatedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar a conferência do dia."); }
  }, [date, polo]);
  useEffect(() => { void load(); }, [load]);
  // Hoje atualiza sozinho a cada minuto, para o RH acompanhar durante o dia.
  useEffect(() => { if (date !== todayISO()) return; const t = window.setInterval(() => void load(), 60000); return () => window.clearInterval(t); }, [date, load]);

  const rows = useMemo(() => {
    const list = [...(data?.rows || [])].sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (Number(b.open) - Number(a.open)) || a.name.localeCompare(b.name));
    return onlyMissing ? list.filter((r) => r.status === "NAO_BATEU" || r.open) : list;
  }, [data, onlyMissing]);

  const print = () => {
    if (!data) return;
    const esc = (t: string) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const poloName = polo === "CLINICA" ? "Clínica" : polos.find((p) => p.id === polo)?.name || "Todos os polos";
    const body = rows.map((r) => `<tr><td><b>${esc(r.name)}</b><br><small>${esc(r.position || "")}</small></td><td>${esc(r.workplace)}</td><td>${esc(r.workStart)}</td><td>${esc(r.punches.map((p) => `${p.time} ${SHORT[p.kind] || p.label}${p.inside === false ? " (fora do local)" : ""}`).join(" · ") || "—")}</td><td><b>${esc(LABEL[r.status])}</b>${r.open ? "<br><small>saída sem registro</small>" : ""}${r.detail ? `<br><small>${esc(r.detail)}</small>` : ""}</td></tr>`).join("");
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) { window.alert("Libere as janelas pop-up do navegador para imprimir."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Conferência do ponto ${dmy(date)}</title><style>body{font-family:Arial,sans-serif;margin:20px;color:#111}h1{font-size:18px;margin:0}p{font-size:12px;margin:4px 0 10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:5px 7px;font-size:12px;text-align:left;vertical-align:top}th{background:#eee}@media print{.np{display:none}}</style></head><body><div class="np"><button onclick="window.print()">Imprimir</button></div><h1>Conferência do ponto — ${esc(weekday(date))}, ${dmy(date)}</h1><p>${esc(poloName)} • Bateram: ${data.totals.bateu} • Não bateram: ${data.totals.naoBateu} • Justificados: ${data.totals.justificado} • Emitido em ${new Date().toLocaleString("pt-BR")}</p><table><thead><tr><th>Colaborador</th><th>Local</th><th>Entrada prevista</th><th>Batidas</th><th>Situação</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
    w.document.close();
  };

  const t = data?.totals;
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>Conferência do dia</Typography>
        <TextField type="date" size="small" label="Dia" value={date} onChange={(e) => setDate(e.target.value || todayISO())} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label="Local" value={polo} onChange={(e) => setPolo(e.target.value)} sx={{ minWidth: 240 }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
          <MenuItem value="">Todos os polos e a clínica</MenuItem>
          <MenuItem value="CLINICA">Clínica (sem polo)</MenuItem>
          {polos.filter((p) => p.isActive !== false).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />} label="Só quem não bateu" />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" onClick={() => void load()}>Atualizar{updatedAt ? ` (${updatedAt})` : ""}</Button>
        <Button size="small" variant="contained" disabled={!data} onClick={print}>Imprimir</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {t && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
          <Chip color="success" label={`Bateram: ${t.bateu}`} />
          <Chip color={t.naoBateu ? "error" : "default"} label={`NÃO bateram: ${t.naoBateu}`} sx={{ fontWeight: 900 }} />
          {t.incompletas > 0 && <Chip color="warning" label={`Saída sem registro: ${t.incompletas}`} />}
          {t.ainda > 0 && <Chip color="warning" variant="outlined" label={`Ainda sem batida (no horário/tolerância): ${t.ainda}`} />}
          <Chip color="info" variant="outlined" label={`Justificados: ${t.justificado}`} />
          {t.semExpediente > 0 && <Chip variant="outlined" label={`Sem expediente: ${t.semExpediente}`} />}
        </Box>
      )}
      {data && !data.expectedDay && <Alert severity="info" sx={{ mb: 1 }}>{weekday(date)} não tem expediente nas regras do ponto. Quem bateu mesmo assim aparece abaixo.</Alert>}
      {data && rows.length === 0 && <Typography color="text.secondary">{onlyMissing ? "Todos bateram o ponto. 🎉" : "Nenhum colaborador neste dia e local."}</Typography>}
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: 720 }}>
          {rows.map((r: DayReportRow) => (
            <Box key={r.employeeId} sx={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.8fr 2.6fr 1.4fr", gap: 1, py: 0.9, borderTop: 1, borderColor: "divider", alignItems: "center", bgcolor: r.status === "NAO_BATEU" ? "rgba(211,47,47,.06)" : undefined }}>
              <Box><Typography sx={{ fontWeight: 700 }}>{r.name}</Typography><Typography variant="caption" color="text.secondary">{r.position}</Typography></Box>
              <Typography variant="body2">{r.workplace}</Typography>
              <Typography variant="body2" color="text.secondary">{r.workStart}</Typography>
              <Typography variant="body2">{r.punches.length ? r.punches.map((p, i) => <span key={i} style={{ marginRight: 10, color: p.inside === false ? "#c62828" : undefined }}>{p.time} {SHORT[p.kind] || p.label}{p.inside === false ? " (fora do local)" : ""}</span>) : "—"}</Typography>
              <Box>
                <Chip size="small" color={COLOR[r.status]} label={LABEL[r.status]} variant={r.status === "NAO_BATEU" ? "filled" : "outlined"} />
                {r.open && <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>saída sem registro</Typography>}
                {r.detail && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{r.detail}</Typography>}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
