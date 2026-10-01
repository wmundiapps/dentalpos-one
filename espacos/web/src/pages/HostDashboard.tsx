import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { BookingList, type BookingRow } from './Trips';
import { ListingCard, type ListingSummary } from '../components/ListingCard';
import { money } from '../format';
import { errorText } from '../errors';
import { MP_SIGNUP_URL, MpConnectError, useMercadoPagoPrompt, useMpConnect } from '../components/MercadoPagoPrompt';
import { AsaasConnect } from '../components/AsaasConnect';
import { NextStep } from '../components/NextStep';

export default function HostDashboard() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'requests' | 'upcoming' | 'listings' | 'earnings'>(params.get('aba') === 'anuncios' ? 'listings' : 'requests');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [listings, setListings] = useState<Array<ListingSummary & { active: boolean }>>([]);
  useEffect(() => {
    api<BookingRow[]>('/bookings?role=host').then(setRows).catch(() => {});
    api<Array<ListingSummary & { active: boolean }>>('/host/listings').then(setListings).catch(() => {});
  }, []);
  const mp = useMercadoPagoPrompt();
  useEffect(() => { mp.show('dashboard'); }, [mp.show]);
  const requests = rows.filter((b) => b.status === 'pending_host' || b.status === 'pending_guarantor');
  const upcoming = rows.filter((b) => b.status === 'confirmed' || b.status === 'checked_in');
  const done = rows.filter((b) => b.status === 'completed');
  const earnings = new Map<string, number>();
  for (const b of done) earnings.set(b.price.currency, (earnings.get(b.price.currency) ?? 0) + b.price.hostPayout);

  return (
    <div className="container">
      {mp.modal}
      <div className="row between wrap">
        <h1>{t('host.title')}</h1>
        <Link to="/anfitriao/novo" className="btn btn-primary">+ {t('nav.newListing')}</Link>
      </div>
      <PayoutAccount />
      <div className="tabs">
        <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>{t('host.requests')} {requests.length > 0 && <span className="count">{requests.length}</span>}</button>
        <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>{t('host.upcoming')}</button>
        <button className={tab === 'listings' ? 'active' : ''} onClick={() => setTab('listings')}>{t('host.listings')}</button>
        <button className={tab === 'earnings' ? 'active' : ''} onClick={() => setTab('earnings')}>{t('host.earnings')}</button>
      </div>
      {tab === 'requests' && <><p className="muted small">{t('host.requestsHelp')}</p><BookingList rows={requests} hostView /></>}
      {tab === 'upcoming' && <BookingList rows={upcoming} hostView />}
      {tab === 'listings' && (
        <div className="grid">
          {listings.map((l) => (
            <div key={l.id}>
              <ListingCard l={l} />
              <div className="row gap small">
                <Link className="btn btn-outline small" to={`/anfitriao/espacos/${l.id}`}>✏️ {t('listing.editOwn')}</Link>
                {!l.active && <span className="badge">{t('host.inactive')}</span>}
              </div>
            </div>
          ))}
          {listings.length === 0 && <p className="muted">{t('host.noListings')}</p>}
        </div>
      )}
      {tab === 'earnings' && (
        <div>
          {[...earnings].map(([cur, v]) => <p key={cur} className="big-price">{money(v, cur, locale)}</p>)}
          {earnings.size === 0 && <p className="muted">{t('host.noEarnings')}</p>}
          <p className="muted small">{t('host.earningsHelp')}</p>
          <BookingList rows={done} hostView />
        </div>
      )}
    </div>
  );
}

// Onde o anfitrião recebe: carteira Asaas (o cliente paga com Pix/cartão sem precisar de conta) e/ou Mercado Pago (split)
type PayoutStatus = {
  required: boolean; connected: boolean; mpUserId?: string; anyConnected?: boolean;
  mercadopago?: { enabled: boolean; connected: boolean; mpUserId?: string };
  asaas?: { enabled: boolean; connected: boolean; origin?: string; walletId?: string };
};

function PayoutAccount() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [st, setSt] = useState<PayoutStatus | null>(null);
  const [error, setError] = useState('');
  const [asaasDone, setAsaasDone] = useState(false);
  const { connect, busy, error: connectError } = useMpConnect();
  const load = () => api<PayoutStatus>('/me/payout-account').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (st && window.location.hash === '#receber') document.getElementById('receber')?.scrollIntoView({ behavior: 'smooth' }); }, [st]);
  if (!st) return null;
  const mpOn = st.mercadopago ? st.mercadopago.enabled : st.required;
  const mpConnected = st.mercadopago ? st.mercadopago.connected : st.connected;
  const asaasOn = !!st.asaas?.enabled;
  const any = st.anyConnected ?? st.connected;
  if (!st.required && any) return null;
  async function disconnect(path: string) {
    if (!window.confirm(t('payout.confirmDisconnect'))) return;
    try { await api(path, { method: 'DELETE' }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  const status = params.get('mp');
  return (
    <section id="receber" className={`panel payout ${any ? '' : 'warn'}`}>
      {status === 'conectado' && mpConnected && <p className="notice success">✅ {t('payout.success')}</p>}
      {status === 'erro' && <p className="notice warn"><strong>{t('payout.error')}</strong> {t(`err.${params.get('motivo') ?? 'mp_connect_failed'}` as DictKey)}</p>}
      <h2>💳 {t('payout.title')}</h2>
      {!any && <p className="notice warn small">{t('payout.requiredChoose')}</p>}

      {asaasOn && (
        <div className="payout-option">
          <h3>⚡ Asaas <span className="badge">{t('payout.recommended')}</span></h3>
          <p className="muted small">{t('payout.asaasWhy')}</p>
          {st.asaas!.connected ? (
            <p className="row between wrap gap">
              <span>✅ {t('payout.asaasConnected', { id: st.asaas!.walletId ?? '' })}</span>
              <button className="btn btn-ghost small" onClick={() => disconnect('/me/asaas-account')}>{t('payout.disconnect')}</button>
            </p>
          ) : <AsaasConnect onDone={() => { setAsaasDone(true); load(); }} />}
        </div>
      )}

      {mpOn && (
        <div className="payout-option">
          <h3>🤝 Mercado Pago</h3>
          {mpConnected ? (
            <p className="row between wrap gap">
              <span>✅ {t('payout.connected', { id: (st.mercadopago?.mpUserId ?? st.mpUserId) ?? '' })}</span>
              <button className="btn btn-ghost small" onClick={() => disconnect('/me/payout-account')}>{t('payout.disconnect')}</button>
            </p>
          ) : (
            <>
              <p className="muted small">{t('payout.help')}</p>
              <div className="row gap wrap">
                <button className="btn btn-primary" onClick={connect} disabled={busy}>{busy ? t('mp.opening') : t('payout.connect')}</button>
                <a className="btn btn-outline" href={MP_SIGNUP_URL} target="_blank" rel="noopener noreferrer">{t('mp.create')} ↗</a>
              </div>
              <p className="muted small">{t('mp.createHint')}</p>
              <MpConnectError error={connectError} />
            </>
          )}
        </div>
      )}
      {error && <p className="errors small">{error}</p>}
      {asaasDone && (
        <NextStep icon="🎉" title={t('next.asaasTitle')} steps={[t('next.asaasStep1'), t('next.asaasStep2'), t('next.asaasStep3')]}
          actions={[{ label: t('next.seeMyListings'), to: '/anfitriao?aba=anuncios', onClick: () => setAsaasDone(false) }]} onClose={() => setAsaasDone(false)} />
      )}
    </section>
  );
}
