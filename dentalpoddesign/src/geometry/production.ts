import * as THREE from 'three'
import type { ExportSettings, Project, Variant } from '../core/types'
import { computeLayout, type Layout, type ToothPlacement } from '../core/designEngine'
import { QUALITY, buildCrown, hollowCrown, veneerShell } from './toothMesh'
import { meshStats, transformMesh, type Mesh } from './mesh'
import { bridgeConnectors, buildDenture, type NamedMesh } from './denture'
import { growMesh, subtractMeshes, unionMeshes } from './boolean'
import { hexToRgb, linearToSrgb, shadeById } from '../core/shades'
import { DESIGNED_STATUS } from '../core/types'
import type { ExportPart } from './exporters'

export interface Production {
  parts: ExportPart[]
  warnings: string[]
  layout: Layout
}

const rgbHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

export function shadeHex(id: string): string {
  const c = hexToRgb(shadeById(id).hex)
  return rgbHex(c[0], c[1], c[2])
}

/** Matriz de conversão do espaço do arco (Y para cima) para o sistema Z-para-cima da CAD. */
const clinicalMatrix = () => new THREE.Matrix4().makeRotationX(Math.PI / 2)

function placeOnPlate(parts: ExportPart[], plateW = 150, gap = 4): ExportPart[] {
  // empacotamento em prateleiras (mantém Z a partir de 0)
  const items = parts.map((p) => {
    const s = meshStats(p.mesh)
    return { p, s }
  })
  items.sort((a, b) => b.s.bbox.size[1] - a.s.bbox.size[1])
  let x = 0
  let y = 0
  let rowH = 0
  const out: ExportPart[] = []
  for (const { p, s } of items) {
    const [w, d] = [s.bbox.size[0], s.bbox.size[1]]
    if (x > 0 && x + w > plateW) {
      x = 0
      y += rowH + gap
      rowH = 0
    }
    const dx = x - s.bbox.min[0]
    const dy = y - s.bbox.min[1]
    const dz = -s.bbox.min[2]
    const pos = new Float32Array(p.mesh.positions)
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += dx
      pos[i + 1] += dy
      pos[i + 2] += dz
    }
    out.push({ ...p, mesh: { positions: pos, indices: p.mesh.indices } })
    x += w + gap
    rowH = Math.max(rowH, d)
  }
  return out
}

/** Peças de uma estrutura sem destruir a ordem de impressão: dentes isolados com a face oclusal para cima. */
function printOrient(t: ToothPlacement, mesh: Mesh): Mesh {
  // mesh já em coordenadas do arco; rotaciona para oclusal/incisal voltado para +Z
  const m = new THREE.Matrix4()
  const upper = t.arch === 'upper'
  // arco superior: incisal aponta para -Y → gira 180° em X para apontar +Z via clinicalMatrix
  m.multiply(clinicalMatrix())
  if (upper) m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI)).multiply(new THREE.Matrix4())
  return transformMesh(mesh, m)
}

