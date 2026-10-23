'use client';

import { useActionState } from 'react';
import { confirmTotpAction, startTotpAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

export function TotpSetup() {
  const [start, startAction, starting] = useActionState(startTotpAction, null);
  if (!start?.data) {
    return (
      <form action={startAction}>
        {start?.error && <p className="alert error">{start.error}</p>}
        <button className="btn" disabled={starting}>
          {starting ? 'Aguarde…' : 'Ativar verificação em duas etapas'}
        </button>
      </form>
    );
  }
  return (
    <ActionForm
      action={confirmTotpAction}
      render={(s) => (
        <div className="alert ok" data-testid="recovery-codes">
          <p>
            <strong>Pronto, está ativa.</strong> Guarde estes códigos de recuperação em lugar seguro. Cada um funciona uma vez, se você perder o celular:
          </p>
          <pre style={{ fontSize: '1rem', margin: '8px 0 0' }}>{s?.data.codes.join('\n')}</pre>
        </div>
      )}
    >
      <ol style={{ paddingLeft: 20 }}>
        <li>Abra o aplicativo autenticador e escaneie o QR.</li>
        <li>Digite o código de 6 números que aparecer.</li>
      </ol>
      <div className="qr" dangerouslySetInnerHTML={{ __html: start.data.svg }} />
      <p className="muted">
        Não consegue escanear? Digite a chave: <code data-testid="totp-secret">{start.data.secret}</code>
      </p>
      <div className="field">
        <label htmlFor="totp-code">Código do aplicativo</label>
        <input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
      </div>
      <Submit>Confirmar e ativar</Submit>
    </ActionForm>
  );
}
