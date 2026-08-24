export type CourseAccessType =
  | "Gratuito"
  | "Compra única"
  | "Assinatura"
  | "Compra ou assinatura";

export type CourseStatus =
  | "Rascunho"
  | "Em análise"
  | "Publicado"
  | "Suspenso";

export type CourseCurrency =
  | "BRL"
  | "USD"
  | "EUR";

export interface EducationalCourse {
  id: number;
  title: string;
  teacherName: string;
  category: string;
  description: string;
  teaserDurationMinutes: number;
  totalDurationHours: number;
  accessType: CourseAccessType;
  price: number;
  currency: CourseCurrency;
  status: CourseStatus;
  studentCount: number;
  rating: number;
  platformCommissionPercent: number;
  certificateAvailable: boolean;
  featured: boolean;
}