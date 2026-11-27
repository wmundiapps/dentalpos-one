import { prisma } from '../../lib/prisma'
import { registerEduJob } from '../core/jobs'
import { scheduleReminder } from '../core/reminders'
import { DAY, quantidadesKit, renovarVigencia, statusContrato, statusValidade } from './logic'
import { checarEstoqueMinimo } from './stock'
import { lembreteDocumento, lembretesContrato, statusDocumento } from './catalogo'

const mod = 'suprimentos'

export function registerSuprimentosJobs() {
  // Documentos de fornecedores: atualiza status e garante lembrete.
  registerEduJob('suprimentos:documentos-fornecedores', async () => {
    const docs = await prisma.supFornecedorDocumento.findMany({ where: { validade: { not: null, lte: new Date(Date.now() + 60 * DAY) } }, take: 2000 })
    let atualizados = 0
    for (const d of docs) {
      const st = statusDocumento(d.validade)
      if (st !== d.status) { await prisma.supFornecedorDocumento.update({ where: { id: d.id }, data: { status: st } }); atualizados++ }
      await lembreteDocumento({ ...d, status: st })
    }
    return { avaliados: docs.length, atualizados }
  })

  // Contratos: atualiza status (A_VENCER/VENCIDO), renova automaticamente os marcados e reforça lembretes.
  registerEduJob('suprimentos:contratos', async () => {
    const cs = await prisma.supContrato.findMany({ where: { status: { in: ['VIGENTE', 'A_VENCER', 'VENCIDO'] } }, take: 2000 })
    let atualizados = 0, renovados = 0
    for (const c of cs) {
      if (c.renovacaoAutomatica && c.vigenciaFim.getTime() < Date.now()) {
        const v = renovarVigencia(c.vigenciaInicio, c.vigenciaFim)
        const existe = await prisma.supContrato.findFirst({ where: { tenantId: c.tenantId, contratoAnteriorId: c.id } })
        if (!existe) {
          const novo = await prisma.$transaction(async (tx) => {
            await tx.supContrato.update({ where: { id: c.id }, data: { status: 'RENOVADO' } })
            return tx.supContrato.create({ data: { tenantId: c.tenantId, numero: `${c.numero}-R${v.inicio.getFullYear()}`, fornecedorId: c.fornecedorId, objeto: c.objeto, vigenciaInicio: v.inicio, vigenciaFim: v.fim, valorMensal: c.valorMensal, valorTotal: c.valorTotal, indiceReajuste: c.indiceReajuste, percentualReajuste: c.percentualReajuste, proximoReajusteEm: c.proximoReajusteEm, renovacaoAutomatica: true, avisoDias: c.avisoDias, status: 'VIGENTE', centroCustoId: c.centroCustoId, contratoAnteriorId: c.id } })
          }).catch(() => null)
          if (novo) { renovados++; await lembretesContrato(novo); continue }
        }
      }
      const st = statusContrato(c) as any
      if (st !== c.status) { await prisma.supContrato.update({ where: { id: c.id }, data: { status: st } }); atualizados++ }
      await lembretesContrato({ ...c, status: st })
    }
    return { avaliados: cs.length, atualizados, renovados }
  })

  // Lotes vencendo/vencidos.
  registerEduJob('suprimentos:validade-lotes', async () => {
    const lotes = await prisma.supLote.findMany({ where: { quantidade: { gt: 0 }, validade: { not: null, lte: new Date(Date.now() + 60 * DAY) } }, include: { item: { select: { nome: true, unidade: true } } }, take: 2000 })
    let n = 0
    for (const l of lotes) {
      const st = statusValidade(l.validade)
      if (st === 'OK' || st === 'SEM_VALIDADE') continue
      await scheduleReminder({ tenantId: l.tenantId, modulo: mod, refType: 'SupLote', refId: l.id, dedupeKey: `sup-lote-${l.almoxarifadoId}-${l.itemId}-${l.numero}`,
        titulo: st === 'VENCIDO' ? `LOTE VENCIDO em estoque: ${l.item.nome} (lote ${l.numero})` : `Lote ${l.numero} de ${l.item.nome} vence em ${l.validade!.toLocaleDateString('pt-BR')}`,
        descricao: `${l.quantidade} ${l.item.unidade} em estoque. ${st === 'VENCIDO' ? 'Dê baixa por PERDA e descarte conforme norma.' : 'Priorize o consumo (FEFO) ou transfira.'}`,
        dueAt: l.validade!, antecedenciaDias: 30, remindAt: new Date(), severity: st === 'VENCIDO' || st === 'CRITICO' ? 'CRITICO' : 'ATENCAO', assigneeRole: 'SUPPLIES' })
      n++
    }
    return { lotes: lotes.length, lembretes: n }
  })

  // Estoque mínimo / ponto de pedido.
  registerEduJob('suprimentos:estoque-minimo', async () => {
    const itens = await prisma.supItem.findMany({ where: { ativo: true, estoqueMinimo: { gt: 0 } }, select: { id: true, tenantId: true }, take: 5000 })
    const porTenant = new Map<string, string[]>()
    for (const i of itens) porTenant.set(i.tenantId, [...(porTenant.get(i.tenantId) ?? []), i.id])
    for (const [t, ids] of porTenant) await checarEstoqueMinimo(t, ids)
    return { itens: itens.length }
  })

  // Pedidos com entrega atrasada, cotações com prazo vencido e requisições paradas na aprovação.
  registerEduJob('suprimentos:prazos-compras', async () => {
    const atrasados = await prisma.supPedido.findMany({ where: { status: { in: ['EMITIDO', 'PARCIALMENTE_RECEBIDO'] }, previsaoEntrega: { lt: new Date() } }, include: { fornecedor: { select: { razaoSocial: true } } }, take: 1000 })
    for (const p of atrasados) {
      await scheduleReminder({ tenantId: p.tenantId, modulo: mod, refType: 'SupPedido', refId: p.id, dedupeKey: `sup-atraso-${p.id}`, titulo: `Entrega ATRASADA: pedido ${p.numero} (${p.fornecedor.razaoSocial})`, descricao: 'Cobre o fornecedor, renegocie o prazo ou cancele o saldo.', dueAt: p.previsaoEntrega!, remindAt: new Date(), severity: 'CRITICO', assigneeRole: 'SUPPLIES', recorrenciaDias: 3 })
    }
    const cots = await prisma.supCotacao.findMany({ where: { status: 'ABERTA', prazoResposta: { lt: new Date() } }, take: 1000 })
    for (const c of cots) {
      await scheduleReminder({ tenantId: c.tenantId, modulo: mod, refType: 'SupCotacao', refId: c.id, dedupeKey: `sup-cot-${c.id}`, titulo: `Cotação ${c.numero} com prazo de resposta vencido`, descricao: 'Encerre com as propostas recebidas ou prorrogue.', dueAt: c.prazoResposta!, remindAt: new Date(), severity: 'ATENCAO', assigneeRole: 'SUPPLIES' })
    }
    const reqs = await prisma.supRequisicao.findMany({ where: { status: 'AGUARDANDO_APROVACAO', updatedAt: { lt: new Date(Date.now() - 3 * DAY) } }, include: { aprovacoes: { where: { status: 'PENDENTE' }, orderBy: { nivel: 'asc' }, take: 1 } }, take: 1000 })
    for (const r of reqs) {
      const a = r.aprovacoes[0]
      if (!a) continue
      await scheduleReminder({ tenantId: r.tenantId, modulo: mod, refType: 'SupRequisicao', refId: r.id, dedupeKey: `sup-aprov-${r.id}-${a.nivel}`, titulo: `Requisição ${r.numero} parada na aprovação (nível ${a.nivel})`, dueAt: new Date(Date.now() - DAY), remindAt: new Date(), severity: 'CRITICO', assigneeRole: a.papel })
    }
    return { pedidosAtrasados: atrasados.length, cotacoesVencidas: cots.length, requisicoesParadas: reqs.length }
  })

  // Aulas práticas dos próximos 3 dias: confere se o estoque cobre o kit da disciplina.
  registerEduJob('suprimentos:kits-aulas', async () => {
    const sessoes = await prisma.classSession.findMany({ where: { status: 'AGENDADA', dataHoraInicio: { gte: new Date(), lte: new Date(Date.now() + 3 * DAY) } }, include: { classSection: { select: { id: true, tenantId: true, disciplineId: true, nome: true } } }, take: 1000 })
    let alertas = 0
    for (const s of sessoes) {
      const cs = s.classSection
      const kits = await prisma.supKit.findMany({ where: { tenantId: cs.tenantId, disciplineId: cs.disciplineId, ativo: true }, include: { itens: true } })
      if (!kits.length) continue
      const jaBaixado = await prisma.supKitConsumo.findFirst({ where: { tenantId: cs.tenantId, classSessionId: s.id } })
      if (jaBaixado) continue
      const alunos = await prisma.classSectionEnrollment.count({ where: { classSectionId: cs.id } })
      for (const k of kits) {
        const need = quantidadesKit(k.itens, alunos)
        const saldos = await prisma.supSaldo.groupBy({ by: ['itemId'], where: { tenantId: cs.tenantId, itemId: { in: need.map((x) => x.itemId) } }, _sum: { quantidade: true } })
        const faltas = need.filter((x) => (saldos.find((y) => y.itemId === x.itemId)?._sum.quantidade ?? 0) < x.quantidade)
        if (faltas.length) {
          alertas++
          await scheduleReminder({ tenantId: cs.tenantId, modulo: mod, refType: 'ClassSession', refId: s.id, dedupeKey: `sup-kit-${s.id}-${k.id}`, titulo: `Insumos insuficientes para aula prática (${cs.nome}) — kit ${k.nome}`, descricao: `Faltam ${faltas.length} item(ns) para ${alunos} aluno(s).`, dueAt: s.dataHoraInicio, remindAt: new Date(), severity: 'CRITICO', assigneeRole: 'SUPPLIES' })
        }
      }
    }
    return { aulas: sessoes.length, alertas }
  })
}
