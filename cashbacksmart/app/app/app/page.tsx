import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getUser } from '@/lib/services/accounts';
import { walletSummary } from '@/lib/services/cashback';
import { businessesIn } from '@/lib/services/catalog';
import { feedFor } from '@/lib/services/campaigns';
import { subscriptionOf, describeSubscription } from '@/lib/services/billing';
import { brl, dateBR } from '@/lib/format';
import { StoreRow } from '@/components/StoreRow';

export const metadata = { title: 'Início' };

export default async function Home({ searchParams }: { searchParams: Promise<{ bemvindo?: string }> }) {
  const { userId } = await requireRole('consumer');
  const sp = await searchParams;
  const [user, wallet, sub] = await Promise.all([getUser(userId), walletSummary(userId), subscriptionOf({ userId })]);
  const [stores, feed] = await Promise.all([businessesIn(user!.state, user!.city, { limit: 6 }), feedFor(user!.state, user!.city, 10)]);
  const available = wallet.reduce((s, w) => s + Number(w.available), 0);
  const pending = wallet.reduce((s, w) => s + Number(w.pending), 0);
  const firstName = user!.name.split(' ')[0];

  return (
    <div className="stack">
      {sp.bemvindo && (
        <p className="alert ok">
          Pronto, {firstName}! Sua conta é grátis. No caixa, mostre <Link href="/app/codigo">seu código</Link> ou informe seu CPF. Confirme seu celular em <Link href="/app/conta">Conta</Link> para ganhar as promoções de boas-vindas.
        </p>
      )}

      <section className="receipt ink" aria-label="Seu saldo">
        <div className="row between">
          <span>Olá, {firstName}</span>
          <small>Conta grátis</small>
        </div>
        <p className="muted" style={{ margin: '14px 0 4px' }}>Saldo para usar</p>
        <div className="amount coin">{brl(available)}</div>
        {pending > 0 && <p style={{ margin: '8px 0 0' }}>+ {brl(pending)} liberando em breve</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <Link href="/app/codigo" className="btn coin sm">
            Mostrar meu código
          </Link>
          <Link href="/app/nota" className="btn sm" style={{ background: 'transparent', border: '2px solid rgba(255,255,255,.35)' }}>
            Enviar nota fiscal
          </Link>
        </div>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <div className="row between">
          <h2>Cashback em {user!.city}</h2>
          <Link href="/app/lojas">Ver todas</Link>
        </div>
        {stores.length ? (
          <div className="list">
            {stores.map((b: any) => (
              <StoreRow key={b.id} b={b} href={`/app/lojas/${b.id}`} />
            ))}
          </div>
        ) : (
          <p className="muted">
            Ainda não há lojas participantes em {user!.city}. Indique o comércio que você mais frequenta: compartilhe o link de cadastro de empresa{' '}
            <strong>cashbacksmart.com.br/cadastro/empresa</strong>.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Ofertas para você</h2>
        {feed.length ? (
          <div className="list">
            {feed.map((f: any) => (
              <article key={f.id}>
                <small>
                  <Link href={`/app/lojas/${f.business_id}`}>{f.business}</Link> · {dateBR(f.created_at)} {f.scope === 'national' && <span className="tag">Nacional</span>}
                </small>
                <h3 style={{ margin: '4px 0' }}>{f.subject}</h3>
                <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{f.body.length > 280 ? f.body.slice(0, 280) + '…' : f.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">As ofertas das lojas da sua cidade aparecem aqui.</p>
        )}
      </section>
    </div>
  );
}
