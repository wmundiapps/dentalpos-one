// Parceiros SpaceHour (Corretor e Zelador): página pública com cadastro, painel do parceiro,
// área "Parceiros" do anúncio (anfitrião), contatos e vistoria na reserva e a aba da equipe.
// Lançamento só no Brasil: textos em português.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useApp } from '../state';
import { useI18n } from '../i18n';
import { errorText } from '../errors';
import { PhotoUploader } from '../components/PhotoUploader';
import { PARTNER_RULES } from '../../../shared/rules';

const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const ROLE: Record<string, string> = { broker: 'Corretor Parceiro', caretaker: 'Zelador Parceiro' };
const REF_KEY = 'sh_partner_ref';

const ERR: Record<string, string> = {
  partner_terms_required: 'Para continuar, aceite os termos de parceria.',
  partner_role_required: 'Escolha se você quer ser corretor, zelador ou os dois.',
  partner_invalid_tax_id: 'CPF ou CNPJ inválido. Confira os números.',
  partner_invalid_phone: 'Informe um celular com DDD (11 números), de preferência com WhatsApp.',
  partner_creci_required: 'Para ser corretor, informe o número e o estado do seu CRECI.',
  partner_pix_required: 'Informe uma chave Pix no seu nome.',
  partner_not_allowed: 'Este cadastro está suspenso ou foi recusado. Fale com o suporte.',
  partner_not_found: 'Não achamos um parceiro aprovado com esse e-mail e essa função. Peça para a pessoa se cadastrar em space-hour.com/parceiros.',
  partner_not_approved: 'Seu cadastro ainda não foi aprovado para essa função.',
  partner_self: 'O próprio anfitrião não pode ser parceiro do anúncio.',
  partner_invalid_fee: `A taxa do zelador precisa ficar entre ${brl(PARTNER_RULES.caretakerMinFee)} e ${brl(PARTNER_RULES.caretakerMaxFee)} por reserva.`,
  partner_role_taken: 'Este anúncio já tem um parceiro (ou convite em aberto) nessa função.',
  partner_end_reason_required: 'Para encerrar na hora (justa causa), descreva o motivo (mínimo de 10 letras).',
  inspection_photos_required: `Envie pelo menos ${PARTNER_RULES.inspectionMinPhotos} fotos do espaço (só do espaço, nunca de pessoas ou documentos).`,
  telegram_not_configured: 'O aviso pelo Telegram ainda está sendo ligado pela equipe. Por enquanto, você recebe por e-mail.',
  listing_not_found: 'Anúncio não encontrado. Cole o link do anúncio (space-hour.com/espacos/...).',
};
function useErr() {
  const { t } = useI18n();
  return (e: unknown) => (e instanceof ApiError && ERR[e.code]) || errorText(e, t);
}

/** Guarda o código do corretor que indicou (link /parceiros?ref=...) e envia quando a pessoa entra. */
export function useReferralCapture() {
  const { me } = useApp();
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref && /^[A-Za-z0-9]{6,12}$/.test(ref)) localStorage.setItem(REF_KEY, ref);
      const saved = localStorage.getItem(REF_KEY);
      if (me && saved) api('/partner/referral', { body: { ref: saved } }).then(() => localStorage.removeItem(REF_KEY)).catch(() => {});
    } catch { /* sem storage */ }
  }, [me]);
}

