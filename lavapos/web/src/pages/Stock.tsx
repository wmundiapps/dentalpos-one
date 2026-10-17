import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, Loading, Modal, MoneyInput, NumberInput, Page, Select, Tabs, Text, useAction, useLoad } from '../ui';
import { brl, maskPhone, dmy } from '../format';

const UNITS = ['un', 'L', 'mL', 'kg', 'g', 'm', 'pç'];

export default function Stock() {
  const [tab, setTab] = useState<'estoque' | 'fornecedores'>('estoque');
  return (<Page title="Estoque e fornecedores" sub="O consumo de cada serviço dá baixa sozinho na entrega"><Tabs value={tab} onChange={setTab} items={[{ key: 'estoque', label: 'Estoque' }, { key: 'fornecedores', label: 'Fornecedores' }]} />{tab === 'estoque' ? <Items /> : <Suppliers />}</Page>);
}

function Items() {
  const items = useLoad<any[]>('/r/stockItem'); const sup = useLoad<any[]>('/r/supplier'); const [mv, setMv] = useState<any>(null); const [edit, setEdit] = useState<any>(null);
  if (!items.data) return <Loading error={items.error} />;
  return (<>
    <button className="primary" style={{ marginBottom: 12 }} onClick={() => setEdit({ data: { name: '', unit: 'un', qty: 0, minQty: 0, costCents: 0 } })}>+ Novo item</button>
    <div className="card scroll"><table><thead><tr><th>Item</th><th>Saldo</th><th>Mínimo</th><th>Custo/un.</th><th>Fornecedor</th><th /></tr></thead><tbody>
      {items.data.map((i) => (<tr key={i.id}><td><b>{i.data.name}</b></td><td>{i.data.qty <= i.data.minQty ? <Badge tone="bad">{i.data.qty} {i.data.unit}</Badge> : `${i.data.qty} ${i.data.unit}`}</td><td>{i.data.minQty}</td><td>{brl(i.data.costCents)}</td><td>{sup.data?.find((s) => s.id === i.data.supplierId)?.data.name ?? '—'}</td>
        <td className="nowrap"><button className="sm" onClick={() => setMv(i)}>Entrada / ajuste</button> <button className="sm" onClick={() => setEdit(i)}>Editar</button></td></tr>))}</tbody></table></div>
    {mv && <MoveModal item={mv} onClose={() => setMv(null)} onDone={async () => { setMv(null); await items.reload(); }} />}
    {edit && <ItemModal item={edit} suppliers={sup.data ?? []} onClose={() => setEdit(null)} onDone={async () => { setEdit(null); await items.reload(); }} />}
  </>);
}

function MoveModal({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('compra'); const [qty, setQty] = useState(0); const [cost, setCost] = useState(item.data.costCents); const [run, busy] = useAction();
  return (<Modal title={`${item.data.name} (${item.data.qty} ${item.data.unit})`} onClose={onClose}>
    <Select label="Motivo" value={reason} onChange={setReason} options={[{ value: 'compra', label: 'Compra / entrada' }, { value: 'ajuste', label: 'Ajuste de inventário (+ ou −)' }, { value: 'perda', label: 'Perda / vencimento (−)' }]} />
    <NumberInput label={`Quantidade (${item.data.unit})`} value={qty} onChange={setQty} step={0.1} />{reason === 'compra' && <MoneyInput label="Custo por unidade" cents={cost} onChange={setCost} />}
    <button className="primary" disabled={!qty || busy} onClick={async () => { const delta = reason === 'perda' ? -Math.abs(qty) : reason === 'compra' ? Math.abs(qty) : qty; const r = await run(() => api('/finance/stock/move', { body: { itemId: item.id, delta, reason, costCents: reason === 'compra' ? cost : undefined } }), 'Estoque atualizado.'); if (r) onDone(); }}>Registrar</button></Modal>);
}

function ItemModal({ item, suppliers, onClose, onDone }: { item: any; suppliers: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...item.data }); const [run, busy] = useAction();
  return (<Modal title={item.id ? 'Editar item' : 'Novo item'} onClose={onClose}>
    <Text label="Nome" value={f.name} onChange={(x) => setF({ ...f, name: x })} />
    <div className="grid g2"><Select label="Unidade" value={f.unit} onChange={(x) => setF({ ...f, unit: x })} options={UNITS} /><MoneyInput label="Custo por unidade" cents={f.costCents} onChange={(c) => setF({ ...f, costCents: c })} />
      {!item.id && <NumberInput label="Saldo inicial" value={f.qty} onChange={(x) => setF({ ...f, qty: x })} />}<NumberInput label="Estoque mínimo (alerta)" value={f.minQty} onChange={(x) => setF({ ...f, minQty: x })} /></div>
    <Select label="Fornecedor" value={f.supplierId ?? ''} onChange={(x) => setF({ ...f, supplierId: x || undefined })} options={suppliers.map((s) => ({ value: s.id, label: s.data.name }))} placeholder="Nenhum" />
    <button className="primary" disabled={busy || f.name.length < 2} onClick={async () => { const body = item.id ? { name: f.name, unit: f.unit, costCents: f.costCents, minQty: f.minQty, supplierId: f.supplierId } : f; const r = await run(() => api(item.id ? `/r/stockItem/${item.id}` : '/r/stockItem', { method: item.id ? 'PUT' : 'POST', body }), 'Salvo.'); if (r) onDone(); }}>Salvar</button></Modal>);
}

function Suppliers() {
  const sup = useLoad<any[]>('/r/supplier'); const [edit, setEdit] = useState<any>(null);
  if (!sup.data) return <Loading error={sup.error} />;
  return (<>
    <button className="primary" style={{ marginBottom: 12 }} onClick={() => setEdit({ data: { name: '', cnpj: '', phone: '', email: '', contact: '', products: '', notes: '' } })}>+ Novo fornecedor</button>
    <div className="grid g2">{sup.data.map((s) => (<Card key={s.id} title={s.data.name} right={<button className="sm" onClick={() => setEdit(s)}>Editar</button>}><p className="muted small">{s.data.contact} {s.data.phone && `· ${maskPhone(s.data.phone)}`} {s.data.email && `· ${s.data.email}`}</p><p>{s.data.products}</p></Card>))}</div>
    {sup.data.length === 0 && <p className="muted">Cadastre quem vende seus produtos (shampoo, cera, películas…).</p>}
    {edit && <SupplierModal s={edit} onClose={() => setEdit(null)} onDone={async () => { setEdit(null); await sup.reload(); }} />}
  </>);
}

function SupplierModal({ s, onClose, onDone }: { s: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...s.data }); const [run, busy] = useAction(); const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  return (<Modal title={s.id ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={onClose}>
    <Text label="Nome / razão social" value={f.name} onChange={set('name')} /><div className="grid g2"><Text label="CNPJ" value={f.cnpj} onChange={set('cnpj')} /><Text label="Contato" value={f.contact} onChange={set('contact')} /><Text label="Telefone" value={f.phone} onChange={set('phone')} /><Text label="E-mail" value={f.email} onChange={set('email')} /></div>
    <Text label="Produtos que fornece" value={f.products} onChange={set('products')} /><Text label="Observações" value={f.notes} onChange={set('notes')} />
    <button className="primary" disabled={busy || f.name.length < 2} onClick={async () => { const r = await run(() => api(s.id ? `/r/supplier/${s.id}` : '/r/supplier', { method: s.id ? 'PUT' : 'POST', body: f }), 'Salvo.'); if (r) onDone(); }}>Salvar</button></Modal>);
}
void dmy;
