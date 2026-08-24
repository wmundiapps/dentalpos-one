import type {
  FiscalAlert,
  FiscalAutomationStatus,
  FiscalAutomationSummary,
  FiscalDocumentKind,
  FiscalPayment,
  FiscalSendRecord,
} from "../types/fiscalAutomation";

export const fiscalPayments: FiscalPayment[] = [
  {
    id: 1,
    paymentCode: "PAG-000841",
    treatmentReference:
      "Reabilitação implantossuportada",
    issuerType: "Clínica Pessoa Jurídica",
    issuerName: "DentalPos Clínica",
    issuerDocument: "12.345.678/0001-90",
    payer: {
      name: "Maria Oliveira",
      document: "123.456.789-00",
      email: "maria@email.com",
      phone: "44999990001",
      telegramUser: "@mariaoliveira",
    },
    patient: {
      name: "Maria Oliveira",
      document: "123.456.789-00",
    },
    paymentDate: "02/08/2026",
    competence: "08/2026",
    grossValue: 8500,
    discountValue: 0,
    receivedValue: 8500,
    paymentMethod: "PIX",
    installmentNumber: 1,
    totalInstallments: 1,
    fiscalDocumentKind: "NFS-e",
    status: "Nota programada",
    issueScheduledAt: "02/08/2026, 17:00",
    accountantApprovalRequired: false,
    accountantApproved: true,
    notes:
      "Emissão programada após confirmação bancária.",
  },
  {
    id: 2,
    paymentCode: "PAG-000842",
    treatmentReference: "Consulta particular",
    issuerType: "Dentista Pessoa Física",
    issuerName: "Dr. Robson Ravel",
    issuerDocument: "987.654.321-00",
    payer: {
      name: "Carlos Pereira",
      document: "222.333.444-55",
      email: "carlos@email.com",
      phone: "44999990002",
    },
    patient: {
      name: "Carlos Pereira",
      document: "222.333.444-55",
    },
    paymentDate: "02/08/2026",
    competence: "08/2026",
    grossValue: 450,
    discountValue: 0,
    receivedValue: 450,
    paymentMethod: "Cartão",
    installmentNumber: 1,
    totalInstallments: 1,
    fiscalDocumentKind: "Receita Saúde",
    status: "Aguardando Receita Saúde",
    accountantApprovalRequired: true,
    accountantApproved: false,
    notes:
      "A equipe deve concluir o lançamento e registrar o protocolo.",
  },
  {
    id: 3,
    paymentCode: "PAG-000843",
    treatmentReference: "Manutenção ortodôntica",
    issuerType: "Clínica Pessoa Jurídica",
    issuerName: "DentalPos Clínica",
    issuerDocument: "12.345.678/0001-90",
    payer: {
      name: "Fernanda Lima",
      document: "333.444.555-66",
      email: "fernanda@email.com",
      phone: "44999990003",
    },
    patient: {
      name: "Fernanda Lima",
      document: "333.444.555-66",
    },
    paymentDate: "02/08/2026",
    competence: "08/2026",
    grossValue: 780,
    discountValue: 80,
    receivedValue: 700,
    paymentMethod: "PIX",
    installmentNumber: 2,
    totalInstallments: 12,
    fiscalDocumentKind: "NFS-e",
    status: "Documento emitido",
    documentNumber: "NFS-2026-000884",
    protocolNumber: "PROTOCOLO-88421",
    documentUrl: "/documentos/nfs-2026-000884.pdf",
    accountantApprovalRequired: false,
    accountantApproved: true,
  },
  {
    id: 4,
    paymentCode: "PAG-000844",
    treatmentReference: "Cirurgia de implante",
    issuerType: "Clínica Pessoa Jurídica",
    issuerName: "DentalPos Clínica",
    issuerDocument: "12.345.678/0001-90",
    payer: {
      name: "Empresa Pagadora Ltda.",
      document: "45.678.901/0001-22",
      email: "financeiro@empresapagadora.com.br",
      phone: "44999990004",
    },
    patient: {
      name: "João Ribeiro",
      document: "444.555.666-77",
    },
    paymentDate: "01/08/2026",
    competence: "08/2026",
    grossValue: 4200,
    discountValue: 0,
    receivedValue: 4200,
    paymentMethod: "Boleto",
    installmentNumber: 1,
    totalInstallments: 3,
    fiscalDocumentKind: "NFS-e",
    status: "Falha na emissão",
    accountantApprovalRequired: true,
    accountantApproved: true,
    notes:
      "O tomador é diferente do paciente. Revisar cadastro fiscal.",
  },
  {
    id: 5,
    paymentCode: "PAG-000845",
    treatmentReference: "Avaliação clínica",
    issuerType: "Dentista Pessoa Física",
    issuerName: "Dra. Cássia Ravel",
    issuerDocument: "111.222.333-44",
    payer: {
      name: "Ana Costa",
      document: "",
      email: "ana@email.com",
      phone: "44999990005",
    },
    patient: {
      name: "Ana Costa",
      document: "555.666.777-88",
    },
    paymentDate: "01/08/2026",
    competence: "08/2026",
    grossValue: 350,
    discountValue: 0,
    receivedValue: 350,
    paymentMethod: "Dinheiro",
    installmentNumber: 1,
    totalInstallments: 1,
    fiscalDocumentKind: "Sem definição",
    status: "Documento aguardando emissão",
    accountantApprovalRequired: true,
    accountantApproved: false,
    notes:
      "CPF do pagador não informado.",
  },
];

