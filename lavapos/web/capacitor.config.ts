import type { CapacitorConfig } from '@capacitor/cli';

// Aplicativo para Apple App Store e Google Play (mesma tela web empacotada). Passo a passo em docs/LOJAS-APP.md.
const config: CapacitorConfig = {
  appId: 'br.com.lavapos.app',
  appName: 'LavaPos',
  webDir: 'dist',
  server: { androidScheme: 'https', iosScheme: 'capacitor' },
  ios: { contentInset: 'always' },
  android: { allowMixedContent: false },
};
export default config;
