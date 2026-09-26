import type { CapacitorConfig } from '@capacitor/cli';

// O app abre o site de produção (atualiza junto com o site, sem nova versão na loja).
// Pagamento e conexão do Mercado Pago acontecem dentro do app (allowNavigation).
// A pasta www só é usada quando não há internet (tela de "sem conexão").
const config: CapacitorConfig = {
  appId: 'com.spacehour.app',
  appName: 'SpaceHour',
  webDir: 'www',
  server: {
    url: 'https://space-hour.com',
    errorPath: 'offline.html',
    allowNavigation: [
      'space-hour.com',
      'www.space-hour.com',
      '*.mercadopago.com',
      '*.mercadopago.com.br',
      '*.mercadolivre.com',
      '*.mercadolivre.com.br',
      '*.mercadolibre.com',
      '*.mlstatic.com',
    ],
  },
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic', limitsNavigationsToAppBoundDomains: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0e7c7b', showSpinner: false },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    StatusBar: { style: 'LIGHT', backgroundColor: '#0e7c7b' },
  },
};

export default config;
