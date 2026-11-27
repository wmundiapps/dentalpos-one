import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { callAIForJSON, AiUnavailableError } from '../../services-ai/client'
import { prontidao, conferenciaHeuristica, addDays } from './rules'
import { MODULO, READ, WRITE, EVIDENCIA, bad } from './common'

const DIMS = ['ORGANIZACAO_DIDATICO_PEDAGOGICA', 'CORPO_DOCENTE_TUTORIAL', 'INFRAESTRUTURA', 'DOCUMENTAL', 'GESTAO_INSTITUCIONAL'] as const
const INSTR = ['INSTITUCIONAL', 'CURSO_AUTORIZACAO', 'CURSO_RECONHECIMENTO', 'CURSO_RENOVACAO', 'DOCUMENTAL'] as const
const TIPOS_PROC = ['CREDENCIAMENTO', 'RECREDENCIAMENTO', 'AUTORIZACAO_CURSO', 'RECONHECIMENTO_CURSO', 'RENOVACAO_RECONHECIMENTO', 'ADITAMENTO_VAGAS', 'ADITAMENTO_ENDERECO', 'ADITAMENTO_POLO_EAD', 'TRANSFERENCIA_MANTENCA', 'OUTRO'] as const

export async function recalcularProntidao(tenantId: string, checklistId: string) {
  const itens = await prisma.regChecklistItem.findMany({ where: { tenantId, checklistId } })
  const p = prontidao(itens.map((i) => ({ status: i.status as any, peso: i.peso, obrigatorio: i.obrigatorio, prazo: i.prazo, dimensao: i.dimensao })))
  await prisma.regChecklist.update({ where: { id: checklistId }, data: { prontidao: p.percentual } })
  return p
}

async function lembreteItem(item: any, checklistNome: string) {
  if (!item.prazo || ['ATENDIDO', 'NAO_APLICAVEL'].includes(item.status)) return
  await scheduleReminder({
    tenantId: item.tenantId, modulo: MODULO, titulo: `Requisito regulatório: ${item.titulo.slice(0, 120)}`, descricao: `Checklist: ${checklistNome}`,
    dueAt: new Date(item.prazo), antecedenciaDias: 5, severity: item.obrigatorio ? 'ATENCAO' : 'INFO', refType: 'RegChecklistItem', refId: item.id,
    assigneeUserId: item.responsavelId ?? undefined, assigneeRole: item.responsavelId ? undefined : item.responsavelRole ?? 'COORDINATOR', dedupeKey: `reg:item:${item.id}`,
  })
}

const itemUpdate = z.object({
  status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'ATENDIDO', 'NAO_APLICAVEL']).optional(),
  responsavelId: z.string().nullable().optional(),
  prazo: dateISO().nullable().optional(),
  evidenciaUrl: z.string().url().nullable().optional(),
  evidenciaTexto: z.string().max(4000).nullable().optional(),
  obrigatorio: z.boolean().optional(),
})

const evidenciaSchema = z.object({
  nome: z.string().min(1).max(200),
  url: z.string().url().optional(),
  dataUrl: z.string().max(2_500_000).startsWith('data:').optional(),
  mime: z.string().max(100).optional(),
}).refine((a) => a.url || a.dataUrl, { message: 'informe url ou dataUrl' })

