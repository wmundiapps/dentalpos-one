import type { Calibration, Marks, Pt } from '../core/types'
import { rng } from '../core/math'

/**
 * Foto de demonstração gerada proceduralmente (ilustração fotorrealista simplificada).
 * Serve para testar o fluxo completo sem usar imagem de paciente. Não é uma pessoa real.
 */
export const DEMO_W = 2400
export const DEMO_H = 1800
export const DEMO_PX_PER_MM = 9.2

const cx = 1200

export function demoMarks(): { marks: Marks; calib: Calibration } {
  const P = (x: number, y: number): Pt => ({ x, y })
  const marks: Marks = {
    pupilR: P(cx - 290, 640),
    pupilL: P(cx + 290, 646),
    midTop: P(cx, 560),
    midBottom: P(cx, 1500),
    commR: P(cx - 262, 1128),
    commL: P(cx + 262, 1132),
    upMid: P(cx, 1112),
    lowMid: P(cx, 1226),
    alarR: P(cx - 168, 905),
    alarL: P(cx + 168, 905),
    zygR: P(cx - 620, 760),
    zygL: P(cx + 620, 760),
    mouth: [
      P(cx - 262, 1128),
      P(cx - 205, 1121),
      P(cx - 110, 1114),
      P(cx, 1112),
      P(cx + 110, 1114),
      P(cx + 205, 1122),
      P(cx + 262, 1132),
      P(cx + 214, 1184),
      P(cx + 110, 1218),
      P(cx, 1226),
      P(cx - 110, 1218),
      P(cx - 214, 1183),
    ],
  }
  return { marks, calib: { method: 'ipd', pxPerMm: DEMO_PX_PER_MM, ipdMm: 63, refMm: 8.6 } }
}

function mouthPath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length
  ctx.beginPath()
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const m0 = mid(pts[n - 1], pts[0])
  ctx.moveTo(m0.x, m0.y)
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y)
  }
  ctx.closePath()
}

