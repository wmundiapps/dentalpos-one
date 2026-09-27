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

type Tab = 'incidents' | 'verifications' | 'feedback' | 'campaign' | 'assistant' | 'users' | 'contacts';

export function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('verifications');
  return (
    <div className="container">
      <h1>{t('admin.title')}</h1>
      <div className="segmented" role="tablist">
        {(['verifications', 'users', 'contacts', 'incidents', 'feedback', 'assistant', 'campaign'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(k === 'incidents' ? 'admin.tabIncidents' : k === 'verifications' ? 'admin.tabVerifications' : k === 'campaign' ? 'admin.tabCampaign' : k === 'assistant' ? 'admin.tabAssistant' : k === 'users' ? 'admin.tabUsers' : k === 'contacts' ? 'admin.tabContacts' : 'admin.tabFeedback')}
          </button>
        ))}
      </div>
      {tab === 'incidents' && <Incidents />}
      {tab === 'verifications' && <Verifications />}
      {tab === 'feedback' && <FeedbackAdmin />}
      {tab === 'campaign' && <CampaignAdmin />}
      {tab === 'assistant' && <AssistantAdmin />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'contacts' && <ContactsAdmin />}
    </div>
  );
}

type Verification = {
  id: string; user_name: string; email: string; full_name: string; country_code: string; category: string | null; body: string; number: string;
  region: string | null; status: string; created_at: string;
  ai_result: { ai?: { decision: string; confidence: string; reasons: string[]; public_registry_found_active: boolean | null; extracted: Record<string, string | null> } | null; error?: string | null } | null;
};

// Consulta pública do conselho profissional (a equipe confere o número no site oficial)
function registryLookup(body: string, number: string, region: string | null) {
  const b = body.toUpperCase();
  if (/CRM|CFM/.test(b)) return 'https://portal.cfm.org.br/busca-medicos/';
  if (/CRO|CFO/.test(b)) return 'https://website.cfo.org.br/profissionais-cadastrados/';
  if (/CRP|CFP/.test(b)) return 'https://cadastro.cfp.org.br/';
  if (/OAB/.test(b)) return 'https://cna.oab.org.br/';
  return `https://www.google.com/search?q=${encodeURIComponent(`consulta ${body} ${number} ${region ?? ''}`)}`;
}

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
      <IdentityReview />
      <h2>{t('admin.licensesTitle')}</h2>
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
              <a className="btn btn-outline" href={registryLookup(v.body, v.number, v.region)} target="_blank" rel="noopener noreferrer">🔎 {t('admin.lookupRegistry')}</a>
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

