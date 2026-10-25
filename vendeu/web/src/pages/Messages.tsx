import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAction, useAsync, usePageTitle } from '../lib/hooks';
import { fmtDateTime, timeAgo } from '../lib/format';
import { Alert, Empty, ErrorAlert, ErrorState, Loading, StatusBadge } from '../components/ui';

interface Conv { id: string; listingId: string; title: string; listingStatus: string; lastBody: string | null; lastMessageAt: string; unread: number; otherName: string; role: 'buyer' | 'seller' }
interface Msg { id: string; mine: boolean; body: string; warning: string | null; createdAt: string }
interface Thread { id: string; listingId: string; messages: Msg[] }

export function Messages() {
  const { id } = useParams();
  const { refreshUnread } = useApp();
  usePageTitle('Mensagens');
  const list = useAsync(() => api.get<{ items: Conv[] }>('/messages'), [id], { silentMs: 10000 });
  useEffect(() => { refreshUnread(); }, [list.data, refreshUnread]);

  return (
    <div className={`msg-layout${id ? ' has-thread' : ''}`}>
      <section className="msg-list" aria-label="Conversas">
        <h1 className="h2">Mensagens</h1>
        {list.loading && !list.data ? <Loading /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.items.length ? (
          <Empty icon="💬" title="Nenhuma conversa ainda">Quando você falar com um vendedor (ou um comprador falar com você), a conversa aparece aqui. <Link to="/compra">Ver anúncios</Link></Empty>
        ) : (
          <ul className="conv-list">
            {list.data.items.map((c) => (
              <li key={c.id}>
                <Link to={`/mensagens/${c.id}`} className={`conv${c.id === id ? ' on' : ''}${c.unread ? ' unread' : ''}`} aria-current={c.id === id ? 'page' : undefined}>
                  <div className="conv-top"><strong>{c.otherName}</strong><span className="small muted">{timeAgo(c.lastMessageAt)}</span></div>
                  <div className="conv-title small">{c.title}</div>
                  <div className="conv-last small muted">{c.lastBody}</div>
                  {c.unread > 0 && <span className="count" aria-label={`${c.unread} não lidas`}>{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="msg-thread" aria-label="Conversa">
        {id ? <ThreadView key={id} id={id} conv={list.data?.items.find((c) => c.id === id)} /> : (
          <div className="msg-placeholder"><Empty icon="👈" title="Escolha uma conversa">Selecione uma conversa para ler e responder.</Empty></div>
        )}
      </section>
    </div>
  );
}

function ThreadView({ id, conv }: { id: string; conv?: Conv }) {
  const { refreshUnread } = useApp();
  const t = useAsync(() => api.get<Thread>(`/messages/${id}`), [id], { silentMs: 10000 });
  const [body, setBody] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const act = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  const count = t.data?.messages.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);
  useEffect(() => { if (t.data) refreshUnread(); }, [t.data, refreshUnread]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    const r = await act.run(() => api.post<{ warnings: string[] }>(`/messages/${id}`, { body: text }));
    if (r) { setBody(''); setWarnings(r.warnings); t.reload(); }
  };

  if (t.loading && !t.data) return <Loading />;
  if (t.error && !t.data) return <ErrorState error={t.error} onRetry={t.reload} />;
  const msgs = t.data!.messages;

  return (
    <div className="thread">
      <div className="thread-head">
        <Link to="/mensagens" className="back-link">← Conversas</Link>
        <div>
          <strong>{conv?.otherName ?? 'Conversa'}</strong>
          <div className="small"><Link to={`/anuncio/${t.data!.listingId}`}>{conv?.title ?? 'Ver anúncio'}</Link> {conv && <StatusBadge status={conv.listingStatus} />}</div>
        </div>
      </div>
      <div className="safety-strip" role="note"><span aria-hidden="true">🔒</span> Telefone, e-mail, links e @usuário são ocultados aqui e só são liberados depois do recebimento do produto. Negocie e pague só pelo Vendeu; nunca informe códigos de SMS/WhatsApp.</div>
      <div className="bubbles" role="log" aria-live="polite" aria-label="Mensagens">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble-wrap ${m.mine ? 'mine' : 'theirs'}`}>
            <div className="bubble">
              <p className="pre">{m.body}</p>
              <span className="bubble-time">{fmtDateTime(m.createdAt)}</span>
            </div>
            {m.warning && <div className="bubble-warn" role="alert"><strong>🔒 Nota do Vendeu:</strong> {m.warning.split(' | ').join(' ')}</div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {warnings.length > 0 && <Alert tone="warn" title="Cuidado com o que você enviou"><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
      <form className="composer" onSubmit={send}>
        <label htmlFor="nova-msg" className="sr-only">Escrever mensagem</label>
        <textarea id="nova-msg" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Escreva sua mensagem…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(e as unknown as FormEvent); }} />
        <button className="btn btn-primary" disabled={act.busy || !body.trim()}>{act.busy ? '…' : 'Enviar'}</button>
      </form>
      <ErrorAlert error={act.error} />
    </div>
  );
}
