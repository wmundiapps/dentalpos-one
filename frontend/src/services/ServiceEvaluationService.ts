import type {
  ServiceEvaluation,
} from "../types/serviceEvaluation";

export const serviceEvaluations: ServiceEvaluation[] = [
  {
    id: 1,
    patientName: "Maria Oliveira",
    patientCode: "MARI",
    professionalName: "Dr. Robson",
    appointmentDate: "02/08/2026",
    procedure: "Avaliação implantodôntica",
    channel: "WhatsApp",
    status: "Respondida",
    professionalScore: 10,
    clinicPresentationScore: 9,
    procedureScore: 10,
    serviceScore: 10,
    npsScore: 10,
    comments:
      "Atendimento excelente e explicações muito claras.",
    sentAt: "02/08/2026, 10:15",
    answeredAt: "02/08/2026, 10:32",
    anonymous: false,
  },
  {
    id: 2,
    patientName: "Carlos Pereira",
    patientCode: "CARL",
    professionalName: "Dra. Cássia",
    appointmentDate: "02/08/2026",
    procedure: "Prova de prótese",
    channel: "Terminal da clínica",
    status: "Respondida",
    professionalScore: 9,
    clinicPresentationScore: 10,
    procedureScore: 9,
    serviceScore: 9,
    npsScore: 9,
    comments:
      "Fui muito bem atendido e o ambiente estava organizado.",
    answeredAt: "02/08/2026, 11:05",
    anonymous: false,
  },
  {
    id: 3,
    patientName: "Fernanda Lima",
    patientCode: "FERN",
    professionalName: "Dra. Cássia",
    appointmentDate: "02/08/2026",
    procedure: "Manutenção ortodôntica",
    channel: "E-mail",
    status: "Enviada",
    sentAt: "02/08/2026, 12:00",
    anonymous: false,
  },
  {
    id: 4,
    patientName: "João Ribeiro",
    patientCode: "JOAO",
    professionalName: "Dr. Robson",
    appointmentDate: "02/08/2026",
    procedure: "Cirurgia de implante",
    channel: "SMS",
    status: "Pendente",
    anonymous: false,
  },
  {
    id: 5,
    patientName: "Avaliação anônima",
    patientCode: "ANON",
    professionalName: "Equipe DentalPos",
    appointmentDate: "01/08/2026",
    procedure: "Atendimento clínico",
    channel: "QR Code",
    status: "Respondida",
    professionalScore: 8,
    clinicPresentationScore: 9,
    procedureScore: 8,
    serviceScore: 8,
    npsScore: 8,
    comments:
      "Bom atendimento. O tempo de espera poderia ser menor.",
    answeredAt: "01/08/2026, 17:20",
    anonymous: true,
  },
];

function getAnsweredEvaluations(): ServiceEvaluation[] {
  return serviceEvaluations.filter(
    (evaluation) => evaluation.status === "Respondida",
  );
}

function calculateAverage(
  values: Array<number | undefined>,
): number {
  const validValues = values.filter(
    (value): value is number =>
      typeof value === "number",
  );

  if (validValues.length === 0) {
    return 0;
  }

  const total = validValues.reduce(
    (sum, value) => sum + value,
    0,
  );

  return total / validValues.length;
}

export function calculateProfessionalAverage(): number {
  return calculateAverage(
    getAnsweredEvaluations().map(
      (evaluation) => evaluation.professionalScore,
    ),
  );
}

export function calculateClinicAverage(): number {
  return calculateAverage(
    getAnsweredEvaluations().map(
      (evaluation) =>
        evaluation.clinicPresentationScore,
    ),
  );
}

export function calculateProcedureAverage(): number {
  return calculateAverage(
    getAnsweredEvaluations().map(
      (evaluation) => evaluation.procedureScore,
    ),
  );
}

export function calculateServiceAverage(): number {
  return calculateAverage(
    getAnsweredEvaluations().map(
      (evaluation) => evaluation.serviceScore,
    ),
  );
}

export function calculateNps(): number {
  const answered = getAnsweredEvaluations().filter(
    (evaluation) =>
      typeof evaluation.npsScore === "number",
  );

  if (answered.length === 0) {
    return 0;
  }

  const promoters = answered.filter(
    (evaluation) =>
      (evaluation.npsScore ?? 0) >= 9,
  ).length;

  const detractors = answered.filter(
    (evaluation) =>
      (evaluation.npsScore ?? 0) <= 6,
  ).length;

  return Math.round(
    ((promoters - detractors) / answered.length) *
      100,
  );
}

export function countPendingEvaluations(): number {
  return serviceEvaluations.filter(
    (evaluation) =>
      evaluation.status === "Pendente" ||
      evaluation.status === "Enviada",
  ).length;
}