// Detecção facial local (sem enviar a foto para fora): face-api (TinyFaceDetector + landmarks 68), pesos embutidos no programa.
import { landmarksFrom68, type FaceMetrics, type P2 } from "./faceLandmarks";
import type { PhotoLandmarks } from "../core/project";
import { tinyBin, tinyManifest, landmarkBin, landmarkManifest } from "./models/weights";

export interface FaceDetection { landmarks: PhotoLandmarks; metrics: FaceMetrics; score: number; raw: P2[] }

type FaceApi = typeof import("@vladmandic/face-api");
let loaded: Promise<FaceApi> | null = null;

function bytes(b64: string): ArrayBuffer { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

async function load(): Promise<FaceApi> {
  const faceapi = await import("@vladmandic/face-api");
  const tf = faceapi.tf as unknown as { setBackend(n: string): Promise<boolean>; ready(): Promise<void>; io: { decodeWeights(b: ArrayBuffer, w: unknown): unknown } };
  try { await tf.setBackend("webgl"); await tf.ready(); } catch { await tf.setBackend("cpu"); await tf.ready(); }
  const dec = async (bin: string, manifest: Array<{ weights: unknown[] }>) => tf.io.decodeWeights(bytes(bin), manifest[0].weights);
  await faceapi.nets.tinyFaceDetector.loadFromWeightMap(await dec(tinyBin, tinyManifest) as never);
  await faceapi.nets.faceLandmark68Net.loadFromWeightMap(await dec(landmarkBin, landmarkManifest) as never);
  return faceapi;
}

/** Detecta o rosto principal e devolve os marcos do simulador (pupilas, linha média, lábios, comissuras, contorno da boca, forma do rosto). */
export async function detectFace(source: HTMLImageElement | HTMLCanvasElement): Promise<FaceDetection | null> {
  loaded ??= load();
  const faceapi = await loaded;
  for (const inputSize of [512, 704, 416]) {
    const r = await faceapi.detectSingleFace(source, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.25 })).withFaceLandmarks();
    if (r) {
      const raw = r.landmarks.positions.map((p) => [p.x, p.y] as P2);
      const m = landmarksFrom68(raw);
      return { ...m, score: r.detection.score, raw };
    }
  }
  return null;
}
