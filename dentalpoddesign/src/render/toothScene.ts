import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { DesignParams } from '../core/types'
import { DEG } from '../core/math'
import type { Layout, ToothPlacement } from '../core/designEngine'
import { QUALITY, buildCrown, frontalSilhouette, type CrownSpec } from '../geometry/toothMesh'
import type { Mesh } from '../geometry/mesh'
import { enamelMaterial, ghostMaterial } from './materials'

export function meshToGeometry(m: Mesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
  if (m.normals) g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
  else g.computeVertexNormals()
  if (m.colors) {
    const n = m.positions.length / 3
    const c = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      c[i * 4] = m.colors[i * 3]
      c[i * 4 + 1] = m.colors[i * 3 + 1]
      c[i * 4 + 2] = m.colors[i * 3 + 2]
      c[i * 4 + 3] = m.alphas ? m.alphas[i] : 1
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 4))
  }
  if (m.uvs) g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  g.computeBoundingSphere()
  return g
}

const specKey = (s: CrownSpec, q: string) => q + JSON.stringify(s)

interface Cached {
  geometry: THREE.BufferGeometry
  silhouette: Array<[number, number]>
}

/** Cena Three.js com os dentes projetados; reutilizada pelo overlay fotográfico e pelo visualizador 3D. */
export class ToothScene {
  readonly scene = new THREE.Scene()
  readonly root = new THREE.Group()
  readonly extras = new THREE.Group()
  readonly papillae = new THREE.Group()
  readonly teeth = new Map<number, THREE.Mesh>()
  readonly silhouettes = new Map<number, Array<[number, number]>>()
  private cache = new Map<string, Cached>()
  private material: THREE.MeshPhysicalMaterial
  private ghostMat = ghostMaterial()
  private key: THREE.DirectionalLight
  private fill: THREE.DirectionalLight
  private rim: THREE.DirectionalLight
  private amb: THREE.AmbientLight
  private pmrem?: THREE.PMREMGenerator
  private envTex?: THREE.Texture

  constructor(renderer: THREE.WebGLRenderer) {
    this.scene.add(this.root)
    this.root.add(this.extras)
    this.root.add(this.papillae)
    this.material = enamelMaterial({ gloss: 0.55, texture: 0.5 })
    this.amb = new THREE.AmbientLight(0xffffff, 0.55)
    this.key = new THREE.DirectionalLight(0xfff6ee, 1.45)
    this.key.position.set(-120, 180, 260)
    this.fill = new THREE.DirectionalLight(0xdfe9ff, 0.5)
    this.fill.position.set(160, 20, 200)
    this.rim = new THREE.DirectionalLight(0xffffff, 0.25)
    this.rim.position.set(0, -120, 120)
    this.scene.add(this.amb, this.key, this.fill, this.rim)
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = this.envTex
    this.scene.environmentIntensity = 0.22
  }

  setMaterial(p: DesignParams) {
    const m = enamelMaterial({ gloss: p.gloss, texture: p.texture })
    m.envMap = null
    this.material.dispose()
    this.material = m
    for (const mesh of this.teeth.values()) if (!mesh.userData.ghost) mesh.material = m
  }

  setPose(p: DesignParams, rollDeg: number) {
    this.root.rotation.set(0, 0, 0)
    this.root.rotateZ(-rollDeg * DEG)
    this.root.rotateY(p.yaw * DEG)
    this.root.rotateX(p.pitch * DEG)
    this.root.position.set(p.midlineShift, 0, 0)
    this.root.updateMatrixWorld(true)
  }

  private geometryFor(spec: CrownSpec, quality: keyof typeof QUALITY): Cached {
    const k = specKey(spec, quality)
    let c = this.cache.get(k)
    if (!c) {
      const { mesh } = buildCrown(spec, QUALITY[quality])
      c = { geometry: meshToGeometry(mesh), silhouette: frontalSilhouette(mesh) }
      this.cache.set(k, c)
      if (this.cache.size > 400) {
        const first = this.cache.keys().next().value as string
        this.cache.get(first)?.geometry.dispose()
        this.cache.delete(first)
      }
    }
    return c
  }

  /** Atualiza as malhas dos dentes conforme o layout. */
  setLayout(layout: Layout, p: DesignParams, opts: { ghost?: boolean; quality?: keyof typeof QUALITY; papillae?: string | null } = {}) {
    const quality = opts.quality ?? 'standard'
    this.setMaterial(p)
    for (const [fdi, mesh] of this.teeth) {
      if (!layout.byFdi.has(fdi)) {
        this.root.remove(mesh)
        this.teeth.delete(fdi)
        this.silhouettes.delete(fdi)
      }
    }
    for (const t of layout.all) {
      const show = t.designed || opts.ghost
      let mesh = this.teeth.get(t.fdi)
      if (!show) {
        if (mesh) {
          this.root.remove(mesh)
          this.teeth.delete(t.fdi)
          this.silhouettes.delete(t.fdi)
        }
        continue
      }
      const c = this.geometryFor(t.spec, quality)
      if (!mesh) {
        mesh = new THREE.Mesh(c.geometry, this.material)
        mesh.matrixAutoUpdate = false
        this.root.add(mesh)
        this.teeth.set(t.fdi, mesh)
      }
      mesh.geometry = c.geometry
      mesh.userData.fdi = t.fdi
      mesh.userData.ghost = !t.designed
      mesh.material = t.designed ? this.material : this.ghostMat
      mesh.matrix.copy(t.matrix)
      mesh.matrixWorldNeedsUpdate = true
      mesh.renderOrder = t.designed ? 1 : 0
      this.silhouettes.set(t.fdi, c.silhouette)
    }
    this.buildPapillae(layout, opts.papillae ?? null)
    this.root.updateMatrixWorld(true)
  }

