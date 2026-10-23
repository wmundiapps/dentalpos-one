'use client';

import { useState } from 'react';
import { decideClaimAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ClaimRow({ c }: { c: { id: string; customer: string; amount_cents: string; cashback_cents: string; created_at: string; receipt: string | null; has_photo?: boolean; claim_method?: string | null } }) {
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between">
        <span>
          <strong>{c.customer}</strong> enviou {c.receipt || 'uma nota'} de <strong>{brl(Number(c.amount_cents))}</strong>
          <small style={{ display: 'block' }}>
            Cashback a creditar: {brl(Number(c.cashback_cents))} · enviada em {new Date(c.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </small>
          {c.has_photo && (
            <a href={`/api/nota-foto/${c.id}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
              <img src={`/api/nota-foto/${c.id}`} alt="Foto da nota enviada pelo cliente" style={{ maxHeight: 140, borderRadius: 10, border: '1px solid var(--line)' }} />
            </a>
          )}
        </span>
      </div>
      {!rejecting ? (
        <div className="row">
          <ActionForm action={decideClaimAction}>
            <input type="hidden" name="purchaseId" value={c.id} />
            <input type="hidden" name="decision" value="approve" />
            <Submit className="btn sm">Confirmar compra</Submit>
          </ActionForm>
          <button className="btn danger sm" type="button" onClick={() => setRejecting(true)}>
            Recusar
          </button>
        </div>
      ) : (
        <ActionForm action={decideClaimAction}>
          <input type="hidden" name="purchaseId" value={c.id} />
          <input type="hidden" name="decision" value="reject" />
          <div className="field">
            <label htmlFor={`why-${c.id}`}>Motivo (o cliente vai ver)</label>
            <input id={`why-${c.id}`} name="reason" placeholder="ex.: compra não é deste cliente" required />
          </div>
          <div className="row">
            <Submit className="btn danger sm">Recusar nota</Submit>
            <button className="linkbtn" type="button" onClick={() => setRejecting(false)}>
              Voltar
            </button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
