import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, qs, pageParams } from '../core/crud'
import { notify, audit } from '../core/notify'
import { scheduleReminder, cancelReminders } from '../core/reminders'
import { callAIForText, AiUnavailableError } from '../../services-ai/client'
import { MOD, DOCENTE, httpErr, requireStudentId, alunosDaTurma, nomesAlunos, chunk, media } from './common'
import { corrigir, estadoEntrega, sugerirAtividades } from './logic'
import { lacunasGrupo } from './analise'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()
const isCoord = (req: AuthenticatedRequest) => ['COORDINATOR', 'ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(String(req.user?.role).toUpperCase())

const kitSchema = z.object({
  titulo: z.string().min(3), tipo: z.enum(['QUESTOES_CONTEXTUALIZADAS', 'ESTUDO_CASO', 'PECA_PRATICA_OAB', 'CASO_CLINICO', 'LISTA_EXERCICIOS', 'REVISAO_TEORICA']),
  exameId: opt(z.string()), eixoId: opt(z.string()), disciplineId: opt(z.string()), descricao: opt(z.string()), conteudo: opt(z.string()),
  questaoIds: opt(z.array(z.string()).max(100)), gabaritoComentado: opt(z.string()), tempoEstimadoMin: opt(z.number().int().min(5).max(600)),
  visibilidade: z.enum(['PRIVADA', 'COMPARTILHADA']).optional(),
})

async function validarKit(tenantId: string, d: any) {
  if (d.exameId && !(await prisma.desExame.findFirst({ where: { id: d.exameId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame não encontrado.')
  if (d.eixoId && !(await prisma.desEixo.findFirst({ where: { id: d.eixoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Eixo não encontrado.')
  if (d.disciplineId && !(await prisma.discipline.findFirst({ where: { id: d.disciplineId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Disciplina não encontrada.')
  if (d.questaoIds?.length) {
    const n = await prisma.desQuestao.count({ where: { tenantId, id: { in: d.questaoIds }, status: 'PUBLICADO' } })
    if (n !== new Set(d.questaoIds).size) throw httpErr(400, 'Há questões inexistentes ou não PUBLICADAS no kit.')
  }
  if (!d.conteudo && !d.questaoIds?.length) throw httpErr(400, 'Informe o conteúdo (texto/caso/peça) ou questões do banco.')
}

// ---------- Kits / biblioteca ----------
router.get('/kits', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const escopo = qs(req.query.escopo) // meus | biblioteca | (todos visíveis)
  const uid = getUserId(req)
  const and: any[] = [{ tenantId, ativo: true }]
  and.push(escopo === 'meus' ? { autorUserId: uid } : escopo === 'biblioteca' ? { visibilidade: 'COMPARTILHADA' } : isCoord(req) ? {} : { OR: [{ autorUserId: uid }, { visibilidade: 'COMPARTILHADA' }] })
  for (const f of ['tipo', 'exameId', 'eixoId', 'disciplineId']) { const v = qs((req.query as any)[f]); if (v) and.push({ [f]: v }) }
  const q = qs(req.query.q)
  if (q) and.push({ OR: [{ titulo: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }] })
  const where = { AND: and }
  const [items, total] = await Promise.all([prisma.desKit.findMany({ where, skip, take, orderBy: [{ usos: 'desc' }, { createdAt: 'desc' }] }), prisma.desKit.count({ where })])
  res.json({ items, total, page, pageSize })
}))

async function kitAcessivel(req: AuthenticatedRequest, id: string, paraEditar = false) {
  const tenantId = getTenantId(req)
  const k = await prisma.desKit.findFirst({ where: { id, tenantId, ativo: true } })
  if (!k) throw httpErr(404, 'Kit não encontrado.')
  const dono = k.autorUserId === getUserId(req)
  if (paraEditar ? !(dono || isCoord(req)) : !(dono || isCoord(req) || k.visibilidade === 'COMPARTILHADA')) throw httpErr(403, paraEditar ? 'Apenas o autor ou a coordenação pode alterar este kit.' : 'Kit privado de outro professor.')
  return k
}

router.get('/kits/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await kitAcessivel(req, String(req.params.id))) }))

router.post('/kits', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = parseBody(kitSchema, req.body)
  await validarKit(tenantId, d)
  const row = await prisma.desKit.create({ data: { ...(d as any), questaoIds: d.questaoIds ?? undefined, tenantId, autorUserId: getUserId(req) } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'CRIAR_KIT', refType: 'DesKit', refId: row.id })
  res.status(201).json(row)
}))
router.patch('/kits/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const k = await kitAcessivel(req, String(req.params.id), true)
  const d = parseBody(kitSchema.partial(), req.body)
  await validarKit(getTenantId(req), { conteudo: k.conteudo, questaoIds: k.questaoIds, ...d })
  res.json(await prisma.desKit.update({ where: { id: k.id }, data: d as any }))
}))
router.post('/kits/:id/compartilhar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const k = await kitAcessivel(req, String(req.params.id), true)
  res.json(await prisma.desKit.update({ where: { id: k.id }, data: { visibilidade: req.body?.visibilidade === 'PRIVADA' ? 'PRIVADA' : 'COMPARTILHADA' } }))
}))
router.post('/kits/:id/duplicar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const k = await kitAcessivel(req, String(req.params.id))
  const { id, createdAt, updatedAt, usos, autorUserId, visibilidade, ...resto } = k as any
  res.status(201).json(await prisma.desKit.create({ data: { ...resto, titulo: `${k.titulo} (cópia)`, autorUserId: getUserId(req), visibilidade: 'PRIVADA', questaoIds: k.questaoIds ?? undefined } }))
}))
router.delete('/kits/:id', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const k = await kitAcessivel(req, String(req.params.id), true)
  const emUso = await prisma.desAtribuicao.count({ where: { kitId: k.id } })
  if (emUso) { await prisma.desKit.update({ where: { id: k.id }, data: { ativo: false } }); return res.json({ arquivado: true, motivo: 'Kit já atribuído a turmas.' }) }
  await prisma.desKit.delete({ where: { id: k.id } })
  res.status(204).end()
}))

const MODELOS: Record<string, string> = {
  PECA_PRATICA_OAB: '<h3>Enunciado</h3><p>[Situação fática com partes, datas, valores e documentos]</p><h3>Tarefa</h3><p>Elabore a peça prático-profissional cabível, indicando endereçamento, qualificação das partes, fundamentos jurídicos, pedidos e fecho.</p><h3>Padrão de resposta (espelho)</h3><ul><li>Endereçamento (0,10)</li><li>Fundamentos (…)</li><li>Pedidos (…)</li></ul>',
  CASO_CLINICO: '<h3>Caso</h3><p>[Identificação, queixa principal, HDA, antecedentes, exame físico, exames complementares]</p><h3>Perguntas</h3><ol><li>Hipótese(s) diagnóstica(s)?</li><li>Conduta imediata?</li><li>Diagnósticos diferenciais?</li></ol>',
  ESTUDO_CASO: '<h3>Contexto</h3><p>[Situação-problema real da área]</p><h3>Questões orientadoras</h3><ol><li>…</li></ol>',
}
router.post('/kits/gerar-ia', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ tipo: z.enum(['ESTUDO_CASO', 'PECA_PRATICA_OAB', 'CASO_CLINICO', 'QUESTOES_CONTEXTUALIZADAS', 'LISTA_EXERCICIOS', 'REVISAO_TEORICA']), tema: z.string().min(3).max(300), exameId: opt(z.string()), eixoId: opt(z.string()), disciplineId: opt(z.string()), nivel: z.enum(['FACIL', 'MEDIO', 'DIFICIL']).default('MEDIO') }), req.body)
  await validarKit(tenantId, { ...b, conteudo: 'x' })
  const base = { tipo: b.tipo, exameId: b.exameId ?? null, eixoId: b.eixoId ?? null, disciplineId: b.disciplineId ?? null }
  try {
    const conteudo = await callAIForText({
      system: 'Você é professor(a) universitário(a) brasileiro(a) especialista em preparação para exames (ENADE, OAB, residência). Escreva em português do Brasil, em HTML simples (h3, p, ol, ul), sem inventar legislação ou jurisprudência. Inclua ao final "<h3>Gabarito comentado / espelho</h3>".',
      user: `Elabore uma atividade do tipo ${b.tipo} sobre "${b.tema}", nível ${b.nivel}. Deve ter enunciado contextualizado, tarefas/questões numeradas e gabarito comentado.`,
      maxTokens: 3500, ctx: { clinicId: req.user?.clinicId, tenantId, actorId: getUserId(req) },
    })
    const kit = await prisma.desKit.create({ data: { ...base, tenantId, titulo: `${b.tema} (IA — revisar)`, conteudo, autorUserId: getUserId(req), visibilidade: 'PRIVADA', descricao: 'Gerada por IA; revise antes de atribuir.' } })
    res.status(201).json({ ia: true, kit })
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) throw e
    res.json({ ia: false, mensagem: 'IA não configurada: use o modelo para elaborar manualmente (POST /kits).', modelo: { ...base, titulo: b.tema, conteudo: MODELOS[b.tipo] ?? '<p>[Descreva a atividade]</p>' } })
  }
}))

