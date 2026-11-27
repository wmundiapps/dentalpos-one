// Gerador de QR Code (ISO/IEC 18004) sem dependências: modo byte (UTF-8), correção de erro M, versões 1-15.
// Funções puras; retorna a matriz de módulos (true = escuro). Testado contra decodificador real no e2e/selftest.

type Bloco = { n: number; dados: number }
interface InfoVersao { ec: number; grupos: Bloco[]; alinhamento: number[]; resto: number }

// Nível M. ec = codewords de correção por bloco; grupos = blocos (quantidade × codewords de dados).
const VERSOES: Record<number, InfoVersao> = {
  1: { ec: 10, grupos: [{ n: 1, dados: 16 }], alinhamento: [], resto: 0 },
  2: { ec: 16, grupos: [{ n: 1, dados: 28 }], alinhamento: [6, 18], resto: 7 },
  3: { ec: 26, grupos: [{ n: 1, dados: 44 }], alinhamento: [6, 22], resto: 7 },
  4: { ec: 18, grupos: [{ n: 2, dados: 32 }], alinhamento: [6, 26], resto: 7 },
  5: { ec: 24, grupos: [{ n: 2, dados: 43 }], alinhamento: [6, 30], resto: 7 },
  6: { ec: 16, grupos: [{ n: 4, dados: 27 }], alinhamento: [6, 34], resto: 7 },
  7: { ec: 18, grupos: [{ n: 4, dados: 31 }], alinhamento: [6, 22, 38], resto: 0 },
  8: { ec: 22, grupos: [{ n: 2, dados: 38 }, { n: 2, dados: 39 }], alinhamento: [6, 24, 42], resto: 0 },
  9: { ec: 22, grupos: [{ n: 3, dados: 36 }, { n: 2, dados: 37 }], alinhamento: [6, 26, 46], resto: 0 },
  10: { ec: 26, grupos: [{ n: 4, dados: 43 }, { n: 1, dados: 44 }], alinhamento: [6, 28, 50], resto: 0 },
  11: { ec: 30, grupos: [{ n: 1, dados: 50 }, { n: 4, dados: 51 }], alinhamento: [6, 30, 54], resto: 0 },
  12: { ec: 22, grupos: [{ n: 6, dados: 36 }, { n: 2, dados: 37 }], alinhamento: [6, 32, 58], resto: 0 },
  13: { ec: 22, grupos: [{ n: 8, dados: 37 }, { n: 1, dados: 38 }], alinhamento: [6, 34, 62], resto: 0 },
  14: { ec: 24, grupos: [{ n: 4, dados: 40 }, { n: 5, dados: 41 }], alinhamento: [6, 26, 46, 66], resto: 3 },
  15: { ec: 24, grupos: [{ n: 5, dados: 41 }, { n: 5, dados: 42 }], alinhamento: [6, 26, 48, 70], resto: 3 },
}

const totalDados = (v: InfoVersao) => v.grupos.reduce((s, g) => s + g.n * g.dados, 0)

// ---------- GF(256) / Reed-Solomon ----------
const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a: number, b: number) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

function geradorRS(grau: number): number[] {
  let poly = [1]
  for (let i = 0; i < grau; i++) {
    const prox = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      prox[j] ^= poly[j]
      prox[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = prox
  }
  return poly
}

function codigoRS(dados: number[], grau: number): number[] {
  const g = geradorRS(grau)
  const resto = new Array(grau).fill(0)
  for (const d of dados) {
    const f = d ^ resto[0]
    resto.shift()
    resto.push(0)
    if (f !== 0) for (let i = 0; i < grau; i++) resto[i] ^= gfMul(g[i + 1], f)
  }
  return resto
}

// ---------- Codificação dos dados ----------
function utf8(texto: string): number[] {
  return Array.from(Buffer.from(texto, 'utf8'))
}

export function versaoMinima(bytes: number): number {
  for (let v = 1; v <= 15; v++) {
    const bitsCont = v < 10 ? 8 : 16
    const capBits = totalDados(VERSOES[v]) * 8
    if (4 + bitsCont + bytes * 8 <= capBits) return v
  }
  throw Object.assign(new Error('Conteúdo grande demais para o QR Code (máx. ~400 bytes).'), { status: 400 })
}

function codewordsDeDados(bytes: number[], v: number): number[] {
  const info = VERSOES[v]
  const cap = totalDados(info)
  const bits: number[] = []
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, v < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  const capBits = cap * 8
  push(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8) bits.push(0)
  const cw: number[] = []
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0; cw.length < cap; pad++) cw.push(pad % 2 === 0 ? 0xec : 0x11)
  return cw
}

