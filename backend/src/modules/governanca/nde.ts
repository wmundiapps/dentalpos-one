import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { mountCrud, dateISO } from '../core/crud'
import { READ, WRITE, MOD, DAY, TITULACOES, ensureReminder, cancelStaleReminders, assertProgram, fail, optDate, ymd } from './common'
import { validarNde, fimMandato } from './ndeLogic'

const REGIMES = ['INTEGRAL', 'PARCIAL', 'HORISTA'] as const

export async function verificarNde(tenantId: string, ndeId: string, now = new Date()) {
  const nde = await prisma.govNde.findFirst({ where: { id: ndeId, tenantId }, include: { membros: true } })
  if (!nde) return null
  const r = validarNde(nde.membros.map((m) => ({ id: m.id, nome: m.nome, titulacao: m.titulacao, regime: m.regime, inicio: m.inicio, fim: m.fim, ativo: m.ativo, presidente: m.presidente })), now)
  // reuniões: o NDE deve se reunir periodicamente — alerta se nenhuma nos últimos 180 dias
  const ultima = await prisma.govNdeReuniao.findFirst({ where: { tenantId, ndeId, realizada: true }, orderBy: { data: 'desc' } })
  const violacoes = [...r.violacoes]
  if (nde.ativo && (!ultima || now.getTime() - ultima.data.getTime() > 180 * DAY)) {
    violacoes.push({ codigo: 'SEM_REUNIAO', gravidade: 'AVISO', mensagem: 'Nenhuma reunião do NDE realizada nos últimos 180 dias.' })
  }
  await prisma.govNde.update({ where: { id: ndeId }, data: { conforme: r.conforme, verificadoEm: now } })
  if (nde.ativo) {
    const keep: string[] = []
    for (const v of violacoes) {
      const key = `gov:nde:${ndeId}:${v.codigo}`
      keep.push(key)
      await ensureReminder({
        tenantId, modulo: MOD, titulo: `NDE ${nde.nome}: ${v.mensagem}`, dueAt: new Date(now.getTime() + (v.gravidade === 'ERRO' ? 15 : 30) * DAY),
        antecedenciaDias: 7, refType: 'GovNde', refId: ndeId, assigneeRole: 'COORDINATOR', severity: v.gravidade === 'ERRO' ? 'CRITICO' : 'ATENCAO', dedupeKey: key,
      })
    }
    await cancelStaleReminders(tenantId, `gov:nde:${ndeId}:`, keep)
  }
  return { nde: { id: nde.id, nome: nde.nome, programId: nde.programId }, ...r, violacoes, verificadoEm: now }
}

export function registerNde(router: Router) {
  mountCrud(router, {
    model: 'govNde', path: '/ndes', read: READ, write: WRITE, modulo: 'governanca.nde', filters: ['programId', 'ativo', 'conforme'], search: ['nome'],
    create: z.object({ programId: z.string().min(1), nome: z.string().min(3), portaria: z.string().optional() }),
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      await assertProgram(tenantId, d.programId)
      if (await prisma.govNde.findFirst({ where: { tenantId, programId: d.programId, ativo: true } })) fail(409, 'Já existe NDE ativo para este curso.')
    },
    beforeUpdate: (d) => { delete d.programId; delete d.conforme },
    include: { membros: { where: { ativo: true } } },
  })

  router.get('/ndes/:id/validacao', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const r = await verificarNde(getTenantId(req), String(req.params.id))
    if (!r) return res.status(404).json({ error: 'NDE não encontrado.' })
    res.json(r)
  }))

  // Quadro de conformidade de todos os cursos (para a coordenação/regulatório)
  router.get('/ndes-conformidade', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ndes = await prisma.govNde.findMany({ where: { tenantId, ativo: true }, select: { id: true } })
    const items = []
    for (const n of ndes) { const r = await verificarNde(tenantId, n.id); if (r) items.push(r) }
    res.json({ items, total: items.length, naoConformes: items.filter((i) => !i.conforme).length })
  }))

  const after = async (row: any) => { await verificarNde(row.tenantId, row.ndeId) }
  mountCrud(router, {
    model: 'govNdeMembro', path: '/nde-membros', read: READ, write: WRITE, modulo: 'governanca.nde', filters: ['ndeId', 'docenteId', 'ativo'], orderBy: { nome: 'asc' },
    create: z.object({
      ndeId: z.string().uuid(), docenteId: z.string().min(1), nome: z.string().min(2), titulacao: z.enum(TITULACOES), regime: z.enum(REGIMES),
      inicio: dateISO(), fim: optDate(), presidente: z.boolean().default(false),
    }),
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.govNde.findFirst({ where: { id: d.ndeId, tenantId } }))) fail(400, 'NDE não encontrado.')
      if (d.fim && d.fim <= d.inicio) fail(400, 'fim deve ser posterior ao início do mandato.')
      if (await prisma.govNdeMembro.findFirst({ where: { tenantId, ndeId: d.ndeId, docenteId: d.docenteId, ativo: true } })) fail(409, 'Docente já é membro ativo deste NDE.')
      if (d.presidente) await prisma.govNdeMembro.updateMany({ where: { tenantId, ndeId: d.ndeId, presidente: true }, data: { presidente: false } })
    },
    beforeUpdate: async (d, req, cur) => {
      delete d.ndeId; delete d.docenteId
      if (d.presidente) await prisma.govNdeMembro.updateMany({ where: { tenantId: getTenantId(req), ndeId: cur.ndeId, presidente: true, id: { not: cur.id } }, data: { presidente: false } })
    },
    afterCreate: after, afterUpdate: after,
  })
  // remoção: revalida após apagar (rota anterior à do CRUD genérico)
  router.delete('/nde-membros/:id', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response, next) => {
    res.on('finish', () => { /* revalidação feita abaixo */ })
    const tenantId = getTenantId(req)
    const m = await prisma.govNdeMembro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!m) return res.status(404).json({ error: 'Registro não encontrado.' })
    await prisma.govNdeMembro.delete({ where: { id: m.id } })
    await verificarNde(tenantId, m.ndeId)
    res.status(204).end()
  }))

  mountCrud(router, {
    model: 'govNdeReuniao', path: '/nde-reunioes', read: READ, write: WRITE, modulo: 'governanca.nde', filters: ['ndeId', 'realizada'], orderBy: { data: 'desc' },
    create: z.object({ ndeId: z.string().uuid(), data: dateISO(), pauta: z.string().optional(), ata: z.string().optional(), presentes: z.array(z.string()).optional(), realizada: z.boolean().default(false) }),
    beforeCreate: async (d, req) => { if (!(await prisma.govNde.findFirst({ where: { id: d.ndeId, tenantId: getTenantId(req) } }))) fail(400, 'NDE não encontrado.') },
    beforeUpdate: (d) => { delete d.ndeId },
    afterCreate: async (row) => {
      if (!row.realizada) await ensureReminder({ tenantId: row.tenantId, modulo: MOD, titulo: 'Reunião do NDE', descricao: row.pauta ?? undefined, dueAt: row.data, antecedenciaDias: 2, refType: 'GovNdeReuniao', refId: row.id, assigneeRole: 'COORDINATOR', dedupeKey: `gov:nde:reuniao:${row.id}` })
      await after(row)
    },
    afterUpdate: after,
  })
}

export { fimMandato, ymd }