// ---------- Atribuição à turma ----------
router.post('/atribuicoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ kitId: z.string(), classSectionId: z.string(), prazo: dateISO(), instrucoes: opt(z.string()) }), req.body)
  if (b.prazo.getTime() <= Date.now()) throw httpErr(400, 'O prazo deve ser futuro.')
  const kit = await kitAcessivel(req, b.kitId)
  const turma = await prisma.classSection.findFirst({ where: { id: b.classSectionId, tenantId }, include: { discipline: { select: { nome: true } } } })
  if (!turma) throw httpErr(404, 'Turma não encontrada.')
  if (!isCoord(req) && turma.professorUserId !== getUserId(req)) throw httpErr(403, 'Você só pode atribuir atividades às suas turmas.')
  const alunos = await alunosDaTurma(tenantId, turma.id)
  if (!alunos.length) throw httpErr(422, 'A turma não tem alunos ativos.')
  const at = await prisma.desAtribuicao.create({
    data: { tenantId, kitId: kit.id, classSectionId: turma.id, professorUserId: turma.professorUserId, prazo: b.prazo, instrucoes: b.instrucoes ?? undefined, entregas: { create: alunos.map((studentId) => ({ tenantId, studentId })) } },
  })
  await prisma.desKit.update({ where: { id: kit.id }, data: { usos: { increment: 1 } } })
  const nomes = await nomesAlunos(tenantId, alunos)
  for (const lote of chunk(alunos, 50)) {
    await Promise.all(lote.flatMap((studentId) => [
      notify({ tenantId, studentId, userId: nomes.get(studentId)?.userId, assunto: `Nova atividade: ${kit.titulo}`, mensagem: `Atividade "${kit.titulo}" (${turma.discipline?.nome ?? turma.nome}) com prazo em ${b.prazo.toLocaleDateString('pt-BR')}.${b.instrucoes ? ' ' + b.instrucoes : ''}`, refType: 'DesAtribuicao', refId: at.id, templateKey: 'des.atividade.atribuida' }),
      scheduleReminder({ tenantId, modulo: MOD, titulo: `Entregar atividade "${kit.titulo}"`, dueAt: b.prazo, antecedenciaDias: 2, severity: 'ATENCAO', assigneeStudentId: studentId, refType: 'DesAtribuicao', refId: at.id, dedupeKey: `des:at:${at.id}:al:${studentId}` }),
    ]))
  }
  await scheduleReminder({ tenantId, modulo: MOD, titulo: `Corrigir/acompanhar atividade "${kit.titulo}" — ${turma.nome}`, dueAt: new Date(b.prazo.getTime() + 3 * 86_400_000), antecedenciaDias: 0, remindAt: b.prazo, assigneeUserId: turma.professorUserId, refType: 'DesAtribuicao', refId: at.id, dedupeKey: `des:at:${at.id}:prof` })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ATRIBUIR_ATIVIDADE', refType: 'DesAtribuicao', refId: at.id, detalhes: { alunos: alunos.length } })
  res.status(201).json({ ...at, alunos: alunos.length })
}))

