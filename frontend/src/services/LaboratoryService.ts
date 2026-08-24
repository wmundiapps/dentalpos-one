import type { LaboratoryWork } from "../types/laboratory";

export const laboratoryWorks: LaboratoryWork[] = [
  {
    id: 1,
    trackingCode: "LAB-2026-0001",
    patientCode: "MARI",
    dentistName: "Dr. Robson",
    clinicName: "DentalPos Maringá",
    workType: "Protocolo sobre implantes",
    material: "Zircônia",
    responsibleTechnician: "Carlos",
    entryDate: "29/07/2026",
    dueDate: "05/08/2026",
    status: "CAD",
    priority: "Alta",
    hasCadCamFile: true,
    observations: "Arquivo STL recebido e conferido.",
  },
  {
    id: 2,
    trackingCode: "LAB-2026-0002",
    patientCode: "JOÃO",
    dentistName: "Dra. Cássia",
    clinicName: "DentalPos Maringá",
    workType: "Coroa unitária",
    material: "Dissilicato de lítio",
    responsibleTechnician: "Fernanda",
    entryDate: "30/07/2026",
    dueDate: "04/08/2026",
    status: "Acabamento",
    priority: "Normal",
    hasCadCamFile: true,
  },
  {
    id: 3,
    trackingCode: "LAB-2026-0003",
    patientCode: "ANAC",
    dentistName: "Dr. Renato",
    clinicName: "Clínica Parceira",
    workType: "Guia cirúrgico",
    material: "Resina biocompatível",
    responsibleTechnician: "Carlos",
    entryDate: "31/07/2026",
    dueDate: "03/08/2026",
    status: "Atrasado",
    priority: "Urgente",
    hasCadCamFile: true,
    observations: "Aguardando validação do planejamento.",
  },
  {
    id: 4,
    trackingCode: "LAB-2026-0004",
    patientCode: "PEDR",
    dentistName: "Dr. Robson",
    clinicName: "DentalPos Maringá",
    workType: "Prótese protocolo em resina",
    material: "Resina acrílica",
    responsibleTechnician: "Marcos",
    entryDate: "01/08/2026",
    dueDate: "08/08/2026",
    status: "Triagem",
    priority: "Normal",
    hasCadCamFile: false,
  },
  {
    id: 5,
    trackingCode: "LAB-2026-0005",
    patientCode: "LUCI",
    dentistName: "Dra. Juliana",
    clinicName: "Clínica Parceira",
    workType: "Facetas",
    material: "Cerâmica",
    responsibleTechnician: "Fernanda",
    entryDate: "28/07/2026",
    dueDate: "02/08/2026",
    status: "Controle de qualidade",
    priority: "Alta",
    hasCadCamFile: true,
  },
];

export function countLaboratoryDelays(): number {
  return laboratoryWorks.filter(
    (work) => work.status === "Atrasado",
  ).length;
}

export function countCadCamFiles(): number {
  return laboratoryWorks.filter(
    (work) => work.hasCadCamFile,
  ).length;
}