import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO, qs, pageParams } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder, completeReminders } from '../core/reminders'
import { simularCPC, simularCC, mediaIndicadores, PESOS_CPC, PESOS_CC, CORTES_FAIXA, DISCLAIMER_SIMULACAO } from './rules'
import { INDICADORES_PADRAO } from './catalogo'
import { MODULO, READ, WRITE, bad } from './common'

const DIMS = ['ORGANIZACAO_DIDATICO_PEDAGOGICA', 'CORPO_DOCENTE_TUTORIAL', 'INFRAESTRUTURA', 'DOCUMENTAL', 'GESTAO_INSTITUCIONAL'] as const
const INSTR = ['INSTITUCIONAL', 'CURSO_AUTORIZACAO', 'CURSO_RECONHECIMENTO', 'CURSO_RENOVACAO', 'DOCUMENTAL'] as const

const indBase = z.object({
  instrumento: z.enum(INSTR), dimensao: z.enum(DIMS), codigo: z.string().min(1).max(20), nome: z.string().min(3).max(300),
  programId: z.string().optional().nullable(), conceito: z.number().int().min(1).max(5).optional().nullable(),
  justificativa: z.string().max(4000).optional().nullable(), planoMelhoria: z.string().max(4000).optional().nullable(),
  responsavelId: z.string().optional().nullable(), prazoMelhoria: dateISO().optional().nullable(),
})

// Regras de negócio: conceito exige justificativa; conceito <= 2 exige plano de melhoria e prazo.
function validaIndicador(d: any) {
  if (d.conceito != null) {
    if (!d.justificativa || d.justificativa.trim().length < 10) throw bad('Conceito atribuído exige justificativa (mín. 10 caracteres).')
    if (d.conceito <= 2 && (!d.planoMelhoria || !d.prazoMelhoria)) throw bad('Conceito 1 ou 2 exige plano de melhoria e prazo (planoMelhoria, prazoMelhoria).')
  }
}

async function planoReminder(row: any) {
  if (row.conceito != null && row.conceito <= 2 && row.prazoMelhoria) {
    await scheduleReminder({
      tenantId: row.tenantId, modulo: MODULO, titulo: `Plano de melhoria — indicador ${row.codigo}: ${row.nome.slice(0, 100)}`, descricao: row.planoMelhoria?.slice(0, 300),
      dueAt: new Date(row.prazoMelhoria), antecedenciaDias: 7, severity: 'ATENCAO', refType: 'RegIndicador', refId: row.id,
      assigneeUserId: row.responsavelId ?? undefined, assigneeRole: row.responsavelId ? undefined : 'COORDINATOR', dedupeKey: `reg:ind:${row.id}`,
    })
  } else if (row.conceito != null && row.conceito > 2) {
    await completeReminders({ tenantId: row.tenantId, refType: 'RegIndicador', refId: row.id })
  }
}

export async function gerarIndicadoresPadrao(tenantId: string, programId: string | null) {
  let criados = 0
  for (const i of INDICADORES_PADRAO) {
    if (programId && i.instrumento === 'INSTITUCIONAL') continue
    if (!programId && i.instrumento !== 'INSTITUCIONAL') continue
    const ja = await prisma.regIndicador.findFirst({ where: { tenantId, instrumento: i.instrumento, codigo: i.codigo, programId }, select: { id: true } })
    if (!ja) {
      await prisma.regIndicador.create({ data: { tenantId, ...i, programId } })
      criados++
    }
  }
  return criados
}

const num05 = z.number().min(0).max(5)
const cpcSchema = z.object({
  enade: num05, idd: num05, mestres: num05, doutores: num05, regime: num05, organizacaoDidatico: num05, infraestrutura: num05, oportunidades: num05,
})
const ccSchema = z.object({
  organizacaoDidatico: z.number().min(1).max(5), corpoDocente: z.number().min(1).max(5), infraestrutura: z.number().min(1).max(5),
})
const meta = z.object({ rotulo: z.string().max(120).optional(), programId: z.string().optional(), salvar: z.boolean().optional() })

