import { useState } from 'react';
import { api } from '../api';
import { errorText } from '../errors';
import { useI18n } from '../i18n';
import { isBookingPath } from '../journey';
import { useApp } from '../state';
import { NextStep, type NextStepAction } from './NextStep';

/**
 * Caixa do código de 6 números do e-mail. As mensagens (erro, código reenviado)
 * aparecem logo abaixo do botão que a pessoa acabou de tocar.
 */
export function EmailCodeForm({ onVerified, autoFocus, className = '' }: { onVerified?: () => void; autoFocus?: boolean; className?: string }) {
  const { t } = useI18n();
  const { refreshMe } = useApp();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true); setMsg(null);
    try {
      await api('/me/resend-verification', { body: {} });
      setMsg({ ok: true, text: t('verify.codeSentAgain') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, t) });
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api('/me/verify-code', { body: { code } });
      await refreshMe();
      onVerified?.();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`email-code ${className}`} onSubmit={confirm}>
      <span className="row gap wrap email-code-row">
        <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="000000" autoFocus={autoFocus}
          value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setMsg(null); }} aria-label={t('verify.codeLabel')} />
        <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? t('common.wait') : t('verify.confirm')}</button>
        <button type="button" className="btn btn-link" disabled={busy} onClick={resend}>{t('verify.resendCode')}</button>
      </span>
      {msg && <p className={`small email-code-msg ${msg.ok ? 'ok' : 'errors'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </form>
  );
}

/** Janela "Conta confirmada!": procurar um espaço / anunciar (ou voltar para a reserva). */
export function AccountReady({ next, onClose, onLeave = onClose }: { next?: string | null; onClose: () => void; onLeave?: () => void }) {
  const { t } = useI18n();
  const actions: NextStepAction[] = [
    isBookingPath(next) ? { label: t('journey.backToBooking'), to: next!, onClick: onLeave } : { label: t('welcome.search'), to: '/', onClick: onLeave },
    { label: t('welcome.host'), to: '/anfitriao/novo', onClick: onLeave },
  ];
  return <NextStep icon="🎉" title={t('welcome.title')} actions={actions} onClose={onClose}>{t('welcome.body')}</NextStep>;
}
