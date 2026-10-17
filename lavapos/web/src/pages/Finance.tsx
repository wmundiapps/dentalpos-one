import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, Field, Kpi, Loading, Modal, Money, MoneyInput, Page, Select, Tabs, Text, Toggle, useAction, useLoad } from '../ui';
import { brl, dmy, todayIso } from '../format';
import { waLink } from '../format';

const EXP_CATS = ['aluguel', 'salarios', 'energia', 'agua', 'impostos', 'marketing', 'manutencao', 'materiais', 'outros'];
const METHOD: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', cheque: 'Cheque', asaas_pix: 'Pix online', asaas_cartao: 'Cartão online', asaas_boleto: 'Boleto' };

export default function Finance() {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [tab, setTab] = useState<'resumo' | 'recebimentos' | 'despesas' | 'notas'>('resumo');
  const sum = useLoad<any>(`/finance/summary?month=${month}`, [month]);
  return (
    <Page title="Financeiro" sub="Recebimentos, despesas, lucro e notas fiscais" actions={<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 170 }} />}>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'resumo', label: 'Resumo' }, { key: 'recebimentos', label: 'Recebimentos' }, { key: 'despesas', label: 'Despesas' }, { key: 'notas', label: 'Notas fiscais' }]} />
      {tab === 'resumo' && (!sum.data ? <Loading error={sum.error} /> : (<>
        <div className="grid g4"><Kpi label="Recebido" value={<Money cents={sum.data.receivedCents} />} tone="ok" /><Kpi label="A receber" value={<Money cents={sum.data.pendingCents} />} /><Kpi label="Despesas do mês" value={<Money cents={sum.data.expensesCents} />} /><Kpi label="Resultado" value={<Money cents={sum.data.profitCents} />} tone={sum.data.profitCents >= 0 ? 'ok' : 'bad'} /></div>
        <Card title="Comissão da plataforma (10% do valor das lavagens)"><p>Total do mês: <b><Money cents={sum.data.platformFeeCents} /></b>{sum.data.platformFeeDueCents > 0 && <> · a repassar (recebido fora do Asaas): <b><Money cents={sum.data.platformFeeDueCents} /></b></>}</p><p className="muted small">Pagamentos pelo Asaas já são divididos automaticamente. Dinheiro, maquininha e Pix direto entram na fatura mensal da plataforma.</p></Card>
        <Card title="Por forma de pagamento">{sum.data.byMethod.map((m: any) => <div key={m.method} className="row between check-row"><span>{METHOD[m.method] ?? m.method}</span><b><Money cents={m.total} /></b></div>)}</Card>
        <p className="muted small">Entregas no mês: {sum.data.ordersDelivered} · Despesas fixas: {brl(sum.data.fixedExpensesCents)}</p></>))}
      {tab === 'recebimentos' && <Payments month={month} onChange={sum.reload} />}
      {tab === 'despesas' && <Expenses month={month} onChange={sum.reload} />}
      {tab === 'notas' && <Invoices />}
    </Page>
  );
}

function Payments({ month, onChange }: { month: string; onChange: () => void }) {
  const p = useLoad<any[]>(`/finance/payments?month=${month}`, [month]); const [run] = useAction();
  if (!p.data) return <Loading error={p.error} />;
  const overdue = (x: any) => x.data.status === 'pendente' && x.createdAt.slice(0, 10) < todayIso();
  return (<div className="card scroll"><table><thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Valor</th><th>Status</th><th /></tr></thead><tbody>
    {p.data.map((x) => (<tr key={x.id}><td>{dmy(x.data.paidAt ?? x.createdAt)}</td><td>{x.data.customerName}{x.data.kind === 'mensalidade_clube' && <> <Badge tone="info">clube</Badge></>}</td><td>{METHOD[x.data.method] ?? x.data.method}</td><td><Money cents={x.data.amountCents} /></td>
      <td><Badge tone={x.data.status === 'pago' ? 'ok' : overdue(x) ? 'bad' : 'warn'}>{overdue(x) ? 'em atraso' : x.data.status}</Badge></td>
      <td className="nowrap">{x.data.status === 'pendente' && <>
        <button className="sm" onClick={async () => { await run(() => api(`/finance/payments/${x.id}/paid`, { body: {} }), 'Baixa registrada.'); await p.reload(); onChange(); }}>Dar baixa</button>
        {overdue(x) && x.data.invoiceUrl && <a className="btn sm danger" href={waLink('', `Olá! Sua cobrança está em atraso. Segue o link para pagar: ${x.data.invoiceUrl}`)} target="_blank" rel="noreferrer">Cobrar</a>}</>}</td></tr>))}
  </tbody></table>{p.data.length === 0 && <p className="muted">Nenhum recebimento neste mês.</p>}</div>);
}

