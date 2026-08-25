export type FinanceEntryType = "Receita" | "Despesa";
export type FinanceEntryStatus = "Pendente" | "Pago" | "Vencido" | "Cancelado";
export type PaymentMethod = "PIX" | "Cartão" | "Boleto" | "Transferência" | "Dinheiro";
export type PaymentProvider = "Asaas" | "Stripe" | "Banco / Open Finance" | "Manual";

export interface FinanceEntry {
  id: number;
  description: string;
  category: string;
  personName: string;
  patientId?: string;
  type: FinanceEntryType;
  status: FinanceEntryStatus;
  value: number;
  dueDate: string;
  competenceDate?: string;
  paymentMethod?: PaymentMethod;
  provider?: PaymentProvider;
  installment?: number;
  installments?: number;
  origin?: "Manual" | "Orçamento" | "Agenda" | "RH" | "Laboratório" | "Fiscal";
  originId?: string;
  paidAt?: string;
  externalId?: string;
  notes?: string;
  accountingMode?: "Livro Caixa" | "Empresa";
  documentType?: "Boleto" | "Nota fiscal" | "Recibo" | "Comprovante" | "Outro";
  barcode?: string;
}

export interface PaymentProviderConfig {
  id: "asaas" | "stripe" | "bank";
  name: PaymentProvider;
  active: boolean;
  environment: "Teste" | "Produção";
  supports: PaymentMethod[];
  webhookConfigured: boolean;
  credentialsConfigured: boolean;
}

const ENTRIES_KEY = "dentalpos.financial.entries.v3";
const PROVIDERS_KEY = "dentalpos.payment.providers.v2";
const LEGACY_KEY = "dentalpos.financial.entries.v2";

const isoToday = () => new Date().toISOString().slice(0, 10);
const addMonths = (date: Date, months: number) => {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

const seed: FinanceEntry[] = [
  { id: 1, description: "Tratamento implantodôntico", category: "Implantodontia", personName: "Maria Oliveira", type: "Receita", status: "Pago", value: 8500, dueDate: "2026-08-02", paymentMethod: "PIX", provider: "Asaas", origin: "Manual", paidAt: "2026-08-02" },
  { id: 2, description: "Parcela de tratamento ortodôntico", category: "Ortodontia", personName: "Fernanda Lima", type: "Receita", status: "Pendente", value: 680, dueDate: "2026-08-15", paymentMethod: "Boleto", provider: "Asaas", origin: "Manual" },
  { id: 3, description: "Compra de componentes protéticos", category: "Materiais", personName: "Fornecedor Dental", type: "Despesa", status: "Pendente", value: 4200, dueDate: "2026-08-18", origin: "Manual" },
];

const providersSeed: PaymentProviderConfig[] = [
  { id: "asaas", name: "Asaas", active: false, environment: "Teste", supports: ["PIX", "Cartão", "Boleto"], webhookConfigured: false, credentialsConfigured: false },
  { id: "stripe", name: "Stripe", active: false, environment: "Teste", supports: ["Cartão"], webhookConfigured: false, credentialsConfigured: false },
  { id: "bank", name: "Banco / Open Finance", active: false, environment: "Teste", supports: ["PIX", "Transferência"], webhookConfigured: false, credentialsConfigured: false },
];

function normalizeStatus(entry: FinanceEntry): FinanceEntry {
  if (entry.status === "Pendente" && entry.dueDate < isoToday()) return { ...entry, status: "Vencido" };
  return entry;
}

function migrateLegacy(): FinanceEntry[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as Array<any>;
    return legacy.map((e) => {
      let dueDate = String(e.dueDate || isoToday());
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dueDate)) {
        const [d, m, y] = dueDate.split("/");
        dueDate = `${y}-${m}-${d}`;
      }
      return normalizeStatus({ ...e, dueDate, origin: e.origin || "Manual" });
    });
  } catch { return null; }
}

