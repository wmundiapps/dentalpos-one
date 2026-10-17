import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Loading, Modal, Money, Page, Text, Toggle, useAction, useLoad } from '../ui';
import { brl, dmy, maskCpf, maskPhone, waLink } from '../format';
import { Link } from 'react-router-dom';

export default function Customers() {
  const [q, setQ] = useState(''); const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useLoad<any[]>(`/r/customer${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`, [debounced]);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Page title="Clientes" sub="Busque por nome ou WhatsApp">
      <Text label="Buscar" value={q} onChange={setQ} placeholder="Nome ou telefone" />
      {!list.data ? <Loading error={list.error} /> : list.data.length === 0 ? <p className="muted">Nenhum cliente. Eles entram sozinhos no primeiro check-in ou agendamento online.</p> : (
        <div className="grid g2">{list.data.slice(0, 200).map((c) => (
          <button key={c.id} className="card" style={{ textAlign: 'left', display: 'block', marginBottom: 0 }} onClick={() => setSel(c.id)}>
            <b>{c.data.name}</b> {c.data.consentMarketing && <Badge tone="ok">aceita avisos</Badge>}<br /><span className="muted">{maskPhone(c.data.whatsapp ?? '')} {c.data.lastWashAt && <>· última lavagem {dmy(c.data.lastWashAt)}</>}</span>
          </button>))}</div>)}
      {sel && <Detail id={sel} onClose={() => { setSel(null); void list.reload(); }} />}
    </Page>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const c = useLoad<any>(`/r/customer/${id}`); const vs = useLoad<any[]>(`/r/vehicle?customerId=${id}`); const os = useLoad<any[]>(`/orders?customerId=${id}`); const cb = useLoad<any>(`/club/cashback/${id}`);
  const [f, setF] = useState<any>(null); const [run, busy] = useAction();
  useEffect(() => { if (c.data && !f) setF({ ...c.data.data }); }, [c.data]); // eslint-disable-line
  if (!c.data || !f) return <Modal title="Cliente" onClose={onClose}><Loading error={c.error} /></Modal>;
  const save = () => run(() => api(`/r/customer/${id}`, { method: 'PUT', body: { name: f.name, whatsapp: f.whatsapp, email: f.email, cpf: f.cpf, notes: f.notes, consentMarketing: f.consentMarketing, cashbackOptIn: f.cashbackOptIn } }), 'Salvo.');
  return (
    <Modal title={f.name} onClose={onClose}>
      <div className="grid g2">
        <Text label="Nome" value={f.name} onChange={(x) => setF({ ...f, name: x })} /><Text label="WhatsApp" value={maskPhone(f.whatsapp ?? '')} onChange={(x) => setF({ ...f, whatsapp: x.replace(/\D/g, '') })} />
        <Text label="E-mail" value={f.email ?? ''} onChange={(x) => setF({ ...f, email: x })} /><Text label="CPF (nota fiscal)" value={maskCpf(f.cpf ?? '')} onChange={(x) => setF({ ...f, cpf: x })} />
      </div>
      <Toggle label="Autoriza lembretes e ofertas (WhatsApp, SMS, e-mail)" checked={!!f.consentMarketing} onChange={(x) => setF({ ...f, consentMarketing: x })} />
      <Toggle label="Participa do cashback" checked={!!f.cashbackOptIn} onChange={(x) => setF({ ...f, cashbackOptIn: x })} />
      <div className="row"><button className="primary" disabled={busy} onClick={save}>Salvar</button>{f.whatsapp && <a className="btn" href={waLink(f.whatsapp, `Olá, ${f.name.split(' ')[0]}!`)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}</div>
      <Card title="Veículos">{vs.data?.map((v) => <div key={v.id} className="row between check-row"><span><b>{v.data.plate}</b> {v.data.brand} {v.data.model} {v.data.year}</span><Link className="btn sm" to={`/checkin?plate=${v.data.plate}`}>Check-in</Link></div>)}</Card>
      <Card title={`Cashback: ${brl(cb.data?.balanceCents ?? 0)}`}>{cb.data?.ledger.slice(0, 8).map((l: any) => <div key={l.id} className="row between small"><span>{dmy(l.createdAt)} · {l.reason}</span><b style={{ color: l.deltaCents < 0 ? 'var(--bad)' : 'var(--ok)' }}>{brl(l.deltaCents)}</b></div>)}</Card>
      <Card title="Histórico">{os.data?.slice(0, 10).map((o) => <Link key={o.id} to={`/os/${o.id}`} className="row between small check-row" style={{ color: 'inherit', textDecoration: 'none' }}><span>{dmy(o.createdAt)} · OS {o.data.number} · {o.data.plate}</span><Money cents={o.data.totalCents} /></Link>)}</Card>
    </Modal>
  );
}
