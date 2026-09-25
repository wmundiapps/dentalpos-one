import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { errorText } from '../errors';

// SpaceHour ADS: destaque pago dos anúncios (em breve). Por enquanto registra o interesse do anfitrião.
export default function AdsPage() {
  const { t, locale } = useI18n();
  const { me } = useApp();
  const [params] = useSearchParams();
  const listingId = params.get('anuncio') ?? '';
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');

  async function interest() {
    setState('sending'); setError('');
    try {
      await api('/feedback', { body: { kind: 'other', message: `[SpaceHour ADS] Interesse${listingId ? ` — anúncio ${listingId}` : ''}${me ? ` — ${me.name} <${me.email}>` : ''}`, page: '/anfitriao/ads', locale } });
      setState('done');
    } catch (e) {
      setError(errorText(e, t)); setState('idle');
    }
  }

  return (
    <div className="container narrow ads-page">
      <p className="badge">{t('ads.soon')}</p>
      <h1>🚀 SpaceHour ADS</h1>
      <p className="lead">{t('ads.subtitle')}</p>
      <ul className="ads-benefits">
        <li>⭐ {t('ads.b1')}</li>
        <li>📍 {t('ads.b2')}</li>
        <li>📈 {t('ads.b3')}</li>
        <li>💳 {t('ads.b4')}</li>
      </ul>
      {state === 'done'
        ? <p className="notice success">✅ {t('ads.thanks')}</p>
        : <button className="btn btn-primary" disabled={state === 'sending'} onClick={interest}>{state === 'sending' ? t('common.wait') : t('ads.cta')}</button>}
      {error && <p className="errors small">{error}</p>}
      <p className="small"><Link to="/anfitriao?aba=anuncios">← {t('nav.myListings')}</Link></p>
    </div>
  );
}
