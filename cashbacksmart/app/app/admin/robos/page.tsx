import { openFlags } from '@/lib/services/fraud';
import { unresolvedQuestions } from '@/lib/services/bot';
import { dateTimeBR } from '@/lib/format';
import { adminNoticeAction, adminResolveFlagAction } from '@/app/actions';
import { allNotices } from '@/lib/services/security';
import { llmEnabled } from '@/lib/llm';

const KIND: Record<string, string> = { velocity: 'Muitas compras do mesmo cliente', self_purchase: 'Cashback para a própria equipe', high_rule: 'Regra com percentual alto', burst: 'Pico de lançamentos', claim_rejections: 'Loja recusando muitas notas', claim_abuse: 'Cliente com notas recusadas' };

export default async function Robos() {
  const [flags, questions, notices] = await Promise.all([openFlags(), unresolvedQuestions(), allNotices()]);
  return (
    <div className="stack">
      <h1>Robôs</h1>
      <p className="alert info">
        Atendimento: {llmEnabled() ? 'IA ativa (com acesso aos dados da conta)' : 'modo regras (configure ANTHROPIC_API_KEY para ativar a IA)'}. Antifraude, cobrança, avisos e moderação rodam sozinhos.
      </p>
      <section className="card">
        <h2>Avisos no app (manutenção, atualização, instabilidade)</h2>
        <p className="muted">O robô de monitoramento publica avisos sozinho quando o app cai e os retira quando volta. Use aqui para avisos manuais.</p>
        <form action={adminNoticeAction} className="stack">
          <div className="row">
            <select name="kind" defaultValue="info" aria-label="Tipo" style={{ width: 'auto' }}>
              <option value="info">Aviso</option>
              <option value="maintenance">Manutenção</option>
              <option value="update">Atualização</option>
              <option value="incident">Instabilidade</option>
            </select>
            <select name="audience" defaultValue="all" aria-label="Para quem" style={{ width: 'auto' }}>
              <option value="all">Todos</option>
              <option value="consumer">Clientes</option>
              <option value="business">Lojas</option>
            </select>
          </div>
          <input name="message" placeholder="ex.: Manutenção programada hoje às 2h, por 10 minutos." aria-label="Mensagem" maxLength={300} />
          <button className="btn sm">Publicar aviso</button>
        </form>
        {notices.length > 0 && (
          <div className="list" style={{ marginTop: 12 }}>
            {notices.map((n: any) => (
              <div key={n.id} className="row between">
                <span>
                  <span className={`tag ${n.active ? 'green' : ''}`}>{n.active ? 'No ar' : 'Encerrado'}</span> {n.message}
                </span>
                {n.active && (
                  <form action={adminNoticeAction}>
                    <button className="btn ghost sm" name="end" value={n.id}>
                      Encerrar
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Alertas de fraude</h2>
        {flags.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Loja</th>
                  <th>Detalhes</th>
                  <th>Ação do robô</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f: any) => (
                  <tr key={f.id}>
                    <td>{dateTimeBR(f.created_at)}</td>
                    <td>{KIND[f.kind] || f.kind}</td>
                    <td>
                      {f.business}
                      {f.consumer ? <small style={{ display: 'block' }}>Cliente: {f.consumer}</small> : null}
                    </td>
                    <td>
                      <small>{Object.entries(f.details).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}</small>
                    </td>
                    <td>{f.action === 'blocked' ? <span className="tag coral">Loja pausada</span> : <span className="tag coin">Sinalizado</span>}</td>
                    <td>
                      <form action={adminResolveFlagAction} className="row" style={{ gap: 6 }}>
                        <input type="hidden" name="flagId" value={f.id} />
                        <button className="btn ghost sm" name="unblock" value="0">
                          Arquivar
                        </button>
                        {f.action === 'blocked' && (
                          <button className="btn sm" name="unblock" value="1">
                            Liberar loja
                          </button>
                        )}
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nenhum alerta aberto.</p>
        )}
      </section>
      <section className="card">
        <h2>Perguntas que o atendimento não resolveu</h2>
        {questions.length ? (
          <div className="list">
            {questions.map((q: any, i: number) => (
              <div key={i}>
                <small>
                  {dateTimeBR(q.created_at)} · {q.name} ({q.role === 'business' ? 'loja' : 'cliente'})
                </small>
                <p style={{ margin: 0 }}>{q.question}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhuma pergunta pendente.</p>
        )}
      </section>
    </div>
  );
}
