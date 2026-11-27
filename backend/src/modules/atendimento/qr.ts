// Gerador de QR Code (modo byte, correção M, versões 1-10) sem dependências. Retorna matriz de módulos escuros.
const EXP = new Array<number>(512), LOG = new Array<number>(256)
;(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] })()
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)

function rsGen(n: number) {
  let g = [1]
  for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]) } g = ng }
  return g
}
function rsEc(data: number[], n: number) {
  const g = rsGen(n), r = new Array(n).fill(0)
  for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f) }
  return r
}

// versão -> [ec por bloco, [nBlocosG1, dataG1], [nBlocosG2, dataG2]] (nível M)
const VT: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44],
}
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] }

function bch(v: number, poly: number, bits: number) { let d = v << bits; const hb = (x: number) => 31 - Math.clz32(x); while (hb(d) >= hb(poly)) d ^= poly << (hb(d) - hb(poly)); return (v << bits) | d }

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(Buffer.from(text, 'utf8'))
  let ver = 0
  for (let v = 1; v <= 10; v++) { const [, n1, d1, n2, d2] = VT[v]; const cap = n1 * d1 + n2 * d2; const cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= cap * 8) { ver = v; break } }
  if (!ver) throw new Error('Texto longo demais para o QR.')
  const [ecN, n1, d1, n2, d2] = VT[ver]
  const cap = n1 * d1 + n2 * d2
  const bits: number[] = []
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1) }
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0)
  const cw: number[] = []
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let p = 0; cw.length < cap; p++) cw.push(p % 2 ? 0x11 : 0xec)
  const blocks: number[][] = []; let o = 0
  for (let i = 0; i < n1 + n2; i++) { const len = i < n1 ? d1 : d2; blocks.push(cw.slice(o, o + len)); o += len }
  const ecs = blocks.map((b) => rsEc(b, ecN))
  const fin: number[] = []
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.length) fin.push(b[i])
  for (let i = 0; i < ecN; i++) for (const e of ecs) fin.push(e[i])

  const N = 17 + 4 * ver
  const M: (boolean | null)[][] = Array.from({ length: N }, () => new Array(N).fill(null))
  const fn: boolean[][] = Array.from({ length: N }, () => new Array(N).fill(false))
  const set = (r: number, c: number, v: boolean) => { if (r >= 0 && c >= 0 && r < N && c < N) { M[r][c] = v; fn[r][c] = true } }
  const finder = (r: number, c: number) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) set(r + i, c + j, i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))) }
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0)
  for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  const al = ALIGN[ver]
  for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1) }
  set(N - 8, 8, true)
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false) }
  for (let i = 0; i < 8; i++) { if (!fn[8][N - 1 - i]) set(8, N - 1 - i, false); if (!fn[N - 1 - i][8]) set(N - 1 - i, 8, false) }
  if (ver >= 7) { const vi = bch(ver, 0x1f25, 12); for (let i = 0; i < 18; i++) { const b = ((vi >> i) & 1) === 1; set(Math.floor(i / 3), N - 11 + (i % 3), b); set(N - 11 + (i % 3), Math.floor(i / 3), b) } }

  const mask = (m: number, r: number, c: number) => [(r + c) % 2 === 0, r % 2 === 0, c % 3 === 0, (r + c) % 3 === 0, (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, ((r * c) % 2) + ((r * c) % 3) === 0, (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (((r + c) % 2) + ((r * c) % 3)) % 2 === 0][m]
  const databits: number[] = []
  fin.forEach((b) => put2(b))
  function put2(b: number) { for (let i = 7; i >= 0; i--) databits.push((b >> i) & 1) }
  const build = (m: number) => {
    const Q = M.map((row) => row.slice())
    let k = 0, up = true
    for (let c = N - 1; c > 0; c -= 2) {
      if (c === 6) c--
      for (let t = 0; t < N; t++) { const r = up ? N - 1 - t : t; for (let d = 0; d < 2; d++) { const cc = c - d; if (fn[r][cc]) continue; let v = k < databits.length ? databits[k] === 1 : false; k++; if (mask(m, r, cc)) v = !v; Q[r][cc] = v } }
      up = !up
    }
    const f = bch((0 << 3) | m, 0x537, 10) ^ 0x5412 // M = 00
    const fb = (i: number) => ((f >> i) & 1) === 1
    for (let i = 0; i < 6; i++) Q[i][8] = fb(i)
    Q[7][8] = fb(6); Q[8][8] = fb(7); Q[8][7] = fb(8)
    for (let i = 9; i < 15; i++) Q[8][14 - i] = fb(i)
    for (let i = 0; i < 8; i++) Q[8][N - 1 - i] = fb(i)
    for (let i = 8; i < 15; i++) Q[N - 15 + i][8] = fb(i)
    Q[N - 8][8] = true
    return Q as boolean[][]
  }
  const penalty = (Q: boolean[][]) => {
    let p = 0
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < N; a++) {
      let run = 1
      for (let b = 1; b < N; b++) { const cur = pass ? Q[b][a] : Q[a][b], prev = pass ? Q[b - 1][a] : Q[a][b - 1]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1 }
    }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) if (Q[r][c] === Q[r][c + 1] && Q[r][c] === Q[r + 1][c] && Q[r][c] === Q[r + 1][c + 1]) p += 3
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < N; a++) for (let b = 0; b <= N - 11; b++) {
      let m1 = true, m2 = true
      for (let k = 0; k < 11; k++) { const v = (pass ? Q[b + k][a] : Q[a][b + k]) ? 1 : 0; if (v !== pat1[k]) m1 = false; if (v !== pat2[k]) m2 = false }
      if (m1) p += 40; if (m2) p += 40
    }
    let dark = 0; for (const row of Q) for (const v of row) if (v) dark++
    p += Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5) * 10
    return p
  }
  let best: boolean[][] | null = null, bp = Infinity
  for (let m = 0; m < 8; m++) { const Q = build(m); const p = penalty(Q); if (p < bp) { bp = p; best = Q } }
  return best!
}
