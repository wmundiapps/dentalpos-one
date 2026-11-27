import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, academicErrorHandler, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { calcAtrasosPorResponsavel, calcFunil, calcGargalos, diasDeAtraso, ehAberta, validarGrafo, Grafo } from './engine'
import { calcularLayout, gerarMermaid } from './layout'
import {
  PERSONAS, avancarEtapa, cancelarInstancia, carregarGrafo, defCompleta, dispararEvento, iniciarJornada, listarPendenciasDaPessoa, paraGrafo, pausarInstancia,
  pularEtapa, registrarAtraso, retomarInstancia, processarAtrasos,
} from './service'
import { templatesPadrao } from './templates'

const router = Router()
const MODULO = 'jornadas'

const TODOS: AcademicRole[] = ['ADMIN', 'OWNER', 'RECTOR', 'COORDINATOR', 'TEACHER', 'STUDENT', 'FINANCE', 'BOARD', 'SECRETARY', 'LIBRARIAN', 'FACILITIES', 'SUPPLIES', 'MARKETING', 'ADMISSIONS', 'SUPPORT', 'STAFF']
const GESTAO: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'ADMISSIONS', 'FINANCE']
const OPERACAO: AcademicRole[] = [...GESTAO, 'STAFF', 'MARKETING', 'SUPPORT']

const noSchema = z.object({
  chave: z.string().min(1).max(60).regex(/^[A-Za-z0-9_.-]+$/, 'use letras, números, _ . -'),
  titulo: z.string().min(1).max(200),
  descricao: z.string().max(2000).nullish(),
  tipo: z.enum(['INICIO', 'TAREFA', 'APROVACAO', 'ESPERA_EVENTO', 'GATEWAY', 'MARCO', 'FIM']).default('TAREFA'),
  papel: z.string().max(40).nullish(),
  slaDias: z.number().int().min(0).max(1000).nullish(),
  checklist: z.array(z.object({ chave: z.string().min(1), titulo: z.string().min(1), obrigatorio: z.boolean().optional() })).nullish(),
  documentos: z.array(z.object({ chave: z.string().min(1), titulo: z.string().min(1), obrigatorio: z.boolean().optional() })).nullish(),
  modulo: z.string().nullish(),
  rota: z.string().nullish(),
  evento: z.string().nullish(),
  lembrete: z.object({
    antecedenciaDias: z.number().int().min(0).optional(), recorrenciaDias: z.number().int().min(1).optional(), escalarPara: z.string().optional(),
    escalarAposDias: z.number().int().min(1).optional(), escalarPara2: z.string().optional(), severity: z.enum(['INFO', 'ATENCAO', 'CRITICO']).optional(),
  }).nullish(),
  fase: z.string().nullish(),
})
const condSchema: z.ZodType<any> = z.lazy(() => z.union([
  z.object({ campo: z.string(), op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'exists', 'truthy']), valor: z.any().optional() }),
  z.object({ and: z.array(condSchema) }), z.object({ or: z.array(condSchema) }), z.object({ not: condSchema }),
]))
const transSchema = z.object({ deChave: z.string(), paraChave: z.string(), rotulo: z.string().nullish(), condicao: condSchema.nullish(), prioridade: z.number().int().optional() })
const templateSchema = z.object({
  chave: z.string().min(2).max(60).regex(/^[a-z0-9_-]+$/, 'chave em minúsculas (a-z, 0-9, _ -)'),
  nome: z.string().min(2).max(200),
  persona: z.enum(PERSONAS),
  descricao: z.string().max(2000).nullish(),
  nos: z.array(noSchema).min(2),
  transicoes: z.array(transSchema),
})

