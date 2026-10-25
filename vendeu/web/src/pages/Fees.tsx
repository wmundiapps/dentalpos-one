import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAsync, usePageTitle } from '../lib/hooks';
import { calcFeeCents, formatBRL, feeTable } from '@shared/fees';
import { moneyToCents } from '../lib/format';
import { ErrorState, Loading, PageHead } from '../components/ui';
import { MoneyField } from '../components/fields';

interface FeesResp { table: { label: string; feeCents: number }[]; capCents: number; removalFeeCents: number; rule: string }

export function FeeTableView() {
  const t = useAsync(() => api.get<FeesResp>('/fees'), []);
  const rows = t.data?.table ?? (t.error ? feeTable() : null);
  if (t.loading && !rows) return <Loading />;
  if (!rows) return <ErrorState error={t.error} onRetry={t.reload} />;
  return (
    <div className="table-wrap">
      <table className="fee-table">
        <caption className="sr-only">Comissão por faixa de valor da venda</caption>
        <thead><tr><th scope="col">Valor da venda (ou do aluguel)</th><th scope="col">Comissão</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.label}><th scope="row">{r.label}{r === rows[rows.length - 1] ? ' (R$ 100 + R$ 50 a cada R$ 1.000 ou fração)' : ''}</th><td>{r.label.startsWith('Acima') ? `a partir de ${formatBRL(r.feeCents)}` : formatBRL(r.feeCents)}</td></tr>)}
          <tr className="removal-row"><th scope="row">Retirar anúncio já publicado sem vender (taxa fixa)</th><td>{formatBRL(t.data?.removalFeeCents ?? 1000)}</td></tr>
        </tbody>
      </table>
      {t.data && t.data.capCents > 0 && <p className="small muted">Teto da comissão: {formatBRL(t.data.capCents)}.</p>}
    </div>
  );
}

const FAQ: [string, string][] = [
  ['Anunciar custa algo?', 'Não. Anunciar não custa nada: sem mensalidade, sem plano e sem taxa para publicar. A comissão só existe quando a venda se concluir.'],
  ['Quando recebo?', 'O comprador paga pelo Vendeu (Pix, via Mercado Pago) e o dinheiro fica retido. Você envia o produto (ou entrega em mãos, com o código de retirada). Quando o comprador recebe, começa o prazo de devolução de 7 dias. Passado o prazo sem devolução, o valor é repassado para a sua conta Mercado Pago, menos a comissão. Se o comprador não confirmar em 10 dias depois do envio, o recebimento é considerado automaticamente.'],
  ['E se o comprador devolver?', 'Dentro dos 7 dias ele pode pedir a devolução. Quando você confirma que o produto voltou, o Mercado Pago devolve 100% ao comprador e ninguém paga nada, nem comissão. O anúncio volta à vitrine. Se você não confirmar em 10 dias, a moderação decide.'],
  ['Por que não vejo o contato do comprador?', 'Para proteger os dois lados, a negociação acontece toda dentro do Vendeu. Telefone, e-mail e links são ocultados no chat e só aparecem no pedido depois do recebimento. Combinar ou pagar por fora tira a proteção do pagamento retido.'],
  ['E se eu retirar o anúncio?', 'Rascunho, anúncio recusado ou retirado pela moderação saem sem custo, e pausar/retomar também é de graça. Retirar um anúncio que já foi publicado, sem vender, tem taxa fixa de R$ 10,00 (Pix ou cartão, em até 7 dias). Não dá para retirar enquanto há pedido em andamento.'],
  ['E na locação?', 'Funciona igual: a comissão é calculada sobre o valor do aluguel combinado, uma vez, e descontada do repasse.'],
  ['E se eu atrasar a taxa de retirada?', 'Depois de 3 dias de atraso, a criação de novos anúncios fica bloqueada até a taxa ser paga. Seus anúncios atuais continuam no ar. Pagou, liberou.'],
  ['O comprador paga alguma taxa?', 'Não. O comprador paga só o preço combinado. Se devolver no prazo, o dinheiro volta integral.'],
  ['E se houver um problema?', 'Qualquer lado pode abrir uma disputa no pedido. O dinheiro continua retido e a moderação decide, com base nas informações do pedido, entre devolver ao comprador ou liberar ao vendedor.'],
];

export function Fees() {
  usePageTitle('Quanto custa vender?');
  const { config } = useApp();
  const removal = formatBRL(config?.removalFeeCents ?? 1000);
  const [price, setPrice] = useState('');
  const cents = moneyToCents(price);
  let fee = 0;
  try { if (cents >= 100) fee = calcFeeCents(cents, config?.feeCapCents ?? 0); } catch { fee = 0; }
  const examples = [100_00, 400_00, 1_200_00, 2_500_00, 5_000_00, 12_000_00];

  return (
    <div className="stack-l narrow">
      <PageHead title="Quanto custa vender?" sub="Anunciar não custa nada. A comissão só existe quando a venda se concluir." />

      <section className="panel calc" aria-labelledby="calc-t">
        <h2 id="calc-t">Calculadora</h2>
        <MoneyField label="Por quanto você vai vender (ou alugar)? Valor combinado do pedido" value={price} onChange={setPrice} />
        <div className="fee-live" aria-live="polite">
          {fee ? (<>
            <div>Comissão se a venda se concluir: <strong>{formatBRL(fee)}</strong></div>
            <div>Você recebe: <strong>{formatBRL(cents - fee)}</strong> <span className="small muted">(depois do recebimento e dos 7 dias de devolução)</span></div>
          </>) : <div className="muted">Digite um valor para ver a comissão e quanto você recebe.</div>}
        </div>
      </section>

      <section aria-labelledby="tab-t">
        <h2 id="tab-t">Tabela completa</h2>
        <p className="muted">Retirar um anúncio já publicado sem vender: <strong>{removal}</strong>, taxa fixa.</p>
        <FeeTableView />
      </section>

      <section aria-labelledby="ex-t">
        <h2 id="ex-t">Exemplos</h2>
        <ul className="examples">
          {examples.map((e) => <li key={e}>Venda de <strong>{formatBRL(e)}</strong> → comissão <strong>{formatBRL(calcFeeCents(e, config?.feeCapCents ?? 0))}</strong>, você recebe {formatBRL(e - calcFeeCents(e, config?.feeCapCents ?? 0))}</li>)}
        </ul>
      </section>

      <section aria-labelledby="faq-t">
        <h2 id="faq-t">Perguntas frequentes</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
        <p>Detalhes completos na <Link to="/legal/politica-de-taxas">Política de Taxas</Link>.</p>
      </section>

      <div className="row wrap"><Link to="/venda/anunciar" className="btn btn-accent btn-lg">Anunciar</Link><Link to="/venda" className="btn btn-outline btn-lg">Ir ao painel</Link></div>
    </div>
  );
}
