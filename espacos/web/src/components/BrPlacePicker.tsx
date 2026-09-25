import { useEffect, useId, useState } from 'react';
import { useI18n } from '../i18n';

type Mod = typeof import('../../../shared/br-locations');
let loaded: Mod | undefined;

/** Lista de estados e municípios do IBGE (carregada sob demanda). */
export function useBrLocations() {
  const [mod, setMod] = useState<Mod | undefined>(loaded);
  useEffect(() => {
    if (!loaded) import('../../../shared/br-locations').then((m) => { loaded = m; setMod(m); });
  }, []);
  return mod;
}

/** Estado (UF) + município, com busca por nome dentro do estado. */
export function BrPlacePicker({ state, city, onChange, required, allowAllCities }: {
  state: string; city: string; onChange: (state: string, city: string) => void; required?: boolean; allowAllCities?: boolean;
}) {
  const { t } = useI18n();
  const br = useBrLocations();
  const listId = useId();
  const [text, setText] = useState(city);
  useEffect(() => setText(city), [city]);
  const cities = br && state ? br.brCities(state) : [];
  const match = br && state && text ? br.brCity(state, text) : undefined;
  const invalid = !!text && !!state && !!br && !match;

  function commit(v: string) {
    setText(v);
    const m = br && state ? br.brCity(state, v) : undefined;
    if (m) onChange(state, m.name);
    else if (!v && allowAllCities) onChange(state, '');
  }

  return (
    <>
      <label>{t('form.state')}
        <select required={required} value={state} onChange={(e) => onChange(e.target.value, '')}>
          <option value="">{t('form.statePlaceholder')}</option>
          {br?.BR_STATES.map((s) => <option key={s.uf} value={s.uf}>{s.name} ({s.uf})</option>)}
        </select>
      </label>
      <label>{t('form.municipality')}
        <input
          list={listId} required={required} disabled={!state} value={text} autoComplete="off"
          placeholder={state ? t('form.municipalityPlaceholder') : t('form.chooseStateFirst')}
          onChange={(e) => commit(e.target.value)}
          aria-invalid={invalid}
        />
        <datalist id={listId}>{cities.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        {invalid && <span className="errors small">{t('form.municipalityInvalid')}</span>}
      </label>
    </>
  );
}
