'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

/** Dentro do app da Apple/Google: push, abrir links das notificações e aviso de atualização */
export function NativeBridge() {
  const router = useRouter();
  const [update, setUpdate] = useState<{ url: string; required: boolean } | null>(null);
  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const P = cap.Plugins || {};
    (async () => {
      // versão
      const info = await P.App?.getInfo?.().catch(() => null);
      const v = await fetch('/api/version').then((r) => r.json()).catch(() => null);
      if (info?.version && v) {
        const url = cap.getPlatform() === 'ios' ? v.ios : v.android;
        if (newer(v.min, info.version)) setUpdate({ url, required: true });
        else if (newer(v.latest, info.version)) setUpdate({ url, required: false });
      }
      // push
      const Push = P.PushNotifications;
      if (!Push) return;
      const perm = await Push.requestPermissions();
      if (perm.receive !== 'granted') return;
      await Push.addListener('registration', (t: { value: string }) => {
        fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t.value, platform: cap.getPlatform() }) });
      });
      await Push.addListener('pushNotificationActionPerformed', (a: any) => {
        const url = a?.notification?.data?.url;
        if (typeof url === 'string' && url.startsWith('/')) router.push(url);
      });
      await Push.register();
    })().catch(() => null);
  }, [router]);
  if (!update) return null;
  return (
    <div role="dialog" aria-label="Atualização disponível" style={{ position: 'fixed', inset: update.required ? 0 : 'auto 12px 90px 12px', zIndex: 60, background: update.required ? 'rgba(16,25,90,.95)' : 'transparent', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h3>{update.required ? 'Atualize o app para continuar' : 'Nova versão disponível'}</h3>
        <p className="muted">{update.required ? 'Esta versão saiu de circulação por segurança.' : 'Atualize para ter as últimas melhorias e correções de segurança.'}</p>
        <a className="btn" href={update.url}>
          Atualizar agora
        </a>
        {!update.required && (
          <button className="linkbtn" style={{ display: 'block', margin: '10px auto 0' }} onClick={() => setUpdate(null)}>
            Depois
          </button>
        )}
      </div>
    </div>
  );
}
