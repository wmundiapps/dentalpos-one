import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp, type Me } from '../state';
import { COUNTRY_BY_CODE } from '../../../shared/countries';
import { STRIKE_RULES } from '../../../shared/rules';
import { errorText } from '../errors';
import { formatDateTime } from '../format';

export default function Profile() {
  const { t, locale } = useI18n();
  const { me, refreshMe } = useApp();
  const [doc, setDoc] = useState({ documentType: '', documentNumber: '' });
  const [lic, setLic] = useState({ body: '', number: '', region: '' });
  const [info, setInfo] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', bio: me?.bio ?? '', companyTaxId: me?.companyTaxId ?? '' });
  const [msg, setMsg] = useState('');
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
      {msg && <p className="notice small">{msg}</p>}

      <section className="panel">
        <h2>{t('profile.info')}</h2>
        <label>{t('form.fullName')}<input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></label>
        <label>{t('form.phone')}<input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></label>
        <label>{t('form.companyId', { id: cfg?.companyIdLabel ?? '' })}<input value={info.companyTaxId} onChange={(e) => setInfo({ ...info, companyTaxId: e.target.value })} /></label>
        <label>{t('form.bio')}<textarea value={info.bio} onChange={(e) => setInfo({ ...info, bio: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={() => run('/me', info, 'PUT')}>{t('common.save')}</button>
      </section>

      <section className="panel">
        <h2>{t('profile.identity')} {me.identityVerified && <span className="badge">✅ {t('profile.verified')}</span>}</h2>
        <p className="muted small">{t('profile.identityHelp')}</p>
        {!me.identityVerified && <>
          <label>{t('form.documentType')}<input value={doc.documentType} onChange={(e) => setDoc({ ...doc, documentType: e.target.value })} placeholder={cfg?.documentLabel} /></label>
          <label>{t('form.documentNumber')}<input value={doc.documentNumber} onChange={(e) => setDoc({ ...doc, documentNumber: e.target.value })} /></label>
          <button className="btn btn-primary" onClick={() => run('/me/verify-identity', doc)}>{t('profile.verify')}</button>
        </>}
      </section>

      <section className="panel">
        <h2>{t('profile.license')} {me.professionalLicense?.verified && <span className="badge">✅ {t('profile.verified')}</span>}</h2>
        {me.professionalLicense && <p>{me.professionalLicense.body} · {me.professionalLicense.number} {me.professionalLicense.region}</p>}
        <p className="muted small">{t('profile.licenseHelp')}</p>
        {cfg && <p className="muted small">{Object.values(cfg.licenseBodies).join(' · ')}</p>}
        <label>{t('form.licenseBody')}<input value={lic.body} onChange={(e) => setLic({ ...lic, body: e.target.value })} placeholder={cfg?.licenseBodies.dental ?? cfg?.licenseBodies.default} /></label>
        <label>{t('form.licenseNumber')}<input value={lic.number} onChange={(e) => setLic({ ...lic, number: e.target.value })} /></label>
        <label>{t('form.licenseRegion')}<input value={lic.region} onChange={(e) => setLic({ ...lic, region: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={() => run('/me/license', { ...lic, region: lic.region || undefined })}>{t('common.save')}</button>
      </section>
    </div>
  );
}
