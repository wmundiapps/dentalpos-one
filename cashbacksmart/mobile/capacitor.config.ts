import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativo (Apple e Google Play) que abre o Cashbacksmart publicado.
 * Troque APP_URL pelo endereço final antes de gerar as versões de loja.
 */
const APP_URL = process.env.APP_URL || 'https://cashbacksmart.com.br';

const config: CapacitorConfig = {
  appId: 'br.com.cashbacksmart.app',
  appName: 'Cashbacksmart',
  webDir: 'www',
  server: { url: `${APP_URL}/app`, cleartext: false, errorPath: 'offline.html' },
  ios: { contentInset: 'automatic', backgroundColor: '#1B2A6B' },
  android: { backgroundColor: '#1B2A6B' },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#1B2A6B', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#1B2A6B' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};
export default config;