router.get('/atribuicoes', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId, ...(isCoord(req) ? {} : { professorUserId: getUserId(req) }) }
  for (const f of ['classSectionId', 'status', 'kitId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
  const [items, total] = await Promise.all([prisma.desAtribuicao.findMany({ where, skip, take, orderBy: { prazo: 'desc' }, include: { kit: { select: { titulo: true, tipo: true } }, _count: { select: { entregas: true } } } }), prisma.desAtribuicao.count({ where })])
  res.json({ items, total, page, pageSize })
}))

async function acompanhamento(tenantId: string, id: string) {
  const at = await prisma.desAtribuicao.findFirst({ where: { id, tenantId }, include: { kit: { select: { titulo: true, tipo: true } }, entregas: true } })
  if (!at) throw httpErr(404, 'Atribuição não encontrada.')
  const nomes = await nomesAlunos(tenantId, at.entregas.map((e) => e.studentId))
  const agora = new Date()
  const itens = at.entregas.map((e) => ({ ...e, situacao: e.status === 'PENDENTE' ? estadoEntrega(at.prazo, null, agora) : e.status, aluno: nomes.get(e.studentId) ?? null, foraDoPrazo: !!e.entregueEm && e.entregueEm > at.prazo }))
  const entregues = itens.filter((i) => i.entregueEm)
  return {
    atribuicao: { id: at.id, kit: at.kit, prazo: at.prazo, status: at.status }, total: itens.length, entregues: entregues.length, pendentes: itens.filter((i) => !i.entregueEm && i.situacao === 'PENDENTE').length, atrasadas: itens.filter((i) => !i.entregueEm && i.situacao === 'ATRASADA').length,
    corrigidas: itens.filter((i) => i.status === 'CORRIGIDA').length, mediaNota: media(itens.filter((i) => i.nota != null).map((i) => i.nota!)), itens,
  }
}
router.get('/atribuicoes/:id/acompanhamento', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const at = await prisma.desAtribuicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (at && !isCoord(req) && at.professorUserId !== getUserId(req)) throw httpErr(403, 'Atribuição de outro professor.')
  res.json(await acompanhamento(tenantId, String(req.params.id)))
}))

