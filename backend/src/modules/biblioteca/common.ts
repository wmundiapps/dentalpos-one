import { z } from 'zod'
import { AcademicRole } from '../academico/middleware'
import { listaDeTexto, normalizarIsbn } from './logic'

export const BIB: AcademicRole[] = ['LIBRARIAN']
export const LEITURA: AcademicRole[] = ['LIBRARIAN', 'COORDINATOR', 'TEACHER', 'SECRETARY', 'STAFF']
export const USUARIOS: AcademicRole[] = ['LIBRARIAN', 'COORDINATOR', 'TEACHER', 'SECRETARY', 'STAFF', 'STUDENT', 'FINANCE', 'SUPPORT']
export const MOD = 'biblioteca'

export const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status })

export const strList = z.preprocess((v) => (v == null ? undefined : listaDeTexto(v)), z.array(z.string()).optional())
export const optDate = z.preprocess((v) => (v === '' || v == null ? undefined : typeof v === 'string' || v instanceof Date ? new Date(v as any) : v), z.date().optional())
export const optStr = z.string().trim().optional().nullable()

// campos denormalizados de obra (busca)
export function derivarObra(d: any) {
  const out: any = { ...d }
  if (d.autores !== undefined) out.autoresTexto = (d.autores ?? []).join('; ')
  if (d.assuntos !== undefined) out.assuntosTexto = (d.assuntos ?? []).join('; ')
  if (d.isbn !== undefined) out.isbn = normalizarIsbn(d.isbn)
  return out
}
