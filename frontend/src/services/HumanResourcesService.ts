import type {
  AttendanceRecord,
  DisciplinaryAction,
  Employee,
  EmployeeBenefit,
  HRDocument,
  PayrollClosing,
  PayrollEntry,
  VacationControl,
} from "../types/humanResources";

export const employees: Employee[] = [
  {
    id: 1,
    name: "Roberto Almeida",
    employeeCode: "COL-001",
    category: "Cirurgião-dentista",
    department: "Clínico",
    position: "Implantodontista",
    employmentModel: "Percentual",
    status: "Ativo",
    admissionDate: "10/01/2025",
    baseSalary: 0,
    monthlyWorkload: 120,
    supervisor: "Dr. Robson",
    email: "roberto@dentalpos.com.br",
    phone: "(44) 99999-1001",
    bankName: "Banco Digital",
    bankAccount: "000123-4",
    pixKey: "roberto@dentalpos.com.br",
  },
  {
    id: 2,
    name: "Juliana Martins",
    employeeCode: "COL-002",
    category: "Recepção",
    department: "Atendimento",
    position: "Recepcionista",
    employmentModel: "CLT",
    status: "Ativo",
    admissionDate: "05/03/2024",
    baseSalary: 2450,
    monthlyWorkload: 220,
    supervisor: "Coordenação Administrativa",
    email: "juliana@dentalpos.com.br",
    phone: "(44) 99999-1002",
    bankName: "Banco do Brasil",
    bankAccount: "45678-9",
    pixKey: "44999991002",
    unionName: "Sindicato dos Empregados em Estabelecimentos de Saúde",
    nextVacationDate: "10/11/2026",
  },
  {
    id: 3,
    name: "Carla Souza",
    employeeCode: "COL-003",
    category: "ASB",
    department: "Clínico",
    position: "Auxiliar em Saúde Bucal",
    employmentModel: "CLT",
    status: "Experiência",
    admissionDate: "15/07/2026",
    experienceEndDate: "12/10/2026",
    baseSalary: 2300,
    monthlyWorkload: 220,
    supervisor: "Responsável Técnico",
    email: "carla@dentalpos.com.br",
    phone: "(44) 99999-1003",
    pixKey: "44999991003",
  },
  {
    id: 4,
    name: "Marcos Ferreira",
    employeeCode: "COL-004",
    category: "Técnico em Prótese Dentária",
    department: "Laboratório",
    position: "Técnico CAD/CAM",
    employmentModel: "PJ",
    status: "Ativo",
    admissionDate: "01/02/2026",
    baseSalary: 6800,
    monthlyWorkload: 176,
    supervisor: "Coordenação do Laboratório",
    email: "marcos@dentalpos.com.br",
    phone: "(44) 99999-1004",
    bankName: "Banco Digital",
    bankAccount: "99887-1",
    pixKey: "marcos@laboratorio.com.br",
  },
  {
    id: 5,
    name: "Aparecida Oliveira",
    employeeCode: "COL-005",
    category: "Zeladoria",
    department: "Serviços Gerais",
    position: "Auxiliar de Limpeza",
    employmentModel: "CLT",
    status: "Ativo",
    admissionDate: "08/05/2023",
    baseSalary: 1980,
    monthlyWorkload: 220,
    supervisor: "Coordenação Administrativa",
    email: "aparecida@dentalpos.com.br",
    phone: "(44) 99999-1005",
    unionName: "Sindicato da categoria",
    nextVacationDate: "01/09/2026",
  },
];

export const attendanceRecords: AttendanceRecord[] = [
  {
    id: 1,
    employeeId: 2,
    employeeName: "Juliana Martins",
    date: "02/08/2026",
    clockIn: "07:58",
    lunchOut: "12:02",
    lunchReturn: "13:01",
    clockOut: "17:59",
    workedHours: 9,
    overtimeHours: 0,
    balanceHours: 0,
    status: "Presente",
  },
  {
    id: 2,
    employeeId: 3,
    employeeName: "Carla Souza",
    date: "02/08/2026",
    clockIn: "08:17",
    lunchOut: "12:05",
    lunchReturn: "13:00",
    clockOut: "18:00",
    workedHours: 8.72,
    overtimeHours: 0,
    balanceHours: -0.28,
    status: "Atraso",
    observation: "Atraso de 17 minutos.",
  },
  {
    id: 3,
    employeeId: 4,
    employeeName: "Marcos Ferreira",
    date: "02/08/2026",
    clockIn: "08:00",
    lunchOut: "12:00",
    lunchReturn: "13:00",
    clockOut: "19:15",
    workedHours: 10.25,
    overtimeHours: 1.25,
    balanceHours: 1.25,
    status: "Presente",
  },
  {
    id: 4,
    employeeId: 5,
    employeeName: "Aparecida Oliveira",
    date: "02/08/2026",
    workedHours: 0,
    overtimeHours: 0,
    balanceHours: -8,
    status: "Atestado",
    observation: "Atestado anexado ao prontuário do colaborador.",
  },
];

