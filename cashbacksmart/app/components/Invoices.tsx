import { brl, dateBR } from '@/lib/format';

const STATUS: Record<string, [string, string]> = { pending: ['A pagar', 'coin'], paid: ['Paga', 'green'], canceled: ['Cancelada', ''] };

export function InvoiceList({ invoices }: { invoices: any[] }) {
  if (!invoices.length) return <p className="muted">Nenhuma fatura ainda.</p>;
  return (
    <div className="list">
      {invoices.map((i) => (
        <div key={i.id}>
          <div className="row between">
            <strong>{brl(i.amount_cents)}</strong>
            <span className={`tag ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span>
          </div>
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {i.items.map((it: any, k: number) => (
              <li key={k}>
                <small>
                  {it.description}: {brl(it.amount_cents)}
                </small>
              </li>
            ))}
          </ul>
          <small>{i.status === 'paid' ? `Paga em ${dateBR(i.paid_at)}` : `Vence em ${dateBR(i.due_date)}`}</small>
          {i.status === 'pending' &&
            (i.payment_url ? (
              <div style={{ marginTop: 8 }}>
                <a className="btn sm" href={i.payment_url} target="_blank" rel="noopener">
                  Pagar com Pix, boleto ou cartão
                </a>
              </div>
            ) : (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: '.88rem' }}>
                O link de pagamento chega no seu e-mail.
              </p>
            ))}
        </div>
      ))}
    </div>
  );
}
