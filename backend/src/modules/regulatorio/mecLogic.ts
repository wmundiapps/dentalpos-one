// Regras PURAS da "Comissão de avaliação do MEC" (sem acesso a banco) — testáveis em __selftest__.
// Parâmetros (pesos, prazos de referência, cortes) são padrões de acompanhamento interno: CONFERIR com o
// instrumento INEP e a norma vigentes. Simulações não têm valor oficial.
import { simularCC, DISCLAIMER_SIMULACAO } from './rules'

export const MEC_TIPOS = ['AUTORIZACAO_CURSO', 'RECONHECIMENTO_CURSO', 'RENOVACAO_RECONHECIMENTO', 'CREDENCIAMENTO', 'RECREDENCIAMENTO'] as const
export const TIPO_NOME: Record<string, string> = {
  AUTORIZACAO_CURSO: 'Autorização de curso',
  RECONHECIMENTO_CURSO: 'Reconhecimento de curso',
  RENOVACAO_RECONHECIMENTO: 'Renovação de reconhecimento',
  CREDENCIAMENTO: 'Credenciamento institucional',
  RECREDENCIAMENTO: 'Recredenciamento institucional',
}

export const DIM_ORG = 'ORGANIZACAO_DIDATICO_PEDAGOGICA'
export const DIM_DOC = 'CORPO_DOCENTE_TUTORIAL'
export const DIM_INF = 'INFRAESTRUTURA'
export const DIMS_MEC = [DIM_ORG, DIM_DOC, DIM_INF] as const
export const DIM_NOME: Record<string, string> = {
  [DIM_ORG]: 'Organização didático-pedagógica',
  [DIM_DOC]: 'Corpo docente e tutorial',
  [DIM_INF]: 'Infraestrutura',
}

// Pesos das três dimensões do instrumento de avaliação in loco (padrão de acompanhamento: 40/30/30).
export const PESOS_DIMENSOES = { organizacaoDidatico: 0.4, corpoDocente: 0.3, infraestrutura: 0.3 } as const
const CHAVE_DIM: Record<string, keyof typeof PESOS_DIMENSOES> = { [DIM_ORG]: 'organizacaoDidatico', [DIM_DOC]: 'corpoDocente', [DIM_INF]: 'infraestrutura' }

export const FASES_MEC: Array<{ chave: string; nome: string; offsetDias: number }> = [
  { chave: 'PROTOCOLO', nome: 'Protocolo no e-MEC', offsetDias: 0 },
  { chave: 'ANALISE_DOCUMENTAL', nome: 'Análise documental (SERES)', offsetDias: 45 },
  { chave: 'DESIGNACAO_COMISSAO', nome: 'Designação da comissão avaliadora (INEP)', offsetDias: 90 },
  { chave: 'VISITA_IN_LOCO', nome: 'Visita in loco', offsetDias: 150 },
  { chave: 'RELATORIO', nome: 'Relatório da comissão', offsetDias: 180 },
  { chave: 'CONCEITO', nome: 'Conceito (CC/CI) e manifestação da IES', offsetDias: 210 },
  { chave: 'DESPACHO_PORTARIA', nome: 'Despacho e portaria (DOU)', offsetDias: 270 },
]
export const FASE_STATUS = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL'] as const

/** Fase atual = primeira que não está concluída/não aplicável. */
export function faseAtual(fases: Array<{ chave: string; nome: string; ordem: number; status: string }>) {
  const ord = [...fases].sort((a, b) => a.ordem - b.ordem)
  const abertas = ord.filter((f) => !['CONCLUIDA', 'NAO_APLICAVEL'].includes(f.status))
  return abertas.find((f) => f.status === 'EM_ANDAMENTO') ?? abertas[0] ?? null
}

export function progressoFases(fases: Array<{ status: string }>) {
  const aplicaveis = fases.filter((f) => f.status !== 'NAO_APLICAVEL')
  if (!aplicaveis.length) return 0
  return Math.round((aplicaveis.filter((f) => f.status === 'CONCLUIDA').length / aplicaveis.length) * 1000) / 10
}

