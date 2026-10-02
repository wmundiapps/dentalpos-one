import type { Mesh } from './mesh'
import { weld } from './mesh'

/** Leitores simples de STL (binário/ASCII), OBJ e PLY → malha indexada (mm). */
export function parseMesh(name: string, buf: ArrayBuffer): Mesh {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'obj') return parseObj(new TextDecoder().decode(buf))
  if (ext === 'ply') return parsePly(buf)
  return parseStl(buf)
}

function parseStl(buf: ArrayBuffer): Mesh {
  const dv = new DataView(buf)
  const nTri = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0
  const binary = 84 + nTri * 50 === buf.byteLength
  const pos: number[] = []
  if (binary) {
    let o = 84
    for (let t = 0; t < nTri; t++) {
      o += 12
      for (let k = 0; k < 9; k++) pos.push(dv.getFloat32(o + k * 4, true))
      o += 38
    }
  } else {
    const txt = new TextDecoder().decode(buf)
    const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(txt))) pos.push(+m[1], +m[2], +m[3])
  }
  if (!pos.length) throw new Error('STL vazio ou inválido')
  const idx = new Uint32Array(pos.length / 3)
  for (let i = 0; i < idx.length; i++) idx[i] = i
  return weld({ positions: new Float32Array(pos), indices: idx }, 1e-4)
}

function parseObj(txt: string): Mesh {
  const pos: number[] = []
  const idx: number[] = []
  for (const line of txt.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/)
      pos.push(+p[1], +p[2], +p[3])
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map((s) => {
        const i = parseInt(s.split('/')[0])
        return i < 0 ? pos.length / 3 + i : i - 1
      })
      for (let k = 1; k < f.length - 1; k++) idx.push(f[0], f[k], f[k + 1])
    }
  }
  if (!idx.length) throw new Error('OBJ sem faces')
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

function parsePly(buf: ArrayBuffer): Mesh {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)))
  const end = head.indexOf('end_header')
  if (end < 0) throw new Error('PLY inválido')
  const headerLen = head.indexOf('\n', end) + 1
  const lines = head.slice(0, headerLen).split(/\r?\n/)
  const format = (lines.find((l) => l.startsWith('format')) ?? '').split(/\s+/)[1]
  let nv = 0
  let nf = 0
  const props: { name: string; type: string }[] = []
  let cur = ''
  let listType = ['uchar', 'int']
  for (const l of lines) {
    const p = l.trim().split(/\s+/)
    if (p[0] === 'element') {
      cur = p[1]
      if (cur === 'vertex') nv = +p[2]
      if (cur === 'face') nf = +p[2]
    } else if (p[0] === 'property') {
      if (cur === 'vertex') props.push({ name: p[2], type: p[1] })
      if (cur === 'face' && p[1] === 'list') listType = [p[2], p[3]]
    }
  }
  const sz: Record<string, number> = { char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, float32: 4, float64: 8 }
  const pos = new Float32Array(nv * 3)
  const idx: number[] = []
  if (format === 'ascii') {
    const body = new TextDecoder().decode(new Uint8Array(buf, headerLen)).split(/\r?\n/)
    for (let i = 0; i < nv; i++) {
      const p = body[i].trim().split(/\s+/)
      pos[i * 3] = +p[0]; pos[i * 3 + 1] = +p[1]; pos[i * 3 + 2] = +p[2]
    }
    for (let i = 0; i < nf; i++) {
      const p = body[nv + i].trim().split(/\s+/).map(Number)
      for (let k = 2; k <= p[0] - 0; k++) if (k < p[0]) idx.push(p[1], p[k], p[k + 1])
    }
  } else {
    const le = format === 'binary_little_endian'
    const dv = new DataView(buf, headerLen)
    let o = 0
    const rd = (t: string) => {
      let v = 0
      switch (t) {
        case 'float': case 'float32': v = dv.getFloat32(o, le); break
        case 'double': case 'float64': v = dv.getFloat64(o, le); break
        case 'uchar': case 'uint8': v = dv.getUint8(o); break
        case 'char': case 'int8': v = dv.getInt8(o); break
        case 'short': case 'int16': v = dv.getInt16(o, le); break
        case 'ushort': case 'uint16': v = dv.getUint16(o, le); break
        case 'uint': case 'uint32': v = dv.getUint32(o, le); break
        default: v = dv.getInt32(o, le)
      }
      o += sz[t] ?? 4
      return v
    }
    for (let i = 0; i < nv; i++) {
      for (const pr of props) {
        const v = rd(pr.type)
        if (pr.name === 'x') pos[i * 3] = v
        else if (pr.name === 'y') pos[i * 3 + 1] = v
        else if (pr.name === 'z') pos[i * 3 + 2] = v
      }
    }
    for (let i = 0; i < nf; i++) {
      const n = rd(listType[0])
      const f: number[] = []
      for (let k = 0; k < n; k++) f.push(rd(listType[1]))
      for (let k = 1; k < n - 1; k++) idx.push(f[0], f[k], f[k + 1])
    }
  }
  if (!idx.length) throw new Error('PLY sem faces')
  return { positions: pos, indices: new Uint32Array(idx) }
}
