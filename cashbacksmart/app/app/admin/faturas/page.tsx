import { adminList } from '@/lib/services/catalog';
import { brl, dateBR } from '@/lib/format';
import { adminMarkPaidAction } from '@/app/actions';

export default async function AdminFaturas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const rows = await adminList('invoices', sp.q || '', 150);
  return (
    <div className="stack">
      <h1>Faturas</h1>
      <form className="row" role="search">
        <input name="q" defaultValue={sp.q || ''} placeholder="Nome do cliente ou empresa" aria-label="Buscar" style={{ flex: '1 1 240px' }} />
        <button className="btn ghost">Buscar</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Quem</th>
              <th className="num">Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i: any) => (
              <tr key={i.id}>
                <td>
                  {i.who}
                  <br />
                  <small>{i.who_kind}</small>
                </td>
                <td className="num">{brl(i.amount_cents)}</td>
                <td>{dateBR(i.due_date)}</td>
                <td>{i.status === 'paid' ? `Paga ${dateBR(i.paid_at)}` : i.status === 'pending' ? 'Pendente' : 'Cancelada'}</td>
                <td>
                  {i.status === 'pending' && (
                    <form action={adminMarkPaidAction}>
                      <input type="hidden" name="invoiceId" value={i.id} />
                      <button className="btn sm">Dar baixa</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
