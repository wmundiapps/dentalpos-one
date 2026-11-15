import { prisma } from './db'
import type { CtbCtx } from './rbac'

/** Segredos e dados sensíveis nunca vão para a trilha. */
const SENSIVEL = /(senha|password|token|secret|certificad|xml|conteudo)/i
function limpar(v: any, prof = 0): any {
  if (v == null || prof > 4) return v
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => limpar(x, prof + 1))
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SENSIVEL.test(k) ? '[omitido]' : limpar(x, prof + 1)]))
  if (typeof v === 'string' && v.length > 300) return v.slice(0, 300) + '…'
  return v
}

/** Registra ação sensível (emitir/cancelar nota, gerar/pagar guia, conciliar, lançar...). Nunca derruba a operação. */
export async function auditar(ctx: Pick<CtbCtx, 'tenantId' | 'userId' | 'papel'>, acao: string, o: { entidade?: string; entidadeId?: string; empresaId?: string; detalhes?: unknown } = {}) {
  try {
    await prisma.ctbAuditoria.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId, papel: ctx.papel, acao, entidade: o.entidade, entidadeId: o.entidadeId, empresaId: o.empresaId, detalhes: limpar(o.detalhes) as any } })
  } catch (e) { console.error('[contabil-auditoria]', e) }
}
