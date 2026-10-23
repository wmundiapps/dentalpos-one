import { requireBusiness } from '@/lib/auth';
import { rulesFor } from '@/lib/services/cashback';
import { ruleSummary } from '@/components/rules';
import { PurchaseForm } from './PurchaseForm';

export const metadata = { title: 'Lançar compra' };

export default async function Lancar() {
  const { business } = await requireBusiness();
  const rules = (await rulesFor(business.id)).filter((r) => r.active);
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1>Lançar compra</h1>
      <PurchaseForm />
      <section className="card tight">
        <h3>Regras ativas</h3>
        {rules.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rules.map((r) => (
              <li key={r.id}>
                <strong>{r.title}:</strong> {ruleSummary(r)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Nenhuma regra ativa: as compras serão registradas sem cashback.</p>
        )}
        <small className="muted">Se mais de uma regra valer, o cliente ganha a maior.</small>
      </section>
    </div>
  );
}
