import type { PatientRecall } from "../types/recall";

export const patientRecalls: PatientRecall[] = [
  {
    id: 1,
    patientName: "Maria Oliveira",
    patientCode: "MARI",
    phone: "(44) 99999-0001",
    professionalName: "Dr. Robson",
    treatment: "Implantodontia",
    lastAppointment: "02/07/2026",
    nextContactDate: "02/08/2026",
    period: "1 mês",
    status: "Contato pendente",
    automaticMessage: true,
    notes: "Confirmar evolução pós-operatória.",
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    patientCode: "CARL",
    phone: "(44) 99999-0002",
    professionalName: "Dra. Cássia",
    treatment: "Prótese protocolo",
    lastAppointment: "02/06/2026",
    nextContactDate: "02/08/2026",
    period: "2 meses",
    status: "Mensagem enviada",
    automaticMessage: true,
  },
  {
    id: 3,
    patientName: "Fernanda Lima",
    patientCode: "FERN",
    phone: "(44) 99999-0003",
    professionalName: "Dra. Cássia",
    treatment: "Ortodontia",
    lastAppointment: "02/05/2026",
    nextContactDate: "02/08/2026",
    period: "3 meses",
    status: "Agendado",
    automaticMessage: true,
  },
  {
    id: 4,
    patientName: "João Ribeiro",
    patientCode: "JOAO",
    phone: "(44) 99999-0004",
    professionalName: "Dr. Robson",
    treatment: "Cirurgia de implante",
    lastAppointment: "02/02/2026",
    nextContactDate: "02/08/2026",
    period: "6 meses",
    status: "Sem resposta",
    automaticMessage: false,
    notes: "Realizar contato por ligação.",
  },
  {
    id: 5,
    patientName: "Ana Costa",
    patientCode: "ANAC",
    phone: "(44) 99999-0005",
    professionalName: "Dra. Juliana",
    treatment: "Harmonização Orofacial",
    lastAppointment: "02/08/2025",
    nextContactDate: "02/08/2026",
    period: "1 ano",
    status: "Programado",
    automaticMessage: true,
  },
];

export function countPendingRecalls(): number {
  return patientRecalls.filter(
    (recall) =>
      recall.status === "Contato pendente" ||
      recall.status === "Programado",
  ).length;
}

export function countScheduledRecalls(): number {
  return patientRecalls.filter(
    (recall) => recall.status === "Agendado",
  ).length;
}

export function countAutomaticRecalls(): number {
  return patientRecalls.filter(
    (recall) => recall.automaticMessage,
  ).length;
}