// ───────────── Página pública + cadastro ─────────────
export function PartnersLanding() {
  const { me } = useApp();
  useEffect(() => { document.title = 'Seja parceiro SpaceHour: corretor e zelador | SpaceHour'; }, []);
  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="container">
          <p className="lp-kicker">Para corretores, imobiliárias e zeladores</p>
          <h1>Ganhe em toda reserva dos espaços que você traz ou atende.</h1>
          <p className="lp-lead">O SpaceHour aluga salas, consultórios e salas de reunião por hora. Cadastre os espaços ociosos dos seus clientes e receba a cada reserva, sem custo para participar.</p>
          {me ? <a className="btn btn-primary" href="#cadastro">Quero ser parceiro</a> : <Link className="btn btn-primary" to="/cadastro?next=/parceiros%23cadastro">Criar conta e ser parceiro</Link>}
        </div>
      </section>
      <div className="container">
        <section className="lp-benefits">
          <div className="panel">
            <h3>🏢 Corretor Parceiro</h3>
            <p><b>{brl(PARTNER_RULES.brokerMinFee)} ou {PARTNER_RULES.brokerDayRate * 100}% da diária</b> (o que for maior) em <b>toda reserva</b> dos espaços que você captou, enquanto durar a parceria. Paga pelo locatário, sem tirar nada do proprietário.</p>
            <p className="muted small">Precisa de CRECI ativo (Lei 6.530/78).</p>
          </div>
          <div className="panel">
            <h3>🔑 Zelador Parceiro</h3>
            <p>Entregue o acesso, faça a vistoria de entrada e de saída com fotos e atenda o locatário durante a reserva. Você recebe uma <b>taxa fixa por reserva</b>, combinada com o anfitrião para cada espaço.</p>
            <p className="muted small">A mesma pessoa pode ser corretor e zelador.</p>
          </div>
          <div className="panel">
            <h3>💸 Exemplo</h3>
            <p>Locação de {brl(1000)}: o proprietário recebe {brl(800)}. Com corretor ({brl(100)}) e zelador ({brl(150)}), o locatário paga {brl(1250)}. O SpaceHour repassa {brl(100)} ao corretor e {brl(150)} ao zelador por Pix, até o dia {PARTNER_RULES.payoutDay} do mês seguinte ao check-out.</p>
          </div>
        </section>
        <section className="panel">
          <h2>Como funciona</h2>
          <ol>
            <li>Faça o cadastro abaixo. A equipe confere os dados em até 2 dias úteis.</li>
            <li>Mande o seu link de indicação aos proprietários ou peça o vínculo com um anúncio que já existe. O proprietário confirma.</li>
            <li>A cada reserva paga, você recebe um aviso por e-mail e pelo Telegram ou WhatsApp com os dados do locatário.</li>
            <li>Atenda conforme as <Link to="/regras/partner-conduct">Regras de Conduta</Link>. O repasse sai todo mês.</li>
          </ol>
        </section>
        <section id="cadastro">{me ? <PartnerSignup /> : (
          <div className="panel"><h2>Cadastro de parceiro</h2><p>Para se cadastrar, entre na sua conta SpaceHour ou crie uma (é grátis).</p>
            <Link className="btn btn-primary" to="/entrar?next=/parceiros%23cadastro">Entrar</Link> <Link className="btn btn-outline" to="/cadastro?next=/parceiros%23cadastro">Criar conta</Link></div>
        )}</section>
      </div>
    </div>
  );
}

type PartnerRow = {
  user_id: string; roles: string[]; status: string; tax_id: string; phone: string; creci: string | null; creci_uf: string | null; pix_key: string;
  cities: string; about: string | null; ref_code: string; telegramLinked: boolean; referralLink: string; decision_note: string | null;
};

