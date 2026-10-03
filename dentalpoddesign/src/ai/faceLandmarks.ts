import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Marks, Pt } from '../core/types'

/**
 * Detecção automática de pontos faciais (IA) — MediaPipe Face Landmarker (478 pontos + íris), executado
 * 100% no navegador: a foto não sai do computador. Modelo e WASM ficam em /mediapipe (offline).
 */
export type FaceShape = 'square' | 'round' | 'oval' | 'triangular'

export interface FaceMetrics {
  shape: FaceShape
  shapeLabel: string
  lengthWidth: number // altura/largura da face
  jawCheek: number // largura mandibular / largura zigomática
  smile: number // 0–1 (blendshapes de sorriso)
  jawOpen: number
  yaw: number // graus estimados (assimetria horizontal dos olhos)
  roll: number
  confidence: number
}

export interface FaceDetection {
  marks: Marks
  metrics: FaceMetrics
  points: Pt[] // 478 pontos em px (para depuração/visualização)
}

let landmarker: Promise<FaceLandmarker> | null = null

const base = () => new URL('mediapipe/', document.baseURI).href

export function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(base() + 'wasm')
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: base() + 'face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
      })
    })().catch((e) => {
      landmarker = null
      throw e
    })
  }
  return landmarker
}

const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]

const avg = (...p: Pt[]): Pt => ({ x: p.reduce((a, b) => a + b.x, 0) / p.length, y: p.reduce((a, b) => a + b.y, 0) / p.length })
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export function classifyFace(P: Pt[]): Pick<FaceMetrics, 'shape' | 'shapeLabel' | 'lengthWidth' | 'jawCheek'> {
  const cheek = dist(P[234], P[454])
  const jaw = dist(P[172], P[397])
  const len = dist(P[10], P[152])
  const lw = len / cheek
  const jc = jaw / cheek
  let shape: FaceShape = 'oval'
  if (jc < 0.74 && lw >= 1.1) shape = 'triangular'
  else if (jc >= 0.86 && lw < 1.32) shape = 'square'
  else if (lw < 1.2) shape = 'round'
  else shape = 'oval'
  const labels: Record<FaceShape, string> = { square: 'Quadrado', round: 'Arredondado', oval: 'Oval', triangular: 'Triangular / coração' }
  return { shape, shapeLabel: labels[shape], lengthWidth: lw, jawCheek: jc }
}

export function marksFromLandmarks(P: Pt[]): Marks {
  const sortX = (a: Pt, b: Pt): [Pt, Pt] => (a.x <= b.x ? [a, b] : [b, a])
  const [pupilR, pupilL] = sortX(P[468], P[473])
  const [commR, commL] = sortX(P[61], P[291])
  const [alarR, alarL] = sortX(P[129], P[358])
  const [zygR, zygL] = sortX(P[234], P[454])
  const eyeMid = avg(P[133], P[362])
  const midTop = avg(P[168], eyeMid)
  const midBottom = P[152]
  return {
    pupilR,
    pupilL,
    midTop,
    midBottom,
    commR,
    commL,
    upMid: P[13],
    lowMid: P[14],
    alarR,
    alarL,
    zygR,
    zygL,
    mouth: LIP_INNER.map((i) => ({ ...P[i] })),
  }
}

export async function detectFace(bmp: ImageBitmap): Promise<FaceDetection | null> {
  const lm = await getLandmarker()
  // o modelo trabalha melhor com ~1000–1600 px; reduz fotos muito grandes
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  let src: ImageBitmap | HTMLCanvasElement = bmp
  if (k < 1) {
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    src = c
  }
  const res: FaceLandmarkerResult = lm.detect(src as unknown as HTMLCanvasElement)
  const f = res.faceLandmarks?.[0]
  if (!f || f.length < 468) return null
  const P: Pt[] = f.map((q) => ({ x: q.x * bmp.width, y: q.y * bmp.height }))
  if (P.length < 478) return null // sem íris: não dá para localizar pupilas
  const marks = marksFromLandmarks(P)
  const bs = res.faceBlendshapes?.[0]?.categories ?? []
  const get = (n: string) => bs.find((c) => c.categoryName === n)?.score ?? 0
  const smile = (get('mouthSmileLeft') + get('mouthSmileRight')) / 2
  const shape = classifyFace(P)
  const yaw = ((dist(P[33], P[1]) - dist(P[263], P[1])) / Math.max(1, dist(P[33], P[263]))) * 90
  const roll = (Math.atan2(P[473].y - P[468].y, P[473].x - P[468].x) * 180) / Math.PI
  return {
    marks,
    points: P,
    metrics: { ...shape, smile, jawOpen: get('jawOpen'), yaw, roll, confidence: 1 },
  }
}
