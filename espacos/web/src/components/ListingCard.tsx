import { Link } from 'react-router-dom';
import { SpaceArt } from './SpaceArt';
import { Stars } from './Stars';
import { useI18n } from '../i18n';
import { money, countryName } from '../format';
import type { Listing } from '../../../shared/types';

export type ListingSummary = Omit<Listing, 'address'> & { address?: string; rating: number | null; reviewCount: number; clientRating: number | null; clientReviewCount: number };

export function ListingCard({ l, fav, onFav }: { l: ListingSummary; fav?: boolean; onFav?: () => void }) {
  const { t, locale } = useI18n();
  return (
    <article className="card">
      <Link to={`/espacos/${l.id}`} className="card-link">
        <div className="card-media">
          <SpaceArt id={l.id} category={l.category} photo={l.photos[0]} />
          {l.instantBook && <span className="badge badge-float">⚡ {t('listing.instant')}</span>}
        </div>
        <div className="card-body">
          <div className="row between">
            <strong className="ellipsis">{l.neighborhood ? `${l.neighborhood}, ` : ''}{l.city}</strong>
            <Stars value={l.rating} compact />
          </div>
          <div className="muted ellipsis">{t(`cat.${l.category}` as never)} · {countryName(l.countryCode, locale)}</div>
          <div className="muted ellipsis">{l.title}</div>
          <div><strong>{money(l.pricePerHour, l.currency, locale)}</strong> <span className="muted">/ {t('common.hour')}</span></div>
        </div>
      </Link>
      {onFav && (
        <button className={`fav ${fav ? 'on' : ''}`} onClick={onFav} aria-label={t('fav.toggle')} aria-pressed={fav}>♥</button>
      )}
    </article>
  );
}
