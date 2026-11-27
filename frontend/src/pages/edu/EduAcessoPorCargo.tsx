import { Alert } from "@mui/material";
import EduShell from "../../edu/EduShell";
import MatrizAcesso from "../../edu/acesso/MatrizAcesso";
import { readSessionUser } from "../../services/DemoAccess";

// Configurações > Acesso por cargo (deep link /edu/acesso-por-cargo). Somente administrador/proprietário.
export default function EduAcessoPorCargo() {
  const role = String(readSessionUser()?.role || "").toUpperCase();
  const permitido = role === "ADMIN" || role === "OWNER";
  return (
    <EduShell title="Acesso por cargo" subtitle="Defina quais módulos cada cargo pode abrir. Cargos de gestão superior nunca são bloqueados.">
      {permitido ? <MatrizAcesso /> : <Alert severity="warning">Somente o administrador ou o proprietário da instituição pode configurar o acesso por cargo.</Alert>}
    </EduShell>
  );
}
