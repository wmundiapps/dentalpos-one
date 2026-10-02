// Funções PURAS do módulo de notas (sem acesso a banco) — testadas em __selftest__.ts.

export type RegraMedia = 'ARITMETICA' | 'PONDERADA'
export type RegraRecuperacao = 'NENHUMA' | 'SUBSTITUI_MENOR' | 'SUBSTITUI_MEDIA' | 'MEDIA_COM_PARCIAL'
export type RegraExame = 'NENHUM' | 'MEDIA_PONDERADA' | 'SUBSTITUI'
export type Situacao = 'EM_CURSO' | 'APROVADO' | 'REPROVADO_NOTA' | 'REPROVADO_FREQ' | 'RECUPERACAO' | 'EXAME'

export interface RegraCalc {
  regraMedia: RegraMedia
  notaMaxima: number
  mediaAprovacao: number
  mediaMinimaRecuperacao: number
  recuperacao: RegraRecuperacao
  exame: RegraExame
  pesoParcial: number
  pesoExame: number
  mediaAprovacaoExame: number
  frequenciaMinima: number
  abonaJustificadas: boolean
  arredondamento: 'NENHUM' | 'UM_DECIMAL' | 'MEIO_PONTO' | 'INTEIRO' | string
  diasRevisao: number
}

export const REGRA_PADRAO: RegraCalc = {
  regraMedia: 'PONDERADA',
  notaMaxima: 10,
  mediaAprovacao: 7,
  mediaMinimaRecuperacao: 4,
  recuperacao: 'SUBSTITUI_MENOR',
  exame: 'MEDIA_PONDERADA',
  pesoParcial: 0.6,
  pesoExame: 0.4,
  mediaAprovacaoExame: 5,
  frequenciaMinima: 75,
  abonaJustificadas: true,
  arredondamento: 'UM_DECIMAL',
  diasRevisao: 7,
}

export interface ComponenteCalc {
  id: string
  codigo?: string
  tipo: 'AVALIACAO' | 'RECUPERACAO' | 'EXAME'
  peso: number
  notaMaxima: number
  obrigatorio: boolean
}

export interface NotaCalc {
  componenteId: string
  valor: number | null
  ausente?: boolean
}

export function arredondar(v: number, modo: string): number {
  switch (modo) {
    case 'NENHUM': return Math.round(v * 10000) / 10000
    case 'INTEIRO': return Math.round(v)
    case 'MEIO_PONTO': return Math.round(v * 2) / 2
    default: return Math.round((v + Number.EPSILON) * 10) / 10
  }
}

// Normaliza a nota do componente para a escala da regra (ex.: componente de 0-5 vira 0-10).
export function normalizar(valor: number, c: ComponenteCalc, regra: RegraCalc): number {
  if (!c.notaMaxima || c.notaMaxima <= 0) return valor
  return (valor / c.notaMaxima) * regra.notaMaxima
}

export interface ParcialResult {
  media: number | null          // média parcial (sem arredondar), null se nada lançado
  pendentes: string[]           // ids de componentes obrigatórios sem nota
  completo: boolean
  notas: Array<{ componenteId: string; normalizada: number; peso: number }>
}

// Média parcial dos componentes AVALIACAO. Componente obrigatório sem nota = pendente
// (não entra na média parcial, mas impede "completo"). Ausente conta zero.
export function calcMediaParcial(componentes: ComponenteCalc[], notas: NotaCalc[], regra: RegraCalc): ParcialResult {
  const byId = new Map(notas.map((n) => [n.componenteId, n]))
  const notasN: ParcialResult['notas'] = []
  const pendentes: string[] = []
  for (const c of componentes.filter((x) => x.tipo === 'AVALIACAO')) {
    const n = byId.get(c.id)
    const temNota = n && n.valor != null && !Number.isNaN(n.valor)
    if (temNota) notasN.push({ componenteId: c.id, normalizada: normalizar(n!.valor as number, c, regra), peso: c.peso })
    else if (n?.ausente) notasN.push({ componenteId: c.id, normalizada: 0, peso: c.peso })
    else if (c.obrigatorio) pendentes.push(c.id)
  }
  if (notasN.length === 0) return { media: null, pendentes, completo: pendentes.length === 0 && componentes.some((x) => x.tipo === 'AVALIACAO'), notas: notasN }
  let media: number
  if (regra.regraMedia === 'ARITMETICA') media = notasN.reduce((s, n) => s + n.normalizada, 0) / notasN.length
  else {
    const somaPeso = notasN.reduce((s, n) => s + n.peso, 0)
    media = somaPeso > 0 ? notasN.reduce((s, n) => s + n.normalizada * n.peso, 0) / somaPeso : notasN.reduce((s, n) => s + n.normalizada, 0) / notasN.length
  }
  return { media, pendentes, completo: pendentes.length === 0, notas: notasN }
}

