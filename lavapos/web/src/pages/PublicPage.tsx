// Página pública do lava-rápido: serviços e preços, antes e depois, avaliações do Google e agendamento online.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, publicPhotoUrl } from '../api';
import { Card, Chip, Field, Loading, Select, Text, Toggle, useAction } from '../ui';
import { CAT_LABEL, addDaysIso, brl, dmy, maskPhone, maskPlate, todayIso, weekday } from '../format';

const DAY = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function PublicPage() {
  const { slug } = useParams();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [vc, setVc] = useState<any>(null);
  useEffect(() => { api(`/public/l/${slug}`).then(setD).catch((e) => setErr(e.message)); api('/public/vehicles').then(setVc).catch(() => {}); }, [slug]);
  const [cat, setCat] = useState('carro');
  if (err) return <div className="pub"><div className="alert bad" style={{ marginTop: 20 }}>{err}</div></div>;
  if (!d) return <div className="pub"><Loading /></div>;
  const g = d.google;
  return (
    <div className="pub">
      <header className="hero"><h1>{d.name}</h1><p>{d.message}</p>
        {g?.rating && <p><span className="stars">{'★'.repeat(Math.round(g.rating))}</span> {g.rating.toFixed(1)} · {g.count} avaliações no Google</p>}
        <div className="row"><a className="btn primary" href="#agendar">📅 Agendar agora</a>{g?.reviewUrl && <a className="btn" href={g.reviewUrl} target="_blank" rel="noreferrer">⭐ Avaliar no Google</a>}</div></header>

      <Card title="Serviços e valores">
        <div className="chips" style={{ marginBottom: 10 }}>{d.categories.map((c: any) => <Chip key={c.key} on={cat === c.key} onClick={() => setCat(c.key)}>{c.name}</Chip>)}</div>
        {d.services.map((s: any) => <div key={s.id} className="row between check-row"><span><b>{s.name}</b><br /><span className="muted small">{s.description} · {s.durationMin} min</span></span><b>{brl(s.prices[cat])}</b></div>)}
      </Card>

      {d.showcase.length > 0 && <Card title="Antes e depois">{d.showcase.map((s: any) => (<div key={s.id} style={{ marginBottom: 14 }}><b>{s.title}</b> <span className="muted small">{s.vehicle}</span><div className="ba"><figure><img src={publicPhotoUrl(slug!, s.before)} alt="Antes" loading="lazy" /><figcaption>Antes</figcaption></figure><figure><img src={publicPhotoUrl(slug!, s.after)} alt="Depois" loading="lazy" /><figcaption>Depois</figcaption></figure></div></div>))}</Card>}

      {g?.reviews?.length > 0 && <Card title="O que dizem no Google">{g.reviews.map((r: any, i: number) => <div key={i} className="check-row"><span className="stars">{'★'.repeat(r.rating)}</span> <b>{r.author}</b> <span className="muted small">{r.when}</span><p className="small">{r.text}</p></div>)}<p className="muted small">Avaliações do Google Maps.</p></Card>}

      {d.bookingEnabled && vc ? <Booking slug={slug!} d={d} vc={vc} initialCat={cat} /> : <Card title="Agendamento"><p>Fale com a gente{d.phone ? <>: <b>{maskPhone(d.phone)}</b></> : '.'}</p></Card>}

      <Card title="Horários">{d.hours.map((h: any, i: number) => <div key={i} className="row between small"><span>{DAY[i]}</span><span>{h.closed ? 'Fechado' : `${h.open} às ${h.close}`}</span></div>)}</Card>
      <p className="notice-foot">Página criada com LavaPos · <a href="/legal/privacidade">Privacidade</a>. Nunca pedimos senha ou dados de cartão por mensagem.</p>
    </div>
  );
}

