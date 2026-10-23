import Link from 'next/link';
import { Notices } from '@/components/Notices';
import { NativeBridge } from '@/components/NativeBridge';
import { requireRole } from '@/lib/auth';
import { TabBar, TopNav, NavItem, HelpFab } from '@/components/Nav';
import { IconHome, IconQr, IconStore, IconUser, IconWallet } from '@/components/icons';

export const dynamic = 'force-dynamic';

const items: NavItem[] = [
  { href: '/app', label: 'Início', icon: <IconHome />, exact: true },
  { href: '/app/lojas', label: 'Lojas', icon: <IconStore /> },
  { href: '/app/codigo', label: 'Meu código', icon: <IconQr /> },
  { href: '/app/carteira', label: 'Carteira', icon: <IconWallet /> },
  { href: '/app/conta', label: 'Conta', icon: <IconUser /> },
];

export default async function ConsumerLayout({ children }: { children: React.ReactNode }) {
  await requireRole('consumer');
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/app" className="logo" aria-label="Início">
            <img src="/logo-negativo.svg" alt="Cashbacksmart" />
          </Link>
          <TopNav items={items} />
        </div>
      </header>
      <main className="page">
        <div className="wrap">
          <Notices audience="consumer" />
          {children}
        </div>
      </main>
      <HelpFab href="/app/ajuda" />
      <NativeBridge />
      <TabBar items={items} />
    </>
  );
}
