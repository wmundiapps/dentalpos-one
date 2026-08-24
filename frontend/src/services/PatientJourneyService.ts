import type {
  JourneyBottleneck,
  JourneyConversion,
  PatientJourney,
} from "../types/patientJourney";

export const patientJourneys: PatientJourney[] = [
  {
    id: 1,
    patientName: "Maria Oliveira",
    patientCode: "MARI",
    treatment: "Reabilitação implantossuportada",
    professionalName: "Dr. Robson",
    origin: "Instagram",
    estimatedValue: 23250,
    approvedValue: 12450,
    currentStage: "Financeiro",
    riskLevel: "Normal",
    lastInteraction: "Hoje, 10:25",
    nextRecommendedAction:
      "Confirmar pagamento da entrada e agendar a fase cirúrgica.",
    stages: [
      {
        id: 1,
        order: 1,
        title: "Lead recebido",
        module: "CRM",
        status: "Concluída",
        date: "20/07/2026",
        responsible: "Juliana",
        daysInStage: 0,
        description:
          "Lead captado por campanha de implantodontia no Instagram.",
      },
      {
        id: 2,
        order: 2,
        title: "Primeiro contato",
        module: "Comunicações",
        status: "Concluída",
        date: "20/07/2026",
        responsible: "Juliana",
        daysInStage: 0,
        description:
          "Contato realizado pelo WhatsApp em 12 minutos.",
      },
      {
        id: 3,
        order: 3,
        title: "Avaliação clínica",
        module: "Agenda",
        status: "Concluída",
        date: "23/07/2026",
        responsible: "Dr. Robson",
        daysInStage: 3,
        description:
          "Avaliação, fotografias e solicitação de tomografia realizadas.",
      },
      {
        id: 4,
        order: 4,
        title: "Planejamento",
        module: "Prontuário",
        status: "Concluída",
        date: "27/07/2026",
        responsible: "Dr. Robson",
        daysInStage: 4,
        description:
          "Planejamento implantodôntico concluído.",
      },
      {
        id: 5,
        order: 5,
        title: "Orçamento apresentado",
        module: "Comercial",
        status: "Concluída",
        date: "28/07/2026",
        responsible: "Juliana",
        daysInStage: 1,
        description:
          "Paciente recebeu as opções Essencial, Recomendada e Completa.",
      },
      {
        id: 6,
        order: 6,
        title: "Aprovação parcial",
        module: "CRM",
        status: "Concluída",
        date: "31/07/2026",
        responsible: "Juliana",
        daysInStage: 3,
        description:
          "Paciente aprovou as fases iniciais do tratamento.",
      },
      {
        id: 7,
        order: 7,
        title: "Pagamento da entrada",
        module: "Financeiro",
        status: "Em andamento",
        responsible: "Financeiro",
        daysInStage: 2,
        description:
          "Cobrança enviada. Aguardando confirmação do pagamento.",
      },
      {
        id: 8,
        order: 8,
        title: "Cirurgia",
        module: "Agenda",
        status: "Pendente",
        responsible: "Dr. Robson",
        daysInStage: 0,
        description:
          "Será agendada após a confirmação financeira.",
      },
      {
        id: 9,
        order: 9,
        title: "Laboratório",
        module: "Laboratório",
        status: "Pendente",
        daysInStage: 0,
        description:
          "Etapa laboratorial ainda não iniciada.",
      },
      {
        id: 10,
        order: 10,
        title: "Controle e recall",
        module: "Recall",
        status: "Pendente",
        daysInStage: 0,
        description:
          "Será programado após o término do tratamento.",
      },
    ],
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    patientCode: "CARL",
    treatment: "Protocolo superior",
    professionalName: "Dra. Cássia",
    origin: "Google",
    estimatedValue: 28000,
    approvedValue: 0,
    currentStage: "Negociação",
    riskLevel: "Atenção",
    lastInteraction: "Há 12 dias",
    nextRecommendedAction:
      "Realizar ligação, oferecer parcelamento e reapresentar o plano essencial.",
    stages: [
      {
        id: 11,
        order: 1,
        title: "Lead recebido",
        module: "CRM",
        status: "Concluída",
        date: "05/07/2026",
        responsible: "Roberta",
        daysInStage: 0,
        description: "Lead captado pelo Google.",
      },
      {
        id: 12,
        order: 2,
        title: "Avaliação clínica",
        module: "Agenda",
        status: "Concluída",
        date: "09/07/2026",
        responsible: "Dra. Cássia",
        daysInStage: 4,
        description: "Avaliação e documentação concluídas.",
      },
      {
        id: 13,
        order: 3,
        title: "Orçamento apresentado",
        module: "Comercial",
        status: "Concluída",
        date: "14/07/2026",
        responsible: "Roberta",
        daysInStage: 5,
        description: "Proposta enviada ao paciente.",
      },
      {
        id: 14,
        order: 4,
        title: "Negociação",
        module: "CRM",
        status: "Atrasada",
        responsible: "Roberta",
        daysInStage: 12,
        description:
          "Paciente não respondeu aos últimos contatos.",
      },
    ],
  },
  {
    id: 3,
    patientName: "Fernanda Lima",
    patientCode: "FERN",
    treatment: "Ortodontia",
    professionalName: "Dra. Cássia",
    origin: "Indicação",
    estimatedValue: 7800,
    approvedValue: 7800,
    currentStage: "Tratamento",
    riskLevel: "Normal",
    lastInteraction: "Ontem, 16:30",
    nextRecommendedAction:
      "Manter sequência de consultas e monitorar assiduidade.",
    stages: [
      {
        id: 15,
        order: 1,
        title: "Avaliação",
        module: "Agenda",
        status: "Concluída",
        date: "10/06/2026",
        responsible: "Dra. Cássia",
        daysInStage: 0,
        description: "Avaliação inicial concluída.",
      },
      {
        id: 16,
        order: 2,
        title: "Planejamento",
        module: "Prontuário",
        status: "Concluída",
        date: "17/06/2026",
        responsible: "Dra. Cássia",
        daysInStage: 7,
        description: "Planejamento ortodôntico finalizado.",
      },
      {
        id: 17,
        order: 3,
        title: "Aprovação",
        module: "Comercial",
        status: "Concluída",
        date: "19/06/2026",
        responsible: "Juliana",
        daysInStage: 2,
        description: "Tratamento integral aprovado.",
      },
      {
        id: 18,
        order: 4,
        title: "Tratamento",
        module: "Agenda",
        status: "Em andamento",
        responsible: "Dra. Cássia",
        daysInStage: 44,
        description: "Paciente em acompanhamento ortodôntico.",
      },
    ],
  },
];

