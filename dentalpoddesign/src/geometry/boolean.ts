import type { Mesh } from './mesh'
import { orientMesh, weld } from './mesh'

/* eslint-disable @typescript-eslint/no-explicit-any */
let modP: Promise<any> | null = null

/** Carrega o motor de booleanas (WASM) sob demanda. */
export function getManifold(): Promise<any> {
  if (!modP) {
    modP = (async () => {
      const { default: Module } = await import('manifold-3d')
      let m: any
      if (typeof window !== 'undefined') {
        const url = (await import('manifold-3d/manifold.wasm?url')).default as string
        m = await Module({ locateFile: () => url })
      } else m = await Module()
      m.setup()
      return m
    })()
  }
  return modP
}

function toM(M: any, mesh: Mesh) {
  const w = weld(orientMesh(mesh), 1e-5)
  const m = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(w.positions), triVerts: new Uint32Array(w.indices) })
  return M.Manifold.ofMesh(m)
}

function fromM(man: any): Mesh {
  const g = man.getMesh()
  const n = g.numProp
  const vp: Float32Array = g.vertProperties
  const pos = new Float32Array((vp.length / n) * 3)
  for (let i = 0, j = 0; i < vp.length; i += n, j += 3) {
    pos[j] = vp[i]
    pos[j + 1] = vp[i + 1]
    pos[j + 2] = vp[i + 2]
  }
  return { positions: pos, indices: new Uint32Array(g.triVerts) }
}

export async function unionMeshes(list: Mesh[]): Promise<Mesh> {
  const M = await getManifold()
  const ms = list.map((m) => toM(M, m))
  const u = M.Manifold.union(ms)
  const out = fromM(u)
  ms.forEach((x: any) => x.delete?.())
  u.delete?.()
  return out
}

export async function subtractMeshes(a: Mesh, cutters: Mesh[]): Promise<Mesh> {
  const M = await getManifold()
  const A = toM(M, a)
  const cs = cutters.map((m) => toM(M, m))
  const C = cs.length === 1 ? cs[0] : M.Manifold.union(cs)
  const r = A.subtract(C)
  const out = fromM(r)
  A.delete?.()
  cs.forEach((x: any) => x.delete?.())
  r.delete?.()
  return out
}

/** Escala uniformemente em torno do centro da caixa (folga de encaixe). */
export function growMesh(m: Mesh, gap: number): Mesh {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  const P = m.positions
  for (let i = 0; i < P.length; i += 3) {
    x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i])
    y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1])
    z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2])
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2
  const sx = 1 + (2 * gap) / Math.max(1, x1 - x0)
  const sy = 1 + (2 * gap) / Math.max(1, y1 - y0)
  const sz = 1 + (2 * gap) / Math.max(1, z1 - z0)
  const out = new Float32Array(P.length)
  for (let i = 0; i < P.length; i += 3) {
    out[i] = cx + (P[i] - cx) * sx
    out[i + 1] = cy + (P[i + 1] - cy) * sy
    out[i + 2] = cz + (P[i + 2] - cz) * sz
  }
  return { positions: out, indices: m.indices }
}