function Booking({ slug, d, vc, initialCat }: { slug: string; d: any; vc: any; initialCat: string }) {
  const [f, setF] = useState({ name: '', whatsapp: '', email: '', plate: '', brand: '', model: '', year: '', categoryKey: initialCat });
  const [ids, setIds] = useState<string[]>([]); const [date, setDate] = useState(todayIso()); const [slots, setSlots] = useState<any[] | null>(null); const [start, setStart] = useState('');
  const [mk, setMk] = useState(false); const [accept, setAccept] = useState(false); const [website, setWebsite] = useState(''); const [done, setDone] = useState(''); const [run, busy] = useAction();
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  const models: [string, string][] = f.brand ? vc.brands[f.brand] ?? [] : [];
  const days = Array.from({ length: Math.min(d.maxDaysAhead, 14) }, (_, i) => addDaysIso(todayIso(), i));
  useEffect(() => { setStart(''); if (!ids.length) { setSlots(null); return; } api<any>(`/public/l/${slug}/slots?date=${date}&serviceIds=${ids.join(',')}`).then((r) => setSlots(r.slots)).catch(() => setSlots([])); }, [ids, date, slug]);
  const price = d.services.filter((s: any) => ids.includes(s.id)).reduce((a: number, s: any) => a + s.prices[f.categoryKey], 0);
  if (done) return <Card title="Agendamento feito! ✅"><p>{done}</p></Card>;
  const ok = f.name.length > 1 && f.whatsapp.replace(/\D/g, '').length >= 10 && f.plate.length === 7 && f.brand && f.model && f.year && ids.length && start && accept;
  return (
    <Card title="Agende seu horário"><div id="agendar" />
      <Field label="Seu veículo é…"><div className="chips">{d.categories.map((c: any) => <Chip key={c.key} on={f.categoryKey === c.key} onClick={() => setF({ ...f, categoryKey: c.key })}>{c.name}</Chip>)}</div></Field>
      <Field label="Serviços"><div className="chips">{d.services.map((s: any) => <Chip key={s.id} on={ids.includes(s.id)} onClick={() => setIds(ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id])}>{s.name.split('(')[0]} · {brl(s.prices[f.categoryKey])}</Chip>)}</div></Field>
      {ids.length > 0 && <p><b>Total: {brl(price)}</b></p>}
      <Field label="Dia"><div className="chips">{days.map((x) => <Chip key={x} on={date === x} onClick={() => setDate(x)}>{weekday(x)} {dmy(x).slice(0, 5)}</Chip>)}</div></Field>
      {slots && (slots.length === 0 ? <div className="alert warn">Sem horários livres neste dia. Tente outro.</div> : <Field label="Horário"><div className="chips">{slots.map((s) => <Chip key={s.start} on={start === s.start} onClick={() => setStart(s.start)}>{s.time}</Chip>)}</div></Field>)}
      <div className="grid g2">
        <Text label="Seu nome" value={f.name} onChange={(v) => setF({ ...f, name: v })} autoComplete="name" /><Text label="WhatsApp" value={maskPhone(f.whatsapp)} onChange={(v) => setF({ ...f, whatsapp: v })} inputMode="tel" autoComplete="tel" />
        <Text label="Placa" value={f.plate} onChange={(v) => setF({ ...f, plate: maskPlate(v) })} placeholder="ABC1D23" /><Text label="E-mail (opcional)" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Select label="Marca" value={f.brand} onChange={(v) => setF({ ...f, brand: v, model: '' })} options={Object.keys(vc.brands)} />
        <Select label="Modelo" value={f.model} onChange={(v) => setF({ ...f, model: v, categoryKey: models.find((m) => m[0] === v)?.[1] ?? f.categoryKey })} options={models.map((m) => m[0])} />
        <Select label="Ano" value={f.year} onChange={(v) => setF({ ...f, year: v })} options={years} />
      </div>
      <div aria-hidden style={{ position: 'absolute', left: -9999 }}><input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
      <Toggle label="Quero receber lembretes e ofertas desta lavagem (opcional)" checked={mk} onChange={setMk} />
      <Toggle label={<>Li e aceito a <a href="/legal/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</> as any} checked={accept} onChange={setAccept} />
      <button className="primary" style={{ width: '100%' }} disabled={!ok || busy} onClick={async () => { const r = await run(() => api<{ message: string }>(`/public/l/${slug}/book`, { body: { name: f.name, whatsapp: f.whatsapp, email: f.email, plate: f.plate, brand: f.brand, model: f.model, year: Number(f.year), categoryKey: f.categoryKey, serviceIds: ids, start, consentMarketing: mk, acceptTerms: true, website } })); if (r) setDone(r.message); }}>Confirmar agendamento</button>
    </Card>
  );
}
