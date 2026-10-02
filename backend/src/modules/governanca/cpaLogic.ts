// Agregação ANÔNIMA dos resultados da CPA (função pura).
// Células com menos respondentes que `minRespostas` são suprimidas (media/indice = null)
// para proteger o anonimato (k-anonimato simples).

export type TipoPergunta = 'LIKERT5' | 'SIM_NAO' | 'TEXTO'
export interface PerguntaInfo { id: string; eixo: number; dimensao?: number | null; tipo: TipoPergunta }
export interface RespostaAnon {
  segmento: string
  programId?: string | null
  itens: Array<{ perguntaId: string; valor?: number | null }>
}
export interface Celula {
  n: number               // respondentes distintos com ao menos um item nessa célula
  itens: number
  media: number | null    // média bruta (Likert 1..5; SIM_NAO 0..1)
  indice: number | null   // 0..100 normalizado
  favoravel: number | null // % de respostas favoráveis (Likert>=4 / SIM)
  suprimido: boolean
}
export interface AgregadoCpa {
  minRespostas: number
  totalRespondentes: number
  porEixo: Record<string, Celula>
  porDimensao: Record<string, Celula>
  porEixoSegmento: Record<string, Record<string, Celula>>
  porEixoCurso: Record<string, Record<string, Celula>>
  porSegmento: Record<string, Celula>
}

export function normalizar(tipo: TipoPergunta, v: number): number | null {
  if (tipo === 'LIKERT5') return v >= 1 && v <= 5 ? ((v - 1) / 4) * 100 : null
  if (tipo === 'SIM_NAO') return v === 1 ? 100 : v === 0 ? 0 : null
  return null
}
const favoravelDe = (tipo: TipoPergunta, v: number) => (tipo === 'LIKERT5' ? v >= 4 : tipo === 'SIM_NAO' ? v === 1 : false)

interface Acc { resp: Set<number>; soma: number; somaIdx: number; fav: number; itens: number }
const novo = (): Acc => ({ resp: new Set(), soma: 0, somaIdx: 0, fav: 0, itens: 0 })
const r2 = (n: number) => Math.round(n * 100) / 100

function fechar(a: Acc | undefined, min: number): Celula {
  if (!a) return { n: 0, itens: 0, media: null, indice: null, favoravel: null, suprimido: true }
  const n = a.resp.size
  if (n < min || a.itens === 0) return { n, itens: a.itens, media: null, indice: null, favoravel: null, suprimido: true }
  return { n, itens: a.itens, media: r2(a.soma / a.itens), indice: r2(a.somaIdx / a.itens), favoravel: r2((a.fav / a.itens) * 100), suprimido: false }
}

export function agregarCpa(respostas: RespostaAnon[], perguntas: PerguntaInfo[], minRespostas = 5): AgregadoCpa {
  const pmap = new Map(perguntas.map((p) => [p.id, p]))
  const eixo = new Map<string, Acc>()
  const dim = new Map<string, Acc>()
  const seg = new Map<string, Acc>()
  const eixoSeg = new Map<string, Map<string, Acc>>()
  const eixoCurso = new Map<string, Map<string, Acc>>()

  const touch = (m: Map<string, Acc>, k: string) => { let a = m.get(k); if (!a) { a = novo(); m.set(k, a) } return a }
  const touch2 = (m: Map<string, Map<string, Acc>>, k1: string, k2: string) => {
    let inner = m.get(k1); if (!inner) { inner = new Map(); m.set(k1, inner) }
    return touch(inner, k2)
  }
  const add = (a: Acc, idx: number, p: PerguntaInfo, v: number, rid: number) => {
    a.resp.add(rid); a.itens++; a.soma += v; a.somaIdx += idx; if (favoravelDe(p.tipo, v)) a.fav++
  }

  respostas.forEach((r, rid) => {
    for (const it of r.itens) {
      const p = pmap.get(it.perguntaId)
      if (!p || p.tipo === 'TEXTO' || it.valor == null) continue
      const idx = normalizar(p.tipo, it.valor)
      if (idx == null) continue
      const e = String(p.eixo)
      add(touch(eixo, e), idx, p, it.valor, rid)
      if (p.dimensao != null) add(touch(dim, String(p.dimensao)), idx, p, it.valor, rid)
      add(touch(seg, r.segmento), idx, p, it.valor, rid)
      add(touch2(eixoSeg, e, r.segmento), idx, p, it.valor, rid)
      if (r.programId) add(touch2(eixoCurso, e, r.programId), idx, p, it.valor, rid)
    }
  })

  const out = (m: Map<string, Acc>) => Object.fromEntries([...m].map(([k, a]) => [k, fechar(a, minRespostas)]))
  const out2 = (m: Map<string, Map<string, Acc>>) => Object.fromEntries([...m].map(([k, inner]) => [k, out(inner)]))
  return {
    minRespostas,
    totalRespondentes: respostas.length,
    porEixo: out(eixo),
    porDimensao: out(dim),
    porSegmento: out(seg),
    porEixoSegmento: out2(eixoSeg),
    porEixoCurso: out2(eixoCurso),
  }
}

export function conceitoIndice(indice: number | null): string {
  if (indice == null) return 'Dados insuficientes'
  if (indice >= 80) return 'Muito satisfatório'
  if (indice >= 60) return 'Satisfatório'
  if (indice >= 40) return 'Regular'
  return 'Crítico'
}

// Fragilidades: dimensões/eixos com índice abaixo do limiar (não suprimidos).
export function fragilidades(ag: AgregadoCpa, limiar = 60) {
  const out: Array<{ nivel: 'EIXO' | 'DIMENSAO'; chave: string; indice: number; n: number }> = []
  for (const [k, c] of Object.entries(ag.porEixo)) if (!c.suprimido && c.indice! < limiar) out.push({ nivel: 'EIXO', chave: k, indice: c.indice!, n: c.n })
  for (const [k, c] of Object.entries(ag.porDimensao)) if (!c.suprimido && c.indice! < limiar) out.push({ nivel: 'DIMENSAO', chave: k, indice: c.indice!, n: c.n })
  return out.sort((a, b) => a.indice - b.indice)
}

export const EIXOS_SINAES: Record<number, { nome: string; dimensoes: Array<{ n: number; nome: string }> }> = {
  1: { nome: 'Planejamento e Avaliação Institucional', dimensoes: [{ n: 8, nome: 'Planejamento e Avaliação' }] },
  2: { nome: 'Desenvolvimento Institucional', dimensoes: [{ n: 1, nome: 'Missão e PDI' }, { n: 3, nome: 'Responsabilidade Social' }] },
  3: { nome: 'Políticas Acadêmicas', dimensoes: [{ n: 2, nome: 'Políticas para o Ensino, Pesquisa e Extensão' }, { n: 4, nome: 'Comunicação com a Sociedade' }, { n: 9, nome: 'Políticas de Atendimento aos Estudantes' }] },
  4: { nome: 'Políticas de Gestão', dimensoes: [{ n: 5, nome: 'Políticas de Pessoal' }, { n: 6, nome: 'Organização e Gestão da Instituição' }, { n: 10, nome: 'Sustentabilidade Financeira' }] },
  5: { nome: 'Infraestrutura Física', dimensoes: [{ n: 7, nome: 'Infraestrutura Física' }] },
}

// Token anônimo: geração/validação em routes (crypto). Aqui só o formato.
export function normalizarToken(t: string) {
  return t.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