export const payrollEntries: PayrollEntry[] = [
  {
    id: 1,
    employeeId: 2,
    employeeName: "Juliana Martins",
    description: "Salário-base",
    type: "Provento",
    value: 2450,
    reference: "08/2026",
  },
  {
    id: 2,
    employeeId: 2,
    employeeName: "Juliana Martins",
    description: "Bônus de desempenho",
    type: "Provento",
    value: 350,
    reference: "08/2026",
  },
  {
    id: 3,
    employeeId: 2,
    employeeName: "Juliana Martins",
    description: "Vale-transporte",
    type: "Desconto",
    value: 147,
    reference: "08/2026",
  },
  {
    id: 4,
    employeeId: 3,
    employeeName: "Carla Souza",
    description: "Salário-base",
    type: "Provento",
    value: 2300,
    reference: "08/2026",
  },
  {
    id: 5,
    employeeId: 4,
    employeeName: "Marcos Ferreira",
    description: "Prestação de serviços PJ",
    type: "Provento",
    value: 6800,
    reference: "08/2026",
  },
  {
    id: 6,
    employeeId: 5,
    employeeName: "Aparecida Oliveira",
    description: "Adiantamento salarial",
    type: "Desconto",
    value: 500,
    reference: "08/2026",
  },
];

export const payrollClosings: PayrollClosing[] = [
  {
    id: 1,
    referenceMonth: "08/2026",
    employeeCount: 5,
    grossPayroll: 21860,
    discounts: 2147,
    employerCharges: 6420,
    netPayroll: 19713,
    paymentDate: "07/08/2026",
    status: "Em cálculo",
  },
  {
    id: 2,
    referenceMonth: "07/2026",
    employeeCount: 5,
    grossPayroll: 21120,
    discounts: 1980,
    employerCharges: 6195,
    netPayroll: 19140,
    paymentDate: "07/07/2026",
    status: "Paga",
  },
];

export const hrDocuments: HRDocument[] = [
  {
    id: 1,
    employeeId: 3,
    employeeName: "Carla Souza",
    type: "Contrato de experiência",
    title: "Contrato de experiência — primeiro período",
    issuedAt: "15/07/2026",
    expiresAt: "28/08/2026",
    status: "Assinado",
    digitallySigned: true,
  },
  {
    id: 2,
    employeeId: 4,
    employeeName: "Marcos Ferreira",
    type: "Contrato PJ",
    title: "Contrato de prestação de serviços laboratoriais",
    issuedAt: "01/02/2026",
    expiresAt: "31/01/2027",
    status: "Assinado",
    digitallySigned: true,
  },
  {
    id: 3,
    employeeId: 2,
    employeeName: "Juliana Martins",
    type: "Promoção",
    title: "Promoção para líder de recepção",
    issuedAt: "01/08/2026",
    status: "Pendente de assinatura",
    digitallySigned: false,
  },
];

export const disciplinaryActions: DisciplinaryAction[] = [
  {
    id: 1,
    employeeId: 2,
    employeeName: "Juliana Martins",
    type: "Orientação",
    date: "15/06/2026",
    reason:
      "Orientação formal sobre atualização dos contatos de confirmação.",
    status: "Aplicada",
  },
  {
    id: 2,
    employeeId: 4,
    employeeName: "Marcos Ferreira",
    type: "Advertência escrita",
    date: "20/07/2026",
    reason:
      "Entrega de trabalho laboratorial fora do prazo sem comunicação prévia.",
    status: "Aplicada",
  },
];

export const vacationControls: VacationControl[] = [
  {
    id: 1,
    employeeId: 2,
    employeeName: "Juliana Martins",
    acquisitionStart: "05/03/2025",
    acquisitionEnd: "04/03/2026",
    concessionDeadline: "04/03/2027",
    scheduledStart: "10/11/2026",
    scheduledEnd: "29/11/2026",
    vacationDays: 20,
    soldDays: 10,
    status: "Programada",
  },
  {
    id: 2,
    employeeId: 5,
    employeeName: "Aparecida Oliveira",
    acquisitionStart: "08/05/2025",
    acquisitionEnd: "07/05/2026",
    concessionDeadline: "07/05/2027",
    scheduledStart: "01/09/2026",
    scheduledEnd: "30/09/2026",
    vacationDays: 30,
    soldDays: 0,
    status: "Programada",
  },
];

export const employeeBenefits: EmployeeBenefit[] = [
  {
    id: 1,
    employeeId: 2,
    employeeName: "Juliana Martins",
    description: "Vale-alimentação",
    monthlyValue: 620,
    employeeDiscount: 0,
    active: true,
  },
  {
    id: 2,
    employeeId: 2,
    employeeName: "Juliana Martins",
    description: "Plano de saúde",
    monthlyValue: 480,
    employeeDiscount: 120,
    active: true,
  },
  {
    id: 3,
    employeeId: 3,
    employeeName: "Carla Souza",
    description: "Vale-transporte",
    monthlyValue: 280,
    employeeDiscount: 138,
    active: true,
  },
];

export function formatHRMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function calculateActiveEmployees(): number {
  return employees.filter(
    (employee) => employee.status !== "Desligado",
  ).length;
}

export function calculateCLTEmployees(): number {
  return employees.filter(
    (employee) => employee.employmentModel === "CLT",
  ).length;
}

export function calculateMonthlyBaseCost(): number {
  return employees
    .filter((employee) => employee.status !== "Desligado")
    .reduce(
      (total, employee) => total + employee.baseSalary,
      0,
    );
}

export function calculateAttendanceRate(): number {
  if (attendanceRecords.length === 0) {
    return 0;
  }

  const validAttendance = attendanceRecords.filter(
    (record) =>
      record.status === "Presente" ||
      record.status === "Atraso" ||
      record.status === "Home office",
  ).length;

  return (validAttendance / attendanceRecords.length) * 100;
}

export function calculatePayrollEntryBalance(): number {
  return payrollEntries.reduce((total, entry) => {
    if (
      entry.type === "Provento" ||
      entry.type === "Benefício"
    ) {
      return total + entry.value;
    }

    return total - entry.value;
  }, 0);
}