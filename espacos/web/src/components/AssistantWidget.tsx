import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { errorText } from '../errors';
import { useI18n } from '../i18n';

// Assistente virtual (IA) para dúvidas. A conversa fica na sessão do navegador
// e é gravada no servidor; a equipe recebe a transcrição por e-mail.
type Msg = { role: 'user' | 'assistant'; content: string };
const KEY = 'sh_ai_chat';

function load(): { id?: string; msgs: Msg[] } {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '') as { id?: string; msgs: Msg[] }; } catch { return { msgs: [] }; }
}

export function AssistantWidget() {
  const { t, locale } = useI18n();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(chat)); } catch { /* ignore */ } }, [chat]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [chat, busy, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText(''); setError(''); setBusy(true);
    setChat((c) => ({ ...c, msgs: [...c.msgs, { role: 'user', content: message }] }));
    try {
      const r = await api<{ conversationId: string; reply: string }>('/assistant', { body: { conversationId: chat.id, message, page: loc.pathname, locale } });
      setChat((c) => ({ id: r.conversationId, msgs: [...c.msgs, { role: 'assistant', content: r.reply }] }));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="assistant-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>🤖 <span>{t('assistant.button')}</span></button>
      {open && (
        <section className="assistant-panel" role="dialog" aria-label={t('assistant.title')}>
          <header className="row between">
            <strong>{t('assistant.title')}</strong>
            <span className="row gap">
              {chat.msgs.length > 0 && <button type="button" className="btn-link small" onClick={() => { setChat({ msgs: [] }); setError(''); }}>{t('assistant.new')}</button>}
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} aria-label={t('common.close')}>✕</button>
            </span>
          </header>
          <div className="assistant-msgs">
            <div className="assistant-msg bot">{t('assistant.hello')}</div>
            {chat.msgs.map((m, i) => <div key={i} className={`assistant-msg ${m.role === 'user' ? 'me' : 'bot'}`}>{m.content}</div>)}
            {busy && <div className="assistant-msg bot typing">…</div>}
            {error && <p className="errors small">{error}</p>}
            <div ref={end} />
          </div>
          <form className="assistant-form" onSubmit={send}>
            <textarea value={text} maxLength={2000} rows={2} placeholder={t('assistant.placeholder')} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
            <button className="btn btn-primary" disabled={busy || !text.trim()}>{t('assistant.send')}</button>
          </form>
          <p className="assistant-privacy">{t('assistant.privacy')}</p>
        </section>
      )}
    </>
  );
}
