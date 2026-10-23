'use client';

import { useState } from 'react';
import { saveRuleAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

/** Convida a loja a criar uma promoção maior para clientes novos */
export function WelcomeSetup({ feePct }: { feePct: number }) {
  const [mode, setMode] = useState<'first' | 'window'>('first');
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState(mode === 'first' ? '30' : '20');
  const n = Number(value.replace(',', '.')) || 0;
  return (
    <section className="card" style={{ borderColor: 'var(--coin)', borderWidth: 2 }}>
      <h2>Atraia clientes novos com uma promoção de boas-vindas</h2>
      <p className="muted">Um cashback maior na primeira compra ou no primeiro mês faz o cliente experimentar sua loja. Depois vale a sua regra normal.</p>
      <ActionForm action={saveRuleAction}>
        <input type="hidden" name="title" value={mode === 'first' ? 'Boas-vindas: primeira compra' : 'Boas-vindas: primeiro mês'} />
        <input type="hidden" name="audience" value={mode} />
        <input type="hidden" name="windowDays" value="30" />
        <input type="hidden" name="expiresDays" value="60" />
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="seg" role="radiogroup" aria-label="Quando vale">
            <label>
              <input type="radio" name="wmode" checked={mode === 'first'} onChange={() => { setMode('first'); setValue('30'); }} />
              <span>Primeira compra</span>
            </label>
            <label>
              <input type="radio" name="wmode" checked={mode === 'window'} onChange={() => { setMode('window'); setValue('20'); }} />
              <span>Primeiro mês</span>
            </label>
          </div>
          <div className="seg" role="radiogroup" aria-label="Tipo">
            <label>
              <input type="radio" name="kind" value="percent" checked={kind === 'percent'} onChange={() => setKind('percent')} />
              <span>%</span>
            </label>
            <label>
              <input type="radio" name="kind" value="fixed" checked={kind === 'fixed'} onChange={() => setKind('fixed')} />
              <span>R$</span>
            </label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="w-value">{kind === 'percent' ? 'Cashback (%)' : 'Cashback por compra (R$)'}</label>
          <input id="w-value" name="value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          <small className="muted">
            {kind === 'percent'
              ? `Cliente novo ganha ${n}% ${mode === 'first' ? 'na primeira compra' : 'nas compras dos primeiros 30 dias'}. Nossa taxa: ${(n * feePct / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da venda, cobrada só quando ele usar o saldo.`
              : `Cliente novo ganha R$ ${value} ${mode === 'first' ? 'na primeira compra' : 'por compra nos primeiros 30 dias'}. Nossa taxa: ${feePct}% desse valor, só quando ele usar.`}
          </small>
        </div>
        <Submit>Criar promoção de boas-vindas</Submit>
      </ActionForm>
    </section>
  );
}