export interface ResultadoCalc {
  mediaParcial: number | null
  mediaAposRecuperacao: number | null
  notaRecuperacao: number | null
  notaExame: number | null
  mediaFinal: number | null
  situacao: Situacao
  pendentes: string[]
  riscoFrequencia: boolean
}

export interface CalcInput {
  componentes: ComponenteCalc[]
  notas: NotaCalc[]
  regra: RegraCalc
  frequenciaPct: number | null   // null = sem aulas registradas
  encerrado: boolean             // diário fechado
}

function notaDe(tipo: 'RECUPERACAO' | 'EXAME', componentes: ComponenteCalc[], notas: NotaCalc[], regra: RegraCalc): number | null {
  const c = componentes.find((x) => x.tipo === tipo)
  if (!c) return null
  const n = notas.find((x) => x.componenteId === c.id)
  if (!n) return null
  if (n.valor != null) return normalizar(n.valor, c, regra)
  return n.ausente ? 0 : null
}

// Aplica a regra de recuperação sobre a média parcial. Retorna nova média (nunca menor que a original).
export function aplicarRecuperacao(parcial: ParcialResult, rec: number | null, regra: RegraCalc): number | null {
  if (parcial.media == null || rec == null || regra.recuperacao === 'NENHUMA') return parcial.media
  const base = parcial.media
  switch (regra.recuperacao) {
    case 'SUBSTITUI_MEDIA':
      return Math.max(base, rec)
    case 'MEDIA_COM_PARCIAL':
      return Math.max(base, base * regra.pesoParcial + rec * regra.pesoExame)
    case 'SUBSTITUI_MENOR': {
      if (parcial.notas.length === 0) return base
      // substitui a menor nota (normalizada) se a recuperação for maior, recalculando a média
      const arr = parcial.notas.map((n) => ({ ...n }))
      let iMin = 0
      arr.forEach((n, i) => { if (n.normalizada < arr[iMin].normalizada) iMin = i })
      if (rec <= arr[iMin].normalizada) return base
      arr[iMin].normalizada = rec
      let nova: number
      if (regra.regraMedia === 'ARITMETICA') nova = arr.reduce((s, n) => s + n.normalizada, 0) / arr.length
      else {
        const sp = arr.reduce((s, n) => s + n.peso, 0)
        nova = sp > 0 ? arr.reduce((s, n) => s + n.normalizada * n.peso, 0) / sp : arr.reduce((s, n) => s + n.normalizada, 0) / arr.length
      }
      return Math.max(base, nova)
    }
  }
  return base
}