/** Datas previstas e status inicial das fases a partir da etapa do processo e-MEC. */
export function fasesIniciais(base: Date, etapa: string, protocoladoEm?: Date | null) {
  const origem = protocoladoEm ?? base
  const concluidasAte: Record<string, number> = { PREPARACAO: -1, PROTOCOLADO: 0, EM_ANALISE: 1, DILIGENCIA: 1, AVALIACAO_IN_LOCO: 2, DECISAO: 4, PUBLICADO: 6, ARQUIVADO: -1 }
  const ate = concluidasAte[etapa] ?? -1
  return FASES_MEC.map((f, i) => ({
    chave: f.chave,
    nome: f.nome,
    ordem: i + 1,
    status: i <= ate ? 'CONCLUIDA' : i === ate + 1 && etapa !== 'ARQUIVADO' ? 'EM_ANDAMENTO' : 'PENDENTE',
    previstaEm: new Date(origem.getTime() + f.offsetDias * 86_400_000),
  }))
}

// ---------------- prazos e alertas ----------------
export type NivelPrazo = 'VENCIDO' | 'CRITICO' | 'ALTO' | 'ATENCAO' | 'NORMAL'
export const LIMITE_AVISO_DIAS = 15

export function diasAte(d: Date, agora = new Date()) {
  return Math.ceil((d.getTime() - agora.getTime()) / 86_400_000)
}

export function nivelPrazo(dias: number): NivelPrazo {
  if (dias < 0) return 'VENCIDO'
  if (dias <= 7) return 'CRITICO'
  if (dias <= 15) return 'ALTO'
  if (dias <= 30) return 'ATENCAO'
  return 'NORMAL'
}
export const ehCritico = (n: NivelPrazo) => n === 'VENCIDO' || n === 'CRITICO' || n === 'ALTO'
export const severidadeLembrete = (n: NivelPrazo): 'INFO' | 'ATENCAO' | 'CRITICO' => (n === 'VENCIDO' || n === 'CRITICO' ? 'CRITICO' : n === 'NORMAL' ? 'INFO' : 'ATENCAO')

export interface Prazo {
  origem: 'PROTOCOLO' | 'FASE' | 'VISITA' | 'EVIDENCIA' | 'DILIGENCIA' | 'DECISAO'
  titulo: string
  prazo: Date
  dias: number
  nivel: NivelPrazo
  refType: string
  refId: string
}

interface EntradaPrazos {
  processo: { id: string; etapa: string; prazoProtocolo?: Date | null; decisaoPrevistaEm?: Date | null }
  fases: Array<{ id: string; chave: string; nome: string; status: string; previstaEm?: Date | null }>
  visita?: { id: string; inicio: Date; status: string } | null
  evidencias: Array<{ id: string; indicadorCodigo: string; status: string; obrigatorio: boolean; prazo?: Date | null }>
  diligencias: Array<{ id: string; descricao: string; status: string; prazoResposta: Date }>
}

