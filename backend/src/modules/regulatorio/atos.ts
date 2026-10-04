import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, dateISO, qs } from '../core/crud'
import { audit } from '../core/notify'
import { cancelReminders } from '../core/reminders'
import { statusAto, marcosAlerta, janelaReconhecimento, PARAMS_RECONHECIMENTO, proximoCiclo, inicioProtocoloRenovacao } from './rules'
import { reavaliarAto, reavaliarTodos, sincronizarAlertasAto, limparAlertasAto } from './alertas'
import { MODULO, READ, WRITE, bad } from './common'

const TIPOS = ['PORTARIA_CREDENCIAMENTO', 'PORTARIA_RECREDENCIAMENTO', 'PORTARIA_AUTORIZACAO', 'PORTARIA_RECONHECIMENTO', 'PORTARIA_RENOVACAO', 'PORTARIA_ADITAMENTO', 'RESOLUCAO', 'PARECER', 'OUTRO'] as const

const anexo = z.object({
  nome: z.string().max(200),
  url: z.string().url().optional(),
  dataUrl: z.string().max(2_500_000).startsWith('data:').optional(),
  mime: z.string().max(100).optional(),
}).refine((a) => a.url || a.dataUrl, { message: 'anexo precisa de url ou dataUrl' })

const atoBase = z.object({
  tipo: z.enum(TIPOS),
  numero: z.string().min(1).max(60),
  orgao: z.string().max(60).optional(),
  dataPublicacao: dateISO(),
  referenciaDou: z.string().max(200).optional().nullable(),
  programId: z.string().optional().nullable(),
  cursoNome: z.string().max(200).optional().nullable(),
  escopo: z.enum(['CURSO', 'INSTITUICAO']).optional(),
  processoId: z.string().optional().nullable(),
  vigenciaInicio: dateISO().optional().nullable(),
  vencimento: dateISO().optional().nullable(),
  vagasAutorizadas: z.number().int().min(0).optional().nullable(),
  cicloAvaliativoAnos: z.number().int().positive().max(12).optional().nullable(),
  conceito: z.number().int().min(1).max(5).optional().nullable(),
  revogado: z.boolean().optional(),
  anexos: z.array(anexo).max(20).optional(),
  observacoes: z.string().max(4000).optional().nullable(),
})

function validaAto(d: any) {
  const ini = d.vigenciaInicio ?? d.dataPublicacao
  if (d.vencimento && ini && new Date(d.vencimento) <= new Date(ini)) throw bad('O vencimento deve ser posterior ao início da vigência/publicação.')
  if (d.escopo === 'CURSO' && !d.programId && !d.cursoNome) throw bad('Ato de curso exige programId ou cursoNome.')
}

export const enriquecer = (a: any, agora = new Date()) => ({
  ...a,
  ...statusAto(a.vencimento, agora),
  inicioProtocoloRenovacao: a.vencimento ? inicioProtocoloRenovacao(new Date(a.vencimento)) : null,
})