export const journeyConversions: JourneyConversion[] = [
  {
    stage: "Leads",
    patients: 100,
    conversionRate: 100,
  },
  {
    stage: "Contatados",
    patients: 92,
    conversionRate: 92,
  },
  {
    stage: "Agendados",
    patients: 84,
    conversionRate: 84,
  },
  {
    stage: "Compareceram",
    patients: 71,
    conversionRate: 71,
  },
  {
    stage: "Receberam orçamento",
    patients: 58,
    conversionRate: 58,
  },
  {
    stage: "Aprovaram",
    patients: 31,
    conversionRate: 31,
  },
  {
    stage: "Iniciaram tratamento",
    patients: 27,
    conversionRate: 27,
  },
  {
    stage: "Finalizaram",
    patients: 18,
    conversionRate: 18,
  },
];

export const journeyBottlenecks: JourneyBottleneck[] = [
  {
    module: "Orçamento → Aprovação",
    severity: 88,
    description:
      "Maior perda da jornada: 27 pacientes não avançaram após a apresentação do orçamento.",
  },
  {
    module: "Laboratório",
    severity: 64,
    description:
      "O prazo laboratorial acrescenta, em média, 4,8 dias ao tratamento.",
  },
  {
    module: "Comparecimento",
    severity: 42,
    description:
      "Treze pacientes agendados não compareceram à avaliação.",
  },
  {
    module: "Financeiro",
    severity: 36,
    description:
      "Alguns tratamentos aguardam pagamento da entrada para iniciar.",
  },
];

export function calculateJourneyPipelineValue(): number {
  return patientJourneys.reduce(
    (total, journey) => total + journey.estimatedValue,
    0,
  );
}

export function calculateJourneyApprovedValue(): number {
  return patientJourneys.reduce(
    (total, journey) => total + journey.approvedValue,
    0,
  );
}

export function countJourneyRisks(): number {
  return patientJourneys.filter(
    (journey) => journey.riskLevel === "Risco de perda",
  ).length;
}

export function countJourneyWarnings(): number {
  return patientJourneys.filter(
    (journey) => journey.riskLevel === "Atenção",
  ).length;
}