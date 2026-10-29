// Lógica PURA da avaliação global do aluno (consolidado) e utilitários de ranking. Estimativas internas de apoio à orientação — não são notas oficiais.

export interface EntradaGlobal {
  mediasFinais: number[]            // 0-10
  frequenciaPct: number | null      // 0-100
  atividadesConcluidasPct: number | null   // 0-100 (programas de desenvolvimento)
  parcelasVencidas: number
  maiorAtrasoDias: number
  ocorrencias: Array<{ gravidade: string }>   // últimos 12 meses
  horasPesquisaExtensao: number
  horasComplementares: number
  projetosAtivos: number
  scoreAnterior?: number | null
}
export interface Pesos { academico: number; frequencia: number; engajamento: number; financeiro: number }
export const PESOS_PADRAO: Pesos = { academico: 0.4, frequencia: 0.2, engajamento: 0.15, financeiro: 0.15 }

export interface ResultadoGlobal {
  notaAcademica: number | null; frequenciaPct: number | null; engajamento: number | null; financeiroScore: number; ocorrencias: number
  bonus: number; penalidade: number; scoreGlobal: number; faixa: 'OTIMO' | 'BOM' | 'ATENCAO' | 'RISCO'
  componentes: Record<string, { valor: number | null; peso: number; contribuicao: number }>
  alertas: Array<{ codigo: string; nivel: 'INFO' | 'ATENCAO' | 'CRITICO'; texto: string; sugestao: string }>
}

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v))
const r1 = (v: number) => Math.round(v * 10) / 10

export function faixaDoScore(s: number): ResultadoGlobal['faixa'] { return s >= 80 ? 'OTIMO' : s >= 65 ? 'BOM' : s >= 50 ? 'ATENCAO' : 'RISCO' }
export function scoreFinanceiro(vencidas: number, maiorAtrasoDias: number): number { return vencidas <= 0 ? 100 : clamp(100 - 20 * vencidas - Math.min(30, maiorAtrasoDias / 3)) }
export const PENALIDADE_OCORRENCIA: Record<string, number> = { LEVE: 2, MEDIA: 5, GRAVE: 10, GRAVISSIMA: 20 }

export function calcularGlobal(e: EntradaGlobal, pesos: Pesos = PESOS_PADRAO): ResultadoGlobal {
  const nota = e.mediasFinais.length ? r1(e.mediasFinais.reduce((a, b) => a + b, 0) / e.mediasFinais.length) : null
  const freq = e.frequenciaPct === null ? null : r1(clamp(e.frequenciaPct))
  const eng = e.frequenciaPct === null && e.atividadesConcluidasPct === null ? null : r1(e.atividadesConcluidasPct === null ? clamp(e.frequenciaPct ?? 0) : e.frequenciaPct === null ? clamp(e.atividadesConcluidasPct) : clamp(0.6 * e.frequenciaPct + 0.4 * e.atividadesConcluidasPct))
  const fin = r1(scoreFinanceiro(e.parcelasVencidas, e.maiorAtrasoDias))
  const comp: ResultadoGlobal['componentes'] = {}
  const partes: Array<[string, number | null, number]> = [['academico', nota === null ? null : nota * 10, pesos.academico], ['frequencia', freq, pesos.frequencia], ['engajamento', eng, pesos.engajamento], ['financeiro', fin, pesos.financeiro]]
  const somaPesos = partes.filter(([, v]) => v !== null).reduce((s, [, , p]) => s + p, 0) || 1
  let base = 0
  for (const [k, v, p] of partes) {
    const pe = v === null ? 0 : p / somaPesos     // redistribui o peso quando o componente não tem dado
    const contrib = v === null ? 0 : v * pe
    base += contrib
    comp[k] = { valor: v === null ? null : r1(v), peso: r1(pe * 100) / 100, contribuicao: r1(contrib) }
  }
  const penal = Math.min(40, e.ocorrencias.reduce((s, o) => s + (PENALIDADE_OCORRENCIA[o.gravidade] ?? 3), 0))
  const bonus = Math.min(10, e.horasPesquisaExtensao / 10 + e.projetosAtivos * 2 + Math.min(3, e.horasComplementares / 40))
  const score = r1(clamp(base - penal + bonus))
  const alertas: ResultadoGlobal['alertas'] = []
  if (nota !== null && nota < 6) alertas.push({ codigo: 'MEDIA_BAIXA', nivel: nota < 5 ? 'CRITICO' : 'ATENCAO', texto: `Média das disciplinas em ${nota.toFixed(1)}.`, sugestao: 'Encaminhar para monitoria/nivelamento e acompanhamento pedagógico.' })
  if (freq !== null && freq < 75) alertas.push({ codigo: 'FREQUENCIA_BAIXA', nivel: freq < 60 ? 'CRITICO' : 'ATENCAO', texto: `Frequência em ${freq.toFixed(0)}% (mínimo regulamentar 75%).`, sugestao: 'Contato ativo com o aluno para identificar barreiras de presença.' })
  if (e.parcelasVencidas > 0) alertas.push({ codigo: 'FINANCEIRO', nivel: e.parcelasVencidas >= 3 ? 'CRITICO' : 'ATENCAO', texto: `${e.parcelasVencidas} parcela(s) vencida(s).`, sugestao: 'Encaminhar ao financeiro para renegociação e verificar elegibilidade a bolsa/auxílio.' })
  const graves = e.ocorrencias.filter((o) => ['GRAVE', 'GRAVISSIMA'].includes(o.gravidade)).length
  if (graves) alertas.push({ codigo: 'OCORRENCIA_GRAVE', nivel: 'CRITICO', texto: `${graves} ocorrência(s) grave(s) nos últimos 12 meses.`, sugestao: 'Atendimento da coordenação/apoio com sigilo e registro formal.' })
  else if (e.ocorrencias.length >= 3) alertas.push({ codigo: 'OCORRENCIAS_RECORRENTES', nivel: 'ATENCAO', texto: `${e.ocorrencias.length} ocorrências registradas nos últimos 12 meses.`, sugestao: 'Conversa de orientação e plano de ação.' })
  if (e.scoreAnterior !== null && e.scoreAnterior !== undefined && e.scoreAnterior - score >= 10) alertas.push({ codigo: 'QUEDA', nivel: 'ATENCAO', texto: `Queda de ${r1(e.scoreAnterior - score)} pontos em relação ao período anterior.`, sugestao: 'Entender o que mudou e revisar o plano individual.' })
  if (eng !== null && eng < 50) alertas.push({ codigo: 'BAIXO_ENGAJAMENTO', nivel: 'ATENCAO', texto: 'Engajamento abaixo de 50%.', sugestao: 'Convidar para mentoria e programas de desenvolvimento.' })
  return { notaAcademica: nota, frequenciaPct: freq, engajamento: eng, financeiroScore: fin, ocorrencias: e.ocorrencias.length, bonus: r1(bonus), penalidade: r1(penal), scoreGlobal: score, faixa: faixaDoScore(score), componentes: comp, alertas }
}

