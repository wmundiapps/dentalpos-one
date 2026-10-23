'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const META = (process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim();
const TIKTOK = (process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || '').trim();
const KEY = 'cs_ads_consent';
const OK_ID = /^[A-Za-z0-9]{6,32}$/;

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    ttq?: any;
    TiktokAnalyticsObject?: string;
  }
}

function loadMeta(id: string) {
  if (window.fbq) return;
  const n: any = (window.fbq = function (...a: unknown[]) {
    n.callMethod ? n.callMethod(...a) : n.queue.push(a);
  });
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  n('init', id);
}

function loadTikTok(id: string) {
  if (window.ttq) return;
  window.TiktokAnalyticsObject = 'ttq';
  const t: any = (window.ttq = []);
  t.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
  t.setAndDefer = (o: any, m: string) => {
    o[m] = (...a: unknown[]) => o.push([m, ...a]);
  };
  for (const m of t.methods) t.setAndDefer(t, m);
  const src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
  t._i = { [id]: [] };
  t._i[id]._u = src;
  t._t = { [id]: +new Date() };
  t._o = { [id]: {} };
  const s = document.createElement('script');
  s.async = true;
  s.src = `${src}?sdkid=${id}&lib=ttq`;
  document.head.appendChild(s);
}

/**
 * Medição dos anúncios (Meta e TikTok). Só existe se os IDs estiverem configurados e só liga depois que a pessoa aceita.
 * Nunca roda dentro dos apps das lojas (Apple exige permissão própria de rastreamento).
 */
export function Tracking() {
  const path = usePathname();
  const [consent, setConsent] = useState<'yes' | 'no' | null>(null);
  const [ready, setReady] = useState(false);
  const enabled = (OK_ID.test(META) || OK_ID.test(TIKTOK)) && typeof navigator !== 'undefined';

  useEffect(() => {
    if (!enabled || navigator.userAgent.includes('CashbacksmartApp')) return;
    try {
      const v = localStorage.getItem(KEY);
      setConsent(v === 'yes' || v === 'no' ? v : null);
    } catch {
      setConsent(null);
    }
    setReady(true);
  }, [enabled]);

  useEffect(() => {
    if (!ready || consent !== 'yes') return;
    if (OK_ID.test(META)) loadMeta(META);
    if (OK_ID.test(TIKTOK)) loadTikTok(TIKTOK);
  }, [ready, consent]);

  useEffect(() => {
    if (!ready || consent !== 'yes') return;
    window.fbq?.('track', 'PageView');
    window.ttq?.page?.();
    // conta nova criada: o cadastro termina em /app?bemvindo=1 (cliente) ou /painel?bemvindo=1 (loja)
    if (new URLSearchParams(location.search).get('bemvindo') === '1') {
      try {
        if (sessionStorage.getItem('cs_conv') === path) return;
        sessionStorage.setItem('cs_conv', path);
      } catch {}
      const store = path.startsWith('/painel');
      window.fbq?.('track', store ? 'Lead' : 'CompleteRegistration');
      window.ttq?.track?.(store ? 'SubmitForm' : 'CompleteRegistration');
    }
  }, [ready, consent, path]);

  if (!ready || consent !== null) return null;
  const choose = (v: 'yes' | 'no') => {
    try {
      localStorage.setItem(KEY, v);
    } catch {}
    setConsent(v);
  };
  return (
    <div role="dialog" aria-label="Cookies de anúncios" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 50, background: '#fff', border: '1px solid var(--line, #dfe3f0)', borderRadius: 14, boxShadow: '0 8px 30px rgba(27,42,107,.18)', padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', maxWidth: 560, margin: '0 auto' }}>
      <p style={{ margin: 0, flex: '1 1 240px', fontSize: 14 }}>Usamos cookies para medir se nossos anúncios funcionam. Pode recusar sem perder nada.</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={() => choose('no')}>
          Recusar
        </button>
        <button type="button" className="btn sm" onClick={() => choose('yes')}>
          Aceitar
        </button>
      </div>
    </div>
  );
}
