import { useCallback, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../errors';

// Site oficial do Mercado Pago (tem o botão "Criar conta")
const MP_SIGNUP_URL = 'https://www.mercadopago.com.br/';

// Janela: para receber as reservas o anfitrião precisa de conta no Mercado Pago conectada ao SpaceHour
export function MercadoPagoPrompt({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState('');
  async function connect() {
    setError('');
    try { window.location.assign((await api<{ url: string }>('/me/payout-account/connect', { method: 'POST' })).url); } catch (e) { setError(errorText(e, t)); }
  }
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
          <button className="btn btn-primary" onClick={connect}>{t('mp.connect')}</button>
          <button className="btn btn-ghost" onClick={onClose}>{t('mp.later')}</button>
        </div>
        {error && <p className="errors small">{error}</p>}
      </div>
    </div>
  );
}

/** Abre a janela se a conta Mercado Pago ainda não estiver conectada. Com `once`, no máximo uma vez por sessão para essa chave. */
export function useMercadoPagoPrompt() {
  const [open, setOpen] = useState(false);
  const show = useCallback(async (once?: string) => {
    if (once) {
      try {
        if (sessionStorage.getItem(`mp_prompt_${once}`)) return;
        sessionStorage.setItem(`mp_prompt_${once}`, '1');
      } catch { /* sem armazenamento: mostra mesmo assim */ }
    }
    const st = await api<{ required: boolean; connected: boolean }>('/me/payout-account').catch(() => null);
    if (st?.required && !st.connected) setOpen(true);
  }, []);
  return { show, modal: open ? <MercadoPagoPrompt onClose={() => setOpen(false)} /> : null };
}
