'use client';

import { ActionForm, Submit } from '@/components/ui';
import { redemptionCodeAction } from '@/app/actions';

export function RedeemBox({ businessId }: { businessId: string }) {
  return (
    <ActionForm
      action={redemptionCodeAction}
      render={(s) => (
        <div className="alert info" role="status" style={{ marginBottom: 12 }}>
          <div>Informe este código no caixa para usar até {s?.data.max}:</div>
          <div className="code-big" data-testid="redemption-code">
            {s?.data.code}
          </div>
          <small>Vale por 15 minutos.</small>
        </div>
      )}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <Submit className="btn coin">Usar meu saldo nesta loja</Submit>
    </ActionForm>
  );
}
