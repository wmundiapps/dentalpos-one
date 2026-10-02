import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs, dateISO } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, cancelReminders } from '../core/reminders'
import { READ_RH, WRITE_RH, MOD, DAY, TITULACOES, ensureReminder, fail } from './common'
import { simularProgressao, transicaoValida, proximosStatus, NivelCarreira, StatusProgressao } from './carreiraLogic'

const RR = [...READ_RH, ...WRITE_RH]

const toNivel = (n: any): NivelCarreira => ({
  id: n.id, codigo: n.codigo, nome: n.nome, ordem: n.ordem, titulacaoMinima: n.titulacaoMinima, intersticioMeses: n.intersticioMeses,
  pontuacaoMinima: n.pontuacaoMinima, avaliacaoMinima: n.avaliacaoMinima, salarioBase: Number(n.salarioBase),
})

async function simularEnq(tenantId: string, enqId: string, destinoId?: string, now = new Date()) {
  const enq = await prisma.govCarreiraEnquadramento.findFirst({ where: { id: enqId, tenantId } })
  if (!enq) fail(404, 'Enquadramento não encontrado.')
  const niveis = await prisma.govCarreiraNivel.findMany({ where: { tenantId, planoId: enq!.planoId }, orderBy: { ordem: 'asc' } })
  const sim = simularProgressao({ niveis: niveis.map(toNivel), nivelAtualId: enq!.nivelId, destinoId, now, servidor: { inicioNivel: enq!.inicioNivel, titulacao: enq!.titulacao, pontuacao: enq!.pontuacao, avaliacao: enq!.avaliacao } })
  return { enq: enq!, sim }
}

