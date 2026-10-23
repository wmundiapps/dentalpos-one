import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { walletHistory, walletSummary } from '@/lib/services/cashback';
import { brl, dateBR, dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Carteira' };

const KIND: Record<string, string> = { credit: 'Cashback recebido', debit: 'Saldo usado', expire: 'Saldo vencido', reversal: 'Compra cancelada' };

export default async function Carteira() {
  const { userId } = await requireRole('consumer');
  const [summary, history] = await Promise.all([walletSummary(userId), walletHistory(userId, 60)]);
  const total = summary.reduce((s, w) => s + Number(w.available), 0);
  const now = Date.now();
  return (
    <div className="stack">
      <h1>Carteira</h1>
      <section className="receipt">
        <p className="muted" style={{ margin: 0 }}>Saldo total para usar</p>
        <div className="amount green" data-testid="wallet-total">
          {brl(total)}
        </div>
        <small>O saldo de cada loja é usado na própria loja.</small>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>Por loja</h2>
        {summary.length ? (
          <div className="list">
            {summary.map((w) => (
              <Link key={w.business_id} href={`/app/lojas/${w.business_id}`} className="store">
                <span className="badge" aria-hidden>
                  {w.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong style={{ display: 'block' }}>{w.name}</strong>
                  <small>
                    {Number(w.pending) > 0 ? `+ ${brl(w.pending)} liberando · ` : ''}
                    {w.next_expiry ? `vence ${dateBR(w.next_expiry)}` : ''}
                  </small>
                </span>
                <span className="offer">{brl(w.available)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">
            Você ainda não tem saldo. Compre em uma <Link href="/app/lojas">loja participante</Link> e informe seu código.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Extrato</h2>
        {history.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Loja</th>
                  <th>Movimento</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{dateTimeBR(h.created_at)}</td>
                    <td>{h.business}</td>
                    <td>
                      {KIND[h.kind]}
                      {h.kind === 'credit' && new Date(h.available_at).getTime() > now && <span className="tag coin" style={{ marginLeft: 6 }}>libera {dateBR(h.available_at)}</span>}
                    </td>
                    <td className="num" style={{ color: Number(h.amount_cents) > 0 ? 'var(--green-deep)' : 'var(--coral)' }}>
                      {Number(h.amount_cents) > 0 ? '+' : ''}
                      {brl(h.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhum movimento ainda.</p>
        )}
      </section>
    </div>
  );
}
