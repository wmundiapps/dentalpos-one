import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { businessDashboard, recentPurchases } from '@/lib/services/catalog';
import { describeSubscription, subscriptionOf } from '@/lib/services/billing';
import { brl, dateTimeBR } from '@/lib/format';
import { config } from '@/lib/config';
import { CancelButton } from './CancelButton';
import { ClaimRow } from './Claims';
import { WelcomeSetup } from './WelcomeSetup';
import { pendingClaims } from '@/lib/services/nfce';
import { rulesFor } from '@/lib/services/cashback';

export const metadata = { title: 'Painel' };

export default async function Painel({ searchParams }: { searchParams: Promise<{ bemvindo?: string; nova?: string }> }) {
  const { business, isOwner } = await requireBusiness();
  const sp = await searchParams;
  const [d, recent, sub, claims, rules] = await Promise.all([businessDashboard(business.id), recentPurchases(business.id, 25), subscriptionOf({ businessId: business.id }), pendingClaims(business.id), rulesFor(business.id)]);
  const hasWelcome = rules.some((r) => r.audience === 'new_customer' && r.active);
  const now = Date.now();
  const stats = [
    { l: 'Vendas no mês', v: brl(d.sales_month) },
    { l: 'Compras no mês', v: Number(d.purchases_month).toLocaleString('pt-BR') },
    { l: 'Cashback dado no mês', v: brl(d.cashback_month) },
    { l: 'Saldo resgatado no mês', v: brl(d.redeemed_month) },
    { l: 'Clientes', v: Number(d.customers).toLocaleString('pt-BR') },
    { l: 'Clientes que voltaram', v: Number(d.returning_customers).toLocaleString('pt-BR') },
  ];
  return (
    <div className="stack">
      {(sp.bemvindo || sp.nova) && (
        <p className="alert ok">
          Empresa cadastrada! Seus 6 meses sem mensalidade começaram. Lance a primeira compra em <Link href="/painel/lancar">Lançar compra</Link>.
        </p>
      )}
      {sub?.status === 'past_due' && (
        <p className="alert error">
          Assinatura com pagamento pendente: lançamentos e campanhas estão pausados. <Link href="/painel/faturas">Ver faturas</Link>
        </p>
      )}
      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 2 }}>{business.name}</h1>
          <small>{describeSubscription(sub)}</small>
        </div>
        <Link href="/painel/lancar" className="btn">
          Lançar compra
        </Link>
      </div>

      {claims.length > 0 && (
        <section className="card" style={{ borderColor: 'var(--green)', borderWidth: 2 }}>
          <h2>Notas enviadas por clientes ({claims.length})</h2>
          <p className="muted">O cliente comprou e a compra não foi lançada no caixa. Notas de até {brl(config.claimAutoApproveMaxCents)} sem resposta em {config.claimAutoApproveHours} horas são confirmadas automaticamente.</p>
          <div className="list">
            {claims.map((c: any) => (
              <ClaimRow key={c.id} c={{ ...c, created_at: new Date(c.created_at).toISOString() }} />
            ))}
          </div>
        </section>
      )}
      {isOwner && !hasWelcome && <WelcomeSetup feePct={config.cashbackFeeBps / 100} />}

      <section className="grid" aria-label="Atalhos">
        <Link href="/painel/kit" className="card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
          <strong>Kit do caixa</strong>
          <small style={{ display: 'block' }}>Imprima o QR da loja: o cliente cadastra a nota sozinho, por QR ou foto.</small>
        </Link>
        <Link href="/painel/leads" className="card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
          <strong>Captação de clientes {Number(d.leads_new) > 0 && <span className="tag coin">{d.leads_new} {Number(d.leads_new) === 1 ? 'novo' : 'novos'}</span>}</strong>
          <small style={{ display: 'block' }}>Páginas de oferta que trazem contatos de clientes para você chamar no WhatsApp.</small>
        </Link>
      </section>

      <section className="grid" aria-label="Resumo">
        {stats.map((s) => (
          <div key={s.l} className="card tight stat">
            <div className="v">{s.v}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
        {isOwner && (
          <div className="card tight stat">
            <div className="v">{brl(d.fee_open)}</div>
            <div className="l">
              Taxa de {config.cashbackFeeBps / 100}% sobre o cashback usado, a faturar · <Link href="/painel/faturas">faturas</Link>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Últimas compras</h2>
        {recent.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th className="num">Compra</th>
                  <th className="num">Saldo usado</th>
                  <th className="num">Cashback</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p: any) => (
                  <tr key={p.id} style={p.status === 'canceled' || p.status === 'rejected' ? { opacity: 0.55 } : undefined}>
                    <td>{dateTimeBR(p.created_at)}</td>
                    <td>
                      {p.customer}
                      {p.source === 'customer' && <small style={{ display: 'block' }}>enviada pelo cliente</small>}
                    </td>
                    <td className="num">{brl(p.amount_cents)}</td>
                    <td className="num">{Number(p.redeemed_cents) ? brl(p.redeemed_cents) : '—'}</td>
                    <td className="num">{brl(p.cashback_cents)}</td>
                    <td>
                      {p.status === 'pending' ? (
                        <span className="tag coin">Aguardando você</span>
                      ) : p.status === 'rejected' ? (
                        <span className="tag">Recusada</span>
                      ) : p.status === 'canceled' ? (
                        <span className="tag">Cancelada</span>
                      ) : now - new Date(p.created_at).getTime() < config.cancelWindowDays * 86400000 && !p.fee_invoice_id ? (
                        <CancelButton purchaseId={p.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Nenhuma compra ainda. Peça o código do cliente no caixa e <Link href="/painel/lancar">lance a compra</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
