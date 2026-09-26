import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signupSource, track } from '../tracking';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp, type Me } from '../state';
import { COUNTRIES } from '../../../shared/countries';
import { countryName, flag } from '../format';
import { errorText } from '../errors';

export function Login() {
  const { t } = useI18n();
  const { login } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: Me }>('/auth/login', { body: { email, password } });
      login(r.token, r.user);
      nav(params.get('next') ?? '/');
    } catch (err) { setError(errorText(err, t)); }
  }
  return (
    <div className="container narrow">
      <h1>{t('auth.login')}</h1>
      <form className="panel" onSubmit={submit}>
        <label>{t('form.email')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>{t('form.password')}<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="errors" role="alert">{error}</p>}
        <button className="btn btn-primary block">{t('auth.login')}</button>
        <p className="small center">{t('auth.noAccount')} <Link to={`/cadastro${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>{t('auth.register')}</Link></p>
      </form>
      <div className="notice small">
        <strong>{t('auth.demoTitle')}</strong>
        <p>{t('auth.demoText')}</p>
        <ul className="plain">
          <li><button className="link-btn" onClick={() => { setEmail('locatario@spacehour.demo'); setPassword('demo12345'); }}>locatario@spacehour.demo</button> — {t('auth.demoGuest')}</li>
          <li><button className="link-btn" onClick={() => { setEmail('anfitriao@spacehour.demo'); setPassword('demo12345'); }}>anfitriao@spacehour.demo</button> — {t('auth.demoHost')}</li>
          <li><button className="link-btn" onClick={() => { setEmail('admin@spacehour.demo'); setPassword('demo12345'); }}>admin@spacehour.demo</button> — {t('auth.demoAdmin')}</li>
        </ul>
      </div>
    </div>
  );
}

export function Register() {
  const { t, locale } = useI18n();
  const { login, country } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ name: '', email: '', password: '', countryCode: country || 'BR', acceptTerms: false, confirmAge: false });
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ token: string; user: Me }>('/auth/register', { body: { ...f, locale, source: signupSource() } });
      track('CompleteRegistration');
      login(r.token, r.user);
      nav(params.get('next') ?? '/perfil');
    } catch (err) { setError(errorText(err, t)); }
  }
  const minAge = COUNTRIES.find((c) => c.code === f.countryCode)?.minAge ?? 18;
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
        {error && <p className="errors" role="alert">{error}</p>}
        <button className="btn btn-primary block">{t('auth.createAccount')}</button>
        <p className="small center">{t('auth.haveAccount')} <Link to="/entrar">{t('auth.login')}</Link></p>
      </form>
    </div>
  );
}
