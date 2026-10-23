'use client';

import { adminLeadPageAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';
import { CategorySelect, StateSelect } from '@/components/fields';

export function AdminLeadForm() {
  return (
    <ActionForm action={adminLeadPageAction} resetOnOk>
      <div className="field">
        <label htmlFor="al-title">Título</label>
        <input id="al-title" name="title" maxLength={80} placeholder="ex.: Academias em Maringá com cashback" required />
      </div>
      <div className="field">
        <label htmlFor="al-offer">Oferta</label>
        <textarea id="al-offer" name="offer" maxLength={400} required style={{ minHeight: 80 }} />
      </div>
      <div className="field">
        <label htmlFor="al-question">Pergunta (opcional)</label>
        <input id="al-question" name="question" maxLength={120} />
      </div>
      <CategorySelect prefix="al" />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="al-city">Cidade (vazio = estado inteiro)</label>
          <input id="al-city" name="city" />
        </div>
        <div style={{ width: 110 }}>
          <StateSelect prefix="al" />
        </div>
      </div>
      <Submit>Criar página</Submit>
    </ActionForm>
  );
}
