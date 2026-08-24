export type EmployeeCategory =
  | "Cirurgião-dentista" | "ASB" | "TSB" | "Técnico em Prótese Dentária" | "Auxiliar de Laboratório"
  | "Recepção" | "Administrativo" | "Financeiro" | "Comercial" | "Marketing" | "Zeladoria"
  | "Manutenção" | "Professor" | "Tutor" | "Representante" | "Estagiário" | "Outro";

export type EmploymentModel = "CLT" | "PJ" | "Autônomo" | "Estágio" | "Diária" | "Percentual" | "Locação de espaço" | "Terceirizado";
export type EmployeeStatus = "Ativo" | "Experiência" | "Férias" | "Afastado" | "Aviso-prévio" | "Desligado";
export type AttendanceStatus = "Presente" | "Atraso" | "Falta" | "Atestado" | "Folga" | "Férias" | "Home office";
export type HRDocumentStatus = "Rascunho" | "Pendente de assinatura" | "Assinado" | "Vencido" | "Cancelado";
export type PayrollStatus = "Em cálculo" | "Conferência" | "Aprovada" | "Programada" | "Paga";

export interface Employee {
  id: number; name: string; employeeCode: string; category: EmployeeCategory; department: string; position: string;
  employmentModel: EmploymentModel; status: EmployeeStatus; admissionDate: string; experienceEndDate?: string; terminationDate?: string;
  baseSalary: number; monthlyWorkload: number; supervisor: string; email: string; phone: string; cpf?: string; rg?: string;
  birthDate?: string; address?: string; bankName?: string; bankAgency?: string; bankAccount?: string; pixKey?: string;
  unionName?: string; nextVacationDate?: string; notes?: string;
}

export interface AttendanceRecord {
  id: number; employeeId: number; employeeName: string; date: string; clockIn?: string; lunchOut?: string; lunchReturn?: string;
  clockOut?: string; workedHours: number; overtimeHours: number; balanceHours: number; status: AttendanceStatus; observation?: string;
}

export interface PayrollEntry {
  id: number; employeeId: number; employeeName: string; description: string; type: "Provento" | "Desconto" | "Encargo" | "Benefício";
  value: number; reference: string;
}

export interface PayrollClosing {
  id: number; referenceMonth: string; employeeCount: number; grossPayroll: number; discounts: number; employerCharges: number;
  netPayroll: number; paymentDate: string; status: PayrollStatus;
}

export interface HRDocument {
  id: number; employeeId: number; employeeName: string; type: string; title: string; issuedAt: string; expiresAt?: string;
  status: HRDocumentStatus; digitallySigned: boolean; notes?: string;
}

export interface DisciplinaryAction {
  id: number; employeeId: number; employeeName: string; type: "Orientação" | "Advertência verbal" | "Advertência escrita" | "Suspensão" | "Justa causa";
  date: string; reason: string; daysSuspended?: number; status: "Rascunho" | "Aplicada" | "Cancelada";
}

export interface VacationControl {
  id: number; employeeId: number; employeeName: string; acquisitionStart: string; acquisitionEnd: string; concessionDeadline: string;
  scheduledStart?: string; scheduledEnd?: string; vacationDays: number; soldDays: number;
  status: "Em aquisição" | "Disponível" | "Programada" | "Em férias" | "Concluída" | "Vencida";
}

export interface EmployeeBenefit {
  id: number; employeeId: number; employeeName: string; description: string; monthlyValue: number; employeeDiscount: number; active: boolean;
}
