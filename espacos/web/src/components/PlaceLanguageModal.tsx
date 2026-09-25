import { useState } from 'react';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { LAUNCH_COUNTRIES, COUNTRY_BY_CODE, LOCALE_NATIVE_NAMES, REGIONS, SUPPORTED_LOCALES } from '../../../shared/countries';
import { countryName, flag } from '../format';
import { BrPlacePicker } from './BrPlacePicker';

// Seletor de idioma, país e cidade (botão do globo no cabeçalho).
export function PlaceLanguageModal({ onClose, initialTab = 'place' }: { onClose: () => void; initialTab?: 'place' | 'language' }) {
  const { t, locale, setLocale } = useI18n();
  const { country, region, city, setPlace } = useApp();
  const [brState, setBrState] = useState(country === 'BR' ? region : '');
  const [brCity, setBrCity] = useState(country === 'BR' ? city : '');
  const [tab, setTab] = useState(initialTab);
  // com um único país aberto, vai direto às cidades
  const [selCountry, setSelCountry] = useState(country || (LAUNCH_COUNTRIES.length === 1 ? LAUNCH_COUNTRIES[0].code : ''));
  const cfg = selCountry ? COUNTRY_BY_CODE[selCountry] : undefined;

  function choose(c: string, ci: string) {
    setPlace(c, ci);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('place.title')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="tabs">
            <button className={tab === 'place' ? 'active' : ''} onClick={() => setTab('place')}>{t('place.countryCity')}</button>
            <button className={tab === 'language' ? 'active' : ''} onClick={() => setTab('language')}>{t('place.language')}</button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {tab === 'language' && (
          <div className="grid-choices">
            {SUPPORTED_LOCALES.map((l) => (
              <button key={l} className={`choice ${l === locale ? 'selected' : ''}`} onClick={() => { setLocale(l); onClose(); }}>
                <strong>{LOCALE_NATIVE_NAMES[l]}</strong>
                <span className="muted">{l}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'place' && !selCountry && (
          <div>
            <button className="choice wide" onClick={() => choose('', '')}>🌎 {t('place.allCountries')}</button>
            {REGIONS.filter((r) => LAUNCH_COUNTRIES.some((c) => c.region === r)).map((r) => (
              <section key={r}>
                <h3 className="region-title">{t(`region.${r}` as never)}</h3>
                <div className="grid-choices">
                  {LAUNCH_COUNTRIES.filter((c) => c.region === r).map((c) => (
                    <button key={c.code} className={`choice ${c.code === country ? 'selected' : ''}`} onClick={() => setSelCountry(c.code)}>
                      <strong>{flag(c.code)} {countryName(c.code, locale)}</strong>
                      <span className="muted">{c.currency}{c.code === 'AE' ? ' · Dubai' : ''}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {tab === 'place' && cfg && (
          <div>
            {LAUNCH_COUNTRIES.length > 1 && <button className="link-btn" onClick={() => setSelCountry('')}>← {t('place.back')}</button>}
            <h3>{flag(cfg.code)} {countryName(cfg.code, locale)}</h3>
            <p className="muted small">{t('place.currencyInfo', { currency: cfg.currency })} · {t('place.languages')}: {cfg.locales.map((l) => LOCALE_NATIVE_NAMES[l]).join(', ')}</p>
            {!cfg.locales.includes(locale) && (
              <button className="btn btn-outline small" onClick={() => setLocale(cfg.defaultLocale)}>{t('place.useCountryLanguage', { lang: LOCALE_NATIVE_NAMES[cfg.defaultLocale] })}</button>
            )}
            {cfg.code === 'BR' ? (
              <div className="form-grid">
                <BrPlacePicker allowAllCities state={brState} city={brCity} onChange={(st, ci) => { setBrState(st); setBrCity(ci); }} />
                <div className="span2 row gap wrap">
                  <button className="btn btn-primary" onClick={() => { setPlace('BR', brCity, brState); onClose(); }}>
                    {brCity ? t('place.showIn', { place: `${brCity} - ${brState}` }) : brState ? t('place.showIn', { place: brState }) : t('place.allCities')}
                  </button>
                  {(brState || brCity) && <button className="btn btn-ghost" onClick={() => { setPlace('BR', '', ''); onClose(); }}>{t('place.allCities')}</button>}
                </div>
              </div>
            ) : (
            <div className="grid-choices">
              <button className={`choice ${cfg.code === country && !city ? 'selected' : ''}`} onClick={() => choose(cfg.code, '')}><strong>{t('place.allCities')}</strong></button>
              {cfg.cities.map((c) => (
                <button key={c.name} className={`choice ${cfg.code === country && c.name === city ? 'selected' : ''}`} onClick={() => choose(cfg.code, c.name)}>
                  <strong>{c.name}</strong>
                  <span className="muted small">{c.tz.split('/').pop()?.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
