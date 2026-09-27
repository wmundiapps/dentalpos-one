import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import { useI18n } from '../i18n';
import { useApp } from '../state';

// Aviso no topo enquanto o e-mail do cadastro não for confirmado: digitar o código de 6 números
// (mais fácil no celular) ou tocar no link do e-mail.
export function EmailVerifyBanner() {
  const { t } = useI18n();
  const { me, refreshMe } = useApp();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me || me.emailVerifiedAt) return null;

  async function resend() {
    setBusy(true);
    try {
      await api('/me/resend-verification', { body: {} });
      setMsg(t('verify.resent'));
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await api('/me/verify-code', { body: { code } });
      await refreshMe();
    } catch (err) {
      setMsg(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <form className="notice warn verify-banner" role="status" onSubmit={confirm}>
        <span>✉️ {t('verify.codeBanner', { email: me.email })}</span>
        <span className="row gap wrap">
          <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="000000"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-label={t('verify.codeLabel')} />
          <button className="btn btn-primary small" disabled={busy || code.length !== 6}>{t('verify.confirm')}</button>
          <button type="button" className="btn btn-link" disabled={busy} onClick={resend}>{t('verify.resendCode')}</button>
        </span>
        {msg && <strong className="small">{msg}</strong>}
      </form>
    </div>
  );
}
