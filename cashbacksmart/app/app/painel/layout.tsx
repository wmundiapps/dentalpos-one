import Link from 'next/link';
import { Notices } from '@/components/Notices';
import { NativeBridge } from '@/components/NativeBridge';
import { requireBusiness } from '@/lib/auth';
import { TabBar, TopNav, NavItem, HelpFab } from '@/components/Nav';
import { IconChart, IconMail, IconMore, IconPlus, IconRules } from '@/components/icons';
import { selectBusinessAction } from '@/app/actions';

export const dynamic = 'force-dynamic';

const items: NavItem[] = [
  { href: '/painel', label: 'Painel', icon: <IconChart />, exact: true },
  { href: '/painel/lancar', label: 'Lançar compra', icon: <IconPlus /> },
  { href: '/painel/regras', label: 'Cashback', icon: <IconRules /> },
  { href: '/painel/campanhas', label: 'Campanhas', icon: <IconMail /> },
  { href: '/painel/empresa', label: 'Empresa', icon: <IconMore /> },
];

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { business, businesses } = await requireBusiness();
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/painel" className="logo" aria-label="Painel">
            <img src="/logo-negativo.svg" alt="Cashbacksmart" />
          </Link>
          <TopNav items={items} />
          {businesses.length > 1 ? (
            <form action={selectBusinessAction} className="row" style={{ gap: 6 }}>
              <select name="businessId" defaultValue={business.id} aria-label="Loja" style={{ minHeight: 36, padding: '4px 10px', width: 'auto', maxWidth: 170 }}>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button className="btn coin sm">Trocar</button>
            </form>
          ) : (
            <span className="hide-sm" style={{ fontWeight: 600 }}>
              {business.name}
            </span>
          )}
        </div>
      </header>
      <main className="page">
        <div className="wrap">
          <Notices audience="business" />
          {children}
        </div>
      </main>
      <HelpFab href="/painel/ajuda" />
      <NativeBridge />
      <TabBar items={items} />
    </>
  );
}
