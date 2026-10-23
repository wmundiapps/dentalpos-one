'use client';

import { useEffect, useState } from 'react';
import { purchaseAction } from '@/app/actions';
import { PendingProvider, Submit, useKeepForm } from '@/components/ui';
import { QrScan } from '@/components/QrScan';

const isNfce = (t: string) => /\d{44}/.test(t.replace(/\s/g, ''));
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PurchaseForm() {
  const { state, pending, ref, onSubmit } = useKeepForm(purchaseAction);
  const [useBalance, setUseBalance] = useState(false);
  const [customer, setCustomer] = useState('');
  const [nfce, setNfce] = useState('');
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setUseBalance(false);
      setCustomer('');
      setNfce('');
    }
  }, [state, ref]);
  const r = state?.data;
  return (
    <>
      {r && (
        <section className="receipt" role="status" aria-live="polite" data-testid="purchase-result">
          <p className="muted" style={{ margin: 0 }}>Compra registrada para {r.customerName}</p>
          <div className="amount green">+{brl(r.cashbackCents)}</div>
          <p style={{ margin: '4px 0 0' }}>de cashback{r.ruleTitle ? ` (${r.ruleTitle})` : ''}</p>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            <li>Valor da compra: {brl(r.amountCents)}</li>
            {r.redeemedCents > 0 && <li>Saldo usado pelo cliente: −{brl(r.redeemedCents)}</li>}
            <li>
              <strong>Cobrar do cliente: {brl(r.paidCents)}</strong>
            </li>
          </ul>
          {r.merged && <p className="alert info" style={{ marginTop: 10 }}>O cliente já tinha enviado esta nota pelo app. Confirmamos a mesma compra, sem duplicar.</p>}
          {r.warning && (
            <p className="alert warn" style={{ marginTop: 10 }}>
              {r.warning}
            </p>
          )}
        </section>
      )}
      <PendingProvider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className="card" noValidate style={r ? { marginTop: 24 } : undefined}>
        {state?.error && (
          <p className="alert error" role="alert" style={{ marginBottom: 14 }}>
            {state.error}
          </p>
        )}
        <div className="field">
          <label htmlFor="f-customer">Cliente</label>
          <input id="f-customer" name="customer" required autoComplete="off" placeholder="Código, CPF, celular ou e-mail" autoFocus value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <QrScan onCode={setCustomer} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="f-amount">Valor da compra (R$)</label>
          <input id="f-amount" name="amount" inputMode="decimal" required placeholder="0,00" style={{ fontSize: '1.4rem', fontWeight: 700 }} />
        </div>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={useBalance} onChange={(e) => setUseBalance(e.target.checked)} />
            <span>Cliente quer usar o saldo</span>
          </label>
        </div>
        {useBalance && (
          <div className="field">
            <label htmlFor="f-code">Código de resgate (6 números do app do cliente)</label>
            <input id="f-code" name="redemptionCode" inputMode="numeric" maxLength={6} required />
          </div>
        )}
        <div className="field">
          <label htmlFor="f-nfce">Nota fiscal (opcional, evita lançamento em dobro)</label>
          <input id="f-nfce" name="nfce" autoComplete="off" placeholder="Leia o QR do cupom ou cole a chave de 44 números" value={nfce} onChange={(e) => setNfce(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <QrScan onCode={setNfce} label="Ler QR da nota fiscal" accept={isNfce} />
          </div>
        </div>
        <Submit className="btn block" pendingText="Registrando…">
          Registrar compra
        </Submit>
      </form>
      </PendingProvider>
    </>
  );
}
