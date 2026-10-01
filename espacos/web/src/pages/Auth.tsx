import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signupSource, track } from '../tracking';
import { api, ApiError } from '../api';
import { useI18n } from '../i18n';
import { useApp, type Me } from '../state';
import { COUNTRIES } from '../../../shared/countries';
import { countryName, flag } from '../format';
import { errorText } from '../errors';
import { NextStep } from '../components/NextStep';
import { AccountReady, EmailCodeForm } from '../components/EmailCode';
import { rememberAfterVerify, safePath } from '../journey';

// Últimos e-mails usados neste aparelho (só no navegador; nunca a senha)
const RECENT_KEY = 'sh_recent_emails';
function recentEmails(): string[] {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]).filter((e) => typeof e === 'string').slice(0, 3); } catch { return []; }
}
export function rememberEmail(email: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([email.trim().toLowerCase(), ...recentEmails().filter((e) => e !== email.trim().toLowerCase())].slice(0, 3))); } catch { /* ignore */ }
}
function forgetEmail(email: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentEmails().filter((e) => e !== email))); } catch { /* ignore */ }
}

export function Login() {
  const { t } = useI18n();
  const { login } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [recent, setRecent] = useState(recentEmails);
  const [email, setEmail] = useState(() => recent[0] ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: Me }>('/auth/login', { body: { email, password } });
      rememberEmail(r.user.email);
      login(r.token, r.user);
      nav(params.get('next') ?? '/');
    } catch (err) { setError(errorText(err, t)); }
  }
  return (
    <div className="container narrow">
      <h1>{t('auth.login')}</h1>
      <form className="panel" onSubmit={submit}>
        {recent.length > 0 && (
          <div className="recent-emails">
            <span className="small muted">{t('auth.recentEmails')}</span>
            {recent.map((r) => (
              <span key={r} className={`recent-chip ${r === email ? 'on' : ''}`}>
                <button type="button" onClick={() => { setEmail(r); passwordRef.current?.focus(); }}>{r}</button>
                <button type="button" aria-label={t('auth.forgetEmail')} title={t('auth.forgetEmail')} onClick={() => { forgetEmail(r); setRecent(recentEmails()); if (email === r) setEmail(''); }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <label>{t('form.email')}<input type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username email" list="recent-emails" /></label>
        <datalist id="recent-emails">{recent.map((r) => <option key={r} value={r} />)}</datalist>
        <label>{t('form.password')}<input ref={passwordRef} type="password" name="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus={!!email} /></label>
        <p className="small right"><Link to={`/esqueci-senha${email ? `?email=${encodeURIComponent(email)}` : ''}`}>{t('auth.forgot')}</Link></p>
        {error && <p className="errors" role="alert">{error}</p>}
        <button className="btn btn-primary block">{t('auth.login')}</button>
        <p className="small center">{t('auth.noAccount')} <Link to={`/cadastro${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>{t('auth.register')}</Link></p>
      </form>
      {import.meta.env.DEV && <div className="notice small">
        <strong>{t('auth.demoTitle')}</strong>
        <p>{t('auth.demoText')}</p>
        <ul className="plain">
          <li><button className="link-btn" onClick={() => { setEmail('locatario@spacehour.demo'); setPassword('demo12345'); }}>locatario@spacehour.demo</button> — {t('auth.demoGuest')}</li>
          <li><button className="link-btn" onClick={() => { setEmail('anfitriao@spacehour.demo'); setPassword('demo12345'); }}>anfitriao@spacehour.demo</button> — {t('auth.demoHost')}</li>
          <li><button className="link-btn" onClick={() => { setEmail('admin@spacehour.demo'); setPassword('demo12345'); }}>admin@spacehour.demo</button> — {t('auth.demoAdmin')}</li>
        </ul>
      </div>}
    </div>
  );
}

export function Register() {
  const { t, locale } = useI18n();
  const { me, login, country } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safePath(params.get('next'));
  // Depois de criar a conta, o código de 6 números é pedido aqui mesmo (janela + caixa na página)
  const [stage, setStage] = useState<'form' | 'verify' | 'done'>('form');
  const [showSteps, setShowSteps] = useState(true);
  const [f, setF] = useState({ name: '', email: '', password: '', countryCode: country || 'BR', acceptTerms: false, confirmAge: false, marketingOptIn: false });
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: Me }>('/auth/register', { body: { ...f, locale, source: signupSource() } });
      track('CompleteRegistration');
      rememberEmail(r.user.email);
      login(r.token, r.user);
      rememberAfterVerify(next);
      if (r.user.emailVerifiedAt) nav(next ?? '/perfil');
      else { setStage('verify'); setShowSteps(true); }
    } catch (err) { setError(errorText(err, t)); }
  }
  const minAge = COUNTRIES.find((c) => c.code === f.countryCode)?.minAge ?? 18;
  if (stage !== 'form') {
    const email = me?.email ?? f.email;
    const verifyBody = (
      <>
        <p>{t('verify.stepsBody', { email })}</p>
        <ol className="next-step-list">
          <li>{t('verify.step1')}</li>
          <li>{t('verify.step2')}</li>
          <li>{t('verify.step3')}</li>
        </ol>
      </>
    );
    const verified = () => { rememberAfterVerify(null); setStage('done'); };
    return (
      <div className="container narrow">
        <h1>{t('verify.stepsTitle')}</h1>
        {stage === 'verify' && showSteps && (
          <NextStep icon="✉️" title={t('verify.stepsTitle')} onClose={() => setShowSteps(false)}
            actions={[{ label: t('verify.later'), primary: false, onClick: () => nav(next ?? '/perfil') }]}>
            {verifyBody}
            <EmailCodeForm autoFocus className="center" onVerified={verified} />
          </NextStep>
        )}
        {stage === 'verify' && !showSteps && (
          <div className="panel">
            {verifyBody}
            <EmailCodeForm autoFocus onVerified={verified} />
          </div>
        )}
        {stage === 'done' && <AccountReady next={next} onClose={() => nav(next ?? '/')} onLeave={() => {}} />}
      </div>
    );
  }
  return (
    <div className="container narrow">
      <h1>{t('auth.register')}</h1>
      <form className="panel" onSubmit={submit}>
        <label>{t('form.fullName')}<input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
        <label>{t('form.email')}<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
        <label>{t('form.password')}<input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></label>
        <label>{t('form.country')}
          <select value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {countryName(c.code, locale)}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" required checked={f.confirmAge} onChange={(e) => setF({ ...f, confirmAge: e.target.checked })} /> {t('auth.confirmAge', { age: minAge })}</label>
        <label className="check"><input type="checkbox" required checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} />
          <span>{t('auth.acceptTerms')} <Link to="/regras/terms" target="_blank">{t('legal.terms')}</Link> · <Link to="/regras/privacy" target="_blank">{t('legal.privacy')}</Link></span>
        </label>
        <label className="check"><input type="checkbox" checked={f.marketingOptIn} onChange={(e) => setF({ ...f, marketingOptIn: e.target.checked })} /> {t('auth.marketingOptIn')}</label>
        {error && <p className="errors" role="alert">{error}</p>}
        <button className="btn btn-primary block">{t('auth.createAccount')}</button>
        <p className="small center">{t('auth.haveAccount')} <Link to={`/entrar${next ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('auth.login')}</Link></p>
      </form>
    </div>
  );
}

/** Pede o link de nova senha por e-mail. */
export function ForgotPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? recentEmails()[0] ?? '');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending'); setError('');
    try { await api('/auth/forgot-password', { body: { email } }); setState('sent'); } catch (err) { setError(errorText(err, t)); setState('idle'); }
  }
  return (
    <div className="container narrow">
      <h1>{t('auth.forgotTitle')}</h1>
      {state === 'sent'
        ? <p className="notice success">✉️ {t('auth.forgotSent')}</p>
        : <form className="panel" onSubmit={submit}>
            <p className="muted">{t('auth.forgotText')}</p>
            <label>{t('form.email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username email" /></label>
            {error && <p className="errors" role="alert">{error}</p>}
            <button className="btn btn-primary block" disabled={state === 'sending'}>{state === 'sending' ? t('common.wait') : t('auth.forgotSend')}</button>
          </form>}
      <p className="small center"><Link to="/entrar">{t('auth.login')}</Link></p>
    </div>
  );
}

/** Destino do link do e-mail: /redefinir-senha?token=... */
export function ResetPassword() {
  const { t } = useI18n();
  const { login } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError(t('auth.passwordsDiffer')); return; }
    setBusy(true); setError('');
    try {
      const r = await api<{ token: string; user: Me }>('/auth/reset-password', { body: { token: params.get('token') ?? '', password } });
      rememberEmail(r.user.email);
      login(r.token, r.user);
      window.alert(t('auth.resetDone'));
      nav('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_or_expired_token') setFailed(true);
      else setError(errorText(err, t));
    } finally { setBusy(false); }
  }
  return (
    <div className="container narrow">
      <h1>{t('auth.resetTitle')}</h1>
      {failed
        ? <><p className="notice warn">{t('auth.resetFailed')}</p><Link className="btn btn-primary" to="/esqueci-senha">{t('auth.forgotSend')}</Link></>
        : <form className="panel" onSubmit={submit}>
            <label>{t('auth.newPassword')}<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
            <label>{t('auth.confirmPassword')}<input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
            {error && <p className="errors" role="alert">{error}</p>}
            <button className="btn btn-primary block" disabled={busy}>{busy ? t('common.wait') : t('auth.resetSave')}</button>
          </form>}
    </div>
  );
}
