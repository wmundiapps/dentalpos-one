import { useEffect, useState } from "react";
import { getOperationalAlerts, subscribeOperations } from "../services/OperationsHubService";
import { OPERATIONAL_RESOLUTION_EVENT, refreshOperationalResolutions } from "../services/OperationalAlertResolutionApi";
import { Sales5787Api, type SalesProduct5787 } from "../services/Sales5787Api";
import { usePendingScope } from "./usePendingVisibility";
import { alertCategoryOf } from "../services/PendingAlertsApi";
import { pathAllowed, useMenuAccess } from "../config/menuAccess";
import type { OperationalAlert } from "../types/operationsHub";

function stockAlert5787(product: SalesProduct5787): OperationalAlert {
  const quantity = Number(product.stockQuantity || 0);
  const minimum = Number(product.minStock || 0);
  const critical = quantity <= 0 || quantity <= Math.max(1, Math.floor(minimum / 2));
  return {
    id: `inventory-server-${product.id}`,
    area: "Estoque",
    severity: critical ? "error" : "warning",
    title: critical ? "Estoque crítico" : "Material para comprar / repor",
    description: `${product.name} • saldo ${quantity} • mínimo ${minimum}.`,
    route: "/estoque",
    sourceEntityType: "SalesProduct",
    sourceEntityId: product.id,
  };
}

// Avisos operacionais da clínica (laboratório, financeiro, agenda, estoque, RH), já filtrados pelo que o usuário pode ver.
export function useCriticalAlerts() {
  const { visible, canManage } = usePendingScope();
  const menuAccess = useMenuAccess();
  const [all, setAll] = useState<OperationalAlert[]>(getOperationalAlerts);

  useEffect(() => {
    const refresh = async () => {
      const base = getOperationalAlerts();
      try {
        const stock = await Sales5787Api.criticalStock();
        setAll([...base, ...stock.map(stockAlert5787)]);
      } catch {
        setAll(base);
      }
    };
    const handler = () => { void refresh(); };
    const unsubscribe = subscribeOperations(handler);
    window.addEventListener("dentalpos:finance-changed", handler);
    window.addEventListener(OPERATIONAL_RESOLUTION_EVENT, handler);
    refreshOperationalResolutions().then(handler).catch(() => handler());
    return () => {
      unsubscribe();
      window.removeEventListener("dentalpos:finance-changed", handler);
      window.removeEventListener(OPERATIONAL_RESOLUTION_EVENT, handler);
    };
  }, []);

  // Admin e gestor veem os alertas de todos os setores. Os demais veem só os do próprio setor:
  // pelas pendências liberadas ao departamento e pelas telas que o departamento pode abrir (estoque, RH, pacientes...).
  const alerts = (canManage === true ? all : all
    .filter((a) => { if (!visible) return true; const c = alertCategoryOf(a); return c === null || visible.includes(c); })
    .filter((a) => !a.route || pathAllowed(a.route.split("?")[0], menuAccess)))
    .slice()
    .sort((a, b) => (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1));
  return { alerts, setAll };
}
