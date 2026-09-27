import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiBlobUrl } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { useApp } from '../state';
import { IncidentItem } from './BookingPage';
import type { Incident, Notification } from '../../../shared/types';
import { errorText } from '../errors';
import { formatDateTime } from '../format';

export function Notifications() {
  const { t, locale } = useI18n();
  const [list, setList] = useState<Notification[]>([]);
  useEffect(() => {
    api<Notification[]>('/notifications').then((n) => { setList(n); api('/notifications/read', { body: {} }).catch(() => {}); }).catch(() => {});
  }, []);
  return (
    <div className="container narrow">
      <h1>{t('nav.notifications')}</h1>
      {list.length === 0 && <p className="muted">{t('notifications.empty')}</p>}
      <ul className="notif-list">
        {list.map((n) => (
          <li key={n.id} className={n.read ? '' : 'unread'}>
            {n.link ? <Link to={n.link}>{n.text}</Link> : n.text}
            <div className="muted small">{formatDateTime(n.createdAt, locale)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncidentPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { me } = useApp();
  const [inc, setInc] = useState<Incident | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const load = () => api<Incident>(`/incidents/${id}`).then(async (i) => {
    setInc(i);
    const b = await api<{ price: { currency: string } }>(`/bookings/${i.bookingId}`);
    setCurrency(b.price.currency);
  }).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!inc || !me) return <div className="container narrow">{error && <p className="errors">{error}</p>}</div>;
  return (
    <div className="container narrow">
      <h1>{t('incident.title')}</h1>
      <IncidentItem inc={inc} currency={currency} meId={me.id} onChange={load} />
      <p><Link to={`/reservas/${inc.bookingId}`}>{t('incident.viewBooking')}</Link> · <Link to="/regras/disputes">{t('legal.disputes')}</Link></p>
    </div>
  );
}

function Incidents() {
  const { t } = useI18n();
  const [list, setList] = useState<Incident[]>([]);
  const [form, setForm] = useState<Record<string, { amount: string; note: string }>>({});
  const [error, setError] = useState('');
  const load = () => api<Incident[]>('/admin/incidents').then(setList).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function resolve(i: Incident, reject: boolean) {
    const f = form[i.id] ?? { amount: String(i.requestedAmount), note: '' };
    try { await api(`/admin/incidents/${i.id}/resolve`, { body: { chargedAmount: Number(f.amount || 0), note: f.note || 'mediação', reject } }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  return (
    <div>
      {error && <p className="errors">{error}</p>}
      {list.length === 0 && <p className="muted">{t('admin.empty')}</p>}
      {list.map((i) => (
        <div key={i.id} className="panel">
          <strong>{t(`incident.type.${i.type}` as never)}</strong> · {t(`incident.status.${i.status}` as never)} · <Link to={`/reservas/${i.bookingId}`}>#{i.bookingId.slice(-8)}</Link>
          <p>{i.description}</p>
          {i.guestResponse && <p className="response small">{i.guestResponse}</p>}
          <div className="row gap wrap">
            <label>{t('admin.amount')}<input type="number" defaultValue={i.requestedAmount} onChange={(e) => setForm({ ...form, [i.id]: { ...(form[i.id] ?? { note: '' }), amount: e.target.value } })} /></label>
            <label className="grow">{t('admin.note')}<input onChange={(e) => setForm({ ...form, [i.id]: { ...(form[i.id] ?? { amount: String(i.requestedAmount) }), note: e.target.value } })} /></label>
            <button className="btn btn-primary" onClick={() => resolve(i, false)}>{t('admin.uphold')}</button>
            <button className="btn btn-outline" onClick={() => resolve(i, true)}>{t('admin.reject')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

type Tab = 'incidents' | 'verifications' | 'feedback' | 'campaign' | 'assistant' | 'users';

export function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('verifications');
  return (
    <div className="container">
      <h1>{t('admin.title')}</h1>
      <div className="segmented" role="tablist">
        {(['verifications', 'users', 'incidents', 'feedback', 'assistant', 'campaign'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(k === 'incidents' ? 'admin.tabIncidents' : k === 'verifications' ? 'admin.tabVerifications' : k === 'campaign' ? 'admin.tabCampaign' : k === 'assistant' ? 'admin.tabAssistant' : k === 'users' ? 'admin.tabUsers' : 'admin.tabFeedback')}
          </button>
        ))}
      </div>
      {tab === 'incidents' && <Incidents />}
      {tab === 'verifications' && <Verifications />}
      {tab === 'feedback' && <FeedbackAdmin />}
      {tab === 'campaign' && <CampaignAdmin />}
      {tab === 'assistant' && <AssistantAdmin />}
      {tab === 'users' && <UsersAdmin />}
    </div>
  );
}

type Verification = {
  id: string; user_name: string; email: string; full_name: string; country_code: string; category: string | null; body: string; number: string;
  region: string | null; status: string; created_at: string;
  ai_result: { ai?: { decision: string; confidence: string; reasons: string[]; public_registry_found_active: boolean | null; extracted: Record<string, string | null> } | null; error?: string | null } | null;
};

function Verifications() {
  const { t, locale } = useI18n();
  const [list, setList] = useState<Verification[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const load = () => api<Verification[]>('/admin/verifications').then(setList).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function decide(v: Verification, status: 'approved' | 'rejected') {
    try { await api(`/admin/verifications/${v.id}/decision`, { body: { status, note: notes[v.id] || undefined } }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  async function openDoc(v: Verification) {
    try { window.open(await apiBlobUrl(`/admin/verifications/${v.id}/document`), '_blank', 'noopener'); } catch (e) { setError(errorText(e, t)); }
  }
  return (
    <div>
      {error && <p className="errors">{error}</p>}
      {list.length === 0 && <p className="muted">{t('admin.verificationsEmpty')}</p>}
      {list.map((v) => {
        const ai = v.ai_result?.ai;
        return (
          <div key={v.id} className="panel">
            <div className="row between wrap">
              <strong>{v.full_name} · {v.body} {v.number} {v.region ?? ''} · {v.country_code}</strong>
              <span className="status">{t(`license.status.${v.status}` as DictKey)}</span>
            </div>
            <p className="muted small">{v.user_name} &lt;{v.email}&gt; · {v.category ? t(`cat.${v.category}` as DictKey) : '—'} · {formatDateTime(v.created_at, locale)}</p>
            {ai && <div className="small"><strong>{t('admin.aiReasons')}:</strong> {ai.decision} ({ai.confidence})
              {ai.extracted && <span className="muted"> · {Object.entries(ai.extracted).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(' · ')}</span>}
              <ul>{ai.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
            {v.ai_result?.error && <p className="muted small">{v.ai_result.error}</p>}
            <div className="row gap wrap">
              <button className="btn btn-outline" onClick={() => openDoc(v)}>📄 {t('admin.viewDocument')}</button>
              <label className="grow">{t('admin.note')}<input value={notes[v.id] ?? ''} onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })} /></label>
              <button className="btn btn-primary" onClick={() => decide(v, 'approved')}>{t('admin.approve')}</button>
              <button className="btn btn-danger" onClick={() => decide(v, 'rejected')}>{t('admin.rejectLicense')}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Feedback = { id: string; kind: string; rating: number | null; message: string; email: string | null; page: string | null; locale: string | null; status: string; created_at: string };
const FB_STATUSES = ['new', 'seen', 'planned', 'done', 'wont_fix'] as const;

// Cadastros dos últimos 14 dias por origem (UTM das campanhas).
// Conversas do assistente virtual (as mesmas que chegam por e-mail)
function AssistantAdmin() {
  const { t, locale } = useI18n();
  type Conv = { id: string; page: string | null; updated_at: string; name: string | null; email: string | null; messages: { role: string; content: string }[] };
  const [list, setList] = useState<Conv[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Conv[]>('/admin/assistant').then(setList).catch((e) => setError(errorText(e, t))); }, [t]);
  if (!list) return error ? <p className="errors">{error}</p> : null;
  return (
    <div className="assistant-admin">
      {list.map((c) => (
        <details key={c.id} className="panel">
          <summary>
            <strong>{c.messages.find((m) => m.role === 'user')?.content.slice(0, 90) ?? '—'}</strong>
            <span className="muted small"> · {c.email ? `${c.name} <${c.email}>` : '—'} · {formatDateTime(c.updated_at, locale)}{c.page ? ` · ${c.page}` : ''}</span>
          </summary>
          {c.messages.map((m, i) => <p key={i} className={`assistant-msg ${m.role === 'user' ? 'me' : 'bot'}`}>{m.content}</p>)}
        </details>
      ))}
    </div>
  );
}

// Suporte: consulta um usuário pelo e-mail (cadastro, anúncios, Mercado Pago, e-mails enviados)
function UsersAdmin() {
  const { t, locale } = useI18n();
  type U = {
    id: string; email: string; name: string; phone: string | null; roles: string[]; created_at: string; email_verified_at: string | null;
    signup_source: string | null; mp_connected_at: string | null;
    listings: { id: string; title: string; city: string; active: boolean; created_at: string }[];
    emails: { kind: string; created_at: string; email_status: string; email_error: string | null }[];
  };
  const [q, setQ] = useState('');
  const [list, setList] = useState<U[] | null>(null);
  const [error, setError] = useState('');
  async function search(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');
    try { setList(await api<U[]>(`/admin/users?email=${encodeURIComponent(q.trim())}`)); } catch (err) { setError(errorText(err, t)); }
  }
  const yes = (v: unknown) => (v ? '✅' : '❌');
  return (
    <div className="users-admin">
      <form className="row gap" onSubmit={search}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.uSearch')} minLength={3} required />
        <button className="btn btn-primary">{t('admin.uFind')}</button>
      </form>
      {error && <p className="errors">{error}</p>}
      {list?.length === 0 && <p className="muted">{t('admin.uNone')}</p>}
      {list?.map((u) => (
        <div key={u.id} className="panel">
          <p><strong>{u.name}</strong> &lt;{u.email}&gt;{u.phone ? ` · ${u.phone}` : ''} · {u.roles.join(', ')}</p>
          <p className="small">
            {t('admin.uCreated')}: {formatDateTime(u.created_at, locale)}{u.signup_source ? ` (${u.signup_source})` : ''}<br />
            {yes(u.email_verified_at)} {t('admin.uEmailVerified')}{u.email_verified_at ? ` — ${formatDateTime(u.email_verified_at, locale)}` : ''}<br />
            {yes(u.mp_connected_at)} {t('admin.uMpConnected')}{u.mp_connected_at ? ` — ${formatDateTime(u.mp_connected_at, locale)}` : ''}
          </p>
          <h3>{t('admin.uListings')} ({u.listings.length})</h3>
          {u.listings.length === 0 && <p className="muted small">—</p>}
          <ul className="small">
            {u.listings.map((l) => (
              <li key={l.id}><Link to={`/espacos/${l.id}`}>{l.title}</Link> · {l.city} · {l.active ? t('admin.uActive') : t('admin.uInactive')}{l.active && !u.mp_connected_at ? ` · 🕒 ${t('listing.comingSoon')}` : ''} · {formatDateTime(l.created_at, locale)}</li>
            ))}
          </ul>
          <h3>{t('admin.uEmails')}</h3>
          <table className="hours small">
            <tbody>{u.emails.map((n, i) => (
              <tr key={i}><td>{formatDateTime(n.created_at, locale)}</td><td>{n.kind}</td><td>{n.email_status === 'sent' ? '✅' : n.email_status === 'pending' ? '⏳' : n.email_status === 'failed' ? '❌' : '—'} {n.email_status}{n.email_error ? `: ${n.email_error}` : ''}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function CampaignAdmin() {
  const { t } = useI18n();
  type Report = { bySource: { source: string; signups: number; verified: number; hosts_with_listing: number }[]; byDay: { day: string; signups: number }[] };
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Report>('/admin/signups?days=14').then(setData).catch((e) => setError(errorText(e, t))); }, [t]);
  if (!data) return error ? <p className="errors">{error}</p> : null;
  return (
    <div className="campaign-report">
      <table className="hours">
        <thead><tr><th>{t('admin.cSource')}</th><th>{t('admin.cSignups')}</th><th>{t('admin.cVerified')}</th><th>{t('admin.cHosts')}</th></tr></thead>
        <tbody>{data.bySource.map((r) => <tr key={r.source}><td>{r.source}</td><td>{r.signups}</td><td>{r.verified}</td><td>{r.hosts_with_listing}</td></tr>)}</tbody>
      </table>
      <h3>{t('admin.cByDay')}</h3>
      <table className="hours">
        <tbody>{data.byDay.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.signups}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function FeedbackAdmin() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<{ summary: { total: number; average: number | null; open_bugs: number }; items: Feedback[] } | null>(null);
  const [error, setError] = useState('');
  const load = () => api<typeof data>('/admin/feedback').then(setData).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function setStatus(f: Feedback, status: string) {
    try { await api(`/admin/feedback/${f.id}/status`, { body: { status } }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  if (!data) return error ? <p className="errors">{error}</p> : null;
  return (
    <div>
      {error && <p className="errors">{error}</p>}
      <p className="notice">{t('admin.feedbackSummary', { total: data.summary.total, avg: data.summary.average ?? '—', bugs: data.summary.open_bugs })}</p>
      {data.items.length === 0 && <p className="muted">{t('admin.feedbackEmpty')}</p>}
      {data.items.map((f) => (
        <div key={f.id} className="panel">
          <div className="row between wrap">
            <strong>{t(`feedback.kind.${f.kind}` as DictKey)} {f.rating ? '★'.repeat(f.rating) : ''}</strong>
            <select value={f.status} onChange={(e) => setStatus(f, e.target.value)}>
              {FB_STATUSES.map((s) => <option key={s} value={s}>{t(`admin.fbStatus.${s}` as DictKey)}</option>)}
            </select>
          </div>
          {f.message && <p>{f.message}</p>}
          <p className="muted small">{formatDateTime(f.created_at, locale)} · {f.email ?? '—'} · {f.page ?? ''} · {f.locale ?? ''}</p>
        </div>
      ))}
    </div>
  );
}
