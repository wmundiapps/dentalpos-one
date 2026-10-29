import { Alert, Box, Button } from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import { useEffect, useRef, useState } from "react";

/** Leitor de QR Code pela câmera (BarcodeDetector, disponível no Chrome/Android/Edge). Sem suporte: use o campo manual ou leitor USB. */
export default function QrScanner({ onRead, pausaMs = 1500 }: { onRead: (texto: string) => void; pausaMs?: number }) {
  const [ativo, setAtivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const suportado = typeof (window as any).BarcodeDetector !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!ativo) return;
    let parar = false;
    let stream: MediaStream | null = null;
    let ultimo = "";
    let ultimoEm = 0;
    (async () => {
      try {
        const det = new (window as any).BarcodeDetector({ formats: ["qr_code", "code_128"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = async () => {
          if (parar || !video.current) return;
          try {
            const achados = await det.detect(video.current);
            const v = achados[0]?.rawValue as string | undefined;
            if (v && (v !== ultimo || Date.now() - ultimoEm > pausaMs * 2)) { ultimo = v; ultimoEm = Date.now(); onRead(v); }
          } catch { /* quadro sem imagem */ }
          setTimeout(loop, 250);
        };
        loop();
      } catch (e: any) { setErro(e?.message || "Não foi possível abrir a câmera."); setAtivo(false); }
    })();
    return () => { parar = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  if (!suportado) return <Alert severity="info">Este navegador não lê QR pela câmera. Use um leitor USB/Bluetooth (digita no campo abaixo) ou digite o tombamento.</Alert>;
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {erro && <Alert severity="warning">{erro}</Alert>}
      <Button variant={ativo ? "outlined" : "contained"} startIcon={<QrCodeScannerIcon />} onClick={() => { setErro(null); setAtivo(!ativo); }}>{ativo ? "Parar câmera" : "Ler QR pela câmera"}</Button>
      {ativo && <Box component="video" ref={video} muted playsInline sx={{ width: "100%", maxHeight: 320, borderRadius: 3, bgcolor: "#000", objectFit: "cover" }} />}
    </Box>
  );
}
