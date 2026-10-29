// Estrutura comum dos painéis executivos (consumida pela tela genérica e pela exportação CSV).

export interface Kpi { chave: string; rotulo: string; valor: number | string | null; unidade?: 'R$' | '%' | 'n' | 'dias' | 'nota'; alerta?: 'VERDE' | 'AMARELO' | 'VERMELHO'; dica?: string }
export interface Serie { chave: string; titulo: string; tipo: 'barra' | 'linha' | 'pizza'; unidade?: 'R$' | '%' | 'n'; rotulos: string[]; dados: Array<{ nome: string; valores: Array<number | null> }> }
export interface Coluna { key: string; label: string; tipo?: 'texto' | 'numero' | 'moeda' | 'pct' | 'data' }
export interface Tabela { chave: string; titulo: string; colunas: Coluna[]; linhas: Array<Record<string, any>> }
export interface Painel { id: string; titulo: string; descricao: string; geradoEm: string; periodo?: { de: string; ate: string }; kpis: Kpi[]; series: Serie[]; tabelas: Tabela[]; avisos: string[] }

export const painelVazio = (id: string, titulo: string, descricao: string, now = new Date()): Painel => ({ id, titulo, descricao, geradoEm: now.toISOString(), kpis: [], series: [], tabelas: [], avisos: [] })

export const serie1 = (chave: string, titulo: string, tipo: Serie['tipo'], pontos: Array<{ rotulo: string; valor: number }>, unidade?: Serie['unidade'], nome = titulo): Serie => ({ chave, titulo, tipo, unidade, rotulos: pontos.map((p) => p.rotulo), dados: [{ nome, valores: pontos.map((p) => p.valor) }] })

export const semaforoPct = (v: number | null, bom: number, ruim: number, menorMelhor = true): Kpi['alerta'] => {
  if (v == null) return undefined
  if (menorMelhor) return v <= bom ? 'VERDE' : v >= ruim ? 'VERMELHO' : 'AMARELO'
  return v >= bom ? 'VERDE' : v <= ruim ? 'VERMELHO' : 'AMARELO'
}

/** Últimos N meses (AAAA-MM) terminando no mês de `ate`. */
export function ultimosMeses(n: number, ate: Date): string[] {
  const out: string[] = []
  const base = new Date(Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), 1))
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  return out
}
