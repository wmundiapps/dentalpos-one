// Medição de campanhas: guarda a origem (UTM) da primeira visita e, só com
// consentimento, carrega o Meta Pixel e a tag do Google (Ads/Analytics).
// Env de build: VITE_META_PIXEL_ID, VITE_GOOGLE_TAG_ID (ex.: AW-123 ou G-ABC).
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const GOOGLE_TAG_ID = import.meta.env.VITE_GOOGLE_TAG_ID as string | undefined;
const SRC_KEY = 'sh_src';
const CONSENT_KEY = 'sh_consent';
const SRC_TTL_MS = 30 * 86400000;

type W = Window & { fbq?: (...a: unknown[]) => void; _fbq?: unknown; gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
const w = window as W;

function store(key: string, value?: string) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch { /* navegação privada */ }
  return null;
}

/** Guarda a origem da primeira visita com UTM (válida por 30 dias). */
export function captureSource() {
  const p = new URLSearchParams(location.search);
  const parts = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].map((k) => (p.get(k) ?? '').trim().slice(0, 48));
  if (!parts[0]) return;
  const current = store(SRC_KEY);
  if (current && Date.now() - Number(current.split('|')[0]) < SRC_TTL_MS) return;
  store(SRC_KEY, `${Date.now()}|${parts.join('/').replace(/\/+$/, '')}`);
}

export function signupSource(): string | undefined {
  const v = store(SRC_KEY);
  if (!v) return undefined;
  const [at, src] = [Number(v.split('|')[0]), v.slice(v.indexOf('|') + 1)];
  return Date.now() - at < SRC_TTL_MS ? src : undefined;
}

export const trackingConfigured = () => !!(META_PIXEL_ID || GOOGLE_TAG_ID);
export const consent = () => store(CONSENT_KEY) as 'yes' | 'no' | null;

export function setConsent(v: 'yes' | 'no') {
  store(CONSENT_KEY, v);
  if (v === 'yes') loadTags();
}

let loaded = false;
export function loadTags() {
  if (loaded || consent() !== 'yes') return;
  loaded = true;
  if (META_PIXEL_ID) {
    // stub oficial do Meta Pixel: enfileira as chamadas até o fbevents.js carregar
    const fbq: any = (...a: unknown[]) => { if (fbq.callMethod) fbq.callMethod(...a); else fbq.queue.push(a); }; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.assign(fbq, { push: fbq, loaded: true, version: '2.0', queue: [] });
    w.fbq = w._fbq = fbq;
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
  }
  if (GOOGLE_TAG_ID) {
    w.dataLayer = w.dataLayer ?? [];
    w.gtag = function gtag() { w.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`);
    w.gtag('js', new Date());
    w.gtag('config', GOOGLE_TAG_ID);
  }
}

function addScript(src: string) {
  const s = document.createElement('script');
  s.async = true; s.src = src;
  document.head.appendChild(s);
}

/** Visualização de página (navegação dentro do app). */
export function trackPage(path: string) {
  if (!loaded) return;
  w.fbq?.('track', 'PageView');
  w.gtag?.('event', 'page_view', { page_path: path });
}

/** Eventos de conversão: Lead (clicou no CTA da landing) e CompleteRegistration (cadastrou). */
export function track(event: 'Lead' | 'CompleteRegistration', data: Record<string, string> = {}) {
  if (!loaded) return;
  w.fbq?.('track', event, data);
  w.gtag?.('event', event === 'Lead' ? 'generate_lead' : 'sign_up', data);
  const conv = import.meta.env.VITE_GOOGLE_ADS_SIGNUP_LABEL as string | undefined; // ex.: AW-123/AbC-dEf
  if (event === 'CompleteRegistration' && conv) w.gtag?.('event', 'conversion', { send_to: conv });
}