export const fiscalSendRecords: FiscalSendRecord[] = [
  {
    id: 1,
    fiscalPaymentId: 3,
    recipientName: "Fernanda Lima",
    channel: "E-mail",
    destination: "fernanda@email.com",
    status: "Entregue",
    sentAt: "02/08/2026, 13:25",
    deliveredAt: "02/08/2026, 13:26",
  },
  {
    id: 2,
    fiscalPaymentId: 3,
    recipientName: "Fernanda Lima",
    channel: "WhatsApp",
    destination: "44999990003",
    status: "Lido",
    sentAt: "02/08/2026, 13:25",
    deliveredAt: "02/08/2026, 13:25",
    readAt: "02/08/2026, 13:28",
  },
  {
    id: 3,
    fiscalPaymentId: 1,
    recipientName: "Maria Oliveira",
    channel: "Telegram",
    destination: "@mariaoliveira",
    status: "Programado",
    scheduledAt: "02/08/2026, 17:05",
  },
  {
    id: 4,
    fiscalPaymentId: 4,
    recipientName: "Empresa Pagadora Ltda.",
    channel: "E-mail",
    destination: "financeiro@empresapagadora.com.br",
    status: "Não enviado",
  },
  {
    id: 5,
    fiscalPaymentId: 4,
    recipientName: "Empresa Pagadora Ltda.",
    channel: "SMS",
    destination: "44999990004",
    status: "Falhou",
    sentAt: "01/08/2026, 18:00",
    failureReason:
      "Documento fiscal ainda não foi emitido.",
  },
];

export const fiscalAlerts: FiscalAlert[] = [
  {
    id: 1,
    fiscalPaymentId: 2,
    title: "Receita Saúde pendente",
    description:
      "Pagamento de pessoa física confirmado, mas o recibo ainda não possui protocolo registrado.",
    priority: "Alta",
    createdAt: "02/08/2026, 14:00",
    resolved: false,
  },
  {
    id: 2,
    fiscalPaymentId: 4,
    title: "Falha na emissão da NFS-e",
    description:
      "Revisar dados do tomador e reenviar a solicitação de emissão.",
    priority: "Crítica",
    createdAt: "01/08/2026, 18:05",
    resolved: false,
  },
  {
    id: 3,
    fiscalPaymentId: 5,
    title: "CPF do pagador ausente",
    description:
      "O documento fiscal não poderá ser concluído até a correção do cadastro.",
    priority: "Crítica",
    createdAt: "01/08/2026, 17:40",
    resolved: false,
  },
  {
    id: 4,
    fiscalPaymentId: 3,
    title: "Documento enviado ao pagador",
    description:
      "A NFS-e foi enviada por e-mail e WhatsApp.",
    priority: "Baixa",
    createdAt: "02/08/2026, 13:28",
    resolved: true,
  },
];

export function formatFiscalMoney(
  value: number,
): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function getFiscalAutomationSummary(): FiscalAutomationSummary {
  const confirmedPayments = fiscalPayments.filter(
    (payment) =>
      payment.status !== "Pagamento pendente",
  ).length;

  const pendingDocuments = fiscalPayments.filter(
    (payment) =>
      payment.status === "Documento aguardando emissão" ||
      payment.status === "Aguardando Receita Saúde" ||
      payment.status === "Nota programada" ||
      payment.status === "Falha na emissão",
  ).length;

  const issuedDocuments = fiscalPayments.filter(
    (payment) =>
      payment.status === "Documento emitido" ||
      payment.status === "Documento enviado" ||
      payment.status === "Documento entregue" ||
      payment.status === "Fiscalmente concluído",
  ).length;

  const deliveryFailures = fiscalSendRecords.filter(
    (record) => record.status === "Falhou",
  ).length;

  const pendingTaxValue = fiscalPayments
    .filter(
      (payment) =>
        payment.status !== "Fiscalmente concluído" &&
        payment.status !== "Documento entregue",
    )
    .reduce(
      (total, payment) =>
        total + payment.receivedValue,
      0,
    );

  return {
    confirmedPayments,
    pendingDocuments,
    issuedDocuments,
    deliveryFailures,
    pendingTaxValue,
  };
}

export function getFiscalDocumentLabel(
  payment: FiscalPayment,
): FiscalDocumentKind {
  if (
    payment.issuerType === "Dentista Pessoa Física"
  ) {
    return "Receita Saúde";
  }

  return "NFS-e";
}

export function requiresImmediateFiscalAction(
  status: FiscalAutomationStatus,
): boolean {
  return (
    status === "Documento aguardando emissão" ||
    status === "Aguardando Receita Saúde" ||
    status === "Falha na emissão"
  );
}