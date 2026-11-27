import { Grafo, NoDef } from './engine'

// Layout em camadas (estilo Sugiyama simplificado) — função PURA.
// 1) remove arestas de retorno (ciclos) via DFS a partir do INICIO;
// 2) camada = caminho mais longo; 3) ordena cada camada por baricentro;
// 4) converte camadas/posições em coordenadas.

export interface LayoutOpts { direcao?: 'LR' | 'TB'; largura?: number; altura?: number; gapX?: number; gapY?: number }
export interface DiagramaNo { id: string; titulo: string; tipo: string; papel?: string | null; fase?: string | null; slaDias?: number | null; modulo?: string | null; rota?: string | null; x: number; y: number; w: number; h: number; camada: number; linha: number }
export interface DiagramaAresta { id: string; de: string; para: string; rotulo?: string | null; condicional: boolean; retorno: boolean; pontos: Array<{ x: number; y: number }> }
export interface Diagrama { direcao: 'LR' | 'TB'; largura: number; altura: number; nos: DiagramaNo[]; arestas: DiagramaAresta[]; raias: Array<{ papel: string; nos: number }> }

export function calcularLayout(g: Grafo, opts: LayoutOpts = {}): Diagrama {
  const direcao = opts.direcao ?? 'TB'
  const w = opts.largura ?? 200
  const h = opts.altura ?? 64
  const gapX = opts.gapX ?? 60
  const gapY = opts.gapY ?? 70
  const chaves = g.nos.map((n) => n.chave)
  const idx = new Map(chaves.map((c, i) => [c, i]))
  const adj = new Map<string, string[]>()
  for (const c of chaves) adj.set(c, [])
  for (const t of g.transicoes) if (idx.has(t.deChave) && idx.has(t.paraChave)) adj.get(t.deChave)!.push(t.paraChave)

  // 1) arestas de retorno por DFS iterativo (ordem determinística)
  const raizes = [...g.nos.filter((n) => n.tipo === 'INICIO').map((n) => n.chave), ...chaves]
  const estado = new Map<string, 0 | 1 | 2>()
  const retorno = new Set<string>()
  for (const r of raizes) {
    if (estado.get(r)) continue
    const pilha: Array<{ k: string; i: number }> = [{ k: r, i: 0 }]
    estado.set(r, 1)
    while (pilha.length) {
      const top = pilha[pilha.length - 1]
      const vizinhos = adj.get(top.k)!
      if (top.i >= vizinhos.length) { estado.set(top.k, 2); pilha.pop(); continue }
      const v = vizinhos[top.i++]
      const ev = estado.get(v) ?? 0
      if (ev === 1) retorno.add(`${top.k}>${v}`)
      else if (ev === 0) { estado.set(v, 1); pilha.push({ k: v, i: 0 }) }
    }
  }
  const dag = new Map<string, string[]>()
  const pred = new Map<string, string[]>()
  for (const c of chaves) { dag.set(c, []); pred.set(c, []) }
  for (const [de, vs] of adj) for (const para of vs) {
    if (retorno.has(`${de}>${para}`) || de === para) continue
    dag.get(de)!.push(para)
    pred.get(para)!.push(de)
  }

  // 2) camadas por caminho mais longo (ordem topológica de Kahn)
  const grau = new Map(chaves.map((c) => [c, pred.get(c)!.length]))
  const camada = new Map<string, number>(chaves.map((c) => [c, 0]))
  const fila = chaves.filter((c) => grau.get(c) === 0)
  const topo: string[] = []
  while (fila.length) {
    const x = fila.shift()!
    topo.push(x)
    for (const y of dag.get(x)!) {
      camada.set(y, Math.max(camada.get(y)!, camada.get(x)! + 1))
      grau.set(y, grau.get(y)! - 1)
      if (grau.get(y) === 0) fila.push(y)
    }
  }
  const nCamadas = Math.max(0, ...[...camada.values()]) + 1
  const camadas: string[][] = Array.from({ length: nCamadas }, () => [])
  for (const c of chaves) camadas[camada.get(c)!].push(c)

  // 3) baricentro (varreduras para baixo e para cima)
  const pos = new Map<string, number>()
  const reindexa = () => camadas.forEach((l) => l.forEach((k, i) => pos.set(k, i)))
  reindexa()
  const bary = (k: string, vizinhos: string[]) => (vizinhos.length ? vizinhos.reduce((s, v) => s + pos.get(v)!, 0) / vizinhos.length : pos.get(k)!)
  for (let it = 0; it < 4; it++) {
    for (let l = 1; l < nCamadas; l++) { camadas[l].sort((a, b) => bary(a, pred.get(a)!) - bary(b, pred.get(b)!) || idx.get(a)! - idx.get(b)!); reindexa() }
    for (let l = nCamadas - 2; l >= 0; l--) { camadas[l].sort((a, b) => bary(a, dag.get(a)!) - bary(b, dag.get(b)!) || idx.get(a)! - idx.get(b)!); reindexa() }
  }

  // 4) coordenadas (centraliza cada camada em relação à maior)
  const maxLinhas = Math.max(1, ...camadas.map((l) => l.length))
  const passoCamada = (direcao === 'TB' ? h + gapY : w + gapX)
  const passoLinha = (direcao === 'TB' ? w + gapX : h + gapY)
  const porChave = new Map<string, NoDef>(g.nos.map((n) => [n.chave, n]))
  const nos: DiagramaNo[] = []
  camadas.forEach((l, ci) => {
    const deslocamento = ((maxLinhas - l.length) * passoLinha) / 2
    l.forEach((k, li) => {
      const n = porChave.get(k)!
      const a = ci * passoCamada
      const b = deslocamento + li * passoLinha
      nos.push({ id: k, titulo: n.titulo, tipo: n.tipo, papel: n.papel, fase: n.fase, slaDias: n.slaDias, modulo: n.modulo, rota: n.rota, x: direcao === 'TB' ? b : a, y: direcao === 'TB' ? a : b, w, h, camada: ci, linha: li })
    })
  })
  const mapa = new Map(nos.map((n) => [n.id, n]))
  const arestas: DiagramaAresta[] = g.transicoes
    .filter((t) => mapa.has(t.deChave) && mapa.has(t.paraChave))
    .map((t, i) => {
      const A = mapa.get(t.deChave)!
      const B = mapa.get(t.paraChave)!
      const ret = retorno.has(`${t.deChave}>${t.paraChave}`) || t.deChave === t.paraChave
      const pa = direcao === 'TB' ? { x: A.x + w / 2, y: A.y + h } : { x: A.x + w, y: A.y + h / 2 }
      const pb = direcao === 'TB' ? { x: B.x + w / 2, y: B.y } : { x: B.x, y: B.y + h / 2 }
      const pontos = ret
        ? direcao === 'TB'
          ? [{ x: A.x + w, y: A.y + h / 2 }, { x: Math.max(A.x, B.x) + w + 30, y: A.y + h / 2 }, { x: Math.max(A.x, B.x) + w + 30, y: B.y + h / 2 }, { x: B.x + w, y: B.y + h / 2 }]
          : [{ x: A.x + w / 2, y: A.y + h }, { x: A.x + w / 2, y: Math.max(A.y, B.y) + h + 30 }, { x: B.x + w / 2, y: Math.max(A.y, B.y) + h + 30 }, { x: B.x + w / 2, y: B.y + h }]
        : [pa, pb]
      return { id: `e${i}`, de: t.deChave, para: t.paraChave, rotulo: t.rotulo ?? null, condicional: !!t.condicao, retorno: ret, pontos }
    })
  const raiasMap = new Map<string, number>()
  for (const n of g.nos) if (n.papel) raiasMap.set(n.papel, (raiasMap.get(n.papel) ?? 0) + 1)
  return {
    direcao,
    largura: Math.max(0, ...nos.map((n) => n.x + n.w)) + 40,
    altura: Math.max(0, ...nos.map((n) => n.y + n.h)) + 40,
    nos,
    arestas,
    raias: [...raiasMap].map(([papel, n]) => ({ papel, nos: n })),
  }
}

