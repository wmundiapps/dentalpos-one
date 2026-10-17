import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, Chip, Field, Loading, Modal, MoneyInput, NumberInput, Page, Select, Tabs, Text, Toggle, useAction, useLoad } from '../ui';
import { CAT_LABEL, CATS } from '../format';

const GROUPS = [{ value: 'lavagem', label: 'Lavagem' }, { value: 'estetica', label: 'Estética' }, { value: 'protecao', label: 'Proteção' }, { value: 'filme', label: 'Películas e filmes' }, { value: 'outro', label: 'Outro' }];
const AREAS = [{ value: 'exterior', label: 'Exterior' }, { value: 'interior', label: 'Interior' }, { value: 'pertences', label: 'Pertences' }, { value: 'mecanica', label: 'Painel e mecânica' }];

export default function Services() {
  const [tab, setTab] = useState<'precos' | 'checklist' | 'categorias'>('precos');
  return (
    <Page title="Serviços e preços" sub="Valores por categoria de veículo e por procedimento — tudo configurável">
      <Tabs value={tab} onChange={setTab} items={[{ key: 'precos', label: 'Preços' }, { key: 'checklist', label: 'Itens do checklist' }, { key: 'categorias', label: 'Categorias' }]} />
      {tab === 'precos' && <Prices />}{tab === 'checklist' && <ChecklistConfig />}{tab === 'categorias' && <Categories />}
    </Page>
  );
}

function Prices() {
  const svc = useLoad<any[]>('/r/service'); const stock = useLoad<any[]>('/r/stockItem');
  const [edit, setEdit] = useState<any | null>(null); const [run] = useAction();
  const savePrice = async (s: any, cat: string, cents: number) => { await run(() => api(`/r/service/${s.id}`, { method: 'PUT', body: { prices: { ...s.data.prices, [cat]: cents } } })); await svc.reload(); };
  if (!svc.data) return <Loading error={svc.error} />;
  return (<>
    <button className="primary" style={{ marginBottom: 12 }} onClick={() => setEdit({ data: { name: '', group: 'lavagem', description: '', durationMin: 30, prices: { carro: 0, suv: 0, utilitario: 0, van: 0, caminhao: 0 }, recipe: [], otherCostCents: 0, active: true } })}>+ Novo serviço</button>
    <div className="card scroll"><table>
      <thead><tr><th>Serviço</th>{CATS.map((c) => <th key={c}>{CAT_LABEL[c]}</th>)}<th /></tr></thead>
      <tbody>{svc.data.map((s) => (
        <tr key={s.id} style={{ opacity: s.data.active === false ? .5 : 1 }}>
          <td style={{ minWidth: 180 }}><b>{s.data.name}</b><br /><span className="muted small">{s.data.durationMin} min</span></td>
          {CATS.map((c) => <td key={c} style={{ minWidth: 96 }}><MoneyInput cents={s.data.prices[c]} onChange={(v) => v !== s.data.prices[c] && savePrice(s, c, v)} /></td>)}
          <td><button className="sm" onClick={() => setEdit(s)}>Editar</button></td>
        </tr>))}</tbody>
    </table></div>
    {edit && <ServiceModal s={edit} stock={stock.data ?? []} onClose={() => setEdit(null)} onDone={async () => { setEdit(null); await svc.reload(); }} />}
  </>);
}

