import { useCallback, useEffect, useState } from "react";
import { Alert } from "@mui/material";
import { ABSENCE_EVENT, loadAbsenceToday, type AbsenceToday } from "../services/AbsenceRecallApi";

// Alerta da recepção: contatos de retorno enviados hoje.
export default function AbsenceRecallBanner() {
  const [today, setToday] = useState<AbsenceToday | null>(null);
  const load = useCallback(async () => {
    if (!localStorage.getItem("dentalpos.token")) return;
    try { setToday(await loadAbsenceToday()); } catch { /* o alerta nunca atrapalha a agenda */ }
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener(ABSENCE_EVENT, load);
    return () => window.removeEventListener(ABSENCE_EVENT, load);
  }, [load]);
  if (!today || today.emails + today.whatsapps === 0) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      {`Hoje foram enviados ${today.emails} e-mail(s) e ${today.whatsapps} WhatsApp(s) de retorno para pacientes ausentes. Fique atento: eles podem ligar ou agendar pela agenda online.`}
      {today.names.length > 0 && ` Pacientes: ${today.names.slice(0, 8).join(", ")}${today.names.length > 8 ? " e outros" : ""}.`}
    </Alert>
  );
}
