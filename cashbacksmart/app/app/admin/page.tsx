import { adminStats } from '@/lib/services/catalog';
import { brl } from '@/lib/format';
import { logoutAction } from '@/app/actions';

export const metadata = { title: 'Admin' };

export default async function Admin() {
  const s = await adminStats();
  const n = (v: any) => Number(v).toLocaleString('pt-BR');
  const stats = [
    ['Clientes (pessoa física)', n(s.consumers)],
    ['Empresas', n(s.businesses)],
    ['Assinaturas em teste', n(s.trialing)],
    ['Assinaturas ativas', n(s.active)],
    ['Inadimplentes', n(s.past_due)],
    ['Recebido no mês', brl(s.paid_month)],
    ['A receber', brl(s.pending_total)],
    ['Compras registradas', n(s.purchases)],
    ['Cashback concedido', brl(s.cashback_total)],
    ['E-mails enviados', n(s.emails_sent)],
  ];
  return (
    <div className="stack">
      <h1>Resumo</h1>
      <div className="grid">
        {stats.map(([l, v]) => (
          <div key={l} className="card tight stat">
            <div className="v">{v}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>
      <form action={logoutAction}>
        <button className="btn ghost">Sair</button>
      </form>
    </div>
  );
}
