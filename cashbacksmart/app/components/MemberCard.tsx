'use client';

import { useEffect, useState } from 'react';

// Cartão do participante (tamanho de cartão de crédito, 85,6 × 54 mm a 300 dpi).
// Montado em SVG no navegador; vira PNG ou PDF sem biblioteca externa.
const W = 1012;
const H = 638;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fit = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t);

function cardSvg(o: { name: string; code: string; qrSvg: string; logo: string; premium: boolean; since: string }) {
  const qr = o.qrSvg.replace(/<\?xml[^>]*>/, '').replace(/<svg\b([^>]*)>/, (_m, a: string) => `<svg${a.replace(/\s(width|height|x|y)="[^"]*"/g, '')} x="${W - 286}" y="${H - 318}" width="216" height="216" shape-rendering="crispEdges">`);
  const code = `${o.code.slice(0, 4)} ${o.code.slice(4)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><clipPath id="r"><rect width="${W}" height="${H}" rx="40"/></clipPath>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
<g clip-path="url(#r)"><rect width="${W}" height="${H}" fill="#1B2A6B"/><rect width="${W}" height="${H}" fill="url(#g)"/>
<circle cx="${W - 90}" cy="-40" r="230" fill="#FFB627" fill-opacity=".14"/><circle cx="${W - 90}" cy="-40" r="150" fill="#FFB627" fill-opacity=".14"/>
<rect x="0" y="${H - 16}" width="${W}" height="16" fill="#FFB627"/></g>
${o.logo ? `<image href="${o.logo}" x="48" y="44" width="372" height="60"/>` : `<text x="56" y="92" font-family="Figtree, Arial, sans-serif" font-size="44" font-weight="800" fill="#fff">Cashbacksmart</text>`}
<text x="${W - 56}" y="80" text-anchor="end" font-family="Figtree, Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="4" fill="#fff" fill-opacity=".9">CLUBE DE CASHBACK</text>
${o.premium ? `<rect x="${W - 196}" y="98" width="140" height="36" rx="18" fill="#FFB627"/><text x="${W - 126}" y="123" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="3" fill="#1B2A6B">PREMIUM</text>` : ''}
<text x="56" y="340" font-family="Figtree, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4" fill="#fff" fill-opacity=".7">PARTICIPANTE</text>
<text x="56" y="392" font-family="'Bricolage Grotesque', Figtree, Arial, sans-serif" font-size="46" font-weight="800" fill="#fff">${esc(fit(o.name, 22))}</text>
<text x="56" y="480" font-family="'Courier New', Menlo, monospace" font-size="56" font-weight="700" letter-spacing="6" fill="#FFB627">${esc(code)}</text>
<text x="56" y="540" font-family="Figtree, Arial, sans-serif" font-size="22" fill="#fff" fill-opacity=".85">Mostre no caixa antes de pagar${o.since ? ` · desde ${esc(o.since)}` : ''}</text>
<rect x="${W - 304}" y="${H - 336}" width="252" height="252" rx="20" fill="#fff"/>
${qr}
</svg>`;
}

function pdfFromJpeg(jpg: Uint8Array, w: number, h: number) {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const offs: number[] = []; let len = 0;
  const push = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n: number, body: string, stream?: Uint8Array) => { offs[n] = len; push(`${n} 0 obj\n${body}`); if (stream) { push('\nstream\n'); push(stream); push('\nendstream'); } push('\nendobj\n'); };
  const pw = (w * 0.24).toFixed(2); const ph = (h * 0.24).toFixed(2);
  const content = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im Do Q`);
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  obj(5, `<< /Length ${content.length} >>`, content);
  const xref = len; let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let k = 1; k < 6; k++) x += `${String(offs[k]).padStart(10, '0')} 00000 n \n`;
  push(`${x}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

function toCanvas(svg: string): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); if (x) { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(img, 0, 0, W, H); } URL.revokeObjectURL(url); res(c); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível desenhar o cartão.')); };
    img.src = url;
  });
}
const blobOf = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar o arquivo.'))), type, q));
function save(name: string, blob: Blob) {
  const u = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

export function MemberCard({ name, code, qrSvg, premium, since }: { name: string; code: string; qrSvg: string; premium: boolean; since: string }) {
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/logo-negativo.svg').then((r) => (r.ok ? r.text() : '')).catch(() => '').then((t) => {
      const logo = t ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(t)))}` : '';
      if (alive) setSvg(cardSvg({ name, code, qrSvg, logo, premium, since }));
    });
    try { setCanShare(typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })); } catch { setCanShare(false); }
    return () => { alive = false; };
  }, [name, code, qrSvg, premium, since]);

  const file = `cartao-cashbacksmart-${code}`;
  const run = async (kind: 'png' | 'pdf' | 'share') => {
    setBusy(kind); setMsg('');
    try {
      const c = await toCanvas(svg);
      if (kind === 'pdf') { const jpg = new Uint8Array(await (await blobOf(c, 'image/jpeg', 0.94)).arrayBuffer()); save(`${file}.pdf`, pdfFromJpeg(jpg, W, H)); }
      else {
        const png = await blobOf(c, 'image/png');
        if (kind === 'share') await navigator.share({ files: [new File([png], `${file}.png`, { type: 'image/png' })], title: 'Meu cartão Cashbacksmart' });
        else save(`${file}.png`, png);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg((e as Error)?.message || 'Não foi possível gerar agora. Tente de novo.');
    } finally { setBusy(''); }
  };

  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      {svg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`Cartão do participante ${name}, código ${code}`} style={{ width: '100%', maxWidth: 460, height: 'auto', borderRadius: 18, boxShadow: '0 10px 28px rgba(27,42,107,.25)' }} data-testid="member-card" />
      ) : (
        <div style={{ width: '100%', maxWidth: 460, aspectRatio: `${W} / ${H}`, borderRadius: 18, background: '#1B2A6B' }} aria-hidden="true" />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn" type="button" disabled={!svg || !!busy} onClick={() => run('png')}>{busy === 'png' ? 'Gerando…' : 'Baixar cartão (imagem)'}</button>
        <button className="btn ghost" type="button" disabled={!svg || !!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Gerando…' : 'Baixar PDF'}</button>
        {canShare && <button className="btn ghost" type="button" disabled={!svg || !!busy} onClick={() => run('share')}>Compartilhar</button>}
      </div>
      {msg && <p className="muted" role="alert">{msg}</p>}
    </div>
  );
}
