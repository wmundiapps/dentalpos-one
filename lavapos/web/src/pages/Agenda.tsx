import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, Chip, Field, Loading, Modal, Page, Text, useAction, useLoad } from '../ui';
import { addDaysIso, dmy, hm, maskPlate, todayIso, weekday } from '../format';
import { useMe } from '../App';

const ST: Record<string, { l: string; t: 'ok' | 'warn' | 'bad' | 'info' }> = { agendado: { l: 'Agendado', t: 'info' }, confirmado: { l: 'Confirmado', t: 'ok' }, em_atendimento: { l: 'Em atendimento', t: 'warn' }, concluido: { l: 'Concluído', t: 'ok' }, cancelado: { l: 'Cancelado', t: 'bad' }, faltou: { l: 'Faltou', t: 'bad' } };

export default function Agenda() {
  const { me } = useMe();
  const [day, setDay] = useState(todayIso());
  const [modal, setModal] = useState(false);
  const apps = useLoad<any[]>(`/agenda?from=${day}`, [day]);
  const custs = useLoad<any[]>('/r/customer');
  const vehs = useLoad<any[]>('/r/vehicle');
  const [run] = useAction();
  const link = `${location.origin}/l/${me.tenant?.slug}`;
  const nameOf = (id: string) => custs.data?.find((c) => c.id === id)?.data.name ?? '—';
  const plateOf = (id: string) => vehs.data?.find((v) => v.id === id)?.data.plate ?? '';
  const set = async (id: string, status: string) => { await run(() => api(`/agenda/${id}/status`, { body: { status } }), 'Atualizado.'); await apps.reload(); };

  return (
    <Page title="Agenda" sub="Horários de funcionamento e boxes definidos em Configurações" actions={<button className="primary" onClick={() => setModal(true)}>+ Novo horário</button>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={() => setDay(addDaysIso(day, -1))} aria-label="Dia anterior">←</button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 170 }} />
        <button onClick={() => setDay(addDaysIso(day, 1))} aria-label="Próximo dia">→</button>
        <button className="ghost" onClick={() => setDay(todayIso())}>Hoje</button>
        <b>{weekday(day)}, {dmy(day)}</b>
      </div>
      <Card title="Link de agendamento online" right={<button className="sm" onClick={() => navigator.clipboard?.writeText(link)}>Copiar link</button>}>
        <p className="small" style={{ margin: 0 }}>Cole no WhatsApp, Instagram e Google: <b>{link}</b></p>
      </Card>
      {!apps.data ? <Loading error={apps.error} /> : apps.data.length === 0 ? <p className="muted">Nenhum horário neste dia.</p> : apps.data.map((a) => (
        <div key={a.id} className="card">
          <div className="row between"><div><b style={{ fontSize: '1.15rem' }}>{hm(a.start)}</b> <span className="muted">até {hm(a.endsAt)}</span></div><Badge tone={ST[a.status]?.t}>{ST[a.status]?.l}</Badge></div>
          <div><b>{nameOf(a.customerId)}</b> · {plateOf(a.vehicleId)} {a.source === 'online' && <Badge tone="info">online</Badge>}{a.source === 'assinatura' && <Badge tone="info">clube</Badge>}</div>
          {['agendado', 'confirmado'].includes(a.status) && (
            <div className="row" style={{ marginTop: 8 }}>
              <Link className="btn primary sm" to={`/checkin?plate=${plateOf(a.vehicleId)}&appointmentId=${a.id}`}>📝 Fazer check-in</Link>
              {a.status === 'agendado' && <button className="sm" onClick={() => set(a.id, 'confirmado')}>Confirmar</button>}
              <button className="sm" onClick={() => set(a.id, 'faltou')}>Faltou</button>
              <button className="sm danger" onClick={() => set(a.id, 'cancelado')}>Cancelar</button>
            </div>)}
        </div>))}
      {modal && <NewAppt day={day} onClose={() => setModal(false)} onDone={async () => { setModal(false); await apps.reload(); }} />}
    </Page>
  );
}

function NewAppt({ day, onClose, onDone }: { day: string; onClose: () => void; onDone: () => void }) {
  const [plate, setPlate] = useState(''); const [veh, setVeh] = useState<any>(null);
  const [date, setDate] = useState(day); const [ids, setIds] = useState<string[]>([]); const [start, setStart] = useState('');
  const services = useLoad<any[]>('/r/service'); const [slots, setSlots] = useState<{ time: string; start: string }[] | null>(null);
  const [run, busy] = useAction();
  useEffect(() => { if (plate.length < 7) { setVeh(null); return; } api<any[]>(`/r/vehicle?plate=${plate}`).then((v) => setVeh(v[0] ?? false)).catch(() => setVeh(false)); }, [plate]);
  useEffect(() => { setStart(''); if (!ids.length) { setSlots(null); return; } api<any>(`/agenda/slots?date=${date}&serviceIds=${ids.join(',')}`).then((r) => setSlots(r.slots)).catch(() => setSlots([])); }, [ids, date]);
  return (
    <Modal title="Novo horário" onClose={onClose}>
      <Text label="Placa do cliente (precisa estar cadastrada — faça o primeiro check-in ou agende pelo link)" value={plate} onChange={(x) => setPlate(maskPlate(x))} />
      {veh === false && <div className="alert warn">Placa não cadastrada.</div>}
      {veh && <div className="alert ok">{veh.data.brand} {veh.data.model} encontrado.</div>}
      <Field label="Serviços"><div className="chips">{services.data?.filter((s) => s.data.active !== false).map((s) => <Chip key={s.id} on={ids.includes(s.id)} onClick={() => setIds(ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id])}>{s.data.name.split('(')[0]}</Chip>)}</div></Field>
      <Text label="Data" type="date" value={date} onChange={setDate} />
      {slots && (slots.length === 0 ? <div className="alert warn">Sem horários livres nesse dia (fechado ou lotado).</div> : <Field label="Horário livre"><div className="chips">{slots.map((s) => <Chip key={s.start} on={start === s.start} onClick={() => setStart(s.start)}>{s.time}</Chip>)}</div></Field>)}
      <button className="primary" disabled={!veh || !start || busy} onClick={async () => { const r = await run(() => api('/agenda', { body: { customerId: veh.data.customerId, vehicleId: veh.id, serviceIds: ids, start } }), 'Horário marcado e cliente avisado.'); if (r) onDone(); }}>Marcar</button>
    </Modal>
  );
}
