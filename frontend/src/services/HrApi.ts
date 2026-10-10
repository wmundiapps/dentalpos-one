const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

async function req<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const response = await fetch(`${API}${path}`, { ...rest, headers: { ...headers(json !== undefined), ...(rest.headers || {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Erro ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface Employee {
  id: string; employeeCode: string; name: string; category: string; department: string; position: string; employmentModel: string; status: string;
  admissionDate: string; experienceEndDate?: string | null; baseSalary: number | string; monthlyWorkload: number; supervisor?: string | null;
  email?: string | null; phone?: string | null; cpf?: string | null; pixKey?: string | null; notes?: string | null;
}
export interface Totals { workedMin: number; expectedMin: number; balanceMin: number; overtimeMin: number; faltas: number; atrasos: number; lateMin: number; incompletos: number; abonadas: number }
export interface DayRow { date: string; status: string; punches: Array<{ kind: string; time: string; inside: boolean | null }>; workedMin: number; expectedMin: number; diffMin: number; lateMin: number; note?: string }
export interface TimeSettings {
  dailyHours: number; saturdayHours: number; startTime: string; toleranceMinutes: number; requireLocation: boolean; blockOutside: boolean;
  allowedIps: string[]; latitude: number | null; longitude: number | null; radiusMeters: number; assiduityBonus: number;
}
export interface AbsenceRequest {
  id: string; employeeId: string; employeeName?: string; absenceDate: string; type: string; reason: string; status: string;
  decisionNote?: string | null; decidedAt?: string | null; createdAt: string; attachmentCount: number;
  attachments?: Array<{ name: string; mime: string; dataUrl: string }>;
}
export interface Suggestion { key: string; employeeId: string; employeeName: string; type: "Provento" | "Desconto"; description: string; value: number }

export const HrApi = {
  employees: () => req<Employee[]>("/hr/employees"),
  saveEmployee: (id: string | null, body: Record<string, unknown>) => id ? req<Employee>(`/hr/employees/${id}`, { method: "PUT", json: body }) : req<Employee>("/hr/employees", { method: "POST", json: body }),
  timesheet: (ref: string) => req<{ ref: string; settings: TimeSettings; employees: Array<{ employeeId: string; name: string; position: string; department: string; email: string | null; totals: Totals }> }>(`/hr/timesheet?ref=${ref}`),
  employeeMonth: (id: string, ref: string) => req<{ ref: string; employee: { id: string; name: string; position: string }; days: DayRow[]; totals: Totals; audit: Array<{ date: string; time: string; kind: string; ip: string | null; inside: boolean | null; note: string | null }> }>(`/hr/timesheet/${id}?ref=${ref}`),
  settings: () => req<TimeSettings>("/hr/timeclock/settings"),
  saveSettings: (b: Omit<Partial<TimeSettings>, "allowedIps"> & { allowedIps?: string[] | string }) => req<TimeSettings>("/hr/timeclock/settings", { method: "PUT", json: b }),
  suggestions: (ref: string) => req<Suggestion[]>(`/hr/payroll-suggestions?ref=${ref}`),
  payrollEntries: (reference?: string) => req<Array<{ id: string; reference: string; type: string; description: string; value: number | string; employee?: { name: string } }>>(`/hr/payroll-entries${reference ? `?reference=${encodeURIComponent(reference)}` : ""}`),
  addPayroll: (b: Record<string, unknown>) => req("/hr/payroll-entries", { method: "POST", json: b }),
  closePayroll: (b: Record<string, unknown>) => req("/hr/payroll-close", { method: "POST", json: b }),
  closings: () => req<Array<{ id: string; reference: string; grossPayroll: number | string; discounts: number | string; employerCharges: number | string; netPayroll: number | string; employeeCount: number; status: string }>>("/hr/payroll-closings"),
  attendance: () => req<Array<{ id: string; date: string; status: string; clockIn?: string | null; clockOut?: string | null; observation?: string | null; employee?: { name: string } }>>("/hr/attendance"),
  addAttendance: (b: Record<string, unknown>) => req("/hr/attendance", { method: "POST", json: b }),
  vacations: () => req<Array<{ id: string; acquisitionStart: string; acquisitionEnd: string; concessionDeadline: string; status: string; employee?: { name: string } }>>("/hr/vacations"),
  addVacation: (b: Record<string, unknown>) => req("/hr/vacations", { method: "POST", json: b }),
  documents: () => req<Array<{ id: string; type: string; title: string; issuedAt: string; expiresAt?: string | null; status: string; employee?: { name: string } }>>("/hr/documents"),
  addDocument: (b: Record<string, unknown>) => req("/hr/documents", { method: "POST", json: b }),
  discipline: () => req<Array<{ id: string; type: string; date: string; reason: string; daysSuspended?: number | null; employee?: { name: string } }>>("/hr/disciplinary-actions"),
  addDiscipline: (b: Record<string, unknown>) => req("/hr/disciplinary-actions", { method: "POST", json: b }),
  requests: (status?: string) => req<AbsenceRequest[]>(`/hr/absence-requests${status ? `?status=${status}` : ""}`),
  request: (id: string) => req<AbsenceRequest>(`/hr/absence-requests/${id}`),
  decide: (id: string, b: Record<string, unknown>) => req<{ ok: boolean; status: string }>(`/hr/absence-requests/${id}/decide`, { method: "POST", json: b }),
  me: {
    today: () => req<{ linked: false } | { linked: true; employee: { id: string; name: string; position: string }; today: string; punches: Array<{ id: string; kind: string; label: string; time: string; insideWorkplace: boolean | null }>; nextKind: string | null; nextLabel: string | null }>("/hr/me/today"),
    punch: (b: Record<string, unknown>) => req<{ label: string; time: string; insideWorkplace: boolean | null; note: string | null }>("/hr/me/punch", { method: "POST", json: b }),
    month: (ref: string) => req<{ ref: string; days: DayRow[]; totals: Totals }>(`/hr/me/month?ref=${ref}`),
    requests: () => req<AbsenceRequest[]>("/hr/me/absence-requests"),
    request: (id: string) => req<AbsenceRequest>(`/hr/me/absence-requests/${id}`),
    createRequest: (b: Record<string, unknown>) => req<{ id: string }>("/hr/me/absence-requests", { method: "POST", json: b }),
  },
};

export const fmtMin = (min: number) => {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  return `${sign}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
};
export const money = (v: number | string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
export const fmtDate = (v: string) => { const d = v.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : v; };
export const STATUS_LABEL: Record<string, string> = { OK: "Normal", ATRASO: "Atraso", FALTA: "Falta", ABONADA: "Abonada", INCOMPLETO: "Batida incompleta", FOLGA: "Folga", AGUARDANDO: "Aguardando", PENDENTE: "Em análise", NAO_ABONADA: "Não abonada", SANCIONADA: "Sanção aplicada" };
