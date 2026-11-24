import { useEffect, useRef, useState } from "react";

// Reconhecimento facial no navegador (o código do rosto é calculado aqui; no ponto, uma foto pequena é enviada como comprovante).
export type FaceApiModule = typeof import("@vladmandic/face-api");
let apiPromise: Promise<FaceApiModule> | null = null;
export function loadFaceApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      const tf = faceapi.tf as unknown as { setBackend: (n: string) => Promise<boolean>; getBackend: () => string; ready: () => Promise<void> };
      await tf.setBackend("webgl").catch(() => undefined);
      if (tf.getBackend() !== "webgl") await tf.setBackend("cpu");
      await tf.ready();
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("/face-models"), faceapi.nets.faceLandmark68TinyNet.loadFromUri("/face-models"), faceapi.nets.faceRecognitionNet.loadFromUri("/face-models")]);
      return faceapi;
    })();
    apiPromise.catch(() => { apiPromise = null; });
  }
  return apiPromise;
}

export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().then(() => setReady(true)); }
      })
      .catch(() => setError("Não consegui abrir a câmera. Permita o uso da câmera no navegador (cadeado ao lado do endereço) e tente de novo."));
    if (!navigator.mediaDevices) setError("Este navegador não permite usar a câmera.");
    return () => { cancelled = true; setReady(false); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active]);
  return { videoRef, ready, error };
}

// Aquece o reconhecimento (compila o WebGL e carrega os modelos) para a primeira leitura não demorar.
let warmed = false;
export async function warmUpFace() {
  if (warmed) return;
  try {
    const faceapi = await loadFaceApi();
    const c = document.createElement("canvas"); c.width = 160; c.height = 120;
    await faceapi.detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withFaceLandmarks(true).withFaceDescriptors();
    warmed = true;
  } catch { /* o aquecimento é opcional */ }
}

// Duas etapas: primeiro só acha o rosto (rápido); o código do rosto, que é a parte pesada, só é calculado quando há um rosto único e grande o bastante.
export async function describeFace(faceapi: FaceApiModule, video: HTMLVideoElement) {
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.5 });
  const dets = await faceapi.detectAllFaces(video, opts);
  if (dets.length !== 1) return { count: dets.length, descriptor: null as number[] | null, far: false };
  const vw = video.videoWidth || 640;
  if (dets[0].box.width < vw * 0.16) return { count: 1, descriptor: null as number[] | null, far: true };
  const found = await faceapi.detectAllFaces(video, opts).withFaceLandmarks(true).withFaceDescriptors();
  if (found.length !== 1) return { count: found.length, descriptor: null as number[] | null, far: false };
  return { count: 1, descriptor: Array.from(found[0].descriptor), far: false };
}

// Foto reduzida (largura 320, JPEG) do quadro atual da câmera, já espelhada como o colaborador se vê.
export function snapshot(video: HTMLVideoElement) {
  const w = 320;
  const h = Math.round((video.videoHeight / (video.videoWidth || 1)) * w) || 240;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.65);
}
