import Link from 'next/link';
import { brl, pct } from '@/lib/format';

export function offerText(rule: { kind: string; value: number } | null) {
  if (!rule) return null;
  return rule.kind === 'percent' ? pct(rule.value) : brl(rule.value);
}

export function StoreRow({ b, href }: { b: { id: string; name: string; category: string; neighborhood?: string; best_rule?: any }; href: string }) {
  const offer = offerText(b.best_rule);
  return (
    <Link href={href} className="store">
      <span className="badge" aria-hidden>
        {b.name.trim().charAt(0).toUpperCase()}
      </span>
      <span>
        <strong style={{ display: 'block' }}>{b.name}</strong>
        <small>
          {b.category}
          {b.neighborhood ? ` · ${b.neighborhood}` : ''}
        </small>
      </span>
      {offer && (
        <span className="offer">
          {b.best_rule?.restricted ? <small>até</small> : null}
          {offer}
          <small>de volta</small>
        </span>
      )}
    </Link>
  );
}
