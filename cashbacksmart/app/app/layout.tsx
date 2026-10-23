import type { Metadata, Viewport } from 'next';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import './globals.css';
import { Tracking } from '@/components/Tracking';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: { default: 'Cashbacksmart — cashback no comércio do seu bairro', template: '%s · Cashbacksmart' },
  description: 'Ganhe dinheiro de volta na padaria, farmácia, salão e em todo o comércio da sua cidade. Grátis para você.',
  icons: { icon: '/simbolo.svg', apple: '/icon-512.png' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#1B2A6B', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Tracking />
      </body>
    </html>
  );
}
