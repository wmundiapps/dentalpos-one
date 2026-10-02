import { useEffect, useState } from "react";
import { alertCategoryOf, loadPendingAlerts } from "../services/PendingAlertsApi";

// Filtra avisos locais (agenda, financeiro, laboratório) conforme o que o departamento do usuário pode ver.
// Enquanto carrega, ou se a consulta falhar, nada é escondido (o aviso nunca atrapalha o uso).
export function usePendingVisibility() {
  const [visible, setVisible] = useState<string[] | null>(null);
  useEffect(() => {
    if (!localStorage.getItem("dentalpos.token")) return;
    loadPendingAlerts().then((d) => setVisible(d.visibleKeys || null)).catch(() => undefined);
  }, []);
  return <T extends { id: string; area: string }>(alerts: T[]) =>
    visible ? alerts.filter((a) => { const c = alertCategoryOf(a); return c === null || visible.includes(c); }) : alerts;
}
