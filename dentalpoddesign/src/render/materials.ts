import * as THREE from 'three'
import { rng } from '../core/math'

let bump: THREE.CanvasTexture | null = null

/** Textura de relevo do esmalte: periquimatas (linhas horizontais finas), lóbulos de desenvolvimento e poros. */
export function enamelBump(): THREE.CanvasTexture {
  if (bump) return bump
  const W = 512
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'
  g.fillRect(0, 0, W, H)
  const r = rng(1234)
  // periquimatas: faixas horizontais onduladas (v = vertical)
  for (let y = 0; y < H; y += 2) {
    const amp = 6 + r() * 14
    g.globalAlpha = 0.06 + r() * 0.08
    g.strokeStyle = r() > 0.5 ? '#ffffff' : '#000000'
    g.lineWidth = 1 + r() * 1.2
    g.beginPath()
    for (let x = 0; x <= W; x += 16) {
      const yy = y + Math.sin(x * 0.03 + y * 0.2) * 1.2 + (r() - 0.5) * 0.8
      if (x === 0) g.moveTo(x, yy)
      else g.lineTo(x, yy)
    }
    g.stroke()
    void amp
  }
  // lóbulos verticais suaves
  g.globalAlpha = 1
  const grad = g.createLinearGradient(0, 0, W, 0)
  for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, i % 4 === 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.04)')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  // ruído fino
  const id = g.getImageData(0, 0, W, H)
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (r() - 0.5) * 22
    id.data[i] += n
    id.data[i + 1] += n
    id.data[i + 2] += n
  }
  g.putImageData(id, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  bump = tex
  return tex
}

export interface EnamelOpts {
  gloss: number
  texture: number
}

export function enamelMaterial(o: EnamelOpts, alpha = true): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.42 - 0.26 * o.gloss,
    metalness: 0,
    clearcoat: 0.25 + 0.7 * o.gloss,
    clearcoatRoughness: 0.18,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0.9, 0.93, 1),
    bumpMap: enamelBump(),
    bumpScale: 0.35 * o.texture + 0.02,
    envMapIntensity: 0.12,
    transparent: alpha,
    side: THREE.FrontSide,
  })
  return m
}

export function ghostMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xaab4c4, roughness: 0.7, transparent: true, opacity: 0.18, depthWrite: false })
}

export function baseMaterial(hex: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    roughness: 0.38,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffd2d8'),
    side: THREE.FrontSide,
  })
}
