import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, shrinkImage, uploadPhoto } from '../api';
import { Badge, Card, Chip, Field, Loading, Modal, Money, MoneyInput, ORDER_STATUS, Page, PrivatePhoto, Tabs, Text, Toggle, useAction, useLoad, useToast } from '../ui';
import Checklist, { STATE_LABEL, type CheckItem } from '../components/Checklist';
import PhotoSlots, { ANGLES } from '../components/PhotoSlots';
import { brl, dmy, hm, waLink } from '../format';

export default function Orders() {
  const [tab, setTab] = useState<'em_servico' | 'pronto' | 'entregue'>('em_servico');
  const { data, error, reload } = useLoad<any[]>(`/orders?status=${tab}`, [tab]);
  const [open, setOpen] = useState(false);
  void open; void setOpen;
  return (
    <Page title="Pátio e ordens" actions={<Link className="btn primary" to="/checkin">📝 Novo check-in</Link>}>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'em_servico', label: 'Em serviço' }, { key: 'pronto', label: 'Prontos' }, { key: 'entregue', label: 'Entregues' }]} />
      {!data ? <Loading error={error} /> : data.length === 0 ? <p className="muted">Nada por aqui.</p> : (
        <div className="grid g2">{data.map((o) => (
          <Link key={o.id} to={`/os/${o.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0 }}>
            <div className="row between"><b style={{ fontSize: '1.2rem' }}>{o.data.plate}</b><Badge tone={ORDER_STATUS[o.data.status]?.tone}>{ORDER_STATUS[o.data.status]?.label}</Badge></div>
            <div>{o.data.vehicleLabel}</div><div className="muted">{o.data.customerName}</div>
            <div className="row between small muted"><span>OS {o.data.number} · {dmy(o.createdAt)} {hm(o.data.checkin.at.replace('Z', ''))}</span><b><Money cents={o.data.totalCents} /></b></div>
          </Link>))}</div>
      )}
      <button className="sm ghost" onClick={reload} style={{ marginTop: 12 }}>↻ Atualizar</button>
    </Page>
  );
}

const METHODS: { v: string; l: string }[] = [{ v: 'pix', l: 'Pix' }, { v: 'dinheiro', l: 'Dinheiro' }, { v: 'debito', l: 'Débito' }, { v: 'credito', l: 'Crédito' }, { v: 'cheque', l: 'Cheque' }, { v: 'asaas_pix', l: 'Gerar financeiro: Pix online' }, { v: 'asaas_cartao', l: 'Gerar financeiro: cartão online' }, { v: 'asaas_boleto', l: 'Gerar financeiro: boleto' }];

export function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: o, reload, error } = useLoad<any>(`/orders/${id}`);
  const photos = useLoad<any[]>(`/photos/order/${id}`);
  const checklist = useLoad<CheckItem[]>('/r/checklistItem');
  const customer = useLoad<any>(o ? `/r/customer/${o.data.customerId}` : null, [o?.data.customerId]);
  const balance = useLoad<{ balanceCents: number }>(o ? `/club/cashback/${o.data.customerId}` : null, [o?.data.customerId]);
  const [tab, setTab] = useState<'resumo' | 'entrada' | 'fotos' | 'entrega'>('resumo');
  const [run, busy] = useAction();
  const [out, setOut] = useState<Record<string, string[]>>({});
  const [outNotes, setOutNotes] = useState('');
  const [agree, setAgree] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [cashback, setCashback] = useState(0);
  const [pays, setPays] = useState<{ method: string; amountCents: number }[]>([]);
  const [outFiles, setOutFiles] = useState<Record<string, File | undefined>>({});
  const [pubOpen, setPubOpen] = useState(false);
  const extra = useRef<HTMLInputElement>(null);

  useEffect(() => { if (o && Object.keys(out).length === 0) { const init: Record<string, string[]> = {}; for (const i of o.data.checkin.items) init[i.id] = i.states.filter((s: string) => s === 'ok'); setOut(init); } }, [o]); // eslint-disable-line
  if (!o || !checklist.data) return <Loading error={error} />;
  const d = o.data;
  const toPay = d.totalCents - discount - cashback;
  const paysSum = pays.reduce((a, p) => a + p.amountCents, 0);
  const before: Record<string, string[]> = Object.fromEntries(d.checkin.items.map((i: any) => [i.id, i.states]));
  const damaged = (items: any[]) => items.filter((i) => i.states.some((s: string) => !['ok', 'sujo'].includes(s)));

  const ready = async () => { const r = await run(() => api<any>(`/orders/${id}/ready`, { body: {} }), 'Marcado como pronto — avisos na fila.'); if (r) { await reload(); } };
  const deliver = async () => {
    const r = await run(async () => {
      const res = await api<any>(`/orders/${id}/deliver`, { body: { checklist: out, notes: outNotes, customerAgrees: true, discountCents: discount, cashbackUseCents: cashback, payments: pays } });
      for (const [angle, f] of Object.entries(outFiles)) if (f) await uploadPhoto(await shrinkImage(f), { orderId: id!, phase: 'checkout', angle }).catch(() => toast('Uma foto de saída não subiu.', true));
      return res;
    }, 'Entrega registrada!');
    if (r) { await reload(); await photos.reload(); setTab('resumo'); if (r.newIssues?.length) toast(`Atenção: ${r.newIssues.length} dano(s) novo(s) registrado(s) na saída.`, true); }
  };
  const addPhotoLater = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    await run(async () => { await uploadPhoto(await shrinkImage(f), { orderId: id!, phase: d.status === 'entregue' ? 'checkout' : 'checkin', angle: 'dano' }); await photos.reload(); }, 'Foto enviada.');
  };
  const phone = customer.data?.data.whatsapp as string | undefined;

  return (
    <Page title={`${d.plate} · OS ${d.number}`} sub={`${d.vehicleLabel} — ${d.customerName}`} actions={<Badge tone={ORDER_STATUS[d.status]?.tone}>{ORDER_STATUS[d.status]?.label}</Badge>}>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'resumo', label: 'Resumo' }, { key: 'entrada', label: 'Check-in' }, { key: 'fotos', label: `Fotos (${photos.data?.length ?? 0})` }, ...(d.status === 'em_servico' || d.status === 'pronto' ? [{ key: 'entrega' as const, label: 'Entrega' }] : [])]} />

      {tab === 'resumo' && (<>
        <Card title="Serviços">{d.items.map((i: any, k: number) => <div key={k} className="row between check-row"><span>{i.name}{i.included && <Badge tone="info">clube</Badge>}</span><b>{brl(i.priceCents)}</b></div>)}
          <div className="row between" style={{ marginTop: 8 }}><b>Total</b><b><Money cents={d.totalCents} /></b></div>
          {d.status === 'entregue' && <p className="muted small">Pago: <Money cents={d.paidCents} />{d.cashbackEarnedCents > 0 && <> · cashback gerado: <Money cents={d.cashbackEarnedCents} /></>}{d.discountCents > 0 && <> · desconto: <Money cents={d.discountCents} /></>}</p>}
        </Card>
        {d.status === 'em_servico' && <button className="primary" disabled={busy} onClick={ready}>✅ Marcar como pronto e avisar o cliente</button>}
        {d.status === 'pronto' && phone && <a className="btn" href={waLink(phone, `Olá, ${d.customerName.split(' ')[0]}! Seu ${d.vehicleLabel} está pronto para retirada.`)} target="_blank" rel="noreferrer">💬 Avisar também pelo meu WhatsApp</a>}
        {d.checkout?.newIssues?.length > 0 && <div className="alert bad" style={{ marginTop: 12 }}><b>Danos novos na saída:</b> {d.checkout.newIssues.map((i: any) => `${i.name} (${i.states.map((s: string) => STATE_LABEL[s]).join(', ')})`).join('; ')}</div>}
        {d.status === 'entregue' && d.checkin.photoConsent && <button style={{ marginTop: 12 }} onClick={() => setPubOpen(true)}>✨ Publicar no antes e depois</button>}
        {(d.status === 'em_servico' || d.status === 'pronto') && <button className="danger sm" style={{ marginTop: 12, marginLeft: 8 }} onClick={() => { const reason = prompt('Motivo do cancelamento:'); if (reason) void run(() => api(`/orders/${id}/cancel`, { body: { reason } }), 'Ordem cancelada.').then(() => nav('/patio')); }}>Cancelar ordem</button>}
      </>)}

      {tab === 'entrada' && (<Card title={`Check-in em ${dmy(d.checkin.at)} por ${d.checkin.by}`}>
        <p className="small">Combustível: <b>{d.checkin.fuel}</b>{d.checkin.km != null && <> · {d.checkin.km} km</>}{d.checkin.belongings && <> · Pertences: <b>{d.checkin.belongings}</b></>}</p>
        {d.checkin.notes && <p className="small">Obs.: {d.checkin.notes}</p>}
        {damaged(d.checkin.items).length === 0 ? <div className="alert ok">Nenhum dano ou sujeira registrado na entrada.</div> : damaged(d.checkin.items).map((i: any) => <div key={i.id} className="row between check-row"><span>{i.name}</span><span>{i.states.map((s: string) => <Badge key={s} tone="warn">{STATE_LABEL[s]}</Badge>)}</span></div>)}
        <p className="muted small">✓ Cliente concordou com o estado registrado.</p>
      </Card>)}

      {tab === 'fotos' && (<Card title="Fotos" right={<button className="sm" onClick={() => extra.current?.click()}>+ Adicionar foto</button>}>
        <input ref={extra} type="file" accept="image/*" capture="environment" hidden onChange={addPhotoLater} />
        {!photos.data?.length ? <p className="muted">Sem fotos nesta ordem.</p> : (['checkin', 'checkout', 'vitrine'] as const).map((ph) => { const list = photos.data!.filter((p) => p.phase === ph); return list.length ? (
          <div key={ph}><h3>{ph === 'checkin' ? 'Entrada' : ph === 'checkout' ? 'Saída' : 'Vitrine'}</h3><div className="photo-grid" style={{ marginBottom: 12 }}>{list.map((p) => <div key={p.id} className="photo-slot" style={{ borderStyle: 'solid' }}><PrivatePhoto id={p.id} alt={p.angle} /><span className="lbl">{ANGLES.find((a) => a.key === p.angle)?.label ?? p.angle}</span></div>)}</div></div>) : null; })}
      </Card>)}

      {tab === 'entrega' && (<>
        <p className="muted">Confira o carro com o cliente. O que estava marcado na entrada aparece ao lado; marque só o que for <b>diferente</b> agora.</p>
        <Checklist items={checklist.data.filter((i) => d.checkin.items.some((x: any) => x.id === i.id))} value={out} onChange={setOut} before={before} />
        <Card title="Fotos de saída"><PhotoSlots files={outFiles} onChange={setOutFiles} /></Card>
        <Card title="Pagamento">
          <div className="grid g2">
            <MoneyInput label="Desconto" cents={discount} onChange={(c) => setDiscount(Math.min(c, d.totalCents))} />
            <div><MoneyInput label={`Usar cashback (saldo ${brl(balance.data?.balanceCents ?? 0)})`} cents={cashback} onChange={(c) => setCashback(Math.min(c, balance.data?.balanceCents ?? 0, d.totalCents - discount))} /></div>
          </div>
          <h2>A pagar: <Money cents={toPay} /></h2>
          {pays.map((p, i) => (
            <div key={i} className="row" style={{ marginBottom: 8 }}>
              <select style={{ flex: 2 }} value={p.method} onChange={(e) => setPays(pays.map((x, k) => (k === i ? { ...x, method: e.target.value } : x)))}>{METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
              <div style={{ flex: 1 }}><MoneyInput cents={p.amountCents} onChange={(c) => setPays(pays.map((x, k) => (k === i ? { ...x, amountCents: c } : x)))} /></div>
              <button className="sm" onClick={() => setPays(pays.filter((_, k) => k !== i))} aria-label="Remover">✕</button>
            </div>))}
          <button className="sm" onClick={() => setPays([...pays, { method: 'pix', amountCents: Math.max(toPay - paysSum, 0) }])}>+ Forma de pagamento</button>
          {paysSum !== toPay && toPay > 0 && <p className="small" style={{ color: 'var(--bad)' }}>Falta somar {brl(toPay - paysSum)}.</p>}
          <Field label="Observações da saída"><textarea value={outNotes} onChange={(e) => setOutNotes(e.target.value)} maxLength={600} /></Field>
          <Toggle label="O cliente conferiu o veículo e concorda com a entrega." checked={agree} onChange={setAgree} />
        </Card>
        <button className="primary" disabled={!agree || busy || paysSum !== toPay} onClick={deliver}>{busy ? 'Registrando…' : '🚗 Receber e entregar'}</button>
      </>)}

      {pubOpen && photos.data && <PublishModal orderId={o.id} photos={photos.data} onClose={() => setPubOpen(false)} onDone={() => { setPubOpen(false); toast('Publicado na vitrine!'); }} />}
    </Page>
  );
}

function PublishModal({ orderId, photos, onClose, onDone }: { orderId: string; photos: any[]; onClose: () => void; onDone: () => void }) {
  const [before, setBefore] = useState(''); const [after, setAfter] = useState(''); const [title, setTitle] = useState(''); const [hidden, setHidden] = useState(false);
  const [run, busy] = useAction();
  const pick = (val: string, set: (v: string) => void) => (<div className="photo-grid">{photos.map((p) => <button key={p.id} type="button" className="photo-slot" style={{ borderStyle: 'solid', borderColor: val === p.id ? 'var(--brand)' : undefined, borderWidth: val === p.id ? 3 : 2 }} onClick={() => set(p.id)}><PrivatePhoto id={p.id} alt={p.angle} /></button>)}</div>);
  return (
    <Modal title="Publicar antes e depois" onClose={onClose}>
      <h3>Foto ANTES (entrada)</h3>{pick(before, setBefore)}<h3 style={{ marginTop: 12 }}>Foto DEPOIS (saída)</h3>{pick(after, setAfter)}
      <Text label="Título" value={title} onChange={setTitle} placeholder="Ex.: Higienização completa de SUV" />
      <Toggle label="Confirmo que a placa e dados pessoais NÃO aparecem nas duas fotos." checked={hidden} onChange={setHidden} />
      <button className="primary" disabled={!before || !after || before === after || !title || !hidden || busy} onClick={async () => { const r = await run(() => api('/showcase', { body: { orderId, beforePhotoId: before, afterPhotoId: after, title, plateHidden: true } })); if (r) onDone(); }}>Publicar</button>
    </Modal>
  );
}