function Expenses({ month, onChange }: { month: string; onChange: () => void }) {
  const ex = useLoad<any[]>('/r/expense'); const [add, setAdd] = useState(false); const [run] = useAction();
  if (!ex.data) return <Loading error={ex.error} />;
  const list = ex.data.filter((e) => e.data.dueDate.startsWith(month)).sort((a, b) => a.data.dueDate.localeCompare(b.data.dueDate));
  return (<>
    <button className="primary" style={{ marginBottom: 12 }} onClick={() => setAdd(true)}>+ Nova despesa</button>
    <div className="card scroll"><table><thead><tr><th>Vence</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th /></tr></thead><tbody>
      {list.map((e) => (<tr key={e.id}><td>{dmy(e.data.dueDate)}</td><td>{e.data.description}{e.data.recurring === 'mensal' && <> <Badge>todo mês</Badge></>}</td><td>{e.data.kind} · {e.data.category}</td><td><Money cents={e.data.amountCents} /></td>
        <td>{e.data.paid ? <Badge tone="ok">paga</Badge> : <button className="sm" onClick={async () => { await run(() => api(`/r/expense/${e.id}`, { method: 'PUT', body: { paid: true, paidAt: todayIso() } }), 'Marcada como paga.'); await ex.reload(); onChange(); }}>Marcar paga</button>}</td></tr>))}
    </tbody></table>{list.length === 0 && <p className="muted">Sem despesas neste mês.</p>}</div>
    {add && <ExpenseModal month={month} onClose={() => setAdd(false)} onDone={async () => { setAdd(false); await ex.reload(); onChange(); }} />}
  </>);
}

function ExpenseModal({ month, onClose, onDone }: { month: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ description: '', kind: 'fixa', category: 'aluguel', amountCents: 0, dueDate: `${month}-10`, recurring: 'nenhuma', paid: false }); const [run, busy] = useAction();
  return (<Modal title="Nova despesa" onClose={onClose}>
    <Text label="Descrição" value={f.description} onChange={(x) => setF({ ...f, description: x })} />
    <div className="grid g2"><Select label="Tipo" value={f.kind} onChange={(x) => setF({ ...f, kind: x })} options={[{ value: 'fixa', label: 'Fixa (aluguel, salários…)' }, { value: 'variavel', label: 'Variável' }]} /><Select label="Categoria" value={f.category} onChange={(x) => setF({ ...f, category: x })} options={EXP_CATS} /></div>
    <div className="grid g2"><MoneyInput label="Valor" cents={f.amountCents} onChange={(c) => setF({ ...f, amountCents: c })} /><Text label="Vencimento" type="date" value={f.dueDate} onChange={(x) => setF({ ...f, dueDate: x })} /></div>
    <Toggle label="Repete todo mês (entra no custo fixo da precificação)" checked={f.recurring === 'mensal'} onChange={(x) => setF({ ...f, recurring: x ? 'mensal' : 'nenhuma' })} />
    <button className="primary" disabled={busy || f.description.length < 2 || !f.amountCents} onClick={async () => { const r = await run(() => api('/r/expense', { body: f }), 'Despesa salva.'); if (r) onDone(); }}>Salvar</button></Modal>);
}

function Invoices() {
  const inv = useLoad<any[]>('/finance/invoices'); const [run] = useAction();
  if (!inv.data) return <Loading error={inv.error} />;
  return (<><div className="alert info">As notas são preparadas automaticamente a cada entrega, com os dados do cliente (CPF) e valor. A emissão no sistema da prefeitura depende de um provedor fiscal (eNotas, Focus NFe…) e da inscrição municipal do lava-rápido — enquanto isso, emita lá e registre o número aqui.</div>
    <div className="card scroll"><table><thead><tr><th>Data</th><th>Cliente</th><th>Valor</th><th>Status</th><th /></tr></thead><tbody>{inv.data.map((i) => (<tr key={i.id}><td>{dmy(i.createdAt)}</td><td>{i.data.customerName}{!i.data.hasCpf && <> <Badge tone="warn">sem CPF</Badge></>}</td><td><Money cents={i.data.amountCents} /></td><td><Badge tone={i.data.status === 'emitida' ? 'ok' : 'warn'}>{i.data.status === 'emitida' ? `Nº ${i.data.number}` : 'a emitir'}</Badge></td>
      <td>{i.data.status !== 'emitida' && <button className="sm" onClick={async () => { const n = prompt('Número da nota emitida:'); if (n) { await run(() => api(`/finance/invoices/${i.id}/issued`, { body: { number: n } }), 'Registrado.'); await inv.reload(); } }}>Registrar número</button>}</td></tr>))}</tbody></table></div></>);
}
