import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { takeAfterVerify } from '../journey';
import { useApp } from '../state';
import { AccountReady, EmailCodeForm } from './EmailCode';

// Aviso no topo enquanto o e-mail do cadastro não for confirmado: digitar o código de 6 números
// (mais fácil no celular) ou tocar no link do e-mail. No cadastro e na página do link o código
// já aparece no próprio lugar, então o aviso do topo some.
export function EmailVerifyBanner() {
  const { t } = useI18n();
  const { me } = useApp();
  const { pathname } = useLocation();
  const [ready, setReady] = useState<{ next: string | null } | null>(null);
  if (ready) return <AccountReady next={ready.next} onClose={() => setReady(null)} />;
  if (!me || me.emailVerifiedAt || pathname === '/cadastro' || pathname === '/confirmar-email') return null;

  return (
    <div className="container">
      <div className="notice warn verify-banner" role="status">
        <span>✉️ {t('verify.codeBanner', { email: me.email })}</span>
        <EmailCodeForm onVerified={() => setReady({ next: takeAfterVerify() })} />
      </div>
    </div>
  );
}
