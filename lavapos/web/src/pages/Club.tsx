import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, Field, Kpi, Loading, Modal, Money, MoneyInput, Page, Select, Tabs, Text, Toggle, useAction, useLoad } from '../ui';
import { CAT_LABEL, CATS, FREQ_LABEL, brl, dmy, maskPlate } from '../format';

export default function Club() {
  const [tab, setTab] = useState<'assinantes' | 'planos'>('assinantes');
  const sum = useLoad<any>('/club/summary');
  return (
    <Page title="Clube de assinatura" sub="Lavagem semanal, quinzenal, trisemanal ou mensal com cobrança automática">
      <div className="grid g3" style={{ marginBottom: 12 }}><Kpi label="Assinantes ativos" value={sum.data?.ativas ?? '—'} /><Kpi label="Receita mensal recorrente" value={<Money cents={sum.data?.mrr ?? 0} />} /><Kpi label="Inadimplentes" value={sum.data?.inadimplentes ?? 0} tone={sum.data?.inadimplentes ? 'bad' : undefined} /></div>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'assinantes', label: 'Assinantes' }, { key: 'planos', label: 'Planos' }]} />
      {tab === 'assinantes' ? <Subs onChange={sum.reload} /> : <Plans />}
    </Page>
  );
}

function Subs({ onChange }: { onChange: () => void }) {
  const subs = useLoad<any[]>('/club/subscriptions'); const [add, setAdd] = useState(false); const [run] = useAction();
  const set = async (id: string, status: string) => { await run(() => api(`/club/subscriptions/${id}/status`, { body: { status } }), 'Atualizado.'); await subs.reload(); onChange(); };
  return (<>
    <button className="primary" style={{ marginBottom: 12 }} onClick={() => setAdd(true)}>+ Nova assinatura</button>
    {!subs.data ? <Loading error={subs.error} /> : subs.data.length === 0 ? <p className="muted">Nenhum assinante ainda. Ofereça o clube no check-in!</p> : (
      <div className="card scroll"><table><thead><tr><th>Cliente</th><th>Plano</th><th>Placa</th><th>Mensalidade</th><th>Próxima lavagem</th><th>Status</th><th /></tr></thead><tbody>
        {subs.data.map((s) => (<tr key={s.id}><td>{s.customerName}</td><td>{s.planName}</td><td>{s.plate}</td><td><Money cents={s.priceCents} /></td><td>{dmy(s.nextWashDate)}</td>
          <td><Badge tone={s.status === 'ativa' ? 'ok' : s.status === 'inadimplente' ? 'bad' : 'warn'}>{s.status}</Badge></td>
          <td className="nowrap">{s.status === 'ativa' ? <button className="sm" onClick={() => set(s.id, 'pausada')}>Pausar</button> : s.status !== 'cancelada' && <button className="sm" onClick={() => set(s.id, 'ativa')}>Reativar</button>} {s.status !== 'cancelada' && <button className="sm danger" onClick={() => confirm('Cancelar esta assinatura?') && set(s.id, 'cancelada')}>Cancelar</button>}</td></tr>))}
      </tbody></table></div>)}
    {add && <AddSub onClose={() => setAdd(false)} onDone={async () => { setAdd(false); await subs.reload(); onChange(); }} />}
  </>);
}

