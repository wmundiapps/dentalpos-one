import type { Mesh } from './mesh'
import { meshStats } from './mesh'

export interface ExportPart {
  name: string
  mesh: Mesh
  color: string // #rrggbb
}

const safe = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_\-.]+/g, '_').replace(/^_+|_+$/g, '')

function triNormal(p: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const l = Math.hypot(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l]
}

/** STL binário (80 bytes de cabeçalho + uint32 + 50 bytes/triângulo). Unidades: mm. */
export function toStlBinary(parts: ExportPart[], header = 'DentalPod Design — STL (mm)'): ArrayBuffer {
  let tris = 0
  for (const p of parts) tris += p.mesh.indices.length / 3
  const buf = new ArrayBuffer(84 + tris * 50)
  const dv = new DataView(buf)
  const enc = new TextEncoder().encode(header.slice(0, 79))
  new Uint8Array(buf, 0, 80).set(enc)
  dv.setUint32(80, tris, true)
  let o = 84
  for (const part of parts) {
    const { positions: P, indices: I } = part.mesh
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2]
      const n = triNormal(P, a, b, c)
      dv.setFloat32(o, n[0], true); dv.setFloat32(o + 4, n[1], true); dv.setFloat32(o + 8, n[2], true)
      let q = o + 12
      for (const v of [a, b, c]) {
        dv.setFloat32(q, P[v * 3], true); dv.setFloat32(q + 4, P[v * 3 + 1], true); dv.setFloat32(q + 8, P[v * 3 + 2], true)
        q += 12
      }
      dv.setUint16(o + 48, 0, true)
      o += 50
    }
  }
  return buf
}

export function toStlAscii(parts: ExportPart[]): string {
  const out: string[] = []
  for (const part of parts) {
    out.push(`solid ${safe(part.name)}`)
    const { positions: P, indices: I } = part.mesh
    for (let t = 0; t < I.length; t += 3) {
      const n = triNormal(P, I[t], I[t + 1], I[t + 2])
      out.push(`  facet normal ${n[0].toExponential(6)} ${n[1].toExponential(6)} ${n[2].toExponential(6)}`, '    outer loop')
      for (let k = 0; k < 3; k++) {
        const v = I[t + k]
        out.push(`      vertex ${P[v * 3].toExponential(6)} ${P[v * 3 + 1].toExponential(6)} ${P[v * 3 + 2].toExponential(6)}`)
      }
      out.push('    endloop', '  endfacet')
    }
    out.push(`endsolid ${safe(part.name)}`)
  }
  return out.join('\n') + '\n'
}

const hexRgb = (h: string): [number, number, number] => {
  const x = h.replace('#', '')
  return [parseInt(x.slice(0, 2), 16) / 255, parseInt(x.slice(2, 4), 16) / 255, parseInt(x.slice(4, 6), 16) / 255]
}

export function toObj(parts: ExportPart[], mtlName = 'dentalpoddesign.mtl'): { obj: string; mtl: string } {
  const lines: string[] = ['# DentalPod Design — OBJ (mm)', `mtllib ${mtlName}`]
  const mtl: string[] = ['# DentalPod Design — materiais']
  let off = 1
  const seen = new Set<string>()
  for (const part of parts) {
    const mat = 'm_' + part.color.replace('#', '')
    if (!seen.has(mat)) {
      seen.add(mat)
      const [r, g, b] = hexRgb(part.color)
      mtl.push(`newmtl ${mat}`, `Kd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`, 'Ka 0 0 0', 'Ks 0.2 0.2 0.2', 'Ns 40', 'd 1', '')
    }
    lines.push(`o ${safe(part.name)}`, `usemtl ${mat}`)
    const { positions: P, indices: I } = part.mesh
    for (let i = 0; i < P.length; i += 3) lines.push(`v ${P[i].toFixed(5)} ${P[i + 1].toFixed(5)} ${P[i + 2].toFixed(5)}`)
    for (let t = 0; t < I.length; t += 3) lines.push(`f ${I[t] + off} ${I[t + 1] + off} ${I[t + 2] + off}`)
    off += P.length / 3
  }
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') }
}