const data = (n: any, tenantId: string, templateId: string, i: number) => ({
  tenantId, templateId, chave: n.chave, titulo: n.titulo, descricao: n.descricao ?? null, tipo: n.tipo, papel: n.papel ?? null, slaDias: n.slaDias ?? null,
  checklist: n.checklist ?? undefined, documentos: n.documentos ?? undefined, modulo: n.modulo ?? null, rota: n.rota ?? null, evento: n.evento ?? null,
  lembrete: n.lembrete ?? undefined, fase: n.fase ?? null, ordem: n.ordem ?? i,
})
const tdata = (t: any, tenantId: string, templateId: string) => ({ tenantId, templateId, deChave: t.deChave, paraChave: t.paraChave, rotulo: t.rotulo ?? null, condicao: t.condicao ?? undefined, prioridade: t.prioridade ?? 0 })

// ======================= BOOTSTRAP =======================
router.post('/bootstrap', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const criados: string[] = []
  const existentes: string[] = []
  for (const t of templatesPadrao()) {
    const ja = await prisma.jorTemplate.findFirst({ where: { tenantId, chave: t.chave } })
    if (ja) { existentes.push(t.chave); continue }
    await prisma.$transaction(async (tx) => {
      const tpl = await tx.jorTemplate.create({ data: { tenantId, chave: t.chave, nome: t.nome, persona: t.persona as any, descricao: t.descricao, status: 'PUBLICADO', padrao: true, publicadoEm: new Date() } })
      await tx.jorNo.createMany({ data: t.grafo.nos.map((n, i) => data(n, tenantId, tpl.id, i)) as any })
      await tx.jorTransicao.createMany({ data: t.grafo.transicoes.map((x) => tdata(x, tenantId, tpl.id)) as any })
    })
    criados.push(t.chave)
  }
  await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOOTSTRAP', detalhes: { criados } })
  res.status(201).json({ criados, existentes })
}))

// ======================= MODELOS (templates) =======================
router.get('/templates', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  const persona = qs(req.query.persona); if (persona) where.persona = persona.toUpperCase()
  const status = qs(req.query.status); if (status) where.status = status.toUpperCase()
  const q = qs(req.query.q); if (q) where.OR = [{ nome: { contains: q, mode: 'insensitive' } }, { chave: { contains: q, mode: 'insensitive' } }]
  const [items, total] = await Promise.all([
    prisma.jorTemplate.findMany({ where, orderBy: [{ persona: 'asc' }, { chave: 'asc' }, { versao: 'desc' }], skip, take, include: { _count: { select: { nos: true, instancias: true } } } }),
    prisma.jorTemplate.count({ where }),
  ])
  res.json({ items, total, page, pageSize })
}))

router.get('/templates/:id', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { template } = await carregarGrafo(getTenantId(req), String(req.params.id))
  res.json(template)
}))

router.post('/templates', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(templateSchema, req.body)
  if (await prisma.jorTemplate.findFirst({ where: { tenantId, chave: b.chave } })) throw Object.assign(new Error('Já existe modelo com esta chave; use nova-versao.'), { status: 409 })
  const tpl = await prisma.$transaction(async (tx) => {
    const t = await tx.jorTemplate.create({ data: { tenantId, chave: b.chave, nome: b.nome, persona: b.persona, descricao: b.descricao ?? null } })
    await tx.jorNo.createMany({ data: b.nos.map((n, i) => data(n, tenantId, t.id, i)) as any })
    await tx.jorTransicao.createMany({ data: b.transicoes.map((x) => tdata(x, tenantId, t.id)) as any })
    return t
  })
  await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CRIAR_MODELO', refType: 'JorTemplate', refId: tpl.id })
  res.status(201).json((await carregarGrafo(tenantId, tpl.id)).template)
}))

