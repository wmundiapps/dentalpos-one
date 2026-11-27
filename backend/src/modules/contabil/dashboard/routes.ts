import { Router } from 'express'
import { empresaDoTenant, mesesDaEmpresa } from '../empresas/service'
import { prisma } from '../nucleo/db'
import { asyncHandler, qs } from '../nucleo/http'
import { ctxDe } from '../nucleo/rbac'
import { brl, competenciaDe, hojeMeioDia, iso10, nomeMes, pct, r2, somaDias, somaMeses, ultimas12 } from '../nucleo/util'
import { tabelasVigentes } from '../regime/tabelas'

const router = Router()

/** Indicadores do escritório (todas as empresas ou uma), vencimentos próximos e alertas. */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const c = ctxDe(req)
  const hoje = hojeMeioDia()
  const empId = qs(req.query.empresaId)
  if (empId) await empresaDoTenant(c.tenantId, empId)
  const empresas = await prisma.ctbEmpresa.findMany({ where: { tenantId: c.tenantId, ativo: true, ...(empId ? { id: empId } : {}) }, orderBy: { razaoSocial: 'asc' }, take: 300 })
  const ids = empresas.map((e) => e.id)
  const comp = competenciaDe(hoje)
  const t = tabelasVigentes(hoje)
  const whereE = { tenantId: c.tenantId, empresaId: { in: ids } }

  const [receber, pagar, receberVenc, pagarVenc, guiasPend, guiasAtr, guiasProx, extratoPend, notasMes, cobrancasMes] = await Promise.all([
    prisma.ctbTitulo.aggregate({ where: { ...whereE, tipo: 'RECEBER', status: 'ABERTO' }, _sum: { valor: true }, _count: true }),
    prisma.ctbTitulo.aggregate({ where: { ...whereE, tipo: 'PAGAR', status: 'ABERTO' }, _sum: { valor: true }, _count: true }),
    prisma.ctbTitulo.aggregate({ where: { ...whereE, tipo: 'RECEBER', status: 'ABERTO', vencimento: { lt: hoje } }, _sum: { valor: true }, _count: true }),
    prisma.ctbTitulo.aggregate({ where: { ...whereE, tipo: 'PAGAR', status: 'ABERTO', vencimento: { lt: hoje } }, _sum: { valor: true }, _count: true }),
    prisma.ctbGuia.aggregate({ where: { ...whereE, status: 'PENDENTE' }, _sum: { valorTotal: true }, _count: true }),
    prisma.ctbGuia.aggregate({ where: { ...whereE, status: 'PENDENTE', vencimento: { lt: hoje } }, _sum: { valorTotal: true }, _count: true }),
    prisma.ctbGuia.findMany({ where: { ...whereE, status: 'PENDENTE', vencimento: { gte: hoje, lte: somaDias(hoje, 30) } }, orderBy: { vencimento: 'asc' }, take: 20 }),
    prisma.ctbExtrato.count({ where: { ...whereE, status: 'PENDENTE' } }),
    prisma.ctbNota.aggregate({ where: { ...whereE, status: { not: 'CANCELADA' }, competencia: comp }, _sum: { valorTotal: true }, _count: true }),
    prisma.ctbCobranca.count({ where: { ...whereE, createdAt: { gte: new Date(hoje.getTime() - 30 * 86_400_000) } } }),
  ])

  // Receita/despesa dos últimos 12 meses (agregado) e por empresa (alertas de limite).
  const comps = ultimas12(comp)
  const alertas: Array<{ nivel: 'critico' | 'atencao' | 'info'; empresaId?: string; empresa?: string; texto: string }> = []
  const serie = comps.map((c2) => ({ competencia: c2, rotulo: nomeMes(c2), receita: 0, despesas: 0 }))
  const porEmpresa: any[] = []
  for (const e of empresas) {
    const meses = await mesesDaEmpresa(c.tenantId, e.id, comps)
    meses.forEach((m, i) => { serie[i].receita += m.receita; serie[i].despesas += m.despesas })
    const rbt12 = r2(meses.reduce((a, m) => a + m.receita, 0))
    porEmpresa.push({ id: e.id, razaoSocial: e.razaoSocial, regimeAtual: e.regimeAtual, receita12m: rbt12, resultado12m: r2(rbt12 - meses.reduce((a, m) => a + m.despesas, 0)) })
    if (e.regimeAtual === 'MEI') {
      if (rbt12 > t.mei.limiteAnual) alertas.push({ nivel: 'critico', empresaId: e.id, empresa: e.razaoSocial, texto: `Receita de 12 meses (${brl(rbt12)}) acima do limite do MEI (${brl(t.mei.limiteAnual)}).` })
      else if (rbt12 >= t.mei.limiteAnual * 0.8) alertas.push({ nivel: 'atencao', empresaId: e.id, empresa: e.razaoSocial, texto: `Receita de 12 meses em ${pct((rbt12 / t.mei.limiteAnual) * 100, 0)} do limite do MEI.` })
    } else if (e.regimeAtual === 'SIMPLES') {
      if (rbt12 > t.simples.limiteAnual) alertas.push({ nivel: 'critico', empresaId: e.id, empresa: e.razaoSocial, texto: `Receita de 12 meses acima do limite do Simples (${brl(t.simples.limiteAnual)}).` })
      else if (rbt12 >= t.simples.limiteAnual * 0.8) alertas.push({ nivel: 'atencao', empresaId: e.id, empresa: e.razaoSocial, texto: `Receita de 12 meses em ${pct((rbt12 / t.simples.limiteAnual) * 100, 0)} do limite do Simples.` })
    }
    if (!meses.some((m) => m.receita > 0 || m.despesas > 0)) alertas.push({ nivel: 'info', empresaId: e.id, empresa: e.razaoSocial, texto: 'Sem histórico de receita/despesa: informe os últimos 12 meses para usar o recomendador de regime.' })
  }
  if (guiasAtr._count) alertas.unshift({ nivel: 'critico', texto: `${guiasAtr._count} guia(s) pendente(s) vencida(s), total ${brl(guiasAtr._sum.valorTotal ?? 0)}.` })
  if (receberVenc._count) alertas.push({ nivel: 'atencao', texto: `${receberVenc._count} conta(s) a receber vencida(s), total ${brl(receberVenc._sum.valor ?? 0)}.` })
  if (pagarVenc._count) alertas.push({ nivel: 'atencao', texto: `${pagarVenc._count} conta(s) a pagar vencida(s), total ${brl(pagarVenc._sum.valor ?? 0)}.` })
  if (extratoPend) alertas.push({ nivel: 'info', texto: `${extratoPend} lançamento(s) de extrato aguardando conciliação.` })
  const ord = { critico: 0, atencao: 1, info: 2 }
  alertas.sort((a, b) => ord[a.nivel] - ord[b.nivel])

  const mesAtual = serie[serie.length - 1]
  const nomes = new Map(empresas.map((e) => [e.id, e.razaoSocial]))
  res.json({
    competencia: comp, empresasAtivas: empresas.length, simulacao: true, versaoTabelas: t.versao,
    indicadores: {
      receitaMes: r2(mesAtual.receita), despesasMes: r2(mesAtual.despesas), resultadoMes: r2(mesAtual.receita - mesAtual.despesas),
      aReceber: { total: r2(receber._sum.valor ?? 0), quantidade: receber._count, vencido: r2(receberVenc._sum.valor ?? 0), vencidoQuantidade: receberVenc._count },
      aPagar: { total: r2(pagar._sum.valor ?? 0), quantidade: pagar._count, vencido: r2(pagarVenc._sum.valor ?? 0), vencidoQuantidade: pagarVenc._count },
      guiasPendentes: { total: r2(guiasPend._sum.valorTotal ?? 0), quantidade: guiasPend._count, atrasadas: guiasAtr._count },
      extratoPendente: extratoPend, notasMes: { quantidade: notasMes._count, valor: r2(notasMes._sum.valorTotal ?? 0) }, cobrancas30d: cobrancasMes,
    },
    serie: serie.map((s) => ({ ...s, receita: r2(s.receita), despesas: r2(s.despesas) })),
    proximosVencimentos: guiasProx.map((g) => ({ id: g.id, empresaId: g.empresaId, empresa: nomes.get(g.empresaId) ?? '', tributo: g.tributo, competencia: g.competencia, vencimento: iso10(g.vencimento), valor: g.valorTotal, dias: Math.round((g.vencimento.getTime() - hoje.getTime()) / 86_400_000) })),
    empresas: porEmpresa, alertas,
  })
  void somaMeses
}))

export default router
