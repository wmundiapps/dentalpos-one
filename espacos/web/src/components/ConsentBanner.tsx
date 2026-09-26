import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { consent, setConsent, trackingConfigured } from '../tracking';

// Consentimento para cookies de medição de anúncios (LGPD; Política de Privacidade, cláusula 8).
// Só aparece quando há Meta Pixel ou tag do Google configurados.
export function ConsentBanner() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => trackingConfigured() && consent() === null);
  if (!open) return null;
  const choose = (v: 'yes' | 'no') => { setConsent(v); setOpen(false); };
  return (
    <div className="consent-banner" role="dialog" aria-live="polite">
      <p>{t('consent.text')} <Link to="/regras/privacy">{t('consent.more')}</Link></p>
      <div className="consent-actions">
        <button className="btn" onClick={() => choose('no')}>{t('consent.reject')}</button>
        <button className="btn btn-primary" onClick={() => choose('yes')}>{t('consent.accept')}</button>
      </div>
    </div>
  );
}
