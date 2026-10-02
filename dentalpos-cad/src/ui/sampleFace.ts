import type { PhotoLandmarks } from "../core/project";

/** Foto de exemplo ilustrada (gerada por código) para testar o simulador sem usar imagem de paciente. */
export function makeSampleFace(): { url: string; width: number; height: number; landmarks: PhotoLandmarks } {
  const W = 900, H = 1100;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#cdd7e3"); bg.addColorStop(1, "#aab6c6"); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // cabelo
  x.fillStyle = "#3a2a22"; x.beginPath(); x.ellipse(450, 330, 290, 300, 0, Math.PI, 0); x.fill(); x.fillRect(160, 330, 60, 330); x.fillRect(680, 330, 60, 330);
  // pescoço e rosto
  const skin = x.createLinearGradient(0, 200, 0, 1050); skin.addColorStop(0, "#e9c3a6"); skin.addColorStop(1, "#d9a98a");
  x.fillStyle = "#d4a283"; x.fillRect(360, 900, 180, 200);
  x.fillStyle = skin; x.beginPath(); x.moveTo(450, 180);
  x.bezierCurveTo(690, 180, 700, 520, 660, 780); x.bezierCurveTo(630, 960, 540, 1030, 450, 1040);
  x.bezierCurveTo(360, 1030, 270, 960, 240, 780); x.bezierCurveTo(200, 520, 210, 180, 450, 180); x.fill();
  // sobrancelhas
  x.strokeStyle = "#3a2a22"; x.lineWidth = 12; x.lineCap = "round";
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(450 + s * 60, 372); x.quadraticCurveTo(450 + s * 140, 338, 450 + s * 215, 372); x.stroke(); }
  // olhos
  for (const s of [-1, 1]) {
    const ex = 450 + s * 105, ey = 425;
    x.fillStyle = "#fbf8f4"; x.beginPath(); x.ellipse(ex, ey, 56, 24, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#5b3a24"; x.beginPath(); x.arc(ex, ey, 20, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#111"; x.beginPath(); x.arc(ex, ey, 9, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#7a5646"; x.lineWidth = 4; x.beginPath(); x.ellipse(ex, ey, 56, 24, 0, Math.PI, Math.PI * 2); x.stroke();
  }
  // nariz
  x.strokeStyle = "rgba(120,70,50,.55)"; x.lineWidth = 6; x.beginPath(); x.moveTo(450, 440); x.quadraticCurveTo(425, 590, 395, 640); x.quadraticCurveTo(450, 675, 505, 640); x.quadraticCurveTo(475, 590, 450, 440); x.stroke();
  // boca
  const cR: [number, number] = [320, 812], cL: [number, number] = [580, 812], upM: [number, number] = [450, 790], loM: [number, number] = [450, 842];
  x.fillStyle = "#b5524f"; // lábios
  x.beginPath(); x.moveTo(cR[0] - 16, cR[1] + 4); x.quadraticCurveTo(450, 735, cL[0] + 16, cL[1] + 4); x.quadraticCurveTo(450, 940, cR[0] - 16, cR[1] + 4); x.fill();
  // interior
  x.fillStyle = "#2a1517"; x.beginPath(); x.moveTo(...cR); x.quadraticCurveTo(450, 2 * upM[1] - cR[1], ...cL); x.quadraticCurveTo(450, 2 * loM[1] - cL[1], ...cR); x.fill();
  // dentes "antes" (levemente desalinhados e amarelados)
  x.save(); x.beginPath(); x.moveTo(...cR); x.quadraticCurveTo(450, 2 * upM[1] - cR[1], ...cL); x.quadraticCurveTo(450, 2 * loM[1] - cL[1], ...cR); x.clip();
  x.fillStyle = "#d8c9a6";
  const old = [[345, 20, 30], [372, 26, 35], [403, 30, 38], [437, 28, 36], [466, 28, 35], [496, 30, 37], [528, 26, 34], [555, 22, 28]];
  for (const [px, w, h] of old) { x.beginPath(); x.roundRect(px, 790, w, h, 5); x.fill(); }
  x.strokeStyle = "rgba(60,40,20,.5)"; x.lineWidth = 1.5; for (const [px, w, h] of old) { x.beginPath(); x.roundRect(px, 790, w, h, 5); x.stroke(); }
  x.restore();
  // marca do lábio superior
  x.strokeStyle = "rgba(90,30,30,.5)"; x.lineWidth = 3; x.beginPath(); x.moveTo(...cR); x.quadraticCurveTo(450, 2 * upM[1] - cR[1], ...cL); x.stroke();
  return {
    url: c.toDataURL("image/jpeg", 0.9), width: W, height: H,
    landmarks: {
      pupilR: [345, 425], pupilL: [555, 425], facialMidTop: [450, 330], facialMidBottom: [450, 1040],
      upperLipMid: upM, lowerLipMid: loM, commissureR: cR, commissureL: cL,
      forehead: [450, 180], chin: [450, 1040], zygR: [232, 540], zygL: [668, 540], gonR: [262, 860], gonL: [638, 860],
    },
  };
}
