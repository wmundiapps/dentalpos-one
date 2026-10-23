import { adminList } from '@/lib/services/catalog';
import { dateBR } from '@/lib/format';

export default async function AdminClientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const rows = await adminList('consumers', sp.q || '', 100);
  return (
    <div className="stack">
      <h1>Clientes</h1>
      <form className="row" role="search">
        <input name="q" defaultValue={sp.q || ''} placeholder="Nome, e-mail ou cidade" aria-label="Buscar" style={{ flex: '1 1 240px' }} />
        <button className="btn ghost">Buscar</button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Cidade</th>
              <th>Assinatura</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u: any) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  {u.city}/{u.state}
                </td>
                <td>{u.sub_status}</td>
                <td>{dateBR(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