router.put('/templates/:id', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const cur = await prisma.jorTemplate.findFirst({ where: { id, tenantId } })
  if (!cur) return res.status(404).json({ error: 'Modelo não encontrado.' })
  if (cur.status !== 'RASCUNHO') return res.status(409).json({ error: 'Somente rascunhos podem ser editados; crie uma nova versão.' })
  const b = parseBody(templateSchema.partial({ chave: true, persona: true, nome: true }), req.body)
  await prisma.$transaction(async (tx) => {
    await tx.jorTemplate.update({ where: { id }, data: { nome: b.nome ?? undefined, persona: b.persona ?? undefined, descricao: b.descricao ?? undefined } })
    await tx.jorNo.deleteMany({ where: { templateId: id } })
    await tx.jorTransicao.deleteMany({ where: { templateId: id } })
    await tx.jorNo.createMany({ data: b.nos.map((n, i) => data(n, tenantId, id, i)) as any })
    await tx.jorTransicao.createMany({ data: b.transicoes.map((x) => tdata(x, tenantId, id)) as any })
  })
  await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'EDITAR_MODELO', refType: 'JorTemplate', refId: id })
  res.json((await carregarGrafo(tenantId, id)).template)
}))

router.delete('/templates/:id', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const id = String(req.params.id)
  const cur = await prisma.jorTemplate.findFirst({ where: { id, tenantId }, include: { _count: { select: { instancias: true } } } })
  if (!cur) return res.status(404).json({ error: 'Modelo não encontrado.' })
  if (cur._count.instancias > 0) return res.status(409).json({ error: 'Modelo já possui jornadas em andamento; arquive-o em vez de excluir.' })
  await prisma.jorTemplate.delete({ where: { id } })
  await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'REMOVER_MODELO', refType: 'JorTemplate', refId: id })
  res.status(204).end()
}))

router.post('/templates/:id/validar', requireRole('ADMIN', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { grafo } = await carregarGrafo(getTenantId(req), String(req.params.id))
  const v = validarGrafo(grafo)
  res.json({ valido: v.erros.length === 0, ...v })
}))

router.post('/templates/:id/publicar', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { template, grafo } = await carregarGrafo(tenantId, String(req.params.id))
  if (template.status === 'PUBLICADO') return res.status(409).json({ error: 'Modelo já publicado.' })
  const v = validarGrafo(grafo)
  if (v.erros.length) return res.status(422).json({ error: 'Grafo inválido.', ...v })
  await prisma.$transaction([
    prisma.jorTemplate.updateMany({ where: { tenantId, chave: template.chave, status: 'PUBLICADO' }, data: { status: 'ARQUIVADO' } }),
    prisma.jorTemplate.update({ where: { id: template.id }, data: { status: 'PUBLICADO', publicadoEm: new Date() } }),
  ])
  await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'PUBLICAR_MODELO', refType: 'JorTemplate', refId: template.id, detalhes: { versao: template.versao } })
  res.json({ ok: true, avisos: v.avisos, versao: template.versao })
}))

router.post('/templates/:id/arquivar', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.jorTemplate.updateMany({ where: { id: String(req.params.id), tenantId }, data: { status: 'ARQUIVADO' } })
  if (!r.count) return res.status(404).json({ error: 'Modelo não encontrado.' })
  res.json({ ok: true })
}))

router.post('/templates/:id/nova-versao', requireRole('ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { template, grafo } = await carregarGrafo(tenantId, String(req.params.id))
  const ultimo = await prisma.jorTemplate.findFirst({ where: { tenantId, chave: template.chave }, orderBy: { versao: 'desc' } })
  const novo = await prisma.$transaction(async (tx) => {
    const t = await tx.jorTemplate.create({ data: { tenantId, chave: template.chave, versao: (ultimo?.versao ?? template.versao) + 1, nome: template.nome, persona: template.persona, descricao: template.descricao, status: 'RASCUNHO' } })
    await tx.jorNo.createMany({ data: grafo.nos.map((n, i) => data(n, tenantId, t.id, i)) as any })
    await tx.jorTransicao.createMany({ data: grafo.transicoes.map((x) => tdata(x, tenantId, t.id)) as any })
    return t
  })
  await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'NOVA_VERSAO_MODELO', refType: 'JorTemplate', refId: novo.id })
  res.status(201).json(novo)
}))

