import QRCode from 'qrcode';
import { requireBusiness } from '@/lib/auth';
import { config } from '@/lib/config';
import { dateTimeBR } from '@/lib/format';
import { leadPagesFor, leadsFor, whatsappLink } from '@/lib/services/leads';
import { leadStatusAction, toggleLeadPageAction } from '@/app/actions';
import { LeadPageForm } from './LeadPageForm';

export const metadata = { title: 'Captação de clientes' };

const ST: Record<string, string> = { new: 'Novo', contacted: 'Chamei', converted: 'Virou cliente', lost: 'Não fechou' };

export default async function Leads() {
  const { business, isOwner } = await requireBusiness();
  const [pages, leads] = await Promise.all([leadPagesFor(business.id), leadsFor(business.id)]);
  const base = config.appUrl.replace(/\/$/, '');
  const qrs = await Promise.all(pages.map((p: any) => QRCode.toString(`${base}/l/${p.slug}`, { type: 'svg', margin: 1, color: { dark: '#1B2A6B', light: '#FFFFFF' } })));
  const fresh = leads.filter((l: any) => l.status === 'new').length;
  return (
    <div className="stack">
      <h1>Captação de clientes</h1>
      <p className="muted">
        Crie uma página com uma oferta (ex.: “Ganhe R$ 20 de cashback na primeira visita”), divulgue o link no Instagram, WhatsApp, anúncios ou no QR da vitrine. Quem se cadastra cai aqui na hora e
        você recebe um e-mail. Também enviamos contatos das páginas do {config.appName} da sua categoria e cidade. Grátis, incluso no plano.
      </p>

      <section className="card">
        <h2>
          Contatos recebidos {fresh > 0 && <span className="tag coin">{fresh} {fresh === 1 ? 'novo' : 'novos'}</span>}
        </h2>
        {leads.length ? (
          <div className="list">
            {leads.map((l: any) => (
              <div key={l.id} className="stack" style={{ gap: 6 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span>
                    <strong>{l.name}</strong> {l.is_member && <span className="tag green">já usa o app</span>}
                    <small style={{ display: 'block' }}>
                      {dateTimeBR(l.created_at)} · {l.page_title}
                      {l.answer ? ` · “${l.answer}”` : ''}
                    </small>
                  </span>
                  <span className="tag">{ST[l.status]}</span>
                </div>
                <div className="row">
                  <a className="btn sm" href={whatsappLink(l.phone, `Olá, ${l.name.split(' ')[0]}! Aqui é da ${business.name}. Vi que você se interessou pela nossa oferta "${l.page_title}".`)} target="_blank" rel="noreferrer">
                    Chamar no WhatsApp
                  </a>
                  <form action={leadStatusAction} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="leadId" value={l.id} />
                    <select name="status" defaultValue={l.status} aria-label="Situação" style={{ width: 'auto', minHeight: 36, padding: '4px 10px' }}>
                      {Object.entries(ST).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button className="btn ghost sm">Salvar</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum contato ainda. Crie uma página abaixo e divulgue o link.</p>
        )}
      </section>

      {isOwner && (
        <section className="card">
          <h2>Nova página de captação</h2>
          <LeadPageForm />
        </section>
      )}

      {pages.length > 0 && (
        <section className="card">
          <h2>Suas páginas</h2>
          <div className="list">
            {pages.map((p: any, i: number) => (
              <div key={p.id} className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 96, flex: 'none' }} dangerouslySetInnerHTML={{ __html: qrs[i].replace('<svg', '<svg width="96" height="96"') }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{p.title}</strong> {!p.active && <span className="tag">desativada</span>}
                  <small style={{ display: 'block', wordBreak: 'break-all' }}>
                    {base}/l/{p.slug}
                  </small>
                  <small style={{ display: 'block' }}>
                    {p.views} visitas · {p.leads} contatos
                  </small>
                  {isOwner && (
                    <form action={toggleLeadPageAction} style={{ marginTop: 6 }}>
                      <input type="hidden" name="pageId" value={p.id} />
                      <input type="hidden" name="active" value={p.active ? '0' : '1'} />
                      <button className="linkbtn">{p.active ? 'Desativar' : 'Reativar'}</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