export function mountAtos(router: Router) {
  const guard = requireRole(...READ, ...WRITE)

  // listagem enriquecida com situação (antes de /:id)
  router.get(
    '/atos/situacao',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const where: any = { tenantId, revogado: false }
      const programId = qs(req.query.programId)
      if (programId) where.programId = programId
      const atos = await prisma.regAto.findMany({ where, orderBy: [{ vencimento: 'asc' }] })
      const sit = qs(req.query.situacao)
      const items = atos.map((a) => enriquecer(a)).filter((a) => !sit || a.situacao === sit)
      res.json({ items, total: items.length })
    }),
  )

  // reavaliação manual (o job diário faz o mesmo para todos os tenants)
  router.post(
    '/atos/reavaliar',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const r = await reavaliarTodos(new Date(), getTenantId(req))
      res.json(r)
    }),
  )

  router.get(
    '/atos/:id/alertas',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const a = await prisma.regAto.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!a) return res.status(404).json({ error: 'Ato não encontrado.' })
      const lembretes = await prisma.eduReminder.findMany({ where: { tenantId, refType: 'RegAto', refId: a.id }, orderBy: { remindAt: 'asc' } })
      res.json({
        ato: enriquecer(a),
        marcos: a.vencimento ? marcosAlerta(new Date(a.vencimento)) : [],
        proximaAvaliacao: a.cicloAvaliativoAnos ? proximoCiclo(new Date(a.vigenciaInicio ?? a.dataPublicacao), a.cicloAvaliativoAnos) : null,
        lembretes,
      })
    }),
  )

  router.post(
    '/atos/:id/reavaliar',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const a = await prisma.regAto.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!a) return res.status(404).json({ error: 'Ato não encontrado.' })
      res.json(await reavaliarAto(a))
    }),
  )

  // exclusão: cancela lembretes junto (registrada antes do mountCrud)
  router.delete(
    '/atos/:id',
    requireRole(...WRITE),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const a = await prisma.regAto.findFirst({ where: { id, tenantId } })
      if (!a) return res.status(404).json({ error: 'Ato não encontrado.' })
      await prisma.regAto.delete({ where: { id } })
      await cancelReminders({ tenantId, refType: 'RegAto', refId: id })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'REMOVER', refType: 'RegAto', refId: id })
      res.status(204).end()
    }),
  )

  mountCrud(router, {
    model: 'regAto',
    path: '/atos',
    modulo: MODULO,
    read: READ,
    write: WRITE,
    create: atoBase,
    update: atoBase.partial(),
    search: ['numero', 'cursoNome', 'referenciaDou'],
    filters: ['tipo', 'programId', 'escopo', 'revogado'],
    orderBy: { dataPublicacao: 'desc' },
    beforeCreate: (d) => {
      validaAto(d)
      return d
    },
    beforeUpdate: (d, req, current) => {
      validaAto({ ...current, ...d })
      ;(req as any)._atoAntes = current
      return d
    },
    afterCreate: async (row) => {
      await sincronizarAlertasAto(row)
    },
    afterUpdate: async (row, req) => {
      const antes = (req as any)._atoAntes
      const mudou = antes && (String(antes.vencimento) !== String(row.vencimento) || antes.revogado !== row.revogado)
      if (mudou) await limparAlertasAto(row.tenantId, row.id)
      await sincronizarAlertasAto(row)
    },
  })

  // Janela legal de reconhecimento (50%–75%) — cálculo avulso e parametrizável
  router.post(
    '/janela-reconhecimento',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const b = z.object({
        inicioPrimeiraTurma: dateISO(), duracaoSemestres: z.number().positive().max(24), percentualCumprido: z.number().min(0).max(100).optional(),
        inicioPct: z.number().min(0).max(100).optional(), fimPct: z.number().min(1).max(100).optional(),
      }).safeParse(req.body)
      if (!b.success) throw bad('Dados inválidos — ' + b.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
      const { inicioPct, fimPct, ...rest } = b.data
      const params = { inicioPct: inicioPct ?? PARAMS_RECONHECIMENTO.inicioPct, fimPct: fimPct ?? PARAMS_RECONHECIMENTO.fimPct }
      try {
        res.json({ ...janelaReconhecimento(rest, params), parametros: params, aviso: 'Conferir parâmetros com a norma vigente.' })
      } catch (e: any) {
        throw bad(e.message)
      }
    }),
  )

  // Janela de reconhecimento a partir dos dados acadêmicos: 1ª turma = menor dataInicio entre as matrículas do curso.
  router.get(
    '/cursos/:programId/janela-reconhecimento',
    guard,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const programId = String(req.params.programId)
      const prog = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } })
      if (!prog) return res.status(404).json({ error: 'Curso não encontrado.' })
      let inicio: Date | null = qs(req.query.inicioPrimeiraTurma) ? new Date(qs(req.query.inicioPrimeiraTurma)!) : null
      if (!inicio || isNaN(inicio.getTime())) {
        inicio = null
        const e = await prisma.enrollment.findFirst({ where: { programId, term: { tenantId } }, orderBy: { term: { dataInicio: 'asc' } }, include: { term: true } }).catch(() => null)
        inicio = e?.term.dataInicio ?? null
      }
      let semestres = Number(qs(req.query.duracaoSemestres)) || 0
      if (!semestres) {
        const max = await prisma.curriculumDiscipline.aggregate({ where: { programId }, _max: { periodo: true } }).catch(() => null)
        semestres = max?._max.periodo ?? 0
      }
      if (!inicio || !semestres) return res.json({ curso: prog.nome, disponivel: false, motivo: 'Sem dados da 1ª turma/duração. Informe ?inicioPrimeiraTurma=AAAA-MM-DD&duracaoSemestres=N.' })
      res.json({ curso: prog.nome, disponivel: true, inicioPrimeiraTurma: inicio, duracaoSemestres: semestres, ...janelaReconhecimento({ inicioPrimeiraTurma: inicio, duracaoSemestres: semestres }) })
    }),
  )
}
