import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { SpaceArt } from '../components/SpaceArt';
import { Stars } from '../components/Stars';
import { PriceLines } from '../components/PriceLines';
import { PolicySummary } from '../components/PolicySummary';
import { DayTimeline } from '../components/DayTimeline';
import type { ListingSummary } from '../components/ListingCard';
import { COUNTRY_BY_CODE } from '../../../shared/countries';
import { BOOKING_LIMITS, CATEGORY_ICONS, addDays, todayInZone } from '../../../shared/rules';
import type { Occurrence, PriceBreakdown, PublicUser, Review, Weekday } from '../../../shared/types';
import { countryName, flag, formatDate, money, timeSlots, placeLine } from '../format';
import type { DictKey } from '../i18n';

type Detail = { listing: ListingSummary; host: PublicUser; reviews: Review[] };
type Quote = { price: PriceBreakdown; errors: Array<{ code: string; params?: Record<string, string | number> }>; guarantorRequired: boolean; guarantorLiabilityCap: number };
type Mode = 'single' | 'consecutive' | 'weekly';

export function buildOccurrences(mode: Mode, date: string, start: string, end: string, count: number): Occurrence[] {
  if (!date) return [];
  const n = mode === 'single' ? 1 : Math.max(1, count);
  const step = mode === 'weekly' ? 7 : 1;
  return Array.from({ length: n }, (_, i) => ({ date: addDays(date, i * step), start, end }));
}

