'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

function isActive(path: string, it: NavItem) {
  return it.exact ? path === it.href : path === it.href || path.startsWith(it.href + '/');
}

export function TopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="topnav" aria-label="Principal">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(path, it) ? 'page' : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Principal">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={isActive(path, it) ? 'page' : undefined}>
          {it.icon}
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function HelpFab({ href }: { href: string }) {
  const path = usePathname();
  if (path === href) return null;
  return (
    <Link href={href} className="help-fab">
      Ajuda
    </Link>
  );
}
