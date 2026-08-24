import type {
  AccountingEntry,
  AccountingSummary,
  BankTransaction,
  ChartOfAccount,
  TaxObligation,
  TaxRegimeSimulation,
} from "../types/accounting";

export const chartOfAccounts: ChartOfAccount[] = [
  {
    id: 1,
    code: "1",
    name: "Ativo",
    group: "Ativo",
    active: true,
  },
  {
    id: 2,
    code: "1.1",
    name: "Disponibilidades",
    group: "Ativo",
    parentCode: "1",
    active: true,
  },
  {
    id: 3,
    code: "1.1.01",
    name: "Caixa",
    group: "Ativo",
    parentCode: "1.1",
    active: true,
  },
  {
    id: 4,
    code: "1.1.02",
    name: "Bancos",
    group: "Ativo",
    parentCode: "1.1",
    active: true,
  },
  {
    id: 5,
    code: "3.1.01",
    name: "Receitas de serviços odontológicos",
    group: "Receita",
    active: true,
  },
  {
    id: 6,
    code: "3.1.02",
    name: "Receitas de cursos",
    group: "Receita",
    active: true,
  },
  {
    id: 7,
    code: "3.1.03",
    name: "Receitas de componentes",
    group: "Receita",
    active: true,
  },
  {
    id: 8,
    code: "4.1.01",
    name: "Materiais odontológicos",
    group: "Custo",
    active: true,
  },
  {
    id: 9,
    code: "4.1.02",
    name: "Laboratório de prótese",
    group: "Custo",
    active: true,
  },
  {
    id: 10,
    code: "4.2.01",
    name: "Folha de pagamento",
    group: "Despesa",
    active: true,
  },
  {
    id: 11,
    code: "4.2.02",
    name: "Marketing e publicidade",
    group: "Despesa",
    active: true,
  },
  {
    id: 12,
    code: "4.2.03",
    name: "Despesas administrativas",
    group: "Despesa",
    active: true,
  },
  {
    id: 13,
    code: "4.3.01",
    name: "Tributos federais",
    group: "Despesa",
    active: true,
  },
  {
    id: 14,
    code: "4.3.02",
    name: "Tributos municipais",
    group: "Despesa",
    active: true,
  },
];

export const accountingEntries: AccountingEntry[] = [
  {
    id: 1,
    description: "Tratamento implantodôntico",
    legalEntity: "Pessoa Jurídica",
    personName: "Maria Oliveira",
    documentNumber: "NFS-000145",
    documentType: "NFS-e",
    entryType: "Receita",
    accountCode: "3.1.01",
    accountName: "Receitas de serviços odontológicos",
    costCenter: "Clínica",
    competenceDate: "02/08/2026",
    dueDate: "02/08/2026",
    paymentDate: "02/08/2026",
    grossValue: 8500,
    taxWithheld: 0,
    netValue: 8500,
    status: "Recebido",
    bankAccount: "Conta Clínica",
  },
  {
    id: 2,
    description: "Consulta odontológica particular",
    legalEntity: "Pessoa Física",
    personName: "Carlos Pereira",
    documentNumber: "REC-000318",
    documentType: "Recibo",
    entryType: "Receita",
    accountCode: "3.1.01",
    accountName: "Receitas de serviços odontológicos",
    costCenter: "Dr. Robson PF",
    competenceDate: "02/08/2026",
    dueDate: "02/08/2026",
    paymentDate: "02/08/2026",
    grossValue: 450,
    taxWithheld: 0,
    netValue: 450,
    status: "Recebido",
    bankAccount: "Conta Profissional PF",
    notes:
      "Receita individual do profissional, sujeita à escrituração e análise tributária própria.",
  },
  {
    id: 3,
    description: "Compra de componentes protéticos",
    legalEntity: "Pessoa Jurídica",
    personName: "Fornecedor Dental",
    documentNumber: "NF-98751",
    documentType: "NF-e",
    entryType: "Despesa",
    accountCode: "4.1.01",
    accountName: "Materiais odontológicos",
    costCenter: "Estoque",
    competenceDate: "01/08/2026",
    dueDate: "08/08/2026",
    grossValue: 4200,
    taxWithheld: 0,
    netValue: 4200,
    status: "Pendente",
    bankAccount: "Conta Clínica",
  },
  {
    id: 4,
    description: "Serviços de laboratório de prótese",
    legalEntity: "Pessoa Jurídica",
    personName: "Laboratório Parceiro",
    documentNumber: "NFS-00841",
    documentType: "NFS-e",
    entryType: "Despesa",
    accountCode: "4.1.02",
    accountName: "Laboratório de prótese",
    costCenter: "Laboratório",
    competenceDate: "01/08/2026",
    dueDate: "10/08/2026",
    grossValue: 6800,
    taxWithheld: 102,
    netValue: 6698,
    status: "Pendente",
    bankAccount: "Conta Clínica",
  },
  {
    id: 5,
    description: "Folha de pagamento",
    legalEntity: "Pessoa Jurídica",
    personName: "Colaboradores",
    documentType: "Folha de pagamento",
    entryType: "Despesa",
    accountCode: "4.2.01",
    accountName: "Folha de pagamento",
    costCenter: "RH",
    competenceDate: "31/07/2026",
    dueDate: "07/08/2026",
    grossValue: 21860,
    taxWithheld: 2147,
    netValue: 19713,
    status: "Pendente",
    bankAccount: "Conta Folha",
  },
  {
    id: 6,
    description: "Pró-labore dos sócios",
    legalEntity: "Pessoa Jurídica",
    personName: "Sócios administradores",
    documentType: "Folha de pagamento",
    entryType: "Pró-labore",
    accountCode: "4.2.01",
    accountName: "Folha de pagamento",
    costCenter: "Administração",
    competenceDate: "31/07/2026",
    dueDate: "07/08/2026",
    grossValue: 12000,
    taxWithheld: 1320,
    netValue: 10680,
    status: "Pendente",
    bankAccount: "Conta Clínica",
  },
  {
    id: 7,
    description: "Distribuição de lucros",
    legalEntity: "Pessoa Jurídica",
    personName: "Sócios",
    documentType: "Comprovante",
    entryType: "Distribuição de lucros",
    accountCode: "2.3.01",
    accountName: "Lucros a distribuir",
    costCenter: "Administração",
    competenceDate: "31/07/2026",
    dueDate: "15/08/2026",
    grossValue: 30000,
    taxWithheld: 0,
    netValue: 30000,
    status: "Pendente",
    bankAccount: "Conta Clínica",
    notes:
      "Distribuição condicionada à existência de resultado contábil e validação da contabilidade.",
  },
];

