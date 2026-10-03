import { detectFace } from '../src/ai/faceLandmarks'
const img = new Image()
img.src = new URLSearchParams(location.search).get('img') || '/dev/portrait.jpg'
await img.decode()
const bmp = await createImageBitmap(img)
const c = document.getElementById('c') as HTMLCanvasElement
c.width = bmp.width; c.height = bmp.height
const g = c.getContext('2d')!
g.drawImage(bmp, 0, 0)
const t0 = performance.now()
const r = await detectFace(bmp)
;(window as any).__info = { ms: performance.now() - t0, ok: !!r, metrics: r?.metrics }
if (r) {
  const m = r.marks
  g.fillStyle = 'rgba(0,255,255,.6)'
  for (const p of r.points) g.fillRect(p.x - 1, p.y - 1, 2, 2)
  const dot = (p: any, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(p.x, p.y, 5, 0, 7); g.fill() }
  for (const k of ['pupilR','pupilL','midTop','midBottom','commR','commL','upMid','lowMid','alarR','alarL','zygR','zygL'] as const) dot((m as any)[k], '#ff0')
  g.strokeStyle = '#f0f'; g.lineWidth = 2; g.beginPath(); m.mouth!.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke()
}
;(window as any).__ready = true
