import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { REGRAS_PADRAO, avaliarConformidade, Modalidade, DisciplinaCarga } from './rules'

export const MANAGE = ['COORDINATOR', 'SECRETARY'] as const
export const TEACH = ['COORDINATOR', 'SECRETARY', 'TEACHER'] as const
export const ALL_STAFF = ['COORDINATOR', 'SECRETARY', 'TEACHER', 'SUPPORT', 'STAFF'] as const

export async function getConfig(tenantId: string) {
  const c = await prisma.modConfig.findUnique({ where: { tenantId } })
  return c ?? ({ ...REGRAS_PADRAO, tenantId, slaRespostaHoras: 48, slaUrgenteHoras: 12, diasInatividadeAtencao: 7, diasInatividadeCritico: 14, presencaMinimaLivePct: 75, cargaMinimaLato: 360, prazoMaxMesesMestrado: 24, prazoMaxMesesDoutorado: 48, prazoMaxMesesLato: 24, maxOrientandosPorDocente: 8 } as any)
}

// Avalia a conformidade de um curso (AcademicProgram) com base na matriz, nas ofertas
// ModOferta (distribuição presencial/online) e nos encontros/provas presenciais agendados.
export async function conformidadeCurso(tenantId: string, programId: string, modalidadeOverride?: Modalidade) {
  const program = await prisma.academicProgram.findFirst({
    where: { id: programId, tenantId },
    include: { disciplinas: { include: { discipline: true } } },
  })
  if (!program) throw Object.assign(new Error('Curso não encontrado.'), { status: 404 })
  const cfg = await getConfig(tenantId)
  const modalidade = (modalidadeOverride ?? program.modalidade) as Modalidade
  const ofertas = await prisma.modOferta.findMany({ where: { tenantId, programId, ativo: true }, include: { encontros: { where: { status: { not: 'CANCELADO' } } } } })
  const porDisc = new Map<string, (typeof ofertas)[number]>()
  for (const o of ofertas) if (!porDisc.has(o.disciplineId)) porDisc.set(o.disciplineId, o)
  const disciplinas: DisciplinaCarga[] = program.disciplinas.map((cd) => {
    const o = porDisc.get(cd.disciplineId)
    const carga = cd.discipline.cargaHoraria
    if (o) {
      const enc = o.encontros.filter((e) => e.tipo === 'ENCONTRO_PRESENCIAL' || e.tipo === 'AULA_PRATICA').length
      const prov = o.encontros.filter((e) => e.tipo === 'PROVA_PRESENCIAL').length
      return {
        id: cd.disciplineId, nome: cd.discipline.nome, cargaPresencial: o.cargaPresencial, cargaOnline: o.cargaOnline,
        encontrosPresenciais: Math.max(enc, o.minEncontros), avaliacoesPresenciais: Math.max(prov, o.avaliacoesPresenciais),
      }
    }
    // sem oferta cadastrada: assume a modalidade do curso
    const online = modalidade === 'EAD' ? carga : 0
    return { id: cd.disciplineId, nome: cd.discipline.nome, cargaPresencial: carga - online, cargaOnline: online, encontrosPresenciais: 0, avaliacoesPresenciais: 0 }
  })
  const [alunos, tutoresAloc] = await Promise.all([
    prisma.enrollment.count({ where: { programId, status: 'ATIVA', student: { tenantId } } }),
    prisma.modTutorAlocacao.findMany({ where: { tenantId, programId, ativo: true }, select: { tutorId: true } }),
  ])
  const tutores = new Set(tutoresAloc.map((t) => t.tutorId)).size
  const res = avaliarConformidade({ modalidade, cargaHorariaTotal: program.cargaHorariaTotal, disciplinas, regras: cfg, alunos, tutores })
  return { program: { id: program.id, nome: program.nome, modalidade: program.modalidade }, alunos, tutores, ...res }
}

export function horasEntre(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000)
}

// Serializa seções críticas (checagem de vagas/capacidade + gravação) por chave, evitando que
// requisições simultâneas ultrapassem o limite. O lock é de transação (pg_advisory_xact_lock).
export async function comTrava<T>(chave: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`
      return fn(tx)
    },
    { timeout: 20_000, maxWait: 10_000 },
  )
}