/** Prioridade sugerida da orientação a partir dos alertas. */
export function prioridadeDosAlertas(alertas: ResultadoGlobal['alertas']): 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE' {
  const crit = alertas.filter((a) => a.nivel === 'CRITICO').length
  return crit >= 2 ? 'URGENTE' : crit === 1 ? 'ALTA' : alertas.length ? 'MEDIA' : 'BAIXA'
}

/** Ranking com empates (1,1,3). Só entram quem consentiu (filtrado antes). */
export function rankear<T extends { valor: number }>(itens: T[]): Array<T & { posicao: number }> {
  const ord = itens.slice().sort((a, b) => b.valor - a.valor)
  let pos = 0, ult = Number.NaN, k = 0
  return ord.map((i) => { k++; if (i.valor !== ult) { pos = k; ult = i.valor } return { ...i, posicao: pos } })
}

export const COMPETENCIAS_PADRAO = [
  { codigo: 'AUTOCONHECIMENTO', nome: 'Autoconhecimento', dominio: 'AUTOCONHECIMENTO', descricao: 'Reconhecer emoções, forças e limites.' },
  { codigo: 'AUTORREGULACAO', nome: 'Autorregulação emocional', dominio: 'AUTORREGULACAO', descricao: 'Lidar com estresse, frustração e prazos.' },
  { codigo: 'EMPATIA', nome: 'Empatia e consciência social', dominio: 'CONSCIENCIA_SOCIAL', descricao: 'Compreender o outro e o contexto social.' },
  { codigo: 'TRABALHO_EQUIPE', nome: 'Trabalho em equipe', dominio: 'RELACIONAMENTO', descricao: 'Cooperar, negociar e dividir responsabilidades.' },
  { codigo: 'DECISAO', nome: 'Tomada de decisão responsável', dominio: 'TOMADA_DECISAO', descricao: 'Decidir com ética e base em evidências.' },
  { codigo: 'COMUNICACAO', nome: 'Comunicação', dominio: 'COMUNICACAO', descricao: 'Expressão oral e escrita, escuta ativa.' },
  { codigo: 'LIDERANCA', nome: 'Liderança', dominio: 'LIDERANCA', descricao: 'Inspirar e organizar pessoas em torno de objetivos.' },
  { codigo: 'PENSAMENTO_CRITICO', nome: 'Pensamento crítico', dominio: 'PENSAMENTO_CRITICO', descricao: 'Analisar informações e argumentar.' },
]
