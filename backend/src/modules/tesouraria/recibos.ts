import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { LEITURA, OPERA, brl, dia, getConfig, httpError, log, nomesUsuarios, proximoNumero, r2, sha256, soDigitos, tid, uid, valorPorExtenso } from './common'

export async function emitirRecibo(p: {
  tenantId: string; userId?: string; pagadorNome: string; pagadorDocumento?: string | null; valor: number; descricao: string; forma?: string
  receivableId?: string; recebimentoId?: string; studentId?: string
}) {
  const cfg = await getConfig(p.tenantId)
  const serie = cfg.serieRecibo
  const numero = await proximoNumero(p.tenantId, `recibo:${serie}`)
  const emitidoEm = new Date()
  const hash = sha256([p.tenantId, serie, numero, r2(p.valor), p.pagadorNome, emitidoEm.toISOString()].join('|'))
  return prisma.tesRecibo.create({
    data: {
      tenantId: p.tenantId, serie, numero, pagadorNome: p.pagadorNome, pagadorDocumento: p.pagadorDocumento ? soDigitos(p.pagadorDocumento) : null,
      valor: r2(p.valor), valorExtenso: valorPorExtenso(p.valor), descricao: p.descricao, forma: p.forma, receivableId: p.receivableId,
      recebimentoId: p.recebimentoId, studentId: p.studentId, emitidoPorId: p.userId, emitidoEm, hash,
    },
  })
}

export const rotuloRecibo = (r: { serie: string; numero: number }) => `${r.serie}-${String(r.numero).padStart(6, '0')}`

async function documento(tenantId: string, r: any, segundaVia?: number) {
  const inst = await prisma.eduInstitution.findFirst({ where: { tenantId }, select: { nome: true, cnpj: true, endereco: true } }).catch(() => null)
  const emissor = inst?.nome || 'Instituição de ensino'
  const linhas = [
    `${emissor}${inst?.cnpj ? ` — CNPJ ${inst.cnpj}` : ''}`,
    `RECIBO Nº ${rotuloRecibo(r)}${segundaVia && segundaVia > 1 ? ` — ${segundaVia}ª VIA` : ''}${r.status === 'CANCELADO' ? ' — CANCELADO' : ''}`,
    `Recebemos de ${r.pagadorNome}${r.pagadorDocumento ? ` (documento ${r.pagadorDocumento})` : ''} a quantia de ${brl(r.valor)} (${r.valorExtenso}),`,
    `referente a ${r.descricao}${r.forma ? `, pago via ${String(r.forma).toLowerCase()}` : ''}.`,
    `Emitido em ${new Date(r.emitidoEm).toLocaleDateString('pt-BR')}. Código de autenticidade: ${String(r.hash).slice(0, 16)}`,
  ]
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const html = `<article style="font-family:Arial,sans-serif;max-width:640px;border:1px solid #444;padding:24px">${linhas.map((l, i) => `<p style="${i < 2 ? 'font-weight:bold;' : ''}${i === 1 ? 'font-size:18px;' : ''}">${esc(l)}</p>`).join('')}</article>`
  return { numero: rotuloRecibo(r), linhas, html, segundaVia: segundaVia && segundaVia > 1 ? segundaVia : null, cancelado: r.status === 'CANCELADO' }
}

