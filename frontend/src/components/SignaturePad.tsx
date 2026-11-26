import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";

export interface SignaturePadHandle { isEmpty: () => boolean; toDataUrl: () => string; clear: () => void }

// Quadro para assinar com o dedo ou o mouse. Exporta PNG com fundo branco.
const SignaturePad = forwardRef<SignaturePadHandle, { label: string; height?: number; onChange?: (empty: boolean) => void }>(function SignaturePad({ label, height = 160, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = height * ratio;
    const g = c.getContext("2d"); if (!g) return;
    g.scale(ratio, ratio); g.fillStyle = "#fff"; g.fillRect(0, 0, c.offsetWidth, height);
    g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111";
  }, [height]);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); canvas.current?.setPointerCapture(e.pointerId); drawing.current = true; const g = canvas.current!.getContext("2d")!; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.1, p.y + 0.1); g.stroke(); if (empty) { setEmpty(false); onChange?.(false); } };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const g = canvas.current!.getContext("2d")!; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current!; const g = c.getContext("2d")!; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.restore(); setEmpty(true); onChange?.(true); };

  useImperativeHandle(ref, () => ({ isEmpty: () => empty, toDataUrl: () => canvas.current!.toDataURL("image/png"), clear }), [empty]);

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{label}</Typography>
      <Box sx={{ border: "1px dashed", borderColor: "text.secondary", borderRadius: 1, bgcolor: "#fff", position: "relative" }}>
        <canvas ref={canvas} style={{ width: "100%", height, touchAction: "none", display: "block", cursor: "crosshair" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        {empty && <Typography variant="caption" sx={{ position: "absolute", left: 0, right: 0, top: "42%", textAlign: "center", color: "#aaa", pointerEvents: "none" }}>Assine aqui com o dedo ou o mouse</Typography>}
      </Box>
      <Button size="small" onClick={clear} sx={{ mt: 0.5 }}>Limpar assinatura</Button>
    </Box>
  );
});
export default SignaturePad;
