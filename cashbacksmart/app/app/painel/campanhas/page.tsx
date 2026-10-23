import { requireBusiness } from '@/lib/auth';
import { audienceSize, campaignsOf, emailCredits, localCampaignsThisMonth, packages } from '@/lib/services/campaigns';
import { config, STATES } from '@/lib/config';
import { brl, dateTimeBR } from '@/lib/format';
import { ActionForm, Submit } from '@/components/ui';
import { buyPackageAction, campaignAction } from '@/app/actions';

export const metadata = { title: 'Campanhas' };

const ST: Record<string, string> = { draft: 'Rascunho', queued: 'Na fila', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou' };

export default async function Campanhas() {
  const { business, isOwner } = await requireBusiness();
  const [list, credits, used, audience, pkgs] = await Promise.all([campaignsOf(business.id), emailCredits(business.id), localCampaignsThisMonth(business.id), audienceSize(business.id), packages()]);
  const left = Math.max(0, config.localCampaignsPerMonth - used);
  return (
    <div className="stack">
      <h1>Campanhas de e-mail</h1>
      <div className="grid-2">
        <div className="card tight stat">
          <div className="v">{left} de {config.localCampaignsPerMonth}</div>
          <div className="l">campanhas locais inclusas restantes este mês · {audience.toLocaleString('pt-BR')} clientes na sua cidade</div>
        </div>
        <div className="card tight stat">
          <div className="v">{credits.toLocaleString('pt-BR')}</div>
          <div className="l">e-mails nacionais disponíveis (pacotes pagos)</div>
        </div>
      </div>

      {isOwner ? (
        <section className="card">
          <h2>Nova campanha</h2>
          <ActionForm action={campaignAction} resetOnOk>
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: '.92rem', marginBottom: 6 }}>Para quem</legend>
              <div className="seg">
                <label>
                  <input type="radio" name="scope" value="local" defaultChecked />
                  <span>Minha cidade (incluso)</span>
                </label>
                <label>
                  <input type="radio" name="scope" value="national" />
                  <span>Nacional (pacote)</span>
                </label>
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="c-uf">Estado (só para nacional; vazio = Brasil todo)</label>
              <select id="c-uf" name="targetState" defaultValue="">
                <option value="">Brasil todo</option>
                {STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-subject">Assunto</label>
              <input id="c-subject" name="subject" maxLength={120} placeholder="ex.: Sexta tem 15% de volta no açaí" required />
            </div>
            <div className="field">
              <label htmlFor="c-body">Mensagem</label>
              <textarea id="c-body" name="body" maxLength={4000} required placeholder="Conte a oferta, o prazo e onde fica a loja." />
              <small className="muted">Sua melhor regra de cashback entra automaticamente no e-mail e a oferta aparece no app dos clientes.</small>
            </div>
            <Submit pendingText="Enviando…">Enviar campanha</Submit>
          </ActionForm>
        </section>
      ) : null}

      {isOwner && (
        <section className="card">
          <h2>Pacotes nacionais</h2>
          <p className="muted">Para falar com clientes de outras cidades ou do Brasil todo.</p>
          <div className="grid">
            {pkgs.map((p) => (
              <ActionForm key={p.id} action={buyPackageAction} className="card tight">
                <input type="hidden" name="packageId" value={p.id} />
                <h3>{p.emails.toLocaleString('pt-BR')} e-mails</h3>
                <div className="amount sm">{brl(p.price_cents)}</div>
                <small className="muted" style={{ display: 'block', margin: '4px 0 10px' }}>
                  {brl(Math.round((Number(p.price_cents) / p.emails) * 1000))} por mil
                </small>
                <Submit className="btn coin sm">Comprar</Submit>
              </ActionForm>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Enviadas</h2>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Assunto</th>
                  <th>Alcance</th>
                  <th className="num">Enviados</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c: any) => (
                  <tr key={c.id}>
                    <td>{dateTimeBR(c.created_at)}</td>
                    <td>{c.subject}</td>
                    <td>{c.scope === 'local' ? `${c.target_city}/${c.target_state}` : c.target_state || 'Brasil'}</td>
                    <td className="num">
                      {Number(c.sent_count).toLocaleString('pt-BR')} / {Number(c.recipients).toLocaleString('pt-BR')}
                    </td>
                    <td>{ST[c.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhuma campanha ainda.</p>
        )}
      </section>
    </div>
  );
}
