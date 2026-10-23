'use client';

import { useActionState } from 'react';
import { cancelPurchaseAction } from '@/app/actions';

export function CancelButton({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(cancelPurchaseAction, null);
  if (state?.ok) return <span className="tag">Cancelada</span>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('Cancelar esta compra? O cashback ainda não usado será estornado do cliente.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <button className="linkbtn" disabled={pending} style={{ fontSize: '.85rem' }}>
        {pending ? 'Cancelando…' : 'Cancelar'}
      </button>
      {state?.error && <small style={{ color: 'var(--coral)', display: 'block' }}>{state.error}</small>}
    </form>
  );
}