/** PLY binário little-endian com cor por vértice. */
export function toPly(parts: ExportPart[]): ArrayBuffer {
  let nv = 0
  let nf = 0
  for (const p of parts) {
    nv += p.mesh.positions.length / 3
    nf += p.mesh.indices.length / 3
  }
  const header = `ply\nformat binary_little_endian 1.0\ncomment DentalPod Design (mm)\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${nf}\nproperty list uchar int vertex_indices\nend_header\n`
  const hb = new TextEncoder().encode(header)
  const buf = new ArrayBuffer(hb.length + nv * 15 + nf * 13)
  new Uint8Array(buf).set(hb)
  const dv = new DataView(buf)
  let o = hb.length
  for (const part of parts) {
    const [r, g, b] = hexRgb(part.color).map((v) => Math.round(v * 255))
    const P = part.mesh.positions
    for (let i = 0; i < P.length; i += 3) {
      dv.setFloat32(o, P[i], true); dv.setFloat32(o + 4, P[i + 1], true); dv.setFloat32(o + 8, P[i + 2], true)
      dv.setUint8(o + 12, r); dv.setUint8(o + 13, g); dv.setUint8(o + 14, b)
      o += 15
    }
  }
  let base = 0
  for (const part of parts) {
    const I = part.mesh.indices
    for (let t = 0; t < I.length; t += 3) {
      dv.setUint8(o, 3)
      dv.setInt32(o + 1, I[t] + base, true); dv.setInt32(o + 5, I[t + 1] + base, true); dv.setInt32(o + 9, I[t + 2] + base, true)
      o += 13
    }
    base += part.mesh.positions.length / 3
  }
  return buf
}

// ---- ZIP (armazenamento sem compressão) + 3MF ------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const nameB = enc.encode(f.name)
    const crc = crc32(f.data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true)
    lh.setUint16(6, 0x0800, true)
    lh.setUint16(8, 0, true)
    lh.setUint16(10, 0, true)
    lh.setUint16(12, 0x21, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, f.data.length, true)
    lh.setUint32(22, f.data.length, true)
    lh.setUint16(26, nameB.length, true)
    lh.setUint16(28, 0, true)
    chunks.push(new Uint8Array(lh.buffer), nameB, f.data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(8, 0x0800, true)
    ch.setUint16(10, 0, true)
    ch.setUint16(12, 0, true)
    ch.setUint16(14, 0x21, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, f.data.length, true)
    ch.setUint32(24, f.data.length, true)
    ch.setUint16(28, nameB.length, true)
    ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), nameB)
    offset += 30 + nameB.length + f.data.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let o = 0
  for (const c of all) {
    out.set(c, o)
    o += c.length
  }
  return out
}

/** 3MF com um objeto por peça e cor base por material (aceito por slicers modernos). */
export function to3mf(parts: ExportPart[]): Uint8Array {
  const enc = new TextEncoder()
  const colors: string[] = []
  const colorIndex = (hex: string) => {
    const k = hex.toUpperCase()
    let i = colors.indexOf(k)
    if (i < 0) {
      colors.push(k)
      i = colors.length - 1
    }
    return i
  }
  const objects: string[] = []
  const items: string[] = []
  parts.forEach((part, idx) => {
    const id = idx + 2
    const ci = colorIndex(part.color)
    const P = part.mesh.positions
    const I = part.mesh.indices
    const v: string[] = []
    for (let i = 0; i < P.length; i += 3) v.push(`<vertex x="${P[i].toFixed(5)}" y="${P[i + 1].toFixed(5)}" z="${P[i + 2].toFixed(5)}"/>`)
    const t: string[] = []
    for (let i = 0; i < I.length; i += 3) t.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`)
    objects.push(`<object id="${id}" name="${safe(part.name)}" type="model" pid="1" pindex="${ci}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`)
    items.push(`<item objectid="${id}"/>`)
  })
  const base = colors.map((c) => `<base name="${c}" displaycolor="${c}FF"/>`).join('')
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">DentalPod Design</metadata><resources><basematerials id="1">${base}</basematerials>${objects.join('')}</resources><build>${items.join('')}</build></model>`
  const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ])
}

export interface PartReport {
  name: string
  triangles: number
  size: [number, number, number]
  volumeMm3: number
  areaMm2: number
  watertight: boolean
}

export function reportParts(parts: ExportPart[]): PartReport[] {
  return parts.map((p) => {
    const s = meshStats(p.mesh)
    return { name: p.name, triangles: s.triangles, size: s.bbox.size.map((v) => +v.toFixed(2)) as [number, number, number], volumeMm3: +s.volume.toFixed(1), areaMm2: +s.area.toFixed(1), watertight: s.watertight }
  })
}

export { safe as safeName }