function ServiceModal({ s, stock, onClose, onDone }: { s: any; stock: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...s.data }); const [run, busy] = useAction();
  const save = async () => { const r = await run(() => api(s.id ? `/r/service/${s.id}` : '/r/service', { method: s.id ? 'PUT' : 'POST', body: f }), 'Salvo.'); if (r) onDone(); };
  return (
    <Modal title={s.id ? 'Editar serviço' : 'Novo serviço'} onClose={onClose}>
      <Text label="Nome" value={f.name} onChange={(x) => setF({ ...f, name: x })} />
      <div className="grid g2"><Select label="Grupo" value={f.group} onChange={(x) => setF({ ...f, group: x })} options={GROUPS} /><NumberInput label="Duração (minutos)" value={f.durationMin} onChange={(x) => setF({ ...f, durationMin: x })} min={5} step={5} /></div>
      <Text label="Descrição" value={f.description} onChange={(x) => setF({ ...f, description: x })} />
      <div className="grid g3">{CATS.map((c) => <MoneyInput key={c} label={`Preço — ${CAT_LABEL[c]}`} cents={f.prices[c]} onChange={(v) => setF({ ...f, prices: { ...f.prices, [c]: v } })} />)}</div>
      <MoneyInput label="Outros custos diretos por serviço (mão de obra, energia, água)" cents={f.otherCostCents} onChange={(v) => setF({ ...f, otherCostCents: v })} />
      <Field label="Produtos consumidos (baixa automática no estoque)">
        {f.recipe.map((r: any, i: number) => (<div key={i} className="row" style={{ marginBottom: 6 }}>
          <select style={{ flex: 2 }} value={r.itemId} onChange={(e) => setF({ ...f, recipe: f.recipe.map((x: any, k: number) => (k === i ? { ...x, itemId: e.target.value } : x)) })}>{stock.map((it) => <option key={it.id} value={it.id}>{it.data.name} ({it.data.unit})</option>)}</select>
          <input style={{ flex: 1 }} type="number" min={0} value={r.qty} onChange={(e) => setF({ ...f, recipe: f.recipe.map((x: any, k: number) => (k === i ? { ...x, qty: Number(e.target.value) } : x)) })} />
          <button className="sm" onClick={() => setF({ ...f, recipe: f.recipe.filter((_: any, k: number) => k !== i) })}>✕</button></div>))}
        {stock[0] && <button className="sm" onClick={() => setF({ ...f, recipe: [...f.recipe, { itemId: stock[0].id, qty: 1 }] })}>+ Produto</button>}
      </Field>
      <Toggle label="Ativo (aparece no check-in e no agendamento online)" checked={f.active !== false} onChange={(x) => setF({ ...f, active: x })} />
      <button className="primary" disabled={busy} onClick={save}>Salvar</button>
    </Modal>
  );
}

function ChecklistConfig() {
  const items = useLoad<any[]>('/r/checklistItem'); const [name, setName] = useState(''); const [area, setArea] = useState('exterior'); const [run] = useAction();
  if (!items.data) return <Loading error={items.error} />;
  return (<>
    <Card title="Adicionar item"><div className="row"><div className="grow"><Text label="Nome do item" value={name} onChange={setName} placeholder="Ex.: Antena, Bagageiro de teto" /></div><div style={{ minWidth: 180 }}><Select label="Área" value={area} onChange={setArea} options={AREAS} /></div>
      <button className="primary" disabled={name.length < 2} onClick={async () => { await run(() => api('/r/checklistItem', { body: { name, area, order: items.data!.length } }), 'Item criado.'); setName(''); await items.reload(); }}>Adicionar</button></div></Card>
    {AREAS.map((a) => (<Card key={a.value} title={a.label}>{items.data!.filter((i) => i.data.area === a.value).map((i) => (
      <div key={i.id} className="row between check-row"><span>{i.data.name}</span><button className="sm danger" onClick={async () => { if (confirm('Tirar este item do checklist? (as ordens antigas continuam guardadas)')) { await run(() => api(`/r/checklistItem/${i.id}`, { method: 'DELETE' })); await items.reload(); } }}>Tirar</button></div>))}</Card>))}
  </>);
}

function Categories() {
  const cats = useLoad<any[]>('/r/category'); const [run] = useAction();
  if (!cats.data) return <Loading error={cats.error} />;
  return <Card title="Categorias de veículo">{[...cats.data].sort((a, b) => a.data.order - b.data.order).map((c) => (
    <div key={c.id} className="row check-row"><Badge>{c.data.key}</Badge><div className="grow"><input defaultValue={c.data.name} onBlur={async (e) => { if (e.target.value && e.target.value !== c.data.name) { await run(() => api(`/r/category/${c.id}`, { method: 'PUT', body: { name: e.target.value } }), 'Renomeada.'); await cats.reload(); } }} /></div></div>))}
    <p className="muted small">Carro, SUV, Utilitários, Vans e Caminhões são as cinco categorias de preço. Você pode renomear.</p></Card>;
}
