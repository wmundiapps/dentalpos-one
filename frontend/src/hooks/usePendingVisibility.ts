import { useEffect, useState } from "react";
import { alertCategoryOf, loadPendingAlerts } from "../services/PendingAlertsApi";

// Quem pode ver o quê: admin e gestor (canManage) veem tudo; cada setor vê só o que é do seu departamento.
// Enquanto carrega, ou se a consulta falhar, nada é escondido (o aviso nunca atrapalha o uso).
export function usePendingScope() {
  const [scope, setScope] = useState<{ visible: string[] | null; canManage: boolean | null }>({ visible: null, canManage: null });
  useEffect(() => {
    if (!localStorage.getItem("dentalpos.token")) return;
    loadPendingAlerts().then((d) => setScope({ visible: d.visibleKeys || null, canManage: Boolean(d.canManage) })).catch(() => undefined);
  }, []);
  return scope;
}

export function usePendingVisibility() {
  const { visible } = usePendingScope();
  return <T extends { id: string; area: string }>(alerts: T[]) =>
    visible ? alerts.filter((a) => { const c = alertCategoryOf(a); return c === null || visible.includes(c); }) : alerts;
}
