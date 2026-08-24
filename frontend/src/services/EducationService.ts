import type {
  CourseCurrency,
  EducationalCourse,
} from "../types/education";

export const educationalCourses: EducationalCourse[] = [
  {
    id: 1,
    title: "Introdução ao Sistema Multiple W48",
    teacherName: "Prof. Me. Robson Ravel",
    category: "Implantodontia",
    description:
      "Fundamentos, indicações clínicas e aplicações protéticas do sistema Multiple W48.",
    teaserDurationMinutes: 12,
    totalDurationHours: 8,
    accessType: "Compra ou assinatura",
    price: 497,
    currency: "BRL",
    status: "Publicado",
    studentCount: 128,
    rating: 4.9,
    platformCommissionPercent: 20,
    certificateAvailable: true,
    featured: true,
  },
  {
    id: 2,
    title: "Planejamento de Próteses sobre Implantes",
    teacherName: "Prof. Convidado",
    category: "Prótese Dentária",
    description:
      "Sequência clínica e laboratorial para reabilitações sobre implantes.",
    teaserDurationMinutes: 10,
    totalDurationHours: 12,
    accessType: "Compra única",
    price: 129,
    currency: "USD",
    status: "Publicado",
    studentCount: 84,
    rating: 4.8,
    platformCommissionPercent: 20,
    certificateAvailable: true,
    featured: true,
  },
  {
    id: 3,
    title: "Fotografia Odontológica Aplicada",
    teacherName: "Dra. Mariana Costa",
    category: "Fotografia",
    description:
      "Protocolo prático para documentação clínica, marketing e acompanhamento de tratamentos.",
    teaserDurationMinutes: 8,
    totalDurationHours: 6,
    accessType: "Assinatura",
    price: 39,
    currency: "EUR",
    status: "Publicado",
    studentCount: 215,
    rating: 4.7,
    platformCommissionPercent: 20,
    certificateAvailable: true,
    featured: false,
  },
  {
    id: 4,
    title: "Biossegurança na Clínica Odontológica",
    teacherName: "Equipe DentalPos",
    category: "Biossegurança",
    description:
      "Rotinas, POPs, esterilização, resíduos e prevenção de riscos.",
    teaserDurationMinutes: 15,
    totalDurationHours: 10,
    accessType: "Gratuito",
    price: 0,
    currency: "BRL",
    status: "Publicado",
    studentCount: 347,
    rating: 4.9,
    platformCommissionPercent: 0,
    certificateAvailable: true,
    featured: false,
  },
];

export function formatCoursePrice(
  value: number,
  currency: CourseCurrency,
): string {
  if (value === 0) {
    return "Gratuito";
  }

  const locale =
    currency === "BRL"
      ? "pt-BR"
      : currency === "EUR"
        ? "it-IT"
        : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}

export function calculatePlatformCommission(
  course: EducationalCourse,
): number {
  return (
    course.price *
    (course.platformCommissionPercent / 100)
  );
}

export function calculateTeacherRevenue(
  course: EducationalCourse,
): number {
  return (
    course.price -
    calculatePlatformCommission(course)
  );
}