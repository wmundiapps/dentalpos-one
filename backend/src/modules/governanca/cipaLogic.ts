// Regras puras de CIPA / SST.

export function pontuacaoRisco(gravidade: number, probabilidade: number) {
  const g = Math.min(5, Math.max(1, Math.round(gravidade)))
  const p = Math.min(5, Math.max(1, Math.round(probabilidade)))
  const pontuacao = g * p
  const nivel = pontuacao <= 4 ? 'BAIXO' : pontuacao <= 9 ? 'MEDIO' : pontuacao <= 16 ? 'ALTO' : 'CRITICO'
  return { pontuacao, nivel }
}

const DAY = 86_400_000
export function proximoDiaUtil(d: Date): Date {
  const r = new Date(d.getTime() + DAY)
  while (r.getUTCDay() === 0 || r.getUTCDay() === 6) r.setTime(r.getTime() + DAY)
  return r
}

// CAT: obrigatória para acidente típico/trajeto/doença ocupacional de EMPREGADO (mesmo sem
// afastamento); INCIDENTE (sem lesão) não gera CAT. Prazo: até o 1º dia útil seguinte; em caso de morte, imediato.
export function prazoCat(p: { data: Date; vinculo: string; tipo: string; gravidade: string }) {
  const obrigatoria = p.vinculo === 'EMPREGADO' && p.tipo !== 'INCIDENTE'
  if (!obrigatoria) return { obrigatoria: false, prazo: null as Date | null }
  return { obrigatoria: true, prazo: p.gravidade === 'FATAL' ? p.data : proximoDiaUtil(p.data) }
}

export const competencia = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

export function fimGestao(inicio: Date): Date {
  const f = new Date(inicio)
  f.setUTCFullYear(f.getUTCFullYear() + 1)
  f.setUTCDate(f.getUTCDate() - 1)
  return f
}

// Competências (YYYY-MM) da gestão até `now` sem reunião ordinária realizada.
export function reunioesMensaisFaltantes(inicio: Date, fim: Date, realizadas: string[], now = new Date()): string[] {
  const feitas = new Set(realizadas)
  const out: string[] = []
  const cur = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1))
  const limite = now < fim ? now : fim
  while (cur <= limite) {
    const c = competencia(cur)
    const fimMes = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0, 23, 59, 59))
    // só cobra após fechar o mês
    if (fimMes < now && !feitas.has(c)) out.push(c)
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

// NR-5: representação paritária de titulares; presidente indicado pelo empregador e
// vice-presidente eleito pelos empregados.
export function validarComposicaoCipa(membros: Array<{ representacao: string; tipo: string; cargo: string; ativo?: boolean }>) {
  const at = membros.filter((m) => m.ativo !== false)
  const titEmpregador = at.filter((m) => m.tipo === 'TITULAR' && m.representacao === 'EMPREGADOR').length
  const titEmpregados = at.filter((m) => m.tipo === 'TITULAR' && m.representacao === 'EMPREGADOS').length
  const problemas: string[] = []
  if (titEmpregador === 0 || titEmpregados === 0) problemas.push('É necessário ao menos um titular de cada representação (empregador e empregados).')
  if (titEmpregador !== titEmpregados) problemas.push(`Representação não paritária entre titulares (empregador ${titEmpregador} x empregados ${titEmpregados}).`)
  if (!at.some((m) => m.cargo === 'PRESIDENTE' && m.representacao === 'EMPREGADOR')) problemas.push('Presidente (indicado pelo empregador) não designado.')
  if (!at.some((m) => m.cargo === 'VICE_PRESIDENTE' && m.representacao === 'EMPREGADOS')) problemas.push('Vice-presidente (eleito pelos empregados) não designado.')
  return { conforme: problemas.length === 0, titEmpregador, titEmpregados, problemas }
}