// ---------------- Mermaid ----------------
const ROTULO_PAPEL: Record<string, string> = {
  ADMIN: 'Administração', OWNER: 'Proprietário', RECTOR: 'Reitoria', BOARD: 'Diretoria', COORDINATOR: 'Coordenação', TEACHER: 'Professor',
  STUDENT: 'Aluno', FINANCE: 'Financeiro', SECRETARY: 'Secretaria', LIBRARIAN: 'Biblioteca', FACILITIES: 'Infraestrutura', SUPPLIES: 'Suprimentos',
  MARKETING: 'Marketing', ADMISSIONS: 'Admissões', SUPPORT: 'Apoio/Suporte', STAFF: 'Equipe administrativa',
}
export const rotuloPapel = (p: string) => ROTULO_PAPEL[p] ?? p

const q = (s: string) => String(s).replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ')
const mid = (k: string) => 'n_' + k.replace(/[^A-Za-z0-9_]/g, '_')

export function gerarMermaid(g: Grafo, opts: { direcao?: 'TD' | 'LR'; titulo?: string } = {}): string {
  const L: string[] = []
  L.push(`flowchart ${opts.direcao ?? 'TD'}`)
  const forma = (n: NoDef) => {
    const sla = n.slaDias != null && ['TAREFA', 'APROVACAO', 'ESPERA_EVENTO'].includes(n.tipo) ? `<br/><i>SLA ${n.slaDias}d</i>` : ''
    const t = `"${q(n.titulo)}${sla}"`
    switch (n.tipo) {
      case 'INICIO': case 'FIM': return `([${t}])`
      case 'GATEWAY': return `{${t}}`
      case 'APROVACAO': return `{{${t}}}`
      case 'ESPERA_EVENTO': return `[/${t}/]`
      case 'MARCO': return `((${t}))`
      default: return `[${t}]`
    }
  }
  const raias = new Map<string, NoDef[]>()
  const livres: NoDef[] = []
  for (const n of g.nos) {
    if (n.papel && !['INICIO', 'FIM', 'GATEWAY', 'MARCO'].includes(n.tipo)) raias.set(n.papel, [...(raias.get(n.papel) ?? []), n])
    else livres.push(n)
  }
  for (const n of livres) L.push(`  ${mid(n.chave)}${forma(n)}`)
  for (const [papel, ns] of raias) {
    L.push(`  subgraph raia_${papel.replace(/[^A-Za-z0-9_]/g, '_')}["${q(rotuloPapel(papel))}"]`)
    for (const n of ns) L.push(`    ${mid(n.chave)}${forma(n)}`)
    L.push('  end')
  }
  for (const t of g.transicoes) {
    const r = t.rotulo ? `|"${q(t.rotulo)}"|` : ''
    L.push(`  ${mid(t.deChave)} ${t.condicao ? '-.->' : '-->'}${r} ${mid(t.paraChave)}`)
  }
  L.push('  classDef inicio fill:#e0f2fe,stroke:#0369a1;')
  L.push('  classDef fim fill:#dcfce7,stroke:#15803d;')
  L.push('  classDef gw fill:#fef9c3,stroke:#a16207;')
  L.push('  classDef apr fill:#fae8ff,stroke:#a21caf;')
  L.push('  classDef marco fill:#ffedd5,stroke:#c2410c;')
  const cls = (tipo: string, c: string) => {
    const ids = g.nos.filter((n) => n.tipo === tipo).map((n) => mid(n.chave))
    if (ids.length) L.push(`  class ${ids.join(',')} ${c};`)
  }
  cls('INICIO', 'inicio'); cls('FIM', 'fim'); cls('GATEWAY', 'gw'); cls('APROVACAO', 'apr'); cls('MARCO', 'marco')
  return L.join('\n')
}
