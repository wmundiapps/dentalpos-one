import { prisma } from '../../../lib/prisma'
import { fiscalLocal, registrarFiscalProvider, type FiscalProvider, type GuiaCarteira } from './provedores'

// ============================================================
// Integração com o módulo fiscal do escritório (modules/contabil: CtbEmpresa e CtbGuia). Este é o ÚNICO arquivo da Carteira que lê
// as tabelas do módulo fiscal — o bloco continua funcionando sem ele (camada local). Registrado em edu.routes.ts.
//  - Cliente com CtbCliente.empresaId => guias vêm de CtbGuia (guias SIMULADAS do módulo fiscal).
//  - Cliente sem vínculo            => guias lançadas na própria Carteira (CtbCarGuia).
// ============================================================
const STATUS: Record<string, GuiaCarteira['status']> = { PENDENTE: 'ABERTA', PAGA: 'PAGA', CANCELADA: 'CANCELADA' }

export const fiscalDoEscritorio: FiscalProvider = {
  nome: 'MODULO_FISCAL',
  simulado: false,
  async guias(tenantId, clientes, opts) {
    const locais = await fiscalLocal.guias(tenantId, clientes.filter((c) => !c.empresaId), opts)
    const vinculados = clientes.filter((c) => c.empresaId)
    if (!vinculados.length) return locais
    const porEmpresa = new Map(vinculados.map((c) => [c.empresaId!, c.id]))
    const rows = await prisma.ctbGuia.findMany({
      where: {
        tenantId, empresaId: { in: [...porEmpresa.keys()] },
        status: opts?.status === 'ABERTA' ? 'PENDENTE' : opts?.status === 'PAGA' ? 'PAGA' : { not: 'CANCELADA' },
        ...(opts?.ateVencimento ? { vencimento: { lte: opts.ateVencimento } } : {}),
      },
      orderBy: { vencimento: 'asc' }, take: 5000,
    })
    const fiscais: GuiaCarteira[] = rows.map((g) => ({
      id: g.id, clienteId: porEmpresa.get(g.empresaId)!, tipo: g.tributo, competencia: g.competencia, vencimento: g.vencimento, valor: g.valorTotal, status: STATUS[g.status] ?? 'ABERTA', codigo: g.linhaDigitavel, origem: 'FISCAL',
    }))
    return [...locais, ...fiscais].sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
  },
  /** Pendências do módulo fiscal por cliente: guias vencidas que ainda não foram pagas serão apontadas pela própria saúde; aqui entra o que o fiscal sabe a mais (empresa inativa). */
  async pendenciasFiscais(tenantId, clientes) {
    const vinc = clientes.filter((c) => c.empresaId)
    if (!vinc.length) return {}
    const emp = await prisma.ctbEmpresa.findMany({ where: { tenantId, id: { in: vinc.map((c) => c.empresaId!) } }, select: { id: true, ativo: true, regimeAtual: true, cnae: true } })
    const out: Record<string, { total: number; itens: string[] }> = {}
    for (const c of vinc) {
      const e = emp.find((x) => x.id === c.empresaId)
      const itens: string[] = []
      if (!e) itens.push('Empresa vinculada não existe mais no módulo fiscal')
      else { if (!e.ativo) itens.push('Empresa inativa no módulo fiscal'); if (!e.cnae) itens.push('CNAE não informado no módulo fiscal') }
      if (itens.length) out[c.id] = { total: itens.length, itens }
    }
    return out
  },
  async localizarEmpresa(tenantId, documento) {
    const e = await prisma.ctbEmpresa.findFirst({ where: { tenantId, documento }, select: { id: true, razaoSocial: true, regimeAtual: true } })
    return e ? { id: e.id, nome: e.razaoSocial, regime: e.regimeAtual } : null
  },
  async empresaExiste(tenantId, id) { return !!(await prisma.ctbEmpresa.findFirst({ where: { tenantId, id }, select: { id: true } })) },
}

export const registrarIntegracaoFiscal = () => registrarFiscalProvider(fiscalDoEscritorio)
