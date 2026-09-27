import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

// Chave opcional da Maps Embed API (grátis). Sem ela, usa o mapa incorporado padrão do Google Maps.
const EMBED_KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string | undefined;

export const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
export const wazeUrl = (q: string) => `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
const embedUrl = (q: string) => EMBED_KEY
  ? `https://www.google.com/maps/embed/v1/place?key=${EMBED_KEY}&q=${encodeURIComponent(q)}`
  : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;

/** Mapa do Google com o endereço + botões para abrir no Google Maps e no Waze. */
export function AddressMap({ query, delay = 0, compact }: { query: string; delay?: number; compact?: boolean }) {
  const { t } = useI18n();
  // No editor, espera a pessoa parar de digitar antes de recarregar o mapa
  const [q, setQ] = useState(delay ? '' : query);
  useEffect(() => {
    if (!delay) { setQ(query); return; }
    const h = window.setTimeout(() => setQ(query), delay);
    return () => window.clearTimeout(h);
  }, [query, delay]);
  if (!q.trim()) return null;
  return (
    <div className={`address-map ${compact ? 'compact' : ''}`}>
      <iframe title={t('map.title')} src={embedUrl(q)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      <div className="row gap wrap">
        <a className="btn btn-outline small" href={mapsUrl(q)} target="_blank" rel="noopener noreferrer">📍 {t('map.openGoogle')}</a>
        <a className="btn btn-outline small" href={wazeUrl(q)} target="_blank" rel="noopener noreferrer">🚗 {t('map.openWaze')}</a>
      </div>
    </div>
  );
}