export async function buildProduction(project: Project, variant: Variant, settings: ExportSettings): Promise<Production> {
  const warnings: string[] = []
  const layout = computeLayout(variant.params, variant.teeth, { cervFade: 0 })
  const q = QUALITY[settings.quality]
  const designed = layout.all.filter((t) => DESIGNED_STATUS.includes(t.cfg.status))
  const clin = clinicalMatrix()
  const parts: ExportPart[] = []
  const perToothArch = new Map<number, Mesh>()

  for (const t of designed) {
    const { mesh, grid } = buildCrown(t.spec, q)
    let m: Mesh = mesh
    const st = t.cfg.status
    if (settings.product === 'veneerShell' && st === 'veneer') {
      m = veneerShell(grid, mesh, t.spec, { thickness: settings.shellThickness, wrapDeg: 22, incisalWrap: t.n <= 3 ? 0.65 : 0 })
    } else if (settings.product === 'hollowCrown' && (st === 'crown' || st === 'implant' || st === 'veneer')) {
      m = hollowCrown(grid, t.spec, Math.max(0.5, settings.shellThickness + 0.2))
    }
    const arch = transformMesh(m, t.matrix)
    perToothArch.set(t.fdi, arch)
    const color = st === 'denture' ? shadeHex(t.arch === 'upper' ? variant.params.shade : variant.params.lowerShade) : shadeHex(t.cfg.shade ?? (t.arch === 'upper' ? variant.params.shade : variant.params.lowerShade))
    parts.push({ name: `${t.fdi}-${st}`, mesh: arch, color })
  }

  // conectores de ponte
  const conn = bridgeConnectors(layout)
  // bases e grampos
  let dentures: NamedMesh[] = []
  const hasDenture = designed.some((t) => t.cfg.status === 'denture')
  if (hasDenture && settings.includeBase) dentures = buildDenture(layout, project.denture)

  let finalParts: ExportPart[] = []
  const toothParts = parts
  try {
    if (settings.merge) {
      // monobloco: une tudo em uma malha por arco
      const items: Mesh[] = [...toothParts.map((p) => p.mesh), ...conn.map((c) => c.mesh), ...dentures.map((d) => d.mesh)]
      if (items.length) finalParts = [{ name: 'monobloco', mesh: await unionMeshes(items), color: shadeHex(variant.params.shade) }]
    } else {
      // sockets: cavidades da base nas posições dos dentes (para colagem)
      for (const d of dentures) {
        if (d.kind === 'base' && settings.gap > 0 && toothParts.length) {
          const cutters = designed.filter((t) => t.cfg.status === 'denture').map((t) => growMesh(perToothArch.get(t.fdi)!, settings.gap))
          try {
            finalParts.push({ name: d.name, mesh: cutters.length ? await subtractMeshes(d.mesh, cutters) : d.mesh, color: d.color })
            continue
          } catch (e) {
            warnings.push(`Não foi possível criar os encaixes em ${d.name}; base exportada sem cavidades.`)
          }
        }
        finalParts.push({ name: d.name, mesh: d.mesh, color: d.color })
      }
      if (!settings.splitTeeth) {
        // pontes: une conectores + unidades fixas contíguas
        const fixed = designed.filter((t) => ['crown', 'pontic', 'implant', 'veneer'].includes(t.cfg.status))
        if (conn.length && fixed.length) {
          const members = new Set<number>()
          for (const c of conn) {
            const m = /conector-(\d+)-(\d+)/.exec(c.name)
            if (m) {
              members.add(+m[1])
              members.add(+m[2])
            }
          }
          const bridgeMeshes = [...conn.map((c) => c.mesh), ...[...members].map((f) => perToothArch.get(f)!).filter(Boolean)]
          finalParts.push({ name: 'ponte', mesh: await unionMeshes(bridgeMeshes), color: shadeHex(variant.params.shade) })
          for (const p of toothParts) if (!members.has(parseInt(p.name))) finalParts.push(p)
        } else finalParts.push(...toothParts)
      } else {
        finalParts.push(...toothParts)
        for (const c of conn) finalParts.push({ name: c.name, mesh: c.mesh, color: c.color })
      }
      for (const d of dentures) if (d.kind !== 'base') finalParts.push({ name: d.name, mesh: d.mesh, color: d.color })
    }
  } catch (e) {
    console.error(e)
    warnings.push('Falha no motor de booleanas; exportadas as peças sem união/encaixes.')
    finalParts = [...toothParts, ...conn.map((c) => ({ name: c.name, mesh: c.mesh, color: c.color })), ...dentures.map((d) => ({ name: d.name, mesh: d.mesh, color: d.color }))]
  }

  // sistema de coordenadas / orientação de impressão
  let result: ExportPart[]
  if (settings.orientation === 'clinical') {
    result = finalParts.map((p) => ({ ...p, mesh: transformMesh(p.mesh, clin) }))
  } else {
    result = finalParts.map((p) => {
      const fdi = parseInt(p.name)
      const pl = Number.isFinite(fdi) ? layout.byFdi.get(fdi) : undefined
      if (pl) return { ...p, mesh: printOrient(pl, p.mesh) }
      return { ...p, mesh: transformMesh(p.mesh, clin) }
    })
    result = placeOnPlate(result)
  }
  // verificação final
  for (const r of result) {
    const s = meshStats(r.mesh)
    if (!s.watertight) warnings.push(`Peça ${r.name} não é estanque (watertight) — revisar antes de produzir.`)
  }
  if (!result.length) warnings.push('Nenhum dente marcado para produção. Defina a situação dos dentes (faceta, coroa, prótese…).')
  void linearToSrgb
  return { parts: result, warnings, layout }
}