export async function makeDemoPhoto(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = DEMO_W
  c.height = DEMO_H
  const g = c.getContext('2d')!
  const R = rng(77)
  const { marks } = demoMarks()

  // fundo
  const bg = g.createLinearGradient(0, 0, 0, DEMO_H)
  bg.addColorStop(0, '#9aa7b4')
  bg.addColorStop(1, '#6f7c89')
  g.fillStyle = bg
  g.fillRect(0, 0, DEMO_W, DEMO_H)

  // pescoço / ombros
  g.fillStyle = '#c79274'
  g.beginPath()
  g.moveTo(cx - 420, 1380)
  g.quadraticCurveTo(cx - 470, 1700, cx - 700, 1800)
  g.lineTo(cx + 700, 1800)
  g.quadraticCurveTo(cx + 470, 1700, cx + 420, 1380)
  g.closePath()
  g.fill()
  g.fillStyle = '#34495e'
  g.beginPath()
  g.moveTo(cx - 1200, 1800)
  g.lineTo(cx - 700, 1640)
  g.quadraticCurveTo(cx, 1740, cx + 700, 1640)
  g.lineTo(cx + 1200, 1800)
  g.closePath()
  g.fill()

  // cabelo (fundo)
  g.fillStyle = '#2b1d16'
  g.beginPath()
  g.ellipse(cx, 420, 760, 560, 0, 0, Math.PI * 2)
  g.fill()

  // rosto
  const face = () => {
    g.beginPath()
    g.moveTo(cx, 300)
    g.bezierCurveTo(cx + 560, 300, cx + 700, 620, cx + 660, 900)
    g.bezierCurveTo(cx + 640, 1180, cx + 470, 1500, cx, 1560)
    g.bezierCurveTo(cx - 470, 1500, cx - 640, 1180, cx - 660, 900)
    g.bezierCurveTo(cx - 700, 620, cx - 560, 300, cx, 300)
    g.closePath()
  }
  face()
  const skin = g.createRadialGradient(cx - 80, 760, 80, cx, 900, 820)
  skin.addColorStop(0, '#e8bf9f')
  skin.addColorStop(0.55, '#dba98a')
  skin.addColorStop(1, '#c48d6e')
  g.fillStyle = skin
  g.fill()
  g.save()
  face()
  g.clip()
  // sombras laterais
  const side = g.createLinearGradient(cx - 700, 0, cx + 700, 0)
  side.addColorStop(0, 'rgba(70,35,20,0.35)')
  side.addColorStop(0.2, 'rgba(70,35,20,0)')
  side.addColorStop(0.8, 'rgba(70,35,20,0)')
  side.addColorStop(1, 'rgba(70,35,20,0.4)')
  g.fillStyle = side
  g.fillRect(0, 0, DEMO_W, DEMO_H)
  // bochechas
  for (const sx of [-1, 1]) {
    const bl = g.createRadialGradient(cx + sx * 400, 1030, 10, cx + sx * 400, 1030, 230)
    bl.addColorStop(0, 'rgba(214,120,110,0.38)')
    bl.addColorStop(1, 'rgba(214,120,110,0)')
    g.fillStyle = bl
    g.fillRect(cx + sx * 400 - 260, 780, 520, 520)
  }
  // sulcos nasogenianos
  g.lineCap = 'round'
  for (const sx of [-1, 1]) {
    g.strokeStyle = 'rgba(120,60,40,0.22)'
    g.lineWidth = 16
    g.beginPath()
    g.moveTo(cx + sx * 190, 930)
    g.quadraticCurveTo(cx + sx * 330, 1020, cx + sx * 330, 1160)
    g.stroke()
  }
  // sombra sob o lábio inferior / mento
  const chin = g.createRadialGradient(cx, 1330, 20, cx, 1330, 160)
  chin.addColorStop(0, 'rgba(120,60,40,0.35)')
  chin.addColorStop(1, 'rgba(120,60,40,0)')
  g.fillStyle = chin
  g.fillRect(cx - 220, 1250, 440, 240)
  g.restore()

  // nariz
  g.save()
  g.globalAlpha = 0.5
  g.strokeStyle = '#9c5e44'
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(cx - 70, 720)
  g.quadraticCurveTo(cx - 100, 860, cx - 150, 905)
  g.moveTo(cx + 70, 720)
  g.quadraticCurveTo(cx + 100, 860, cx + 150, 905)
  g.stroke()
  g.globalAlpha = 1
  const nose = g.createRadialGradient(cx, 880, 10, cx, 880, 120)
  nose.addColorStop(0, 'rgba(240,200,170,0.65)')
  nose.addColorStop(1, 'rgba(240,200,170,0)')
  g.fillStyle = nose
  g.fillRect(cx - 140, 760, 280, 220)
  g.fillStyle = 'rgba(70,30,20,0.6)'
  for (const sx of [-1, 1]) {
    g.beginPath()
    g.ellipse(cx + sx * 66, 925, 30, 15, sx * 0.3, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()

  // olhos
  for (const [p, sign] of [
    [marks.pupilR!, -1],
    [marks.pupilL!, 1],
  ] as const) {
    g.save()
    g.beginPath()
    g.moveTo(p.x - 135, p.y + 6)
    g.quadraticCurveTo(p.x, p.y - 100, p.x + 135, p.y + 6)
    g.quadraticCurveTo(p.x, p.y + 64, p.x - 135, p.y + 6)
    g.closePath()
    g.fillStyle = '#f4efe8'
    g.fill()
    g.clip()
    const iris = g.createRadialGradient(p.x, p.y, 8, p.x, p.y, 62)
    iris.addColorStop(0, '#2c1a0d')
    iris.addColorStop(0.45, '#6b4423')
    iris.addColorStop(1, '#3a2412')
    g.fillStyle = iris
    g.beginPath()
    g.arc(p.x, p.y, 60, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#050505'
    g.beginPath()
    g.arc(p.x, p.y, 24, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.beginPath()
    g.arc(p.x - 17 * sign, p.y - 18, 10, 0, Math.PI * 2)
    g.fill()
    // sombra da pálpebra superior
    const lid = g.createLinearGradient(0, p.y - 100, 0, p.y - 10)
    lid.addColorStop(0, 'rgba(90,50,40,0.55)')
    lid.addColorStop(1, 'rgba(90,50,40,0)')
    g.fillStyle = lid
    g.fillRect(p.x - 140, p.y - 100, 280, 90)
    g.restore()
    g.strokeStyle = '#3b2418'
    g.lineWidth = 9
    g.beginPath()
    g.moveTo(p.x - 138, p.y + 6)
    g.quadraticCurveTo(p.x, p.y - 104, p.x + 138, p.y + 6)
    g.stroke()
    // sobrancelha
    g.strokeStyle = '#2d1b12'
    g.lineWidth = 24
    g.beginPath()
    g.moveTo(p.x - 150, p.y - 130)
    g.quadraticCurveTo(p.x + sign * 10, p.y - 196, p.x + 150, p.y - 140 + sign * -10)
    g.stroke()
  }

  // lábios
  const mouth = marks.mouth!
  // lábio superior (volume)
  const lipGrad = g.createLinearGradient(0, 1020, 0, 1330)
  lipGrad.addColorStop(0, '#b4625a')
  lipGrad.addColorStop(1, '#c97469')
  g.fillStyle = lipGrad
  g.beginPath()
  g.moveTo(cx - 300, 1138)
  g.bezierCurveTo(cx - 230, 1060, cx - 80, 1040, cx, 1058)
  g.bezierCurveTo(cx + 80, 1040, cx + 230, 1062, cx + 300, 1142)
  g.bezierCurveTo(cx + 260, 1140, cx + 220, 1120, cx, 1100)
  g.bezierCurveTo(cx - 220, 1120, cx - 260, 1140, cx - 300, 1138)
  g.fill()
  g.beginPath()
  g.moveTo(cx - 300, 1140)
  g.bezierCurveTo(cx - 240, 1330, cx + 240, 1330, cx + 300, 1144)
  g.bezierCurveTo(cx + 250, 1190, cx + 150, 1250, cx, 1262)
  g.bezierCurveTo(cx - 150, 1250, cx - 250, 1190, cx - 300, 1140)
  g.fillStyle = '#c4695f'
  g.fill()

  // interior da boca
  mouthPath(g, mouth)
  g.fillStyle = '#2a0c0c'
  g.fill()
  g.save()
  mouthPath(g, mouth)
  g.clip()
  // dentes existentes (levemente amarelados e irregulares)
  const teeth: Array<[number, number, number, number, number]> = []
  // [x, topY, w, h, rot]
  const xs = [-1, 1]
  let acc = 0
  const wmm = [8.4, 6.4, 7.0, 6.6, 6.4, 8.0]
  const hmm = [10.2, 8.4, 9.0, 8.0, 7.6, 7.0]
  for (const side of xs) {
    acc = 0
    for (let i = 0; i < wmm.length; i++) {
      const w = wmm[i] * DEMO_PX_PER_MM * (i >= 4 ? 0.85 : 1)
      const off = side * (acc + w / 2) * (1 - i * 0.01)
      teeth.push([cx + off, 1086 + i * 5 + (i % 2) * 3, w * 0.97, hmm[i] * DEMO_PX_PER_MM, side * (i % 3 === 1 ? 0.05 : -0.02)])
      acc += w * (1 - i * 0.012)
    }
  }
  for (const [x, top, w, h, rot] of teeth) {
    g.save()
    g.translate(x, top)
    g.rotate(rot)
    const gr = g.createLinearGradient(0, 0, 0, h)
    gr.addColorStop(0, '#d9c58f')
    gr.addColorStop(0.35, '#ead9a8')
    gr.addColorStop(1, '#e6dcc2')
    g.fillStyle = gr
    g.strokeStyle = 'rgba(120,90,50,0.55)'
    g.lineWidth = 3
    g.beginPath()
    g.roundRect(-w / 2, 0, w, h, [w * 0.12, w * 0.12, w * 0.3, w * 0.3])
    g.fill()
    g.stroke()
    g.restore()
  }
  // dentes inferiores (faixa contínua com separações discretas)
  {
    const lw = 5.6 * DEMO_PX_PER_MM
    for (let i = -5; i <= 5; i++) {
      const x = cx + i * lw * 0.97
      const top = 1196 + Math.abs(i) * 6
      const gr = g.createLinearGradient(0, top, 0, top + 90)
      gr.addColorStop(0, '#e2d6b8')
      gr.addColorStop(0.6, '#cdbf9f')
      gr.addColorStop(1, '#8f8062')
      g.fillStyle = gr
      g.beginPath()
      g.roundRect(x - lw / 2, top, lw * 0.97, 90, [lw * 0.22, lw * 0.22, 4, 4])
      g.fill()
      g.strokeStyle = 'rgba(70,45,25,0.45)'
      g.lineWidth = 2
      g.stroke()
    }
  }
  // sombra do lábio superior + corredores
  const sh = g.createLinearGradient(0, 1090, 0, 1190)
  sh.addColorStop(0, 'rgba(30,5,5,0.5)')
  sh.addColorStop(0.5, 'rgba(30,5,5,0)')
  g.fillStyle = sh
  g.fillRect(cx - 320, 1090, 640, 110)
  const cor = g.createLinearGradient(cx - 280, 0, cx + 280, 0)
  cor.addColorStop(0, 'rgba(20,0,0,0.75)')
  cor.addColorStop(0.15, 'rgba(20,0,0,0)')
  cor.addColorStop(0.85, 'rgba(20,0,0,0)')
  cor.addColorStop(1, 'rgba(20,0,0,0.75)')
  g.fillStyle = cor
  g.fillRect(cx - 320, 1090, 640, 200)
  g.restore()

  // brilho do lábio inferior
  const hl = g.createRadialGradient(cx, 1290, 6, cx, 1290, 140)
  hl.addColorStop(0, 'rgba(255,225,215,0.35)')
  hl.addColorStop(1, 'rgba(255,225,215,0)')
  g.fillStyle = hl
  g.fillRect(cx - 160, 1230, 320, 130)

  // cabelo (frente / franja)
  g.fillStyle = '#2b1d16'
  g.beginPath()
  g.moveTo(cx - 640, 700)
  g.bezierCurveTo(cx - 700, 430, cx - 420, 250, cx, 262)
  g.bezierCurveTo(cx + 420, 250, cx + 700, 430, cx + 640, 700)
  g.bezierCurveTo(cx + 640, 520, cx + 420, 440, cx + 200, 410)
  g.bezierCurveTo(cx + 60, 420, cx - 160, 430, cx - 300, 470)
  g.bezierCurveTo(cx - 520, 520, cx - 640, 520, cx - 640, 700)
  g.fill()

  // ruído de "sensor" + leve desfoque
  const id = g.getImageData(0, 0, DEMO_W, DEMO_H)
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (R() - 0.5) * 9
    id.data[i] += n
    id.data[i + 1] += n
    id.data[i + 2] += n
  }
  g.putImageData(id, 0, 0)

  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob falhou'))), 'image/jpeg', 0.92))
}
