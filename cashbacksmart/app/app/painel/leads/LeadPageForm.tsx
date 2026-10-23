'use client';

import { createLeadPageAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

export function LeadPageForm() {
  return (
    <ActionForm action={createLeadPageAction} resetOnOk>
      <div className="field">
        <label htmlFor="lp-title">Título da oferta</label>
        <input id="lp-title" name="title" maxLength={80} placeholder="ex.: Ganhe R$ 20 de cashback na primeira visita" required />
      </div>
      <div className="field">
        <label htmlFor="lp-offer">Descrição</label>
        <textarea id="lp-offer" name="offer" maxLength={400} placeholder="Explique a oferta, o prazo e como usar." style={{ minHeight: 80 }} required />
      </div>
      <div className="field">
        <label htmlFor="lp-question">Pergunta para o cliente (opcional)</label>
        <input id="lp-question" name="question" maxLength={120} placeholder="ex.: Qual tratamento você procura?" />
      </div>
      <Submit>Criar página</Submit>
    </ActionForm>
  );
}