router.get('/templates/:id/mermaid', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { template, grafo } = await carregarGrafo(getTenantId(req), String(req.params.id))
  const texto = gerarMermaid(grafo, { direcao: qs(req.query.direcao)?.toUpperCase() === 'LR' ? 'LR' : 'TD', titulo: template.nome })
  if (qs(req.query.formato) === 'json') return res.json({ mermaid: texto, nome: template.nome, persona: template.persona, versao: template.versao })
  res.type('text/plain; charset=utf-8').send(texto)
}))

router.get('/templates/:id/diagrama', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { template, grafo } = await carregarGrafo(getTenantId(req), String(req.params.id))
  const direcao = qs(req.query.direcao)?.toUpperCase() === 'LR' ? 'LR' : 'TB'
  res.json({ template: { id: template.id, chave: template.chave, nome: template.nome, persona: template.persona, versao: template.versao }, ...calcularLayout(grafo, { direcao }) })
}))

// ======================= INSTÂNCIAS =======================
const iniciarSchema = z.object({
  personType: z.string().min(2).max(30), personId: z.string().min(1), templateKey: z.string().optional(), templateId: z.string().optional(),
  personNome: z.string().max(200).optional(), contexto: z.record(z.any()).optional(),
}).refine((v) => v.templateKey || v.templateId, { message: 'Informe templateKey (chave ou persona) ou templateId.' })

router.post('/instancias', requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(iniciarSchema, req.body)
  const r = await iniciarJornada(getTenantId(req), { ...b, userId: getUserId(req) })
  res.status(r.jaExistia ? 200 : 201).json(r)
}))

router.get('/instancias', requireRole(...GESTAO, 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const where: any = { tenantId }
  for (const f of ['status', 'personType', 'personId', 'templateId', 'templateChave']) {
    const v = qs((req.query as any)[f]); if (v) where[f] = f === 'status' ? v.toUpperCase() : f === 'personType' ? v.toLowerCase() : v
  }
  const q = qs(req.query.q); if (q) where.personNome = { contains: q, mode: 'insensitive' }
  const [items, total] = await Promise.all([
    prisma.jorInstancia.findMany({ where, orderBy: { iniciadaEm: 'desc' }, skip, take, include: { etapas: { where: { status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } }, select: { id: true, noChave: true, titulo: true, papel: true, status: true, prazoEm: true, rota: true } } } }),
    prisma.jorInstancia.count({ where }),
  ])
  res.json({ items, total, page, pageSize })
}))

async function carregarInstancia(req: AuthenticatedRequest, id: string) {
  const tenantId = getTenantId(req)
  const inst = await prisma.jorInstancia.findFirst({ where: { id, tenantId }, include: { etapas: { orderBy: [{ iniciadaEm: 'asc' }, { createdAt: 'asc' }] }, historico: { orderBy: { createdAt: 'asc' } } } })
  if (!inst) throw Object.assign(new Error('Jornada não encontrada.'), { status: 404 })
  if (req.user?.role === 'STUDENT' && inst.personId !== req.user.studentId) throw Object.assign(new Error('Sem permissão para esta jornada.'), { status: 403 })
  return inst
}

router.get('/instancias/:id', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await carregarInstancia(req, String(req.params.id)))
}))

router.get('/instancias/:id/historico', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const i = await carregarInstancia(req, String(req.params.id))
  res.json(i.historico)
}))