export const bankTransactions: BankTransaction[] = [
  {
    id: 1,
    bankName: "Banco Digital",
    accountName: "Conta Clínica",
    transactionDate: "02/08/2026",
    description: "PIX RECEBIDO MARIA OLIVEIRA",
    documentNumber: "PIX-88021",
    value: 8500,
    transactionType: "Crédito",
    reconciliationStatus: "Sugestão encontrada",
    suggestedEntryId: 1,
  },
  {
    id: 2,
    bankName: "Banco Digital",
    accountName: "Conta Clínica",
    transactionDate: "02/08/2026",
    description: "PAGAMENTO FORNECEDOR LIMPEZA",
    documentNumber: "PIX-88024",
    value: 740,
    transactionType: "Débito",
    reconciliationStatus: "Não identificado",
  },
  {
    id: 3,
    bankName: "Banco do Brasil",
    accountName: "Conta Folha",
    transactionDate: "01/08/2026",
    description: "TRANSFERÊNCIA PARA CONTA FOLHA",
    documentNumber: "TED-20184",
    value: 20000,
    transactionType: "Crédito",
    reconciliationStatus: "Conciliado",
  },
  {
    id: 4,
    bankName: "Banco Digital",
    accountName: "Conta Clínica",
    transactionDate: "01/08/2026",
    description: "TARIFA BANCÁRIA",
    value: 89.9,
    transactionType: "Débito",
    reconciliationStatus: "Não identificado",
  },
];

export const taxObligations: TaxObligation[] = [
  {
    id: 1,
    name: "DARF previdenciário",
    entityName: "DentalPos Clínica",
    legalEntity: "Pessoa Jurídica",
    regime: "Lucro Presumido",
    competence: "07/2026",
    dueDate: "20/08/2026",
    estimatedValue: 12680,
    status: "Em conferência",
    responsible: "Contabilidade",
    requiresAccountantApproval: true,
  },
  {
    id: 2,
    name: "FGTS Digital",
    entityName: "DentalPos Clínica",
    legalEntity: "Pessoa Jurídica",
    regime: "Lucro Presumido",
    competence: "07/2026",
    dueDate: "20/08/2026",
    estimatedValue: 1748.8,
    status: "A calcular",
    responsible: "Departamento Pessoal",
    requiresAccountantApproval: true,
  },
  {
    id: 3,
    name: "IRRF sobre folha e pró-labore",
    entityName: "DentalPos Clínica",
    legalEntity: "Pessoa Jurídica",
    regime: "Lucro Presumido",
    competence: "07/2026",
    dueDate: "20/08/2026",
    estimatedValue: 2480,
    status: "Em conferência",
    responsible: "Contabilidade",
    requiresAccountantApproval: true,
  },
  {
    id: 4,
    name: "IRPJ e CSLL",
    entityName: "DentalPos Clínica",
    legalEntity: "Pessoa Jurídica",
    regime: "Lucro Presumido",
    competence: "3º trimestre/2026",
    dueDate: "30/10/2026",
    estimatedValue: 48500,
    status: "A calcular",
    responsible: "Contabilidade",
    requiresAccountantApproval: true,
  },
  {
    id: 5,
    name: "ISS",
    entityName: "DentalPos Clínica",
    legalEntity: "Pessoa Jurídica",
    regime: "Lucro Presumido",
    competence: "07/2026",
    dueDate: "15/08/2026",
    estimatedValue: 14600,
    status: "Programada",
    responsible: "Financeiro",
    requiresAccountantApproval: true,
  },
  {
    id: 6,
    name: "Livro-caixa e recolhimento PF",
    entityName: "Dr. Robson — Pessoa Física",
    legalEntity: "Pessoa Física",
    regime: "Pessoa Física",
    competence: "07/2026",
    dueDate: "29/08/2026",
    estimatedValue: 3200,
    status: "A calcular",
    responsible: "Contabilidade pessoal",
    requiresAccountantApproval: true,
  },
];

