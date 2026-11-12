// Funções puras do planejamento de infraestrutura (sem acesso a banco): alçadas, cotações, transições, alertas e agregações.
export const TIPOS = ['REFORMA', 'EXPANSAO', 'REPOSICAO', 'PINTURA', 'PLOTAGEM', 'EQUIPAMENTO', 'MATERIAL'] as const
export const STATUS = ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO', 'CONVERTIDO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO'] as const
export const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const
export const ORIGENS = ['MANUAL', 'CHECKLIST', 'MANUTENCAO', 'IA'] as const
export type Tipo = (typeof TIPOS)[number]

export const TIPO_ROTULO: Record<string, string> = {
  REFORMA: 'Reforma', EXPANSAO: 'Expansão', REPOSICAO: 'Reposição de materiais', PINTURA: 'Pintura',
  PLOTAGEM: 'Plotagem e sinalização', EQUIPAMENTO: 'Equipamento para curso', MATERIAL: 'Material para curso',
}

export const TRANSICOES: Record<string, string[]> = {
  RASCUNHO: ['AGUARDANDO_APROVACAO', 'CANCELADO'],
  AGUARDANDO_APROVACAO: ['APROVADO', 'REPROVADO', 'RASCUNHO', 'CANCELADO'],
  APROVADO: ['CONVERTIDO', 'AGUARDANDO_APROVACAO', 'CANCELADO'],
  REPROVADO: ['RASCUNHO', 'CANCELADO'],
  CONVERTIDO: ['EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO'],
  EM_EXECUCAO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
}
export const podeTransitar = (de: string, para: string) => (TRANSICOES[de] ?? []).includes(para)
/** Planos que ainda consomem orçamento planejado (não cancelados nem reprovados). */
export const ATIVOS = ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'CONVERTIDO', 'EM_EXECUCAO', 'CONCLUIDO']
export const ENCERRADOS = ['CONCLUIDO', 'CANCELADO', 'REPROVADO']
/** Planos que "cobrem" uma lacuna do checklist (há iniciativa em andamento ou concluída). */
export const COBREM_LACUNA = ['AGUARDANDO_APROVACAO', 'APROVADO', 'CONVERTIDO', 'EM_EXECUCAO', 'CONCLUIDO']

export interface Alcada { nivel: number; papel: string; rotulo?: string; valorMinimo: number }
export const ALCADAS_PADRAO: Alcada[] = [
  { nivel: 1, papel: 'COORDINATOR', rotulo: 'Coordenação', valorMinimo: 0 },
  { nivel: 2, papel: 'BOARD', rotulo: 'Diretoria', valorMinimo: 15000 },
  { nivel: 3, papel: 'RECTOR', rotulo: 'Reitoria', valorMinimo: 80000 },
]

/** Valida alçadas configuradas: níveis 1..n sequenciais, valores mínimos crescentes, o nível 1 começa em 0. */
export function validarAlcadas(a: Alcada[]): string | null {
  if (!Array.isArray(a) || a.length === 0) return 'Informe ao menos uma alçada.'
  const ord = [...a].sort((x, y) => x.nivel - y.nivel)
  for (let i = 0; i < ord.length; i++) {
    if (ord[i].nivel !== i + 1) return 'Os níveis das alçadas devem ser sequenciais a partir de 1.'
    if (i > 0 && ord[i].valorMinimo < ord[i - 1].valorMinimo) return 'O valor mínimo deve crescer a cada nível.'
  }
  if (ord[0].valorMinimo !== 0) return 'A primeira alçada deve começar em R$ 0.'
  return null
}

/** Alçadas exigidas para o valor: todas as de valorMinimo <= valor (sempre ao menos o nível 1). */
export function alcadasExigidas(valor: number, alcadas: Alcada[]): Alcada[] {
  const ord = [...alcadas].sort((a, b) => a.nivel - b.nivel)
  const req = ord.filter((a) => valor >= a.valorMinimo)
  return req.length ? req : ord.slice(0, 1)
}

export interface CotacaoMin { valor: number; escolhida?: boolean; fornecedorId?: string | null; fornecedorNome?: string }
export interface ExigenciaCotacao { exige: boolean; minimo: number; distintas: number; faltam: number; atende: boolean; menor: number | null; escolhida: CotacaoMin | null; economiaVsEstimado: number | null }

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const DAY = 86_400_000
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Exigência de cotações: acima do limite configurável são necessárias `minimo` cotações de fornecedores distintos. */
export function exigenciaCotacao(orcamento: number, cotacoes: CotacaoMin[], limite: number, minimo: number): ExigenciaCotacao {
  const exige = orcamento > limite
  const distintas = new Set(cotacoes.map((c) => (c.fornecedorId || c.fornecedorNome || '').toString().trim().toLowerCase()).filter(Boolean)).size
  const faltam = exige ? Math.max(0, minimo - distintas) : 0
  const menor = cotacoes.length ? Math.min(...cotacoes.map((c) => c.valor)) : null
  const escolhida = cotacoes.find((c) => c.escolhida) ?? null
  return { exige, minimo: exige ? minimo : 0, distintas, faltam, atende: faltam === 0, menor, escolhida, economiaVsEstimado: escolhida ? round2(orcamento - escolhida.valor) : null }
}

export interface PlanoAlertaIn {
  status: string; fimPrevisto?: Date | null; inicioPrevisto?: Date | null; orcamentoEstimado: number; executado: number
  marcos?: Array<{ titulo: string; data: Date; concluidoEm?: Date | null }>
}
export interface Alerta { tipo: 'PRAZO_VENCIDO' | 'PRAZO_PROXIMO' | 'MARCO_ATRASADO' | 'MARCO_PROXIMO' | 'ORCAMENTO_ESTOURADO' | 'ORCAMENTO_PROXIMO' | 'INICIO_ATRASADO'; severidade: 'INFO' | 'ATENCAO' | 'CRITICO'; mensagem: string }