export function registerCarreira(router: Router) {
  mountCrud(router, {
    model: 'govCarreiraPlano', path: '/carreira/planos', read: RR, write: WRITE_RH, modulo: 'governanca.carreira', filters: ['tipo', 'ativo'],
    create: z.object({ tipo: z.enum(['DOCENTE', 'TECNICO_ADMINISTRATIVO']), nome: z.string().min(3), vigenciaInicio: dateISO().optional() }),
    include: { niveis: { orderBy: { ordem: 'asc' } } },
  })
  mountCrud(router, {
    model: 'govCarreiraNivel', path: '/carreira/niveis', read: RR, write: WRITE_RH, modulo: 'governanca.carreira', filters: ['planoId'], orderBy: { ordem: 'asc' },
    create: z.object({
      planoId: z.string().uuid(), codigo: z.string().min(1), nome: z.string().min(2), classe: z.string().optional(), ordem: z.number().int().min(1),
      titulacaoMinima: z.enum(TITULACOES).optional(), intersticioMeses: z.number().int().min(0).default(24), pontuacaoMinima: z.number().min(0).default(0),
      avaliacaoMinima: z.number().min(0).max(10).default(0), salarioBase: z.number().min(0),
    }),
    beforeCreate: async (d, req) => { if (!(await prisma.govCarreiraPlano.findFirst({ where: { id: d.planoId, tenantId: getTenantId(req) } }))) fail(400, 'Plano não encontrado.') },
    beforeUpdate: (d) => { delete d.planoId },
  })

  mountCrud(router, {
    model: 'govCarreiraEnquadramento', path: '/carreira/enquadramentos', read: RR, write: WRITE_RH, modulo: 'governanca.carreira', filters: ['planoId', 'nivelId', 'docenteId', 'ativo'], search: ['nome'],
    create: z.object({ planoId: z.string().uuid(), nivelId: z.string().uuid(), docenteId: z.string().min(1), nome: z.string().min(2), titulacao: z.enum(TITULACOES).optional(), inicioNivel: dateISO(), pontuacao: z.number().min(0).default(0), avaliacao: z.number().min(0).max(10).default(0) }),
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      const n = await prisma.govCarreiraNivel.findFirst({ where: { id: d.nivelId, tenantId, planoId: d.planoId } })
      if (!n) fail(400, 'Nível não pertence ao plano informado.')
      if (await prisma.govCarreiraEnquadramento.findFirst({ where: { tenantId, planoId: d.planoId, docenteId: d.docenteId, ativo: true } })) fail(409, 'Servidor já enquadrado neste plano.')
    },
    beforeUpdate: (d) => { delete d.planoId; delete d.nivelId; delete d.inicioNivel; delete d.docenteId }, // mudança de nível só via progressão
  })

  router.get('/carreira/enquadramentos/:id/simulacao', requireRole(...RR), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { enq, sim } = await simularEnq(getTenantId(req), String(req.params.id), qs(req.query.destinoId))
    res.json({ enquadramento: { id: enq.id, nome: enq.nome }, ...sim })
  }))

  // Quem está elegível no plano + impacto total estimado
  router.get('/carreira/planos/:id/elegiveis', requireRole(...RR), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const enqs = await prisma.govCarreiraEnquadramento.findMany({ where: { tenantId, planoId: String(req.params.id), ativo: true } })
    const items = []
    let impactoMensal = 0
    for (const e of enqs) {
      const { sim } = await simularEnq(tenantId, e.id)
      if (sim.elegivel && sim.impacto) { impactoMensal += sim.impacto.diferenca; items.push({ enquadramentoId: e.id, nome: e.nome, de: sim.nivelAtual.codigo, para: sim.nivelDestino?.codigo, impacto: sim.impacto }) }
    }
    res.json({ items, total: items.length, impactoMensalEstimado: Math.round(impactoMensal * 100) / 100 })
  }))

  // ---- Processo de progressão (workflow) ----
  // criação com simulação obrigatória (registrado ANTES do CRUD genérico, que fica só com leitura/edição)
  router.post('/carreira/progressoes', requireRole(...WRITE_RH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ enquadramentoId: z.string().uuid(), nivelDestinoId: z.string().uuid().optional(), justificativa: z.string().optional() }), req.body)
    const { enq, sim } = await simularEnq(tenantId, body.enquadramentoId, body.nivelDestinoId)
    if (!sim.nivelDestino) fail(422, 'Não há nível superior para progressão.')
    if (!sim.elegivel) return res.status(422).json({ error: 'Servidor não atende aos critérios de progressão.', faltantes: sim.faltantes, elegivelEm: sim.elegivelEm })
    if (await prisma.govCarreiraProgressao.findFirst({ where: { tenantId, enquadramentoId: enq.id, status: { in: ['SOLICITADA', 'EM_ANALISE', 'DEFERIDA'] } } })) fail(409, 'Já existe processo de progressão em andamento para este servidor.')
    const row = await prisma.govCarreiraProgressao.create({
      data: {
        tenantId, enquadramentoId: enq.id, nivelOrigemId: enq.nivelId, nivelDestinoId: sim.nivelDestino.id, justificativa: body.justificativa,
        simulacao: JSON.parse(JSON.stringify(sim)), impactoSalarial: sim.impacto?.diferenca ?? 0, solicitadaPorId: getUserId(req),
        historico: [{ de: null, para: 'SOLICITADA', em: new Date().toISOString(), por: getUserId(req) }],
      },
    })
    await ensureReminder({ tenantId, modulo: MOD, titulo: `Analisar progressão funcional de ${enq.nome} (${sim.nivelAtual.codigo} → ${sim.nivelDestino.codigo})`, dueAt: new Date(Date.now() + 30 * DAY), antecedenciaDias: 10, refType: 'GovCarreiraProgressao', refId: row.id, assigneeRole: 'RECTOR', severity: 'ATENCAO', dedupeKey: `gov:carreira:prog:${row.id}` })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.carreira', acao: 'SOLICITAR_PROGRESSAO', refType: 'GovCarreiraProgressao', refId: row.id })
    res.status(201).json(row)
  }))

  mountCrud(router, {
    model: 'govCarreiraProgressao', path: '/carreira/progressoes', read: RR, write: WRITE_RH, modulo: 'governanca.carreira', filters: ['status', 'enquadramentoId'], orderBy: { createdAt: 'desc' },
    create: z.object({ enquadramentoId: z.string().uuid(), nivelDestinoId: z.string().uuid().optional(), justificativa: z.string().optional() }),
    update: z.object({ justificativa: z.string() }).partial(),
  })
  router.get('/carreira/progressoes/:id/transicoes', requireRole(...RR), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.govCarreiraProgressao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    res.json({ status: p.status, proximos: proximosStatus(p.status as StatusProgressao) })
  }))

  router.post('/carreira/progressoes/:id/transicao', requireRole(...WRITE_RH), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const body = parseBody(z.object({ para: z.enum(['EM_ANALISE', 'DEFERIDA', 'INDEFERIDA', 'EFETIVADA', 'CANCELADA']), parecer: z.string().optional() }), req.body)
    const p = await prisma.govCarreiraProgressao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' })
    if (!transicaoValida(p.status as StatusProgressao, body.para)) fail(409, `Transição inválida: ${p.status} → ${body.para}. Permitidas: ${proximosStatus(p.status as StatusProgressao).join(', ') || 'nenhuma'}.`)
    if ((body.para === 'DEFERIDA' || body.para === 'INDEFERIDA') && (body.parecer?.trim().length ?? 0) < 10) fail(422, 'Parecer da comissão (mín. 10 caracteres) é obrigatório para deferir/indeferir.')
    const agora = new Date()
    const hist = [...(Array.isArray(p.historico) ? (p.historico as any[]) : []), { de: p.status, para: body.para, em: agora.toISOString(), por: getUserId(req), parecer: body.parecer }]
    const row = await prisma.$transaction(async (tx) => {
      if (body.para === 'EFETIVADA') {
        // revalida critérios no momento da efetivação e move o servidor de nível
        const enq = await tx.govCarreiraEnquadramento.findFirst({ where: { id: p.enquadramentoId, tenantId } })
        if (!enq || enq.nivelId !== p.nivelOrigemId) fail(409, 'O servidor não está mais no nível de origem do processo.')
        await tx.govCarreiraEnquadramento.update({ where: { id: enq!.id }, data: { nivelId: p.nivelDestinoId, inicioNivel: agora } })
      }
      return tx.govCarreiraProgressao.update({
        where: { id: p.id },
        data: { status: body.para, parecer: body.parecer ?? p.parecer, historico: hist, ...(['DEFERIDA', 'INDEFERIDA', 'EFETIVADA'].includes(body.para) ? { decididaPorId: getUserId(req), decididaEm: agora } : {}) },
      })
    })
    if (body.para === 'DEFERIDA') {
      await completeReminders({ tenantId, refType: 'GovCarreiraProgressao', refId: p.id, userId: getUserId(req) })
      await ensureReminder({ tenantId, modulo: MOD, titulo: 'Efetivar progressão deferida (folha de pagamento)', dueAt: new Date(Date.now() + 15 * DAY), refType: 'GovCarreiraProgressao', refId: p.id, assigneeRole: 'FINANCE', severity: 'ATENCAO', dedupeKey: `gov:carreira:efet:${p.id}` })
    } else if (['INDEFERIDA', 'EFETIVADA', 'CANCELADA'].includes(body.para)) await cancelReminders({ tenantId, refType: 'GovCarreiraProgressao', refId: p.id })
    await audit({ tenantId, userId: getUserId(req), modulo: 'governanca.carreira', acao: `PROGRESSAO_${body.para}`, refType: 'GovCarreiraProgressao', refId: p.id, detalhes: { parecer: body.parecer } })
    res.json(row)
  }))
}

