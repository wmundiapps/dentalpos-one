import { useCallback, useState } from "react";
import { MenuItem, Paper, TextField, Typography } from "@mui/material";
import ImportWizard from "./ImportWizard";
import { normalize, type Grid } from "../pages/ImportPatients";

const TARGETS: Array<[string, string]> = [
  ["patientName", "Paciente"], ["patientPhone", "Telefone do paciente"], ["dentist", "Dentista / profissional"], ["date", "Data da consulta"],
  ["start", "Hora de início"], ["end", "Hora de término"], ["procedure", "Procedimento"], ["notes", "Observações"], ["status", "Situação (atendido, faltou...)"],
];
const ALIASES: Record<string, string[]> = {
  patientName: ["paciente", "nome do paciente", "patientname", "nome"],
  patientPhone: ["telefone", "celular", "mobilephone", "whatsapp"],
  dentist: ["dentista", "profissional", "dentistname", "medico"],
  date: ["data", "date", "dia", "data da consulta"],
  start: ["hora", "horario", "fromtime", "inicio", "hora inicial", "hora de inicio"],
  end: ["totime", "fim", "hora final", "hora de termino", "termino"],
  procedure: ["procedimento", "procedimentos", "procedures", "servico"],
  notes: ["observacao", "observacoes", "notes", "obs"],
  status: ["status", "situacao"],
};
// Colunas de "apagado/cancelado" (X) das exportações do Clinicorp: essas linhas não entram.
const FLAG_COLUMNS = ["deleted", "canceled", "cancelled", "cancelado", "apagado"];

export default function ImportAppointments() {
  const [past, setPast] = useState<"COMPLETED" | "SKIP">("COMPLETED");
  const buildRows = useCallback((grid: Grid, mapping: Record<number, string>) => {
    const flags = grid.headers.map((h, i) => (FLAG_COLUMNS.includes(normalize(h)) ? i : -1)).filter((i) => i >= 0);
    return grid.rows
      .filter((cells) => !flags.some((i) => (cells[i] || "").trim().toUpperCase() === "X"))
      .map((cells) => {
        const out: Record<string, string> = {};
        grid.headers.forEach((_, i) => { const t = mapping[i]; const v = (cells[i] || "").trim(); if (t && v && !out[t]) out[t] = v; });
        return out;
      })
      .filter((r) => r.patientName || r.date);
  }, []);
  return (
    <ImportWizard
      kind="appointments"
      unit="consulta"
      title="Planilha da agenda"
      help="Envie a exportação da agenda do outro sistema (.xlsx ou .csv). Importe os pacientes antes e cadastre os dentistas na Equipe: cada consulta precisa de um paciente e um dentista já cadastrados. Consultas canceladas ou apagadas não entram, e consultas que já existem (mesmo paciente e horário) são ignoradas, então é seguro reenviar o arquivo. Nenhum lembrete é enviado ao paciente."
      targets={TARGETS}
      aliases={ALIASES}
      required={["patientName", "dentist", "date", "start"]}
      buildRows={buildRows}
      options={{ pastWithoutStatus: past }}
      optionsPanel={
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
          <Typography sx={{ fontWeight: 900, mb: 1 }}>Consultas de datas passadas sem situação informada</Typography>
          <TextField select size="small" value={past} onChange={(e) => setPast(e.target.value as "COMPLETED" | "SKIP")} sx={{ minWidth: 280 }}>
            <MenuItem value="COMPLETED">Entram como atendidas</MenuItem>
            <MenuItem value="SKIP">Não importar</MenuItem>
          </TextField>
        </Paper>
      }
    />
  );
}
