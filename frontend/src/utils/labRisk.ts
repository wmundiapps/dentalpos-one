// Nível de risco de uma ordem do laboratório conforme a data de entrega se aproxima (mesma régua dos avisos por mensagem).
export type LabRiskKey = "ENTREGUE" | "SEM_PRAZO" | "NO_PRAZO" | "ATENCAO" | "ALTO" | "HOJE" | "ATRASADO";

export interface LabRisk { key: LabRiskKey; label: string; color: "default" | "success" | "warning" | "error" | "info"; days: number | null }

const DELIVERED = ["Entregue", "Liberado"];

export function daysTo(iso?: string): number | null {
  if (!iso) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - today.getTime()) / 86400000);
}

export function labRisk(status: string, dueDateISO?: string, patientReturnDateISO?: string): LabRisk {
  if (DELIVERED.includes(status)) return { key: "ENTREGUE", label: "Entregue", color: "default", days: null };
  const due = daysTo(dueDateISO);
  const ret = daysTo(patientReturnDateISO);
  // O que vencer primeiro (entrega do laboratório ou retorno do paciente) define o risco.
  const days = due === null ? ret : ret === null ? due : Math.min(due, ret);
  if (days === null) return { key: "SEM_PRAZO", label: "Sem prazo", color: "default", days };
  if (days < 0) return { key: "ATRASADO", label: `Atrasado há ${-days} dia(s)`, color: "error", days };
  if (days === 0) return { key: "HOJE", label: "Entrega hoje", color: "warning", days };
  if (days === 1) return { key: "ALTO", label: "Risco alto: amanhã", color: "warning", days };
  if (days <= 3) return { key: "ATENCAO", label: `Atenção: faltam ${days} dias`, color: "info", days };
  return { key: "NO_PRAZO", label: `No prazo: faltam ${days} dias`, color: "success", days };
}
