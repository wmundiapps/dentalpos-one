'use client';

import { useState } from 'react';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Calculator() {
  const [sales, setSales] = useState(20000);
  const [rate, setRate] = useState(5);
  const cashback = (sales * rate) / 100;
  const used = cashback * 0.7;
  const fee = used * 0.2;
  const total = 49.9 + fee;
  return (
    <div className="lp-calc">
      <h3>Quanto custa para a sua loja</h3>
      <label htmlFor="calc-sales">
        Vendas com cashback por mês: <strong>{brl(sales)}</strong>
      </label>
      <input id="calc-sales" type="range" min={1000} max={200000} step={1000} value={sales} onChange={(e) => setSales(Number(e.target.value))} />
      <label htmlFor="calc-rate">
        Cashback oferecido: <strong>{rate}%</strong>
      </label>
      <input id="calc-rate" type="range" min={1} max={20} step={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      <dl>
        <div>
          <dt>Cashback que você oferece</dt>
          <dd>{brl(cashback)}</dd>
        </div>
        <div>
          <dt>Usado pelos clientes (estimativa de 70%)</dt>
          <dd>{brl(used)}</dd>
        </div>
        <div>
          <dt>Taxa de 20% sobre o usado</dt>
          <dd>{brl(fee)}</dd>
        </div>
        <div>
          <dt>Mensalidade (a partir do 7º mês)</dt>
          <dd>{brl(49.9)}</dd>
        </div>
        <div className="lp-calc-total">
          <dt>Fatura mensal a partir do 7º mês</dt>
          <dd>{brl(total)}</dd>
        </div>
      </dl>
      <small>Nos 6 primeiros meses você paga só a taxa: {brl(fee)}. O cashback não sai do seu caixa na hora: vira desconto quando o cliente volta.</small>
    </div>
  );
}