// Média final + situação do aluno na turma.
export function calcResultado(inp: CalcInput): ResultadoCalc {
  const { componentes, notas, regra } = inp
  const r = (v: number | null) => (v == null ? null : arredondar(v, regra.arredondamento))
  const parcial = calcMediaParcial(componentes, notas, regra)
  const temRec = componentes.some((c) => c.tipo === 'RECUPERACAO') && regra.recuperacao !== 'NENHUMA'
  const temExame = componentes.some((c) => c.tipo === 'EXAME') && regra.exame !== 'NENHUM'
  const notaRec = temRec ? notaDe('RECUPERACAO', componentes, notas, regra) : null
  const notaExame = temExame ? notaDe('EXAME', componentes, notas, regra) : null
  const freqBaixa = inp.frequenciaPct != null && inp.frequenciaPct < regra.frequenciaMinima

  const out: ResultadoCalc = {
    mediaParcial: r(parcial.media), mediaAposRecuperacao: null, notaRecuperacao: notaRec, notaExame,
    mediaFinal: null, situacao: 'EM_CURSO', pendentes: parcial.pendentes, riscoFrequencia: freqBaixa,
  }

  const finalizar = (sit: Situacao, mediaFinal: number | null): ResultadoCalc => {
    let s = sit
    if (freqBaixa && (inp.encerrado || sit !== 'EM_CURSO')) s = 'REPROVADO_FREQ'
    return { ...out, mediaFinal: r(mediaFinal), situacao: s }
  }

  if (parcial.media == null || !parcial.completo) {
    // ainda há avaliações obrigatórias sem nota
    if (inp.encerrado) {
      // diário fechado com pendência: nota ausente já tratada; sem média = reprovado por nota
      return finalizar('REPROVADO_NOTA', parcial.media)
    }
    return { ...out, situacao: freqBaixa && inp.encerrado ? 'REPROVADO_FREQ' : 'EM_CURSO' }
  }

  // média parcial completa; usa valor arredondado para decidir (o que o aluno vê)
  const comRec = aplicarRecuperacao(parcial, notaRec, regra)
  out.mediaAposRecuperacao = r(comRec)
  const m1 = r(comRec) as number
  if (m1 >= regra.mediaAprovacao) return finalizar('APROVADO', m1)

  const recAtiva = temRec && notaRec == null
  const admitido = m1 >= regra.mediaMinimaRecuperacao
  if (!admitido) return finalizar('REPROVADO_NOTA', m1)
  if (recAtiva) return inp.encerrado ? finalizar('REPROVADO_NOTA', m1) : finalizar('RECUPERACAO', m1)

  if (temExame) {
    if (notaExame == null) return inp.encerrado ? finalizar('REPROVADO_NOTA', m1) : finalizar('EXAME', m1)
    const mf = regra.exame === 'SUBSTITUI' ? Math.max(notaExame, 0) : m1 * regra.pesoParcial + notaExame * regra.pesoExame
    const mfr = r(mf) as number
    return finalizar(mfr >= regra.mediaAprovacaoExame ? 'APROVADO' : 'REPROVADO_NOTA', mfr)
  }
  return finalizar('REPROVADO_NOTA', m1)
}

// ---------------- Frequência ----------------

export interface PresencaRegistro { presente: boolean; justificada?: boolean }

// aulasChamada = nº de aulas realizadas com chamada feita; registros = presenças do aluno nessas aulas.
// Aula com chamada sem registro do aluno conta como falta.
export function calcFrequencia(aulasChamada: number, registros: PresencaRegistro[], abonaJustificadas: boolean) {
  if (aulasChamada <= 0) return { total: 0, presencas: 0, faltas: 0, pct: null as number | null }
  const presentes = registros.filter((r) => r.presente).length
  const abonadas = abonaJustificadas ? registros.filter((r) => !r.presente && r.justificada).length : 0
  const presencas = Math.min(aulasChamada, presentes + abonadas)
  const faltas = aulasChamada - presencas
  return { total: aulasChamada, presencas, faltas, pct: Math.round((presencas / aulasChamada) * 1000) / 10 }
}

// Faltas ainda permitidas dado o total previsto de aulas.
export function faltasRestantes(totalPrevisto: number, faltas: number, freqMinima: number) {
  const maxFaltas = Math.floor(totalPrevisto * (1 - freqMinima / 100))
  return { maxFaltas, restantes: Math.max(0, maxFaltas - faltas), estourou: faltas > maxFaltas }
}

// ---------------- Projeção / risco ----------------