export function mountAvaliacao(router: Router) {
  const guard = requireRole(...READ, ...WRITE)

  router.get(
    '/indicadores/resumo',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const programId = qs(req.query.programId) ?? null
      const inds = await prisma.regIndicador.findMany({ where: { tenantId, programId } })
      const avaliados = inds.filter((i) => i.conceito != null)
      const medias = mediaIndicadores(inds.map((i) => ({ dimensao: i.dimensao, conceito: i.conceito })))
      res.json({
        total: inds.length,
        avaliados: avaliados.length,
        mediaGeral: avaliados.length ? Math.round((avaliados.reduce((s, i) => s + (i.conceito ?? 0), 0) / avaliados.length) * 100) / 100 : null,
        mediaPorDimensao: medias,
        criticos: inds.filter((i) => i.conceito != null && i.conceito <= 2).map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome, conceito: i.conceito, planoMelhoria: i.planoMelhoria, prazoMelhoria: i.prazoMelhoria })),
        naoAvaliados: inds.filter((i) => i.conceito == null).length,
      })
    }),
  )

  router.post(
    '/indicadores/gerar',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({ programId: z.string().optional() }), req.body ?? {})
      if (b.programId && !(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) throw bad('Curso não encontrado.')
      res.json({ criados: await gerarIndicadoresPadrao(tenantId, b.programId ?? null) })
    }),
  )

  mountCrud(router, {
    model: 'regIndicador', path: '/indicadores', modulo: MODULO, read: READ, write: WRITE,
    create: indBase, update: indBase.partial(), search: ['nome', 'codigo'], filters: ['instrumento', 'dimensao', 'programId'], orderBy: [{ instrumento: 'asc' }, { codigo: 'asc' }],
    beforeCreate: (d) => { validaIndicador(d); if (d.conceito != null) d.avaliadoEm = new Date(); return d },
    beforeUpdate: (d, _req, cur) => { validaIndicador({ ...cur, ...d }); if (d.conceito !== undefined) d.avaliadoEm = d.conceito == null ? null : new Date(); return d },
    afterCreate: planoReminder,
    afterUpdate: planoReminder,
  })

  // ---- Simuladores (SIMULAÇÃO, sem valor oficial) ----
  router.get('/simulador/parametros', guard, (_req, res) => {
    res.json({ aviso: DISCLAIMER_SIMULACAO, pesosCPC: PESOS_CPC, pesosCC: PESOS_CC, cortesFaixaCPC: CORTES_FAIXA, escalaComponentes: '0 a 5 (CPC) / 1 a 5 (CC)' })
  })

  router.post(
    '/simulador/cpc',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const m = parseBody(meta, req.body)
      const entrada = parseBody(cpcSchema, (req.body as any)?.entrada ?? req.body)
      const r = simularCPC(entrada)
      let id: string | undefined
      if (m.salvar) id = (await prisma.regSimulacao.create({ data: { tenantId, tipo: 'CPC', programId: m.programId, rotulo: m.rotulo, entrada: entrada as any, resultado: r as any, userId: getUserId(req) } })).id
      res.json({ ...r, simulacaoId: id })
    }),
  )

  router.post(
    '/simulador/cc',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const m = parseBody(meta, req.body)
      const entrada = parseBody(ccSchema, (req.body as any)?.entrada ?? req.body)
      const r = simularCC(entrada)
      let id: string | undefined
      if (m.salvar) id = (await prisma.regSimulacao.create({ data: { tenantId, tipo: 'CC', programId: m.programId, rotulo: m.rotulo, entrada: entrada as any, resultado: r as any, userId: getUserId(req) } })).id
      res.json({ ...r, simulacaoId: id })
    }),
  )

  // CC estimado a partir da autoavaliação por indicador do curso
  router.get(
    '/simulador/cc-autoavaliacao',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const programId = qs(req.query.programId)
      if (!programId) throw bad('Informe programId.')
      const inds = await prisma.regIndicador.findMany({ where: { tenantId, programId } })
      const med = mediaIndicadores(inds.map((i) => ({ dimensao: i.dimensao, conceito: i.conceito })))
      const faltam = (['ORGANIZACAO_DIDATICO_PEDAGOGICA', 'CORPO_DOCENTE_TUTORIAL', 'INFRAESTRUTURA'] as const).filter((d) => med[d] == null)
      if (faltam.length) return res.json({ simulacao: true, aviso: DISCLAIMER_SIMULACAO, disponivel: false, motivo: `Sem indicadores avaliados nas dimensões: ${faltam.join(', ')}. Gere os indicadores (POST /indicadores/gerar) e atribua conceitos.` })
      res.json({ disponivel: true, mediasUsadas: med, ...simularCC({ organizacaoDidatico: med.ORGANIZACAO_DIDATICO_PEDAGOGICA, corpoDocente: med.CORPO_DOCENTE_TUTORIAL, infraestrutura: med.INFRAESTRUTURA }) })
    }),
  )

  router.get(
    '/simulacoes',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      const t = qs(req.query.tipo); if (t) where.tipo = t
      const p = qs(req.query.programId); if (p) where.programId = p
      const [items, total] = await Promise.all([prisma.regSimulacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.regSimulacao.count({ where })])
      res.json({ aviso: DISCLAIMER_SIMULACAO, items, total, page, pageSize })
    }),
  )
  router.delete(
    '/simulacoes/:id',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const r = await prisma.regSimulacao.deleteMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
      if (!r.count) return res.status(404).json({ error: 'Simulação não encontrada.' })
      res.status(204).end()
    }),
  )
}
