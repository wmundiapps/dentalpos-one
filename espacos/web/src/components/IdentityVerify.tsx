import { useEffect, useState } from 'react';
import { api, apiUpload } from '../api';
import { errorText } from '../errors';
import { useI18n } from '../i18n';
import { useApp } from '../state';

const digits = (s: string) => s.replace(/\D/g, '');
function validCpf(v: string) {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
function validCnpj(v: string) {
  const d = digits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((a, wi, i) => a + wi * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** Reduz a foto do celular (até ~1600 px, JPEG) para enviar rápido e caber no limite do servidor. */
async function shrink(file: File, max = 1600): Promise<Blob> {
  if (file.type === 'application/pdf') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('blob'))), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

function PhotoStep({ n, title, help, capture, file, onFile }: { n: number; title: string; help: string; capture: 'user' | 'environment'; file: File | null; onFile: (f: File) => void }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file || file.type === 'application/pdf') { setPreview(''); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="id-step">
      <span className="how-n">{n}</span>
      <div>
        <strong>{title}</strong>
        <p className="muted small">{help}</p>
        <label className="btn btn-outline small id-pick">
          {file ? `✅ ${t('identity.retake')}` : `📷 ${t('identity.take')}`}
          <input type="file" accept={capture === 'user' ? 'image/*' : 'image/*,application/pdf'} capture={capture} hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </label>
        {preview && <img className="id-preview" src={preview} alt="" />}
      </div>
    </div>
  );
}

// Verificação de identidade em 1 minuto: CPF/CNPJ + foto do documento + selfie. Checagem em segundo plano.
export function IdentityVerify({ onDone }: { onDone?: () => void } = {}) {
  const { t } = useI18n();
  const { me, refreshMe } = useApp();
  const [st, setSt] = useState<{ verified: boolean; status: string } | null>(null);
  const [taxId, setTaxId] = useState('');
  const [doc, setDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => api<{ verified: boolean; status: string }>('/me/identity').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!me || !st) return null;

  const br = me.countryCode === 'BR';
  const d = digits(taxId);
  const taxOk = !br || (d.length === 11 ? validCpf(d) : d.length === 14 ? validCnpj(d) : false);
  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!doc || !selfie) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.set('taxId', taxId);
      form.set('document', await shrink(doc), doc.type === 'application/pdf' ? 'documento.pdf' : 'documento.jpg');
      form.set('selfie', await shrink(selfie, 1200), 'selfie.jpg');
      await apiUpload('/me/identity', form);
      await Promise.all([load(), refreshMe()]);
      onDone?.();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" id="identidade">
      <h2>{t('profile.identity')} {st.verified && <span className="badge">✅ {t('profile.verified')}</span>}</h2>
      {st.verified ? <p className="muted small">{t('identity.verifiedText')}</p>
        : st.status === 'pending' || st.status === 'needs_review' ? <p className="notice small">⏳ {t('identity.inReview')}</p>
        : (
          <form onSubmit={submit}>
            <p className="muted small">{t('identity.intro')}</p>
            {st.status === 'rejected' && <p className="notice warn small">{t('identity.rejected')}</p>}
            <label>{br ? t('identity.taxIdBr') : t('identity.taxId')}
              <input inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder={br ? '000.000.000-00' : ''} required />
            </label>
            {taxId && !taxOk && d.length >= 11 && <p className="errors small">{t('err.invalid_cpf')}</p>}
            <PhotoStep n={1} title={t('identity.docTitle')} help={t('identity.docHelp')} capture="environment" file={doc} onFile={setDoc} />
            <PhotoStep n={2} title={t('identity.selfieTitle')} help={t('identity.selfieHelp')} capture="user" file={selfie} onFile={setSelfie} />
            <button className="btn btn-primary" disabled={busy || !doc || !selfie || !taxOk}>{busy ? t('common.wait') : t('identity.send')}</button>
            {error && <p className="errors small inline-msg" role="alert">{error}</p>}
            <p className="muted small">🔒 {t('identity.privacy')}</p>
          </form>
        )}
    </section>
  );
}
