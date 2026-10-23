import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { businessPublic } from '@/lib/services/catalog';
import { walletSummary } from '@/lib/services/cashback';
import { brl, dateBR } from '@/lib/format';
import { ruleSummary, ruleTerms } from '@/components/rules';
import { RedeemBox } from './RedeemBox';

export default async function Loja({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireRole('consumer');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let b: any;
  try {
    b = await businessPublic(id);
  } catch {
    notFound();
  }
  const w = (await walletSummary(userId)).find((x) => x.business_id === id);
  const available = Number(w?.available || 0);
  return (
    <div className="stack">
      <Link href="/app/lojas">← Lojas</Link>
      <div>
        <h1 style={{ marginBottom: 4 }}>{b.name}</h1>
        <p className="muted">
          {b.category} · {[b.address, b.neighborhood, `${b.city}/${b.state}`].filter(Boolean).join(', ')}
        </p>
        {b.description && <p>{b.description}</p>}
      </div>

      <section className="receipt">
        <p className="muted" style={{ margin: 0 }}>Seu saldo nesta loja</p>
        <div className="amount green">{brl(available)}</div>
        {Number(w?.pending || 0) > 0 && <p style={{ margin: '6px 0 0' }}>+ {brl(w!.pending)} liberando em breve</p>}
        {w?.next_expiry && <small>Próximo vencimento: {dateBR(w.next_expiry)}</small>}
        <div style={{ marginTop: 14 }}>
          {available > 0 ? <RedeemBox businessId={id} /> : <p className="muted" style={{ margin: 0 }}>Compre aqui e informe seu código no caixa para ganhar cashback.</p>}
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>Como ganhar cashback aqui</h2>
        {b.rules.length ? (
          <div className="list">
            {b.rules.map((r: any) => (
              <div key={r.id}>
                <strong>{r.title}</strong>
                <p style={{ margin: '2px 0' }}>{ruleSummary(r)}</p>
                <small>{ruleTerms(r)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Esta loja está sem ofertas ativas no momento.</p>
        )}
      </section>
    </div>
  );
}
