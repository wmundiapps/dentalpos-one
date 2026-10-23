import { config } from '@/lib/config';
import { platformLeadPages } from '@/lib/services/leads';
import { adminToggleLeadPageAction } from '@/app/actions';
import { AdminLeadForm } from './AdminLeadForm';

export const metadata = { title: 'Leads da plataforma' };

export default async function AdminLeads() {
  const pages = await platformLeadPages();
  const base = config.appUrl.replace(/\/$/, '');
  return (
    <div className="stack">
      <h1>Captação de leads</h1>
      <p className="muted">Páginas da plataforma por categoria e cidade. Cada contato vai para até 3 lojas participantes, em rodízio (quem recebeu menos nos últimos 30 dias recebe primeiro). Use nos anúncios da Meta e do TikTok.</p>
      <section className="card">
        <h2>Nova página</h2>
        <AdminLeadForm />
      </section>
      <section className="card">
        <h2>Páginas</h2>
        {pages.length ? (
          <div className="list">
            {pages.map((p: any) => (
              <div key={p.id} className="row between" style={{ alignItems: 'flex-start' }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{p.title}</strong> {!p.active && <span className="tag">desativada</span>}
                  <small style={{ display: 'block' }}>
                    {p.category} · {p.city ? `${p.city}/${p.state}` : p.state || 'Brasil'} · {p.views} visitas · {p.leads} leads{Number(p.undelivered) ? ` · ${p.undelivered} sem loja (recrute lojas aqui)` : ''}
                  </small>
                  <small style={{ display: 'block', wordBreak: 'break-all' }}>
                    {base}/l/{p.slug}
                  </small>
                </span>
                <form action={adminToggleLeadPageAction}>
                  <input type="hidden" name="pageId" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? '0' : '1'} />
                  <button className="btn ghost sm">{p.active ? 'Desativar' : 'Reativar'}</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhuma página ainda.</p>
        )}
      </section>
    </div>
  );
}