function PartnerSignup({ current, onSaved }: { current?: PartnerRow | null; onSaved?: () => void }) {
  const err = useErr();
  const [f, setF] = useState({
    broker: current ? current.roles.includes('broker') : true, caretaker: current ? current.roles.includes('caretaker') : false,
    taxId: current?.tax_id ?? '', phone: current?.phone ?? '', creci: current?.creci ?? '', creciUf: current?.creci_uf ?? 'PR',
    pixKey: current?.pix_key ?? '', cities: current?.cities ?? '', about: current?.about ?? '', accept: false,
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  async function save() {
    setBusy(true); setMsg('');
    try {
      await api('/partner/me', { body: {
        roles: [...(f.broker ? ['broker'] : []), ...(f.caretaker ? ['caretaker'] : [])], taxId: f.taxId, phone: f.phone,
        creci: f.broker ? f.creci : undefined, creciUf: f.broker ? f.creciUf : undefined, pixKey: f.pixKey, cities: f.cities,
        about: f.about || undefined, acceptTerms: f.accept,
      } });
      setMsg('ok');
      onSaved?.();
    } catch (e) { setMsg(err(e)); } finally { setBusy(false); }
  }
  if (msg === 'ok' && !current) return <div className="panel notice success"><h2>Cadastro enviado! ✅</h2><p>A equipe confere seus dados em até 2 dias úteis. Acompanhe em <Link to="/parceiro">Painel do parceiro</Link>.</p></div>;
  return (
    <div className="panel">
      <h2>{current ? 'Meus dados de parceiro' : 'Cadastro de parceiro'}</h2>
      <div className="row gap wrap">
        <label className="check"><input type="checkbox" checked={f.broker} onChange={(e) => set('broker', e.target.checked)} /> Corretor Parceiro (capto espaços)</label>
        <label className="check"><input type="checkbox" checked={f.caretaker} onChange={(e) => set('caretaker', e.target.checked)} /> Zelador Parceiro (chaves, vistoria e atendimento)</label>
      </div>
      <div className="form-grid">
        <label>CPF ou CNPJ<input inputMode="numeric" value={f.taxId} onChange={(e) => set('taxId', e.target.value)} /></label>
        <label>Celular com WhatsApp<input inputMode="tel" placeholder="(44) 99999-9999" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        {f.broker && <label>CRECI<input value={f.creci} placeholder="F12345 ou J1234" onChange={(e) => set('creci', e.target.value)} /></label>}
        {f.broker && <label>Estado do CRECI<input maxLength={2} value={f.creciUf} onChange={(e) => set('creciUf', e.target.value.toUpperCase())} /></label>}
        <label>Chave Pix (no seu nome)<input value={f.pixKey} onChange={(e) => set('pixKey', e.target.value)} /></label>
        <label>Cidades em que atende<input placeholder="Maringá, Sarandi, Paiçandu" value={f.cities} onChange={(e) => set('cities', e.target.value)} /></label>
        <label className="span2">Sobre você (opcional)<textarea value={f.about} onChange={(e) => set('about', e.target.value)} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={f.accept} onChange={(e) => set('accept', e.target.checked)} /> Li e aceito o{' '}
        <Link to="/regras/partner-terms" target="_blank">Termo de Parceria</Link>, o <Link to="/regras/partner-confidentiality" target="_blank">Termo de Confidencialidade</Link> e as{' '}
        <Link to="/regras/partner-conduct" target="_blank">Regras de Conduta e Atendimento</Link>.</label>
      {msg && msg !== 'ok' && <p className="errors">{msg}</p>}
      {msg === 'ok' && <p className="notice success">Dados salvos.</p>}
      <button className="btn btn-primary" disabled={busy} onClick={save}>{current ? 'Salvar' : 'Enviar cadastro'}</button>
      {current && <p className="muted small">Se mudar o CPF/CNPJ, a chave Pix, o CRECI ou pedir uma função nova, o cadastro volta para análise.</p>}
    </div>
  );
}

// ───────────── Painel do parceiro ─────────────
type Dash = {
  partner: PartnerRow | null;
  links?: Array<{ id: string; listing_id: string; role: string; status: string; caretaker_fee: number | null; title: string; city: string; host_name: string; ends_at: string | null }>;
  bookings?: Array<{ id: string; status: string; occurrences: { date: string; start: string; end: string }[]; guests: number; purpose: string; role: string; fee: number;
    listing: { id: string; title: string; city: string; address?: string }; guest?: { name: string; phone?: string; email: string }; end: string }>;
  earnings?: Array<{ id: string; title: string; role: string; amount: number; gross: number; status: string; due_month: string | null; paid_ref: string | null }>;
  totals?: { held: number; due: number; paid: number };
};
const STATUS: Record<string, string> = { pending: 'Em análise', approved: 'Aprovado', rejected: 'Recusado', suspended: 'Suspenso' };
const EARN: Record<string, string> = { held: 'Aguardando check-out', due: 'A receber', paid: 'Pago', void: 'Cancelada', blocked: 'Retido para análise' };
const LINK: Record<string, string> = { pending_host: 'Aguardando o anfitrião', pending_partner: 'Convite para você', active: 'Ativa' };
const wa = (phone?: string) => (phone ? `https://wa.me/55${phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}` : undefined);

export function PartnerDashboard() {
  const err = useErr();
  const { bookingId } = useParams();
  const [d, setD] = useState<Dash | null>(null);
  const [msg, setMsg] = useState('');
  const [req, setReq] = useState({ listing: '', role: 'broker', fee: '' });
  const load = () => api<Dash>('/partner/me').then(setD).catch((e) => setMsg(err(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bookingId && d) document.getElementById(`b-${bookingId}`)?.scrollIntoView({ behavior: 'smooth' }); }, [bookingId, d]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setMsg(err(e)); } };
  if (!d) return <div className="container">{msg && <p className="errors">{msg}</p>}</div>;
  if (!d.partner) return <div className="container narrow"><h1>Painel do parceiro</h1><p>Você ainda não é parceiro.</p><PartnerSignup onSaved={load} /></div>;
  const p = d.partner;
  return (
    <div className="container">
      <h1>Painel do parceiro</h1>
      {msg && <p className="notice">{msg}</p>}
      <div className="panel">
        <div className="row between wrap gap">
          <div><b>{p.roles.map((r) => ROLE[r]).join(' e ')}</b> · <span className="badge">{STATUS[p.status]}</span>{p.creci && <span className="muted small"> · CRECI {p.creci}/{p.creci_uf}</span>}</div>
          <Link to="/regras/partner-conduct" className="small">Regras de Conduta</Link>
        </div>
        {p.status === 'pending' && <p className="notice">Seu cadastro está em análise (até 2 dias úteis).</p>}
        {(p.status === 'rejected' || p.status === 'suspended') && <p className="notice warn">{STATUS[p.status]}{p.decision_note ? `: ${p.decision_note}` : ''}</p>}
        {p.status === 'approved' && p.roles.includes('broker') && (
          <p>Seu link de indicação: <code>{p.referralLink}</code>{' '}
            <button className="btn btn-outline small" onClick={() => navigator.clipboard?.writeText(p.referralLink).then(() => setMsg('Link copiado.'))}>Copiar</button>{' '}
            <a className="btn btn-outline small" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Anuncie sua sala ou consultório por hora no SpaceHour, grátis: ${p.referralLink}`)}`}>Enviar por WhatsApp</a></p>
        )}
        <p>{p.telegramLinked ? '✅ Avisos pelo Telegram ligados.' : 'Receba os avisos de reserva na hora pelo Telegram:'}{' '}
          {!p.telegramLinked && <button className="btn btn-outline small" onClick={() => act(async () => { const r = await api<{ link: string }>('/partner/telegram-link', { body: {} }); window.open(r.link, '_blank'); })}>Ligar Telegram</button>}</p>
      </div>

      <div className="panel">
        <h2>Ganhos</h2>
        <div className="row gap wrap">
          <span>Aguardando check-out: <b>{brl(d.totals?.held ?? 0)}</b></span>
          <span>A receber: <b>{brl(d.totals?.due ?? 0)}</b></span>
          <span>Já pago: <b>{brl(d.totals?.paid ?? 0)}</b></span>
        </div>
        <p className="muted small">Repasse por Pix ({p.pix_key}) até o dia {PARTNER_RULES.payoutDay} do mês seguinte ao check-out, descontado o que voltou ao locatário em cancelamento. Emita nota fiscal (MEI/empresa) ou receba por RPA.</p>
        {!!d.earnings?.length && <table className="table small"><tbody>{d.earnings.map((e) => (
          <tr key={e.id}><td>{e.title}</td><td>{ROLE[e.role]}</td><td>{brl(e.amount)}</td><td>{EARN[e.status]}{e.paid_ref ? ` (${e.paid_ref})` : ''}</td></tr>
        ))}</tbody></table>}
      </div>

      <div className="panel">
        <h2>Meus espaços</h2>
        {!d.links?.length && <p className="muted">Nenhum espaço ainda. Peça o vínculo abaixo ou mande o seu link de indicação ao proprietário.</p>}
        {d.links?.map((l) => (
          <div key={l.id} className="row between wrap gap">
            <span><Link to={`/espacos/${l.listing_id}`}>{l.title}</Link> ({l.city}) · {ROLE[l.role]}{l.caretaker_fee ? ` · ${brl(l.caretaker_fee)}/reserva` : ''} · <span className="badge">{LINK[l.status]}</span>{l.ends_at && <span className="muted small"> · termina em {new Date(l.ends_at).toLocaleDateString('pt-BR')}</span>}</span>
            <span className="row gap">
              {l.status === 'pending_partner' && <><button className="btn btn-primary small" onClick={() => act(() => api(`/partner-links/${l.id}/respond`, { body: { accept: true } }), 'Parceria aceita.')}>Aceitar</button>
                <button className="btn btn-ghost small" onClick={() => act(() => api(`/partner-links/${l.id}/respond`, { body: { accept: false } }))}>Recusar</button></>}
              {l.status === 'active' && !l.ends_at && <button className="btn btn-ghost small" onClick={() => { if (confirm(`Encerrar a parceria? Você segue responsável pelas reservas dos próximos ${PARTNER_RULES.hostEndNoticeDays} dias.`)) act(() => api(`/partner-links/${l.id}/end`, { body: { reason: 'pedido do parceiro' } })); }}>Encerrar</button>}
              {l.status === 'pending_host' && <button className="btn btn-ghost small" onClick={() => act(() => api(`/partner-links/${l.id}/end`, { body: { reason: 'pedido cancelado' } }))}>Cancelar pedido</button>}
            </span>
          </div>
        ))}
        {p.status === 'approved' && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="span2">Link do anúncio no SpaceHour<input placeholder="https://space-hour.com/espacos/lst_..." value={req.listing} onChange={(e) => setReq({ ...req, listing: e.target.value })} /></label>
            <label>Função<select value={req.role} onChange={(e) => setReq({ ...req, role: e.target.value })}>{p.roles.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
            {req.role === 'caretaker' && <label>Sua taxa por reserva (R$)<input inputMode="decimal" value={req.fee} onChange={(e) => setReq({ ...req, fee: e.target.value })} /></label>}
            <div className="span2"><button className="btn btn-outline" onClick={() => act(() => api('/partner/requests', { body: { listing: req.listing, role: req.role, caretakerFee: req.role === 'caretaker' ? Number(req.fee.replace(',', '.')) : undefined } }), 'Pedido enviado. O anfitrião vai confirmar.')}>Pedir vínculo</button></div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Reservas</h2>
        {!d.bookings?.length && <p className="muted">Nenhuma reserva paga ainda nos seus espaços.</p>}
        {d.bookings?.map((b) => (
          <div key={b.id} id={`b-${b.id}`} className="panel">
            <div className="row between wrap gap"><b>{b.listing.title}</b><span className="badge">{ROLE[b.role]} · {brl(b.fee)}</span></div>
            <p className="small">{b.occurrences.map((o) => `${fmtDate(o.date)} ${o.start}–${o.end}`).join(' · ')} · {b.guests} pessoa(s) · {b.purpose}</p>
            {b.listing.address && <p className="small">📍 {b.listing.address}</p>}
            {b.guest ? <p className="small">Locatário: <b>{b.guest.name}</b>{b.guest.phone && <> · <a href={`tel:${b.guest.phone}`}>{b.guest.phone}</a> · <a href={wa(b.guest.phone)} target="_blank" rel="noreferrer">WhatsApp</a></>} · <a href={`mailto:${b.guest.email}`}>{b.guest.email}</a></p>
              : <p className="muted small">Dados do locatário apagados da sua visão ({PARTNER_RULES.dataRetentionDays} dias após o fim) ou reserva cancelada.</p>}
            {['confirmed', 'checked_in', 'completed'].includes(b.status) && <Inspections bookingId={b.id} canWrite />}
          </div>
        ))}
      </div>

      <details className="panel"><summary>Meus dados de parceiro</summary><PartnerSignup current={p} onSaved={load} /></details>
    </div>
  );
}

// ───────────── Vistoria (entrada, saída e manutenção) ─────────────
type Inspection = { id: string; kind: string; author_name: string; notes: string | null; photos: string[]; checklist: Record<string, boolean>; created_at: string };
const KIND: Record<string, string> = { check_in: 'Vistoria de entrada', check_out: 'Vistoria de saída', maintenance: 'Manutenção' };
const CHECK = ['Limpeza', 'Equipamentos funcionando', 'Móveis sem danos', 'Banheiro', 'Chaves/acesso conferidos'];

export function Inspections({ bookingId, canWrite, guest }: { bookingId: string; canWrite?: boolean; guest?: boolean }) {
  const err = useErr();
  const [list, setList] = useState<Inspection[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: 'check_in', notes: '', photos: [] as string[], checklist: {} as Record<string, boolean> });
  const [msg, setMsg] = useState('');
  const load = () => api<Inspection[]>(`/inspections?booking=${bookingId}`).then(setList).catch(() => {});
  useEffect(() => { load(); }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setMsg('');
    try {
      await api('/inspections', { body: { bookingId, ...form } });
      setOpen(false); setForm({ kind: 'check_in', notes: '', photos: [], checklist: {} }); load();
    } catch (e) { setMsg(err(e)); }
  }
  return (
    <div>
      <h3 className="small">Vistorias</h3>
      {!list.length && <p className="muted small">Nenhuma vistoria registrada.</p>}
      {list.map((i) => (
        <div key={i.id} className="small">
          <b>{KIND[i.kind]}</b> · {i.author_name} · {new Date(i.created_at).toLocaleString('pt-BR')}{i.notes && <> · {i.notes}</>}
          <div className="row gap wrap">{i.photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" width={72} height={72} style={{ objectFit: 'cover', borderRadius: 6 }} /></a>)}</div>
        </div>
      ))}
      {canWrite && !open && <button className="btn btn-outline small" onClick={() => setOpen(true)}>Registrar vistoria</button>}
      {canWrite && open && (
        <div className="panel">
          <label>Tipo<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="check_in">Vistoria de entrada</option><option value="check_out">Vistoria de saída</option><option value="maintenance">Manutenção / problema</option></select></label>
          <div className="row gap wrap">{CHECK.map((c) => (
            <label key={c} className="check small"><input type="checkbox" checked={!!form.checklist[c]} onChange={(e) => setForm({ ...form, checklist: { ...form.checklist, [c]: e.target.checked } })} /> {c}</label>
          ))}</div>
          <label>Observações<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <p className="muted small">Fotos só do espaço (mínimo {guest ? 1 : PARTNER_RULES.inspectionMinPhotos}). Nunca fotografe pessoas, pacientes, telas ou documentos.</p>
          <PhotoUploader photos={form.photos} onChange={(ph) => setForm({ ...form, photos: ph })} />
          {msg && <p className="errors small">{msg}</p>}
          <div className="row gap"><button className="btn btn-primary small" onClick={save}>Salvar vistoria</button><button className="btn btn-ghost small" onClick={() => setOpen(false)}>Cancelar</button></div>
        </div>
      )}
    </div>
  );
}

// ───────────── Na reserva: contatos dos parceiros ─────────────
type Contact = { role: string; name: string; email: string; phone?: string; whatsapp?: string | null; creci?: string };
export function BookingPartners({ bookingId, isGuest }: { bookingId: string; isGuest: boolean }) {
  const [list, setList] = useState<Contact[] | null>(null);
  useEffect(() => { api<{ partners: Contact[] }>(`/bookings/${bookingId}/partners`).then((r) => setList(r.partners)).catch(() => setList([])); }, [bookingId]);
  return (
    <section className="panel">
      {!!list?.length && <>
        <h2>Parceiros desta reserva</h2>
        {list.map((c) => (
          <p key={c.role}><b>{ROLE[c.role]}:</b> {c.name}{c.creci && <span className="muted small"> · CRECI {c.creci}</span>}
            {c.phone && <> · <a href={`tel:${c.phone}`}>{c.phone}</a></>}{c.whatsapp && <> · <a href={c.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a></>} · <a href={`mailto:${c.email}`}>{c.email}</a></p>
        ))}
        <p className="muted small">{isGuest ? 'Combine com o zelador a entrega do acesso.' : 'Parceiros do anúncio.'} Pagamento é só pela plataforma: ninguém pode cobrar nada por fora.</p>
      </>}
      <Inspections bookingId={bookingId} canWrite guest={isGuest} />
    </section>
  );
}

// ───────────── No anúncio (anfitrião) ─────────────
type LinkRow = { id: string; role: string; status: string; name: string; email: string; creci: string | null; creci_uf: string | null; phone: string | null; caretaker_fee: number | null; can_edit: boolean; ends_at: string | null };
export function ListingPartners({ listingId }: { listingId: string }) {
  const err = useErr();
  const [list, setList] = useState<LinkRow[]>([]);
  const [f, setF] = useState({ email: '', role: 'caretaker', fee: '' });
  const [msg, setMsg] = useState('');
  const load = () => api<LinkRow[]>(`/listings/${listingId}/partners`).then(setList).catch(() => {});
  useEffect(() => { load(); }, [listingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setMsg(err(e)); } };
  return (
    <section className="panel" id="parceiros">
      <h2>Parceiros (corretor e zelador)</h2>
      <p className="muted small">O corretor ganha {brl(PARTNER_RULES.brokerMinFee)} ou {PARTNER_RULES.brokerDayRate * 100}% da diária por reserva; o zelador, a taxa combinada. As duas taxas são pagas pelo locatário e <b>não saem da sua parte</b>. Você continua responsável pelo espaço perante o locatário. <Link to="/parceiros">Como funciona</Link></p>
      {msg && <p className="notice">{msg}</p>}
      {list.map((l) => (
        <div key={l.id} className="row between wrap gap">
          <span><b>{ROLE[l.role]}:</b> {l.name}{l.creci && ` · CRECI ${l.creci}/${l.creci_uf}`}{l.caretaker_fee ? ` · ${brl(l.caretaker_fee)}/reserva` : ''} · <span className="badge">{l.status === 'pending_host' ? 'Pediu para ser parceiro' : l.status === 'pending_partner' ? 'Convite enviado' : 'Ativo'}</span>{l.ends_at && <span className="muted small"> · termina em {new Date(l.ends_at).toLocaleDateString('pt-BR')}</span>}</span>
          <span className="row gap wrap">
            {l.status === 'pending_host' && <><button className="btn btn-primary small" onClick={() => act(() => api(`/partner-links/${l.id}/respond`, { body: { accept: true } }), 'Parceiro aceito.')}>Aceitar</button>
              <button className="btn btn-ghost small" onClick={() => act(() => api(`/partner-links/${l.id}/respond`, { body: { accept: false } }))}>Recusar</button></>}
            {l.status === 'active' && !l.ends_at && <button className="btn btn-ghost small" onClick={() => {
              const reason = prompt(`Motivo do encerramento. Deixe em branco para encerrar com ${PARTNER_RULES.hostEndNoticeDays} dias de aviso. Escreva o motivo e confirme para encerrar agora por justa causa (ex.: não entregou a chave).`);
              if (reason === null) return;
              act(() => api(`/partner-links/${l.id}/end`, { body: { reason, immediate: reason.trim().length >= 10 } }));
            }}>Encerrar</button>}
            {l.status === 'pending_partner' && <button className="btn btn-ghost small" onClick={() => act(() => api(`/partner-links/${l.id}/end`, { body: { reason: 'convite cancelado' } }))}>Cancelar convite</button>}
          </span>
        </div>
      ))}
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label>E-mail do parceiro<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Função<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="caretaker">Zelador Parceiro</option><option value="broker">Corretor Parceiro</option></select></label>
        {f.role === 'caretaker' && <label>Taxa por reserva (R$)<input inputMode="decimal" placeholder="ex.: 60" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></label>}
        <div className="span2"><button className="btn btn-outline" onClick={() => act(() => api(`/listings/${listingId}/partners`, { body: { email: f.email, role: f.role, caretakerFee: f.role === 'caretaker' ? Number(f.fee.replace(',', '.')) : undefined } }), 'Convite enviado.')}>Convidar parceiro</button></div>
      </div>
      <p className="muted small">O parceiro precisa ter cadastro aprovado em <Link to="/parceiros">space-hour.com/parceiros</Link>.</p>
    </section>
  );
}

// ───────────── Equipe: aprovação e repasses ─────────────
type AdminPartner = PartnerRow & { name: string; email: string; active_links: number; created_at: string };
type Payout = { user_id: string; name: string; email: string; pix_key: string; tax_id: string; due_month: string; bookings: number; amount: number; ids: string[] };
export function PartnersAdmin() {
  const err = useErr();
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState<AdminPartner[]>([]);
  const [pay, setPay] = useState<Payout[]>([]);
  const [msg, setMsg] = useState('');
  const load = () => {
    api<AdminPartner[]>(`/admin/partners${status ? `?status=${status}` : ''}`).then(setList).catch((e) => setMsg(err(e)));
    api<Payout[]>('/admin/partner-payouts').then(setPay).catch(() => {});
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (userId: string, decision: string) => {
    const note = decision === 'approved' ? undefined : prompt('Motivo (vai para o parceiro):') ?? undefined;
    try { await api(`/admin/partners/${userId}/decision`, { body: { decision, note } }); load(); } catch (e) { setMsg(err(e)); }
  };
  return (
    <div>
      {msg && <p className="errors">{msg}</p>}
      <div className="row gap wrap">{[['pending', 'Em análise'], ['approved', 'Aprovados'], ['suspended', 'Suspensos'], ['rejected', 'Recusados'], ['', 'Todos']].map(([k, v]) => (
        <button key={k} className={`btn small ${status === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setStatus(k)}>{v}</button>))}</div>
      {list.map((p) => (
        <div key={p.user_id} className="panel">
          <b>{p.name}</b> · {p.email} · {p.roles.map((r) => ROLE[r]).join(' e ')} · <span className="badge">{STATUS[p.status]}</span>
          <p className="small">CPF/CNPJ {p.tax_id} · Celular {p.phone} · Pix {p.pix_key} · {p.cities}{p.creci && <> · <b>CRECI {p.creci}/{p.creci_uf}</b> (<a href="https://www.crecipr.gov.br/" target="_blank" rel="noreferrer">conferir no CRECI-PR</a>)</>} · {p.active_links} espaço(s)</p>
          {p.about && <p className="small muted">{p.about}</p>}
          <div className="row gap">
            {p.status !== 'approved' && <button className="btn btn-primary small" onClick={() => decide(p.user_id, 'approved')}>Aprovar</button>}
            {p.status === 'pending' && <button className="btn btn-ghost small" onClick={() => decide(p.user_id, 'rejected')}>Recusar</button>}
            {p.status === 'approved' && <button className="btn btn-ghost small" onClick={() => decide(p.user_id, 'suspended')}>Suspender</button>}
          </div>
        </div>
      ))}
      <h2>Repasses a fazer</h2>
      <p className="muted small">Pague por Pix até o dia {PARTNER_RULES.payoutDay} e marque como pago (informe o código do Pix).</p>
      {!pay.length && <p className="muted">Nada a repassar agora.</p>}
      {pay.map((r) => (
        <div key={`${r.user_id}-${r.due_month}`} className="row between wrap gap panel">
          <span><b>{r.name}</b> · {r.due_month} · {r.bookings} reserva(s) · <b>{brl(r.amount)}</b> · Pix {r.pix_key} · {r.tax_id}</span>
          <button className="btn btn-outline small" onClick={async () => {
            const ref = prompt('Código/ID do Pix enviado:'); if (!ref) return;
            try { await api('/admin/partner-payouts/paid', { body: { ids: r.ids, ref } }); load(); } catch (e) { setMsg(err(e)); }
          }}>Marcar como pago</button>
        </div>
      ))}
    </div>
  );
}

