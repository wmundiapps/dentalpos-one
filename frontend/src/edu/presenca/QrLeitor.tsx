import { Alert, Box, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { cameraDisponivel, mensagemErroCamera } from "./motorFacial";

/**
 * Leitor de QR (carteirinha, item de acervo/equipamento) pela câmera. Usa BarcodeDetector quando existe e jsQR como alternativa.
 * Tudo local; a imagem não é enviada. `ativo=false` desliga a câmera. O mesmo código lido em sequência é ignorado por `pausaMs`.
 */
export default function QrLeitor({ onLer, ativo = true, camera = "environment", pausaMs = 2500, altura = 280 }: {
  onLer: (texto: string) => void; ativo?: boolean; camera?: "environment" | "user"; pausaMs?: number; altura?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onLer);
  cb.current = onLer;
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const cam = cameraDisponivel();
    if (!cam.ok) { setErro(cam.motivo || "Câmera indisponível."); return; }
    let parar = false;
    let stream: MediaStream | null = null;
    let ultimo = "", ultimoEm = 0;
    (async () => {
      try {
        const Detector = (window as any).BarcodeDetector;
        const det = Detector ? new Detector({ formats: ["qr_code"] }) : null;
        const jsqr = det ? null : (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camera, width: { ideal: 960 } }, audio: false });
        if (parar || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const loop = async () => {
          if (parar || !video.current) return;
          try {
            let texto: string | undefined;
            const v = video.current;
            if (det) texto = (await det.detect(v))[0]?.rawValue;
            else if (jsqr && ctx && v.videoWidth) {
              const w = Math.min(640, v.videoWidth); const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w; canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              texto = jsqr(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data;
            }
            if (texto && (texto !== ultimo || Date.now() - ultimoEm > pausaMs)) { ultimo = texto; ultimoEm = Date.now(); cb.current(texto); }
          } catch { /* quadro sem imagem */ }
          setTimeout(loop, 180);
        };
        loop();
      } catch (e: any) { setErro(mensagemErroCamera(e)); }
    })();
    return () => { parar = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [ativo, camera, pausaMs]);

  if (!ativo) return null;
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {erro ? <Alert severity="warning">{erro} Use o campo de código ou um leitor USB/Bluetooth.</Alert> : (
        <Box sx={{ position: "relative", borderRadius: 4, overflow: "hidden", bgcolor: "#000", height: altura, border: "4px solid #0288d1" }}>
          <Box component="video" ref={video} muted playsInline aria-label="Câmera para leitura de QR" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <Box sx={{ position: "absolute", inset: "18% 22%", border: "3px dashed rgba(255,255,255,.85)", borderRadius: 3, pointerEvents: "none" }} />
          <Typography sx={{ position: "absolute", left: 0, right: 0, bottom: 0, p: 0.75, textAlign: "center", color: "#fff", bgcolor: "rgba(0,0,0,.55)", fontWeight: 700 }}>Aponte o QR para a câmera</Typography>
        </Box>
      )}
    </Box>
  );
}
