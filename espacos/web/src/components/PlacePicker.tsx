import { useEffect, useMemo, useState } from 'react';
import { useI18n, type DictKey } from '../i18n';

interface GeoState { code: string; name: string; type: string; cities: string[] }
interface Geo { label: string; states: GeoState[] }

const cache = new Map<string, Promise<Geo | null>>();

/** Estados/províncias e cidades de um país (baixados da API uma vez por país). */
function loadGeo(country: string) {
  if (!cache.has(country)) {
    cache.set(country, fetch(`/api/geo/${country}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && {
      label: d.label,
      states: d.states.map((s: { code: string; name: string; type: string; cities: string }) => ({
        code: s.code, name: s.name, type: s.type, cities: s.cities.split('|').filter(Boolean).map((c) => c.split('~')[0]),
      })),
    }).catch(() => null));
  }
  return cache.get(country)!;
}

export function useGeo(country: string) {
  const [geo, setGeo] = useState<Geo | null | undefined>(undefined);
  useEffect(() => { let alive = true; setGeo(undefined); if (country) loadGeo(country).then((g) => alive && setGeo(g)); return () => { alive = false; }; }, [country]);
  return geo;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Estado/província/região + cidade. No Brasil a cidade precisa ser da lista do
 * IBGE; nos demais países, se a cidade não estiver na lista, pode ser digitada.
 */
export function PlacePicker({ country, state, city, onChange, required, allowAll }: {
  country: string; state: string; city: string; onChange: (state: string, city: string) => void; required?: boolean; allowAll?: boolean;
}) {
  const { t } = useI18n();
  const geo = useGeo(country);
  const [filter, setFilter] = useState('');
  const current = geo?.states.find((s) => s.code === state);
  const inList = !!current && current.cities.some((c) => c === city);
  const [other, setOther] = useState(false);
  useEffect(() => { setFilter(''); setOther(!!city && !!current && !current.cities.includes(city) && country !== 'BR'); }, [state, country]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => {
    if (!current) return [];
    const f = norm(filter);
    const list = f ? current.cities.filter((c) => norm(c).includes(f)) : current.cities;
    return city && inList && !list.includes(city) ? [city, ...list] : list;
  }, [current, filter, city, inList]);

  if (geo === undefined) return <p className="muted small span2">{t('common.wait')}</p>;
  if (geo === null) return null;
  const label = t(`geo.label.${geo.label}` as DictKey);

  return (
    <>
      <label>{label}
        <select required={required} value={state} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">{allowAll ? t('place.allRegions') : t('form.selectRegion', { label: label.toLowerCase() })}</option>
          {geo.states.map((s) => <option key={s.code} value={s.code}>{s.name}{/^[A-Z]{2,3}$/.test(s.code) ? ` (${s.code})` : ''}</option>)}
        </select>
      </label>
      <label>{t('form.city')}
        {!state ? (
          <select disabled><option>{t('form.chooseRegionFirst', { label: label.toLowerCase() })}</option></select>
        ) : other ? (
          <input required={required} value={city} maxLength={120} placeholder={t('form.typeCity')} onChange={(e) => onChange(state, e.target.value)} />
        ) : (
          <>
            <input className="city-filter" type="search" value={filter} placeholder={t('form.cityFilter', { n: current?.cities.length ?? 0 })} onChange={(e) => setFilter(e.target.value)} />
            <select required={required} value={inList ? city : ''} onChange={(e) => onChange(state, e.target.value)}>
              <option value="">{allowAll ? t('place.allCities') : t('form.selectCity')}</option>
              {options.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}
        {state && country !== 'BR' && !allowAll && (
          <button type="button" className="link-button small" onClick={() => { setOther(!other); onChange(state, ''); }}>
            {other ? t('form.pickFromList') : t('form.cityNotListed')}
          </button>
        )}
      </label>
    </>
  );
}
