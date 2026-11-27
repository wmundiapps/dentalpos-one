import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { dateISO, mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { notify } from '../core/notify'
import { diaLocal, diffDias } from './calculo'
import { HR, MODULO, auditar, carregarColaborador, dia, equipeIds, exigirAcesso, exigirRh, httpError, isRh, logSensivel, meuColaborador, podeVer, tid, uid } from './common'

const TIPOS_MOV = ['PROMOCAO', 'PROGRESSAO', 'MERITO', 'ENQUADRAMENTO', 'TRANSFERENCIA', 'REAJUSTE'] as const
const TIPOS_BON = ['BONUS', 'PREMIO', 'PLR', 'COMISSAO', 'RECONHECIMENTO'] as const

export function mountCarreira(router: Router) {
  mountCrud(router, { model: 'rhePlanoCarreira', path: '/planos-carreira', read: [HR, 'COORDINATOR'], write: [HR], create: z.object({ nome: z.string().min(3).max(120), categoria: z.enum(['DOCENTE', 'TECNICO_ADMINISTRATIVO']).default('TECNICO_ADMINISTRATIVO'), ativo: z.boolean().default(true) }), orderBy: { nome: 'asc' }, modulo: MODULO })

  router.get('/planos-carreira/:id/niveis', requireRhOuGestor, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const p = await prisma.rhePlanoCarreira.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!p) throw httpError(404, 'Plano não encontrado.')
    res.json({ plano: p, niveis: await prisma.rheNivelCarreira.findMany({ where: { tenantId: tid(req), planoId: p.id }, orderBy: { ordem: 'asc' } }) })
  }))
  router.post('/planos-carreira/:id/niveis', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ ordem: z.number().int().min(1).max(50), nome: z.string().min(1).max(100), cargoId: z.string().optional(), salarioBase: z.number().min(0), intersticioMeses: z.number().int().min(0).max(120).default(12), requisitos: z.string().max(1000).optional() }), req.body)
    const p = await prisma.rhePlanoCarreira.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!p) throw httpError(404, 'Plano não encontrado.')
    if (b.cargoId && !(await prisma.rheCargo.findFirst({ where: { id: b.cargoId, tenantId }, select: { id: true } }))) throw httpError(422, 'Cargo não encontrado.')
    const todos = await prisma.rheNivelCarreira.findMany({ where: { tenantId, planoId: p.id } })
    if (todos.some((n) => n.ordem === b.ordem)) throw httpError(409, 'Já existe nível com esta ordem.')
    const ant = todos.filter((n) => n.ordem < b.ordem).sort((a, c) => c.ordem - a.ordem)[0], prox = todos.filter((n) => n.ordem > b.ordem).sort((a, c) => a.ordem - c.ordem)[0]
    if ((ant && b.salarioBase < ant.salarioBase) || (prox && b.salarioBase > prox.salarioBase)) throw httpError(422, 'O salário dos níveis deve ser crescente com a ordem.')
    const n = await prisma.rheNivelCarreira.create({ data: { ...b, tenantId, planoId: p.id } })
    await auditar(req, 'CRIAR_NIVEL', 'RheNivelCarreira', n.id)
    res.status(201).json(n)
  }))
  router.delete('/niveis-carreira/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const n = await prisma.rheNivelCarreira.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!n) throw httpError(404, 'Nível não encontrado.')
    if (await prisma.rheMovimentacao.findFirst({ where: { tenantId: tid(req), nivelParaId: n.id }, select: { id: true } })) throw httpError(409, 'Nível já utilizado em movimentações.')
    await prisma.rheNivelCarreira.delete({ where: { id: n.id } })
    res.status(204).end()
  }))

  // ---------------------------------------------------------------- movimentações
  router.get('/movimentacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const me = await meuColaborador(req)
    const colaboradorId = qs(req.query.colaboradorId) ?? (isRh(req) ? undefined : me?.id)
    if (colaboradorId) await exigirAcesso(req, colaboradorId)
    else if (!isRh(req)) throw httpError(400, 'Informe colaboradorId.')
    const where: any = { tenantId, ...(colaboradorId ? { colaboradorId } : {}) }
    const [items, total] = await Promise.all([prisma.rheMovimentacao.findMany({ where, orderBy: { dataEfetiva: 'desc' }, skip, take }), prisma.rheMovimentacao.count({ where })])
    const cargos = Object.fromEntries((await prisma.rheCargo.findMany({ where: { tenantId }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    const verSal = (x: any) => isRh(req) || me?.id === x.colaboradorId
    if (isRh(req) && colaboradorId) await logSensivel(req, 'movimentacoes', 'REMUNERACAO', colaboradorId)
    res.json({ items: items.map((m) => { const { salarioDe, salarioPara, ...r } = m; return { ...(verSal(m) ? m : r), cargoDeNome: m.cargoDeId ? cargos[m.cargoDeId] : null, cargoParaNome: m.cargoParaId ? cargos[m.cargoParaId] : null, colaboradorNome: nomes[m.colaboradorId] } }), total, page, pageSize })
  }))

  router.post('/movimentacoes', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({
      colaboradorId: z.string(), tipo: z.enum(TIPOS_MOV), dataEfetiva: dateISO(), cargoParaId: z.string().optional(), nivelParaId: z.string().optional(), salarioPara: z.number().min(0).optional(),
      departamentoParaId: z.string().optional(), motivo: z.string().min(5).max(500), forcarIntersticio: z.boolean().default(false),
    }), req.body)
    const c = await carregarColaborador(tenantId, b.colaboradorId)
    if (c.status === 'DESLIGADO') throw httpError(409, 'Colaborador desligado.')
    if (dia(b.dataEfetiva) > diaLocal(new Date())) throw httpError(422, 'A data efetiva não pode ser futura: lance a movimentação na data da vigência.')
    let salarioPara = b.salarioPara
    if (b.nivelParaId) {
      const nv = await prisma.rheNivelCarreira.findFirst({ where: { id: b.nivelParaId, tenantId } })
      if (!nv) throw httpError(422, 'Nível de carreira não encontrado.')
      salarioPara = salarioPara ?? nv.salarioBase
      // interstício mínimo desde a última promoção/progressão/admissão
      const ult = await prisma.rheMovimentacao.findFirst({ where: { tenantId, colaboradorId: c.id, tipo: { in: ['ADMISSAO', 'PROMOCAO', 'PROGRESSAO', 'MERITO', 'ENQUADRAMENTO'] } }, orderBy: { dataEfetiva: 'desc' } })
      const atual = ult?.nivelParaId ? await prisma.rheNivelCarreira.findFirst({ where: { id: ult.nivelParaId, tenantId } }) : null
      if (ult && atual) {
        const meses = diffDias(dia(ult.dataEfetiva), dia(b.dataEfetiva)) / 30.4
        if (meses < atual.intersticioMeses && !b.forcarIntersticio) throw httpError(422, `Interstício mínimo de ${atual.intersticioMeses} meses no nível atual não cumprido (${Math.floor(meses)} meses). Use forcarIntersticio com justificativa.`)
      }
    }
    for (const [m, id, n] of [['rheCargo', b.cargoParaId, 'Cargo'], ['rheDepartamento', b.departamentoParaId, 'Departamento']] as const) if (id && !(await (prisma as any)[m].findFirst({ where: { id, tenantId }, select: { id: true } }))) throw httpError(422, `${n} não encontrado.`)
    if (salarioPara !== undefined && salarioPara < c.salarioBase && c.vinculo === 'CLT') throw httpError(422, 'Redução de salário não é permitida (irredutibilidade salarial - CF art. 7º, VI).')
    if (!b.cargoParaId && !b.nivelParaId && salarioPara === undefined && !b.departamentoParaId) throw httpError(422, 'Informe cargo, nível, salário ou departamento de destino.')
    const mov = await prisma.rheMovimentacao.create({ data: { tenantId, colaboradorId: c.id, tipo: b.tipo, dataEfetiva: b.dataEfetiva, cargoDeId: c.cargoId, cargoParaId: b.cargoParaId ?? c.cargoId, salarioDe: c.salarioBase, salarioPara: salarioPara ?? c.salarioBase, departamentoDeId: c.departamentoId, departamentoParaId: b.departamentoParaId ?? c.departamentoId, nivelParaId: b.nivelParaId, motivo: b.motivo, aprovadoPorId: uid(req) } })
    await prisma.rheColaborador.update({ where: { id: c.id }, data: { ...(b.cargoParaId ? { cargoId: b.cargoParaId } : {}), ...(salarioPara !== undefined ? { salarioBase: salarioPara } : {}), ...(b.departamentoParaId ? { departamentoId: b.departamentoParaId } : {}) } })
    if (c.userId) await notify({ tenantId, userId: c.userId, assunto: 'Movimentação funcional registrada', mensagem: `Foi registrada uma ${b.tipo.toLowerCase()} com vigência em ${dia(b.dataEfetiva)}.`, refType: 'RheMovimentacao', refId: mov.id })
    await auditar(req, 'MOVIMENTAR', 'RheMovimentacao', mov.id, { tipo: b.tipo })
    res.status(201).json(mov)
  }))

  router.get('/colaboradores/:id/carreira', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const id = String(req.params.id)
    const c = await carregarColaborador(tenantId, id)
    await exigirAcesso(req, id, { soProprio: !isRh(req) && (await meuColaborador(req))?.id === id })
    const mov = await prisma.rheMovimentacao.findMany({ where: { tenantId, colaboradorId: id }, orderBy: { dataEfetiva: 'asc' } })
    const ult = [...mov].reverse().find((m) => m.nivelParaId)
    const atual = ult?.nivelParaId ? await prisma.rheNivelCarreira.findFirst({ where: { id: ult.nivelParaId } }) : null
    const proximo = atual ? await prisma.rheNivelCarreira.findFirst({ where: { tenantId, planoId: atual.planoId, ordem: { gt: atual.ordem } }, orderBy: { ordem: 'asc' } }) : null
    const elegivelEm = ult && atual ? new Date(Date.parse(dia(ult.dataEfetiva)) + atual.intersticioMeses * 30.4 * 86400000).toISOString().slice(0, 10) : null
    res.json({ colaboradorId: id, nome: c.nome, historico: isRh(req) || (await meuColaborador(req))?.id === id ? mov : mov.map(({ salarioDe, salarioPara, ...m }) => m), nivelAtual: atual, proximoNivel: proximo, elegivelEm })
  }))

  // ---------------------------------------------------------------- bonificações e premiações
  router.post('/bonificacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ colaboradorId: z.string(), tipo: z.enum(TIPOS_BON), descricao: z.string().min(3).max(200), valor: z.number().positive().max(1_000_000), competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), incideEncargos: z.boolean().default(true), motivo: z.string().max(500).optional() }), req.body)
    if (!isRh(req) && String(req.user?.role).toUpperCase() !== 'COORDINATOR') throw httpError(403, 'Somente gestor ou RH propõem bonificações.')
    await exigirAcesso(req, b.colaboradorId)
    const c = await carregarColaborador(tenantId, b.colaboradorId)
    if (c.status === 'DESLIGADO') throw httpError(409, 'Colaborador desligado.')
    const r = await prisma.rheBonificacao.create({ data: { ...b, tenantId, status: 'PROPOSTA' } })
    await auditar(req, 'PROPOR_BONIFICACAO', 'RheBonificacao', r.id, { tipo: b.tipo })
    res.status(201).json(r)
  }))
  router.get('/bonificacoes', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const me = await meuColaborador(req); const where: any = { tenantId }
    if (!isRh(req)) {
      const eq = String(req.user?.role).toUpperCase() === 'COORDINATOR' ? await equipeIds(req) : []
      where.colaboradorId = { in: [...eq, ...(me ? [me.id] : [])] }
    } else { const c = qs(req.query.colaboradorId); if (c) where.colaboradorId = c }
    for (const f of ['status', 'competencia', 'tipo'] as const) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.rheBonificacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.rheBonificacao.count({ where })])
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    res.json({ items: items.map((x) => ({ ...x, colaboradorNome: nomes[x.colaboradorId] })), total, page, pageSize })
  }))
  router.post('/bonificacoes/:id/decidir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ aprovar: z.boolean(), motivo: z.string().min(3).max(300).optional() }), req.body)
    const x = await prisma.rheBonificacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!x) throw httpError(404, 'Bonificação não encontrada.')
    if (x.status !== 'PROPOSTA') throw httpError(409, 'Bonificação já decidida.')
    const me = await meuColaborador(req)
    if (me?.id === x.colaboradorId) throw httpError(403, 'Você não pode aprovar uma bonificação para si mesmo.')
    if (await prisma.rheFolha.findFirst({ where: { tenantId, competencia: x.competencia, tipo: 'MENSAL', status: 'FECHADA' }, select: { id: true } })) throw httpError(409, 'A folha da competência já está fechada: lance em outra competência.')
    const r = await prisma.rheBonificacao.update({ where: { id: x.id }, data: { status: b.aprovar ? 'APROVADA' : 'CANCELADA', aprovadoPorId: uid(req), aprovadoEm: new Date(), motivo: b.motivo ?? x.motivo } })
    await auditar(req, b.aprovar ? 'APROVAR_BONIFICACAO' : 'REPROVAR_BONIFICACAO', 'RheBonificacao', x.id)
    res.json(r)
  }))

  // ---------------------------------------------------------------- advertências
  const NIVEIS = ['ORIENTACAO', 'ADVERTENCIA_VERBAL', 'ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'JUSTA_CAUSA'] as const
  const sugestao = async (tenantId: string, colaboradorId: string) => {
    const desde = new Date(Date.now() - 365 * 86400000)
    const h = await prisma.rheAdvertencia.findMany({ where: { tenantId, colaboradorId, status: { not: 'CANCELADA' }, data: { gte: desde } }, orderBy: { data: 'desc' } })
    const max = h.reduce((a, x) => Math.max(a, NIVEIS.indexOf(x.nivel as any)), -1)
    return { historico12m: h.length, ultimoNivel: max >= 0 ? NIVEIS[max] : null, sugerido: NIVEIS[Math.min(NIVEIS.length - 1, max + 1)] }
  }
  router.get('/advertencias/sugestao', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = qs(req.query.colaboradorId); if (!id) throw httpError(400, 'Informe colaboradorId.')
    if (!isRh(req) && String(req.user?.role).toUpperCase() !== 'COORDINATOR') throw httpError(403, 'Sem permissão para esta ação.')
    await exigirAcesso(req, id)
    res.json(await sugestao(tid(req), id))
  }))

  router.post('/advertencias', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ colaboradorId: z.string(), nivel: z.enum(NIVEIS), data: dateISO().optional(), motivo: z.string().min(5).max(200), descricao: z.string().min(20).max(4000), diasSuspensao: z.number().int().min(1).max(30).optional(), justificativaSalto: z.string().min(20).max(500).optional(), testemunha: z.string().max(150).optional() }), req.body)
    const rh = isRh(req)
    if (!rh && String(req.user?.role).toUpperCase() !== 'COORDINATOR') throw httpError(403, 'Somente gestor ou RH registram advertências.')
    await exigirAcesso(req, b.colaboradorId)
    const me = await meuColaborador(req)
    if (me?.id === b.colaboradorId) throw httpError(403, 'Não é possível registrar advertência contra si mesmo.')
    const c = await carregarColaborador(tenantId, b.colaboradorId)
    if (c.status === 'DESLIGADO') throw httpError(409, 'Colaborador desligado.')
    if (!rh && (b.nivel === 'SUSPENSAO' || b.nivel === 'JUSTA_CAUSA')) throw httpError(403, 'Suspensão e justa causa só podem ser registradas pelo RH.')
    if (b.nivel === 'SUSPENSAO' && !b.diasSuspensao) throw httpError(422, 'Informe os dias de suspensão (máx. 30 - CLT art. 474).')
    if (b.nivel !== 'SUSPENSAO' && b.diasSuspensao) throw httpError(422, 'Dias de suspensão só se aplicam ao nível SUSPENSAO.')
    const s = await sugestao(tenantId, b.colaboradorId)
    const salto = NIVEIS.indexOf(b.nivel) > NIVEIS.indexOf(s.sugerido as any)
    if (salto && !b.justificativaSalto) throw httpError(422, `Escalonamento: o nível sugerido é ${s.sugerido}. Para aplicar ${b.nivel} informe justificativaSalto (falta grave).`, { sugestao: s })
    if (salto && !rh) throw httpError(403, 'Saltar níveis exige o RH.')
    const { justificativaSalto, ...resto } = b
    const a = await prisma.rheAdvertencia.create({ data: { ...resto, tenantId, data: b.data ?? new Date(), justificativaSalto: salto ? justificativaSalto : null, registradoPorId: uid(req) } })
    if (c.userId) await notify({ tenantId, userId: c.userId, assunto: 'Registro disciplinar aguardando sua ciência', mensagem: 'Há um registro disciplinar aguardando a sua ciência na área do colaborador.', refType: 'RheAdvertencia', refId: a.id })
    await logSensivel(req, 'advertencias', 'DISCIPLINAR', b.colaboradorId, a.id)
    await auditar(req, 'REGISTRAR_ADVERTENCIA', 'RheAdvertencia', a.id, { nivel: b.nivel })
    res.status(201).json({ ...a, sugestao: s })
  }))

  router.get('/advertencias', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const me = await meuColaborador(req); const where: any = { tenantId }
    if (!isRh(req)) {
      const eq = String(req.user?.role).toUpperCase() === 'COORDINATOR' ? await equipeIds(req) : []
      where.colaboradorId = { in: [...eq, ...(me ? [me.id] : [])] }
    } else { const c = qs(req.query.colaboradorId); if (c) where.colaboradorId = c }
    const st = qs(req.query.status); if (st) where.status = st
    const [items, total] = await Promise.all([prisma.rheAdvertencia.findMany({ where, orderBy: { data: 'desc' }, skip, take }), prisma.rheAdvertencia.count({ where })])
    if (!isRh(req) && items.length) await logSensivel(req, 'advertencias', 'DISCIPLINAR', undefined)
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    res.json({ items: items.map(({ cienteIpHash, ...x }) => ({ ...x, colaboradorNome: nomes[x.colaboradorId] })), total, page, pageSize })
  }))

  router.post('/advertencias/:id/ciencia', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ contestacao: z.string().min(10).max(2000).optional() }), req.body ?? {})
    const a = await prisma.rheAdvertencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Registro não encontrado.')
    const me = await meuColaborador(req)
    if (me?.id !== a.colaboradorId) throw httpError(403, 'Somente o próprio colaborador registra a sua ciência.')
    if (a.status !== 'REGISTRADA') throw httpError(409, 'Ciência já registrada ou registro cancelado.')
    const { ipHashDe } = await import('./common')
    const r = await prisma.rheAdvertencia.update({ where: { id: a.id }, data: b.contestacao ? { status: 'CONTESTADA', cienteEm: new Date(), cienteIpHash: ipHashDe(req), contestacao: b.contestacao, contestadaEm: new Date() } : { status: 'CIENTE', cienteEm: new Date(), cienteIpHash: ipHashDe(req) } })
    await auditar(req, 'CIENCIA_ADVERTENCIA', 'RheAdvertencia', a.id)
    const { cienteIpHash, ...out } = r
    res.json(out)
  }))
  router.post('/advertencias/:id/recusa', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ testemunha: z.string().min(3).max(150) }), req.body)
    const a = await prisma.rheAdvertencia.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) throw httpError(404, 'Registro não encontrado.')
    if (a.status !== 'REGISTRADA') throw httpError(409, 'Registro já tratado.')
    res.json(await prisma.rheAdvertencia.update({ where: { id: a.id }, data: { status: 'RECUSOU_CIENCIA', testemunha: b.testemunha, cienteEm: new Date() } }))
  }))
  router.post('/advertencias/:id/cancelar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({ motivo: z.string().min(10).max(500) }), req.body)
    const a = await prisma.rheAdvertencia.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) throw httpError(404, 'Registro não encontrado.')
    if (a.status === 'CANCELADA') throw httpError(409, 'Já cancelado.')
    await auditar(req, 'CANCELAR_ADVERTENCIA', 'RheAdvertencia', a.id, { motivo: b.motivo })
    res.json(await prisma.rheAdvertencia.update({ where: { id: a.id }, data: { status: 'CANCELADA' } }))
  }))
}

function requireRhOuGestor(req: AuthenticatedRequest, res: Response, next: any) {
  if (isRh(req) || String(req.user?.role).toUpperCase() === 'COORDINATOR') return next()
  return res.status(403).json({ error: 'Sem permissão para esta ação.' })
}
void podeVer