// Nota (na escala da regra) necessária no(s) componente(s) restante(s) para atingir a média de aprovação.
export function notaNecessaria(componentes: ComponenteCalc[], notas: NotaCalc[], regra: RegraCalc): { necessaria: number | null; possivel: boolean; restantes: number } {
  const avals = componentes.filter((c) => c.tipo === 'AVALIACAO')
  const byId = new Map(notas.map((n) => [n.componenteId, n]))
  const feitos = avals.filter((c) => { const n = byId.get(c.id); return n && (n.valor != null || n.ausente) })
  const falta = avals.filter((c) => !feitos.includes(c))
  if (falta.length === 0) return { necessaria: null, possivel: true, restantes: 0 }
  const peso = (c: ComponenteCalc) => (regra.regraMedia === 'PONDERADA' ? c.peso : 1)
  const pTotal = avals.reduce((s, c) => s + peso(c), 0)
  const pFalta = falta.reduce((s, c) => s + peso(c), 0)
  const somaFeita = feitos.reduce((s, c) => {
    const n = byId.get(c.id)!
    return s + (n.valor != null ? normalizar(n.valor, c, regra) : 0) * peso(c)
  }, 0)
  if (pFalta <= 0 || pTotal <= 0) return { necessaria: null, possivel: true, restantes: falta.length }
  const nec = (regra.mediaAprovacao * pTotal - somaFeita) / pFalta
  return { necessaria: Math.max(0, Math.round(nec * 100) / 100), possivel: nec <= regra.notaMaxima, restantes: falta.length }
}

export type NivelRisco = 'NENHUM' | 'ATENCAO' | 'ALTO'

export function avaliarRisco(params: { componentes: ComponenteCalc[]; notas: NotaCalc[]; regra: RegraCalc; frequenciaPct: number | null; situacao: Situacao }) {
  const motivos: string[] = []
  let nivel: NivelRisco = 'NENHUM'
  const up = (n: NivelRisco) => { if (n === 'ALTO' || (n === 'ATENCAO' && nivel === 'NENHUM')) nivel = n }
  const { regra } = params
  if (params.frequenciaPct != null) {
    if (params.frequenciaPct < regra.frequenciaMinima) { up('ALTO'); motivos.push(`Frequência ${params.frequenciaPct}% abaixo do mínimo de ${regra.frequenciaMinima}%`) }
    else if (params.frequenciaPct < regra.frequenciaMinima + 8) { up('ATENCAO'); motivos.push(`Frequência ${params.frequenciaPct}% próxima do mínimo de ${regra.frequenciaMinima}%`) }
  }
  if (['REPROVADO_NOTA', 'REPROVADO_FREQ'].includes(params.situacao) && !motivos.length) { up('ALTO'); motivos.push('Reprovado na disciplina') }
  if (params.situacao === 'RECUPERACAO' || params.situacao === 'EXAME') { up('ATENCAO'); motivos.push(params.situacao === 'EXAME' ? 'Em exame final' : 'Em recuperação') }
  if (params.situacao === 'EM_CURSO') {
    const p = calcMediaParcial(params.componentes, params.notas, regra)
    const nn = notaNecessaria(params.componentes, params.notas, regra)
    if (nn.restantes > 0 && !nn.possivel) { up('ALTO'); motivos.push('Nota necessária nas avaliações restantes acima do máximo possível') }
    else if (nn.restantes > 0 && nn.necessaria != null && nn.necessaria > regra.notaMaxima * 0.8) { up('ATENCAO'); motivos.push(`Precisa de ${nn.necessaria} nas avaliações restantes`) }
    if (p.media != null && p.media < regra.mediaMinimaRecuperacao && nn.restantes === 0) { up('ALTO'); motivos.push(`Média parcial ${arredondar(p.media, 'UM_DECIMAL')} abaixo do mínimo para recuperação`) }
  }
  return { nivel, motivos }
}

// ---------------- Agregados ----------------

// CR (coeficiente de rendimento): média das médias finais ponderada pela carga horária.
export function calcCR(itens: Array<{ mediaFinal: number | null; cargaHoraria: number; situacao: Situacao }>): number | null {
  const v = itens.filter((i) => i.mediaFinal != null && ['APROVADO', 'REPROVADO_NOTA', 'REPROVADO_FREQ'].includes(i.situacao) && i.cargaHoraria > 0)
  if (!v.length) return null
  const ch = v.reduce((s, i) => s + i.cargaHoraria, 0)
  return Math.round((v.reduce((s, i) => s + (i.mediaFinal as number) * i.cargaHoraria, 0) / ch) * 100) / 100
}

