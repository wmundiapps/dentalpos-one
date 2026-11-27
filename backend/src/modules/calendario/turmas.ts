import { prisma } from '../../lib/prisma'
import { toStrArray } from './service'

// Resolução de "grupo" (coorte), série/período, turno e nº de alunos de cada turma (ClassSection).

export interface TurmaInfo {
  sectionId: string
  disciplineId: string
  professorUserId: string
  campusId: string | null
  nome: string
  grupo: string
  programId: string | null
  periodo: number | null
  turno: 'MANHA' | 'TARDE' | 'NOITE' | null
  alunos: number
  diasPermitidos: number[]
}

export async function resolverTurmas(
  tenantId: string,
  sections: Array<{ id: string; disciplineId: string; professorUserId: string; campusId: string | null; nome: string; vagas: number | null }>,
): Promise<Map<string, TurmaInfo>> {
  const ids = sections.map((s) => s.id)
  const out = new Map<string, TurmaInfo>()
  if (!ids.length) return out
  const [cfgs, links, contagens] = await Promise.all([
    prisma.calTurmaConfig.findMany({ where: { tenantId, classSectionId: { in: ids } } }),
    prisma.curriculumDiscipline.findMany({ where: { disciplineId: { in: [...new Set(sections.map((s) => s.disciplineId))] }, program: { tenantId } }, orderBy: { periodo: 'asc' } }),
    prisma.classSectionEnrollment.groupBy({ by: ['classSectionId'], where: { classSectionId: { in: ids } }, _count: { _all: true } }),
  ])
  const cfg = new Map(cfgs.map((c) => [c.classSectionId, c]))
  const cont = new Map(contagens.map((c) => [c.classSectionId, c._count._all]))
  const linkPorDisc = new Map<string, { programId: string; periodo: number }>()
  for (const l of links) if (!linkPorDisc.has(l.disciplineId)) linkPorDisc.set(l.disciplineId, { programId: l.programId, periodo: l.periodo })
  for (const s of sections) {
    const c = cfg.get(s.id)
    const lk = linkPorDisc.get(s.disciplineId)
    const programId = c?.programId ?? lk?.programId ?? null
    const periodo = c?.periodo ?? lk?.periodo ?? null
    const turno = (c?.turno as any) ?? null
    const matriculados = cont.get(s.id) ?? 0
    const alunos = c?.alunosEstimados ?? (matriculados > 0 ? matriculados : s.vagas ?? 0)
    const grupo = c?.grupo || (programId && periodo != null ? `${programId}:${periodo}${turno ? ':' + turno : ''}` : s.id)
    out.set(s.id, { sectionId: s.id, disciplineId: s.disciplineId, professorUserId: s.professorUserId, campusId: s.campusId, nome: s.nome, grupo, programId, periodo, turno, alunos, diasPermitidos: c?.diasPermitidos ?? [] })
  }
  return out
}

export async function configDisciplina(tenantId: string, disciplineIds: string[]) {
  const rows = await prisma.calDisciplinaConfig.findMany({ where: { tenantId, disciplineId: { in: disciplineIds } } })
  return new Map(rows.map((r) => [r.disciplineId, { ...r, tiposEspaco: toStrArray(r.tiposEspaco), recursos: toStrArray(r.recursos) }]))
}
