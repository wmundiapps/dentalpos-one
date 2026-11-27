import { calcularIndicadores } from './indicators'
import { Indicador, Perfil, alertas, resumoSemaforos } from './logic'
import { resumoOkr } from './okr'
import { panoramaPendencias } from './mesa'

export interface PainelOpts { tenantId: string; perfil: Perfil; programId?: string; userId?: string; now?: Date }

export function agruparPorCategoria(inds: Indicador[]) {
  const m = new Map<string, Indicador[]>()
  for (const i of inds) m.set(i.categoria, [...(m.get(i.categoria) ?? []), i])
  return [...m.entries()].map(([categoria, indicadores]) => ({ categoria, ...resumoSemaforos(indicadores), indicadores }))
}

// Painel consolidado: indicadores do perfil + (reitoria) OKRs e pendências vencidas.
// Falhas parciais viram `erro` no indicador; o painel sempre responde.
export async function montarPainel(o: PainelOpts) {
  const inds = await calcularIndicadores(o)
  const out: Record<string, unknown> = {
    perfil: o.perfil,
    geradoEm: (o.now ?? new Date()).toISOString(),
    escopo: { programId: o.programId ?? null, minhasTurmas: o.perfil === 'professor' && !!o.userId },
    resumo: resumoSemaforos(inds),
    alertas: alertas(inds),
    indicadoresComErro: inds.filter((i) => i.erro).map((i) => ({ chave: i.chave, erro: i.erro })),
    categorias: agruparPorCategoria(inds),
    indicadores: inds,
  }
  if (o.perfil === 'reitoria' && !o.programId) {
    const [okr, pend] = await Promise.all([resumoOkr(o.tenantId).catch(() => null), panoramaPendencias(o.tenantId).catch(() => null)])
    out.okr = okr
    out.pendencias = pend
  }
  return out
}
