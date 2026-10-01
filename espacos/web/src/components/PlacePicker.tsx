import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
 * A cidade é escolhida numa caixa de busca com lista: ao tocar numa cidade a lista
 * fecha e a cidade escolhida aparece uma vez só, com o botão "Trocar".
 */
export function PlacePicker({ country, state, city, onChange, required, allowAll }: {
  country: string; state: string; city: string; onChange: (state: string, city: string) => void; required?: boolean; allowAll?: boolean;
}) {
  const { t } = useI18n();
  const geo = useGeo(country);
  const uid = useId();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = geo?.states.find((s) => s.code === state);
  const inList = !!current && current.cities.some((c) => c === city);
  const [other, setOther] = useState(false);
  useEffect(() => { setFilter(''); setOpen(false); setOther(!!city && !!current && !current.cities.includes(city) && country !== 'BR'); }, [state, country]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => {
    if (!current) return [];
    const f = norm(filter);
    if (!f) return current.cities;
    // Primeiro as que começam com o texto digitado, depois as que só contêm
    const starts = current.cities.filter((c) => norm(c).startsWith(f));
    return [...starts, ...current.cities.filter((c) => !norm(c).startsWith(f) && norm(c).includes(f))];
  }, [current, filter]);
  // Campo obrigatório: avisa na própria caixa de busca enquanto nenhuma cidade da lista foi escolhida
  useEffect(() => { searchRef.current?.setCustomValidity(required && !inList ? t('form.selectCity') : ''); });

  if (geo === undefined) return <p className="muted small span2">{t('common.wait')}</p>;
  if (geo === null) return null;
  const label = t(`geo.label.${geo.label}` as DictKey);

  function pick(c: string) {
    onChange(state, c);
    setFilter(''); setOpen(false); setActive(0);
  }
  function change() {
    onChange(state, '');
    setFilter(''); setOpen(true); setActive(0);
    setTimeout(() => searchRef.current?.focus(), 0);
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.min(options.length, 300) - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Enter') {
      if (open && options.length > 0 && filter) { e.preventDefault(); pick(options[Math.min(active, options.length - 1)]); }
      else if (open) { e.preventDefault(); }
    }
  }
  const listId = `${uid}-cities`;

  return (
    <>
      <label>{label}
        <select required={required} value={state} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">{allowAll ? t('place.allRegions') : t('form.selectRegion', { label: label.toLowerCase() })}</option>
          {geo.states.map((s) => <option key={s.code} value={s.code}>{s.name}{/^[A-Z]{2,3}$/.test(s.code) ? ` (${s.code})` : ''}</option>)}
        </select>
      </label>
      <div className="place-city">
        <span id={`${uid}-label`}>{t('form.city')}</span>
        {!state ? (
          <select disabled aria-labelledby={`${uid}-label`}><option>{t('form.chooseRegionFirst', { label: label.toLowerCase() })}</option></select>
        ) : other ? (
          <input required={required} value={city} maxLength={120} placeholder={t('form.typeCity')} aria-labelledby={`${uid}-label`} onChange={(e) => onChange(state, e.target.value)} />
        ) : inList ? (
          <div className="city-chosen">
            <span className="city-chosen-name">📍 {city}</span>
            <button type="button" className="btn btn-outline small" onClick={change}>{t('place.changeCity')}</button>
          </div>
        ) : (
          <div className="city-combo">
            <input ref={searchRef} type="search" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-labelledby={`${uid}-label`}
              autoComplete="off" value={filter}
              placeholder={allowAll ? t('place.allCities') : t('form.cityFilter', { n: current?.cities.length ?? 0 })}
              onChange={(e) => { setFilter(e.target.value); setOpen(true); setActive(0); }}
              onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
            {open && (
              <ul className="city-list" id={listId} role="listbox">
                {options.length === 0 && <li className="muted small city-none">{t('place.noCityMatch')}</li>}
                {options.slice(0, 300).map((c, i) => (
                  <li key={c} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {state && country !== 'BR' && !allowAll && (
          <button type="button" className="link-button small" onClick={() => { setOther(!other); onChange(state, ''); }}>
            {other ? t('form.pickFromList') : t('form.cityNotListed')}
          </button>
        )}
      </div>
    </>
  );
}