export const taxRegimeSimulations: TaxRegimeSimulation[] = [
  {
    regime: "Simples Nacional",
    estimatedMonthlyTax: 68200,
    estimatedAnnualTax: 818400,
    effectiveRate: 14.2,
    complianceCost: 2800,
    projectedNetResult: 98300,
    advantages: [
      "Arrecadação concentrada em guia única.",
      "Operação administrativa simplificada.",
      "Pode ser vantajoso em cenários específicos de faturamento e folha.",
    ],
    attentionPoints: [
      "Necessidade de verificar limites de faturamento.",
      "Análise das atividades e anexos aplicáveis.",
      "Avaliação do fator relacionado à folha, quando cabível.",
    ],
    recommended: false,
  },
  {
    regime: "Lucro Presumido",
    estimatedMonthlyTax: 60400,
    estimatedAnnualTax: 724800,
    effectiveRate: 12.58,
    complianceCost: 4800,
    projectedNetResult: 108100,
    advantages: [
      "Previsibilidade da base presumida.",
      "Pode favorecer operações com margens elevadas.",
      "Adequado ao cenário atual usado na simulação.",
    ],
    attentionPoints: [
      "Carga tributária não acompanha necessariamente o lucro real.",
      "Exige controle rigoroso das atividades de clínica, ensino e comércio.",
      "ISS, ICMS e tributos federais precisam ser segregados corretamente.",
    ],
    recommended: true,
  },
  {
    regime: "Lucro Real",
    estimatedMonthlyTax: 57300,
    estimatedAnnualTax: 687600,
    effectiveRate: 11.94,
    complianceCost: 9800,
    projectedNetResult: 106200,
    advantages: [
      "Tributação baseada no resultado contábil ajustado.",
      "Possibilidade de aproveitamento de determinados créditos.",
      "Pode ser vantajoso em margens reduzidas ou despesas elevadas.",
    ],
    attentionPoints: [
      "Maior custo de conformidade.",
      "Necessidade de contabilidade integrada e controles detalhados.",
      "Risco maior de inconsistências sem documentação adequada.",
    ],
    recommended: false,
  },
];

export function formatAccountingMoney(
  value: number,
): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function getAccountingSummary(): AccountingSummary {
  const totalRevenue = accountingEntries
    .filter((entry) => entry.entryType === "Receita")
    .reduce(
      (total, entry) => total + entry.netValue,
      0,
    );

  const totalExpenses = accountingEntries
    .filter(
      (entry) =>
        entry.entryType === "Despesa" ||
        entry.entryType === "Pró-labore",
    )
    .reduce(
      (total, entry) => total + entry.netValue,
      0,
    );

  const totalTaxes = taxObligations.reduce(
    (total, obligation) =>
      total + obligation.estimatedValue,
    0,
  );

  const unreconciledTransactions =
    bankTransactions.filter(
      (transaction) =>
        transaction.reconciliationStatus !==
        "Conciliado",
    ).length;

  const pendingObligations = taxObligations.filter(
    (obligation) =>
      obligation.status !== "Paga" &&
      obligation.status !== "Transmitida",
  ).length;

  return {
    totalRevenue,
    totalExpenses,
    totalTaxes,
    netCashFlow: totalRevenue - totalExpenses,
    unreconciledTransactions,
    pendingObligations,
  };
}

export function getPFRevenue(): number {
  return accountingEntries
    .filter(
      (entry) =>
        entry.legalEntity === "Pessoa Física" &&
        entry.entryType === "Receita",
    )
    .reduce(
      (total, entry) => total + entry.netValue,
      0,
    );
}

export function getPJRevenue(): number {
  return accountingEntries
    .filter(
      (entry) =>
        entry.legalEntity === "Pessoa Jurídica" &&
        entry.entryType === "Receita",
    )
    .reduce(
      (total, entry) => total + entry.netValue,
      0,
    );
}