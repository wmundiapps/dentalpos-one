import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/app';
import { useAsync, usePageTitle } from '../lib/hooks';
import { calcFeeCents, formatBRL, feeTable } from '@shared/fees';
import { moneyToCents } from '../lib/format';
import { ErrorState, Loading, PageHead } from '../components/ui';
import { MoneyField } from '../components/fields';

interface FeesResp { table: { label: string; feeCents: number }[]; capCents: number; rule: string }

export function FeeTableView() {
  const t = useAsync(() => api.get<FeesResp>('/fees'), []);
  const rows = t.data?.table ?? (t.error ? feeTable() : null);
  if (t.loading && !rows) return <Loading />;
  if (!rows) return <ErrorState error={t.error} onRetry={t.reload} />;
  return (
    <div className="table-wrap">
      <table className="fee-table">
        <caption className="sr-only">Taxa de sucesso por faixa de valor</caption>
        <thead><tr><th scope="col">Valor do negócio</th><th scope="col">Taxa</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.label}><th scope="row">{r.label}{r === rows[rows.length - 1] ? ' (R$ 100 + R$ 50 a cada R$ 1.000 ou fração)' : ''}</th><td>{r.label.startsWith('Acima') ? `a partir de ${formatBRL(r.feeCents)}` : formatBRL(r.feeCents)}</td></tr>)}
        </tbody>
      </table>
      {t.data && t.data.capCents > 0 && <p className="small muted">Teto da taxa: {formatBRL(t.data.capCents)}.</p>}
    </div>
  );
}

const FAQ: [string, string][] = [
  ['Anunciar custa algo?', 'Não. Criar e manter anúncios no Vendeu é grátis, sem mensalidade e sem limite de tempo.'],
  ['E se eu não vender?', 'Retire grátis. Em "Meus anúncios", use "Retirar" e escolha "Não vendi". Nenhuma taxa é cobrada.'],
  ['Quando eu pago?', 'Ao marcar como vendido. Você informa o valor fechado, o anúncio sai do ar na hora e você paga a taxa por Pix ou cartão no prazo indicado no checkout.'],
  ['E na locação?', 'Funciona igual: a taxa é calculada sobre o valor do aluguel fechado e cobrada quando você marca como alugado e retira o anúncio.'],
  ['E se eu atrasar o pagamento?', 'Depois do vencimento, a criação de novos anúncios fica bloqueada até a taxa ser paga. Seus anúncios atuais continuam no ar. Pagou, liberou.'],
  ['O comprador paga alguma coisa ao Vendeu?', 'Nunca. Quem compra não paga nada ao Vendeu. O dinheiro do negócio vai direto de você para o comprador, sem passar pelo Vendeu.'],
  ['Posso contestar um valor ou uma cobrança?', 'Sim. Se houver erro ou se o comprador discordar do valor informado, o caso é analisado pela equipe. Escreva para suporte@vendeu.app com o número do recibo.'],
  ['Posso informar um valor menor para pagar menos?', 'Não. O valor informado precisa ser verdadeiro. Valores muito abaixo do anunciado vão para análise, e o comprador também pode confirmar ou contestar o valor.'],
];

export function Fees() {
  usePageTitle('Quanto custa vender?');
  const { config } = useApp();
  const [price, setPrice] = useState('');
  const cents = moneyToCents(price);
  let fee = 0;
  try { if (cents >= 100) fee = calcFeeCents(cents, config?.feeCapCents ?? 0); } catch { fee = 0; }
  const examples = [100_00, 400_00, 1_200_00, 2_500_00, 5_000_00, 12_000_00];

  return (
    <div className="stack-l narrow">
      <PageHead title="Quanto custa vender?" sub="Anunciar é grátis. Você só paga uma taxa de sucesso quando vende ou aluga e retira o anúncio." />

      <section className="panel calc" aria-labelledby="calc-t">
        <h2 id="calc-t">Calculadora</h2>
        <MoneyField label="Por quanto você vai vender (ou alugar)?" value={price} onChange={setPrice} />
        <div className="fee-live" aria-live="polite">
          {fee ? (<>
            <div>Taxa do Vendeu: <strong>{formatBRL(fee)}</strong></div>
            <div>Você recebe: <strong>{formatBRL(cents - fee)}</strong></div>
          </>) : <div className="muted">Digite um valor para ver a taxa.</div>}
        </div>
      </section>

      <section aria-labelledby="tab-t">
        <h2 id="tab-t">Tabela completa</h2>
        <FeeTableView />
      </section>

      <section aria-labelledby="ex-t">
        <h2 id="ex-t">Exemplos</h2>
        <ul className="examples">
          {examples.map((e) => <li key={e}>Vendeu por <strong>{formatBRL(e)}</strong> → taxa <strong>{formatBRL(calcFeeCents(e, config?.feeCapCents ?? 0))}</strong>, você recebe {formatBRL(e - calcFeeCents(e, config?.feeCapCents ?? 0))}</li>)}
        </ul>
      </section>

      <section aria-labelledby="faq-t">
        <h2 id="faq-t">Perguntas frequentes</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
        <p>Detalhes completos na <Link to="/legal/politica-de-taxas">Política de Taxas</Link>.</p>
      </section>

      <div className="row wrap"><Link to="/venda/anunciar" className="btn btn-accent btn-lg">Anunciar grátis</Link><Link to="/venda" className="btn btn-outline btn-lg">Ir ao painel</Link></div>
    </div>
  );
}