export function montarPrazos(e: EntradaPrazos, agora = new Date()): Prazo[] {
  const out: Prazo[] = []
  const add = (origem: Prazo['origem'], titulo: string, prazo: Date, refType: string, refId: string) => {
    const dias = diasAte(prazo, agora)
    out.push({ origem, titulo, prazo, dias, nivel: nivelPrazo(dias), refType, refId })
  }
  if (e.processo.etapa === 'PREPARACAO' && e.processo.prazoProtocolo) add('PROTOCOLO', 'Prazo para protocolar no e-MEC', e.processo.prazoProtocolo, 'RegProcesso', e.processo.id)
  for (const f of e.fases) if (!['CONCLUIDA', 'NAO_APLICAVEL'].includes(f.status) && f.previstaEm && f.chave !== 'VISITA_IN_LOCO') add('FASE', `Fase: ${f.nome}`, f.previstaEm, 'RegMecFase', f.id)
  if (e.visita && ['AGENDADA', 'EM_ANDAMENTO'].includes(e.visita.status)) add('VISITA', 'Visita in loco da comissão', e.visita.inicio, 'RegMecVisita', e.visita.id)
  for (const ev of e.evidencias) if (ev.obrigatorio && ev.prazo && !['ATENDIDO', 'NAO_APLICAVEL'].includes(ev.status)) add('EVIDENCIA', `Evidência ${ev.indicadorCodigo}`, ev.prazo, 'RegMecEvidencia', ev.id)
  for (const d of e.diligencias) if (['ABERTA', 'VENCIDA'].includes(d.status)) add('DILIGENCIA', `Diligência: ${d.descricao.slice(0, 80)}`, d.prazoResposta, 'RegDiligencia', d.id)
  if (e.processo.etapa === 'DECISAO' && e.processo.decisaoPrevistaEm) add('DECISAO', 'Decisão do MEC prevista', e.processo.decisaoPrevistaEm, 'RegProcesso', e.processo.id)
  return out.sort((a, b) => a.prazo.getTime() - b.prazo.getTime())
}

// ---------------- evidências ----------------
export function resumoEvidencias(evs: Array<{ status: string; obrigatorio: boolean; prazo?: Date | null; dimensao: string }>, agora = new Date()) {
  const aplic = evs.filter((e) => e.status !== 'NAO_APLICAVEL')
  const ok = aplic.filter((e) => e.status === 'ATENDIDO')
  const obrig = aplic.filter((e) => e.obrigatorio)
  const porDimensao: Record<string, { total: number; atendidas: number; percentual: number }> = {}
  for (const d of DIMS_MEC) {
    const l = aplic.filter((e) => e.dimensao === d)
    porDimensao[d] = { total: l.length, atendidas: l.filter((e) => e.status === 'ATENDIDO').length, percentual: l.length ? Math.round((l.filter((e) => e.status === 'ATENDIDO').length / l.length) * 1000) / 10 : 0 }
  }
  return {
    total: aplic.length,
    atendidas: ok.length,
    percentual: aplic.length ? Math.round((ok.length / aplic.length) * 1000) / 10 : 0,
    obrigatoriasPendentes: obrig.filter((e) => e.status !== 'ATENDIDO').length,
    atrasadas: aplic.filter((e) => e.status !== 'ATENDIDO' && e.prazo && e.prazo.getTime() < agora.getTime()).length,
    porDimensao,
  }
}

// ---------------- simulação de conceito por dimensão ----------------
export interface ResultadoComissao {
  simulacao: true
  aviso: string
  disponivel: boolean
  motivo?: string
  pesos: Record<string, number>
  dimensoes: Array<{ dimensao: string; nome: string; peso: number; media: number | null; avaliadas: number; total: number; pendentesSemConceito: number }>
  continuo?: number
  faixa?: number
  paraSubir?: any
  alertas: string[]
}

