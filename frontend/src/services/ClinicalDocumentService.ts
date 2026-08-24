import type { ClinicalDocument } from "../types/clinicalDocument";

export const clinicalDocuments: ClinicalDocument[] = [
  {
    id: 1,
    patientName: "Maria Oliveira",
    patientCode: "MARI",
    professionalName: "Dr. Robson",
    documentType: "Receita",
    title: "Prescrição pós-operatória",
    content:
      "Medicação prescrita conforme avaliação clínica e procedimento realizado.",
    issuedAt: "02/08/2026",
    status: "Assinado",
    digitallySigned: true,
    sentToPatient: true,
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    patientCode: "CARL",
    professionalName: "Dra. Cássia",
    documentType: "Solicitação de exame",
    title: "Solicitação de tomografia",
    content:
      "Solicitada tomografia computadorizada para planejamento implantodôntico.",
    issuedAt: "02/08/2026",
    status: "Emitido",
    digitallySigned: true,
    sentToPatient: true,
  },
  {
    id: 3,
    patientName: "Fernanda Lima",
    patientCode: "FERN",
    professionalName: "Dra. Cássia",
    documentType: "Atestado",
    title: "Atestado odontológico",
    content:
      "Paciente esteve em atendimento odontológico nesta data.",
    issuedAt: "01/08/2026",
    status: "Assinado",
    digitallySigned: true,
    sentToPatient: false,
  },
  {
    id: 4,
    patientName: "João Ribeiro",
    patientCode: "JOAO",
    professionalName: "Dr. Robson",
    documentType: "Termo de consentimento",
    title: "Consentimento para cirurgia de implantes",
    content:
      "Termo de consentimento informado referente ao procedimento cirúrgico planejado.",
    issuedAt: "01/08/2026",
    status: "Rascunho",
    digitallySigned: false,
    sentToPatient: false,
  },
  {
    id: 5,
    patientName: "Ana Costa",
    patientCode: "ANAC",
    professionalName: "Dra. Juliana",
    documentType: "Garantia",
    title: "Termo de garantia do tratamento",
    content:
      "Condições, responsabilidades e prazo da garantia contratada.",
    issuedAt: "31/07/2026",
    status: "Emitido",
    digitallySigned: false,
    sentToPatient: true,
  },
];