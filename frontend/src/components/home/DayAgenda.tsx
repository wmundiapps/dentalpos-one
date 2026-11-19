import { useState } from "react";
import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { loadBackendPatients } from "../../services/PatientApi";
import type { IntegratedAppointment, IntegratedLaboratoryWork } from "../../types/operationsHub";

export type FinanceRow = { type: "Receita" | "Despesa"; status: string; personName: string; value: number; dueISO?: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Date().toISOString().slice(0, 10);

let patientsPromise: ReturnType<typeof loadBackendPatients> | null = null;
async function patientIdFor(a: IntegratedAppointment): Promise<string | null> {
  if (a.patientId) return a.patientId;
  patientsPromise ||= loadBackendPatients();
  try {
    const list = await patientsPromise;
    return list.find((p) => norm(p.fullName) === norm(a.patientName))?.id || null;
  } catch { patientsPromise = null; return null; }
}

function financeOf(a: IntegratedAppointment, rows: FinanceRow[]) {
  const mine = rows.filter((r) => r.type === "Receita" && !["Pago", "Cancelado"].includes(r.status) && norm(r.personName) === norm(a.patientName));
  const overdue = mine.filter((r) => (r.dueISO || "9999") < today());
  if (overdue.length) return { label: `Vencido ${brl(overdue.reduce((s, r) => s + r.value, 0))}`, color: "error" as const };
  if (mine.length) return { label: `A receber ${brl(mine.reduce((s, r) => s + r.value, 0))}`, color: "warning" as const };
  return { label: "Financeiro em dia", color: "success" as const };
}

function labOf(a: IntegratedAppointment, works: IntegratedLaboratoryWork[]) {
  const mine = works.filter((w) => !["Entregue", "Liberado"].includes(w.status) && (norm(w.patientName) === norm(a.patientName) || (a.laboratoryWorkId != null && w.id === a.laboratoryWorkId)));
  if (!mine.length) return null;
  const late = mine.some((w) => w.dueDateISO && w.dueDateISO < today());
  return { label: `Laboratório: ${mine[0].workType}${mine.length > 1 ? ` (+${mine.length - 1})` : ""}${late ? " • atrasado" : ""}`, color: late ? ("error" as const) : ("warning" as const) };
}

interface Props { appointments: IntegratedAppointment[]; finance: FinanceRow[]; works: IntegratedLaboratoryWork[] }

// Agenda do dia só com o nome do paciente. Ao tocar no nome, abre o procedimento, o financeiro, o laboratório e os atalhos da ficha.
export default function DayAgenda({ appointments, finance, works }: Props) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const goto = async (a: IntegratedAppointment, aba: string) => {
    setBusy(true);
    const id = await patientIdFor(a);
    setBusy(false);
    navigate(id ? `/ficha-paciente?patientId=${encodeURIComponent(id)}${aba ? `&aba=${aba}` : ""}` : `/pacientes?busca=${encodeURIComponent(a.patientName)}`);
  };

  if (!appointments.length) return <Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma consulta neste dia.</Typography>;
  const shortcuts: Array<[string, string]> = [["Financeiro", "cobranca"], ["Prontuário", "prontuario"], ["Laboratório", "laboratorio"], ["Dados cadastrais", "dados"], ["Fotos", "fotos"], ["Ficha completa", ""]];

  return (
    <Box sx={{ display: "grid", gap: 0.8 }}>
      {appointments.map((a) => {
        const open = openId === a.id;
        const fin = financeOf(a, finance);
        const lab = labOf(a, works);
        return (
          <Paper key={a.id} variant="outlined" sx={{ borderRadius: 2.5, overflow: "hidden", borderColor: open ? "primary.main" : "divider" }}>
            <Box role="button" tabIndex={0} onClick={() => setOpenId(open ? null : a.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(open ? null : a.id); } }}
              sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700, minWidth: 44 }}>{a.time}</Typography>
              <Typography sx={{ fontWeight: 800, flex: 1, overflowWrap: "anywhere", textAlign: "left" }}>{a.patientName}</Typography>
              {(fin.color !== "success" || lab) && <Box sx={{ display: "flex", gap: 0.5 }}>
                {fin.color !== "success" && <Box title={fin.label} sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: `${fin.color}.main` }} />}
                {lab && <Box title={lab.label} sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: `${lab.color}.main` }} />}
              </Box>}
            </Box>
            {open && (
              <Box sx={{ px: 1.5, pb: 1.5, display: "grid", gap: 1.2, borderTop: "1px solid", borderColor: "divider", pt: 1.2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Procedimento</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2 }}>{a.procedure}</Typography>
                  <Typography variant="body2" color="text.secondary">{[a.professionalName, a.room, a.status].filter(Boolean).join(" • ")}</Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.8, flexWrap: "wrap" }}>
                  <Chip size="small" color={fin.color} label={fin.label} />
                  {lab ? <Chip size="small" color={lab.color} label={lab.label} /> : <Chip size="small" variant="outlined" label="Sem trabalho pendente no laboratório" />}
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 0.8 }}>
                  {shortcuts.map(([label, aba]) => <Button key={label} size="small" variant={label === "Ficha completa" ? "contained" : "outlined"} disabled={busy} onClick={() => void goto(a, aba)}>{label}</Button>)}
                </Box>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}
