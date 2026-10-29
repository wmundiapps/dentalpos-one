// Motor de reconhecimento facial NO NAVEGADOR (@vladmandic/face-api). Nenhuma imagem sai do aparelho:
// o vídeo é processado localmente e só o vetor (embedding de 128 números) é enviado ao servidor.
// Os modelos ficam em /models/face (servidos pelo próprio sistema, sem CDN). Carregamento sob demanda.

export const MODELO_FACIAL = "face-api-128";

type FaceApi = any;
let carregando: Promise<FaceApi> | null = null;

export function carregarMotor(): Promise<FaceApi> {
  if (!carregando) {
    carregando = (async () => {
      const faceapi: FaceApi = await import("@vladmandic/face-api");
      try { await faceapi.tf.setBackend("webgl"); } catch { await faceapi.tf.setBackend("cpu"); }
      await faceapi.tf.ready();
      const base = `${import.meta.env.BASE_URL || "/"}models/face`;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(base),
        faceapi.nets.faceLandmark68Net.loadFromUri(base),
        faceapi.nets.faceRecognitionNet.loadFromUri(base),
      ]);
      return faceapi;
    })().catch((e) => { carregando = null; throw e; });
  }
  return carregando;
}

export function cameraDisponivel(): { ok: boolean; motivo?: string } {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, motivo: window.isSecureContext ? "Este navegador não permite acessar a câmera." : "A câmera só funciona em conexão segura (HTTPS). Abra o sistema pelo endereço https." };
  }
  return { ok: true };
}

export function mensagemErroCamera(e: any): string {
  const n = String(e?.name || "");
  if (n === "NotAllowedError" || n === "SecurityError") return "Permissão da câmera negada. Libere a câmera nas configurações do navegador.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "Nenhuma câmera encontrada neste aparelho.";
  if (n === "NotReadableError") return "A câmera está em uso por outro aplicativo.";
  return e?.message || "Não foi possível abrir a câmera.";
}

export interface EvidenciaLiveness {
  nonce: string; blinks: number; movimento: number; duracaoMs: number; amostras: number; earMin: number; earMax: number;
}
export interface Desafio { nonce: string; acao: "PISCAR" | "VIRAR_CABECA"; instrucao: string }

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye Aspect Ratio (Soukupová & Čech) com os 6 pontos de cada olho do modelo de 68 pontos. */
export function ear(p: Array<{ x: number; y: number }>): number {
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]) || 1);
}

export interface Amostra { t: number; ear: number; nx: number; score: number }

/** Lê olhos e posição do nariz (relativa ao centro do rosto) de uma detecção com landmarks. */
export function amostraDe(det: any, t: number): Amostra {
  const pts: Array<{ x: number; y: number }> = det.landmarks.positions;
  const e = (ear(pts.slice(36, 42)) + ear(pts.slice(42, 48))) / 2;
  const box = det.detection.box;
  const nariz = pts[30];
  return { t, ear: e, nx: (nariz.x - (box.x + box.width / 2)) / (box.width || 1), score: det.detection.score };
}

/** Resume as amostras na evidência enviada ao servidor para o desafio pedido. */
export function resumirLiveness(nonce: string, amostras: Amostra[]): EvidenciaLiveness {
  if (!amostras.length) return { nonce, blinks: 0, movimento: 0, duracaoMs: 0, amostras: 0, earMin: 0, earMax: 0 };
  const ears = amostras.map((a) => a.ear);
  const earMax = Math.max(...ears), earMin = Math.min(...ears);
  const ordenados = [...ears].sort((a, b) => a - b);
  const aberto = ordenados[Math.floor(ordenados.length * 0.75)] || earMax;
  const limite = Math.max(0.15, aberto * 0.72);
  let blinks = 0, fechado = false;
  for (const e of ears) {
    if (!fechado && e < limite) fechado = true;
    else if (fechado && e >= limite * 1.08) { fechado = false; blinks++; }
  }
  const nxs = amostras.map((a) => a.nx);
  return {
    nonce, blinks, earMin: round(earMin), earMax: round(earMax), movimento: round(Math.max(...nxs) - Math.min(...nxs)),
    duracaoMs: Math.round(amostras[amostras.length - 1].t - amostras[0].t), amostras: amostras.length,
  };
}

/** A evidência já satisfaz o desafio? (mesma regra do servidor, para encerrar a captura cedo). */
export function desafioCumprido(acao: string, ev: EvidenciaLiveness): boolean {
  if (ev.duracaoMs < 900 || ev.amostras < 6) return false;
  if (acao === "PISCAR") return ev.blinks >= 1 && ev.earMax - ev.earMin >= 0.09;
  return ev.movimento >= 0.18;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
