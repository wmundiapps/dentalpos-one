const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const frequencyLabels: Record<string, string> = { MONTHLY: "Mensal", BIMONTHLY: "Bimestral", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", YEARLY: "Anual" };

export interface RecurringBill {
  id: string; type: "INCOME" | "EXPENSE"; description: string; category: string; personName: string;
  amount: number; amountIsVariable: boolean; frequency: string; dueDay: number; startDate: string;
  endDate?: string | null; occurrences?: number | null; autoDebit: boolean; paymentMethod?: string | null;
  notes?: string | null; isActive: boolean; _count?: { entries: number };
}
export type RecurringBillInput = Partial<Omit<RecurringBill, "id" | "_count" | "isActive">>;
export interface ForecastSide { realized: number; open: number; recurring: number; estimated: number; total: number; }
export interface ForecastRow { month: string; income: ForecastSide; expense: ForecastSide; balance: number; }
export interface Forecast { months: number; basis: string; rows: ForecastRow[]; }
export interface Debtor { key: string; patientId?: string | null; name: string; phone?: string | null; email?: string | null; total: number; count: number; oldestDueDate: string; daysOverdue: number; entries: { id: string; description: string; amount: number; dueDate: string }[]; }
export interface Debtors { totalOverdue: number; debtors: number; list: Debtor[]; }
export interface Reminder { kind: string; severity: "HIGH" | "MEDIUM"; title: string; detail: string; entryId?: string | null; recurringBillId?: string | null; amount: number; dueDate: string; }
export interface Reminders { total: number; high: number; items: Reminder[]; }

function headers(json = false) {
  const token = localStorage.getItem("dentalpos.token") || "";
  const clinicId = localStorage.getItem("dentalpos.clinicId") || "";
  return { Authorization: `Bearer ${token}`, ...(clinicId ? { "X-Clinic-ID": clinicId } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || `Erro HTTP ${r.status}`); }
  return r.json();
}
export async function listRecurringBills(): Promise<RecurringBill[]> { return parse(await fetch(`${API}/recurring-bills`, { headers: headers() })); }
export async function createRecurringBill(input: RecurringBillInput): Promise<RecurringBill> { return parse(await fetch(`${API}/recurring-bills`, { method: "POST", headers: headers(true), body: JSON.stringify(input) })); }
export async function updateRecurringBill(id: string, input: RecurringBillInput): Promise<RecurringBill> { return parse(await fetch(`${API}/recurring-bills/${encodeURIComponent(id)}`, { method: "PUT", headers: headers(true), body: JSON.stringify(input) })); }
export async function deactivateRecurringBill(id: string): Promise<RecurringBill> { return parse(await fetch(`${API}/recurring-bills/${encodeURIComponent(id)}/deactivate`, { method: "POST", headers: headers(true), body: "{}" })); }
export async function loadForecast(months = 6): Promise<Forecast> { return parse(await fetch(`${API}/financial-forecast?months=${months}`, { headers: headers() })); }
export async function loadDebtors(): Promise<Debtors> { return parse(await fetch(`${API}/financial-debtors`, { headers: headers() })); }
export async function loadReminders(): Promise<Reminders> { return parse(await fetch(`${API}/financial-reminders`, { headers: headers() })); }