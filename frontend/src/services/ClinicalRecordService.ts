import type { ClinicalRecord } from "../types/clinicalRecord";

export const clinicalRecords: ClinicalRecord[] = [
  {
    id: 1,
    patientName: "Maria Oliveira",
    patientCode: "MARI",
    professionalName: "Dr. Robson",
    mainComplaint:
      "Dificuldade mastigatória e ausência de dentes posteriores.",
    diagnosis:
      "Edentulismo parcial posterior com necessidade de reabilitação implantossuportada.",
    treatmentPlan:
      "Instalação de implantes, acompanhamento da osseointegração e prótese definitiva.",
    allergies: ["Dipirona"],
    medications: ["Losartana 50 mg"],
    status: "Em tratamento",
    photos: [
      {
        id: 1,
        title: "Fotografia inicial",
        category: "Inicial",
        imageUrl: "",
        createdAt: "01/08/2026",
      },
      {
        id: 2,
        title: "Vista intraoral frontal",
        category: "Intraoral",
        imageUrl: "",
        createdAt: "01/08/2026",
      },
      {
        id: 3,
        title: "Tomografia inicial",
        category: "Radiografia",
        imageUrl: "",
        createdAt: "01/08/2026",
      },
    ],
    evolutions: [
      {
        id: 1,
        date: "01/08/2026",
        professionalName: "Dr. Robson",
        procedure: "Avaliação inicial",
        description:
          "Paciente avaliada clinicamente. Solicitada tomografia para planejamento.",
      },
      {
        id: 2,
        date: "02/08/2026",
        professionalName: "Dr. Robson",
        procedure: "Planejamento implantodôntico",
        description:
          "Exame analisado e proposta terapêutica apresentada à paciente.",
      },
    ],
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    patientCode: "CARL",
    professionalName: "Dra. Cássia",
    mainComplaint:
      "Insatisfação com prótese removível e dificuldade para sorrir.",
    diagnosis:
      "Edentulismo total superior com prótese instável.",
    treatmentPlan:
      "Avaliação para protocolo sobre implantes e prótese provisória.",
    allergies: [],
    medications: [],
    status: "Em planejamento",
    photos: [
      {
        id: 4,
        title: "Sorriso inicial",
        category: "Extraoral",
        imageUrl: "",
        createdAt: "31/07/2026",
      },
    ],
    evolutions: [
      {
        id: 3,
        date: "31/07/2026",
        professionalName: "Dra. Cássia",
        procedure: "Consulta inicial",
        description:
          "Realizada avaliação clínica, fotografias e solicitação de exames.",
      },
    ],
  },
];

export function getClinicalRecordById(
  recordId: number,
): ClinicalRecord | undefined {
  return clinicalRecords.find(
    (record) => record.id === recordId,
  );
}