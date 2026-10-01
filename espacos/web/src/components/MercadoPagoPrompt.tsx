import { useCallback, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../errors';
import { NextStep } from './NextStep';

// Cadastro oficial do Mercado Pago (pede CPF ou CNPJ)
export const MP_SIGNUP_URL = 'https://www.mercadopago.com.br/hub/registration/landing';

/** Botão "Conectar": leva ao Mercado Pago; se não der, explica o motivo e o que fazer. */
export function useMpConnect() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  async function connect() {
    setError(null); setBusy(true);
    try {
      const { url } = await api<{ url: string }>('/me/payout-account/connect', { method: 'POST' });
      window.location.assign(url);
    } catch (e) {
      setBusy(false);
      setError({ code: (e as { code?: string }).code ?? '', text: errorText(e, t) });
    }
  }
  return { connect, busy, error };
}

export function MpConnectError({ error }: { error: { code: string; text: string } | null }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  if (!error) return null;
  return (
    <div className="notice warn mp-error" role="alert">
      <strong>{error.text}</strong>
      {error.code === 'email_not_verified' && (sent
        ? <p className="small">{t('verify.resent')}</p>
        : <p><button className="btn btn-outline small" onClick={() => api('/me/resend-verification', { body: {} }).then(() => setSent(true)).catch(() => setSent(true))}>{t('verify.resend')}</button></p>)}
    </div>
  );
}

// Janela: para receber as reservas o anfitrião precisa de conta no Mercado Pago conectada ao SpaceHour
export function MercadoPagoPrompt({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { connect, busy, error } = useMpConnect();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal mp-prompt" role="dialog" aria-modal="true" aria-labelledby="mp-prompt-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="mp-prompt-title">💳 {t('mp.title')}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <p>{t('mp.text')}</p>
        <ol className="mp-steps">
          <li><strong>{t('mp.step1')}</strong> {t('mp.step1Text')}</li>
          <li><strong>{t('mp.step2')}</strong> {t('mp.step2Text')}</li>
          <li><strong>{t('mp.step3')}</strong> {t('mp.step3Text')}</li>
        </ol>
        <p className="notice small">{t('mp.noCost')}</p>
        <div className="row gap wrap">
          <a className="btn btn-outline" href={MP_SIGNUP_URL} target="_blank" rel="noopener noreferrer">{t('mp.create')} ↗</a>
          <button className="btn btn-primary" onClick={connect} disabled={busy}>{busy ? t('mp.opening') : t('mp.connect')}</button>
          <button className="btn btn-ghost" onClick={onClose}>{t('mp.later')}</button>
        </div>
        <MpConnectError error={error} />
      </div>
    </div>
  );
}

/** Abre a janela se a conta Mercado Pago ainda não estiver conectada. Com `once`, no máximo uma vez por sessão para essa chave. */
export function useMercadoPagoPrompt() {
  const [open, setOpen] = useState<false | 'mp' | 'choose'>(false);
  const show = useCallback(async (once?: string) => {
    if (once) {
      try {
        if (sessionStorage.getItem(`mp_prompt_${once}`)) return;
        sessionStorage.setItem(`mp_prompt_${once}`, '1');
      } catch { /* sem armazenamento: mostra mesmo assim */ }
    }
    const st = await api<{ required: boolean; connected: boolean; anyConnected?: boolean; asaas?: { enabled: boolean } }>('/me/payout-account').catch(() => null);
    if (st?.required && !(st.anyConnected ?? st.connected)) setOpen(st.asaas?.enabled ? 'choose' : 'mp');
  }, []);
  return { show, modal: open === 'mp' ? <MercadoPagoPrompt onClose={() => setOpen(false)} /> : open === 'choose' ? <PayoutChoosePrompt onClose={() => setOpen(false)} /> : null };
}

// Janela com Asaas ligado: leva ao painel para escolher onde receber
function PayoutChoosePrompt({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <NextStep icon="💳" title={t('payout.promptTitle')} steps={[t('payout.promptStep1'), t('payout.promptStep2'), t('payout.promptStep3')]}
      actions={[{ label: t('payout.choose'), to: '/anfitriao#receber', onClick: onClose }, { label: t('mp.later'), onClick: onClose, primary: false }]} onClose={onClose} />
  );
}
