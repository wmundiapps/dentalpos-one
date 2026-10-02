import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest } from '../academico/middleware'
import { formatNumero } from './logic'

export const MODULO = 'secretaria'

// Papéis
export const SEC: AcademicRole[] = ['SECRETARY']
export const SEC_GESTAO: AcademicRole[] = ['SECRETARY', 'COORDINATOR']
export const SEC_LEITURA: AcademicRole[] = ['SECRETARY', 'COORDINATOR', 'STAFF', 'FINANCE', 'ADMISSIONS', 'SUPPORT', 'TEACHER']
export const ALUNO: AcademicRole[] = ['STUDENT']

// Contador atômico por tenant+chave: UPDATE ... SET valor = valor + 1 (atômico no PostgreSQL).
// Sem linha: cria com 1; em corrida (P2002) tenta novamente o incremento.
export async function proximoNumero(tenantId: string, chave: string, tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const r = await tx.secContador.update({ where: { tenantId_chave: { tenantId, chave } }, data: { valor: { increment: 1 } } })
      return r.valor
    } catch (e: any) {
      if (e?.code !== 'P2025') throw e
      try {
        const c = await tx.secContador.create({ data: { tenantId, chave, valor: 1 } })
        return c.valor
      } catch (e2: any) {
        if (e2?.code !== 'P2002') throw e2
        // outro processo criou primeiro: repete o incremento
      }
    }
  }
  throw Object.assign(new Error('Não foi possível gerar a numeração (concorrência).'), { status: 503 })
}

export async function proximoProtocolo(tenantId: string, now = new Date()) {
  const ano = now.getFullYear()
  const seq = await proximoNumero(tenantId, `PROTOCOLO:${ano}`)
  return { ano, seq, numero: formatNumero(ano, seq) }
}

export async function nomeUsuario(userId?: string | null) {
  if (!userId) return undefined
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } })
  return u ? `${u.firstName} ${u.lastName}`.trim() : undefined
}

export function baseUrlPublica() {
  return String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')
}

export function urlVerificacao(codigo: string) {
  return `${baseUrlPublica()}/api/public/edu/secretaria/verificar/${encodeURIComponent(codigo)}`
}

// Aluno logado (portal) — exige studentId vinculado.
export function exigirAluno(req: AuthenticatedRequest): string {
  const id = req.user?.studentId
  if (!id) throw Object.assign(new Error('Usuário não está vinculado a um aluno.'), { status: 403 })
  return id
}

// Dados acadêmicos do aluno usados nos documentos.
export async function carregarAluno(tenantId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId } })
  if (!student) throw Object.assign(new Error('Aluno não encontrado.'), { status: 404 })
  const matriculas = await prisma.enrollment.findMany({
    where: { studentId },
    include: { program: true, term: true },
    orderBy: { dataMatricula: 'desc' },
  })
  return { student, matriculas }
}

export function escolherMatricula<T extends { id: string; status: string }>(matriculas: T[], enrollmentId?: string | null): T | undefined {
  if (enrollmentId) return matriculas.find((m) => m.id === enrollmentId)
  return matriculas.find((m) => m.status === 'ATIVA') ?? matriculas[0]
}
