'use client';

import { useState } from 'react';
import { claimAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';
import { QrScan } from '@/components/QrScan';

const isNfce = (t: string) => /\d{44}/.test(t.replace(/\s/g, ''));

export function ClaimForm() {
  const [nfce, setNfce] = useState('');
  return (
    <ActionForm action={claimAction} className="card" resetOnOk>
      <div className="field">
        <label htmlFor="c-nfce">QR ou chave da nota</label>
        <input id="c-nfce" name="nfce" value={nfce} onChange={(e) => setNfce(e.target.value)} placeholder="Leia o QR ou digite os 44 números da chave" autoComplete="off" />
        <div style={{ marginTop: 8 }}>
          <QrScan onCode={setNfce} label="Ler QR do cupom" accept={isNfce} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-amount">Valor total da nota (R$)</label>
        <input id="c-amount" name="amount" inputMode="decimal" placeholder="0,00" />
      </div>
      <Submit pendingText="Enviando…">Enviar nota</Submit>
    </ActionForm>
  );
}
