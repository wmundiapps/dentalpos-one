import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { Aba, gerarXlsx } from './xlsx'
import { MOD, assertNoTenant, escHtml, fail, isSuper, optDate, optStr, paginaHtml, roleOf, temPapel, tid, uid, uniq, ymd } from './common'
import type { AcademicRole } from '../academico/middleware'

const LEIT: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'SECRETARY', 'SUPPORT', 'STUDENT']
const GEST: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
const DOC: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'SECRETARY']
const TIPOS_LIGA = ['LIGA_ACADEMICA', 'CENTRO_ACADEMICO', 'ATLETICA', 'EMPRESA_JUNIOR', 'GRUPO_ESTUDOS'] as const
const CAT_HORAS = ['ENSINO', 'PESQUISA', 'EXTENSAO', 'CULTURA', 'MONITORIA', 'LIGA', 'EVENTO', 'ESTAGIO_NAO_OBRIGATORIO', 'VOLUNTARIADO', 'OUTRO'] as const

/** Horas validadas respeitando o teto da categoria por curso (regra), considerando o que já foi validado. */
export function aplicarTeto(solicitado: number, jaValidadoNaCategoria: number, maxHoras: number | null, fator = 1): number {
  const bruto = Math.max(0, solicitado) * fator
  if (maxHoras === null) return Math.round(bruto * 100) / 100
  return Math.round(Math.max(0, Math.min(bruto, maxHoras - jaValidadoNaCategoria)) * 100) / 100
}

async function alunoLogado(req: AuthenticatedRequest) {
  return roleOf(req) === 'STUDENT' ? req.user?.studentId ?? null : null
}

async function programaDoAluno(tenantId: string, studentId: string) {
  const m = await prisma.enrollment.findFirst({ where: { studentId, status: { in: ['ATIVA', 'TRANCADA'] } }, orderBy: { dataMatricula: 'desc' }, select: { programId: true } })
  return m?.programId ?? null
}

async function criarHoraDeOrigem(tenantId: string, a: { studentId: string; categoria: string; descricao: string; horas: number; origemTipo: string; origemId: string; data?: Date | null }) {
  const ja = await prisma.acaHoraComplementar.findFirst({ where: { tenantId, studentId: a.studentId, origemTipo: a.origemTipo, origemId: a.origemId } })
  if (ja) return ja
  return prisma.acaHoraComplementar.create({ data: { tenantId, studentId: a.studentId, categoria: a.categoria, descricao: a.descricao, horasInformadas: a.horas, origemTipo: a.origemTipo, origemId: a.origemId, data: a.data ?? new Date(), status: 'PENDENTE' } })
}

async function criarEventoCalendario(tenantId: string, userId: string, titulo: string, inicio: Date, fim: Date | null, local?: string | null) {
  const ev = await prisma.calEvento.create({ data: { tenantId, tipo: 'EVENTO_INSTITUCIONAL', titulo, inicio, fim: fim ?? new Date(inicio.getTime() + 2 * 3_600_000), diaInteiro: false, local: local ?? undefined, publico: 'TODOS', criadoPorId: userId } })
  return ev.id
}

