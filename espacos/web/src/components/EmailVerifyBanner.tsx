import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import { useI18n } from '../i18n';
import { useApp } from '../state';

// Aviso no topo enquanto o e-mail do cadastro não for confirmado.
export function EmailVerifyBanner() {
  const { t } = useI18n();
  const { me } = useApp();
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

  return (
    <div className="container">
      <div className="notice warn" role="status">
        ✉️ {t('verify.banner', { email: me.email })}{' '}
        {msg ? <strong>{msg}</strong> : <button className="btn btn-link" disabled={busy} onClick={resend}>{busy ? t('common.wait') : t('verify.resend')}</button>}
      </div>
    </div>
  );
}
