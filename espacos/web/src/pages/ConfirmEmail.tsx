import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';

// Destino do link enviado por e-mail: /confirmar-email?token=...
export default function ConfirmEmail() {
  const { t } = useI18n();
  const { refreshMe } = useApp();
  const [params] = useSearchParams();
  const [state, setState] = useState<'checking' | 'done' | 'failed'>('checking');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const token = params.get('token') ?? '';
    api('/auth/verify-email', { body: { token } })
      .then(() => refreshMe().finally(() => setState('done')), () => setState('failed'));
  }, [params, refreshMe]);

  return (
    <div className="container narrow">
      <h1>SpaceHour</h1>
      {state === 'checking' && <p>{t('verify.checking')}</p>}
      {state === 'done' && <p className="notice success">✅ {t('verify.done')}</p>}
      {state === 'failed' && <p className="notice warn">{t('verify.failed')}</p>}
      {state !== 'checking' && <Link className="btn btn-primary" to="/">{t('verify.continue')}</Link>}
    </div>
  );
}