export function estatisticas(valores: Array<number | null | undefined>, notaMaxima = 10) {
  const v = valores.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b)
  const faixas = 5
  const largura = notaMaxima / faixas
  const distribuicao = Array.from({ length: faixas }, (_, i) => ({
    faixa: `${(i * largura).toFixed(1)}–${((i + 1) * largura).toFixed(1)}`,
    de: i * largura,
    ate: (i + 1) * largura,
    quantidade: 0,
  }))
  if (!v.length) return { n: 0, media: null, mediana: null, desvioPadrao: null, minima: null, maxima: null, distribuicao }
  for (const x of v) {
    const i = Math.min(faixas - 1, Math.max(0, Math.floor(x / largura)))
    distribuicao[i].quantidade++
  }
  const media = v.reduce((s, x) => s + x, 0) / v.length
  const mediana = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  const variancia = v.reduce((s, x) => s + (x - media) ** 2, 0) / v.length
  const r2 = (x: number) => Math.round(x * 100) / 100
  return { n: v.length, media: r2(media), mediana: r2(mediana), desvioPadrao: r2(Math.sqrt(variancia)), minima: v[0], maxima: v[v.length - 1], distribuicao }
}

// ---------------- Importação em lote (CSV simples) ----------------

export interface LinhaImportacao { chave: string; valores: Record<string, number | null | 'AUSENTE'>; erros: string[] }

export function parseNota(txt: string): number | null | 'AUSENTE' | undefined {
  const t = String(txt ?? '').trim()
  if (t === '') return undefined
  if (/^(aus|ausente|f|falta|nc|-)$/i.test(t)) return 'AUSENTE'
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Cabeçalho: ra;P1;P2;... (separador ; , ou tab). Primeira coluna = RA (ou "ra"/"matricula"/"aluno").
export function parseNotasCsv(texto: string): { colunas: string[]; linhas: LinhaImportacao[]; erros: string[] } {
  const linhasRaw = texto.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (linhasRaw.length < 2) return { colunas: [], linhas: [], erros: ['CSV precisa de cabeçalho e ao menos uma linha.'] }
  const sep = [';', '\t', ','].find((s) => linhasRaw[0].includes(s)) ?? ';'
  const cab = linhasRaw[0].split(sep).map((c) => c.trim())
  const colunas = cab.slice(1)
  const erros: string[] = []
  if (colunas.length === 0) erros.push('Cabeçalho sem colunas de componentes.')
  const linhas: LinhaImportacao[] = []
  for (let i = 1; i < linhasRaw.length; i++) {
    const cels = linhasRaw[i].split(sep).map((c) => c.trim())
    const l: LinhaImportacao = { chave: cels[0], valores: {}, erros: [] }
    if (!l.chave) l.erros.push(`Linha ${i + 1}: RA vazio.`)
    colunas.forEach((col, j) => {
      const p = parseNota(cels[j + 1])
      if (p === undefined) return
      if (p === null) l.erros.push(`Linha ${i + 1}: valor inválido "${cels[j + 1]}" em ${col}.`)
      else l.valores[col] = p
    })
    linhas.push(l)
  }
  return { colunas, linhas, erros }
}

// Valida nota contra o máximo do componente.
export function validarNota(valor: number, notaMaxima: number): string | null {
  if (!Number.isFinite(valor)) return 'Nota inválida.'
  if (valor < 0) return 'Nota não pode ser negativa.'
  if (valor > notaMaxima) return `Nota ${valor} maior que o máximo do componente (${notaMaxima}).`
  return null
}

// Escolhe a nota de uma prova entre várias tentativas.
export function notaDeTentativas(notas: number[], modo: 'MELHOR' | 'ULTIMA' | 'MEDIA'): number | null {
  if (!notas.length) return null
  if (modo === 'ULTIMA') return notas[notas.length - 1]
  if (modo === 'MEDIA') return Math.round((notas.reduce((s, x) => s + x, 0) / notas.length) * 100) / 100
  return Math.max(...notas)
}

export const SITUACAO_LABEL: Record<Situacao, string> = {
  EM_CURSO: 'Em curso',
  APROVADO: 'Aprovado',
  REPROVADO_NOTA: 'Reprovado por nota',
  REPROVADO_FREQ: 'Reprovado por frequência',
  RECUPERACAO: 'Em recuperação',
  EXAME: 'Em exame final',
}
