import { useEffect, useRef, useState } from 'react';

export const ANGLES: { key: string; label: string }[] = [
  { key: 'frente', label: 'Frente' }, { key: 'traseira', label: 'Traseira' }, { key: 'lateral-esq', label: 'Lateral esq.' }, { key: 'lateral-dir', label: 'Lateral dir.' },
  { key: 'teto', label: 'Teto' }, { key: 'interior', label: 'Interior' }, { key: 'painel', label: 'Painel (km)' }, { key: 'dano', label: 'Detalhe / dano' },
];

/** Espaços para as fotos de entrada/saída. Abre a câmera do celular (ou a galeria no computador). Guarda os arquivos até o envio. */
export default function PhotoSlots({ files, onChange }: { files: Record<string, File | undefined>; onChange: (f: Record<string, File | undefined>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [angle, setAngle] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [k, f] of Object.entries(files)) if (f) next[k] = URL.createObjectURL(f);
    setUrls(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [files]);
  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && angle) onChange({ ...files, [angle]: f }); e.target.value = ''; }} />
      <div className="photo-grid">
        {ANGLES.map((a) => (
          <button type="button" key={a.key} className="photo-slot" onClick={() => { setAngle(a.key); input.current?.click(); }} aria-label={`Foto: ${a.label}`}>
            {urls[a.key] ? <img src={urls[a.key]} alt={a.label} /> : <><span style={{ fontSize: '1.6rem' }}>📷</span>{a.label}</>}
            {urls[a.key] && <span className="lbl">{a.label} · trocar</span>}
          </button>
        ))}
      </div>
    </>
  );
}
