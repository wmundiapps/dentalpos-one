import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { useApp } from '../state';
import { StarInput } from './Stars';
import { errorText } from '../errors';

type Kind = 'rating' | 'suggestion' | 'bug' | 'other';
const KINDS: Kind[] = ['rating', 'suggestion', 'bug', 'other'];

// Botão flutuante em todas as telas: avaliar o app, sugerir melhorias, relatar erros.
export function FeedbackWidget() {
  const { t, locale } = useI18n();
  const { me } = useApp();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('rating');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const onOpen = (e: Event) => { setKind(((e as CustomEvent).detail as Kind) ?? 'rating'); setOpen(true); setState('idle'); };
    window.addEventListener('open-feedback', onOpen);
    return () => window.removeEventListener('open-feedback', onOpen);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending'); setError('');
    try {
      await api('/feedback', { body: {
        kind, rating: kind === 'rating' && rating ? rating : undefined, message,
        email: !me && email ? email : undefined, page: loc.pathname, locale,
      } });
      setState('sent'); setMessage(''); setRating(0);
    } catch (err) {
      setError(errorText(err, t)); setState('idle');
    }
  }

  const canSend = kind === 'rating' ? rating > 0 || message.trim().length >= 3 : message.trim().length >= 3;

  return (
    <>
      <button type="button" className="feedback-fab" onClick={() => { setOpen(true); setState('idle'); }} aria-haspopup="dialog">💬 <span>{t('feedback.button')}</span></button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="fb-title" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h2 id="fb-title">{t('feedback.title')}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} aria-label={t('common.close')}>✕</button>
            </div>
            {state === 'sent' ? <p className="notice success">✅ {t('feedback.thanks')}</p> : (
              <form onSubmit={submit}>
                <div className="segmented" role="tablist">
                  {KINDS.map((k) => <button type="button" role="tab" aria-selected={kind === k} key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(`feedback.kind.${k}` as DictKey)}</button>)}
                </div>
                {kind === 'rating' && <StarInput value={rating} onChange={setRating} label={t('feedback.rating')} />}
                <label>{t('feedback.message')}
                  <textarea value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} placeholder={t(`feedback.placeholder.${kind}` as DictKey)} />
                </label>
                {!me && <label>{t('feedback.email')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
                {error && <p className="errors small" role="alert">{error}</p>}
                <button className="btn btn-primary" disabled={!canSend || state === 'sending'}>{state === 'sending' ? t('common.wait') : t('feedback.send')}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
