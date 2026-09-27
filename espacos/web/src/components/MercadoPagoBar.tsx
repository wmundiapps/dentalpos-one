import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { MP_SIGNUP_URL, MpConnectError, useMpConnect } from './MercadoPagoPrompt';

type Status = { needed?: boolean; configured?: boolean; connected: boolean };

// Barra fixa em todas as telas para anfitriões que ainda não conectaram o Mercado Pago.
// Não fecha e não diminui: só some quando a conta estiver conectada.
export function MercadoPagoBar() {
  const { t } = useI18n();
  const { me } = useApp();
  const loc = useLocation();
  const [st, setSt] = useState<Status | null>(null);
  const { connect, busy, error } = useMpConnect();

  useEffect(() => {
    if (!me) { setSt(null); return; }
    const load = () => api<Status>('/me/payout-account').then(setSt).catch(() => {});
    load();
    window.addEventListener('focus', load); // volta do Mercado Pago em outra aba
    return () => window.removeEventListener('focus', load);
  }, [me, loc.pathname, loc.search]);

  if (!me || !st || st.connected || st.needed === false) return null;
  const isHost = me.roles.includes('host') || loc.pathname.startsWith('/anfitriao');
  if (!isHost) return null;

  return (
    <div className="mp-bar" role="region" aria-label={t('mp.barTitle')}>
      <div className="container mp-bar-inner">
        <div className="mp-bar-text">
          <strong>💳 {t('mp.barTitle')}</strong>
          <span>{t('mp.barText')}</span>
        </div>
        <div className="mp-bar-actions">
          <button className="btn mp-bar-connect" onClick={connect} disabled={busy}>{busy ? t('mp.opening') : `🔗 ${t('mp.barConnect')}`}</button>
          <a className="btn mp-bar-create" href={MP_SIGNUP_URL} target="_blank" rel="noopener noreferrer">➕ {t('mp.barCreate')} ↗</a>
        </div>
        {st.configured === false && me.roles.includes('admin') && <p className="mp-bar-admin">⚙️ {t('mp.barAdminSetup')}</p>}
        {error && <div className="mp-bar-error"><MpConnectError error={error} /></div>}
      </div>
    </div>
  );
}
