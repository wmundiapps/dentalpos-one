'use client';

import { useState } from 'react';
import { ActionForm, Submit } from '@/components/ui';
import { saveRuleAction } from '@/app/actions';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function RuleForm({ feePct = 20 }: { feePct?: number }) {
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent');
  const [audience, setAudience] = useState<'all' | 'first' | 'window'>('all');
  const [val, setVal] = useState('');
  const n = Number(val.replace(',', '.')) || 0;
  return (
    <ActionForm action={saveRuleAction} resetOnOk>
      <div className="field">
        <label htmlFor="r-title">Nome da regra</label>
        <input id="r-title" name="title" placeholder="ex.: Terça em dobro" required />
      </div>
      <div className="field">
        <label htmlFor="r-aud">Para quem</label>
        <select id="r-aud" name="audience" value={audience} onChange={(e) => setAudience(e.target.value as any)}>
          <option value="all">Todos os clientes</option>
          <option value="first">Clientes novos: só na primeira compra</option>
          <option value="window">Clientes novos: nos primeiros dias</option>
        </select>
      </div>
      {audience === 'window' && (
        <div className="field">
          <label htmlFor="r-win">Quantos dias depois da primeira compra</label>
          <input id="r-win" name="windowDays" type="number" min={1} max={365} defaultValue={30} />
        </div>
      )}
      <div className="field">
        <span style={{ display: 'block', fontWeight: 600, fontSize: '.92rem', marginBottom: 6 }}>Tipo</span>
        <div className="seg" role="radiogroup" aria-label="Tipo">
          <label>
            <input type="radio" name="kind" value="percent" checked={kind === 'percent'} onChange={() => setKind('percent')} />
            <span>% da compra</span>
          </label>
          <label>
            <input type="radio" name="kind" value="fixed" checked={kind === 'fixed'} onChange={() => setKind('fixed')} />
            <span>Valor fixo R$</span>
          </label>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="r-value">{kind === 'percent' ? 'Percentual (%)' : 'Valor por compra (R$)'}</label>
          <input id="r-value" name="value" inputMode="decimal" placeholder={kind === 'percent' ? '5' : '3,00'} required value={val} onChange={(e) => setVal(e.target.value)} />
          <small className="muted">
            {kind === 'percent'
              ? `Nossa taxa: ${(n * feePct / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da venda, cobrada só quando o cliente usar o saldo.`
              : `Nossa taxa: ${feePct}% desse valor, cobrada só quando o cliente usar o saldo.`}
          </small>
        </div>
        <div className="field">
          <label htmlFor="r-min">Compra mínima (R$, opcional)</label>
          <input id="r-min" name="minPurchase" inputMode="decimal" placeholder="0,00" />
        </div>
        {kind === 'percent' && (
          <div className="field">
            <label htmlFor="r-max">Teto por compra (R$, opcional)</label>
            <input id="r-max" name="maxCashback" inputMode="decimal" placeholder="sem teto" />
          </div>
        )}
        <div className="field">
          <label htmlFor="r-release">Carência para liberar (dias)</label>
          <input id="r-release" name="releaseDays" type="number" min={0} max={60} defaultValue={0} />
          <small className="muted">Use se você aceita trocas/devoluções.</small>
        </div>
        <div className="field">
          <label htmlFor="r-exp">Validade do saldo (dias)</label>
          <input id="r-exp" name="expiresDays" type="number" min={30} max={730} defaultValue={180} />
          <small className="muted">Mínimo de 30 dias. Para clientes Premium, o saldo nunca vence.</small>
        </div>
        <div className="field">
          <label htmlFor="r-start">Começa em (opcional)</label>
          <input id="r-start" name="startsAt" type="date" />
        </div>
        <div className="field">
          <label htmlFor="r-end">Termina em (opcional)</label>
          <input id="r-end" name="endsAt" type="date" />
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: '.92rem', marginBottom: 6 }}>Dias da semana</legend>
        <div className="days">
          {DAYS.map((d, i) => (
            <label key={d}>
              <input type="checkbox" name="weekdays" value={i} defaultChecked />
              <span>{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Submit>Salvar regra</Submit>
    </ActionForm>
  );
}
