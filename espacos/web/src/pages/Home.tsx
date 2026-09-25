import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { ListingCard, type ListingSummary } from '../components/ListingCard';
import { AMENITIES, CATEGORIES, CATEGORY_ICONS } from '../../../shared/rules';
import { COUNTRY_BY_CODE } from '../../../shared/countries';
import { countryName, flag, timeSlots } from '../format';

export default function Home() {
  const { t, locale } = useI18n();
  const { me, country, region, city } = useApp();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [list, setList] = useState<ListingSummary[] | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const category = params.get('category') ?? '';

  const query = useMemo(() => {
    const q = new URLSearchParams(params);
    if (country) q.set('country', country);
    if (region) q.set('state', region);
    if (city) q.set('city', city);
    return q.toString();
  }, [params, country, region, city]);

  useEffect(() => {
    setList(null);
    api<ListingSummary[]>(`/listings?${query}`).then(setList).catch(() => setList([]));
  }, [query]);
  useEffect(() => {
    if (me) api<ListingSummary[]>('/favorites').then((f) => setFavs(f.map((x) => x.id))).catch(() => {});
  }, [me]);

  function set(key: string, value: string) {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value); else p.delete(key);
    setParams(p, { replace: true });
  }

  async function toggleFav(id: string) {
    if (!me) { nav('/entrar'); return; }
    const on = favs.includes(id);
    setFavs(on ? favs.filter((x) => x !== id) : [...favs, id]);
    await api(`/favorites/${id}`, { method: on ? 'DELETE' : 'POST' }).catch(() => {});
  }

  const cfg = country ? COUNTRY_BY_CODE[country] : undefined;
  const slots = timeSlots();

  return (
    <div>
      <section className="hero">
        <div className="container">
          <h1>{t('home.title')}</h1>
          <p className="lead">{t('home.subtitle')}</p>
          <form className="search-bar" onSubmit={(e) => e.preventDefault()}>
            <label>
              <span>{t('search.what')}</span>
              <input value={params.get('q') ?? ''} onChange={(e) => set('q', e.target.value)} placeholder={t('search.placeholder')} />
            </label>
            <label>
              <span>{t('search.date')}</span>
              <input type="date" value={params.get('date') ?? ''} onChange={(e) => set('date', e.target.value)} />
            </label>
            <label>
              <span>{t('search.from')}</span>
              <select value={params.get('start') ?? ''} onChange={(e) => set('start', e.target.value)}>
                <option value="">—</option>
                {slots.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>
              <span>{t('search.to')}</span>
              <select value={params.get('end') ?? ''} onChange={(e) => set('end', e.target.value)}>
                <option value="">—</option>
                {slots.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>
              <span>{t('search.people')}</span>
              <input type="number" min={1} value={params.get('guests') ?? ''} onChange={(e) => set('guests', e.target.value)} placeholder="1" />
            </label>
          </form>
          {cfg && <p className="small hero-place">{flag(cfg.code)} {city ? `${city}${region ? ` - ${region}` : ''}` : region || countryName(cfg.code, locale)} · {t('place.currencyInfo', { currency: cfg.currency })}</p>}
        </div>
      </section>

      <div className="container">
        <div className="category-bar" role="tablist">
          <button role="tab" aria-selected={!category} className={!category ? 'active' : ''} onClick={() => set('category', '')}>
            <span className="cat-icon">✨</span><span>{t('cat.all')}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button role="tab" aria-selected={category === c} key={c} className={category === c ? 'active' : ''} onClick={() => set('category', c)}>
              <span className="cat-icon">{CATEGORY_ICONS[c]}</span><span>{t(`cat.${c}` as never)}</span>
            </button>
          ))}
          <button className="btn btn-outline filter-btn" onClick={() => setShowFilters((s) => !s)}>⚙ {t('search.filters')}</button>
        </div>

        {showFilters && (
          <div className="filters panel">
            <label>{t('search.minPrice')}<input type="number" min={0} value={params.get('minPrice') ?? ''} onChange={(e) => set('minPrice', e.target.value)} /></label>
            <label>{t('search.maxPrice')}<input type="number" min={0} value={params.get('maxPrice') ?? ''} onChange={(e) => set('maxPrice', e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={params.get('instant') === '1'} onChange={(e) => set('instant', e.target.checked ? '1' : '')} /> ⚡ {t('listing.instant')}</label>
            <label className="check"><input type="checkbox" checked={params.get('noGuarantor') === '1'} onChange={(e) => set('noGuarantor', e.target.checked ? '1' : '')} /> {t('search.noGuarantor')}</label>
            <label>{t('search.sort')}
              <select value={params.get('sort') ?? ''} onChange={(e) => set('sort', e.target.value)}>
                <option value="">{t('search.sortRelevance')}</option>
                <option value="price_asc">{t('search.sortPriceAsc')}</option>
                <option value="price_desc">{t('search.sortPriceDesc')}</option>
              </select>
            </label>
            <div className="amenity-filter">
              {AMENITIES.map((a) => {
                const sel = (params.get('amenities') ?? '').split(',').filter(Boolean);
                const on = sel.includes(a);
                return <button key={a} className={`chip ${on ? 'on' : ''}`} onClick={() => set('amenities', (on ? sel.filter((x) => x !== a) : [...sel, a]).join(','))}>{t(`amen.${a}` as never)}</button>;
              })}
            </div>
          </div>
        )}

        {list === null && <div className="grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="card skeleton" />)}</div>}
        {list?.length === 0 && (
          <div className="empty">
            <p>{t('search.empty')}</p>
          </div>
        )}
        {list && list.length > 0 && (
          <>
            <p className="muted small">{t('search.results', { n: list.length })}</p>
            <div className="grid">
              {list.map((l) => <ListingCard key={l.id} l={l} fav={favs.includes(l.id)} onFav={() => toggleFav(l.id)} />)}
            </div>
          </>
        )}

        <section className="how">
          <h2>{t('how.title')}</h2>
          <div className="how-grid">
            <div><span className="how-n">1</span><h3>{t('how.1.title')}</h3><p className="muted">{t('how.1.text')}</p></div>
            <div><span className="how-n">2</span><h3>{t('how.2.title')}</h3><p className="muted">{t('how.2.text')}</p></div>
            <div><span className="how-n">3</span><h3>{t('how.3.title')}</h3><p className="muted">{t('how.3.text')}</p></div>
            <div><span className="how-n">4</span><h3>{t('how.4.title')}</h3><p className="muted">{t('how.4.text')}</p></div>
          </div>
        </section>
      </div>
    </div>
  );
}