function AddSub({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [plate, setPlate] = useState(''); const [veh, setVeh] = useState<any>(null); const [planId, setPlanId] = useState('');
  const plans = useLoad<any[]>('/r/plan'); const [run, busy] = useAction();
  const find = (p: string) => { setPlate(p); if (p.length === 7) api<any[]>(`/r/vehicle?plate=${p}`).then((v) => setVeh(v[0] ?? false)).catch(() => setVeh(false)); else setVeh(null); };
  const plan = plans.data?.find((p) => p.id === planId);
  return (
    <Modal title="Nova assinatura" onClose={onClose}>
      <Text label="Placa do veículo (já cadastrado)" value={plate} onChange={(x) => find(maskPlate(x))} />
      {veh === false && <div className="alert warn">Placa não cadastrada. Faça o primeiro check-in.</div>}{veh && <div className="alert ok">{veh.data.brand} {veh.data.model} — {CAT_LABEL[veh.data.categoryKey]}</div>}
      <Select label="Plano" value={planId} onChange={setPlanId} options={(plans.data ?? []).filter((p) => p.data.active !== false).map((p) => ({ value: p.id, label: p.data.name }))} />
      {plan && veh && <p><b>{brl(plan.data.prices[veh.data.categoryKey])}</b> por mês · {FREQ_LABEL[plan.data.frequency]}</p>}
      <p className="muted small">A cobrança mensal é gerada automaticamente (Pix/cartão pelo Asaas, se conectado). Se o cliente atrasar, a assinatura fica "inadimplente".</p>
      <button className="primary" disabled={!veh || !planId || busy} onClick={async () => { const r = await run(() => api('/club/subscriptions', { body: { customerId: veh.data.customerId, vehicleId: veh.id, planId } }), 'Assinatura criada.'); if (r) onDone(); }}>Criar assinatura</button>
    </Modal>
  );
}

function Plans() {
  const plans = useLoad<any[]>('/r/plan'); const svc = useLoad<any[]>('/r/service'); const [edit, setEdit] = useState<any>(null);
  if (!plans.data || !svc.data) return <Loading error={plans.error} />;
  return (<>
    <button className="primary" style={{ marginBottom: 12 }} onClick={() => setEdit({ data: { name: '', frequency: 'quinzenal', serviceIds: [svc.data![0]?.id], prices: { carro: 0, suv: 0, utilitario: 0, van: 0, caminhao: 0 }, active: true } })}>+ Novo plano</button>
    <div className="grid g2">{plans.data.map((p) => (<Card key={p.id} title={p.data.name} right={<button className="sm" onClick={() => setEdit(p)}>Editar</button>}>
      <p className="muted">{FREQ_LABEL[p.data.frequency]}</p>{CATS.map((c) => <div key={c} className="row between small"><span>{CAT_LABEL[c]}</span><b>{brl(p.data.prices[c])}/mês</b></div>)}{p.data.active === false && <Badge tone="warn">desativado</Badge>}</Card>))}</div>
    {edit && <PlanModal p={edit} services={svc.data} onClose={() => setEdit(null)} onDone={async () => { setEdit(null); await plans.reload(); }} />}
  </>);
}

function PlanModal({ p, services, onClose, onDone }: { p: any; services: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...p.data }); const [run, busy] = useAction();
  return (
    <Modal title={p.id ? 'Editar plano' : 'Novo plano'} onClose={onClose}>
      <Text label="Nome do plano" value={f.name} onChange={(x) => setF({ ...f, name: x })} />
      <Select label="Frequência" value={f.frequency} onChange={(x) => setF({ ...f, frequency: x })} options={Object.entries(FREQ_LABEL).map(([value, label]) => ({ value, label }))} />
      <Select label="Serviço incluído em cada lavagem" value={f.serviceIds[0] ?? ''} onChange={(x) => setF({ ...f, serviceIds: [x] })} options={services.map((s) => ({ value: s.id, label: s.data.name }))} />
      <div className="grid g3">{CATS.map((c) => <MoneyInput key={c} label={`Mensalidade — ${CAT_LABEL[c]}`} cents={f.prices[c]} onChange={(v) => setF({ ...f, prices: { ...f.prices, [c]: v } })} />)}</div>
      <Toggle label="Plano ativo" checked={f.active !== false} onChange={(x) => setF({ ...f, active: x })} />
      <button className="primary" disabled={busy} onClick={async () => { const r = await run(() => api(p.id ? `/r/plan/${p.id}` : '/r/plan', { method: p.id ? 'PUT' : 'POST', body: f }), 'Plano salvo.'); if (r) onDone(); }}>Salvar</button>
    </Modal>
  );
}
