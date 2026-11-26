import { Alert, Button } from "@mui/material";
import type { NextProcedureHint as Hint } from "../services/AppointmentApi";

// Aviso na agenda: o que ficou anotado no odontograma para a próxima consulta deste paciente.
export default function NextProcedureHint({ hint, current, onUse }: { hint: Hint | null; current: string; onUse: () => void }) {
  if (!hint) return null;
  const applied = current.trim() === hint.nextProcedure;
  return (
    <Alert severity={applied ? "success" : "info"} sx={{ alignItems: "center" }} action={applied ? undefined : <Button color="inherit" size="small" onClick={onUse}>Usar</Button>}>
      {applied ? "Procedimento puxado do odontograma: " : "Anotado no odontograma para a próxima consulta: "}
      <b>{hint.nextProcedure}</b>
      {` (${new Date(hint.createdAt).toLocaleDateString("pt-BR")}${hint.professionalName ? `, ${hint.professionalName}` : ""}${hint.teeth.length ? `, dente(s) ${hint.teeth.join(", ")}` : ""})`}
    </Alert>
  );
}
