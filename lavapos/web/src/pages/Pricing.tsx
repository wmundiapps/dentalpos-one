import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, Kpi, Loading, Money, NumberInput, Page, useAction, useLoad } from '../ui';
import { CAT_LABEL, CATS, brl } from '../format';

export default function Pricing() {
  const [washes, setWashes] = useState(0); const [margin, setMargin] = useState(0);
  const qs = `${washes ? `washesPerMonth=${washes}&` : ''}${margin ? `marginPct=${margin}` : ''}`;
  const p = useLoad<any>(`/finance/pricing?${qs}`, [washes, margin]); const svc = useLoad<any[]>('/r/service'); const [run] = useAction();
  if (!p.data) return <Loading error={p.error} />;
  const d = p.data;
  const apply = async (id: string, cat: string, cents: number) => { const s = svc.data?.find((x) => x.id === id); if (!s) return; await run(() => api(`/r/service/${id}`, { method: 'PUT', body: { prices: { ...s.data.prices, [cat]: cents } } }), 'Preço atualizado.'); await svc.reload(); await p.reload(); };
  return (
    <Page title="Precificação e lucro" sub="Preço certo a partir do custo real: materiais, aluguel, funcionários, despesas fixas, impostos e taxas">
      <Card title="Simule">
        <div className="grid g3"><NumberInput label={`Lavagens por mês (real nos últimos 30 dias: ${d.inputs.realWashesLast30d})`} value={washes || d.inputs.washesPerMonth} onChange={setWashes} min={1} />
          <NumberInput label="Margem de lucro desejada (%)" value={margin || d.inputs.marginPct} onChange={setMargin} min={0} max={90} />
          <div className="kpi"><b><Money cents={d.inputs.fixedMonthlyCents} /></b><span>Despesas fixas por mês (cadastre em Financeiro › Despesas, marcando "repete todo mês")</span></div></div>
        <p className="muted small">Descontados: impostos {d.inputs.taxPct}% · taxa de cartão {d.inputs.cardFeePct}% · comissão da plataforma {d.inputs.platformFeePct}% (ajuste impostos e taxa em Configurações).</p>
      </Card>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Custo fixo por lavagem" value={<Money cents={d.fixedPerWashCents} />} /><Kpi label="Ponto de equilíbrio (lavagens/mês)" value={d.breakEvenWashes ?? '—'} tone="warn" />
        <Kpi label="Lucro projetado no mês" value={<Money cents={d.projectedProfitCents} />} tone={d.projectedProfitCents >= 0 ? 'ok' : 'bad'} /><Kpi label="Lavagens para a meta de lucro" value={d.washesForTargetProfit ?? '—'} />
      </div>
      {d.services.map((s: any) => (
        <Card key={s.id} title={s.name}><div className="scroll"><table><thead><tr><th>Categoria</th><th>Custo</th><th>Preço atual</th><th>Margem atual</th><th>Sugerido</th><th /></tr></thead><tbody>
          {CATS.map((c) => { const x = s.byCategory[c]; const low = x.currentMarginPct < (margin || d.inputs.marginPct); return (
            <tr key={c}><td>{CAT_LABEL[c]}</td><td>{brl(x.costCents)}</td><td>{brl(x.currentCents)}</td><td><Badge tone={low ? 'bad' : 'ok'}>{x.currentMarginPct}%</Badge></td><td><b>{brl(x.suggestedCents)}</b></td>
              <td>{x.suggestedCents > 0 && x.suggestedCents !== x.currentCents && <button className="sm" onClick={() => apply(s.id, c, x.suggestedCents)}>Aplicar</button>}</td></tr>); })}</tbody></table></div></Card>))}
      <p className="muted small">Custo = materiais (receita do serviço × custo do estoque) + outros custos diretos + parte das despesas fixas rateada por tamanho do veículo. Sugerido = custo ÷ (1 − margem − impostos − taxas).</p>
    </Page>
  );
}
