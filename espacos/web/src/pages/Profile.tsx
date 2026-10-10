import { useEffect, useState } from 'react';
import { apiUpload } from '../api';
import type { DictKey } from '../i18n';
import { CATEGORIES } from '../../../shared/rules';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp, type Me } from '../state';
import { COUNTRY_BY_CODE } from '../../../shared/countries';
import { STRIKE_RULES } from '../../../shared/rules';
import { errorText } from '../errors';
import { formatDateTime } from '../format';
import { IdentityVerify } from '../components/IdentityVerify';
import { NextStep } from '../components/NextStep';
import { safePath } from '../journey';

export default function Profile() {
  const { t, locale } = useI18n();
  const { me, refreshMe } = useApp();
  const [info, setInfo] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', bio: me?.bio ?? '', companyTaxId: me?.companyTaxId ?? '' });
  const [msg, setMsg] = useState('');
  // Veio de uma reserva (/perfil?voltar=/reservar/...): depois de enviar os dados, mostra o caminho de volta
  const [params] = useSearchParams();
  const back = safePath(params.get('voltar'));
  const [showBack, setShowBack] = useState(false);
  if (!me) return <div className="container empty"><Link to="/entrar?next=/perfil">{t('auth.login')}</Link></div>;
  const cfg = COUNTRY_BY_CODE[me.countryCode];

  async function run(path: string, body: unknown, method = 'POST') {
    setMsg('');
    try { await api<Me>(path, { method, body }); await refreshMe(); setMsg(t('common.saved')); } catch (e) { setMsg(errorText(e, t)); }
  }

  return (
    <div className="container narrow">
      <h1>{t('nav.profile')}</h1>
      {me.suspendedUntil && new Date(me.suspendedUntil) > new Date() && <p className="notice warn">{t('profile.suspended', { at: formatDateTime(me.suspendedUntil, locale) })}</p>}
      <p className="muted small">{t('profile.strikes', { n: me.activeStrikes, suspend: STRIKE_RULES.suspendAt, ban: STRIKE_RULES.banAt })} <Link to="/regras/penalties">{t('legal.penalties')}</Link></p>
      {back && <p><Link className="btn btn-outline small" to={back}>← {t('journey.backToBooking')}</Link></p>}

      <IdentityVerify onDone={() => back && setShowBack(true)} />

      <section className="panel">
        <h2>{t('profile.info')}</h2>
        <label>{t('form.fullName')}<input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></label>
        <label>{t('form.phone')}<input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></label>
        <label>{t('form.companyId', { id: cfg?.companyIdLabel ?? '' })}<input value={info.companyTaxId} onChange={(e) => setInfo({ ...info, companyTaxId: e.target.value })} /></label>
        <label>{t('form.bio')}<textarea value={info.bio} onChange={(e) => setInfo({ ...info, bio: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={() => run('/me', info, 'PUT')}>{t('common.save')}</button>
        {msg && <p className={`small inline-msg ${msg === t('common.saved') ? 'ok' : 'errors'}`} role="status">{msg}</p>}
      </section>

      <LicenseSection onDone={refreshMe} onSent={() => back && setShowBack(true)} />
      <MarketingPrefs />
      <TwoFactorPrefs />
      <DeleteAccountSection />
      {showBack && back && (
        <NextStep icon="🎉" title={t('journey.sentTitle')} onClose={() => setShowBack(false)}
          actions={[{ label: t('journey.backToBooking'), to: back }, { label: t('journey.stayHere'), primary: false, onClick: () => setShowBack(false) }]}>
          {t('journey.sentBody')}
        </NextStep>
      )}
    </div>
  );
}

// Exclusão da conta pelo próprio usuário (LGPD; exigência da App Store e do Google Play).
function DeleteAccountSection() {
  const { t } = useI18n();
  const { logout } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(t('account.deleteConfirm'))) return;
    setBusy(true); setError('');
    try {
      await api('/me', { method: 'DELETE', body: { password } });
      logout();
      window.alert(t('account.deleted'));
      nav('/');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" id="excluir-conta">
      <h2>{t('account.deleteTitle')}</h2>
      <p className="muted small">{t('account.deleteHelp')}</p>
      {!open
        ? <button className="btn btn-outline" onClick={() => setOpen(true)}>{t('account.deleteButton')}</button>
        : <form onSubmit={remove}>
            <label>{t('account.deletePassword')}<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
            {error && <p className="errors">{error}</p>}
            <button className="btn btn-danger" disabled={busy || !password}>{busy ? t('common.wait') : t('account.deleteButton')}</button>
          </form>}
    </section>
  );
}

/** Página pública com as instruções de exclusão (URL exigida pelo Google Play). */
export function AccountDeletionPage() {
  const { t } = useI18n();
  return (
    <div className="container narrow">
      <h1>{t('account.deleteTitle')} — SpaceHour</h1>
      <p>{t('account.pageIntro')}</p>
      <ol>
        <li>{t('account.pageStep1')}</li>
        <li>{t('account.pageStep2')}</li>
      </ol>
      <p className="muted">{t('account.pageRetention')}</p>
      <p>{t('account.pageNoAccess', { email: 'support@space-hour.com' })}</p>
      <Link className="btn btn-primary" to="/perfil#excluir-conta">{t('account.goProfile')}</Link>
    </div>
  );
}

// Registro profissional: dados + foto/PDF do documento → pré-verificação por IA
// (e equipe). O anfitrião ainda confere antes de liberar o espaço.
function LicenseSection({ onDone, onSent }: { onDone: () => Promise<void>; onSent?: () => void }) {
  const { t } = useI18n();
  const { me } = useApp();
  const cfg = COUNTRY_BY_CODE[me!.countryCode];
  const [lic, setLic] = useState({ fullName: me!.name, body: '', number: '', region: '', category: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const status = me!.licenseStatus ?? 'none';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const form = new FormData();
      Object.entries(lic).forEach(([k, v]) => v && form.set(k, v));
      form.set('document', file, file.name);
      await apiUpload('/me/license', form);
      await onDone();
      setMsg({ ok: true, text: t('common.saved') });
      onSent?.();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>{t('profile.license')} {status === 'approved' && <span className="badge">✅ {t('profile.verified')}</span>}</h2>
      {me!.professionalLicense && <p>{me!.professionalLicense.body} · {me!.professionalLicense.number} {me!.professionalLicense.region}</p>}
      <p className={`small ${status === 'rejected' ? 'errors' : ''}`}>{t('profile.licenseStatus', { status: t(`license.status.${status}` as DictKey) })}</p>
      <p className="muted small">{t('profile.licenseHelp')}</p>
      {cfg && <p className="muted small">{Object.values(cfg.licenseBodies).join(' · ')}</p>}
      {status !== 'approved' && status !== 'pending' && (
        <form onSubmit={submit}>
          <label>{t('profile.licenseFullName')}<input required minLength={3} value={lic.fullName} onChange={(e) => setLic({ ...lic, fullName: e.target.value })} /></label>
          <label>{t('form.profession')}
            <select value={lic.category} onChange={(e) => setLic({ ...lic, category: e.target.value })}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}` as DictKey)}</option>)}
            </select>
          </label>
          <label>{t('form.licenseBody')}<input required minLength={2} value={lic.body} onChange={(e) => setLic({ ...lic, body: e.target.value })} placeholder={cfg?.licenseBodies[lic.category as never] ?? cfg?.licenseBodies.default} /></label>
          <label>{t('form.licenseNumber')}<input required minLength={2} value={lic.number} onChange={(e) => setLic({ ...lic, number: e.target.value })} /></label>
          <label>{t('form.licenseRegion')}<input value={lic.region} onChange={(e) => setLic({ ...lic, region: e.target.value })} /></label>
          <label>{t('profile.licenseDocument')}
            <input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <p className="muted small">{t('profile.licenseDocHelp')}</p>
          <p className="notice warn small">⚖ {t('profile.licenseWarning')}</p>
          <button className="btn btn-primary" disabled={busy || !file}>{busy ? t('common.wait') : t('profile.licenseSubmit')}</button>
        </form>
      )}
      {msg && <p className={`small inline-msg ${msg.ok ? 'ok' : 'errors'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </section>
  );
}

// Novidades e ofertas por e-mail/WhatsApp (consentimento separado, pode mudar a qualquer momento)
function MarketingPrefs() {
  const { t } = useI18n();
  const [optIn, setOptIn] = useState<boolean | null>(null);
  useEffect(() => { api<{ optIn: boolean }>('/me/marketing').then((r) => setOptIn(r.optIn)).catch(() => {}); }, []);
  if (optIn === null) return null;
  async function change(v: boolean) {
    setOptIn(v);
    try { await api('/me/marketing', { method: 'PUT', body: { optIn: v } }); } catch { setOptIn(!v); }
  }
  return (
    <section className="panel">
      <h2>{t('profile.marketingTitle')}</h2>
      <label className="check"><input type="checkbox" checked={optIn} onChange={(e) => change(e.target.checked)} /> {t('auth.marketingOptIn')}</label>
      <p className="muted small">{t('profile.marketingHelp')}</p>
    </section>
  );
}

/** Verificação em duas etapas: a cada login, um código no e-mail (obrigatória para administradores). */
function TwoFactorPrefs() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ enabled: boolean; forced: boolean; method?: 'app' | 'email' } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<{ enabled: boolean; forced: boolean }>('/me/two-factor').then(setSt).catch(() => {}); }, []);
  if (!st) return null;
  async function change(v: boolean) {
    setErr('');
    try { setSt(await api<{ enabled: boolean; forced: boolean }>('/me/two-factor', { body: { enabled: v } })); } catch (e) { setErr(errorText(e, t)); }
  }
  return (
    <section className="panel" id="duas-etapas">
      <h2>🔐 {t('profile.twoFactorTitle')}</h2>
      <label className="check"><input type="checkbox" checked={st.enabled} disabled={st.forced || st.method === 'app'} onChange={(e) => change(e.target.checked)} /> {t('profile.twoFactorOn')}</label>
      <p className="muted small">{st.forced ? t('profile.twoFactorForced') : t('profile.twoFactorText')}</p>
      {err && <p className="errors small" role="alert">{err}</p>}
      <AuthenticatorApp onChange={() => api<{ enabled: boolean; forced: boolean; method?: 'app' | 'email' }>('/me/two-factor').then(setSt).catch(() => {})} />
    </section>
  );
}

/** Aplicativo autenticador (TOTP): QR code, 8 códigos reserva, desligar com senha + código. */
function AuthenticatorApp({ onChange }: { onChange: () => void }) {
  const { t, locale } = useI18n();
  const [st, setSt] = useState<{ enabled: boolean; since: string | null; backupCodesLeft: number } | null>(null);
  const [step, setStep] = useState<'idle' | 'password' | 'scan' | 'manage'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [backup, setBackup] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => api<{ enabled: boolean; since: string | null; backupCodesLeft: number }>('/me/totp').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!st) return null;
  const reset = () => { setPassword(''); setCode(''); setErr(''); };
  async function start(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const r = await api<{ secret: string; uri: string }>('/me/totp/setup', { body: { password } });
      const QR = await import('qrcode');
      setSetup({ ...r, qr: await QR.toDataURL(r.uri, { margin: 1, width: 220 }) });
      setStep('scan'); reset();
    } catch (x) { setErr(errorText(x, t)); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const r = await api<{ backupCodes: string[] }>('/me/totp/confirm', { body: { code } });
      setBackup(r.backupCodes); setSetup(null); setStep('idle'); reset(); load(); onChange();
    } catch (x) { setErr(errorText(x, t)); }
  }
  async function manage(action: 'disable' | 'backup-codes') {
    setErr('');
    try {
      const r = await api<{ backupCodes?: string[] }>(`/me/totp/${action}`, { body: { password, code } });
      if (r.backupCodes) setBackup(r.backupCodes);
      setStep('idle'); reset(); load(); onChange();
    } catch (x) { setErr(errorText(x, t)); }
  }
  return (
    <div className="totp">
      <h3>📱 {t('profile.totpTitle')}</h3>
      <p className="muted small">{t('profile.totpText')}</p>
      {backup && (
        <div className="notice">
          <strong>{t('profile.totpBackupTitle')}</strong>
          <p className="small">{t('profile.totpBackupText')}</p>
          <pre className="backup-codes">{backup.join('\n')}</pre>
          <button className="btn btn-outline small" onClick={() => setBackup(null)}>{t('common.close')}</button>
        </div>
      )}
      {st.enabled ? (
        <>
          <p className="small">✅ {t('profile.totpOn', { date: st.since ? new Date(st.since).toLocaleDateString(locale) : '', n: st.backupCodesLeft })}</p>
          {step !== 'manage'
            ? <button className="btn btn-outline small" onClick={() => { reset(); setStep('manage'); }}>{t('profile.totpManage')}</button>
            : <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
                <label>{t('profile.totpPassword')}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                <label>{t('profile.totpCode')}<input autoComplete="one-time-code" maxLength={11} value={code} onChange={(e) => setCode(e.target.value.slice(0, 11))} /></label>
                <div className="row gap span2">
                  <button type="button" className="btn btn-outline small" disabled={!password || code.length < 6} onClick={() => manage('backup-codes')}>{t('profile.totpNewCodes')}</button>
                  <button type="button" className="btn btn-danger small" disabled={!password || code.length < 6} onClick={() => manage('disable')}>{t('profile.totpDisable')}</button>
                  <button type="button" className="link-btn" onClick={() => { setStep('idle'); reset(); }}>{t('common.back')}</button>
                </div>
              </form>}
        </>
      ) : step === 'idle' ? (
        <button className="btn btn-primary small" onClick={() => { reset(); setStep('password'); }}>{t('profile.totpStart')}</button>
      ) : step === 'password' ? (
        <form className="row gap" onSubmit={start}>
          <label>{t('profile.totpPassword')}<input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn btn-primary small">{t('profile.totpContinue')}</button>
          <button type="button" className="link-btn" onClick={() => { setStep('idle'); reset(); }}>{t('common.back')}</button>
        </form>
      ) : setup && (
        <form onSubmit={confirm}>
          <p className="small">{t('profile.totpScan')}</p>
          <img src={setup.qr} width={220} height={220} alt="QR code" />
          <p className="small"><code>{setup.secret}</code></p>
          <label>{t('profile.totpCode')}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="code-input" /></label>
          <button className="btn btn-primary small" disabled={code.length !== 6}>{t('profile.totpConfirm')}</button>
        </form>
      )}
      {err && <p className="errors small" role="alert">{err}</p>}
    </div>
  );
}
