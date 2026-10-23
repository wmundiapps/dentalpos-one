import { requireRole } from '@/lib/auth';
import { getUser } from '@/lib/services/accounts';
import { businessesIn } from '@/lib/services/catalog';
import { CATEGORIES } from '@/lib/config';
import { StoreRow } from '@/components/StoreRow';

export const metadata = { title: 'Lojas' };

export default async function Lojas({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const { userId } = await requireRole('consumer');
  const sp = await searchParams;
  const user = await getUser(userId);
  const category = CATEGORIES.includes(sp.c || '') ? sp.c : undefined;
  const stores = await businessesIn(user!.state, user!.city, { category, search: sp.q?.slice(0, 60), limit: 60 });
  return (
    <div className="stack">
      <h1>Lojas em {user!.city}</h1>
      <form className="row" role="search">
        <input name="q" defaultValue={sp.q || ''} placeholder="Buscar por nome ou bairro" aria-label="Buscar" style={{ flex: '1 1 200px' }} />
        <select name="c" defaultValue={category || ''} aria-label="Ramo" style={{ flex: '0 1 200px' }}>
          <option value="">Todos os ramos</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn ghost">Buscar</button>
      </form>
      <section className="card">
        {stores.length ? (
          <div className="list">
            {stores.map((b: any) => (
              <StoreRow key={b.id} b={b} href={`/app/lojas/${b.id}`} />
            ))}
          </div>
        ) : (
          <p className="muted">Nenhuma loja encontrada com esses filtros.</p>
        )}
      </section>
    </div>
  );
}
