import Link from 'next/link';
import { Notices } from '@/components/Notices';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { securityStatus } from '@/lib/services/security';
import { TopNav, TabBar, NavItem } from '@/components/Nav';
import { IconChart, IconRules, IconStore, IconUser, IconWallet } from '@/components/icons';

export const dynamic = 'force-dynamic';

const items: NavItem[] = [
  { href: '/admin', label: 'Resumo', icon: <IconChart />, exact: true },
  { href: '/admin/empresas', label: 'Empresas', icon: <IconStore /> },
  { href: '/admin/clientes', label: 'Clientes', icon: <IconUser /> },
  { href: '/admin/faturas', label: 'Faturas', icon: <IconWallet /> },
  { href: '/admin/leads', label: 'Leads', icon: <IconUser /> },
  { href: '/admin/robos', label: 'Robôs', icon: <IconRules /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sess = await requireRole('admin');
  const sec = await securityStatus(sess.userId);
  if (!sec?.totp_enabled) redirect('/seguranca?obrigatorio=1');
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/admin" className="logo">
            <img src="/logo-negativo.svg" alt="Cashbacksmart" />
          </Link>
          <TopNav items={items} />
          <span className="tag coin">Admin</span>
        </div>
      </header>
      <main className="page">
        <div className="wrap">
          <Notices audience="admin" />
          {children}
        </div>
      </main>
      <TabBar items={items} />
    </>
  );
}
