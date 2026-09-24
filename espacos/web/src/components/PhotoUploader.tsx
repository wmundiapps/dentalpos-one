import { useRef, useState } from 'react';
import { apiUpload } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../errors';

const MAX_PHOTOS = 20;
const MAX_BYTES = 10 * 1024 * 1024;

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
      ok.forEach((f) => form.append('files', f, f.name));
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
