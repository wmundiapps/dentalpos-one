import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { activeVariant } from '../core/project'
import { computeLayout } from '../core/designEngine'
import { ToothScene, meshToGeometry } from '../render/toothScene'
import { buildDenture } from '../geometry/denture'
import { baseMaterial } from '../render/materials'
import { parseMesh } from '../geometry/importers'
import { getBlob } from '../store/db'
import { useApp } from '../store/store'
import { computeNormals } from '../geometry/mesh'
import type { Mesh } from '../geometry/mesh'

const modelCache = new Map<string, Mesh>()

export async function loadModelMesh(projectId: string, id: string): Promise<Mesh | null> {
  const k = projectId + id
  if (modelCache.has(k)) return modelCache.get(k)!
  const b = await getBlob(`${projectId}/model/${id}`)
  if (!(b instanceof ArrayBuffer)) return null
  const name = (b.byteLength > 5 ? 'x.stl' : 'x.stl')
  // o formato é guardado no nome do modelo (meta); aqui tenta STL → OBJ → PLY
  let m: Mesh | null = null
  for (const ext of ['stl', 'ply', 'obj']) {
    try {
      m = parseMesh(`m.${ext}`, b)
      if (m.indices.length) break
    } catch {
      m = null
    }
  }
  void name
  if (m) modelCache.set(k, m)
  return m
}
export const forgetModel = (projectId: string, id: string) => modelCache.delete(projectId + id)

