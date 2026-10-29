import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { mountCrud } from '../core/crud'
import { audit } from '../core/notify'
import { AuthenticatedRequest, READ, Response, WRITE, agendarVencimento, asyncHandler, assertNoTenant, cancelarLembretes, checarVigencia, fail, mountLista, optDate, optMoney, optStr, pageParams, parseBody, proximoCodigo, qs, requireRole, tid, uid } from './common'
import { bloquearStatus } from './ciclo'
import { nivelRisco, r2, scoreRisco } from './logic'

export const CATEGORIAS_RISCO = ['PATRIMONIAL', 'PESSOAL', 'RESPONSABILIDADE_CIVIL', 'TRABALHISTA', 'REGULATORIO', 'REPUTACIONAL', 'OPERACIONAL', 'CIBERNETICO', 'AMBIENTAL', 'FINANCEIRO'] as const
export const TIPOS_SEGURO = ['PATRIMONIAL', 'PESSOAL', 'RESPONSABILIDADE_CIVIL', 'DANOS_MORAIS', 'ACIDENTES_ALUNOS', 'VIDA_COLABORADORES', 'CIBERNETICO', 'EQUIPAMENTOS', 'OUTRO'] as const
const nota = z.number().int().min(1).max(5)

export const lembreteSeguro = (s: any, reabrir = false) => agendarVencimento({
  tenantId: s.tenantId, refType: 'JurSeguro', refId: s.id, tag: 'seguro', titulo: `Seguro ${s.tipo} — apólice ${s.apolice} (${s.seguradora})`,
  descricao: 'Cote e renove a apólice antes do vencimento para não deixar a instituição descoberta.', due: s.vigenciaFim, ativo: s.status === 'VIGENTE', reabrir,
})

const risco = z.object({
  codigo: z.string().min(3).max(40).optional(), titulo: z.string().min(3).max(200), descricao: optStr(), categoria: z.enum(CATEGORIAS_RISCO), setor: optStr(120),
  probabilidade: nota, impacto: nota, probabilidadeResidual: nota.nullish(), impactoResidual: nota.nullish(), controles: optStr(), planoTratamento: optStr(),
  responsavelNome: optStr(120), responsavelUserId: optStr(80), seguroId: z.string().uuid().nullish(), status: z.enum(['IDENTIFICADO', 'EM_TRATAMENTO', 'MITIGADO', 'ACEITO', 'ENCERRADO']).optional(), revisaoEm: optDate(),
})

function calc(d: any, cur?: any) {
  const prob = d.probabilidade ?? cur?.probabilidade, imp = d.impacto ?? cur?.impacto
  const score = scoreRisco(prob, imp)
  const nivel = nivelRisco(score)
  const status = d.status ?? cur?.status ?? 'IDENTIFICADO'
  const resp = d.responsavelNome ?? d.responsavelUserId ?? cur?.responsavelNome ?? cur?.responsavelUserId
  if ((nivel === 'ALTO' || nivel === 'CRITICO') && !resp) fail(422, 'Riscos de nível ALTO/CRÍTICO exigem responsável.')
  const controles = d.controles ?? cur?.controles, trat = d.planoTratamento ?? cur?.planoTratamento
  if (['MITIGADO', 'ACEITO'].includes(status) && !controles && !trat) fail(422, `Para marcar o risco como ${status}, descreva os controles ou o plano de tratamento.`)
  const pr = d.probabilidadeResidual ?? cur?.probabilidadeResidual, ir = d.impactoResidual ?? cur?.impactoResidual
  if (pr != null && ir != null && scoreRisco(pr, ir) > score) fail(422, 'O risco residual não pode ser maior que o inerente.')
  return { score, nivel }
}