function intercalar(cw: number[], v: number): number[] {
  const info = VERSOES[v]
  const blocos: number[][] = []
  const ecs: number[][] = []
  let pos = 0
  for (const g of info.grupos) {
    for (let i = 0; i < g.n; i++) {
      const b = cw.slice(pos, pos + g.dados)
      pos += g.dados
      blocos.push(b)
      ecs.push(codigoRS(b, info.ec))
    }
  }
  const out: number[] = []
  const maxD = Math.max(...blocos.map((b) => b.length))
  for (let i = 0; i < maxD; i++) for (const b of blocos) if (i < b.length) out.push(b[i])
  for (let i = 0; i < info.ec; i++) for (const e of ecs) out.push(e[i])
  return out
}

// ---------- Matriz ----------
type Matriz = number[][] // -1 = livre, 0/1 = módulo

function bch(valor: number, gerador: number, bitsGer: number, bitsDados: number): number {
  let v = valor << (bitsGer - 1)
  for (let i = bitsDados + bitsGer - 2; i >= bitsGer - 1; i--) if ((v >>> i) & 1) v ^= gerador << (i - (bitsGer - 1))
  return (valor << (bitsGer - 1)) | v
}

function bitsFormato(mascara: number): number {
  const dados = (0b00 << 3) | mascara // nível M = 00
  return bch(dados, 0x537, 11, 5) ^ 0x5412
}

function bitsVersao(v: number): number {
  return bch(v, 0x1f25, 13, 6)
}

function mascaraFn(m: number): (r: number, c: number) => boolean {
  switch (m) {
    case 0: return (r, c) => (r + c) % 2 === 0
    case 1: return (r) => r % 2 === 0
    case 2: return (_r, c) => c % 3 === 0
    case 3: return (r, c) => (r + c) % 3 === 0
    case 4: return (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5: return (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0
    case 6: return (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default: return (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function criarBase(v: number): { m: Matriz; reservado: boolean[][] } {
  const n = 17 + 4 * v
  const m: Matriz = Array.from({ length: n }, () => new Array(n).fill(-1))
  const reservado: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false))
  const set = (r: number, c: number, val: number) => { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = val; reservado[r][c] = true } }
  // localizadores + separadores
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc
        const dentro = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
        const escuro = dentro && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
        set(r, c, escuro ? 1 : 0)
      }
    }
  }
  // alinhamento
  const al = VERSOES[v].alinhamento
  for (const r of al) {
    for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1)
    }
  }
  // temporização
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0) }
  // módulo escuro
  set(n - 8, 8, 1)
  // áreas de formato (reservadas)
  for (let i = 0; i < 9; i++) { if (!reservado[8][i]) set(8, i, 0); if (!reservado[i][8]) set(i, 8, 0) }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, 0); set(n - 1 - i, 8, 0) }
  set(n - 8, 8, 1)
  // versão
  if (v >= 7) {
    for (let i = 0; i < 18; i++) { set(Math.floor(i / 3), n - 11 + (i % 3), 0); set(n - 11 + (i % 3), Math.floor(i / 3), 0) }
  }
  return { m, reservado }
}

function posicionarDados(m: Matriz, reservado: boolean[][], bits: number[]) {
  const n = m.length
  let idx = 0
  let subindo = true
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c--
    for (let i = 0; i < n; i++) {
      const r = subindo ? n - 1 - i : i
      for (let k = 0; k < 2; k++) {
        const cc = c - k
        if (reservado[r][cc]) continue
        m[r][cc] = idx < bits.length ? bits[idx++] : 0
      }
    }
    subindo = !subindo
  }
}