/** Alertas de prazo e orçamento de um plano (só para planos não encerrados). */
export function alertasDoPlano(p: PlanoAlertaIn, agora: Date, prazoDias: number, orcPct: number): Alerta[] {
  const out: Alerta[] = []
  if (ENCERRADOS.includes(p.status)) return out
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  const limite = new Date(agora.getTime() + prazoDias * DAY)
  if (p.fimPrevisto) {
    if (p.fimPrevisto < agora) out.push({ tipo: 'PRAZO_VENCIDO', severidade: 'CRITICO', mensagem: `Prazo final venceu em ${fmt(p.fimPrevisto)}.` })
    else if (p.fimPrevisto <= limite) out.push({ tipo: 'PRAZO_PROXIMO', severidade: 'ATENCAO', mensagem: `Prazo final em ${fmt(p.fimPrevisto)} (${Math.ceil((p.fimPrevisto.getTime() - agora.getTime()) / DAY)} dia(s)).` })
  }
  if (p.inicioPrevisto && p.inicioPrevisto < agora && ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO'].includes(p.status)) out.push({ tipo: 'INICIO_ATRASADO', severidade: 'ATENCAO', mensagem: `Início previsto em ${fmt(p.inicioPrevisto)} já passou e o plano ainda não foi convertido.` })
  for (const m of p.marcos ?? []) {
    if (m.concluidoEm) continue
    if (m.data < agora) out.push({ tipo: 'MARCO_ATRASADO', severidade: 'CRITICO', mensagem: `Marco "${m.titulo}" atrasado (${fmt(m.data)}).` })
    else if (m.data <= limite) out.push({ tipo: 'MARCO_PROXIMO', severidade: 'INFO', mensagem: `Marco "${m.titulo}" em ${fmt(m.data)}.` })
  }
  if (p.orcamentoEstimado > 0) {
    const pct = (p.executado / p.orcamentoEstimado) * 100
    if (p.executado > p.orcamentoEstimado) out.push({ tipo: 'ORCAMENTO_ESTOURADO', severidade: 'CRITICO', mensagem: `Executado (${brl(p.executado)}) acima do orçamento (${brl(p.orcamentoEstimado)}).` })
    else if (p.executado > 0 && pct >= orcPct) out.push({ tipo: 'ORCAMENTO_PROXIMO', severidade: 'ATENCAO', mensagem: `${round2(pct)}% do orçamento já executado.` })
  }
  return out
}

export interface LinhaOrc { ano: number; programId: string | null; tipo: string; status: string; orcamentoEstimado: number; executado: number }
export interface Agregado { chave: string; planejado: number; aprovado: number; executado: number; saldo: number; consumoPct: number | null; qtd: number; estouro: boolean }

const APROVADOS = ['APROVADO', 'CONVERTIDO', 'EM_EXECUCAO', 'CONCLUIDO']
/** Agrega planejado (todos os ativos), aprovado (a partir da aprovação) e executado por uma chave. */
export function agregarOrcamento(linhas: LinhaOrc[], chaveDe: (l: LinhaOrc) => string): Agregado[] {
  const m = new Map<string, Agregado>()
  for (const l of linhas) {
    if (!ATIVOS.includes(l.status)) continue
    const k = chaveDe(l)
    const a = m.get(k) ?? { chave: k, planejado: 0, aprovado: 0, executado: 0, saldo: 0, consumoPct: null, qtd: 0, estouro: false }
    a.planejado += l.orcamentoEstimado
    if (APROVADOS.includes(l.status)) a.aprovado += l.orcamentoEstimado
    a.executado += l.executado
    a.qtd++
    m.set(k, a)
  }
  return [...m.values()]
    .map((a) => ({ ...a, planejado: round2(a.planejado), aprovado: round2(a.aprovado), executado: round2(a.executado), saldo: round2(a.aprovado - a.executado), consumoPct: a.aprovado > 0 ? round2((a.executado / a.aprovado) * 100) : null, estouro: a.aprovado > 0 && a.executado > a.aprovado }))
    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'))
}

/** Posição (em %) de uma barra de Gantt dentro da janela [de, ate]. */
export function barraGantt(inicio: Date, fim: Date, de: Date, ate: Date) {
  const total = Math.max(1, ate.getTime() - de.getTime())
  const l = Math.min(100, Math.max(0, ((inicio.getTime() - de.getTime()) / total) * 100))
  const r = Math.min(100, Math.max(0, ((fim.getTime() - de.getTime()) / total) * 100))
  return { esquerdaPct: round2(l), larguraPct: round2(Math.max(1, r - l)) }
}

export const DESTINO_PADRAO: Record<string, 'REQUISICAO' | 'OS' | 'PROJETO'> = {
  REFORMA: 'OS', PINTURA: 'OS', EXPANSAO: 'PROJETO', REPOSICAO: 'REQUISICAO', PLOTAGEM: 'REQUISICAO', EQUIPAMENTO: 'REQUISICAO', MATERIAL: 'REQUISICAO',
}

/** Total dos itens detalhados (quantidade x preço) ou null se não houver itens com preço. */
export function totalItens(itens: Array<{ quantidade?: number; precoEstimado?: number | null }> | null | undefined): number | null {
  if (!itens || !itens.length) return null
  let t = 0, any = false
  for (const i of itens) if (i.precoEstimado != null) { t += (i.quantidade ?? 1) * i.precoEstimado; any = true }
  return any ? round2(t) : null
}

export const PRIORIDADE_PESO: Record<string, number> = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 }
