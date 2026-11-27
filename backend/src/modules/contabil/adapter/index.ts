import type { ContabilAdapter } from './tipos'
export * from './tipos'

let atual: ContabilAdapter | null = null
export function definirAdapter(a: ContabilAdapter) { atual = a }
export function adapter(): ContabilAdapter {
  if (!atual) throw new Error('[contabil] nenhum adapter registrado. Chame definirAdapter() antes de montar as rotas (ver README.md).')
  return atual
}