export function mountChecklists(router: Router) {
  const guard = requireRole(...READ, ...WRITE)

  // ---- Modelos (catálogo) ----
  mountCrud(router, {
    model: 'regChecklistModelo', path: '/checklist-modelos', modulo: MODULO, read: READ, write: WRITE,
    create: z.object({
      chave: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'use minúsculas, números e hífen'),
      nome: z.string().min(3).max(200), tipoProcesso: z.enum(TIPOS_PROC).optional().nullable(), instrumento: z.enum(INSTR).optional(),
      descricao: z.string().max(2000).optional().nullable(), ativo: z.boolean().optional(),
    }),
    include: { itens: { orderBy: { ordem: 'asc' } } }, search: ['nome', 'chave'], filters: ['tipoProcesso', 'instrumento', 'ativo'], orderBy: { nome: 'asc' },
  })

  router.post(
    '/checklist-modelos/:id/itens',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({
        titulo: z.string().min(3).max(300), descricao: z.string().max(2000).optional(), dimensao: z.enum(DIMS).optional(), obrigatorio: z.boolean().optional(),
        peso: z.number().int().min(1).max(10).optional(), prazoDias: z.number().int().min(0).max(1000).optional(), responsavelRole: z.string().max(30).optional(), ordem: z.number().int().optional(),
      }), req.body)
      const m = await prisma.regChecklistModelo.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!m) return res.status(404).json({ error: 'Modelo não encontrado.' })
      const ordem = b.ordem ?? (await prisma.regChecklistModeloItem.count({ where: { tenantId, modeloId: m.id } })) + 1
      res.status(201).json(await prisma.regChecklistModeloItem.create({ data: { ...b, ordem, tenantId, modeloId: m.id } }))
    }),
  )
  router.delete(
    '/checklist-modelos/:id/itens/:itemId',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const r = await prisma.regChecklistModeloItem.deleteMany({ where: { id: String(req.params.itemId), modeloId: String(req.params.id), tenantId: getTenantId(req) } })
      if (!r.count) return res.status(404).json({ error: 'Item não encontrado.' })
      res.status(204).end()
    }),
  )

  // ---- Itens (antes de /checklists/:id) ----
  router.patch(
    '/checklists/itens/:itemId',
    requireRole(...EVIDENCIA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(itemUpdate, req.body)
      const it = await prisma.regChecklistItem.findFirst({ where: { id: String(req.params.itemId), tenantId }, include: { checklist: true } })
      if (!it) return res.status(404).json({ error: 'Item não encontrado.' })
      const evidTxt = b.evidenciaTexto !== undefined ? b.evidenciaTexto : it.evidenciaTexto
      const evidUrl = b.evidenciaUrl !== undefined ? b.evidenciaUrl : it.evidenciaUrl
      const temEvid = Boolean(evidTxt || evidUrl || (Array.isArray(it.evidencias) && it.evidencias.length))
      if (b.status === 'ATENDIDO' && it.obrigatorio && !temEvid) throw bad('Item obrigatório só pode ser marcado como ATENDIDO com evidência anexa (arquivo, URL ou descrição).')
      const data: any = { ...b }
      if (b.status) data.concluidoEm = b.status === 'ATENDIDO' ? new Date() : null
      const novo = await prisma.regChecklistItem.update({ where: { id: it.id }, data })
      if (b.status && ['ATENDIDO', 'NAO_APLICAVEL'].includes(b.status)) await completeReminders({ tenantId, refType: 'RegChecklistItem', refId: it.id, userId })
      else await lembreteItem({ ...novo, responsavelRole: null }, it.checklist.nome)
      const p = await recalcularProntidao(tenantId, it.checklistId)
      await audit({ tenantId, userId, modulo: MODULO, acao: 'ITEM_ATUALIZADO', refType: 'RegChecklistItem', refId: it.id, detalhes: b })
      res.json({ item: novo, prontidao: p })
    }),
  )

  router.post(
    '/checklists/itens/:itemId/evidencias',
    requireRole(...EVIDENCIA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(evidenciaSchema, req.body)
      const it = await prisma.regChecklistItem.findFirst({ where: { id: String(req.params.itemId), tenantId } })
      if (!it) return res.status(404).json({ error: 'Item não encontrado.' })
      const atual = Array.isArray(it.evidencias) ? (it.evidencias as any[]) : []
      if (atual.length >= 20) throw bad('Limite de 20 evidências por item.')
      const novo = await prisma.regChecklistItem.update({
        where: { id: it.id },
        data: { evidencias: [...atual, { ...b, em: new Date().toISOString(), por: getUserId(req) }] as any, status: it.status === 'PENDENTE' ? 'EM_ANDAMENTO' : it.status },
      })
      await recalcularProntidao(tenantId, it.checklistId)
      res.status(201).json(novo)
    }),
  )

  // Conferência de documento contra requisito (IA com fallback heurístico). Não marca como atendido sozinha
  // a menos que aplicar=true e o resultado seja positivo; sempre registra a conferência no item.
  router.post(
    '/checklists/itens/:itemId/conferir',
    requireRole(...EVIDENCIA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ texto: z.string().min(20).max(60000), nomeDocumento: z.string().max(200).optional(), aplicar: z.boolean().optional() }), req.body)
      const it = await prisma.regChecklistItem.findFirst({ where: { id: String(req.params.itemId), tenantId } })
      if (!it) return res.status(404).json({ error: 'Item não encontrado.' })
      const requisito = `${it.titulo}${it.descricao ? ' — ' + it.descricao : ''}`
      let conf: any
      try {
        const r = await callAIForJSON<{ atende: boolean | 'parcial'; justificativa: string; trechos?: string[]; lacunas?: string[] }>({
          system: 'Você é analista de regulação educacional (MEC/INEP). Verifique se o documento fornecido comprova o requisito. Responda SOMENTE JSON: {"atende": true|false|"parcial", "justificativa": string, "trechos": string[] (citações curtas do documento), "lacunas": string[] (o que falta)}. Seja conservador: se o documento não comprovar claramente, não responda true.',
          user: `REQUISITO:\n${requisito}\n\nDOCUMENTO${b.nomeDocumento ? ' (' + b.nomeDocumento + ')' : ''}:\n${b.texto.slice(0, 30000)}`,
          maxTokens: 1200,
          ctx: { clinicId: req.user?.clinicId, tenantId, actorId: userId, referenceType: 'RegChecklistItem', referenceId: it.id },
        })
        conf = { modo: 'IA', atende: r.atende === true ? true : r.atende === false ? false : null, parcial: r.atende === 'parcial', justificativa: String(r.justificativa ?? '').slice(0, 1500), trechos: (r.trechos ?? []).slice(0, 6), lacunas: (r.lacunas ?? []).slice(0, 8) }
      } catch (e: any) {
        const h = conferenciaHeuristica(requisito, b.texto)
        conf = { modo: 'HEURISTICO', atende: h.atende, parcial: h.atende === null, cobertura: h.cobertura, termosEncontrados: h.encontrados, termosAusentes: h.ausentes, justificativa: e instanceof AiUnavailableError ? 'IA indisponível: conferência por correspondência de termos; REVISÃO HUMANA obrigatória.' : 'Falha na IA; conferência heurística. REVISÃO HUMANA obrigatória.' }
      }
      conf.em = new Date().toISOString()
      conf.documento = b.nomeDocumento ?? null
      const data: any = { conferenciaIA: conf }
      if (b.aplicar && conf.atende === true) {
        data.status = 'ATENDIDO'
        data.concluidoEm = new Date()
        data.evidenciaTexto = it.evidenciaTexto || `Conferido (${conf.modo}): ${conf.justificativa}`.slice(0, 1000)
      } else if (conf.parcial && it.status === 'PENDENTE') data.status = 'EM_ANDAMENTO'
      const novo = await prisma.regChecklistItem.update({ where: { id: it.id }, data })
      if (data.status === 'ATENDIDO') await completeReminders({ tenantId, refType: 'RegChecklistItem', refId: it.id, userId })
      await recalcularProntidao(tenantId, it.checklistId)
      await audit({ tenantId, userId, modulo: MODULO, acao: 'CONFERENCIA_DOCUMENTO', refType: 'RegChecklistItem', refId: it.id, detalhes: { modo: conf.modo, atende: conf.atende } })
      res.json({ conferencia: conf, item: novo })
    }),
  )

  // ---- Checklists (instâncias) ----
  router.post(
    '/checklists',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({
        modeloId: z.string().optional(), chave: z.string().optional(), nome: z.string().min(3).max(200).optional(),
        processoId: z.string().optional(), programId: z.string().optional(), prazo: dateISO().optional(), responsavelId: z.string().optional(),
      }), req.body)
      if (!b.modeloId && !b.chave) throw bad('Informe modeloId ou chave do modelo.')
      const modelo = await prisma.regChecklistModelo.findFirst({ where: { tenantId, ...(b.modeloId ? { id: b.modeloId } : { chave: b.chave }) }, include: { itens: { orderBy: { ordem: 'asc' } } } })
      if (!modelo) throw bad('Modelo de checklist não encontrado (rode POST /regulatorio/bootstrap).', 404)
      if (b.processoId && !(await prisma.regProcesso.findFirst({ where: { id: b.processoId, tenantId }, select: { id: true } }))) throw bad('Processo não encontrado.')
      if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) throw bad('Curso não encontrado.')
      const hoje = new Date()
      const cl = await prisma.regChecklist.create({ data: { tenantId, nome: b.nome ?? modelo.nome, modeloId: modelo.id, instrumento: modelo.instrumento, processoId: b.processoId, programId: b.programId, prazo: b.prazo } })
      const itens = await Promise.all(
        modelo.itens.map((mi) =>
          prisma.regChecklistItem.create({
            data: {
              tenantId, checklistId: cl.id, ordem: mi.ordem, dimensao: mi.dimensao, titulo: mi.titulo, descricao: mi.descricao, obrigatorio: mi.obrigatorio, peso: mi.peso,
              responsavelId: b.responsavelId, prazo: b.prazo && mi.prazoDias != null ? new Date(Math.min(b.prazo.getTime(), addDays(hoje, mi.prazoDias).getTime())) : mi.prazoDias != null ? addDays(hoje, mi.prazoDias) : b.prazo,
            },
          }),
        ),
      )
      for (const it of itens) await lembreteItem({ ...it, responsavelRole: modelo.itens.find((m) => m.ordem === it.ordem)?.responsavelRole }, cl.nome)
      const p = await recalcularProntidao(tenantId, cl.id)
      await audit({ tenantId, userId, modulo: MODULO, acao: 'CHECKLIST_CRIADO', refType: 'RegChecklist', refId: cl.id })
      res.status(201).json({ ...cl, prontidao: p.percentual, itens })
    }),
  )

  router.get(
    '/checklists',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['processoId', 'programId', 'instrumento']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
      const [items, total] = await Promise.all([prisma.regChecklist.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }), prisma.regChecklist.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/checklists/:id',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const cl = await prisma.regChecklist.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: { orderBy: { ordem: 'asc' } } } })
      if (!cl) return res.status(404).json({ error: 'Checklist não encontrado.' })
      const p = prontidao(cl.itens.map((i) => ({ status: i.status as any, peso: i.peso, obrigatorio: i.obrigatorio, prazo: i.prazo, dimensao: i.dimensao })))
      res.json({ ...cl, resumo: p })
    }),
  )

  router.patch(
    '/checklists/:id',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({ nome: z.string().min(3).max(200).optional(), prazo: dateISO().nullable().optional() }), req.body)
      const r = await prisma.regChecklist.updateMany({ where: { id: String(req.params.id), tenantId }, data: b })
      if (!r.count) return res.status(404).json({ error: 'Checklist não encontrado.' })
      res.json(await prisma.regChecklist.findFirst({ where: { id: String(req.params.id), tenantId } }))
    }),
  )

  router.delete(
    '/checklists/:id',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const cl = await prisma.regChecklist.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: { select: { id: true } } } })
      if (!cl) return res.status(404).json({ error: 'Checklist não encontrado.' })
      await prisma.eduReminder.updateMany({ where: { tenantId, refType: 'RegChecklistItem', refId: { in: cl.itens.map((i) => i.id) }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CANCELADO' } })
      await prisma.regChecklist.delete({ where: { id: cl.id } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'REMOVER', refType: 'RegChecklist', refId: cl.id })
      res.status(204).end()
    }),
  )
}