// diagrama do template com o status de cada nó para ESTA pessoa (verde=feito, azul=em andamento, vermelho=atrasado)
router.get('/instancias/:id/diagrama', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const inst = await carregarInstancia(req, String(req.params.id))
  const { grafo } = await carregarGrafo(inst.tenantId, inst.templateId)
  const d = calcularLayout(grafo, { direcao: qs(req.query.direcao)?.toUpperCase() === 'LR' ? 'LR' : 'TB' })
  const rank: Record<string, number> = { PENDENTE: 0, CONCLUIDA: 1, PULADA: 1, ABERTA: 2, AGUARDANDO_EVENTO: 2, ATRASADA: 3 }
  const st = new Map<string, string>()
  for (const e of inst.etapas) {
    if (e.status === 'CANCELADA') continue
    const atual = st.get(e.noChave) ?? 'PENDENTE'
    if ((rank[e.status] ?? 0) >= (rank[atual] ?? 0)) st.set(e.noChave, e.status)
  }
  res.json({ ...d, nos: d.nos.map((n) => ({ ...n, estado: st.get(n.id) ?? 'PENDENTE' })) })
}))

const ctxPatch = z.object({ checklist: z.record(z.boolean()).optional(), decisao: z.enum(['APROVADO', 'REJEITADO']).optional(), contexto: z.record(z.any()).optional(), observacao: z.string().max(2000).optional() })

router.post('/instancias/:id/etapas/:etapaId/avancar', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(ctxPatch, req.body ?? {})
  const etapa = await prisma.jorEtapa.findFirst({ where: { id: String(req.params.etapaId), instanciaId: String(req.params.id), tenantId: getTenantId(req) }, select: { id: true } })
  if (!etapa) return res.status(404).json({ error: 'Etapa não encontrada.' })
  res.json(await avancarEtapa(getTenantId(req), { etapaId: etapa.id, user: req.user as any, ...b }))
}))

// marcar/desmarcar itens de checklist/documentos sem concluir a etapa (chave de documento = "doc:<chave>")
router.post('/instancias/:id/etapas/:etapaId/checklist', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ itens: z.record(z.boolean()) }), req.body)
  const etapa = await prisma.jorEtapa.findFirst({ where: { id: String(req.params.etapaId), instanciaId: String(req.params.id), tenantId }, include: { instancia: true } })
  if (!etapa) return res.status(404).json({ error: 'Etapa não encontrada.' })
  const { podeAtuar } = await import('./engine')
  if (!ehAberta(etapa.status)) return res.status(409).json({ error: 'Etapa já encerrada.' })
  if (req.user!.role === 'STUDENT' && etapa.instancia.personId !== req.user!.studentId) return res.status(403).json({ error: 'Esta etapa pertence a outro aluno.' })
  if (!podeAtuar(req.user as any, etapa)) return res.status(403).json({ error: 'Sem permissão para esta etapa.' })
  const { aplicarChecklist, checklistPendente } = await import('./engine')
  const def = defCompleta(etapa)
  const estado = aplicarChecklist(etapa.checklistEstado as any, b.itens, getUserId(req), new Date(), def)
  await prisma.jorEtapa.update({ where: { id: etapa.id }, data: { checklistEstado: estado as any } })
  await prisma.jorHistorico.create({ data: { tenantId, instanciaId: etapa.instanciaId, etapaId: etapa.id, acao: 'CHECKLIST_ATUALIZADO', userId: getUserId(req), detalhes: b.itens } })
  res.json({ checklistEstado: estado, pendentes: checklistPendente(def, estado) })
}))

router.post('/instancias/:id/etapas/:etapaId/atraso', requireRole(...OPERACAO, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ motivo: z.string().min(5).max(1000), novoPrazo: dateISO().optional() }), req.body)
  res.json(await registrarAtraso(getTenantId(req), { etapaId: String(req.params.etapaId), motivo: b.motivo, novoPrazo: b.novoPrazo, userId: getUserId(req) }))
}))

router.post('/instancias/:id/etapas/:etapaId/pular', requireRole('COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ justificativa: z.string().min(10).max(1000) }), req.body)
  res.json(await pularEtapa(getTenantId(req), { etapaId: String(req.params.etapaId), justificativa: b.justificativa, user: req.user as any }))
}))

