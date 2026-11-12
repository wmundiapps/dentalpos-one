// Lógica PURA do módulo Exames (sem banco): repetição espaçada, agregações, prontidão, sugestões.

export const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
export const pct = (a: number, t: number) => (t > 0 ? round((a / t) * 100) : null)

// ---------------------------------------------------------------- repetição espaçada (SM-2 simplificado)
// qualidade 0-2 = errou (reinicia); 3-5 = acertou (aumenta o intervalo).
export interface EstadoCartao { intervalo: number; fatorFacilidade: number; repeticoes: number }
export function proximaRevisaoSM2(qualidade: number, e: EstadoCartao, agora = new Date()) {
  let { intervalo, fatorFacilidade, repeticoes } = e
  if (qualidade < 3) { repeticoes = 0; intervalo = 1 }
  else {
    repeticoes += 1
    if (repeticoes === 1) intervalo = 1
    else if (repeticoes === 2) intervalo = 6
    else intervalo = Math.max(1, Math.round(intervalo * fatorFacilidade))
    fatorFacilidade = Math.max(1.3, fatorFacilidade + (0.1 - (5 - qualidade) * (0.08 + (5 - qualidade) * 0.02)))
  }
  const proximaRevisao = new Date(agora.getTime() + intervalo * 86_400_000)
  return { intervalo, fatorFacilidade: round(fatorFacilidade, 2), repeticoes, proximaRevisao }
}

// ---------------------------------------------------------------- correção com agregações por eixo/tema/descritor
export interface QuestaoCorrecao {
  id: string
  eixoId?: string | null
  tema?: string | null
  descritorId?: string | null
  gabarito?: string | null
}
export interface Agregado { acertos: number; total: number; percentual: number | null }

export function corrigirSessao(questoes: QuestaoCorrecao[], respostas: Record<string, string | null | undefined>) {
  const det: Array<{ questaoId: string; marcada: string | null; gabarito: string | null; correta: boolean; respondida: boolean }> = []
  const eixos = new Map<string, Agregado>(), temas = new Map<string, Agregado>(), descs = new Map<string, Agregado>()
  const bump = (m: Map<string, Agregado>, k: string | null | undefined, ok: boolean) => {
    if (!k) return
    const c = m.get(k) ?? { acertos: 0, total: 0, percentual: null }
    c.total++; if (ok) c.acertos++
    m.set(k, c)
  }
  let acertos = 0
  for (const q of questoes) {
    const marcada = respostas[q.id] ? String(respostas[q.id]).trim().toUpperCase() : null
    const gab = q.gabarito ? String(q.gabarito).trim().toUpperCase() : null
    const ok = !!marcada && !!gab && marcada === gab
    if (ok) acertos++
    det.push({ questaoId: q.id, marcada, gabarito: gab, correta: ok, respondida: !!marcada })
    bump(eixos, q.eixoId, ok); bump(temas, q.tema, ok); bump(descs, q.descritorId, ok)
  }
  const fin = (m: Map<string, Agregado>) => [...m.entries()].map(([k, v]) => ({ chave: k, acertos: v.acertos, total: v.total, percentual: pct(v.acertos, v.total) }))
  return { acertos, total: questoes.length, percentual: pct(acertos, questoes.length) ?? 0, detalhe: det, porEixo: fin(eixos), porTema: fin(temas), porDescritor: fin(descs) }
}

// Soma agregados de várias sessões: [{chave,acertos,total}] -> mapa
export function somarAgregados(listas: Array<Array<{ chave: string; acertos: number; total: number }>>) {
  const m = new Map<string, { acertos: number; total: number }>()
  for (const l of listas) for (const x of l ?? []) {
    const c = m.get(x.chave) ?? { acertos: 0, total: 0 }
    c.acertos += x.acertos; c.total += x.total; m.set(x.chave, c)
  }
  return [...m.entries()].map(([chave, v]) => ({ chave, acertos: v.acertos, total: v.total, percentual: pct(v.acertos, v.total) }))
}

// ---------------------------------------------------------------- perfil de prova -> recorrência dos temas
export interface TemaPerfil { tema: string; eixoCodigo?: string | null; frequenciaPct: number; nivelPredominante?: string | null; observacao?: string | null }