export function listFinanceEntries(): FinanceEntry[] {
  try {
    const current = localStorage.getItem(ENTRIES_KEY);
    if (current) return (JSON.parse(current) as FinanceEntry[]).map(normalizeStatus);
    const migrated = migrateLegacy();
    if (migrated) { saveFinanceEntries(migrated); return migrated; }
  } catch { /* fallback */ }
  saveFinanceEntries(seed);
  return seed.map(normalizeStatus);
}

export function saveFinanceEntries(entries: FinanceEntry[]) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries.map(normalizeStatus)));
  window.dispatchEvent(new CustomEvent("dentalpos:finance-changed"));
}

export function upsertFinanceEntry(entry: FinanceEntry) {
  const rows = listFinanceEntries();
  const found = rows.some((x) => x.id === entry.id);
  saveFinanceEntries(found ? rows.map((x) => x.id === entry.id ? normalizeStatus(entry) : x) : [normalizeStatus(entry), ...rows]);
}

export function setFinanceEntryStatus(id: number, status: FinanceEntryStatus) {
  const rows = listFinanceEntries().map((x) => x.id === id ? { ...x, status, paidAt: status === "Pago" ? new Date().toISOString() : x.paidAt } : x);
  saveFinanceEntries(rows);
}

export function deleteFinanceEntry(id: number) { saveFinanceEntries(listFinanceEntries().filter((x) => x.id !== id)); }

export function listProviderConfigs(): PaymentProviderConfig[] {
  try { return JSON.parse(localStorage.getItem(PROVIDERS_KEY) || "null") || providersSeed; } catch { return providersSeed; }
}
export function saveProviderConfigs(rows: PaymentProviderConfig[]) { localStorage.setItem(PROVIDERS_KEY, JSON.stringify(rows)); window.dispatchEvent(new CustomEvent("dentalpos:providers-changed")); }

export interface BudgetReceivableInput {
  budgetId: number | string;
  patient: string;
  patientId?: string;
  description: string;
  total: number;
  entry: number;
  installments: number;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
}

export function createReceivablesFromBudget(input: BudgetReceivableInput) {
  const rows = listFinanceEntries();
  const originId = String(input.budgetId);
  if (rows.some((x) => x.origin === "Orçamento" && x.originId === originId)) return;
  const created: FinanceEntry[] = [];
  const base = Date.now();
  const today = new Date();
  if (input.entry > 0) {
    created.push({ id: base, description: `${input.description} • Entrada`, category: "Tratamento", personName: input.patient, patientId: input.patientId, type: "Receita", status: "Pendente", value: input.entry, dueDate: isoToday(), paymentMethod: input.paymentMethod, provider: input.provider, installment: 0, installments: input.installments, origin: "Orçamento", originId });
  }
  const financed = Math.max(0, input.total - input.entry);
  const count = Math.max(1, input.installments || 1);
  const installmentValue = financed / count;
  for (let i = 1; i <= count && financed > 0; i += 1) {
    created.push({ id: base + i, description: `${input.description} • Parcela ${i}/${count}`, category: "Tratamento", personName: input.patient, patientId: input.patientId, type: "Receita", status: "Pendente", value: installmentValue, dueDate: addMonths(today, i - (input.entry > 0 ? 0 : 1)).toISOString().slice(0, 10), paymentMethod: input.paymentMethod, provider: input.provider, installment: i, installments: count, origin: "Orçamento", originId });
  }
  saveFinanceEntries([...created, ...rows]);
}

export function patientFinancialSummary(patientName: string) {
  const rows = listFinanceEntries().filter((x) => x.type === "Receita" && x.status !== "Cancelado" && x.personName.toLowerCase() === patientName.toLowerCase());
  const open = rows.filter((x) => x.status !== "Pago").reduce((a, x) => a + x.value, 0);
  const overdue = rows.filter((x) => x.status === "Vencido").reduce((a, x) => a + x.value, 0);
  return { open, overdue, status: overdue > 0 ? "Inadimplente" : open > 0 ? "Possui pendência" : "Em dia" };
}