// Servidores que completaram o interstício (elegibilidade temporal) — usado pelo job.
export async function varrerElegibilidade(now = new Date()) {
  const enqs = await prisma.govCarreiraEnquadramento.findMany({ where: { ativo: true }, take: 2000 })
  let alertas = 0
  for (const e of enqs) {
    try {
      const { sim } = await simularEnq(e.tenantId, e.id, undefined, now)
      if (!sim.elegivel || !sim.nivelDestino) continue
      if (await prisma.govCarreiraProgressao.findFirst({ where: { tenantId: e.tenantId, enquadramentoId: e.id, status: { in: ['SOLICITADA', 'EM_ANALISE', 'DEFERIDA'] } } })) continue
      await ensureReminder({ tenantId: e.tenantId, modulo: MOD, titulo: `${e.nome} está elegível à progressão ${sim.nivelAtual.codigo} → ${sim.nivelDestino.codigo}`, descricao: `Impacto mensal estimado: R$ ${sim.impacto?.diferenca.toFixed(2)}`, dueAt: new Date(now.getTime() + 30 * DAY), refType: 'GovCarreiraEnquadramento', refId: e.id, assigneeRole: 'SECRETARY', dedupeKey: `gov:carreira:elegivel:${e.id}:${sim.nivelDestino.id}` })
      alertas++
    } catch { /* plano incompleto: ignora */ }
  }
  return { avaliados: enqs.length, alertas }
}
