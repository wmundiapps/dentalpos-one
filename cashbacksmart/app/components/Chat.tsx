'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { botAction } from '@/app/actions';

type Msg = { role: 'user' | 'assistant'; content: string };

export function Chat({ initial, suggestions }: { initial: Msg[]; suggestions: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [state, action, pending] = useActionState(botAction, null);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.data) setMsgs((m) => [...m, { role: 'assistant', content: state.data.answer }]);
    if (state?.error) setMsgs((m) => [...m, { role: 'assistant', content: state.error! }]);
  }, [state]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs, pending]);

  function send(text: string) {
    if (!text.trim() || pending) return;
    setMsgs((m) => [...m, { role: 'user', content: text.trim() }]);
    setDraft('');
  }

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite" data-testid="chat-log">
        {msgs.length === 0 && <p className="bubble bot">Oi! Sou o atendente automático do Cashbacksmart. Pergunte sobre saldo, faturas, lojas ou como usar o app.</p>}
        {msgs.map((m, i) => (
          <p key={i} className={`bubble ${m.role === 'user' ? 'me' : 'bot'}`}>
            {m.content}
          </p>
        ))}
        {pending && <p className="bubble bot typing">Digitando…</p>}
        <div ref={endRef} />
      </div>
      {msgs.length < 2 && (
        <div className="row" style={{ gap: 8, margin: '10px 0' }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="btn ghost sm"
              onClick={() => {
                send(s);
                const fd = new FormData();
                fd.set('message', s);
                startTransition(() => action(fd));
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form ref={formRef} action={action} onSubmit={() => send(draft)} className="chat-form">
        <input name="message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva sua dúvida" aria-label="Mensagem" autoComplete="off" maxLength={1500} />
        <button className="btn" disabled={pending || !draft.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