router.post('/atribuicoes/:id/encerrar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const at = await prisma.desAtribuicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!at) throw httpErr(404, 'Atribuição não encontrada.')
  if (!isCoord(req) && at.professorUserId !== getUserId(req)) throw httpErr(403, 'Atribuição de outro professor.')
  const r = await prisma.desEntrega.updateMany({ where: { atribuicaoId: at.id, status: 'PENDENTE' }, data: { status: 'ATRASADA' } })
  await prisma.desAtribuicao.update({ where: { id: at.id }, data: { status: 'ENCERRADA' } })
  await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'DesAtribuicao', refId: at.id, assigneeStudentId: { not: null }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CANCELADO' } })
  res.json({ encerrada: true, naoEntregues: r.count })
}))
router.post('/atribuicoes/:id/cancelar', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const at = await prisma.desAtribuicao.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!at) throw httpErr(404, 'Atribuição não encontrada.')
  if (!isCoord(req) && at.professorUserId !== getUserId(req)) throw httpErr(403, 'Atribuição de outro professor.')
  if (await prisma.desEntrega.count({ where: { atribuicaoId: at.id, entregueEm: { not: null } } })) throw httpErr(409, 'Já há entregas; use encerrar.')
  await prisma.desAtribuicao.update({ where: { id: at.id }, data: { status: 'CANCELADA' } })
  await cancelReminders({ tenantId, refType: 'DesAtribuicao', refId: at.id })
  res.json({ cancelada: true })
}))

// ---------- Entregas ----------
router.get('/minhas-atividades', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const rows = await prisma.desEntrega.findMany({ where: { tenantId, studentId: requireStudentId(req), atribuicao: { status: { not: 'CANCELADA' } } }, include: { atribuicao: { include: { kit: { select: { titulo: true, tipo: true, tempoEstimadoMin: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 })
  res.json({ items: rows.map((e) => ({ entregaId: e.id, kit: e.atribuicao.kit, prazo: e.atribuicao.prazo, instrucoes: e.atribuicao.instrucoes, status: e.status === 'PENDENTE' ? estadoEntrega(e.atribuicao.prazo, null) : e.status, nota: e.nota, feedback: e.feedback })) })
}))

router.get('/entregas/:id', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const e = await prisma.desEntrega.findFirst({ where: { id: String(req.params.id), tenantId, studentId: requireStudentId(req) }, include: { atribuicao: { include: { kit: true } } } })
  if (!e) throw httpErr(404, 'Entrega não encontrada.')
  const ids = (e.atribuicao.kit.questaoIds as string[] | null) ?? []
  const questoes = ids.length ? await prisma.desQuestao.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, enunciado: true, alternativas: true } }) : []
  const k = e.atribuicao.kit
  res.json({ entregaId: e.id, titulo: k.titulo, tipo: k.tipo, conteudo: k.conteudo, questoes, prazo: e.atribuicao.prazo, status: e.status, respostas: e.respostas, texto: e.texto, nota: e.nota, feedback: e.feedback, gabaritoComentado: e.status === 'CORRIGIDA' ? k.gabaritoComentado : null })
}))

