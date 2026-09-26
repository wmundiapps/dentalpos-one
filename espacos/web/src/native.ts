// Integração com o aplicativo (Capacitor). O app carrega o próprio site
// (space-hour.com); aqui ficam só os recursos nativos: notificações push,
// botão Voltar do Android e links que abrem o app.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';

export const isNativeApp = () => Capacitor.isNativePlatform();
const TOKEN_KEY = 'sh_push_token';

type Navigate = (path: string) => void;
let started = false;

/** Listeners do app (uma vez). `navigate` leva a pessoa à tela da notificação ou do link. */
export function startNative(navigate: Navigate) {
  if (started || !isNativeApp()) return;
  started = true;
  const go = (link?: string) => {
    if (!link) return;
    try {
      const u = new URL(link, location.origin);
      if (u.origin === location.origin) navigate(u.pathname + u.search);
    } catch { /* link inválido */ }
  };
  PushNotifications.addListener('registration', async ({ value }) => {
    try {
      await api('/me/push-token', { body: { token: value, platform: Capacitor.getPlatform() } });
      localStorage.setItem(TOKEN_KEY, value);
    } catch { /* tenta de novo no próximo login */ }
  });
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    go((notification.data as { link?: string } | undefined)?.link);
  });
  App.addListener('appUrlOpen', ({ url }) => go(url));
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back();
    else App.exitApp();
  });
}

/** Depois do login: pede permissão (só na primeira vez) e registra o aparelho. */
export async function registerPush() {
  if (!isNativeApp()) return;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({ id: 'default', name: 'SpaceHour', importance: 4 }).catch(() => undefined);
    }
    await PushNotifications.register();
  } catch (e) {
    console.warn('[push]', e);
  }
}

/** Antes do logout: o aparelho deixa de receber notificações desta conta. */
export async function unregisterPush() {
  if (!isNativeApp()) return;
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  if (token) await api('/me/push-token', { method: 'DELETE', body: { token } }).catch(() => undefined);
}
