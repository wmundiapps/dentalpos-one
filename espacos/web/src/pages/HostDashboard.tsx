import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { BookingList, type BookingRow } from './Trips';
import { ListingCard, type ListingSummary } from '../components/ListingCard';
import { money } from '../format';

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
