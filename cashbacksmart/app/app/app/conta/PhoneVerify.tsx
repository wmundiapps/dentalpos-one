'use client';

import { useActionState } from 'react';
import { sendPhoneCodeAction, verifyPhoneAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

export function PhoneVerify() {
  const [sent, sendAction, sending] = useActionState(sendPhoneCodeAction, null);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <form action={sendAction}>
        {sent?.error && <p className="alert error" role="alert" style={{ marginBottom: 10 }}>{sent.error}</p>}
        {sent?.ok && <p className="alert info" role="status" style={{ marginBottom: 10 }} data-testid="sms-status">{sent.ok}</p>}
        <button className="btn ghost sm" disabled={sending}>
          {sending ? 'Enviando…' : sent?.ok ? 'Enviar outro código' : 'Enviar código por SMS'}
        </button>
      </form>
      {sent?.ok && (
        <ActionForm action={verifyPhoneAction}>
          <div className="field">
            <label htmlFor="sms-code">Código recebido</label>
            <input id="sms-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </div>
          <Submit className="btn sm">Confirmar celular</Submit>
        </ActionForm>
      )}
    </div>
  );
}
