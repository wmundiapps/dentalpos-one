// Ciclo de vida: admissão (checklist + ASO admissional) e desligamento (aviso, exame demissional, rescisão simulada, devolução, acerto).
import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { notify } from '../core/notify'
import { addDiasStr, avisoPrevioDias, diaLocal, diffDias, simularRescisao } from './calculo'
import { CHECKLIST_ADMISSAO, CHECKLIST_DESLIGAMENTO } from './cadastro'
import { auditar, carregarColaborador, dia, diaDate, exigirAcesso, exigirRh, httpError, logSensivel, meuColaborador, tid, uid } from './common'
import { inssFn, irrfFn, tabelasVigentes } from './fiscalDb'
import { sincronizarPeriodos } from './ferias'

const pendencias422 = (res: Response, mensagem: string, pendencias: string[]) => res.status(422).json({ error: mensagem, pendencias })

export function mountCiclo(router: Router) {
  // ---------------------------------------------------------------- admissão
  const situacaoAdmissao = async (tenantId: string, colaboradorId: string) => {
    const c = await carregarColaborador(tenantId, colaboradorId)
    const itens = await prisma.rheChecklistItem.findMany({ where: { tenantId, colaboradorId, fluxo: 'ADMISSAO' }, orderBy: { createdAt: 'asc' } })
    const aso = await prisma.rheExame.findFirst({ where: { tenantId, colaboradorId, tipo: 'ADMISSIONAL', status: 'REALIZADO' }, orderBy: { realizadoEm: 'desc' } })
    const asoOk = !!aso && aso.resultado !== 'INAPTO'
    const pend: string[] = []
    for (const i of itens) if (i.obrigatorio && i.status === 'PENDENTE' && !(i.codigo === 'ASO_ADMISSIONAL' && asoOk)) pend.push(`Documento pendente: ${i.titulo}`)
    if (!aso) pend.push('Exame admissional (ASO) não realizado')
    else if (aso.resultado === 'INAPTO') pend.push('ASO admissional com resultado INAPTO')
    if (!c.dataAdmissao) pend.push('Data de admissão não informada')
    if (!c.cargoId) pend.push('Cargo não informado')
    if (c.vinculo !== 'PJ' && c.vinculo !== 'ESTAGIARIO' && !c.jornadaId && c.vinculo === 'CLT') pend.push('Jornada não informada')
    if (c.vinculo !== 'PROFESSOR_HORISTA' && c.salarioBase <= 0) pend.push('Salário/valor do contrato não informado')
    return { c, itens, aso, pend }
  }

  router.get('/admissao/:colaboradorId', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await situacaoAdmissao(tid(req), String(req.params.colaboradorId))
    await logSensivel(req, 'admissao', 'SAUDE', s.c.id)
    res.json({ colaboradorId: s.c.id, nome: s.c.nome, status: s.c.status, itens: s.itens, exameAdmissional: s.aso ? { id: s.aso.id, realizadoEm: s.aso.realizadoEm, resultado: s.aso.resultado, venceEm: s.aso.venceEm } : null, pendencias: s.pend, pronto: s.pend.length === 0 })
  }))
  router.post('/admissao/:colaboradorId/iniciar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const c = await carregarColaborador(tenantId, String(req.params.colaboradorId))
    if (c.status !== 'EM_ADMISSAO') throw httpError(409, 'O colaborador não está em admissão.')
    await prisma.rheChecklistItem.createMany({ data: CHECKLIST_ADMISSAO.map(([codigo, titulo, obrigatorio]) => ({ tenantId, colaboradorId: c.id, fluxo: 'ADMISSAO', codigo, titulo, obrigatorio })), skipDuplicates: true })
    res.json({ itens: await prisma.rheChecklistItem.count({ where: { tenantId, colaboradorId: c.id, fluxo: 'ADMISSAO' } }) })
  }))
  const itemSchema = z.object({ status: z.enum(['PENDENTE', 'RECEBIDO', 'DISPENSADO']), observacao: z.string().max(300).optional() })
  router.post('/checklist/:itemId', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const b = parseBody(itemSchema, req.body)
    const i = await prisma.rheChecklistItem.findFirst({ where: { id: String(req.params.itemId), tenantId } })
    if (!i) throw httpError(404, 'Item não encontrado.')
    if (b.status === 'DISPENSADO' && i.obrigatorio) throw httpError(422, 'Item obrigatório não pode ser dispensado.')
    const r = await prisma.rheChecklistItem.update({ where: { id: i.id }, data: { status: b.status, observacao: b.observacao, concluidoEm: b.status === 'PENDENTE' ? null : new Date(), concluidoPorId: b.status === 'PENDENTE' ? null : uid(req) } })
    res.json(r)
  }))
  router.post('/admissao/:colaboradorId/concluir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const s = await situacaoAdmissao(tenantId, String(req.params.colaboradorId))
    if (s.c.status !== 'EM_ADMISSAO') throw httpError(409, 'O colaborador não está em admissão.')
    if (s.pend.length) return pendencias422(res, 'Admissão com pendências.', s.pend)
    const c = await prisma.rheColaborador.update({ where: { id: s.c.id }, data: { status: 'ATIVO' } })
    if (c.userId) await notify({ tenantId, userId: c.userId, assunto: 'Bem-vindo(a)!', mensagem: 'Sua admissão foi concluída. Registre o ponto e acesse seus dados na área do colaborador.', refType: 'RheColaborador', refId: c.id })
    await sincronizarPeriodos(tenantId, c.id)
    await auditar(req, 'CONCLUIR_ADMISSAO', 'RheColaborador', c.id)
    res.json({ id: c.id, status: c.status })
  }))

  // ---------------------------------------------------------------- desligamento
  const TIPOS = ['SEM_JUSTA_CAUSA', 'JUSTA_CAUSA', 'PEDIDO_DEMISSAO', 'ACORDO', 'TERMINO_CONTRATO', 'APOSENTADORIA', 'TERMINO_ESTAGIO'] as const
  router.post('/desligamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ colaboradorId: z.string(), tipo: z.enum(TIPOS), dataComunicacao: dateISO(), dataDesligamento: dateISO(), avisoTipo: z.enum(['TRABALHADO', 'INDENIZADO', 'DISPENSADO', 'NAO_APLICA']).default('NAO_APLICA'), motivo: z.string().max(1000).optional() }), req.body)
    const c = await carregarColaborador(tenantId, b.colaboradorId)
    if (['DESLIGADO', 'EM_ADMISSAO'].includes(c.status)) throw httpError(409, 'O colaborador não está ativo.')
    if (await prisma.rheDesligamento.findFirst({ where: { tenantId, colaboradorId: c.id, status: { notIn: ['CONCLUIDO', 'CANCELADO'] } }, select: { id: true } })) throw httpError(409, 'Já existe um desligamento em andamento.')
    if (dia(b.dataDesligamento) < dia(b.dataComunicacao)) throw httpError(422, 'A data de desligamento não pode ser anterior à comunicação.')
    const temAviso = ['SEM_JUSTA_CAUSA', 'PEDIDO_DEMISSAO', 'ACORDO'].includes(b.tipo)
    if (!temAviso && b.avisoTipo !== 'NAO_APLICA') throw httpError(422, 'Este tipo de desligamento não tem aviso prévio.')
    if (temAviso && b.avisoTipo === 'NAO_APLICA') throw httpError(422, 'Informe o tipo de aviso prévio (trabalhado, indenizado ou dispensado).')
    const avisoDias = temAviso && c.dataAdmissao ? avisoPrevioDias(dia(c.dataAdmissao), dia(b.dataDesligamento)) : 0
    if (b.avisoTipo === 'TRABALHADO' && diffDias(dia(b.dataComunicacao), dia(b.dataDesligamento)) < avisoDias && b.tipo === 'SEM_JUSTA_CAUSA') throw httpError(422, `Aviso trabalhado: o desligamento deve ocorrer ao menos ${avisoDias} dias após a comunicação.`)
    // alertas de estabilidade/impedimentos
    const alertas: string[] = []
    const h = diaDate(diaLocal(new Date()))
    if (await prisma.rheLicenca.findFirst({ where: { tenantId, colaboradorId: c.id, tipo: 'MATERNIDADE', status: 'APROVADA', fim: { gte: new Date(h.getTime() - 150 * 86400000) } }, select: { id: true } })) alertas.push('Possível estabilidade da gestante/mãe (até 5 meses após o parto): consulte o jurídico.')
    if (await prisma.rheAtestado.findFirst({ where: { tenantId, colaboradorId: c.id, afastamento: true, status: { not: 'REJEITADO' }, dataFim: { gte: h } }, select: { id: true } })) alertas.push('Colaborador em afastamento previdenciário: contrato suspenso, possível estabilidade acidentária.')
    if (await prisma.rheAdvertencia.findFirst({ where: { tenantId, colaboradorId: c.id, status: { in: ['REGISTRADA', 'CONTESTADA'] } }, select: { id: true } }) && b.tipo === 'JUSTA_CAUSA') alertas.push('Há registros disciplinares sem ciência/contestação em aberto: confira a gradação antes da justa causa.')
    const d = await prisma.rheDesligamento.create({ data: { tenantId, colaboradorId: c.id, tipo: b.tipo, dataComunicacao: b.dataComunicacao, dataDesligamento: b.dataDesligamento, avisoTipo: b.avisoTipo, avisoDias, motivo: b.motivo, status: 'AGUARDANDO_EXAME' } })
    await prisma.rheChecklistItem.createMany({ data: CHECKLIST_DESLIGAMENTO.map(([codigo, titulo, obrigatorio]) => ({ tenantId, colaboradorId: c.id, fluxo: 'DESLIGAMENTO', codigo, titulo, obrigatorio })), skipDuplicates: true })
    const ex = await prisma.rheExame.create({ data: { tenantId, colaboradorId: c.id, tipo: 'DEMISSIONAL', status: 'AGENDADO' } })
    const r = await prisma.rheDesligamento.update({ where: { id: d.id }, data: { exameId: ex.id } })
    await auditar(req, 'INICIAR_DESLIGAMENTO', 'RheDesligamento', d.id, { tipo: b.tipo })
    res.status(201).json({ ...r, alertas })
  }))

  router.get('/desligamentos', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }; const st = qs(req.query.status); if (st) where.status = st
    const [items, total] = await Promise.all([prisma.rheDesligamento.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.rheDesligamento.count({ where })])
    const nomes = Object.fromEntries((await prisma.rheColaborador.findMany({ where: { tenantId, id: { in: items.map((i) => i.colaboradorId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]))
    res.json({ items: items.map(({ rescisao, ...x }) => ({ ...x, colaboradorNome: nomes[x.colaboradorId], rescisaoCalculada: !!rescisao })), total, page, pageSize })
  }))

  const carregar = async (tenantId: string, id: string) => { const d = await prisma.rheDesligamento.findFirst({ where: { id, tenantId } }); if (!d) throw httpError(404, 'Desligamento não encontrado.'); return d }
  const pendDeslig = async (tenantId: string, d: any) => {
    const pend: string[] = []
    const ex = d.exameId ? await prisma.rheExame.findFirst({ where: { id: d.exameId, tenantId } }) : null
    if (!ex || (ex.status !== 'REALIZADO' && !ex.dispensado)) pend.push('Exame demissional (ASO) não realizado nem dispensado')
    const itens = await prisma.rheChecklistItem.findMany({ where: { tenantId, colaboradorId: d.colaboradorId, fluxo: 'DESLIGAMENTO' } })
    for (const i of itens) if (i.obrigatorio && i.status === 'PENDENTE' && !['EXAME_DEMISSIONAL', 'ACERTO_CONTAS'].includes(i.codigo)) pend.push(`Pendente: ${i.titulo}`)
    if (!d.rescisao) pend.push('Termo de rescisão (simulação) não calculado')
    if (d.acertoStatus !== 'PAGO') pend.push('Acerto de contas não pago/conferido')
    return { pend, ex, itens }
  }

  router.get('/desligamentos/:id', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id))
    const { pend, ex, itens } = await pendDeslig(tenantId, d)
    const c = await carregarColaborador(tenantId, d.colaboradorId)
    await logSensivel(req, 'desligamentos', 'SAUDE', d.colaboradorId, d.id)
    res.json({ ...d, colaborador: { id: c.id, nome: c.nome, matricula: c.matricula }, exame: ex ? { id: ex.id, status: ex.status, realizadoEm: ex.realizadoEm, dispensado: ex.dispensado } : null, checklist: itens, pendencias: pend })
  }))

  router.post('/desligamentos/:id/exame', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO'].includes(d.status)) throw httpError(409, 'Desligamento encerrado.')
    const b = parseBody(z.object({ dispensar: z.boolean().default(false), realizadoEm: dateISO().optional(), resultado: z.enum(['APTO', 'INAPTO', 'APTO_COM_RESTRICAO']).optional(), medico: z.string().max(150).optional() }), req.body)
    const ex = await prisma.rheExame.findFirst({ where: { id: d.exameId ?? '', tenantId } })
    if (!ex) throw httpError(404, 'Exame demissional não encontrado.')
    if (b.dispensar) {
      const ult = await prisma.rheExame.findFirst({ where: { tenantId, colaboradorId: d.colaboradorId, status: 'REALIZADO', tipo: { in: ['ADMISSIONAL', 'PERIODICO', 'RETORNO_TRABALHO', 'MUDANCA_FUNCAO'] } }, orderBy: { realizadoEm: 'desc' } })
      if (!ult?.realizadoEm || diffDias(dia(ult.realizadoEm), dia(d.dataDesligamento)) > 135) throw httpError(422, 'Dispensa do exame demissional só é possível se o último ASO tiver até 135 dias (NR-7, grau de risco 1 e 2; 90 dias nos graus 3 e 4).')
      await prisma.rheExame.update({ where: { id: ex.id }, data: { dispensado: true, status: 'REALIZADO', realizadoEm: ult.realizadoEm, resultado: ult.resultado } })
    } else {
      if (!b.realizadoEm || !b.resultado) throw httpError(422, 'Informe a data e o resultado do exame demissional.')
      await prisma.rheExame.update({ where: { id: ex.id }, data: { status: 'REALIZADO', realizadoEm: b.realizadoEm, resultado: b.resultado, medico: b.medico } })
    }
    await logSensivel(req, 'desligamentos/exame', 'SAUDE', d.colaboradorId, d.id)
    await prisma.rheChecklistItem.updateMany({ where: { tenantId, colaboradorId: d.colaboradorId, fluxo: 'DESLIGAMENTO', codigo: 'EXAME_DEMISSIONAL' }, data: { status: b.dispensar ? 'DISPENSADO' : 'RECEBIDO', concluidoEm: new Date(), concluidoPorId: uid(req) } }).catch(() => undefined)
    const r = await prisma.rheDesligamento.update({ where: { id: d.id }, data: { status: 'AGUARDANDO_DEVOLUCAO' } })
    res.json(r)
  }))

  router.post('/desligamentos/:id/itens/:itemId', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id)); const b = parseBody(itemSchema, req.body)
    const i = await prisma.rheChecklistItem.findFirst({ where: { id: String(req.params.itemId), tenantId, colaboradorId: d.colaboradorId, fluxo: 'DESLIGAMENTO' } })
    if (!i) throw httpError(404, 'Item não encontrado.')
    if (b.status === 'DISPENSADO' && i.obrigatorio) throw httpError(422, 'Item obrigatório não pode ser dispensado.')
    res.json(await prisma.rheChecklistItem.update({ where: { id: i.id }, data: { status: b.status, observacao: b.observacao, concluidoEm: b.status === 'PENDENTE' ? null : new Date(), concluidoPorId: uid(req) } }))
  }))

  router.post('/desligamentos/:id/rescisao', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO'].includes(d.status)) throw httpError(409, 'Desligamento encerrado.')
    const c = await carregarColaborador(tenantId, d.colaboradorId)
    if (!c.dataAdmissao) throw httpError(422, 'Colaborador sem data de admissão.')
    if (c.vinculo === 'PJ') throw httpError(422, 'PJ não tem rescisão trabalhista: encerre o contrato.')
    const b = parseBody(z.object({ saldoFgts: z.number().min(0).optional() }).optional().default({}), req.body ?? {})
    const comp = dia(d.dataDesligamento).slice(0, 7)
    const tab = await tabelasVigentes(tenantId, comp)
    await sincronizarPeriodos(tenantId, c.id, d.dataDesligamento)
    const pers = await prisma.rheFeriasPeriodo.findMany({ where: { tenantId, colaboradorId: c.id, status: { in: ['DISPONIVEL', 'PARCIAL', 'VENCIDO'] } } })
    const salario = c.vinculo === 'PROFESSOR_HORISTA' ? (c.cargaMensalHoras ?? 0) * (c.valorHora ?? 0) * 7 / 6 : c.salarioBase
    const sim = simularRescisao({
      tipo: d.tipo, salario, admissao: dia(c.dataAdmissao), desligamento: dia(d.dataDesligamento), avisoTipo: d.avisoTipo, avisoDias: d.avisoDias || undefined,
      feriasVencidasPeriodos: pers.filter((p) => p.status !== 'VENCIDO').length, feriasVencidasEmDobro: pers.filter((p) => p.status === 'VENCIDO').length, saldoFgts: b.saldoFgts,
      inss: inssFn(tab), irrf: (br, inss) => irrfFn(tab, c.dependentesIrrf)(br, inss),
    })
    const r = await prisma.rheDesligamento.update({ where: { id: d.id }, data: { rescisao: { ...sim, tabelas: tab.origem, modeloAValidar: true } as any, rescisaoEm: new Date(), acertoStatus: 'PENDENTE' } })
    await logSensivel(req, 'desligamentos/rescisao', 'REMUNERACAO', c.id, d.id)
    res.json(r)
  }))

  router.post('/desligamentos/:id/acerto', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id))
    const b = parseBody(z.object({ acao: z.enum(['CONFERIR', 'PAGAR']) }), req.body)
    if (!d.rescisao) throw httpError(422, 'Calcule o termo de rescisão (simulação) antes do acerto.')
    if (['CONCLUIDO', 'CANCELADO'].includes(d.status)) throw httpError(409, 'Desligamento encerrado.')
    if (b.acao === 'CONFERIR') {
      if (d.acertoStatus !== 'PENDENTE') throw httpError(409, 'Acerto já conferido.')
      res.json(await prisma.rheDesligamento.update({ where: { id: d.id }, data: { acertoStatus: 'CONFERIDO', acertoConferidoPorId: uid(req) } }))
    } else {
      if (d.acertoStatus !== 'CONFERIDO') throw httpError(409, 'Confira o acerto antes de registrar o pagamento.')
      if (d.acertoConferidoPorId === uid(req)) throw httpError(403, 'Segregação de funções: o pagamento deve ser registrado por outra pessoa que não conferiu o acerto.')
      res.json(await prisma.rheDesligamento.update({ where: { id: d.id }, data: { acertoStatus: 'PAGO', status: 'ACERTO' } }))
    }
  }))

  router.post('/desligamentos/:id/concluir', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id))
    if (['CONCLUIDO', 'CANCELADO'].includes(d.status)) throw httpError(409, 'Desligamento já encerrado.')
    const { pend } = await pendDeslig(tenantId, d)
    if (pend.length) return pendencias422(res, 'Desligamento com pendências.', pend)
    const c = await carregarColaborador(tenantId, d.colaboradorId)
    await prisma.$transaction(async (tx) => {
      await tx.rheColaborador.update({ where: { id: c.id }, data: { status: 'DESLIGADO', dataDesligamento: d.dataDesligamento } })
      await tx.rheDesligamento.update({ where: { id: d.id }, data: { status: 'CONCLUIDO', concluidoEm: new Date(), concluidoPorId: uid(req) } })
      await tx.rheMovimentacao.create({ data: { tenantId, colaboradorId: c.id, tipo: 'DESLIGAMENTO' as any, dataEfetiva: d.dataDesligamento, cargoDeId: c.cargoId, salarioDe: c.salarioBase, motivo: d.tipo, aprovadoPorId: uid(req) } })
      await tx.rheFeriasProg.updateMany({ where: { tenantId, colaboradorId: c.id, status: { in: ['PROGRAMADA', 'APROVADA'] }, inicio: { gt: d.dataDesligamento } }, data: { status: 'CANCELADA' } })
      await tx.rheBonificacao.updateMany({ where: { tenantId, colaboradorId: c.id, status: 'PROPOSTA' }, data: { status: 'CANCELADA' } })
      await tx.rheAjustePonto.updateMany({ where: { tenantId, colaboradorId: c.id, status: 'PENDENTE' }, data: { status: 'CANCELADO' } })
      if (c.userId) await tx.user.updateMany({ where: { id: c.userId, tenantId }, data: { isActive: false } })
    }, { timeout: 30000, maxWait: 15000 })
    await auditar(req, 'CONCLUIR_DESLIGAMENTO', 'RheDesligamento', d.id, { tipo: d.tipo })
    res.json({ id: d.id, status: 'CONCLUIDO', acessoRevogado: !!c.userId })
  }))

  router.post('/desligamentos/:id/cancelar', exigirRh, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req); const d = await carregar(tenantId, String(req.params.id))
    const b = parseBody(z.object({ motivo: z.string().min(10).max(500) }), req.body)
    if (['CONCLUIDO', 'CANCELADO'].includes(d.status)) throw httpError(409, 'Desligamento já encerrado.')
    await auditar(req, 'CANCELAR_DESLIGAMENTO', 'RheDesligamento', d.id, { motivo: b.motivo })
    res.json(await prisma.rheDesligamento.update({ where: { id: d.id }, data: { status: 'CANCELADO' } }))
  }))
}
void exigirAcesso; void meuColaborador; void addDiasStr
