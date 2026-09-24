import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n';
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

export function Admin() {
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
    <div className="container">
      <h1>{t('admin.title')}</h1>
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