export default function ListingPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, locale } = useI18n();
  const { me } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<Mode>('single');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('11:00');
  const [count, setCount] = useState(2);
  const [guests, setGuests] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    api<Detail>(`/listings/${id}`).then((d) => {
      setData(d);
      const tz = d.listing.timezone;
      // sugere a próxima data com horário ocioso
      for (let i = 1; i < 30; i++) {
        const dt = addDays(todayInZone(tz), i);
        const w = d.listing.weeklyAvailability[new Date(`${dt}T12:00:00Z`).getUTCDay() as Weekday];
        if (w?.length && !d.listing.blockedDates.includes(dt)) {
          setDate(dt);
          setStart(w[0].start);
          const [h, m] = w[0].start.split(':').map(Number);
          const endMin = Math.min(h * 60 + m + Math.max(d.listing.minHours, 2) * 60, Number(w[0].end.split(':')[0]) * 60 + Number(w[0].end.split(':')[1]));
          setEnd(`${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`);
          break;
        }
      }
    }).catch(() => setNotFound(true));
  }, [id]);

  const occurrences = useMemo(() => buildOccurrences(mode, date, start, end, count), [mode, date, start, end, count]);

  useEffect(() => {
    if (!data || !occurrences.length) { setQuote(null); return; }
    const h = setTimeout(() => {
      api<Quote>(`/listings/${id}/quote`, { body: { occurrences } }).then(setQuote).catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(h);
  }, [data, id, occurrences]);

  if (notFound) return <div className="container empty"><p>{t('err.listing_not_found')}</p><Link to="/">{t('common.backHome')}</Link></div>;
  if (!data) return <div className="container"><div className="skeleton hero-skeleton" /></div>;
  const { listing: l, host, reviews } = data;
  const country = COUNTRY_BY_CODE[l.countryCode];
  const guestReviews = reviews.filter((r) => r.kind === 'guest_to_listing');
  const clientReviews = reviews.filter((r) => r.kind === 'client_to_listing');
  const slots = timeSlots();
  const canBook = quote && quote.errors.length === 0 && guests <= l.capacity;
  const weekdays: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

  function reserve() {
    const q = new URLSearchParams({ o: JSON.stringify(occurrences), g: String(guests) });
    if (!me) { nav(`/entrar?next=${encodeURIComponent(`/reservar/${l.id}?${q}`)}`); return; }
    nav(`/reservar/${l.id}?${q}`);
  }

  return (
    <div className="container listing-page">
      {me?.id === l.hostId && (
        <div className={`notice ${params.get('publicado') ? 'success' : ''} row between wrap gap`}>
          <span>{params.get('publicado') ? `🎉 ${t('listing.publishedNotice')}` : t('listing.youAreHost')}</span>
          <Link className="btn btn-primary small" to={`/anfitriao/espacos/${l.id}`}>✏️ {t('listing.editOwn')}</Link>
        </div>
      )}
      <h1>{l.title}</h1>
      <div className="row wrap gap muted">
        <Stars value={l.rating} count={l.reviewCount} />
        <span>{flag(l.countryCode)} {l.neighborhood ? `${l.neighborhood}, ` : ''}{placeLine(l)}, {countryName(l.countryCode, locale)}</span>
        {l.instantBook && <span className="badge">⚡ {t('listing.instant')}</span>}
        {l.requiresLicense && <span className="badge">🪪 {t('listing.licenseRequired')}</span>}
      </div>

      <div className="gallery">
        <div className="gallery-main"><SpaceArt id={l.id} category={l.category} photo={l.photos[0]} /></div>
        {[1, 2, 3, 4].map((i) => <div key={i} className="gallery-thumb"><SpaceArt id={l.id} category={l.category} photo={l.photos[i]} variant={i} /></div>)}
      </div>

      <div className="listing-layout">
        <div className="listing-main">
          <section className="section row between">
            <div>
              <h2>{CATEGORY_ICONS[l.category]} {t(`cat.${l.category}` as DictKey)} · {t('listing.hostedBy', { name: host.name })}</h2>
              <p className="muted">{t('listing.capacity', { n: l.capacity })}{l.areaM2 ? ` · ${l.areaM2} m²` : ''} · {t('listing.minHours', { n: l.minHours })} · {t('listing.buffer', { n: l.bufferMinutes })}</p>
            </div>
            <div className="avatar big">{host.name[0]}</div>
          </section>

          <section className="section highlights">
            {host.identityVerified && <div>✅ <strong>{t('listing.hostVerified')}</strong></div>}
            <div>🗓️ <strong>{t(`policy.${l.cancellationPolicy}` as DictKey)}</strong></div>
            {l.guarantorPolicy !== 'none' && <div>🤝 <strong>{t(`guarantor.policy.${l.guarantorPolicy}` as DictKey, { amount: money(l.guarantorThreshold ?? 0, l.currency, locale) })}</strong></div>}
            {l.securityDeposit > 0 && <div>🔒 <strong>{t('listing.deposit', { amount: money(l.securityDeposit, l.currency, locale) })}</strong></div>}
          </section>

          <section className="section"><p className="pre">{l.description}</p></section>

          <section className="section">
            <h2>{t('listing.equipment')}</h2>
            <p className="pre">{l.equipment}</p>
            <div className="amenities">
              {l.amenities.map((a) => <span key={a} className="amenity">✓ {t(`amen.${a}` as DictKey)}</span>)}
            </div>
          </section>

          <section className="section">
            <h2>{t('listing.idleHours')}</h2>
            <table className="hours">
              <tbody>
                {weekdays.map((d) => (
                  <tr key={d}>
                    <th>{t(`weekday.${d}` as DictKey)}</th>
                    <td>{l.weeklyAvailability[d]?.length ? l.weeklyAvailability[d]!.map((r) => `${r.start}–${r.end}`).join(' · ') : <span className="muted">{t('listing.unavailable')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">{t('listing.timezone', { tz: l.timezone })}</p>
          </section>

          <section className="section">
            <h2>{t('listing.houseRules')}</h2>
            <p className="pre">{l.houseRules}</p>
            {l.buildingRules && <><h3>{t('listing.buildingRules')}</h3><p className="pre">{l.buildingRules}</p></>}
            {l.allowedActivities && <><h3>{t('listing.allowed')}</h3><p className="pre">{l.allowedActivities}</p></>}
            {l.forbiddenActivities && <><h3>{t('listing.forbidden')}</h3><p className="pre">{l.forbiddenActivities}</p></>}
            <div className="notice">
              <strong>{t('listing.platformRules')}</strong>
              <ul className="small">
                <li>{t('rules.short.noOvernight', { from: BOOKING_LIMITS.earliestStart, to: BOOKING_LIMITS.latestEnd, max: BOOKING_LIMITS.maxHoursPerOccurrence })}</li>
                <li>{t('rules.short.noLongTerm', { days: BOOKING_LIMITS.maxConsecutiveDays, weeks: BOOKING_LIMITS.maxRecurringWeeks, hours: BOOKING_LIMITS.maxHoursPer30DaysPerListing })}</li>
                <li>{t('rules.short.noAddress')}</li>
                <li>{t('rules.short.overstay')}</li>
                <li>{t('rules.short.noSublet')}</li>
              </ul>
              <Link to="/regras/booking-rules" className="small">{t('common.readFullRules')}</Link> · <Link to="/regras/space-norms" className="small">{t('legal.space-norms')}</Link> · <Link to="/regras/penalties" className="small">{t('legal.penalties')}</Link>
            </div>
          </section>

          <section className="section">
            <h2>{t('listing.cancellation')}</h2>
            <PolicySummary policy={l.cancellationPolicy} withdrawalDays={country?.withdrawalDays} />
          </section>

          <section className="section">
            <h2><Stars value={l.rating} /> · {t('reviews.count', { n: l.reviewCount })}</h2>
            {guestReviews.length === 0 && <p className="muted">{t('reviews.none')}</p>}
            <div className="reviews">
              {guestReviews.map((r) => <ReviewItem key={r.id} r={r} />)}
            </div>
          </section>

          {clientReviews.length > 0 && (
            <section className="section">
              <h2>{t('reviews.clientTitle')} · <Stars value={l.clientRating} count={l.clientReviewCount} /></h2>
              <p className="muted small">{t('reviews.clientExplain')}</p>
              <div className="reviews">{clientReviews.map((r) => <ReviewItem key={r.id} r={r} />)}</div>
            </section>
          )}

          <section className="section">
            <h2>{t('listing.location')}</h2>
            <p>{l.neighborhood ? `${l.neighborhood}, ` : ''}{placeLine(l)} — {countryName(l.countryCode, locale)}</p>
            <p className="muted small">{l.address ?? t('listing.addressAfterConfirm')}</p>
          </section>
        </div>

        <aside className="booking-widget">
          <div className="panel sticky">
            <p><strong className="big-price">{money(l.pricePerHour, l.currency, locale)}</strong> / {t('common.hour')}
              {l.pricePerDay && <span className="muted small"> · {money(l.pricePerDay, l.currency, locale)} / {t('common.day')}</span>}</p>
            <div className="seg" role="radiogroup">
              {(['single', 'consecutive', 'weekly'] as Mode[]).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>{t(`book.mode.${m}` as DictKey)}</button>
              ))}
            </div>
            <div className="form-grid">
              <label className="span2">{t('search.date')}<input type="date" value={date} min={todayInZone(l.timezone)} max={addDays(todayInZone(l.timezone), BOOKING_LIMITS.maxAdvanceDays)} onChange={(e) => setDate(e.target.value)} /></label>
              <label>{t('search.from')}<select value={start} onChange={(e) => setStart(e.target.value)}>{slots.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label>{t('search.to')}<select value={end} onChange={(e) => setEnd(e.target.value)}>{slots.map((s) => <option key={s}>{s}</option>)}</select></label>
              {mode !== 'single' && (
                <label className="span2">{mode === 'weekly' ? t('book.weeks') : t('book.days')}
                  <input type="number" min={2} max={mode === 'weekly' ? BOOKING_LIMITS.maxRecurringWeeks : BOOKING_LIMITS.maxConsecutiveDays} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                </label>
              )}
              <label className="span2">{t('search.people')}<input type="number" min={1} max={l.capacity} value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></label>
            </div>
            <DayTimeline listingId={l.id} date={date} selection={{ start, end }} />
            {mode !== 'single' && occurrences.length > 0 && <p className="small muted">{occurrences.map((o) => formatDate(o.date, locale, { day: 'numeric', month: 'short' })).join(', ')}</p>}
            {quote && quote.errors.length > 0 && (
              <ul className="errors small">{quote.errors.map((e, i) => <li key={i}>{t(`val.${e.code}` as DictKey, e.params)}</li>)}</ul>
            )}
            {guests > l.capacity && <p className="errors small">{t('err.over_capacity', { max: l.capacity })}</p>}
            <button className="btn btn-primary block" disabled={!canBook} onClick={reserve}>
              {l.instantBook ? t('book.reserve') : t('book.request')}
            </button>
            <p className="muted small center">{t('book.notChargedYet')}</p>
            {quote && <PriceLines p={quote.price} />}
            {quote?.guarantorRequired && <p className="small notice">🤝 {t('book.guarantorNeeded')}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ReviewItem({ r }: { r: Review }) {
  const { t, locale } = useI18n();
  return (
    <article className="review">
      <div className="row gap">
        <span className="avatar">{r.authorName[0]}</span>
        <div>
          <strong>{r.authorName}</strong>
          <div className="muted small">{formatDate(r.createdAt.slice(0, 10), locale, { month: 'long', year: 'numeric' })} · ★ {r.rating}</div>
        </div>
      </div>
      <p>{r.comment}</p>
      {r.response && <p className="response small"><strong>{t('reviews.response')}:</strong> {r.response.text}</p>}
    </article>
  );
}
