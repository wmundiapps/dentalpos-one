import { AcademicRole } from '../academico/middleware'

// ADMIN/OWNER/RECTOR/BOARD entram automaticamente (requireRole). Cobrança é dado financeiro sensível: só o financeiro opera.
export const OPERA_COB: AcademicRole[] = ['FINANCE']
export const LE_PAINEL_COB: AcademicRole[] = ['FINANCE', 'COORDINATOR']
// O módulo Jurídico (outro agente) usa o papel JURIDICO; o tipo AcademicRole pode ainda não conhecê-lo.
export const JURIDICO: AcademicRole[] = ['JURIDICO' as unknown as AcademicRole, 'FINANCE']
