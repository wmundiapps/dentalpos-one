import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { cancelReminders } from '../core/reminders'
import { READ, WRITE, MOD, DAY, ensureReminder, assertProgram, fail, optDate } from './common'
import { diffLinhas } from './pdiLogic'

const TIPOS = ['REGIMENTO', 'ESTATUTO', 'PPI', 'PPC', 'POLITICA', 'MANUAL', 'OUTRO'] as const

async function agendarFimVigencia(v: any, titulo: string) {
  if (!v.vigenciaFim || v.status !== 'VIGENTE') return
  await ensureReminder({
    tenantId: v.tenantId, modulo: MOD, titulo: `Vigência de documento institucional termina: ${titulo} (v${v.versao})`,
    descricao: 'Providencie a revisão/nova versão antes do fim da vigência.', dueAt: v.vigenciaFim, antecedenciaDias: 90,
    refType: 'GovDocumentoVersao', refId: v.id, assigneeRole: 'COORDINATOR', severity: 'ATENCAO', dedupeKey: `gov:doc:vigencia:${v.id}`,
  })
}

export function registerDocumentos(router: Router) {
  mountCrud(router, {
    model: 'govDocumento', path: '/documentos', read: READ, write: WRITE, modulo: 'governanca.documentos', filters: ['tipo', 'programId', 'ativo'], search: ['titulo', 'codigo'],
    create: z.object({ tipo: z.enum(TIPOS), titulo: z.string().min(3), codigo: z.string().optional(), programId: z.string().optional(), descricao: z.string().optional() }),
    beforeCreate: async (d, req) => {
      if (d.tipo === 'PPC' && !d.programId) fail(400, 'PPC exige o curso (programId).')
      await assertProgram(getTenantId(req), d.programId)
    },
    beforeUpdate: async (d, req) => { delete d.tipo; if (d.programId) await assertProgram(getTenantId(req), d.programId) },
    include: { versoes: { select: { id: true, versao: true, status: true, vigenciaInicio: true, vigenciaFim: true }, orderBy: { versao: 'desc' } } },
  })

  router.get('/documentos/:id/versoes', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.govDocumentoVersao.findMany({ where: { tenantId: getTenantId(req), documentoId: String(req.params.id) }, orderBy: { versao: 'desc' }, select: { id: true, versao: true, status: true, vigenciaInicio: true, vigenciaFim: true, resumoAlteracoes: true, aprovadoPorId: true, deliberacaoId: true, createdAt: true } })
    res.json({ items, total: items.length })
  }))

  router.post('/documentos/:id/versoes', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req); const documentoId = String(req.params.id)
    const doc = await prisma.govDocumento.findFirst({ where: { id: documentoId, tenantId } })
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' })
    const body = parseBody(z.object({
      conteudoHtml: z.string().optional(), resumoAlteracoes: z.string().optional(), arquivoUrl: z.string().url().optional(),
      baseadoEmVersao: z.number().int().optional(),
    }), req.body)
    if (!body.conteudoHtml && !body.arquivoUrl && body.baseadoEmVersao == null) fail(400, 'Informe conteudoHtml, arquivoUrl ou baseadoEmVersao.')
    let conteudoHtml = body.conteudoHtml
    if (conteudoHtml == null && body.baseadoEmVersao != null) {
      const base = await prisma.govDocumentoVersao.findFirst({ where: { tenantId, documentoId, versao: body.baseadoEmVersao } })
      if (!base) fail(404, 'Versão base não encontrada.')
      conteudoHtml = base!.conteudoHtml ?? undefined
    }
    // numeração sequencial (retry em caso de corrida: @@unique[documentoId, versao])
    for (let i = 0; i < 3; i++) {
      const ult = await prisma.govDocumentoVersao.aggregate({ where: { tenantId, documentoId }, _max: { versao: true } })
      try {
        const row = await prisma.govDocumentoVersao.create({
          data: { tenantId, documentoId, versao: (ult._max.versao ?? 0) + 1, conteudoHtml, arquivoUrl: body.arquivoUrl, resumoAlteracoes: body.resumoAlteracoes, criadoPorId: getUserId(req) },
        })
        await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.documentos', acao: 'NOVA_VERSAO', refType: 'GovDocumentoVersao', refId: row.id })
        return res.status(201).json(row)
      } catch (e: any) { if (e?.code !== 'P2002' || i === 2) throw e }
    }
  }))

  router.get('/documentos-versoes/:id', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const v = await prisma.govDocumentoVersao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { documento: true } })
    if (!v) return res.status(404).json({ error: 'Versão não encontrada.' })
    res.json(v)
  }))

  router.patch('/documentos-versoes/:id', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.govDocumentoVersao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) return res.status(404).json({ error: 'Versão não encontrada.' })
    if (v.status !== 'RASCUNHO') fail(409, 'Somente versões em rascunho podem ser editadas; crie uma nova versão.')
    const body = parseBody(z.object({ conteudoHtml: z.string(), resumoAlteracoes: z.string(), arquivoUrl: z.string().url() }).partial(), req.body)
    res.json(await prisma.govDocumentoVersao.update({ where: { id: v.id }, data: body }))
  }))

  // Publicação: a versão vira VIGENTE e a anterior é SUBSTITUIDA, com vigência encadeada.
  router.post('/documentos-versoes/:id/publicar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ vigenciaInicio: optDate(), vigenciaFim: optDate(), deliberacaoId: z.string().uuid().optional() }), req.body ?? {})
    const v = await prisma.govDocumentoVersao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { documento: true } })
    if (!v) return res.status(404).json({ error: 'Versão não encontrada.' })
    if (v.status !== 'RASCUNHO') fail(409, 'Somente rascunhos podem ser publicados.')
    if (!v.conteudoHtml && !v.arquivoUrl) fail(422, 'A versão não possui conteúdo nem arquivo.')
    const inicio = body.vigenciaInicio ?? new Date()
    if (body.vigenciaFim && body.vigenciaFim <= inicio) fail(400, 'vigenciaFim deve ser posterior à vigenciaInicio.')
    if (body.deliberacaoId) {
      const d = await prisma.govDeliberacao.findFirst({ where: { id: body.deliberacaoId, tenantId } })
      if (!d) fail(400, 'Deliberação não encontrada.')
      if (d!.status !== 'APROVADA') fail(422, 'A deliberação informada não está aprovada.')
    }
    const ant = await prisma.govDocumentoVersao.findMany({ where: { tenantId, documentoId: v.documentoId, status: 'VIGENTE' } })
    const row = await prisma.$transaction(async (tx) => {
      for (const a of ant) await tx.govDocumentoVersao.update({ where: { id: a.id }, data: { status: 'SUBSTITUIDA', vigenciaFim: new Date(inicio.getTime() - DAY) } })
      return tx.govDocumentoVersao.update({ where: { id: v.id }, data: { status: 'VIGENTE', vigenciaInicio: inicio, vigenciaFim: body.vigenciaFim ?? null, aprovadoPorId: getUserId(req), deliberacaoId: body.deliberacaoId } })
    })
    for (const a of ant) await cancelReminders({ tenantId, refType: 'GovDocumentoVersao', refId: a.id })
    await agendarFimVigencia(row, v.documento.titulo)
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.documentos', acao: 'PUBLICAR', refType: 'GovDocumentoVersao', refId: row.id, detalhes: { substituidas: ant.map((a) => a.versao) } })
    res.json(row)
  }))

  router.post('/documentos-versoes/:id/revogar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.govDocumentoVersao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!v) return res.status(404).json({ error: 'Versão não encontrada.' })
    if (v.status !== 'VIGENTE') fail(409, 'Somente versões vigentes podem ser revogadas.')
    const row = await prisma.govDocumentoVersao.update({ where: { id: v.id }, data: { status: 'REVOGADA', vigenciaFim: new Date() } })
    await cancelReminders({ tenantId, refType: 'GovDocumentoVersao', refId: v.id })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.documentos', acao: 'REVOGAR', refType: 'GovDocumentoVersao', refId: v.id })
    res.json(row)
  }))

  // Versão vigente em uma data (padrão: hoje)
  router.get('/documentos/:id/vigente', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const data = qs(req.query.data) ? new Date(String(qs(req.query.data))) : new Date()
    if (Number.isNaN(data.getTime())) fail(400, 'Data inválida.')
    const v = await prisma.govDocumentoVersao.findFirst({
      where: { tenantId, documentoId: String(req.params.id), status: { in: ['VIGENTE', 'SUBSTITUIDA'] }, vigenciaInicio: { lte: data }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: data } }] },
      orderBy: { versao: 'desc' },
    })
    if (!v) return res.status(404).json({ error: 'Nenhuma versão vigente na data informada.' })
    res.json(v)
  }))

  // PPC vigente de um curso
  router.get('/ppc/:programId', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const doc = await prisma.govDocumento.findFirst({ where: { tenantId, tipo: 'PPC', programId: String(req.params.programId), ativo: true }, orderBy: { createdAt: 'desc' } })
    if (!doc) return res.status(404).json({ error: 'PPC não cadastrado para o curso.' })
    const vigente = await prisma.govDocumentoVersao.findFirst({ where: { tenantId, documentoId: doc.id, status: 'VIGENTE' }, orderBy: { versao: 'desc' } })
    res.json({ documento: doc, vigente })
  }))

  router.get('/documentos/:id/comparar', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req); const documentoId = String(req.params.id)
    const de = parseInt(qs(req.query.de) || '', 10); const para = parseInt(qs(req.query.para) || '', 10)
    if (!de || !para) fail(400, 'Informe ?de=<versao>&para=<versao>.')
    const [a, b] = await Promise.all([
      prisma.govDocumentoVersao.findFirst({ where: { tenantId, documentoId, versao: de } }),
      prisma.govDocumentoVersao.findFirst({ where: { tenantId, documentoId, versao: para } }),
    ])
    if (!a || !b) return res.status(404).json({ error: 'Versão não encontrada.' })
    res.json({ de, para, ...diffLinhas(a.conteudoHtml ?? '', b.conteudoHtml ?? '') })
  }))
}
