import { useRef, useState } from 'react';
import { apiUpload } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../errors';

const MAX_PHOTOS = 20;
const MAX_BYTES = 10 * 1024 * 1024;

/** Redesenha a foto (até 2000 px, JPEG): tira os dados escondidos do arquivo, como a localização GPS. */
async function shrink(file: File, max = 2000): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('blob'))), 'image/jpeg', 0.86));
  } catch {
    return file; // formato que o navegador não abre (ex.: HEIC em alguns aparelhos): vai como está
  }
}

// Fotos do espaço: galeria/câmera do celular, arquivos do computador (clique
// ou arrastar e soltar) ou link. A primeira foto é a capa.
export function PhotoUploader({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');

  async function upload(files: FileList | File[]) {
    setError('');
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(f.name));
    const room = MAX_PHOTOS - photos.length;
    const tooBig = list.filter((f) => f.size > MAX_BYTES);
    const ok = list.filter((f) => f.size <= MAX_BYTES).slice(0, room);
    if (tooBig.length) setError(`${t('err.file_too_large')} (${tooBig.map((f) => f.name).join(', ')})`);
    if (!ok.length) return;
    setUploading(ok.length);
    try {
      const form = new FormData();
      // Reduz para até 2000 px em JPEG: envio mais rápido e sem a localização GPS gravada pela câmera
      for (const f of ok) {
        const b = await shrink(f);
        form.append('files', b, b === f ? f.name : `${f.name.replace(/\.\w+$/, '')}.jpg`);
      }
      const r = await apiUpload<{ files: { url: string }[] }>('/uploads', form);
      onChange([...photos, ...r.files.map((x) => x.url)]);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setUploading(0);
      if (input.current) input.current.value = '';
    }
  }

  const move = (i: number) => onChange([photos[i], ...photos.filter((_, j) => j !== i)]);
  const remove = (i: number) => onChange(photos.filter((_, j) => j !== i));

  return (
    <div className="photo-uploader">
      <div
        className={`drop-zone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      >
        <input ref={input} id="photo-input" type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        <button type="button" className="btn btn-outline" disabled={!!uploading || photos.length >= MAX_PHOTOS} onClick={() => input.current?.click()}>
          📷 {uploading ? t('photos.uploading', { n: uploading }) : t('photos.add')}
        </button>
        <span className="muted small">{t('photos.drop')}</span>
        <p className="muted small">{t('photos.help')}</p>
      </div>
      {error && <p className="errors small" role="alert">{error}</p>}
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p, i) => (
            <li key={p + i}>
              <img src={p} alt="" loading="lazy" />
              {i === 0 ? <span className="badge cover">{t('photos.cover')}</span>
                : <button type="button" className="btn small photo-cover" onClick={() => move(i)}>{t('photos.makeCover')}</button>}
              <button type="button" className="photo-remove" aria-label={t('common.remove')} onClick={() => remove(i)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <details className="small">
        <summary>{t('photos.addUrl')}</summary>
        <div className="row gap">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          <button type="button" className="btn btn-outline small" disabled={!/^https:\/\/\S+$/.test(url) || photos.length >= MAX_PHOTOS}
            onClick={() => { onChange([...photos, url.trim()]); setUrl(''); }}>+</button>
        </div>
      </details>
    </div>
  );
}