const seguro = z.object({
  tipo: z.enum(TIPOS_SEGURO), apolice: z.string().min(2).max(60), seguradora: z.string().min(2).max(120), corretor: optStr(120),
  coberturas: z.array(z.object({ descricao: z.string().min(2).max(200), limite: z.number().min(0).max(1e12).optional(), franquia: z.number().min(0).max(1e12).optional() })).max(50).optional(),
  limiteTotal: optMoney(), premio: z.number().finite().min(0).max(1e12), premioPeriodicidade: z.enum(['MENSAL', 'ANUAL', 'UNICO']).optional(),
  vigenciaInicio: z.coerce.date(), vigenciaFim: z.coerce.date(), bensSegurados: optStr(1000), renovacaoAutomatica: z.boolean().optional(), responsavelNome: optStr(120), observacoes: optStr(),
})

const TRANSICOES: Record<string, string[]> = { COMUNICADO: ['EM_ANALISE', 'NEGADO'], EM_ANALISE: ['NEGADO', 'INDENIZADO'], INDENIZADO: ['ENCERRADO'], NEGADO: ['ENCERRADO', 'EM_ANALISE'], ENCERRADO: [] }

export function registerRiscos(router: Router) {
  // ---- riscos
  mountLista(router, { model: 'jurRisco', path: '/riscos', search: ['titulo', 'codigo', 'descricao', 'setor'], filters: ['categoria', 'nivel', 'status', 'setor', 'responsavelUserId'], orderBy: [{ score: 'desc' }, { createdAt: 'desc' }] })
  mountCrud(router, {
    model: 'jurRisco', path: '/riscos', read: READ, write: WRITE, modulo: 'juridico.riscos', create: risco,
    beforeCreate: async (d, req) => {
      await assertNoTenant(tid(req), 'jurSeguro', d.seguroId, 'Seguro')
      return { ...d, ...calc(d), codigo: d.codigo ?? (await proximoCodigo(tid(req), 'RSK')) }
    },
    beforeUpdate: async (d, req, cur) => {
      delete d.codigo
      if (d.seguroId) await assertNoTenant(tid(req), 'jurSeguro', d.seguroId, 'Seguro')
      return { ...d, ...calc(d, cur) }
    },
  })

  router.get('/riscos-matriz', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: tid(req), status: { not: 'ENCERRADO' } }
    for (const f of ['categoria', 'setor']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const residual = qs(req.query.residual) === 'true'
    const rs = await prisma.jurRisco.findMany({ where, select: { id: true, codigo: true, titulo: true, probabilidade: true, impacto: true, probabilidadeResidual: true, impactoResidual: true, nivel: true, categoria: true } })
    const celulas: any[] = []
    for (let p = 5; p >= 1; p--) for (let i = 1; i <= 5; i++) {
      const itens = rs.filter((r) => (residual ? (r.probabilidadeResidual ?? r.probabilidade) : r.probabilidade) === p && (residual ? (r.impactoResidual ?? r.impacto) : r.impacto) === i)
      celulas.push({ probabilidade: p, impacto: i, score: p * i, nivel: nivelRisco(p * i), qtd: itens.length, riscos: itens.map((r) => ({ id: r.id, codigo: r.codigo, titulo: r.titulo })) })
    }
    const porNivel: Record<string, number> = { BAIXO: 0, MEDIO: 0, ALTO: 0, CRITICO: 0 }
    for (const c of celulas) porNivel[c.nivel] += c.qtd
    res.json({ residual, total: rs.length, porNivel, celulas })
  }))

  // Riscos de nível alto/crítico em categorias seguráveis sem apólice vigente associada.
  router.get('/riscos-sem-cobertura', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const rs = await prisma.jurRisco.findMany({ where: { tenantId, status: { not: 'ENCERRADO' }, nivel: { in: ['ALTO', 'CRITICO'] }, categoria: { in: ['PATRIMONIAL', 'PESSOAL', 'RESPONSABILIDADE_CIVIL', 'CIBERNETICO'] } }, orderBy: { score: 'desc' } })
    const seguros = await prisma.jurSeguro.findMany({ where: { tenantId, id: { in: rs.map((r) => r.seguroId).filter(Boolean) as string[] } }, select: { id: true, status: true, vigenciaFim: true, apolice: true } })
    const m = new Map(seguros.map((s) => [s.id, s]))
    const items = rs.map((r) => {
      const s = r.seguroId ? m.get(r.seguroId) : undefined
      const motivo = !r.seguroId ? 'SEM_SEGURO' : !s || s.status !== 'VIGENTE' || s.vigenciaFim.getTime() < Date.now() ? 'SEGURO_VENCIDO' : null
      return motivo ? { ...r, motivo } : null
    }).filter(Boolean)
    res.json({ items, total: items.length })
  }))

  // ---- seguros
  mountLista(router, { model: 'jurSeguro', path: '/seguros', campoVenc: 'vigenciaFim', statusVigente: ['VIGENTE'], search: ['apolice', 'seguradora', 'corretor', 'bensSegurados'], filters: ['tipo', 'status', 'seguradora'], orderBy: [{ vigenciaFim: 'asc' }], include: { _count: { select: { sinistros: true } } } })
  bloquearStatus(router, '/seguros', '/renovar ou /cancelar')
  mountCrud(router, {
    model: 'jurSeguro', path: '/seguros', read: READ, write: WRITE, modulo: 'juridico.seguros', create: seguro, include: { sinistros: { orderBy: { dataOcorrencia: 'desc' } } },
    beforeCreate: (d) => { checarVigencia(d.vigenciaInicio, d.vigenciaFim, 'vigência da apólice'); return { ...d, status: 'VIGENTE' } },
    afterCreate: (row) => lembreteSeguro(row),
    beforeUpdate: (d, _req, cur) => {
      if (d.status !== undefined && d.status !== cur.status) fail(422, 'Use /renovar ou /cancelar para mudar a situação da apólice.')
      delete d.status
      checarVigencia(d.vigenciaInicio ?? cur.vigenciaInicio, d.vigenciaFim ?? cur.vigenciaFim, 'vigência da apólice')
    },
    afterUpdate: (row) => lembreteSeguro(row, true),
  })

  // Renovação: a apólice atual vira RENOVADO e nasce uma nova (com os riscos reapontados para ela).
  router.post('/seguros/:id/renovar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ apolice: z.string().min(2).max(60), vigenciaInicio: z.coerce.date(), vigenciaFim: z.coerce.date(), premio: z.number().min(0).max(1e12).optional(), limiteTotal: optMoney() }), req.body)
    checarVigencia(b.vigenciaInicio, b.vigenciaFim, 'vigência da nova apólice')
    const s = await prisma.jurSeguro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Seguro não encontrado.' })
    if (s.status !== 'VIGENTE') fail(409, 'Somente apólices vigentes podem ser renovadas.')
    if (b.apolice === s.apolice) fail(422, 'Informe o número da nova apólice (diferente da atual).')
    if (b.vigenciaFim.getTime() <= s.vigenciaFim.getTime()) fail(422, 'A nova vigência deve terminar depois da atual.')
    const { id, createdAt, updatedAt, ...resto } = s
    const novo = await prisma.$transaction(async (tx) => {
      await tx.jurSeguro.update({ where: { id: s.id }, data: { status: 'RENOVADO' } })
      const n = await tx.jurSeguro.create({ data: { ...resto, coberturas: (s.coberturas ?? undefined) as any, apolice: b.apolice, vigenciaInicio: b.vigenciaInicio, vigenciaFim: b.vigenciaFim, premio: b.premio ?? s.premio, limiteTotal: b.limiteTotal ?? s.limiteTotal, status: 'VIGENTE' } })
      await tx.jurRisco.updateMany({ where: { tenantId, seguroId: s.id }, data: { seguroId: n.id } })
      return n
    })
    await cancelarLembretes(tenantId, 'seguro', s.id)
    await lembreteSeguro(novo)
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.seguros', acao: 'RENOVAR', refType: 'JurSeguro', refId: s.id, detalhes: { nova: novo.id, apolice: b.apolice } })
    res.status(201).json(novo)
  }))
  router.post('/seguros/:id/cancelar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ motivo: z.string().min(5).max(1000) }), req.body)
    const s = await prisma.jurSeguro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Seguro não encontrado.' })
    if (s.status !== 'VIGENTE') fail(409, 'Somente apólices vigentes podem ser canceladas.')
    const row = await prisma.jurSeguro.update({ where: { id: s.id }, data: { status: 'CANCELADO', observacoes: `${s.observacoes ?? ''}\n[Cancelamento] ${b.motivo}`.trim() } })
    await cancelarLembretes(tenantId, 'seguro', s.id)
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.seguros', acao: 'CANCELAR', refType: 'JurSeguro', refId: s.id, detalhes: b })
    res.json(row)
  }))

  // ---- sinistros
  router.get('/sinistros', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId: tid(req) }
    const st = qs(req.query.status); if (st) where.status = st
    const sg = qs(req.query.seguroId); if (sg) where.seguroId = sg
    const [items, total] = await Promise.all([prisma.jurSinistro.findMany({ where, orderBy: { dataOcorrencia: 'desc' }, skip, take, include: { seguro: { select: { apolice: true, tipo: true, seguradora: true } } } }), prisma.jurSinistro.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.post('/seguros/:id/sinistros', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ dataOcorrencia: z.coerce.date(), descricao: z.string().min(5).max(3000), valorEstimado: optMoney(), protocoloSeguradora: optStr(80), comunicadoEm: optDate(), processoId: z.string().uuid().nullish() }), req.body)
    const s = await prisma.jurSeguro.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Seguro não encontrado.' })
    if (s.status === 'CANCELADO') fail(409, 'Apólice cancelada não recebe sinistros.')
    if (b.dataOcorrencia.getTime() < s.vigenciaInicio.getTime() - 86_400_000 || b.dataOcorrencia.getTime() > s.vigenciaFim.getTime() + 86_400_000) fail(422, 'A data da ocorrência está fora da vigência da apólice (sinistro sem cobertura).')
    if (b.dataOcorrencia.getTime() > Date.now() + 86_400_000) fail(400, 'Data da ocorrência no futuro.')
    await assertNoTenant(tenantId, 'jurProcesso', b.processoId, 'Processo')
    const row = await prisma.jurSinistro.create({ data: { ...b, processoId: b.processoId ?? undefined, tenantId, seguroId: s.id, comunicadoEm: b.comunicadoEm ?? new Date() } })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.seguros', acao: 'SINISTRO', refType: 'JurSinistro', refId: row.id, detalhes: { seguroId: s.id } })
    res.status(201).json(row)
  }))
  router.post('/sinistros/:id/status', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ status: z.enum(['COMUNICADO', 'EM_ANALISE', 'NEGADO', 'INDENIZADO', 'ENCERRADO']), valorIndenizado: optMoney() }), req.body)
    const sn = await prisma.jurSinistro.findFirst({ where: { id: String(req.params.id), tenantId }, include: { seguro: true } })
    if (!sn) return res.status(404).json({ error: 'Sinistro não encontrado.' })
    if (!TRANSICOES[sn.status].includes(b.status)) fail(409, `Transição inválida: ${sn.status} -> ${b.status}.`)
    if (b.status === 'INDENIZADO') {
      if (!b.valorIndenizado || b.valorIndenizado <= 0) fail(422, 'Indenização exige valorIndenizado maior que zero.')
      if (sn.seguro.limiteTotal != null && b.valorIndenizado > sn.seguro.limiteTotal) fail(422, 'Valor indenizado acima do limite total da apólice.')
    }
    const row = await prisma.jurSinistro.update({ where: { id: sn.id }, data: { status: b.status, ...(b.status === 'INDENIZADO' ? { valorIndenizado: r2(b.valorIndenizado!) } : {}) } })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.seguros', acao: 'SINISTRO_STATUS', refType: 'JurSinistro', refId: sn.id, detalhes: { de: sn.status, para: b.status } })
    res.json(row)
  }))
}
