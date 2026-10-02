import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { getBranding } from '../core/branding'
import { getBoletimAluno, calcularCRAluno, turmasDoAluno } from './service'
import { role, httpErr, isMgmt } from './common'

const router = Router()

// Executa uma consulta opcional (módulo de outro agente pode não existir ainda) sem derrubar o painel.
async function tolerante<T>(fn: () => Promise<T>, vazio: T): Promise<T> {
  try { return await fn() } catch { return vazio }
}

// PORTAL DO ALUNO — tudo em uma chamada.
router.get('/portal/meu-painel', requireRole('STUDENT', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  let studentId = req.user?.studentId
  if (role(req) !== 'STUDENT') {
    if (!isMgmt(req)) throw httpErr(403, 'Sem permissão.')
    studentId = qs(req.query.studentId)   // gestão visualiza o portal de um aluno
    if (!studentId) throw httpErr(400, 'Informe studentId.')
  }
  if (!studentId) throw httpErr(403, 'Usuário não vinculado a um aluno.')
  const aluno = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, ra: true, nomeCompleto: true, status: true, userId: true } })
  if (!aluno) throw httpErr(404, 'Aluno não encontrado.')

  const now = new Date()
  const vinc = await turmasDoAluno(tenantId, studentId)
  const secIds = vinc.map((v) => v.classSectionId)
  const atuais = vinc.filter((v) => v.classSection.term.dataInicio <= now && v.classSection.term.dataFim >= now)
  const termAtual = atuais[0]?.classSection.termId
  const secAtuaisIds = atuais.map((v) => v.classSectionId)
  const discIds = [...new Set(vinc.map((v) => v.classSection.disciplineId))]

  const [brand, boletim, cr, financeiro, requerimentos, lembretes, notificacoes, naoLidas] = await Promise.all([
    getBranding(tenantId),
    getBoletimAluno(tenantId, studentId, termAtual),
    calcularCRAluno(tenantId, studentId),
    tolerante(async () => {
      const rows = await prisma.accountReceivable.findMany({ where: { tenantId, studentId, status: { in: ['PENDENTE', 'ATRASADO'] } }, orderBy: { dataVencimento: 'asc' }, take: 50 })
      const itens = rows.map((r) => ({ id: r.id, descricao: r.descricao, parcela: r.numeroParcela, valor: r.valor, vencimento: r.dataVencimento, vencida: r.dataVencimento.getTime() < now.getTime() }))
      const vencidas = itens.filter((i) => i.vencida)
      return { emDia: vencidas.length === 0, totalEmAberto: itens.reduce((s, i) => s + i.valor, 0), totalVencido: vencidas.reduce((s, i) => s + i.valor, 0), qtdVencidas: vencidas.length, proximoVencimento: itens.find((i) => !i.vencida) ?? null, itens: itens.slice(0, 12) }
    }, null as any),
    tolerante(async () => {
      const d = (prisma as any).secProtocolo
      if (!d) return []
      const rows = await d.findMany({ where: { tenantId, studentId, status: { notIn: ['CONCLUIDO', 'CANCELADO', 'INDEFERIDO', 'DEFERIDO'] } }, orderBy: { createdAt: 'desc' }, take: 20 })
      return rows.map((r: any) => ({ id: r.id, numero: r.numero, assunto: r.assunto, status: r.status, prazoEm: r.prazoEm, abertoEm: r.createdAt }))
    }, [] as any[]),
    prisma.eduReminder.findMany({ where: { tenantId, assigneeStudentId: studentId, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, orderBy: { dueAt: 'asc' }, take: 20, select: { id: true, titulo: true, descricao: true, dueAt: true, severity: true, modulo: true } }),
    prisma.eduNotification.findMany({ where: { tenantId, studentId, canal: 'IN_APP', status: { not: 'CANCELADA' } }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, assunto: true, mensagem: true, status: true, createdAt: true, lidaEm: true } }),
    prisma.eduNotification.count({ where: { tenantId, studentId, canal: 'IN_APP', lidaEm: null, status: { not: 'CANCELADA' } } }),
  ])

  // Horários: aulas agendadas do núcleo (ClassSession) + grade semanal do módulo calendário, se existir.
  const proximasAulas = secAtuaisIds.length ? await prisma.classSession.findMany({
    where: { classSectionId: { in: secAtuaisIds }, status: 'AGENDADA', dataHoraInicio: { gte: now, lte: new Date(now.getTime() + 14 * 86400000) } },
    orderBy: { dataHoraInicio: 'asc' }, take: 30, select: { id: true, classSectionId: true, tipo: true, titulo: true, dataHoraInicio: true, dataHoraFim: true, local: true },
  }) : []
  const grade = await tolerante(async () => {
    const d = (prisma as any).calSlot
    if (!d || !secAtuaisIds.length) return []
    const rows = await d.findMany({ where: { tenantId, ativo: true, classSectionId: { in: secAtuaisIds } }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }], take: 100 })
    return rows.map((r: any) => ({ classSectionId: r.classSectionId, diaSemana: r.diaSemana, inicioMin: r.inicioMin, fimMin: r.fimMin, tipoAula: r.tipoAula, spaceId: r.spaceId }))
  }, [] as any[])
  const nomeTurma = new Map(vinc.map((v) => [v.classSectionId, `${v.classSection.discipline.nome} — ${v.classSection.nome}`]))

  // Próximas provas: calendário de exames (se houver), avaliações do núcleo e datas previstas dos componentes.
  const calExames = await tolerante(async () => {
    const d = (prisma as any).calExame
    if (!d || !secAtuaisIds.length) return []
    const rows = await d.findMany({ where: { tenantId, classSectionId: { in: secAtuaisIds }, inicio: { gte: now }, status: { not: 'CANCELADA' } }, orderBy: { inicio: 'asc' }, take: 20 })
    return rows.map((r: any) => ({ fonte: 'CALENDARIO', classSectionId: r.classSectionId, titulo: r.titulo, inicio: r.inicio, fim: r.fim, spaceId: r.spaceId }))
  }, [] as any[])
  const assess = secIds.length || discIds.length ? await prisma.assessment.findMany({
    where: { OR: [{ classSectionId: { in: secIds } }, { classSectionId: null, disciplineId: { in: discIds } }], dataAbertura: { gte: now } }, orderBy: { dataAbertura: 'asc' }, take: 20, select: { id: true, titulo: true, tipo: true, dataAbertura: true, dataFechamento: true, classSectionId: true, disciplineId: true },
  }) : []
  const comps = secIds.length ? await prisma.ntComponente.findMany({ where: { tenantId, classSectionId: { in: secIds }, dataPrevista: { gte: now } }, orderBy: { dataPrevista: 'asc' }, take: 20 }) : []
  const proximasProvas = [
    ...calExames,
    ...assess.map((a) => ({ fonte: 'PROVA', assessmentId: a.id, classSectionId: a.classSectionId, titulo: a.titulo, tipo: a.tipo, inicio: a.dataAbertura, fim: a.dataFechamento })),
    ...comps.map((c) => ({ fonte: 'DIARIO', classSectionId: c.classSectionId, titulo: `${c.codigo} — ${c.nome}`, inicio: c.dataPrevista, fim: null })),
  ].map((p: any) => ({ ...p, turma: nomeTurma.get(p.classSectionId) ?? null })).sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()).slice(0, 15)

  const disciplinas = boletim?.disciplinas ?? []
  const emRisco = disciplinas.filter((d: any) => d.risco.nivel !== 'NENHUM')
  const revisoes = await prisma.ntRevisao.findMany({ where: { tenantId, studentId, status: { in: ['SOLICITADA', 'PARECER_EMITIDO'] } }, orderBy: { createdAt: 'desc' }, take: 10 })

  res.json({
    aluno: { id: aluno.id, ra: aluno.ra, nome: aluno.nomeCompleto, status: aluno.status },
    marca: { nome: brand.nome, sigla: brand.sigla, cores: brand.cores, logoPrincipal: brand.logoPrincipal, logos: brand.logos, site: brand.site, email: brand.email, telefone: brand.telefone },
    periodoAtual: termAtual ? { termId: termAtual, codigo: atuais[0].classSection.term.codigo, inicio: atuais[0].classSection.term.dataInicio, fim: atuais[0].classSection.term.dataFim } : null,
    turmas: atuais.map((v) => ({ classSectionId: v.classSectionId, turma: v.classSection.nome, disciplina: v.classSection.discipline.nome, cargaHoraria: v.classSection.discipline.cargaHoraria })),
    horarios: { gradeSemanal: grade.map((g: any) => ({ ...g, turma: nomeTurma.get(g.classSectionId) ?? null })), proximasAulas: proximasAulas.map((a) => ({ ...a, turma: nomeTurma.get(a.classSectionId) ?? null })) },
    proximasProvas,
    notas: {
      cr, crPeriodo: boletim?.crPeriodo ?? null, disciplinas: disciplinas.map((d: any) => ({
        classSectionId: d.classSectionId, disciplina: d.disciplina, professor: d.professor, mediaParcial: d.mediaParcial, mediaFinal: d.mediaFinal, situacao: d.situacao,
        frequenciaPct: d.frequenciaPct, faltas: d.faltas, notaNecessaria: d.notaNecessaria?.necessaria ?? null, risco: d.risco.nivel, componentes: d.componentes.map((c: any) => ({ codigo: c.codigo, nome: c.nome, peso: c.peso, valor: c.valor, ausente: c.ausente })),
      })),
      alertas: emRisco.map((d: any) => ({ disciplina: d.disciplina, nivel: d.risco.nivel, motivos: d.risco.motivos })),
    },
    financeiro,
    requerimentosAbertos: requerimentos,
    revisoesEmAndamento: revisoes.map((r) => ({ id: r.id, classSectionId: r.classSectionId, status: r.status, criadoEm: r.createdAt })),
    avisos: { naoLidas, lembretes, notificacoes },
    geradoEm: now,
  })
}))

export default router