export function Viewer3D() {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ update: () => void; view: (n: string) => void; dispose: () => void } | null>(null)
  const project = useApp((s) => s.project)
  const rev = useApp((s) => s.rev)
  const v3d = useApp((s) => s.v3d)
  const cam = useApp((s) => s.camCmd)
  const selected = useApp((s) => s.selected)
  const [measure, setMeasure] = useState<string>('')
  const stateRef = useRef({ project, v3d, selected })
  stateRef.current = { project, v3d, selected }

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.localClippingEnabled = true
    el.appendChild(renderer.domElement)
    const ts = new ToothScene(renderer)
    ts.scene.environmentIntensity = 0.5
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000)
    camera.position.set(0, 20, 150)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, -10)
    controls.enableDamping = true
    controls.update()
    const grid = new THREE.GridHelper(200, 20, 0x3a4f6e, 0x233248)
    grid.position.y = -40
    ts.scene.add(grid)
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    const extra = new THREE.Group()
    ts.scene.add(extra)
    const mPts: THREE.Vector3[] = []
    let mLine: THREE.Line | null = null
    let disposed = false
    const ray = new THREE.Raycaster()

    const resize = () => {
      const r = el.getBoundingClientRect()
      renderer.setSize(r.width, r.height, false)
      camera.aspect = r.width / Math.max(1, r.height)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const clearGroup = (g: THREE.Group) => {
      for (const c of [...g.children]) {
        g.remove(c)
        const m = c as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      }
    }

    const update = () => {
      const { project: p, v3d: o, selected: sel } = stateRef.current
      const v = activeVariant(p)
      const layout = computeLayout(v.params, v.teeth, { cervFade: 0 })
      ts.setLayout(layout, v.params, { ghost: o.ghost, quality: 'standard' })
      ts.setPose(v.params, 0)
      ts.root.rotation.set(0, 0, 0)
      ts.root.position.set(0, 0, 0)
      ts.root.updateMatrixWorld(true)
      clearGroup(ts.extras)
      const ws: THREE.Material[] = []
      for (const t of ts.teeth.values()) {
        const mat = t.material as THREE.MeshPhysicalMaterial
        if (!t.userData.ghost && mat) {
          mat.wireframe = o.wire
          mat.clippingPlanes = o.section ? [plane] : []
          mat.vertexColors = true
          ws.push(mat)
        }
        t.scale.set(1, 1, 1)
      }
      for (const t of ts.teeth.values()) {
        const f = t.userData.fdi as number
        ;(t.material as THREE.Material & { emissive?: THREE.Color }).emissive?.setHex?.(f === sel ? 0x103a3a : 0x000000)
      }
      plane.constant = o.sectionX
      if (o.base) {
        for (const d of buildDenture(layout, p.denture)) {
          if (d.kind === 'base' || d.kind === 'connector') {
            const m = baseMaterial(d.color)
            m.clippingPlanes = o.section ? [plane] : []
            m.wireframe = o.wire
            m.side = THREE.DoubleSide
            const mesh = new THREE.Mesh(meshToGeometry({ ...d.mesh, normals: computeNormals(d.mesh) }), m)
            ts.extras.add(mesh)
          } else {
            const m = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.3 })
            ts.extras.add(new THREE.Mesh(meshToGeometry({ ...d.mesh, normals: computeNormals(d.mesh) }), m))
          }
        }
      }
      clearGroup(extra)
      if (o.models) {
        for (const md of p.models) {
          if (!md.visible) continue
          void loadModelMesh(p.id, md.id).then((mm) => {
            if (!mm || disposed) return
            const g = meshToGeometry({ ...mm, normals: computeNormals(mm) })
            const mat = new THREE.MeshStandardMaterial({ color: md.arch === 'upper' ? 0xd8c9a8 : md.arch === 'lower' ? 0xb5c3d8 : 0xc7a8a8, transparent: md.opacity < 1, opacity: md.opacity, roughness: 0.6 })
            const mesh = new THREE.Mesh(g, mat)
            mesh.rotation.set((md.rx * Math.PI) / 180, (md.ry * Math.PI) / 180, (md.rz * Math.PI) / 180)
            mesh.position.set(md.tx, md.ty, md.tz)
            mesh.scale.setScalar(md.scale)
            extra.add(mesh)
          })
        }
      }
      grid.visible = true
      ts.scene.background = new THREE.Color(o.bg === 'dark' ? 0x0f1722 : 0xe9eef5)
      renderer.clippingPlanes = []
    }

    const view = (n: string) => {
      const d = 150
      controls.target.set(0, -2, -12)
      if (n === 'front') camera.position.set(0, 4, d)
      if (n === 'left') camera.position.set(d, 4, -10)
      if (n === 'right') camera.position.set(-d, 4, -10)
      if (n === 'top') camera.position.set(0, d, -11.9)
      if (n === 'bottom') camera.position.set(0, -d, -11.9)
      if (n === 'oblique') camera.position.set(d * 0.6, d * 0.35, d * 0.75)
      camera.up.set(0, 1, n === 'top' || n === 'bottom' ? 0 : 0)
      if (n === 'top') camera.up.set(0, 0, -1)
      if (n === 'bottom') camera.up.set(0, 0, 1)
      camera.lookAt(controls.target)
      controls.update()
    }

    let raf = 0
    const loop = () => {
      if (disposed) return
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(ts.scene, camera)
    }
    loop()

    const onClick = (e: PointerEvent) => {
      if (!stateRef.current.v3d.measure) return
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects([...ts.teeth.values(), ...ts.extras.children, ...extra.children], false)[0]
      if (!hit) return
      if (mPts.length >= 2) mPts.length = 0
      mPts.push(hit.point.clone())
      if (mLine) {
        ts.scene.remove(mLine)
        mLine.geometry.dispose()
        mLine = null
      }
      if (mPts.length === 2) {
        mLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mPts), new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false }))
        mLine.renderOrder = 10
        ts.scene.add(mLine)
        setMeasure(`${mPts[0].distanceTo(mPts[1]).toFixed(2).replace('.', ',')} mm  (Δx ${Math.abs(mPts[0].x - mPts[1].x).toFixed(2)} · Δy ${Math.abs(mPts[0].y - mPts[1].y).toFixed(2)} · Δz ${Math.abs(mPts[0].z - mPts[1].z).toFixed(2)})`)
      } else setMeasure('Clique no segundo ponto')
    }
    renderer.domElement.addEventListener('pointerdown', onClick)

    api.current = {
      update,
      view,
      dispose: () => {
        disposed = true
        cancelAnimationFrame(raf)
        ro.disconnect()
        renderer.domElement.removeEventListener('pointerdown', onClick)
        controls.dispose()
        clearGroup(ts.extras)
        clearGroup(extra)
        ts.dispose()
        renderer.dispose()
        renderer.domElement.remove()
      },
    }
    update()
    view('front')
    return () => api.current?.dispose()
  }, [])

  useEffect(() => {
    api.current?.update()
  }, [rev, v3d, selected, project.id])
  useEffect(() => {
    api.current?.view(cam.name)
  }, [cam])
  useEffect(() => {
    if (!v3d.measure) setMeasure('')
  }, [v3d.measure])

  return (
    <div className="viewer3d" ref={host}>
      {v3d.measure && (
        <div className="stagehint" style={{ top: 12, bottom: 'auto' }}>
          Medição: clique em dois pontos do modelo. <b>{measure}</b>
        </div>
      )}
    </div>
  )
}
