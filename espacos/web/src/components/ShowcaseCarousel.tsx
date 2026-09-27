import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpaceArt } from './SpaceArt';
import { useI18n } from '../i18n';
import { money, placeLine } from '../format';
import type { ListingSummary } from './ListingCard';

const INTERVAL_MS = 5000;

// Banner rotativo com os espaços anunciados: foto grande e, no rodapé, título e local.
export function ShowcaseCarousel({ items }: { items: ListingSummary[] }) {
  const { t, locale } = useI18n();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;

  useEffect(() => {
    if (n < 2 || paused || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setI((x) => (x + 1) % n), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [n, paused]);
  useEffect(() => { if (i >= n) setI(0); }, [i, n]);

  if (!n) return null;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  return (
    <section className="showcase" aria-roledescription="carousel" aria-label={t('showcase.title')}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="showcase-track" style={{ transform: `translateX(${-100 * Math.min(i, n - 1)}%)` }}>
        {items.map((l, k) => (
          <Link key={l.id} to={`/espacos/${l.id}`} className="showcase-slide" aria-hidden={k !== i} tabIndex={k === i ? 0 : -1}>
            <SpaceArt id={l.id} category={l.category} photo={l.photos[0]} />
            <div className="showcase-caption">
              <span className="showcase-tag">{t(`cat.${l.category}` as never)}{l.bookable === false ? ` · ${t('listing.comingSoon')}` : ''}</span>
              <strong>{l.title}</strong>
              <span>📍 {l.neighborhood ? `${l.neighborhood}, ` : ''}{placeLine(l)} · {money(l.pricePerHour, l.currency, locale)} / {t('common.hour')}</span>
            </div>
          </Link>
        ))}
      </div>
      {n > 1 && (
        <>
          <button className="showcase-nav prev" onClick={() => go(-1)} aria-label={t('showcase.prev')}>‹</button>
          <button className="showcase-nav next" onClick={() => go(1)} aria-label={t('showcase.next')}>›</button>
          <div className="showcase-dots">
            {items.map((l, k) => <button key={l.id} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`${k + 1} / ${n}`} aria-current={k === i} />)}
          </div>
        </>
      )}
    </section>
  );
}
