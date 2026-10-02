import { AcademicRole } from '../academico/middleware'

// Quem atende/consulta a comunicação. ADMIN/OWNER/RECTOR/BOARD entram automaticamente.
export const ATENDE: AcademicRole[] = ['SUPPORT', 'SECRETARY', 'ADMISSIONS', 'FINANCE', 'MARKETING', 'COORDINATOR', 'STAFF']
export const GESTAO_COM: AcademicRole[] = ['SUPPORT', 'MARKETING']
export const COBRANCA: AcademicRole[] = ['FINANCE']
export const MARKETING: AcademicRole[] = ['MARKETING']
export const APROVADORES: AcademicRole[] = ['MARKETING', 'COORDINATOR']
