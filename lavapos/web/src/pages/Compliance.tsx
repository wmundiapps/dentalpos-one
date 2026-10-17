import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, Loading, Modal, NumberInput, Page, Select, Text, useAction, useLoad } from '../ui';
import { dmy, todayIso } from '../format';

const TYPES = [{ value: 'licenca_ambiental', label: 'Licença ambiental' }, { value: 'alvara', label: 'Alvará de funcionamento' }, { value: 'bombeiros', label: 'Bombeiros (AVCB)' }, { value: 'outorga_agua', label: 'Outorga / uso de água' }, { value: 'aluguel', label: 'Vencimento do aluguel' }, { value: 'contrato', label: 'Contrato' }, { value: 'seguro', label: 'Seguro' }, { value: 'outro', label: 'Outro' }];
const days = (d: string) => Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(todayIso() + 'T12:00:00Z')) / 86400000);
const addMonths = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

export default function Compliance() {
  const list = useLoad<any[]>('/r/compliance'); const [add, setAdd] = useState(false); const [run] = useAction();
  if (!list.data) return <Loading error={list.error} />;
  const open = list.data.filter((c) => !c.data.done).sort((a, b) => a.data.dueDate.localeCompare(b.data.dueDate));
  const done = async (c: any) => {
    await run(async () => {
      await api(`/r/compliance/${c.id}`, { method: 'PUT', body: { done: true } });
      if (c.data.recurrenceMonths > 0) await api('/r/compliance', { body: { title: c.data.title, type: c.data.type, dueDate: addMonths(c.data.dueDate, c.data.recurrenceMonths), alertDays: c.data.alertDays, recurrenceMonths: c.data.recurrenceMonths, notes: c.data.notes } });
    }, 'Renovado — próximo vencimento criado.'); await list.reload();
  };
  return (
    <Page title="Licenças, alvarás e contratos" sub="Avisamos por e-mail e no painel antes de vencer" actions={<button className="primary" onClick={() => setAdd(true)}>+ Novo lembrete</button>}>
      {open.length === 0 && <p className="muted">Nenhum lembrete. Cadastre licença ambiental, alvará, bombeiros, aluguel e contratos.</p>}
      {open.map((c) => { const d = days(c.data.dueDate); const tone = d < 0 ? 'bad' : d <= c.data.alertDays ? 'warn' : 'ok'; return (
        <Card key={c.id}><div className="row between"><div><b>{c.data.title}</b><br /><span className="muted small">{TYPES.find((t) => t.value === c.data.type)?.label} · vence {dmy(c.data.dueDate)}</span></div>
          <div className="row"><Badge tone={tone}>{d < 0 ? `venceu há ${-d} dia(s)` : d === 0 ? 'vence hoje' : `faltam ${d} dia(s)`}</Badge><button className="sm" onClick={() => done(c)}>✓ Renovado</button></div></div></Card>); })}
      {add && <AddModal onClose={() => setAdd(false)} onDone={async () => { setAdd(false); await list.reload(); }} />}
    </Page>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ title: '', type: 'licenca_ambiental', dueDate: '', alertDays: 30, recurrenceMonths: 12, notes: '' }); const [run, busy] = useAction();
  return (<Modal title="Novo lembrete" onClose={onClose}>
    <Select label="Tipo" value={f.type} onChange={(x) => setF({ ...f, type: x, title: f.title || TYPES.find((t) => t.value === x)?.label || '' })} options={TYPES} />
    <Text label="Nome" value={f.title} onChange={(x) => setF({ ...f, title: x })} /><Text label="Vencimento" type="date" value={f.dueDate} onChange={(x) => setF({ ...f, dueDate: x })} />
    <div className="grid g2"><NumberInput label="Avisar quantos dias antes" value={f.alertDays} onChange={(x) => setF({ ...f, alertDays: x })} min={0} /><NumberInput label="Repetir a cada (meses, 0 = não)" value={f.recurrenceMonths} onChange={(x) => setF({ ...f, recurrenceMonths: x })} min={0} /></div>
    <button className="primary" disabled={busy || !f.title || !f.dueDate} onClick={async () => { const r = await run(() => api('/r/compliance', { body: f }), 'Lembrete criado.'); if (r) onDone(); }}>Salvar</button></Modal>);
}
