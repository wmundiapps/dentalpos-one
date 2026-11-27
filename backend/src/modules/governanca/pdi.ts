import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, cancelReminders } from '../core/reminders'
import { getBranding } from '../core/branding'
import { brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { MOD, READ, WRITE, DAY, ensureReminder, fail, fmtData, optDate, STATUS_ACAO } from './common'
import { execucaoPdi, fracaoTempo, semaforo, proximaColeta, percentualMeta, round1, acaoAtrasada, Periodicidade, Semaforo } from './pdiLogic'

const PERIOD = ['MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'] as const

async function scheduleColeta(meta: any) {
  if (!meta.proximaColetaEm) return
  const d = meta.proximaColetaEm as Date
  await ensureReminder({
    tenantId: meta.tenantId, modulo: MOD, titulo: `Coletar indicador do PDI: ${meta.indicador}`,
    descricao: `Meta "${meta.titulo}" (periodicidade ${meta.periodicidade}).`, dueAt: d, antecedenciaDias: 7,
    refType: 'GovPdiMeta', refId: meta.id, assigneeUserId: meta.responsavelId ?? undefined, assigneeRole: meta.responsavelId ? undefined : 'COORDINATOR',
    dedupeKey: `gov:pdi:coleta:${meta.id}:${d.toISOString().slice(0, 10)}`,
  })
}

async function scheduleAcao(a: any) {
  if (a.status === 'CONCLUIDA' || a.status === 'CANCELADA') return
  await ensureReminder({
    tenantId: a.tenantId, modulo: MOD, titulo: `Ação do PDI com prazo: ${a.titulo}`, dueAt: a.prazo, antecedenciaDias: 7,
    refType: 'GovPdiAcao', refId: a.id, assigneeUserId: a.responsavelId ?? undefined, assigneeRole: a.responsavelId ? undefined : 'COORDINATOR',
    severity: 'ATENCAO', dedupeKey: `gov:pdi:acao:${a.id}:${a.prazo.toISOString().slice(0, 10)}`,
  })
}

async function recomputeMeta(tenantId: string, metaId: string) {
  const meta = await prisma.govPdiMeta.findFirst({ where: { id: metaId, tenantId } })
  if (!meta) return null
  const ult = await prisma.govPdiMedicao.findFirst({ where: { tenantId, metaId }, orderBy: [{ dataReferencia: 'desc' }, { createdAt: 'desc' }] })
  const base = ult?.dataReferencia ?? new Date()
  return prisma.govPdiMeta.update({
    where: { id: metaId },
    data: { valorAtual: ult?.valor ?? null, ultimaColetaEm: ult?.dataReferencia ?? null, proximaColetaEm: proximaColeta(base, meta.periodicidade as Periodicidade) },
  })
}

async function carregarPdi(tenantId: string, id: string) {
  const pdi = await prisma.govPdi.findFirst({
    where: { id, tenantId },
    include: { eixos: { orderBy: { ordem: 'asc' }, include: { objetivos: { orderBy: { ordem: 'asc' }, include: { metas: { include: { acoes: true } } } } } } },
  })
  if (!pdi) fail(404, 'PDI não encontrado.')
  return pdi!
}

export function calcularPainelPdi(pdi: Awaited<ReturnType<typeof carregarPdi>>, now = new Date()) {
  const ini = new Date(Date.UTC(pdi.anoInicio, 0, 1))
  const fim = new Date(Date.UTC(pdi.anoFim, 11, 31))
  const exec = execucaoPdi(
    pdi.eixos.map((e) => ({
      id: e.id, peso: e.peso,
      objetivos: e.objetivos.map((o) => ({
        id: o.id, peso: o.peso,
        metas: o.metas.map((m) => ({ id: m.id, peso: m.peso, linhaBase: m.linhaBase, valorMeta: m.valorMeta, valorAtual: m.valorAtual, sentido: m.sentido })),
      })),
    })),
  )
  const metaInfo = new Map(exec.eixos.flatMap((e) => e.objetivos.flatMap((o) => o.metas.map((m) => [m.id, m.percentual] as const))))
  let acoesTotal = 0, acoesConcluidas = 0, acoesAtrasadas = 0, orcamento = 0, gasto = 0
  const metasSem: Record<Semaforo, number> = { VERDE: 0, AMARELO: 0, VERMELHO: 0, CINZA: 0 }
  const eixos = pdi.eixos.map((e, i) => ({
    id: e.id, nome: e.nome, peso: e.peso, percentual: exec.eixos[i].percentual,
    semaforo: semaforo(exec.eixos[i].percentual, fracaoTempo(ini, fim, now) * 100, e.objetivos.every((o) => o.metas.every((m) => m.valorAtual == null))),
    objetivos: e.objetivos.map((o, j) => ({
      id: o.id, titulo: o.titulo, percentual: exec.eixos[i].objetivos[j].percentual,
      metas: o.metas.map((m) => {
        const pct = metaInfo.get(m.id) ?? 0
        const esperado = round1(fracaoTempo(ini, m.prazo ?? fim, now) * 100)
        const sem = semaforo(pct, esperado, m.valorAtual == null)
        metasSem[sem]++
        const atrasadaColeta = !!m.proximaColetaEm && m.proximaColetaEm < now
        for (const a of m.acoes) {
          acoesTotal++; orcamento += Number(a.orcamento); gasto += Number(a.gasto)
          if (a.status === 'CONCLUIDA') acoesConcluidas++
          if (acaoAtrasada({ status: a.status as any, prazo: a.prazo }, now)) acoesAtrasadas++
        }
        return {
          id: m.id, titulo: m.titulo, indicador: m.indicador, unidade: m.unidade, linhaBase: m.linhaBase, valorMeta: m.valorMeta, valorAtual: m.valorAtual,
          percentual: pct, esperado, semaforo: sem, coletaAtrasada: atrasadaColeta, proximaColetaEm: m.proximaColetaEm, prazo: m.prazo,
        }
      }),
    })),
  }))
  return {
    pdi: { id: pdi.id, titulo: pdi.titulo, anoInicio: pdi.anoInicio, anoFim: pdi.anoFim, status: pdi.status },
    percentualExecucao: exec.percentual,
    percentualEsperado: round1(fracaoTempo(ini, fim, now) * 100),
    semaforo: semaforo(exec.percentual, fracaoTempo(ini, fim, now) * 100, metasSem.CINZA > 0 && metasSem.CINZA === Object.values(metasSem).reduce((a, b) => a + b, 0)),
    metas: metasSem,
    acoes: { total: acoesTotal, concluidas: acoesConcluidas, atrasadas: acoesAtrasadas },
    orcamento: { previsto: round1(orcamento), gasto: round1(gasto), estouro: gasto > orcamento },
    eixos,
  }
}

const COR: Record<string, string> = { VERDE: '#16a34a', AMARELO: '#d97706', VERMELHO: '#dc2626', CINZA: '#94a3b8' }

export function registerPdi(router: Router) {
  const crudBase = { read: READ, write: WRITE, modulo: 'governanca.pdi' }

  mountCrud(router, {
    ...crudBase, model: 'govPdi', path: '/pdis', filters: ['status'], search: ['titulo'],
    create: z.object({
      titulo: z.string().min(3), anoInicio: z.number().int().min(2000).max(2100), anoFim: z.number().int().min(2000).max(2100),
      missao: z.string().optional(), visao: z.string().optional(), valores: z.string().optional(),
    }).refine((v) => v.anoFim >= v.anoInicio && v.anoFim - v.anoInicio <= 4, { message: 'O PDI é um ciclo de até 5 anos (anoFim >= anoInicio e no máximo 4 anos após).' }),
    update: z.object({ titulo: z.string().min(3), missao: z.string(), visao: z.string(), valores: z.string() }).partial(),
  })

  router.post('/pdis/:id/ativar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req); const id = String(req.params.id)
    const pdi = await carregarPdi(tenantId, id)
    if (pdi.status === 'ENCERRADO') fail(409, 'PDI encerrado não pode ser reativado.')
    if (!pdi.eixos.length) fail(422, 'Cadastre ao menos um eixo antes de ativar o PDI.')
    await prisma.govPdi.updateMany({ where: { tenantId, status: 'VIGENTE', id: { not: id } }, data: { status: 'ENCERRADO' } })
    const row = await prisma.govPdi.update({ where: { id }, data: { status: 'VIGENTE' } })
    // agenda coletas das metas já cadastradas
    for (const e of pdi.eixos) for (const o of e.objetivos) for (const m of o.metas) {
      const meta = m.proximaColetaEm ? m : await prisma.govPdiMeta.update({ where: { id: m.id }, data: { proximaColetaEm: proximaColeta(new Date(), m.periodicidade as Periodicidade) } })
      await scheduleColeta(meta)
      for (const a of m.acoes) await scheduleAcao(a)
    }
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.pdi', acao: 'ATIVAR', refType: 'GovPdi', refId: id })
    res.json(row)
  }))

  router.post('/pdis/:id/encerrar', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req); const id = String(req.params.id)
    await carregarPdi(tenantId, id)
    const row = await prisma.govPdi.update({ where: { id }, data: { status: 'ENCERRADO' } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.pdi', acao: 'ENCERRAR', refType: 'GovPdi', refId: id })
    res.json(row)
  }))

  // ---- Eixos / objetivos / metas ----
  mountCrud(router, {
    ...crudBase, model: 'govPdiEixo', path: '/pdi-eixos', filters: ['pdiId'], orderBy: { ordem: 'asc' },
    create: z.object({
      pdiId: z.string().uuid(), nome: z.string().min(2), descricao: z.string().optional(), eixoSinaes: z.number().int().min(1).max(5).optional(),
      dimensaoSinaes: z.number().int().min(1).max(10).optional(), peso: z.number().positive().default(1), ordem: z.number().int().default(0),
    }),
    beforeCreate: async (d, req) => { if (!(await prisma.govPdi.findFirst({ where: { id: d.pdiId, tenantId: getTenantId(req) } }))) fail(400, 'PDI não encontrado.') },
    beforeUpdate: (d) => { delete d.pdiId },
  })
  mountCrud(router, {
    ...crudBase, model: 'govPdiObjetivo', path: '/pdi-objetivos', filters: ['eixoId'], orderBy: { ordem: 'asc' },
    create: z.object({ eixoId: z.string().uuid(), titulo: z.string().min(3), descricao: z.string().optional(), peso: z.number().positive().default(1), ordem: z.number().int().default(0) }),
    beforeCreate: async (d, req) => { if (!(await prisma.govPdiEixo.findFirst({ where: { id: d.eixoId, tenantId: getTenantId(req) } }))) fail(400, 'Eixo não encontrado.') },
    beforeUpdate: (d) => { delete d.eixoId },
  })
  mountCrud(router, {
    ...crudBase, model: 'govPdiMeta', path: '/pdi-metas', filters: ['objetivoId', 'responsavelId', 'periodicidade'], search: ['titulo', 'indicador'],
    create: z.object({
      objetivoId: z.string().uuid(), titulo: z.string().min(3), indicador: z.string().min(2), unidade: z.string().optional(),
      sentido: z.enum(['MAIOR_MELHOR', 'MENOR_MELHOR']).default('MAIOR_MELHOR'), linhaBase: z.number(), valorMeta: z.number(),
      periodicidade: z.enum(PERIOD).default('SEMESTRAL'), responsavelId: z.string().optional(), prazo: optDate(), peso: z.number().positive().default(1),
    }),
    beforeCreate: async (d, req) => {
      if (!(await prisma.govPdiObjetivo.findFirst({ where: { id: d.objetivoId, tenantId: getTenantId(req) } }))) fail(400, 'Objetivo não encontrado.')
      d.valorAtual = d.linhaBase
      d.proximaColetaEm = proximaColeta(new Date(), d.periodicidade)
    },
    afterCreate: (row) => scheduleColeta(row),
    beforeUpdate: (d, _req, cur) => {
      delete d.objetivoId
      if (d.periodicidade && d.periodicidade !== cur.periodicidade) d.proximaColetaEm = proximaColeta(cur.ultimaColetaEm ?? new Date(), d.periodicidade)
    },
    afterUpdate: (row) => scheduleColeta(row),
  })

  // Medições (acompanhamento periódico)
  router.get('/pdi-metas/:id/medicoes', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.govPdiMedicao.findMany({ where: { tenantId: getTenantId(req), metaId: String(req.params.id) }, orderBy: { dataReferencia: 'asc' } })
    res.json({ items, total: items.length })
  }))
  router.post('/pdi-metas/:id/medicoes', requireRole(...WRITE, 'TEACHER', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req); const metaId = String(req.params.id)
    const body = parseBody(z.object({ dataReferencia: optDate(), valor: z.number(), observacao: z.string().optional() }), req.body)
    const meta = await prisma.govPdiMeta.findFirst({ where: { id: metaId, tenantId } })
    if (!meta) return res.status(404).json({ error: 'Meta não encontrada.' })
    const med = await prisma.govPdiMedicao.create({ data: { tenantId, metaId, dataReferencia: body.dataReferencia ?? new Date(), valor: body.valor, observacao: body.observacao, registradoPorId: getUserId(req) } })
    await completeReminders({ tenantId, refType: 'GovPdiMeta', refId: metaId, userId: getUserId(req) })
    const atualizada = await recomputeMeta(tenantId, metaId)
    if (atualizada) await scheduleColeta(atualizada)
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.pdi', acao: 'MEDICAO', refType: 'GovPdiMeta', refId: metaId, detalhes: { valor: body.valor } })
    res.status(201).json({ medicao: med, meta: atualizada, percentual: atualizada ? percentualMeta(atualizada) : 0 })
  }))
  router.delete('/pdi-medicoes/:id', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const med = await prisma.govPdiMedicao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!med) return res.status(404).json({ error: 'Medição não encontrada.' })
    await prisma.govPdiMedicao.delete({ where: { id: med.id } })
    await recomputeMeta(tenantId, med.metaId)
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.pdi', acao: 'REMOVER_MEDICAO', refType: 'GovPdiMedicao', refId: med.id })
    res.status(204).end()
  }))

  // ---- Ações ----
  mountCrud(router, {
    ...crudBase, model: 'govPdiAcao', path: '/pdi-acoes', filters: ['metaId', 'status', 'responsavelId'], search: ['titulo'], orderBy: { prazo: 'asc' },
    create: z.object({
      metaId: z.string().uuid(), titulo: z.string().min(3), descricao: z.string().optional(), responsavelId: z.string().optional(), prazo: z.preprocess((v) => (typeof v === 'string' ? new Date(v) : v), z.date()),
      orcamento: z.number().min(0).default(0), gasto: z.number().min(0).default(0), percentual: z.number().int().min(0).max(100).default(0), status: z.enum(STATUS_ACAO).default('PLANEJADA'),
    }),
    beforeCreate: async (d, req) => { if (!(await prisma.govPdiMeta.findFirst({ where: { id: d.metaId, tenantId: getTenantId(req) } }))) fail(400, 'Meta não encontrada.') },
    afterCreate: (row) => scheduleAcao(row),
    beforeUpdate: (d, _req, cur) => {
      delete d.metaId
      const status = d.status ?? cur.status
      if (status === 'CONCLUIDA') { d.percentual = 100; d.concluidaEm = cur.concluidaEm ?? new Date() }
      else if (cur.status === 'CONCLUIDA') d.concluidaEm = null
      if (status === 'PLANEJADA' && (d.percentual ?? cur.percentual) > 0) d.status = 'EM_ANDAMENTO'
    },
    afterUpdate: async (row, req) => {
      const tenantId = getTenantId(req)
      if (row.status === 'CONCLUIDA') await completeReminders({ tenantId, refType: 'GovPdiAcao', refId: row.id, userId: getUserId(req) })
      else if (row.status === 'CANCELADA') await cancelReminders({ tenantId, refType: 'GovPdiAcao', refId: row.id })
      else await scheduleAcao(row)
    },
  })

  // ---- Painel e relatório ----
  router.get('/pdis/:id/execucao', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(calcularPainelPdi(await carregarPdi(getTenantId(req), String(req.params.id))))
  }))

  router.get('/pdis/:id/relatorio', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pdi = await carregarPdi(tenantId, String(req.params.id))
    const p = calcularPainelPdi(pdi)
    const b = await getBranding(tenantId)
    const chip = (s: string) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COR[s]};margin-right:4px"></span>${s}`
    const linhas = p.eixos.map((e) => `<h3 style="color:${esc(b.cores.secundaria)};margin:22px 0 6px">${esc(e.nome)} — ${e.percentual}% ${chip(e.semaforo)}</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:6px">Meta / indicador</th><th>Base</th><th>Atual</th><th>Meta</th><th>% exec.</th><th>Esperado</th><th>Situação</th></tr></thead><tbody>
${e.objetivos.flatMap((o) => o.metas.map((m) => `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px"><b>${esc(m.titulo)}</b><br/><small>${esc(m.indicador)} (obj.: ${esc(o.titulo)})</small></td><td>${m.linhaBase}</td><td>${m.valorAtual ?? '—'}</td><td>${m.valorMeta}${m.unidade ? ' ' + esc(m.unidade) : ''}</td><td>${m.percentual}%</td><td>${m.esperado}%</td><td>${chip(m.semaforo)}${m.coletaAtrasada ? ' <small>(coleta atrasada)</small>' : ''}</td></tr>`)).join('')}
</tbody></table>`).join('')
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório de acompanhamento do PDI</title></head><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:980px;margin:0 auto">
${brandHeaderHtml(b, { titulo: 'Relatório de Acompanhamento do PDI', subtitulo: `${pdi.titulo} (${pdi.anoInicio}–${pdi.anoFim})` })}
<section style="padding:20px 28px">
<p><b>Execução geral:</b> ${p.percentualExecucao}% (esperado pelo cronograma: ${p.percentualEsperado}%) ${chip(p.semaforo)}</p>
<p><b>Metas:</b> ${p.metas.VERDE} no prazo, ${p.metas.AMARELO} em atenção, ${p.metas.VERMELHO} críticas, ${p.metas.CINZA} sem medição.
 <b>Ações:</b> ${p.acoes.concluidas}/${p.acoes.total} concluídas, ${p.acoes.atrasadas} atrasadas.
 <b>Orçamento:</b> previsto R$ ${p.orcamento.previsto.toFixed(2)}, executado R$ ${p.orcamento.gasto.toFixed(2)}${p.orcamento.estouro ? ' (ESTOURO)' : ''}.</p>
${linhas}
<p style="margin-top:28px;font-size:11px;color:#64748b">Emitido em ${fmtData(new Date())}.</p></section></body></html>`
    if (qs(req.query.format) === 'html') return res.type('html').send(html)
    res.json({ html, resumo: { percentualExecucao: p.percentualExecucao, semaforo: p.semaforo, metas: p.metas, acoes: p.acoes } })
  }))

  // Metas com coleta vencida / a vencer (fila de trabalho do responsável)
  router.get('/pdi-coletas-pendentes', requireRole(...READ, ...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const dias = Math.min(180, parseInt(qs(req.query.dias) || '15', 10) || 15)
    const items = await prisma.govPdiMeta.findMany({ where: { tenantId: getTenantId(req), proximaColetaEm: { lte: new Date(Date.now() + dias * DAY) } }, orderBy: { proximaColetaEm: 'asc' }, take: 200 })
    res.json({ items, total: items.length })
  }))
}

export { scheduleColeta, scheduleAcao }
