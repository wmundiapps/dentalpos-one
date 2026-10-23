'use client';

import { useEffect, useRef, useState } from 'react';

/** Lê o QR do cliente pela câmera (BarcodeDetector quando existe; senão jsQR) */
export function QrScan({ onCode, label = 'Ler QR do cliente', accept }: { onCode: (code: string) => void; label?: string; accept?: (text: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as any).BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
        const jsQR = detector ? null : (await import('jsqr')).default;
        const tick = async () => {
          if (stopped || !video.current) return;
          const v = video.current;
          let text: string | null = null;
          if (detector) {
            const found = await detector.detect(v).catch(() => []);
            text = found[0]?.rawValue || null;
          } else if (jsQR && v.videoWidth) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(img.data, img.width, img.height)?.data || null;
          }
          const ok = text && (accept ? accept(text.trim()) : /^[A-Z0-9]{8}$/.test(text.trim()));
          if (ok && text) {
            onCode(text.trim());
            setOpen(false);
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError('Não foi possível abrir a câmera. Digite o código do cliente.');
        setOpen(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode, accept]);

  return (
    <>
      <button type="button" className="btn ghost sm" onClick={() => { setError(null); setOpen(true); }}>
        {label}
      </button>
      {error && <small style={{ color: 'var(--coral)', display: 'block' }}>{error}</small>}
      {open && (
        <div role="dialog" aria-label={label} style={{ position: 'fixed', inset: 0, background: 'rgba(16,25,90,.92)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ width: 'min(100%, 420px)', textAlign: 'center', color: '#fff' }}>
            <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 16, background: '#000' }} />
            <p>Aponte a câmera para o QR</p>
            <button type="button" className="btn coin" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
