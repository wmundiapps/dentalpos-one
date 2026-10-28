import { useEffect, useRef, useState } from "react";

// Reconhecimento facial no navegador (códigos do rosto; nenhuma foto sai do aparelho).
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

export async function describeFace(faceapi: FaceApiModule, video: HTMLVideoElement) {
  const found = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })).withFaceLandmarks(true).withFaceDescriptors();
  if (found.length !== 1) return { count: found.length, descriptor: null as number[] | null };
  return { count: 1, descriptor: Array.from(found[0].descriptor) };
}