router.post('/instancias/:id/etapas/:etapaId/reatribuir', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ responsavelUserId: z.string().nullable() }), req.body)
  const e = await prisma.jorEtapa.findFirst({ where: { id: String(req.params.etapaId), tenantId }, include: { instancia: true } })
  if (!e) return res.status(404).json({ error: 'Etapa não encontrada.' })
  if (!ehAberta(e.status)) return res.status(409).json({ error: 'Etapa já encerrada.' })
  if (b.responsavelUserId) {
    const u = await prisma.user.findFirst({ where: { id: b.responsavelUserId, tenantId }, select: { id: true } })
    if (!u) return res.status(400).json({ error: 'Usuário responsável não encontrado.' })
  }
  const up = await prisma.jorEtapa.update({ where: { id: e.id }, data: { responsavelUserId: b.responsavelUserId } })
  if (up.prazoEm) {
    await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: `jor:etapa:${e.id}`, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { assigneeUserId: b.responsavelUserId, assigneeRole: b.responsavelUserId ? null : e.papel } })
  }
  await prisma.jorHistorico.create({ data: { tenantId, instanciaId: e.instanciaId, etapaId: e.id, acao: 'REATRIBUIDA', userId: getUserId(req), detalhes: b } })
  res.json(up)
}))

router.post('/instancias/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ motivo: z.string().min(5).max(1000) }), req.body)
  res.json(await cancelarInstancia(getTenantId(req), { instanciaId: String(req.params.id), motivo: b.motivo, userId: getUserId(req) }))
}))
router.post('/instancias/:id/pausar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await pausarInstancia(getTenantId(req), String(req.params.id), getUserId(req)))
}))
router.post('/instancias/:id/retomar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await retomarInstancia(getTenantId(req), String(req.params.id), getUserId(req)))
}))

// evento externo que destrava etapas ESPERA_EVENTO
router.post('/eventos', requireRole(...OPERACAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const b = parseBody(z.object({ evento: z.string().min(2), personType: z.string().optional(), personId: z.string().optional(), instanciaId: z.string().optional(), contexto: z.record(z.any()).optional() }), req.body)
  res.json(await dispararEvento(getTenantId(req), { ...b, userId: getUserId(req) }))
}))

// ======================= PENDÊNCIAS =======================
router.get('/pendencias', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const personType = qs(req.query.personType)
  const personId = qs(req.query.personId)
  if (!personType || !personId) return res.status(400).json({ error: 'Informe personType e personId.' })
  if (req.user!.role === 'STUDENT' && personId !== req.user!.studentId) return res.status(403).json({ error: 'Sem permissão.' })
  res.json(await listarPendenciasDaPessoa(getTenantId(req), personType, personId))
}))

// Caixa de trabalho do usuário logado: etapas do seu papel ou atribuídas a ele (aluno: as suas).
router.get('/minhas-pendencias', requireRole(...TODOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const u = req.user!
  const or: any[] = [{ responsavelUserId: u.id }, { papel: u.role, responsavelUserId: null }]
  const where: any = { tenantId, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] }, instancia: { status: 'ATIVA' } }
  if (u.role === 'STUDENT') where.instancia.personId = u.studentId ?? '__none__'
  else where.OR = or
  const etapas = await prisma.jorEtapa.findMany({ where, include: { instancia: { select: { id: true, personNome: true, personType: true, personId: true, templateChave: true } } }, orderBy: { prazoEm: 'asc' }, take: 300 })
  const agora = new Date()
  res.json(etapas.map((e) => ({ ...e, diasAtraso: diasDeAtraso(e.prazoEm, agora) })))
}))

// ======================= PAINEL =======================
const etapasFato = (tenantId: string, where: any = {}) => prisma.jorEtapa.findMany({ where: { tenantId, ...where }, take: 20000, orderBy: { iniciadaEm: 'desc' } })

