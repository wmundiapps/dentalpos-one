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
  setLayout(layout: Layout, p: DesignParams, opts: { ghost?: boolean; quality?: keyof typeof QUALITY } = {}) {
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
    this.root.updateMatrixWorld(true)
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