/** Une vários perfis (anos) e devolve a frequência média por tema, com a tendência entre o primeiro e o último ano. */
export function consolidarPerfis(perfis: Array<{ ano: number; temas: TemaPerfil[] }>) {
  const ord = [...perfis].sort((a, b) => a.ano - b.ano)
  const m = new Map<string, { tema: string; eixoCodigo?: string | null; vals: Array<{ ano: number; f: number }>; nivel?: string | null }>()
  for (const p of ord) for (const t of p.temas ?? []) {
    const k = t.tema.trim().toLowerCase()
    const c = m.get(k) ?? { tema: t.tema, eixoCodigo: t.eixoCodigo, vals: [], nivel: t.nivelPredominante }
    c.vals.push({ ano: p.ano, f: Number(t.frequenciaPct) || 0 })
    if (t.nivelPredominante) c.nivel = t.nivelPredominante
    m.set(k, c)
  }
  const anos = ord.length
  const itens = [...m.values()].map((c) => {
    const freq = c.vals.reduce((s, v) => s + v.f, 0) / Math.max(1, anos) // ausência em um ano conta como 0
    const primeiro = c.vals[0]?.f ?? 0, ultimo = c.vals[c.vals.length - 1]?.f ?? 0
    return { tema: c.tema, eixoCodigo: c.eixoCodigo ?? null, frequenciaMedia: round(freq), aparicoes: c.vals.length, anosAnalisados: anos, tendencia: c.vals.length < 2 ? 'ESTAVEL' : ultimo - primeiro > 1 ? 'ALTA' : primeiro - ultimo > 1 ? 'QUEDA' : 'ESTAVEL', nivelPredominante: c.nivel ?? null }
  }).sort((a, b) => b.frequenciaMedia - a.frequenciaMedia)
  const max = itens[0]?.frequenciaMedia || 1
  return itens.map((i) => ({ ...i, recorrencia: i.frequenciaMedia >= max * 0.66 ? 'ALTA' : i.frequenciaMedia >= max * 0.33 ? 'MEDIA' : 'BAIXA' }))
}

/** Prioridade de estudo = recorrência histórica x lacuna do aluno (sem dado do aluno, só a recorrência). */
export function priorizarTemas(recorrentes: Array<{ tema: string; frequenciaMedia: number }>, acertoPorTema: Map<string, number | null>) {
  return recorrentes.map((t) => {
    const a = acertoPorTema.get(t.tema.trim().toLowerCase())
    const lacuna = a == null ? 0.6 : Math.max(0, 1 - a / 100) // sem dado: assume lacuna média
    return { ...t, acertoAtual: a ?? null, prioridade: round(t.frequenciaMedia * (0.3 + lacuna), 2) }
  }).sort((a, b) => b.prioridade - a.prioridade)
}

// ---------------------------------------------------------------- prontidão do curso
export interface AlunoProntidao { studentId: string; media: number | null; sessoes: number }
export function indiceProntidao(alunos: AlunoProntidao[], opts: { meta: number; limiteRisco: number }) {
  const total = alunos.length
  const part = alunos.filter((a) => a.sessoes > 0 && a.media != null)
  const participacao = total ? part.length / total : 0
  const media = part.length ? part.reduce((s, a) => s + (a.media as number), 0) / part.length : null
  const emRisco = part.filter((a) => (a.media as number) < opts.limiteRisco).length
  const riscoShare = part.length ? emRisco / part.length : 1
  const desempenho = media == null ? 0 : Math.min(1, media / (opts.meta || 60))
  const indice = total ? Math.round(100 * (0.6 * desempenho + 0.25 * participacao + 0.15 * (1 - riscoShare))) : 0
  const faixa = !part.length ? 'SEM_DADOS' : indice >= 75 ? 'PRONTO' : indice >= 50 ? 'ATENCAO' : 'CRITICO'
  return { indice, faixa, participacaoPct: round(participacao * 100), mediaPct: media == null ? null : round(media), emRisco, alunos: total, comSimulado: part.length }
}

/** Média das últimas N sessões (mais recentes) de um aluno. */
export function mediaUltimas(percentuais: number[], n = 3) {
  const u = percentuais.slice(-n)
  return u.length ? round(u.reduce((s, v) => s + v, 0) / u.length) : null
}

// ---------------------------------------------------------------- variação "IA simulada" (sem chave): reembaralha alternativas
export function rngSeed(seed: number) {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
export function embaralharQuestao(q: { alternativas: Array<{ letra: string; texto: string }>; gabarito: string; comentarios?: Record<string, string> | null }, seed: number) {
  const r = rngSeed(seed)
  const idx = q.alternativas.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]] }
  const alternativas = idx.map((o, n) => ({ letra: String.fromCharCode(65 + n), texto: q.alternativas[o].texto }))
  const novaLetra = (antiga: string) => String.fromCharCode(65 + idx.indexOf(q.alternativas.findIndex((a) => a.letra === antiga)))
  const comentarios: Record<string, string> = {}
  for (const [l, t] of Object.entries(q.comentarios ?? {})) comentarios[novaLetra(l)] = t
  return { alternativas, gabarito: novaLetra(q.gabarito), comentarios }
}

/** Validação da questão comentada: gabarito entre as alternativas e comentário por alternativa (quando exigido). */
export function validarComentarios(alternativas: Array<{ letra: string }> | null | undefined, comentarios: Record<string, string> | null | undefined, exigir: boolean) {
  const erros: string[] = []
  if (!comentarios) { if (exigir) erros.push('Informe a explicação de cada alternativa.'); return erros }
  const letras = new Set((alternativas ?? []).map((a) => a.letra.toUpperCase()))
  for (const k of Object.keys(comentarios)) if (!letras.has(k.toUpperCase())) erros.push(`Comentário para alternativa inexistente: ${k}.`)
  if (exigir) for (const l of letras) if (!String(comentarios[l] ?? '').trim()) erros.push(`Falta explicação da alternativa ${l}.`)
  return erros
}

export function nomeAbreviado(nome: string) {
  const p = nome.trim().split(/\s+/)
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]
}