function aplicar(m: Matriz, reservado: boolean[][], mascara: number, v: number): number[][] {
  const n = m.length
  const f = mascaraFn(mascara)
  const out = m.map((row) => row.slice())
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!reservado[r][c] && f(r, c)) out[r][c] ^= 1
  // formato
  const fmt = bitsFormato(mascara)
  const bit = (i: number) => (fmt >>> i) & 1
  for (let i = 0; i <= 5; i++) out[i][8] = bit(i)
  out[7][8] = bit(6)
  out[8][8] = bit(7)
  out[8][7] = bit(8)
  for (let i = 9; i < 15; i++) out[8][14 - i] = bit(i)
  for (let i = 0; i < 8; i++) out[8][n - 1 - i] = bit(i)
  for (let i = 8; i < 15; i++) out[n - 15 + i][8] = bit(i)
  out[n - 8][8] = 1
  if (v >= 7) {
    const ver = bitsVersao(v)
    for (let i = 0; i < 18; i++) {
      const b = (ver >>> i) & 1
      out[Math.floor(i / 3)][n - 11 + (i % 3)] = b
      out[n - 11 + (i % 3)][Math.floor(i / 3)] = b
    }
  }
  return out
}

function penalidade(m: number[][]): number {
  const n = m.length
  let p = 0
  // regra 1: sequências de 5+ iguais
  for (let r = 0; r < n; r++) {
    for (const horizontal of [true, false]) {
      let run = 1
      for (let i = 1; i < n; i++) {
        const a = horizontal ? m[r][i] : m[i][r]
        const b = horizontal ? m[r][i - 1] : m[i - 1][r]
        if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p += 1 } else run = 1
      }
    }
  }
  // regra 2: blocos 2x2
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3
  // regra 3: padrão 1:1:3:1:1
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n - 11; c++) {
      let h1 = true, h2 = true, v1 = true, v2 = true
      for (let k = 0; k < 11; k++) {
        if (m[r][c + k] !== pat1[k]) h1 = false
        if (m[r][c + k] !== pat2[k]) h2 = false
        if (m[c + k][r] !== pat1[k]) v1 = false
        if (m[c + k][r] !== pat2[k]) v2 = false
      }
      if (h1 || h2) p += 40
      if (v1 || v2) p += 40
    }
  }
  // regra 4: proporção de escuros
  let escuros = 0
  for (const row of m) for (const x of row) escuros += x
  const pct = (escuros * 100) / (n * n)
  p += Math.floor(Math.abs(pct - 50) / 5) * 10
  return p
}

export interface QrResultado { versao: number; tamanho: number; modulos: boolean[][] }

export function gerarQr(texto: string): QrResultado {
  const bytes = utf8(texto)
  const v = versaoMinima(bytes.length)
  const cw = intercalar(codewordsDeDados(bytes, v), v)
  const bits: number[] = []
  for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1)
  for (let i = 0; i < VERSOES[v].resto; i++) bits.push(0)
  const { m, reservado } = criarBase(v)
  posicionarDados(m, reservado, bits)
  let melhor: number[][] | null = null
  let melhorP = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const cand = aplicar(m, reservado, mask, v)
    const p = penalidade(cand)
    if (p < melhorP) { melhorP = p; melhor = cand }
  }
  return { versao: v, tamanho: melhor!.length, modulos: melhor!.map((row) => row.map((x) => x === 1)) }
}

/** Caminho SVG (um único <path>) com os módulos escuros, em unidades de módulo. Inclui a zona silenciosa. */
export function qrSvgPath(qr: QrResultado, quiet = 2): { path: string; lado: number } {
  const partes: string[] = []
  for (let r = 0; r < qr.tamanho; r++) {
    let c = 0
    while (c < qr.tamanho) {
      if (qr.modulos[r][c]) {
        let fim = c
        while (fim < qr.tamanho && qr.modulos[r][fim]) fim++
        partes.push(`M${c + quiet} ${r + quiet}h${fim - c}v1h${-(fim - c)}z`)
        c = fim
      } else c++
    }
  }
  return { path: partes.join(''), lado: qr.tamanho + quiet * 2 }
}