export function registerLigas(router: Router) {
  const leitura = requireRole(...LEIT)
  const gestao = requireRole(...GEST)
  const docente = requireRole(...DOC)

  // ------------------------------------------------------------ ligas e centros acadêmicos
  const ligaSchema = z.object({
    tipo: z.enum(TIPOS_LIGA).default('LIGA_ACADEMICA'), nome: z.string().min(3).max(160), sigla: optStr(20), areaConhecimento: optStr(120), programId: optStr(60), descricao: optStr(2000), estatutoUrl: optStr(500),
    orientadorUserId: optStr(60), orientadorNome: optStr(120), fundacao: optDate(), status: z.enum(['EM_CRIACAO', 'ATIVA', 'SUSPENSA', 'ENCERRADA']).default('EM_CRIACAO'), cargaHorariaMaxAluno: z.number().int().min(0).max(1000).default(60),
  })

  router.get('/ligas', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['tipo', 'status', 'programId']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    if (qs(req.query.q)) where.OR = [{ nome: { contains: qs(req.query.q), mode: 'insensitive' } }, { sigla: { contains: qs(req.query.q), mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.acaLiga.findMany({ where, orderBy: { nome: 'asc' }, skip, take, include: { _count: { select: { membros: { where: { ativo: true } }, atividades: true } } } }), prisma.acaLiga.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/ligas', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(ligaSchema, req.body)
    if (b.programId) await assertNoTenant(tenantId, 'academicProgram', b.programId, 'Curso')
    if (b.orientadorUserId) await assertNoTenant(tenantId, 'user', b.orientadorUserId, 'Orientador')
    const l = await prisma.acaLiga.create({ data: { ...b, tenantId } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'LIGA_CRIADA', refType: 'AcaLiga', refId: l.id })
    res.status(201).json(l)
  }))
  router.get('/ligas/:id', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.acaLiga.findFirst({ where: { id: String(req.params.id), tenantId }, include: { membros: { orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] }, planos: { orderBy: { periodo: 'desc' } }, atividades: { orderBy: { inicio: 'desc' }, take: 100 } } })
    if (!l) fail(404, 'Liga/centro não encontrado.')
    const realizadas = l.atividades.filter((a) => a.status === 'REALIZADA')
    res.json({ ...l, resumo: { membrosAtivos: l.membros.filter((m) => m.ativo).length, atividadesRealizadas: realizadas.length, horasRealizadas: realizadas.reduce((s, a) => s + a.cargaHoraria, 0), planejadas: l.atividades.filter((a) => a.status === 'PLANEJADA').length } })
  }))
  router.patch('/ligas/:id', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.acaLiga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) fail(404, 'Liga/centro não encontrado.')
    const b = parseBody(ligaSchema.partial(), req.body)
    res.json(await prisma.acaLiga.update({ where: { id: l.id }, data: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) as any }))
  }))

  // membros
  router.post('/ligas/:id/membros', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.acaLiga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) fail(404, 'Liga/centro não encontrado.')
    const b = parseBody(z.object({ studentId: optStr(60), userId: optStr(60), nome: optStr(120), papel: z.enum(['PRESIDENTE', 'VICE', 'DIRETOR', 'TESOUREIRO', 'SECRETARIO', 'MEMBRO', 'ORIENTADOR', 'PROFESSOR_COLABORADOR']).default('MEMBRO') }), req.body)
    if (!b.studentId && !b.userId) fail(400, 'Informe o aluno (studentId) ou o docente/servidor (userId).')
    let nome = b.nome
    if (b.studentId) { const s = await prisma.student.findFirst({ where: { id: b.studentId, tenantId } }); if (!s) fail(400, 'Aluno não encontrado nesta instituição.'); nome = nome || s.nomeCompleto }
    if (b.userId) { const u = await prisma.user.findFirst({ where: { id: b.userId, tenantId } }); if (!u) fail(400, 'Usuário não encontrado nesta instituição.'); nome = nome || `${u.firstName} ${u.lastName}` }
    if (await prisma.acaLigaMembro.findFirst({ where: { ligaId: l.id, ativo: true, ...(b.studentId ? { studentId: b.studentId } : { userId: b.userId }) } })) fail(409, 'Já é membro ativo.')
    if (['PRESIDENTE'].includes(b.papel) && (await prisma.acaLigaMembro.findFirst({ where: { ligaId: l.id, ativo: true, papel: 'PRESIDENTE' } }))) fail(409, 'A liga já possui presidente ativo; desligue-o antes.')
    const m = await prisma.acaLigaMembro.create({ data: { tenantId, ligaId: l.id, studentId: b.studentId, userId: b.userId, nome: nome ?? '—', papel: b.papel } })
    res.status(201).json(m)
  }))
  router.post('/ligas-membros/:id/desligar', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const m = await prisma.acaLigaMembro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) fail(404, 'Membro não encontrado.')
    res.json(await prisma.acaLigaMembro.update({ where: { id: m.id }, data: { ativo: false, saida: new Date() } }))
  }))

  // plano de atividades
  router.post('/ligas/:id/planos', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.acaLiga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) fail(404, 'Liga/centro não encontrado.')
    const b = parseBody(z.object({ periodo: z.string().min(4).max(20), objetivos: optStr(3000), metas: optStr(3000), orcamento: z.number().min(0).max(1e9).default(0) }), req.body)
    const atual = await prisma.acaLigaPlano.findFirst({ where: { ligaId: l.id, periodo: b.periodo } })
    if (atual && atual.status === 'APROVADO') fail(409, 'Plano aprovado não pode ser alterado; crie um plano para outro período.')
    res.status(atual ? 200 : 201).json(atual ? await prisma.acaLigaPlano.update({ where: { id: atual.id }, data: { ...b, status: 'RASCUNHO' } }) : await prisma.acaLigaPlano.create({ data: { ...b, tenantId, ligaId: l.id } }))
  }))
  router.post('/ligas-planos/:id/enviar', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaLigaPlano.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Plano não encontrado.')
    if (p.status !== 'RASCUNHO') fail(409, 'Só planos em rascunho podem ser enviados.')
    if (!p.objetivos) fail(400, 'Informe os objetivos do plano antes de enviar.')
    res.json(await prisma.acaLigaPlano.update({ where: { id: p.id }, data: { status: 'ENVIADO' } }))
  }))
  router.post('/ligas-planos/:id/decidir', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.acaLigaPlano.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) fail(404, 'Plano não encontrado.')
    if (p.status !== 'ENVIADO') fail(409, 'O plano precisa estar enviado para ser decidido.')
    const b = parseBody(z.object({ aprovar: z.boolean(), parecer: optStr(1500) }), req.body)
    if (!b.aprovar && !b.parecer) fail(400, 'Justifique a reprovação no parecer.')
    const u = await prisma.acaLigaPlano.update({ where: { id: p.id }, data: { status: b.aprovar ? 'APROVADO' : 'REPROVADO', parecer: b.parecer, decididoPorId: uid(req), decididoEm: new Date() } })
    if (b.aprovar) await prisma.acaLiga.updateMany({ where: { id: p.ligaId, status: 'EM_CRIACAO' }, data: { status: 'ATIVA' } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: b.aprovar ? 'PLANO_LIGA_APROVADO' : 'PLANO_LIGA_REPROVADO', refType: 'AcaLigaPlano', refId: p.id })
    res.json(u)
  }))

  // atividades
  router.post('/ligas/:id/atividades', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const l = await prisma.acaLiga.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!l) fail(404, 'Liga/centro não encontrado.')
    const b = parseBody(z.object({ planoId: optStr(60), tipo: z.enum(['REUNIAO', 'AULA', 'CONGRESSO', 'EVENTO', 'ACAO_SOCIAL', 'PESQUISA', 'EXTENSAO', 'EXTRAMUROS', 'CAMPEONATO']).default('REUNIAO'), titulo: z.string().min(3).max(200), descricao: optStr(2000), local: optStr(200), inicio: z.coerce.date(), fim: optDate(), cargaHoraria: z.number().min(0).max(500).default(0), publicoEstimado: z.number().int().min(0).max(100000).nullish(), publicarNoCalendario: z.boolean().default(false) }), req.body)
    if (b.fim && b.fim < b.inicio) fail(400, 'O término deve ser posterior ao início.')
    if (b.planoId) { const p = await prisma.acaLigaPlano.findFirst({ where: { id: b.planoId, ligaId: l.id } }); if (!p) fail(400, 'Plano não pertence à liga.') }
    const { publicarNoCalendario, ...dados } = b
    const calEventoId = publicarNoCalendario ? await criarEventoCalendario(tenantId, uid(req), `${l.sigla || l.nome}: ${b.titulo}`, b.inicio, b.fim ?? null, b.local) : undefined
    res.status(201).json(await prisma.acaLigaAtividade.create({ data: { ...dados, tenantId, ligaId: l.id, calEventoId } }))
  }))
  router.post('/ligas-atividades/:id/realizar', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaLigaAtividade.findFirst({ where: { id: String(req.params.id), tenantId }, include: { liga: true } })
    if (!a) fail(404, 'Atividade não encontrada.')
    if (a.status === 'CANCELADA') fail(409, 'Atividade cancelada.')
    const b = parseBody(z.object({ presentes: z.array(z.object({ studentId: z.string().min(1), horas: z.number().min(0).max(500).optional() })).max(2000), relatorio: optStr(4000) }), req.body)
    const ids = uniq(b.presentes.map((p) => p.studentId))
    const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } })
    if (alunos.length !== ids.length) fail(400, 'Há aluno(s) inexistente(s) nesta instituição na lista de presença.')
    let gerados = 0
    await prisma.$transaction(async (tx) => {
      for (const p of b.presentes) {
        const horas = p.horas ?? a.cargaHoraria
        await tx.acaLigaPresenca.upsert({ where: { atividadeId_studentId: { atividadeId: a.id, studentId: p.studentId } }, create: { tenantId, atividadeId: a.id, studentId: p.studentId, presente: true, horas }, update: { presente: true, horas } })
      }
      await tx.acaLigaAtividade.update({ where: { id: a.id }, data: { status: 'REALIZADA', relatorio: b.relatorio ?? a.relatorio } })
    })
    for (const p of b.presentes) {
      const jaHoras = await prisma.acaHoraComplementar.aggregate({ where: { tenantId, studentId: p.studentId, origemTipo: 'LIGA', origemId: { not: a.id }, descricao: { startsWith: `[${a.ligaId}]` } }, _sum: { horasInformadas: true } })
      const horas = Math.min(p.horas ?? a.cargaHoraria, Math.max(0, a.liga.cargaHorariaMaxAluno - (jaHoras._sum.horasInformadas ?? 0)))
      if (horas > 0) { await criarHoraDeOrigem(tenantId, { studentId: p.studentId, categoria: 'LIGA', descricao: `[${a.ligaId}] ${a.liga.nome}: ${a.titulo}`, horas, origemTipo: 'LIGA', origemId: a.id, data: a.inicio }); gerados++ }
    }
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ATIVIDADE_LIGA_REALIZADA', refType: 'AcaLigaAtividade', refId: a.id, detalhes: { presentes: ids.length } })
    res.json({ ok: true, presentes: ids.length, horasGeradas: gerados })
  }))
  router.post('/ligas-atividades/:id/cancelar', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.acaLigaAtividade.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) fail(404, 'Atividade não encontrada.')
    if (a.status === 'REALIZADA') fail(409, 'Atividade já realizada não pode ser cancelada.')
    res.json(await prisma.acaLigaAtividade.update({ where: { id: a.id }, data: { status: 'CANCELADA' } }))
  }))

  // ------------------------------------------------------------ extramuros
  const extraSchema = z.object({
    codigo: z.string().min(3).max(40).optional(), titulo: z.string().min(3).max(200), tipo: z.enum(['VISITA_TECNICA', 'ACAO_COMUNITARIA', 'AULA_CAMPO', 'ESTAGIO_CAMPO', 'MUTIRAO', 'SAUDE_COMUNIDADE']).default('VISITA_TECNICA'),
    local: z.string().min(2).max(200), cidade: optStr(80), inicio: z.coerce.date(), fim: optDate(), responsavelUserId: optStr(60), programId: optStr(60), disciplineId: optStr(60), projetoId: optStr(60), ligaId: optStr(60),
    vagas: z.number().int().min(1).max(2000).nullish(), transporte: z.boolean().default(false), seguro: z.boolean().default(false), termoAutorizacao: z.boolean().default(true), riscoNivel: z.enum(['BAIXO', 'MEDIO', 'ALTO']).default('BAIXO'), cargaHoraria: z.number().min(0).max(500).default(0),
  })
  router.get('/extramuros', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const k of ['status', 'tipo', 'programId', 'ligaId']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    const [items, total] = await Promise.all([prisma.acaExtramuros.findMany({ where, orderBy: { inicio: 'desc' }, skip, take, include: { _count: { select: { participantes: true } } } }), prisma.acaExtramuros.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/extramuros', docente, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(extraSchema, req.body)
    if (b.fim && b.fim < b.inicio) fail(400, 'O término deve ser posterior ao início.')
    if (b.programId) await assertNoTenant(tenantId, 'academicProgram', b.programId, 'Curso')
    if (b.ligaId) await assertNoTenant(tenantId, 'acaLiga', b.ligaId, 'Liga')
    if (b.projetoId) await assertNoTenant(tenantId, 'pesProjeto', b.projetoId, 'Projeto')
    const n = await prisma.acaExtramuros.count({ where: { tenantId } })
    const codigo = b.codigo ?? `EXT-${new Date().getFullYear()}-${String(n + 1).padStart(4, '0')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
    res.status(201).json(await prisma.acaExtramuros.create({ data: { ...b, codigo, tenantId, responsavelUserId: b.responsavelUserId ?? uid(req) } }))
  }))
  router.get('/extramuros/:id', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.acaExtramuros.findFirst({ where: { id: String(req.params.id), tenantId }, include: { participantes: true } })
    if (!e) fail(404, 'Atividade extramuros não encontrada.')
    const al = await prisma.student.findMany({ where: { tenantId, id: { in: e.participantes.map((p) => p.studentId) } }, select: { id: true, nomeCompleto: true, ra: true } })
    const m = new Map(al.map((a) => [a.id, a]))
    res.json({ ...e, participantes: e.participantes.map((p) => ({ ...p, aluno: m.get(p.studentId) ?? null })) })
  }))
  router.post('/extramuros/:id/status', docente, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.acaExtramuros.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) fail(404, 'Atividade extramuros não encontrada.')
    const b = parseBody(z.object({ status: z.enum(['APROVADA', 'CANCELADA']) }), req.body)
    if (e.status === 'REALIZADA' || e.status === 'CANCELADA') fail(409, 'Atividade já encerrada.')
    if (b.status === 'APROVADA') {
      if (!temPapel(req, 'COORDINATOR')) fail(403, 'Apenas a coordenação aprova atividades extramuros.')
      const pend: string[] = []
      if (!e.termoAutorizacao) pend.push('termo de autorização dos participantes')
      if (e.riscoNivel !== 'BAIXO' && !e.seguro) pend.push('seguro de acidentes pessoais (risco médio/alto)')
      if (e.riscoNivel === 'ALTO' && !e.responsavelUserId) pend.push('responsável designado')
      if (pend.length) fail(422, `Pendências para aprovar: ${pend.join('; ')}.`, { pendencias: pend })
    }
    res.json(await prisma.acaExtramuros.update({ where: { id: e.id }, data: { status: b.status } }))
  }))
  router.post('/extramuros/:id/participantes', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.acaExtramuros.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!e) fail(404, 'Atividade extramuros não encontrada.')
    if (['REALIZADA', 'CANCELADA'].includes(e.status)) fail(409, 'Inscrições encerradas.')
    const meu = await alunoLogado(req)
    const b = parseBody(z.object({ studentId: optStr(60), termoAceito: z.boolean().default(false) }), req.body)
    const studentId = meu ?? b.studentId
    if (!studentId) fail(400, 'Informe o aluno.')
    if (meu && b.studentId && b.studentId !== meu) fail(403, 'Você só pode inscrever a si mesmo.')
    if (!meu && !temPapel(req, ...DOC)) fail(403, 'Sem permissão.')
    await assertNoTenant(tenantId, 'student', studentId, 'Aluno')
    if (e.termoAutorizacao && !b.termoAceito) fail(400, 'É necessário aceitar o termo de autorização para participar.')
    const total = await prisma.acaExtramurosParticipante.count({ where: { extramurosId: e.id } })
    if (e.vagas && total >= e.vagas) fail(409, 'Vagas esgotadas.')
    if (await prisma.acaExtramurosParticipante.findFirst({ where: { extramurosId: e.id, studentId } })) fail(409, 'Aluno já inscrito.')
    res.status(201).json(await prisma.acaExtramurosParticipante.create({ data: { tenantId, extramurosId: e.id, studentId, status: 'CONFIRMADO', termoAssinadoEm: b.termoAceito ? new Date() : null } }))
  }))
  router.post('/extramuros/:id/realizar', docente, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const e = await prisma.acaExtramuros.findFirst({ where: { id: String(req.params.id), tenantId }, include: { participantes: true } })
    if (!e) fail(404, 'Atividade extramuros não encontrada.')
    if (e.status !== 'APROVADA') fail(409, 'Apenas atividades aprovadas podem ser registradas como realizadas.')
    const b = parseBody(z.object({ presentes: z.array(z.string()).max(2000), relatorio: optStr(4000) }), req.body)
    const ids = new Set(e.participantes.map((p) => p.studentId))
    if (b.presentes.some((s) => !ids.has(s))) fail(400, 'Há presente(s) que não estão inscritos na atividade.')
    for (const p of e.participantes) {
      const presente = b.presentes.includes(p.studentId)
      await prisma.acaExtramurosParticipante.update({ where: { id: p.id }, data: { status: presente ? 'PRESENTE' : 'AUSENTE', horas: presente ? e.cargaHoraria : 0 } })
      if (presente && e.cargaHoraria > 0) await criarHoraDeOrigem(tenantId, { studentId: p.studentId, categoria: 'EXTENSAO', descricao: `Extramuros: ${e.titulo}`, horas: e.cargaHoraria, origemTipo: 'EXTRAMUROS', origemId: e.id, data: e.inicio })
    }
    await prisma.acaExtramuros.update({ where: { id: e.id }, data: { status: 'REALIZADA', relatorio: b.relatorio } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'EXTRAMUROS_REALIZADA', refType: 'AcaExtramuros', refId: e.id, detalhes: { presentes: b.presentes.length } })
    res.json({ ok: true, presentes: b.presentes.length })
  }))

  // ------------------------------------------------------------ horas complementares
  router.get('/horas-complementares', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const meu = await alunoLogado(req)
    if (roleOf(req) === 'STUDENT') where.studentId = meu ?? '-'
    else if (qs(req.query.studentId)) where.studentId = qs(req.query.studentId)
    for (const k of ['status', 'categoria', 'origemTipo']) if (qs((req.query as any)[k])) where[k] = qs((req.query as any)[k])
    const [items, total] = await Promise.all([prisma.acaHoraComplementar.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.acaHoraComplementar.count({ where })])
    const al = await prisma.student.findMany({ where: { tenantId, id: { in: uniq(items.map((i) => i.studentId)) } }, select: { id: true, nomeCompleto: true, ra: true } })
    const m = new Map(al.map((a) => [a.id, a]))
    res.json({ items: items.map((i) => ({ ...i, aluno: m.get(i.studentId) ?? null })), total, page, pageSize })
  }))
  router.post('/horas-complementares', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const meu = await alunoLogado(req)
    const b = parseBody(z.object({ studentId: optStr(60), categoria: z.enum(CAT_HORAS), descricao: z.string().min(3).max(300), data: optDate(), horasInformadas: z.number().min(0.5).max(1000), comprovanteUrl: optStr(500) }), req.body)
    const studentId = meu ?? b.studentId
    if (!studentId) fail(400, 'Informe o aluno.')
    if (meu && b.studentId && b.studentId !== meu) fail(403, 'Você só pode lançar horas para si mesmo.')
    if (!meu && !temPapel(req, ...GEST)) fail(403, 'Sem permissão.')
    await assertNoTenant(tenantId, 'student', studentId, 'Aluno')
    if (b.comprovanteUrl && !/^https:\/\//i.test(b.comprovanteUrl)) fail(400, 'O comprovante deve ser um link https.')
    const { studentId: _s, ...dados } = b
    res.status(201).json(await prisma.acaHoraComplementar.create({ data: { ...dados, tenantId, studentId, origemTipo: 'MANUAL' } }))
  }))
  router.post('/horas-complementares/:id/validar', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const h = await prisma.acaHoraComplementar.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!h) fail(404, 'Lançamento não encontrado.')
    const b = parseBody(z.object({ aprovar: z.boolean(), horasValidadas: z.number().min(0).max(1000).optional(), parecer: optStr(1000) }), req.body)
    if (!b.aprovar && !b.parecer) fail(400, 'Justifique a rejeição no parecer.')
    let validadas = 0, status = 'REJEITADA', teto: number | null = null
    if (b.aprovar) {
      const programId = await programaDoAluno(tenantId, h.studentId)
      const regra = (await prisma.acaHoraRegra.findFirst({ where: { tenantId, programId, categoria: h.categoria } })) ?? (await prisma.acaHoraRegra.findFirst({ where: { tenantId, programId: null, categoria: h.categoria } }))
      teto = regra?.maxHoras ?? null
      const ja = await prisma.acaHoraComplementar.aggregate({ where: { tenantId, studentId: h.studentId, categoria: h.categoria, status: { in: ['APROVADA', 'PARCIAL'] }, id: { not: h.id } }, _sum: { horasValidadas: true } })
      validadas = aplicarTeto(Math.min(b.horasValidadas ?? h.horasInformadas, h.horasInformadas), ja._sum.horasValidadas ?? 0, teto, regra?.fator ?? 1)
      status = validadas <= 0 ? 'REJEITADA' : validadas < h.horasInformadas ? 'PARCIAL' : 'APROVADA'
    }
    const u = await prisma.acaHoraComplementar.update({ where: { id: h.id }, data: { horasValidadas: validadas, status, parecer: b.parecer ?? (status === 'PARCIAL' && teto !== null ? `Limitado pelo teto da categoria (${teto}h).` : undefined), validadoPorId: uid(req), validadoEm: new Date() } })
    await notify({ tenantId, studentId: h.studentId, assunto: 'Horas complementares', mensagem: `Seu lançamento "${h.descricao}" foi ${status === 'REJEITADA' ? 'rejeitado' : 'validado'} (${validadas}h).`, refType: 'AcaHoraComplementar', refId: h.id })
    res.json(u)
  }))
  router.get('/horas-complementares/regras', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json({ items: await prisma.acaHoraRegra.findMany({ where: { tenantId: tid(req) }, orderBy: { categoria: 'asc' } }), categorias: CAT_HORAS }) }))
  router.put('/horas-complementares/regras', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ programId: optStr(60), categoria: z.enum(CAT_HORAS), maxHoras: z.number().min(0).max(5000), fator: z.number().min(0).max(5).default(1) }), req.body)
    if (b.programId) await assertNoTenant(tenantId, 'academicProgram', b.programId, 'Curso')
    const ex = await prisma.acaHoraRegra.findFirst({ where: { tenantId, programId: b.programId ?? null, categoria: b.categoria } })
    res.json(ex ? await prisma.acaHoraRegra.update({ where: { id: ex.id }, data: { maxHoras: b.maxHoras, fator: b.fator } }) : await prisma.acaHoraRegra.create({ data: { tenantId, programId: b.programId ?? null, categoria: b.categoria, maxHoras: b.maxHoras, fator: b.fator } }))
  }))
  router.get('/alunos/:id/horas-resumo', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const id = String(req.params.id)
    if (roleOf(req) === 'STUDENT' && req.user?.studentId !== id) fail(403, 'Sem permissão.')
    await assertNoTenant(tenantId, 'student', id, 'Aluno')
    const itens = await prisma.acaHoraComplementar.findMany({ where: { tenantId, studentId: id } })
    const por: Record<string, { informadas: number; validadas: number; pendentes: number }> = {}
    for (const i of itens) { const o = por[i.categoria] ?? { informadas: 0, validadas: 0, pendentes: 0 }; o.informadas += i.horasInformadas; o.validadas += i.horasValidadas; if (i.status === 'PENDENTE') o.pendentes += i.horasInformadas; por[i.categoria] = o }
    const programId = await programaDoAluno(tenantId, id)
    const matriz = programId ? await prisma.acaMatriz.findFirst({ where: { tenantId, programId, status: 'VIGENTE' } }) : null
    const total = itens.reduce((s, i) => s + i.horasValidadas, 0)
    res.json({ porCategoria: por, totalValidadas: total, exigido: matriz?.horasComplementaresMin ?? null, faltam: matriz ? Math.max(0, matriz.horasComplementaresMin - total) : null })
  }))

  // ------------------------------------------------------------ pesquisa / extensão (reaproveita modules/pesquisa: PesProjeto)
  router.get('/pesquisa-extensao/projetos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const tipo = qs(req.query.tipo)
    if (tipo) { if (!['IC', 'PIBIC', 'PIBITI', 'EXTENSAO', 'INOVACAO', 'PESQUISA', 'OUTRO'].includes(tipo)) fail(400, 'Tipo inválido.'); where.tipo = tipo }
    if (qs(req.query.status)) { if (!['RASCUNHO', 'SUBMETIDO', 'EM_AVALIACAO', 'APROVADO', 'EM_EXECUCAO', 'SUSPENSO', 'CONCLUIDO', 'CANCELADO', 'REPROVADO'].includes(qs(req.query.status)!)) fail(400, 'Status inválido.'); where.status = qs(req.query.status) }
    if (roleOf(req) === 'STUDENT') where.membros = { some: { studentId: req.user?.studentId ?? '-' } }
    const [items, total] = await Promise.all([prisma.pesProjeto.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, codigo: true, titulo: true, tipo: true, status: true, coordenadorNome: true, dataInicio: true, dataFim: true, programId: true, _count: { select: { membros: true } } } }), prisma.pesProjeto.count({ where })])
    res.json({ items, total, page, pageSize, origem: 'modules/pesquisa (PesProjeto)' })
  }))
  router.get('/alunos/:id/pesquisa-extensao', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const id = String(req.params.id)
    if (roleOf(req) === 'STUDENT' && req.user?.studentId !== id) fail(403, 'Sem permissão.')
    await assertNoTenant(tenantId, 'student', id, 'Aluno')
    const [projetos, ligas, extra, horas] = await Promise.all([
      prisma.pesProjetoMembro.findMany({ where: { tenantId, studentId: id }, include: { projeto: { select: { codigo: true, titulo: true, tipo: true, status: true } } } }),
      prisma.acaLigaMembro.findMany({ where: { tenantId, studentId: id }, include: { liga: { select: { nome: true, sigla: true, tipo: true } } } }),
      prisma.acaExtramurosParticipante.findMany({ where: { tenantId, studentId: id } }),
      prisma.acaHoraComplementar.aggregate({ where: { tenantId, studentId: id, status: { in: ['APROVADA', 'PARCIAL'] }, categoria: { in: ['PESQUISA', 'EXTENSAO', 'LIGA'] } }, _sum: { horasValidadas: true } }),
    ])
    res.json({ projetos: projetos.map((p) => ({ papel: p.papel, ativo: !p.dataFim, ...p.projeto })), ligas: ligas.map((l) => ({ papel: l.papel, ativo: l.ativo, ...l.liga })), extramuros: extra.length, horasValidadas: horas._sum.horasValidadas ?? 0 })
  }))
  router.post('/pesquisa-extensao/projetos/:id/gerar-horas', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const p = await prisma.pesProjeto.findFirst({ where: { id: String(req.params.id), tenantId }, include: { membros: true } })
    if (!p) fail(404, 'Projeto não encontrado.')
    const b = parseBody(z.object({ horasPorAluno: z.number().min(1).max(1000) }), req.body)
    if (!['EM_EXECUCAO', 'CONCLUIDO'].includes(p.status)) fail(409, 'Só projetos em execução ou concluídos geram horas.')
    let n = 0
    for (const m of p.membros.filter((x) => x.studentId)) {
      await criarHoraDeOrigem(tenantId, { studentId: m.studentId!, categoria: p.tipo === 'EXTENSAO' ? 'EXTENSAO' : 'PESQUISA', descricao: `Projeto ${p.codigo}: ${p.titulo}`, horas: b.horasPorAluno, origemTipo: 'PROJETO', origemId: p.id })
      n++
    }
    res.json({ ok: true, alunos: n })
  }))

  router.get('/pesquisa-extensao/relatorio', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const [projetos, ligas, extra, horas] = await Promise.all([
      prisma.pesProjeto.groupBy({ by: ['tipo', 'status'], where: { tenantId }, _count: { _all: true } }),
      prisma.acaLiga.findMany({ where: { tenantId }, include: { _count: { select: { membros: { where: { ativo: true } }, atividades: true } } } }),
      prisma.acaExtramuros.findMany({ where: { tenantId }, include: { _count: { select: { participantes: true } } } }),
      prisma.acaHoraComplementar.groupBy({ by: ['categoria', 'status'], where: { tenantId }, _sum: { horasValidadas: true, horasInformadas: true }, _count: { _all: true } }),
    ])
    const dados = {
      projetos: projetos.map((p) => ({ tipo: p.tipo, status: p.status, qtd: p._count._all })),
      ligas: ligas.map((l) => ({ nome: l.nome, sigla: l.sigla, tipo: l.tipo, status: l.status, membros: l._count.membros, atividades: l._count.atividades })),
      extramuros: extra.map((e) => ({ codigo: e.codigo, titulo: e.titulo, tipo: e.tipo, status: e.status, participantes: e._count.participantes, cargaHoraria: e.cargaHoraria })),
      horas: horas.map((h) => ({ categoria: h.categoria, status: h.status, qtd: h._count._all, informadas: h._sum.horasInformadas ?? 0, validadas: h._sum.horasValidadas ?? 0 })),
    }
    const fmt = (qs(req.query.formato) || 'json').toLowerCase()
    if (fmt === 'xlsx') {
      const abas: Aba[] = [
        { nome: 'Projetos', colunas: [{ titulo: 'Tipo' }, { titulo: 'Status' }, { titulo: 'Quantidade' }], linhas: dados.projetos.map((p) => [p.tipo, p.status, p.qtd]) },
        { nome: 'Ligas e centros', colunas: [{ titulo: 'Nome', largura: 36 }, { titulo: 'Sigla' }, { titulo: 'Tipo' }, { titulo: 'Status' }, { titulo: 'Membros ativos' }, { titulo: 'Atividades' }], linhas: dados.ligas.map((l) => [l.nome, l.sigla, l.tipo, l.status, l.membros, l.atividades]) },
        { nome: 'Extramuros', colunas: [{ titulo: 'Código' }, { titulo: 'Título', largura: 36 }, { titulo: 'Tipo' }, { titulo: 'Status' }, { titulo: 'Participantes' }, { titulo: 'Carga horária' }], linhas: dados.extramuros.map((e) => [e.codigo, e.titulo, e.tipo, e.status, e.participantes, e.cargaHoraria]) },
        { nome: 'Horas complementares', colunas: [{ titulo: 'Categoria' }, { titulo: 'Status' }, { titulo: 'Lançamentos' }, { titulo: 'Horas informadas' }, { titulo: 'Horas validadas' }], linhas: dados.horas.map((h) => [h.categoria, h.status, h.qtd, h.informadas, h.validadas]) },
      ]
      const buf = gerarXlsx(abas)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="pesquisa-extensao-${ymd(new Date())}.xlsx"`)
      return void res.end(buf)
    }
    if (fmt === 'html') {
      const t = (cols: string[], l: any[][]) => `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${l.map((r) => `<tr>${r.map((v) => `<td>${escHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return void res.send(paginaHtml('Pesquisa, extensão, ligas e extramuros', 'Relatório consolidado', `<h2>Projetos</h2>${t(['Tipo', 'Status', 'Qtd'], dados.projetos.map((p) => [p.tipo, p.status, p.qtd]))}<h2>Ligas e centros acadêmicos</h2>${t(['Nome', 'Tipo', 'Status', 'Membros', 'Atividades'], dados.ligas.map((l) => [l.nome, l.tipo, l.status, l.membros, l.atividades]))}<h2>Extramuros</h2>${t(['Código', 'Título', 'Status', 'Participantes'], dados.extramuros.map((e) => [e.codigo, e.titulo, e.status, e.participantes]))}<h2>Horas complementares</h2>${t(['Categoria', 'Status', 'Informadas', 'Validadas'], dados.horas.map((h) => [h.categoria, h.status, h.informadas, h.validadas]))}`))
    }
    res.json(dados)
  }))
}
export { isSuper }
