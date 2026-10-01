import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { takeAfterVerify } from '../journey';
import { AccountReady, EmailCodeForm } from '../components/EmailCode';

// Destino do link enviado por e-mail: /confirmar-email?token=...
export default function ConfirmEmail() {
  const { t } = useI18n();
  const { me, refreshMe } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<'checking' | 'done' | 'failed'>('checking');
  // Para onde voltar (guardado no cadastro, ex.: a reserva que a pessoa estava fazendo)
  const [next, setNext] = useState<string | null>(null);
  const [showReady, setShowReady] = useState(true);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const token = params.get('token') ?? '';
    api('/auth/verify-email', { body: { token } })
      .then(() => refreshMe().finally(() => { setNext(takeAfterVerify()); setState('done'); }), () => setState('failed'));
  }, [params, refreshMe]);

  const verified = state === 'done' || (state === 'failed' && !!me?.emailVerifiedAt);
  return (
    <div className="container narrow">
      <h1>SpaceHour</h1>
      {state === 'checking' && <p>{t('verify.checking')}</p>}
      {verified && <p className="notice success">✅ {t('verify.done')}</p>}
      {verified && showReady && <AccountReady next={next} onClose={() => setShowReady(false)} />}
      {state === 'failed' && me && !me.emailVerifiedAt && (
        <div className="panel">
          <p className="notice warn">{t('verify.failedCode')}</p>
          <EmailCodeForm autoFocus onVerified={() => { setNext(takeAfterVerify()); setState('done'); setShowReady(true); }} />
        </div>
      )}
      {state === 'failed' && !me && (
        <>
          <p className="notice warn">{t('verify.failed')}</p>
          <Link className="btn btn-primary" to="/entrar?next=/perfil">{t('auth.login')}</Link>
        </>
      )}
      {verified && !showReady && <button className="btn btn-primary" onClick={() => nav(next ?? '/')}>{t('verify.continue')}</button>}
    </div>
  );
}