router.post('/entregas/:id/entregar', requireRole('STUDENT'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ respostas: z.record(z.string(), z.string().length(1)).optional(), texto: z.string().max(60000).optional() }), req.body)
  const e = await prisma.desEntrega.findFirst({ where: { id: String(req.params.id), tenantId, studentId: requireStudentId(req) }, include: { atribuicao: { include: { kit: true } } } })
  if (!e) throw httpErr(404, 'Entrega não encontrada.')
  if (e.atribuicao.status !== 'ABERTA') throw httpErr(409, 'A atividade foi encerrada/cancelada.')
  if (e.status === 'CORRIGIDA') throw httpErr(409, 'Atividade já corrigida.')
  const kit = e.atribuicao.kit
  const ids = (kit.questaoIds as string[] | null) ?? []
  if (!ids.length && !b.texto?.trim()) throw httpErr(400, 'Escreva a resposta antes de entregar.')
  const agora = new Date()
  let data: any = { respostas: b.respostas ?? undefined, texto: b.texto, entregueEm: agora, status: 'ENTREGUE' }
  if (ids.length && b.respostas) {
    // objetivas: correção automática
    const qs_ = await prisma.desQuestao.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, eixoId: true, gabarito: true, tipo: true } })
    if (qs_.every((q) => q.tipo === 'OBJETIVA')) {
      const r = corrigir(qs_.map((q) => ({ questaoId: q.id, eixoId: q.eixoId, gabarito: q.gabarito })), b.respostas)
      data = { ...data, acertos: r.acertos, total: r.total, nota: r.percentual, status: 'CORRIGIDA', corrigidaEm: agora, feedback: `Correção automática: ${r.acertos}/${r.total} acertos.` }
    }
  }
  const row = await prisma.desEntrega.update({ where: { id: e.id }, data })
  await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `des:at:${e.atribuicaoId}:al:${e.studentId}`, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: agora } })
  res.json({ ...row, foraDoPrazo: agora > e.atribuicao.prazo })
}))

router.patch('/entregas/:id/corrigir', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ nota: z.number().min(0).max(100), feedback: opt(z.string().max(5000)) }), req.body)
  const e = await prisma.desEntrega.findFirst({ where: { id: String(req.params.id), tenantId }, include: { atribuicao: true } })
  if (!e) throw httpErr(404, 'Entrega não encontrada.')
  if (!isCoord(req) && e.atribuicao.professorUserId !== getUserId(req)) throw httpErr(403, 'Atribuição de outro professor.')
  if (!e.entregueEm) throw httpErr(409, 'O aluno ainda não entregou.')
  const row = await prisma.desEntrega.update({ where: { id: e.id }, data: { nota: b.nota, feedback: b.feedback ?? undefined, status: 'CORRIGIDA', corrigidaEm: new Date() } })
  const nomes = await nomesAlunos(tenantId, [e.studentId])
  await notify({ tenantId, studentId: e.studentId, userId: nomes.get(e.studentId)?.userId, assunto: 'Atividade corrigida', mensagem: `Sua atividade foi corrigida. Nota: ${b.nota}.${b.feedback ? ' Feedback: ' + b.feedback : ''}`, refType: 'DesEntrega', refId: e.id })
  res.json(row)
}))

// ---------- Sugestões a partir das lacunas da turma ----------
router.get('/sugestoes/turma/:classSectionId', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const exameId = qs(req.query.exameId)
  if (!exameId) throw httpErr(400, 'Informe exameId.')
  const turma = await prisma.classSection.findFirst({ where: { id: String(req.params.classSectionId), tenantId } })
  if (!turma) throw httpErr(404, 'Turma não encontrada.')
  if (!isCoord(req) && turma.professorUserId !== getUserId(req)) throw httpErr(403, 'Turma de outro professor.')
  const alunos = await alunosDaTurma(tenantId, turma.id)
  const { lacunas, amostra } = await lacunasGrupo(tenantId, exameId, alunos)
  const kits = await prisma.desKit.findMany({ where: { tenantId, ativo: true, exameId, OR: [{ autorUserId: getUserId(req) }, { visibilidade: 'COMPARTILHADA' }] }, select: { id: true, eixoId: true, disciplineId: true, tipo: true, titulo: true, usos: true }, take: 500 })
  const sug = sugerirAtividades(lacunas, kits)
  res.json({ alunos: alunos.length, comSimulado: amostra, lacunas: lacunas.filter((l) => l.gap > 0).slice(0, 8), sugestoes: sug, aviso: amostra < 3 ? 'Poucos alunos com simulado realizado: aplique um diagnóstico para sugestões mais confiáveis.' : undefined, semKitParaLacunas: lacunas.filter((l) => l.gap > 0 && !kits.some((k) => k.eixoId === l.eixoId)).slice(0, 5).map((l) => l.eixoId) })
}))

export default router