export function mountRecibos(router: Router) {
  router.get('/recibos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const { page, pageSize, skip, take } = pageParams(req.query)
    const where: any = { tenantId }
    const status = qs(req.query.status)
    if (status) where.status = status
    const q = qs(req.query.q)
    if (q) where.OR = [{ pagadorNome: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }, { pagadorDocumento: { contains: soDigitos(q) || '§§' } }]
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.emitidoEm = { ...(de ? { gte: dia(de) } : {}), ...(ate ? { lte: new Date(dia(ate).getTime() + 12 * 3600_000) } : {}) }
    const [total, items, soma] = await Promise.all([
      prisma.tesRecibo.count({ where }),
      prisma.tesRecibo.findMany({ where, orderBy: [{ emitidoEm: 'desc' }, { numero: 'desc' }], skip, take }),
      prisma.tesRecibo.aggregate({ where: { ...where, status: 'EMITIDO' }, _sum: { valor: true } }),
    ])
    res.json({ total, page, pageSize, items: items.map((r) => ({ ...r, rotulo: rotuloRecibo(r) })), valorEmitido: r2(soma._sum.valor ?? 0) })
  }))

  // Gestão: totais, 2ªs vias e lacunas na numeração (auditoria de recibos).
  router.get('/recibos/gestao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const rows = await prisma.tesRecibo.findMany({ where: { tenantId }, select: { serie: true, numero: true, status: true, valor: true, vias: true } })
    const porSerie: Record<string, number[]> = {}
    rows.forEach((r) => (porSerie[r.serie] ||= []).push(r.numero))
    const lacunas: Array<{ serie: string; numero: number }> = []
    for (const [serie, nums] of Object.entries(porSerie)) {
      const s = new Set(nums)
      for (let n = 1; n <= Math.max(...nums); n++) if (!s.has(n)) lacunas.push({ serie, numero: n })
    }
    res.json({
      emitidos: rows.filter((r) => r.status === 'EMITIDO').length,
      cancelados: rows.filter((r) => r.status === 'CANCELADO').length,
      valorEmitido: r2(rows.filter((r) => r.status === 'EMITIDO').reduce((a, r) => a + r.valor, 0)),
      segundasVias: rows.reduce((a, r) => a + (r.vias - 1), 0),
      lacunas,
    })
  }))

  const avulsoSchema = z.object({
    pagadorNome: z.string().min(2).max(150), pagadorDocumento: z.string().max(20).optional(), valor: z.number().positive(),
    descricao: z.string().min(3).max(300), forma: z.string().max(30).optional(), studentId: z.string().optional(),
  })
  router.post('/recibos', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = parseBody(avulsoSchema, req.body)
    if (d.studentId && !(await prisma.student.findFirst({ where: { id: d.studentId, tenantId }, select: { id: true } }))) throw httpError(404, 'Aluno não encontrado.')
    const r = await emitirRecibo({ tenantId, userId: uid(req), ...d })
    await log(req, 'RECIBO_EMITIDO', 'TesRecibo', r.id, { numero: rotuloRecibo(r), valor: r.valor })
    res.status(201).json({ ...r, rotulo: rotuloRecibo(r) })
  }))

  router.get('/recibos/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const r = await prisma.tesRecibo.findFirst({ where: { id: String(req.params.id), tenantId }, include: { viasEmitidas: { orderBy: { via: 'asc' } } } })
    if (!r) throw httpError(404, 'Recibo não encontrado.')
    const nomes = await nomesUsuarios(tenantId, [r.emitidoPorId, r.canceladoPorId, ...r.viasEmitidas.map((v) => v.emitidaPorId)])
    res.json({ ...r, rotulo: rotuloRecibo(r), emitidoPorNome: nomes[r.emitidoPorId || ''], canceladoPorNome: nomes[r.canceladoPorId || ''], documento: await documento(tenantId, r) })
  }))

  router.post('/recibos/:id/segunda-via', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const id = String(req.params.id)
    const r = await prisma.tesRecibo.findFirst({ where: { id, tenantId } })
    if (!r) throw httpError(404, 'Recibo não encontrado.')
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.slice(0, 200) : undefined
    const atualizado = await prisma.tesRecibo.update({ where: { id }, data: { vias: { increment: 1 } } })
    await prisma.tesReciboVia.create({ data: { tenantId, reciboId: id, via: atualizado.vias, emitidaPorId: uid(req), motivo } })
    await log(req, 'RECIBO_SEGUNDA_VIA', 'TesRecibo', id, { via: atualizado.vias })
    res.json({ ...atualizado, rotulo: rotuloRecibo(atualizado), documento: await documento(tenantId, atualizado, atualizado.vias) })
  }))

  router.post('/recibos/:id/cancelar', requireRole(...OPERA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const id = String(req.params.id)
    const { motivo } = parseBody(z.object({ motivo: z.string().min(5).max(300) }), req.body)
    const claim = await prisma.tesRecibo.updateMany({ where: { id, tenantId, status: 'EMITIDO' }, data: { status: 'CANCELADO', canceladoEm: new Date(), canceladoPorId: uid(req), motivoCancelamento: motivo } })
    if (claim.count === 0) {
      if (!(await prisma.tesRecibo.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw httpError(404, 'Recibo não encontrado.')
      throw httpError(409, 'Recibo já cancelado.')
    }
    await log(req, 'RECIBO_CANCELADO', 'TesRecibo', id, { motivo })
    const r = await prisma.tesRecibo.findUniqueOrThrow({ where: { id } })
    res.json({ ...r, rotulo: rotuloRecibo(r), aviso: 'O cancelamento do recibo não estorna o recebimento; estorne no financeiro se for o caso.' })
  }))
}
