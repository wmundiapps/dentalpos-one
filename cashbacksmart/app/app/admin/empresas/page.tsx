import { adminList } from '@/lib/services/catalog';
import { dateBR } from '@/lib/format';
import { adminBusinessStatusAction } from '@/app/actions';

export default async function AdminEmpresas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const rows = await adminList('businesses', sp.q || '', 100);
  return (
    <div className="stack">
      <h1>Empresas</h1>
      <form className="row" role="search">
        <input name="q" defaultValue={sp.q || ''} placeholder="Nome, e-mail ou cidade" aria-label="Buscar" style={{ flex: '1 1 240px' }} />
        <button className="btn ghost">Buscar</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Cidade</th>
              <th>Dono</th>
              <th>Assinatura</th>
              <th>Desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b: any) => (
              <tr key={b.id}>
                <td>
                  {b.name}
                  <br />
                  <small>{b.category}</small>
                </td>
                <td>
                  {b.city}/{b.state}
                </td>
                <td>{b.owner_email}</td>
                <td>{b.sub_status}</td>
                <td>{dateBR(b.created_at)}</td>
                <td>
                  <form action={adminBusinessStatusAction}>
                    <input type="hidden" name="businessId" value={b.id} />
                    {b.status === 'active' ? (
                      <button className="btn danger sm" name="status" value="blocked">
                        Bloquear
                      </button>
                    ) : (
                      <button className="btn sm" name="status" value="active">
                        Desbloquear
                      </button>
                    )}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