router.get('/painel/resumo', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const [porStatus, abertas, porPersona] = await Promise.all([
    prisma.jorInstancia.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    prisma.jorEtapa.groupBy({ by: ['status'], where: { tenantId, status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] }, instancia: { status: 'ATIVA' } }, _count: true }),
    prisma.jorInstancia.findMany({ where: { tenantId, status: 'ATIVA' }, select: { template: { select: { persona: true } } } }),
  ])
  const persona: Record<string, number> = {}
  for (const i of porPersona) persona[i.template.persona] = (persona[i.template.persona] ?? 0) + 1
  res.json({ instancias: Object.fromEntries(porStatus.map((x) => [x.status, x._count])), etapasAbertas: Object.fromEntries(abertas.map((x) => [x.status, x._count])), ativasPorPersona: persona })
}))

// onde está cada pessoa
router.get('/painel/onde-estao', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { skip, take, page, pageSize } = pageParams(req.query)
  const inst: any = { tenantId, status: 'ATIVA' }
  const templateId = qs(req.query.templateId); if (templateId) inst.templateId = templateId
  const persona = qs(req.query.persona); if (persona) inst.template = { persona: persona.toUpperCase() }
  const etapaWhere: any = { status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] } }
  const papel = qs(req.query.papel); if (papel) etapaWhere.papel = papel.toUpperCase()
  if (qs(req.query.atrasadas) === 'true') etapaWhere.status = 'ATRASADA'
  const noChave = qs(req.query.noChave); if (noChave) etapaWhere.noChave = noChave
  const where = { ...inst, etapas: { some: etapaWhere } }
  const [rows, total] = await Promise.all([
    prisma.jorInstancia.findMany({ where, skip, take, orderBy: { iniciadaEm: 'asc' }, include: { etapas: { where: etapaWhere, select: { id: true, noChave: true, titulo: true, fase: true, papel: true, status: true, prazoEm: true, diasAtraso: true, rota: true } } } }),
    prisma.jorInstancia.count({ where }),
  ])
  res.json({ items: rows.map((r) => ({ instanciaId: r.id, personType: r.personType, personId: r.personId, personNome: r.personNome, jornada: r.templateChave, iniciadaEm: r.iniciadaEm, etapasAtuais: r.etapas })), total, page, pageSize })
}))

router.get('/painel/funil', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const templateId = qs(req.query.templateId)
  if (!templateId) return res.status(400).json({ error: 'Informe templateId.' })
  const { template, grafo } = await carregarGrafo(tenantId, templateId)
  const etapas = await etapasFato(tenantId, { instancia: { templateId } })
  const nos = grafo.nos.filter((n) => !['GATEWAY'].includes(n.tipo)).map((n) => ({ chave: n.chave, titulo: n.titulo, ordem: n.ordem ?? 0 }))
  res.json({ template: { id: template.id, chave: template.chave, nome: template.nome }, funil: calcFunil(nos, etapas) })
}))

router.get('/painel/gargalos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const templateId = qs(req.query.templateId)
  const etapas = await etapasFato(tenantId, { tipo: { in: ['TAREFA', 'APROVACAO', 'ESPERA_EVENTO'] }, ...(templateId ? { instancia: { templateId } } : {}) })
  res.json(calcGargalos(etapas).slice(0, 50))
}))

router.get('/painel/atrasos-responsavel', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const etapas = await etapasFato(tenantId, { status: { in: ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'] }, instancia: { status: 'ATIVA' } })
  res.json(calcAtrasosPorResponsavel(etapas))
}))

// execução manual do detector de atrasos (o cron /api/cron/edu também roda)
router.post('/processar-atrasos', requireRole('ADMIN'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json(await processarAtrasos())
}))

router.use(academicErrorHandler)

export default router

// Sem rotas públicas: jornadas contêm dados internos de pessoas.
export const publicRouter = Router()

export { iniciarJornada, avancarEtapa, listarPendenciasDaPessoa, dispararEvento, pularEtapa, registrarAtraso, cancelarInstancia, processarAtrasos } from './service'
export type { Grafo }
