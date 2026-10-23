import { brl, pct, WEEKDAYS, dateBR } from '@/lib/format';

export function ruleSummary(r: any) {
  const parts: string[] = [];
  parts.push(r.kind === 'percent' ? `${pct(r.value)} de volta` : `${brl(r.value)} de volta por compra`);
  if (r.audience === 'new_customer') parts.push(r.new_window_days ? `para clientes novos nos primeiros ${r.new_window_days} dias` : 'para clientes novos, na primeira compra');
  if (Number(r.min_purchase_cents) > 0) parts.push(`em compras a partir de ${brl(r.min_purchase_cents)}`);
  if (r.max_cashback_cents != null) parts.push(`até ${brl(r.max_cashback_cents)} por compra`);
  if (r.weekdays?.length) parts.push(`só ${r.weekdays.map((d: number) => WEEKDAYS[d]).join(', ')}`);
  if (r.starts_at || r.ends_at) parts.push(`de ${r.starts_at ? dateBR(r.starts_at) : 'hoje'} até ${r.ends_at ? dateBR(r.ends_at) : 'sem data final'}`);
  return parts.join(' · ');
}

export function ruleTerms(r: any) {
  const t: string[] = [];
  t.push(r.release_days > 0 ? `Saldo liberado ${r.release_days} dia(s) após a compra` : 'Saldo liberado na hora');
  t.push(`vale por ${r.expires_days} dias`);
  return t.join(', ');
}