/** Média por dimensão dos conceitos estimados (1..5) das evidências e conceito final ponderado (faixas 1,5/2,5/3,5/4,5). */
export function simularConceitoComissao(
  evs: Array<{ dimensao: string; conceitoEstimado?: number | null; status?: string; obrigatorio?: boolean }>,
  sobrescrever: Partial<Record<(typeof DIMS_MEC)[number], number>> = {},
  pesos: Record<string, number> = PESOS_DIMENSOES,
): ResultadoComissao {
  const dimensoes = DIMS_MEC.map((d) => {
    const l = evs.filter((e) => e.dimensao === d && e.status !== 'NAO_APLICAVEL')
    const av = l.filter((e) => e.conceitoEstimado != null)
    const media = av.length ? Math.round((av.reduce((s, e) => s + (e.conceitoEstimado as number), 0) / av.length) * 100) / 100 : null
    return { dimensao: d as string, nome: DIM_NOME[d], peso: pesos[CHAVE_DIM[d]], media, avaliadas: av.length, total: l.length, pendentesSemConceito: l.length - av.length }
  })
  const alertas: string[] = []
  const entrada: Record<string, number> = {}
  const faltantes: string[] = []
  for (const d of dimensoes) {
    const forcado = sobrescrever[d.dimensao as (typeof DIMS_MEC)[number]]
    if (forcado != null) { if (forcado < 1 || forcado > 5) throw new Error('Conceito simulado deve estar entre 1 e 5.'); d.media = forcado }
    if (d.media == null) { faltantes.push(d.nome); continue }
    entrada[CHAVE_DIM[d.dimensao]] = d.media
  }
  const base = { simulacao: true as const, aviso: DISCLAIMER_SIMULACAO, pesos: { ...pesos }, dimensoes, alertas }
  if (faltantes.length) return { ...base, disponivel: false, motivo: `Sem conceito estimado nas dimensões: ${faltantes.join('; ')}. Atribua conceitos às evidências (1 a 5).` }
  const r = simularCC(entrada, pesos)
  const pend = evs.filter((e) => e.obrigatorio && e.status !== 'ATENDIDO' && e.status !== 'NAO_APLICAVEL').length
  if (pend > 0) alertas.push(`${pend} evidência(s) obrigatória(s) ainda não atendida(s): o conceito real depende da comprovação documental na visita.`)
  if (r.faixa <= 2) alertas.push('Conceito insatisfatório (1 ou 2) na simulação: risco de indeferimento ou protocolo de compromisso.')
  const abaixo = dimensoes.filter((d) => d.media != null && d.media < 3).map((d) => d.nome)
  if (abaixo.length) alertas.push(`Dimensão(ões) abaixo de 3: ${abaixo.join('; ')}.`)
  return { ...base, disponivel: true, continuo: r.continuo, faixa: r.faixa, paraSubir: r.paraSubir, alertas }
}

/** Faixa 1..5 para um contínuo 0..5 (padrão de cortes CPC/IGC/ENADE/IDD). */
export function faixaContinuo(v: number) {
  const c = [0.945, 1.945, 2.945, 3.945]
  let f = 1
  for (const x of c) if (v >= x) f++
  return Math.min(5, f)
}

export const TIPOS_CONCEITO = ['CI', 'IGC', 'CPC', 'CC', 'ENADE', 'IDD'] as const
export const NOME_CONCEITO: Record<string, string> = {
  CI: 'Conceito Institucional (CI)',
  IGC: 'Índice Geral de Cursos (IGC)',
  CPC: 'Conceito Preliminar de Curso (CPC)',
  CC: 'Conceito de Curso (CC)',
  ENADE: 'Conceito ENADE',
  IDD: 'Indicador de Diferença entre os Desempenhos (IDD)',
}

export function classificarTitulacao(t?: string | null): 'DOUTOR' | 'MESTRE' | 'ESPECIALISTA' | 'GRADUADO' | 'NAO_INFORMADA' {
  const s = (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!s.trim()) return 'NAO_INFORMADA'
  if (/(doutor|phd|pos-?doutor)/.test(s)) return 'DOUTOR'
  if (/mestre/.test(s)) return 'MESTRE'
  if (/especialista/.test(s)) return 'ESPECIALISTA'
  return 'GRADUADO'
}

export function resumoCorpoDocente(perfis: Array<{ titulacao?: string | null; regime?: string | null }>) {
  const n = perfis.length
  const t = { DOUTOR: 0, MESTRE: 0, ESPECIALISTA: 0, GRADUADO: 0, NAO_INFORMADA: 0 }
  for (const p of perfis) t[classificarTitulacao(p.titulacao)]++
  const integral = perfis.filter((p) => p.regime === 'INTEGRAL').length
  const parcial = perfis.filter((p) => p.regime === 'PARCIAL').length
  const pct = (x: number) => (n ? Math.round((x / n) * 1000) / 10 : null)
  return { total: n, titulacao: t, pctDoutores: pct(t.DOUTOR), pctMestresDoutores: pct(t.DOUTOR + t.MESTRE), pctIntegral: pct(integral), pctIntegralParcial: pct(integral + parcial) }
}
