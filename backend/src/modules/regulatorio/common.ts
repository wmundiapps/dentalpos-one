import { AcademicRole } from '../academico/middleware'

export const MODULO = 'regulatorio'
export const READ: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'STAFF']
export const WRITE: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
// quem pode atualizar itens de checklist (responsáveis pelas evidências)
export const EVIDENCIA: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'STAFF', 'FACILITIES', 'LIBRARIAN', 'FINANCE']

export const bad = (msg: string, status = 400) => Object.assign(new Error(msg), { status })
