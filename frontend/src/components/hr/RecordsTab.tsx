import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, MenuItem, TextField, Typography } from "@mui/material";
import { HrApi, fmtDate, type Employee } from "../../services/HrApi";

const today = () => new Date().toISOString().slice(0, 10);
type Kind = "vacations" | "documents" | "discipline";
// Situações em português (o sistema guarda o código em inglês).
const STATUS_PT: Record<string, string> = { PLANNED: "Programada", AVAILABLE: "Disponível", ONGOING: "Em férias", DONE: "Concluída", EXPIRED: "Vencida", ACTIVE: "Vigente", ARCHIVED: "Arquivado", APPLIED: "Aplicada", CANCELLED: "Cancelada", PENDING: "Pendente", SIGNED: "Assinado" };

export default function RecordsTab({ kind, employees }: { kind: Kind; employees: Employee[] }) {
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState("");
  const [f, setF] = useState<Record<string, string>>({ employeeId: "", date: today(), date2: today(), date3: today(), type: kind === "discipline" ? "Advertência verbal" : "Contrato CLT", text: "", status: "PLANNED", days: "1", vStart: "", vEnd: "" });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // Dias de férias: o sistema conta do início ao fim, incluindo os dois dias.
  const vacDays = f.vStart && f.vEnd && f.vEnd >= f.vStart ? Math.round((Date.parse(`${f.vEnd}T12:00:00Z`) - Date.parse(`${f.vStart}T12:00:00Z`)) / 86400000) + 1 : null;

  const load = useCallback(async () => {
    try { setRows(kind === "vacations" ? await HrApi.vacations() : kind === "documents" ? await HrApi.documents() : await HrApi.discipline()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar."); }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    try {
      if (kind === "vacations") await HrApi.addVacation({ employeeId: f.employeeId, acquisitionStart: f.date, acquisitionEnd: f.date2, concessionDeadline: f.date3, status: f.status, ...(f.vStart && f.vEnd ? { scheduledStart: f.vStart, scheduledEnd: f.vEnd } : { vacationDays: 30 }) });
      if (kind === "documents") await HrApi.addDocument({ employeeId: f.employeeId, type: f.type, title: f.text, issuedAt: f.date, expiresAt: f.date2 === f.date ? null : f.date2, status: "ACTIVE" });
      if (kind === "discipline") await HrApi.addDiscipline({ employeeId: f.employeeId, type: f.type, date: f.date, reason: f.text, daysSuspended: f.type === "Suspensão" ? Number(f.days) || 1 : null });
      setF({ ...f, text: "", vStart: "", vEnd: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };
  const remove = async (r: Record<string, any>) => {
    const what = kind === "vacations" ? "o controle de férias" : kind === "documents" ? "o documento" : "a ocorrência";
    if (!window.confirm(`Excluir ${what} de ${r.employee?.name || "este colaborador"}? Use só para anotação lançada por engano. A exclusão fica registrada na auditoria.`)) return;
    try { await HrApi.deleteRecord(kind, String(r.id)); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir."); }
  };
  const valid = Boolean(f.employeeId) && (kind === "vacations" ? (!f.vStart && !f.vEnd) || vacDays !== null : f.text.trim().length > 2);
  const title = kind === "vacations" ? "Controle de férias" : kind === "documents" ? "Contratos e documentos" : "Orientações, advertências e suspensões";

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>{title}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1.4fr 1fr 1fr 1fr 2fr auto" }, gap: 1.2, mb: 2 }}>
        <TextField select size="small" label="Colaborador" value={f.employeeId} onChange={set("employeeId")}>{employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}</TextField>
        {kind === "vacations"
          ? <TextField select size="small" label="Situação" value={f.status} onChange={set("status")}>{[["PLANNED", "Programada"], ["AVAILABLE", "Disponível"], ["ONGOING", "Em férias"], ["DONE", "Concluída"], ["EXPIRED", "Vencida"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
          : kind === "documents"
            ? <TextField size="small" label="Tipo" value={f.type} onChange={set("type")} />
            : <TextField select size="small" label="Tipo" value={f.type} onChange={set("type")}>{["Orientação", "Advertência verbal", "Advertência escrita", "Suspensão", "Justa causa"].map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField>}
        <TextField size="small" type="date" label={kind === "vacations" ? "Início aquisitivo" : kind === "documents" ? "Emissão" : "Data"} value={f.date} onChange={set("date")} slotProps={{ inputLabel: { shrink: true } }} />
        {kind !== "discipline" ? <TextField size="small" type="date" label={kind === "vacations" ? "Fim aquisitivo" : "Vencimento"} value={f.date2} onChange={set("date2")} slotProps={{ inputLabel: { shrink: true } }} /> : <TextField size="small" label="Dias (suspensão)" type="number" value={f.days} onChange={set("days")} disabled={f.type !== "Suspensão"} />}
        {kind === "vacations" ? <TextField size="small" type="date" label="Limite concessão" value={f.date3} onChange={set("date3")} slotProps={{ inputLabel: { shrink: true } }} /> : <Box />}
        {kind !== "vacations" ? <TextField size="small" label={kind === "documents" ? "Título" : "Motivo / descrição"} value={f.text} onChange={set("text")} /> : <Box />}
        <Button variant="contained" disabled={!valid} onClick={() => void save()}>Salvar</Button>
      </Box>
      {kind === "vacations" && (
        <Box sx={{ display: "flex", gap: 1.2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
          <TextField size="small" type="date" label="Início das férias" value={f.vStart} onChange={set("vStart")} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="Fim das férias" value={f.vEnd} onChange={set("vEnd")} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: f.vStart || undefined } }} error={Boolean(f.vStart && f.vEnd && f.vEnd < f.vStart)} />
          <Typography sx={{ fontWeight: 800 }} color={vacDays === null ? "text.secondary" : "primary"}>
            {vacDays !== null ? `${vacDays} dia${vacDays === 1 ? "" : "s"} de férias` : f.vStart && f.vEnd ? "O fim não pode ser antes do início" : "Informe o início e o fim: o sistema calcula os dias"}
          </Typography>
        </Box>
      )}
      {rows.length === 0 && <Typography color="text.secondary">Nada registrado.</Typography>}
      {rows.map((r) => (
        <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 3fr 2fr" }, gap: 1.5, py: 1.2, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 700 }}>{r.employee?.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {kind === "vacations" ? `${r.scheduledStart && r.scheduledEnd ? `Férias de ${fmtDate(r.scheduledStart)} a ${fmtDate(r.scheduledEnd)} (${r.vacationDays} dia${r.vacationDays === 1 ? "" : "s"}) • ` : ""}Aquisitivo ${fmtDate(r.acquisitionStart)} a ${fmtDate(r.acquisitionEnd)} • limite ${fmtDate(r.concessionDeadline)}` : kind === "documents" ? `${r.type} • ${r.title} • emissão ${fmtDate(r.issuedAt)}${r.expiresAt ? ` • vence ${fmtDate(r.expiresAt)}` : ""}` : `${r.type} • ${fmtDate(r.date)} • ${r.reason}${r.daysSuspended ? ` • ${r.daysSuspended} dia(s)` : ""}`}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: { md: "space-between" }, gap: 1 }}>
            <Typography>{STATUS_PT[String(r.status)] || r.status}</Typography>
            <Button size="small" color="error" variant="outlined" onClick={() => void remove(r)}>Excluir</Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
