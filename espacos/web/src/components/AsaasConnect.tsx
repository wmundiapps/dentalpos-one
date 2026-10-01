import { useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApp } from '../state';
import { errorText } from '../errors';

// Carteira Asaas do anfitrião: o SpaceHour cria a conta Asaas com os dados abaixo
// (o Asaas manda um e-mail para criar a senha e sacar) ou o anfitrião cola o Wallet ID da conta que já tem.
export function AsaasConnect({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const { me } = useApp();
  const [mode, setMode] = useState<'create' | 'wallet'>('create');
  const [f, setF] = useState({ taxId: me?.documentNumber ?? '', birthDate: '', phone: me?.phone ?? '', incomeValue: '', postalCode: '', address: '', addressNumber: '', complement: '', province: '' });
  const [walletId, setWalletId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCnpj = f.taxId.replace(/\D/g, '').length > 11;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function lookupCep(v: string) {
    const cep = v.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
      if (!r.ok) return;
      const d = await r.json() as { street?: string; neighborhood?: string };
      setF((x) => ({ ...x, address: x.address || d.street || '', province: x.province || d.neighborhood || '' }));
    } catch { /* sem internet para o CEP: preenche à mão */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'create') {
        await api('/me/asaas-account', { body: {
          taxId: f.taxId, birthDate: isCnpj ? undefined : f.birthDate, phone: f.phone, incomeValue: Number(f.incomeValue.replace(/\./g, '').replace(',', '.')) || 0,
          postalCode: f.postalCode, address: f.address, addressNumber: f.addressNumber, complement: f.complement || undefined, province: f.province,
        } });
      } else {
        await api('/me/asaas-account/wallet', { body: { walletId } });
      }
      onDone();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="asaas-connect" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>{t('asaas.tabCreate')}</button>
        <button type="button" className={mode === 'wallet' ? 'active' : ''} onClick={() => setMode('wallet')}>{t('asaas.tabWallet')}</button>
      </div>
      {mode === 'create' ? (
        <div className="form-grid">
          <p className="muted small span2">{t('asaas.createHelp')}</p>
          <label>{t('asaas.taxId')}<input required inputMode="numeric" value={f.taxId} onChange={set('taxId')} placeholder="000.000.000-00" /></label>
          {!isCnpj && <label>{t('asaas.birthDate')}<input required type="date" value={f.birthDate} onChange={set('birthDate')} /></label>}
          <label>{t('form.phone')}<input required inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="(44) 99999-0000" /></label>
          <label>{t('asaas.income')}<input required inputMode="decimal" value={f.incomeValue} onChange={set('incomeValue')} placeholder="5.000" /></label>
          <label>{t('asaas.cep')}<input required inputMode="numeric" value={f.postalCode} onChange={(e) => { set('postalCode')(e); lookupCep(e.target.value); }} placeholder="00000-000" /></label>
          <label>{t('asaas.address')}<input required value={f.address} onChange={set('address')} /></label>
          <label>{t('asaas.number')}<input required value={f.addressNumber} onChange={set('addressNumber')} /></label>
          <label>{t('asaas.complement')}<input value={f.complement} onChange={set('complement')} /></label>
          <label>{t('asaas.province')}<input required value={f.province} onChange={set('province')} /></label>
        </div>
      ) : (
        <div className="form-grid">
          <p className="muted small span2">{t('asaas.walletHelp')}</p>
          <label className="span2">Wallet ID<input required value={walletId} onChange={(e) => setWalletId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label>
        </div>
      )}
      {error && <p className="errors" role="alert">{error}</p>}
      <button className="btn btn-primary btn-big" disabled={busy}>{busy ? t('common.wait') : mode === 'create' ? t('asaas.submitCreate') : t('asaas.submitWallet')}</button>
    </form>
  );
}