  /** Papilas gengivais virtuais: preenchem a embrasura cervical entre dentes vizinhos (sem fundo escuro). */
  private buildPapillae(layout: Layout, color: string | null) {
    for (const c of [...this.papillae.children]) {
      this.papillae.remove(c)
      ;(c as THREE.Mesh).geometry.dispose()
    }
    if (!color) return
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.55, metalness: 0, vertexColors: true, transparent: true, side: THREE.DoubleSide })
    for (const list of [layout.upper, layout.lower]) {
      for (const side of [-1, 1] as const) {
        const row = list.filter((t) => t.side === side && t.designed && t.n <= 6).sort((a, b) => a.n - b.n)
        const pairs: Array<[ToothPlacement, ToothPlacement]> = []
        for (let i = 1; i < row.length; i++) if (row[i].n === row[i - 1].n + 1) pairs.push([row[i - 1], row[i]])
        // papila entre os centrais (linha média)
        const mid1 = list.find((t) => t.side === -1 && t.n === 1 && t.designed)
        const mid2 = list.find((t) => t.side === 1 && t.n === 1 && t.designed)
        if (side === 1 && mid1 && mid2) pairs.push([mid1, mid2])
        for (const [A, B] of pairs) {
          const up = A.arch === 'upper'
          const dir = up ? 1 : -1
          const pos = A.position.clone().add(B.position).multiplyScalar(0.5)
          const xa = new THREE.Vector3(A.matrix.elements[0], 0, A.matrix.elements[2])
          const xb = new THREE.Vector3(B.matrix.elements[0], 0, B.matrix.elements[2])
          if (A.side !== B.side) xb.negate()
          const xAxis = xa.clone().multiplyScalar(A.side).add(xb.multiplyScalar(B.side)).normalize()
          const zAxis = new THREE.Vector3(-xAxis.z, 0, xAxis.x)
          const frame = new THREE.Matrix4().makeBasis(xAxis, new THREE.Vector3(0, 1, 0), zAxis)
          const tc = (A.spec.tcD + B.spec.tcM) / 2
          const H = (A.spec.H + B.spec.H) / 2
          const yContact = pos.y + dir * (1 - tc) * H
          const yZ = (A.zenithY + B.zenithY) / 2 + dir * 0.9
          const wTop = 3.2
          const zc = -1.1
          const verts: number[] = []
          const cols: number[] = []
          const c0 = new THREE.Color(color)
          const push = (x: number, y: number, z: number, a: number) => {
            const v = new THREE.Vector3(x, 0, zc + z)
            v.applyMatrix4(frame)
            verts.push(v.x + pos.x, y, v.z + pos.z)
            cols.push(c0.r, c0.g, c0.b, a)
          }
          const zf = 0.55
          const zb = -0.55
          const yMid = yZ + 0.32 * (yContact - yZ)
          for (const z of [zf, zb]) {
            push(-wTop / 2, yZ, z, 0) // 0,5
            push(wTop / 2, yZ, z, 0) // 1,6
            push(-wTop * 0.42, yMid, z, 1) // 2,7
            push(wTop * 0.42, yMid, z, 1) // 3,8
            push(0, yContact, z, 1) // 4,9
          }
          const idx = [
            0, 1, 3, 0, 3, 2, 2, 3, 4, // frente
            5, 8, 6, 5, 7, 8, 7, 9, 8, // trás
            0, 2, 7, 0, 7, 5, 2, 4, 9, 2, 9, 7, // lado esquerdo
            1, 6, 8, 1, 8, 3, 3, 8, 9, 3, 9, 4, // lado direito
          ]
          const g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4))
          g.setIndex(idx)
          g.computeVertexNormals()
          const m = new THREE.Mesh(g, mat)
          m.renderOrder = 0
          this.papillae.add(m)
        }
      }
    }
  }

  placementOf(layout: Layout, fdi: number): ToothPlacement | undefined {
    return layout.byFdi.get(fdi)
  }

  setLights(azimuthDeg: number, intensity = 1) {
    const a = azimuthDeg * DEG
    this.key.position.set(Math.sin(a) * 260, 180, Math.cos(a) * 260)
    this.key.intensity = 1.45 * intensity
  }

  dispose() {
    for (const c of this.cache.values()) c.geometry.dispose()
    this.cache.clear()
    this.material.dispose()
    this.ghostMat.dispose()
    this.envTex?.dispose()
    this.pmrem?.dispose()
  }
}
