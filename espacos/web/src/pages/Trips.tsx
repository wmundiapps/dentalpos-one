import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { SpaceArt } from '../components/SpaceArt';
import type { Booking, SpaceCategory } from '../../../shared/types';
import { formatDate, money } from '../format';

export type BookingRow = Booking & { listing: { id: string; title: string; city: string; countryCode: string; category: SpaceCategory; photos: string[]; timezone: string }; otherName?: string };

export function BookingList({ rows, hostView }: { rows: BookingRow[]; hostView?: boolean }) {
  const { t, locale } = useI18n();
  if (!rows.length) return <p className="muted">{t('trips.empty')}</p>;
  return (
    <div className="booking-rows">
      {rows.map((b) => (
        <Link key={b.id} to={hostView ? `/anfitriao/reservas/${b.id}` : `/reservas/${b.id}`} className="booking-row">
          <div className="thumb"><SpaceArt id={b.listing.id} category={b.listing.category} photo={b.listing.photos[0]} /></div>
          <div className="grow">
            <strong>{b.listing.title}</strong>
            <div className="muted small">{b.listing.city} · {formatDate(b.occurrences[0].date, locale)} {b.occurrences[0].start}–{b.occurrences[0].end}{b.occurrences.length > 1 ? ` (+${b.occurrences.length - 1})` : ''}</div>
            {b.otherName && <div className="muted small">{hostView ? t('booking.guest') : t('booking.host')}: {b.otherName}</div>}
          </div>
          <div className="right">
            <span className={`status status-${b.status}`}>{t(`status.${b.status}` as DictKey)}</span>
            <div className="small">{money(hostView ? b.price.hostPayout : b.price.total, b.price.currency, locale)}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Trips() {
  const { t } = useI18n();
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  useEffect(() => { api<BookingRow[]>('/bookings?role=guest').then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <div className="container"><div className="skeleton hero-skeleton" /></div>;
  const upcoming = rows.filter((b) => ['pending_guarantor', 'pending_host', 'confirmed', 'checked_in'].includes(b.status));
  const past = rows.filter((b) => !upcoming.includes(b));
  return (
    <div className="container">
      <h1>{t('nav.trips')}</h1>
      <h2>{t('trips.upcoming')}</h2>
      <BookingList rows={upcoming} />
      <h2>{t('trips.past')}</h2>
      <BookingList rows={past} />
      {!rows.length && <Link to="/" className="btn btn-primary">{t('trips.explore')}</Link>}
    </div>
  );
}
