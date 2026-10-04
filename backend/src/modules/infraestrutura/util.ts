import { prisma } from '../../lib/prisma'
import { AcademicRole } from '../academico/middleware'

export const MODULO = 'infraestrutura'
// Gestão de infraestrutura (ADMIN/OWNER/RECTOR/BOARD sempre têm acesso).
export const GESTAO: AcademicRole[] = ['FACILITIES']
export const LEITURA: AcademicRole[] = ['FACILITIES', 'COORDINATOR', 'FINANCE', 'SUPPLIES', 'SECRETARY']

// Numeração atômica por chave (ex.: "OS-2025", "CH-2025", "PAT").
export async function nextSeq(tenantId: string, chave: string): Promise<number> {
  const r = await prisma.infSequencia.upsert({
    where: { tenantId_chave: { tenantId, chave } },
    create: { tenantId, chave, valor: 1 },
    update: { valor: { increment: 1 } },
  })
  return r.valor
}

export function fail(status: number, msg: string): never {
  throw Object.assign(new Error(msg), { status })
}

export async function ensureSpace(tenantId: string, spaceId?: string | null) {
  if (!spaceId) return null
  const s = await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId } })
  if (!s) fail(400, 'Espaço (spaceId) não encontrado.')
  return s
}

export async function ensureBem(tenantId: string, bemId?: string | null) {
  if (!bemId) return null
  const b = await prisma.infBem.findFirst({ where: { id: bemId, tenantId } })
  if (!b) fail(400, 'Bem (bemId) não encontrado.')
  return b
}

export function parseDateQ(v: unknown, fallback: Date): Date {
  if (typeof v !== 'string' || !v) return fallback
  const d = new Date(v)
  return isNaN(d.getTime()) ? fallback : d
}

export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
