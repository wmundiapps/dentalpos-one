import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { BookingList, type BookingRow } from './Trips';
import { ListingCard, type ListingSummary } from '../components/ListingCard';
import { money } from '../format';
import { errorText } from '../errors';

export default function HostDashboard() {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<'requests' | 'upcoming' | 'listings' | 'earnings'>('requests');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [listings, setListings] = useState<Array<ListingSummary & { active: boolean }>>([]);
  useEffect(() => {
    api<BookingRow[]>('/bookings?role=host').then(setRows).catch(() => {});
    api<Array<ListingSummary & { active: boolean }>>('/host/listings').then(setListings).catch(() => {});
  }, []);
  const requests = rows.filter((b) => b.status === 'pending_host' || b.status === 'pending_guarantor');
  const upcoming = rows.filter((b) => b.status === 'confirmed' || b.status === 'checked_in');
  const done = rows.filter((b) => b.status === 'completed');
  const earnings = new Map<string, number>();
  for (const b of done) earnings.set(b.price.currency, (earnings.get(b.price.currency) ?? 0) + b.price.hostPayout);

  return (
    <div className="container">
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
                <Link to={`/anfitriao/espacos/${l.id}`}>{t('host.edit')}</Link>
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

// Conta de recebimento: o valor de cada reserva cai direto na conta Mercado Pago do anfitrião (split)
function PayoutAccount() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [st, setSt] = useState<{ required: boolean; connected: boolean; mpUserId?: string } | null>(null);
  const [error, setError] = useState('');
  const load = () => api<typeof st>('/me/payout-account').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!st || !st.required) return null;
  async function connect() {
    setError('');
    try { window.location.assign((await api<{ url: string }>('/me/payout-account/connect', { method: 'POST' })).url); } catch (e) { setError(errorText(e, t)); }
  }
  async function disconnect() {
    if (!window.confirm(t('payout.confirmDisconnect'))) return;
    try { await api('/me/payout-account', { method: 'DELETE' }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  const status = params.get('mp');
  return (
    <section className={`panel payout ${st.connected ? '' : 'warn'}`}>
      {status === 'conectado' && st.connected && <p className="notice success">✅ {t('payout.success')}</p>}
      {status === 'erro' && <p className="errors">{t('payout.error')}</p>}
      <h2>💳 {t('payout.title')}</h2>
      {st.connected ? (
        <p className="row between wrap gap">
          <span>✅ {t('payout.connected', { id: st.mpUserId ?? '' })}</span>
          <button className="btn btn-ghost small" onClick={disconnect}>{t('payout.disconnect')}</button>
        </p>
      ) : (
        <>
          <p>{t('payout.help')}</p>
          <p className="notice warn small">{t('payout.required')}</p>
          <button className="btn btn-primary" onClick={connect}>{t('payout.connect')}</button>
        </>
      )}
      {error && <p className="errors small">{error}</p>}
    </section>
  );
}