// Identidades (CPF/CNPJ + documento + selfie) que a checagem automática mandou para a equipe
function IdentityReview() {
  const { t, locale } = useI18n();
  type Idv = { id: string; user_name: string; email: string; tax_id: string; tax_id_kind: string; status: string; ip: string | null; created_at: string; has_files: boolean;
    checks: { taxIdValid?: boolean | null; cnpj?: { found: boolean; active?: boolean; status?: string; companyName?: string; personIsPartner?: boolean }; ai?: { reasons: string[]; confidence: string; extracted_name: string | null; extracted_cpf: string | null; document_kind: string | null; name_matches: boolean; cpf_matches: boolean | null; selfie_is_live_person: boolean; signs_of_tampering: boolean }; aiError?: string } | null };
  const [list, setList] = useState<Idv[]>([]);
  const [error, setError] = useState('');
  const load = () => api<Idv[]>('/admin/identities').then(setList).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async (v: Idv, which: 'document' | 'selfie') => {
    try { window.open(await apiBlobUrl(`/admin/identities/${v.id}/${which}`), '_blank', 'noopener'); } catch (e) { setError(errorText(e, t)); }
  };
  const decide = async (v: Idv, status: 'approved' | 'rejected') => {
    try { await api(`/admin/identities/${v.id}/decision`, { body: { status } }); load(); } catch (e) { setError(errorText(e, t)); }
  };
  const yn = (b: boolean | null | undefined) => (b === true ? '✅' : b === false ? '❌' : '—');
  return (
    <div className="identity-review">
      <h2>{t('admin.identitiesTitle')}</h2>
      {error && <p className="errors">{error}</p>}
      {list.length === 0 && <p className="muted">{t('admin.verificationsEmpty')}</p>}
      {list.map((v) => {
        const ai = v.checks?.ai;
        return (
          <div key={v.id} className="panel">
            <div className="row between wrap">
              <strong>{v.user_name} &lt;{v.email}&gt;</strong>
              <span className="status">{v.status}</span>
            </div>
            <p className="small">{v.tax_id_kind.toUpperCase()} {v.tax_id} {yn(v.checks?.taxIdValid)} · {formatDateTime(v.created_at, locale)}{v.ip ? ` · IP ${v.ip}` : ''}</p>
            {v.checks?.cnpj && <p className="small">CNPJ: {v.checks.cnpj.found ? `${v.checks.cnpj.companyName ?? ''} · ${v.checks.cnpj.status ?? ''} · ${t('admin.idPartner')} ${yn(v.checks.cnpj.personIsPartner)}` : t('admin.idCnpjNotFound')}</p>}
            {ai && <p className="small">{ai.document_kind ?? '—'} · {t('admin.idName')} {yn(ai.name_matches)} ({ai.extracted_name ?? '—'}) · CPF {yn(ai.cpf_matches)} ({ai.extracted_cpf ?? '—'}) · Selfie {yn(ai.selfie_is_live_person)} · {t('admin.idTamper')} {yn(!ai.signs_of_tampering)} · {ai.confidence}</p>}
            {ai?.reasons.length ? <ul className="small">{ai.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
            {v.checks?.aiError && <p className="muted small">{v.checks.aiError}</p>}
            <div className="row gap wrap">
              {v.has_files && <button className="btn btn-outline" onClick={() => open(v, 'document')}>🪪 {t('admin.idDocument')}</button>}
              {v.has_files && <button className="btn btn-outline" onClick={() => open(v, 'selfie')}>🤳 Selfie</button>}
              <button className="btn btn-primary" onClick={() => decide(v, 'approved')}>{t('admin.approve')}</button>
              <button className="btn btn-danger" onClick={() => decide(v, 'rejected')}>{t('admin.idReject')}</button>
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

// Configuração do Mercado Pago: o endereço de retorno precisa estar cadastrado igual no painel do Mercado Pago
function MpConfigCheck() {
  const { t } = useI18n();
  const [c, setC] = useState<{ configured: boolean; redirectUri: string; pkce: boolean } | null>(null);
  useEffect(() => { api<typeof c>('/admin/mp-config').then(setC).catch(() => {}); }, []);
  if (!c) return null;
  return (
    <details className="panel small">
      <summary>{c.configured ? '✅' : '❌'} {t('admin.mpConfig')}</summary>
      <p>{t('admin.mpRedirect')}<br /><code>{c.redirectUri}</code></p>
      <p>PKCE: {c.pkce ? t('admin.mpPkceOn') : t('admin.mpPkceOff')}</p>
    </details>
  );
}

// Começar do zero (fase de testes): apaga todos os usuários, anúncios, fotos e dados; o app continua
function ResetAll() {
  const { t } = useI18n();
  const { logout } = useApp();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ users: number; listings: number; photos: number } | null>(null);
  async function run(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!window.confirm(t('admin.resetLast'))) return;
    setBusy(true); setError('');
    try {
      setDone(await api<{ users: number; listings: number; photos: number }>('/admin/reset-all-data', { body: { password, confirm } }));
      logout();
    } catch (err) { setError(errorText(err, t)); } finally { setBusy(false); }
  }
  if (done) return (
    <section className="panel reset-zone">
      <p className="notice success">✅ {t('admin.resetDone', { users: done.users, listings: done.listings, photos: done.photos })}</p>
      <Link className="btn btn-primary" to="/cadastro">{t('auth.createAccount')}</Link>
    </section>
  );
  return (
    <section className="panel reset-zone">
      <h2>🧹 {t('admin.resetTitle')}</h2>
      <p className="small">{t('admin.resetHelp')}</p>
      {!open ? <button className="btn btn-danger" onClick={() => setOpen(true)}>{t('admin.resetOpen')}</button> : (
        <form onSubmit={run} className="form-grid">
          <label>{t('admin.resetPassword')}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <label>{t('admin.resetType')}<input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APAGAR TUDO" required /></label>
          <div className="span2 row gap wrap">
            <button className="btn btn-danger" disabled={busy || confirm.trim().toUpperCase() !== 'APAGAR TUDO' || !password}>{busy ? t('common.wait') : `🗑 ${t('admin.resetGo')}`}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>{t('mp.later')}</button>
          </div>
          {error && <p className="errors span2">{error}</p>}
        </form>
      )}
    </section>
  );
}

// Suporte: consulta um usuário pelo e-mail (cadastro, anúncios, Mercado Pago, e-mails enviados)
function UsersAdmin() {
  const { t, locale } = useI18n();
  type U = {
    id: string; email: string; name: string; phone: string | null; roles: string[]; created_at: string; email_verified_at: string | null;
    signup_source: string | null; mp_connected_at: string | null;
    signup_ip: string | null; signup_user_agent: string | null; email_verified_ip: string | null; email_verified_user_agent: string | null;
    identity_verified: boolean; identity_status: string | null; license_status: string | null; emailProvider: { domain: string; kind: string };
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
      <MpConfigCheck />
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
            {yes(u.mp_connected_at)} {t('admin.uMpConnected')}{u.mp_connected_at ? ` — ${formatDateTime(u.mp_connected_at, locale)}` : ''}<br />
            {yes(u.identity_verified)} {t('profile.identity')}{u.identity_status ? ` (${u.identity_status})` : ''} · {t('profile.license')}: {u.license_status ?? '—'}
          </p>
          <details className="small">
            <summary>🔐 {t('admin.uSecurity')}</summary>
            <p>{t('admin.uProvider')}: {u.emailProvider.domain} ({t(`admin.provider.${u.emailProvider.kind}` as DictKey)})<br />
              {t('admin.uSignupFrom')}: {u.signup_ip ?? '—'} · <span className="muted">{u.signup_user_agent ?? ''}</span><br />
              {t('admin.uVerifiedFrom')}: {u.email_verified_ip ?? '—'} · <span className="muted">{u.email_verified_user_agent ?? ''}</span></p>
          </details>
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
      <ResetAll />
    </div>
  );
}

// Base de contatos para marketing: confirmados, não confirmados, quem aceitou novidades; exporta CSV
function ContactsAdmin() {
  const { t, locale } = useI18n();
  type C = { name: string; email: string; phone: string | null; created_at: string; source: string | null; email_verified: boolean; marketing_opt_in: boolean; unsubscribed: boolean; is_host: boolean; bookings: number; abandoned_checkouts: number };
  type R = { summary: { total: number; verified: number; unverified: number; opt_in: number; hosts: number; abandoned: number }; contacts: C[]; count: number };
  const [f, setF] = useState({ status: 'all', consent: 'all', role: 'all', days: '0' });
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState('');
  const qs = new URLSearchParams(f).toString();
  useEffect(() => { api<R>(`/admin/contacts?${qs}`).then(setData).catch((e) => setError(errorText(e, t))); }, [qs, t]);
  async function download() {
    try {
      const url = await apiBlobUrl(`/admin/contacts?${qs}&format=csv`);
      const a = document.createElement('a');
      a.href = url; a.download = `spacehour-contatos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setError(errorText(e, t)); }
  }
  const sel = (k: keyof typeof f, opts: [string, string][]) => (
    <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  const s = data?.summary;
  return (
    <div className="contacts-admin">
      {s && (
        <div className="stat-row">
          <div className="panel"><strong>{s.total}</strong><span className="muted small">{t('admin.kTotal')}</span></div>
          <div className="panel"><strong>{s.verified}</strong><span className="muted small">✅ {t('admin.kVerified')}</span></div>
          <div className="panel"><strong>{s.unverified}</strong><span className="muted small">⏳ {t('admin.kUnverified')}</span></div>
          <div className="panel"><strong>{s.opt_in}</strong><span className="muted small">📣 {t('admin.kOptIn')}</span></div>
          <div className="panel"><strong>{s.hosts}</strong><span className="muted small">🏠 {t('admin.kHosts')}</span></div>
          <div className="panel"><strong>{s.abandoned}</strong><span className="muted small">🛒 {t('admin.kAbandoned')}</span></div>
        </div>
      )}
      <div className="filters panel">
        <label>{t('admin.kEmail')}{sel('status', [['all', t('admin.kAll')], ['verified', t('admin.kVerified')], ['unverified', t('admin.kUnverified')]])}</label>
        <label>{t('admin.kConsent')}{sel('consent', [['all', t('admin.kAll')], ['yes', t('admin.kOptIn')]])}</label>
        <label>{t('admin.kRole')}{sel('role', [['all', t('admin.kAll')], ['host', t('admin.kHosts')], ['guest', t('admin.kGuests')]])}</label>
        <label>{t('admin.kPeriod')}{sel('days', [['0', t('admin.kAll')], ['7', '7 d'], ['30', '30 d'], ['90', '90 d']])}</label>
        <button className="btn btn-primary" onClick={download}>⬇ {t('admin.kCsv')}{data ? ` (${data.count})` : ''}</button>
      </div>
      <p className="notice small">{t('admin.kLgpd')}</p>
      {error && <p className="errors">{error}</p>}
      {data && (
        <div className="table-scroll">
          <table className="hours small">
            <thead><tr><th>{t('form.fullName')}</th><th>E-mail</th><th>{t('form.phone')}</th><th>{t('admin.uCreated')}</th><th>✅</th><th>📣</th><th>🏠</th><th>🛒</th></tr></thead>
            <tbody>{data.contacts.map((c) => (
              <tr key={c.email}><td>{c.name}</td><td>{c.email}</td><td>{c.phone ?? ''}</td><td>{formatDateTime(c.created_at, locale)}{c.source ? ` · ${c.source}` : ''}</td>
                <td>{c.email_verified ? '✅' : '⏳'}</td><td>{c.unsubscribed ? '🚫' : c.marketing_opt_in ? '✅' : '—'}</td><td>{c.is_host ? '✅' : ''}</td><td>{c.abandoned_checkouts || ''}</td></tr>
            ))}</tbody>
          </table>
          {data.count > data.contacts.length && <p className="muted small">{t('admin.kMore', { n: data.count - data.contacts.length })}</p>}
        </div>
      )}
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
