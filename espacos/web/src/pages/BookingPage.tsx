import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { useApp } from '../state';
import { PriceLines } from '../components/PriceLines';
import { StarInput } from '../components/Stars';
import { ReviewItem } from './ListingPage';
import type { ListingSummary } from '../components/ListingCard';
import type { Booking, ClientReviewInvite, Incident, IncidentType, Message, PublicUser, Review } from '../../../shared/types';
import { OVERSTAY, PENALTIES, REVIEW_RULES, hostCancellationPenalty, occurrenceStartUtc } from '../../../shared/rules';
import { PAYMENT_METHOD_LABELS, type PaymentMethodId } from '../../../shared/countries';
import { errorText } from '../errors';
import { formatDate, formatDateTime, money } from '../format';

type View = Omit<Booking, 'guarantor'> & {
  guarantor?: { name: string; status: string; liabilityCap: number; email?: string };
  listing: ListingSummary; guest: PublicUser & { professionalLicense?: { body: string; number: string } }; host: PublicUser;
  payment?: { status: string; method: string; amount: number; refunded: number; depositHold: number; depositStatus: string; extraCharges: Array<{ amount: number; reason: string }>; payoutStatus?: string; payoutAmount?: number };
  refundPreview?: { total: number; rule: string };
  reviewWindowOpen: boolean; myReview?: Review; reviews: Review[]; incidents: Incident[]; clientInvites?: ClientReviewInvite[];
};

const HOST_TYPES: IncidentType[] = ['damage', 'extra_cleaning', 'rule_violation', 'over_capacity', 'unauthorized_activity', 'sublet', 'smoking_substances', 'building_fine', 'harassment', 'off_platform_payment', 'no_show', 'overstay'];
const GUEST_TYPES: IncidentType[] = ['listing_inaccurate', 'host_no_access', 'safety'];

export default function BookingPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, locale } = useI18n();
  const { me } = useApp();
  const [b, setB] = useState<View | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<null | 'cancel' | 'hostCancel' | 'review' | 'incident' | 'invites'>(null);

  const load = useCallback(() => {
    api<View>(`/bookings/${id}`).then(setB).catch((e) => setError(errorText(e, t)));
    api<Message[]>(`/bookings/${id}/messages`).then(setMsgs).catch(() => {});
  }, [id, t]);
  useEffect(load, [load]);

  if (!b || !me) return <div className="container">{error ? <p className="errors">{error}</p> : <div className="skeleton hero-skeleton" />}</div>;
  const isHost = me.id === b.hostId;
  const l = b.listing;
  const other = isHost ? b.guest : b.host;
  const m = (v: number) => money(v, b.price.currency, locale);
  const nextStart = b.occurrences.map((o) => occurrenceStartUtc(l, o).getTime()).find((s) => s > Date.now());

  async function act(path: string, body?: unknown) {
    setError('');
    try { setB(await api<View>(`/bookings/${b!.id}/${path}`, { body: body ?? {} })); setPanel(null); } catch (e) { setError(errorText(e, t)); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try { const msg = await api<Message>(`/bookings/${b!.id}/messages`, { body: { text } }); setMsgs([...msgs, msg]); setText(''); } catch (err) { setError(errorText(err, t)); }
  }

  return (
    <div className="container booking-page">
      {params.get('novo') && <div className="notice success">🎉 {b.status === 'confirmed' ? t('booking.createdConfirmed') : b.status === 'pending_guarantor' ? t('booking.createdGuarantor') : t('booking.createdRequest')}</div>}
      <div className="row between wrap">
        <div>
          <p className="muted small">{isHost ? t('booking.asHost') : t('booking.asGuest')} · #{b.id.slice(-8)}</p>
          <h1><Link to={`/espacos/${l.id}`}>{l.title}</Link></h1>
        </div>
        <span className={`status status-${b.status}`}>{t(`status.${b.status}` as DictKey)}</span>
      </div>
      {error && <p className="errors" role="alert">{error}</p>}

      <div className="booking-layout">
        <div>
          <section className="section">
            <h2>{t('booking.when')}</h2>
            <ul className="occ-list">
              {b.occurrences.map((o) => {
                const att = b.attendance.find((a) => a.date === o.date);
                return <li key={o.date}>{formatDate(o.date, locale)} · <strong>{o.start}–{o.end}</strong>
                  {att?.checkInAt && <span className="muted small"> · ✔ {t('booking.checkedInAt', { at: formatDateTime(att.checkInAt, locale, l.timezone) })}</span>}
                  {att?.checkOutAt && <span className="muted small"> · ⇥ {formatDateTime(att.checkOutAt, locale, l.timezone)}</span>}
                  {!!att?.overstayMinutes && att.overstayMinutes > OVERSTAY.toleranceMinutes && <span className="errors small"> · {t('booking.overstay', { n: att.overstayMinutes })}</span>}
                </li>;
              })}
            </ul>
            <p className="muted small">{t('listing.timezone', { tz: l.timezone })} · {t('checkout.people', { n: b.guests })} · {t('booking.purpose')}: {b.purpose}</p>
            <p><strong>{t('booking.address')}:</strong> {l.address ?? <span className="muted">{t('listing.addressAfterConfirm')}</span>}</p>
            {b.hostDecisionDeadline && ['pending_host', 'pending_guarantor'].includes(b.status) && <p className="notice small">⏳ {t('booking.deadline', { at: formatDateTime(b.hostDecisionDeadline, locale) })}</p>}
          </section>

          {/* Ações */}
          <section className="section actions">
            {isHost && b.status === 'pending_host' && <>
              <button className="btn btn-primary" onClick={() => act('approve')}>{t('booking.approve')}</button>
              <button className="btn btn-outline" onClick={() => act('decline', { reason: '' })}>{t('booking.decline')}</button>
            </>}
            {!isHost && b.status === 'confirmed' && <button className="btn btn-primary" onClick={() => act('check-in')}>{t('booking.checkIn')}</button>}
            {!isHost && b.status === 'checked_in' && <button className="btn btn-primary" onClick={() => act('check-out')}>{t('booking.checkOut')}</button>}
            {!isHost && ['pending_guarantor', 'pending_host', 'confirmed'].includes(b.status) && <button className="btn btn-outline" onClick={() => setPanel('cancel')}>{t('booking.cancel')}</button>}
            {isHost && ['confirmed', 'pending_guarantor'].includes(b.status) && <button className="btn btn-outline" onClick={() => setPanel('hostCancel')}>{t('booking.hostCancel')}</button>}
            {b.reviewWindowOpen && !b.myReview && <button className="btn btn-outline" onClick={() => setPanel('review')}>{isHost ? t('review.rateGuest') : t('review.rateSpace')}</button>}
            {!isHost && b.attendance.some((a) => a.checkInAt) && <button className="btn btn-outline" onClick={() => setPanel('invites')}>{t('invites.button')}</button>}
            {['confirmed', 'checked_in', 'completed'].includes(b.status) && <button className="btn btn-ghost" onClick={() => setPanel('incident')}>⚠ {t('incident.report')}</button>}
          </section>

          {panel === 'cancel' && <CancelPanel b={b} onDone={(reason) => act('cancel', { reason })} onClose={() => setPanel(null)} />}
          {panel === 'hostCancel' && (
            <HostCancelPanel penaltyRate={nextStart ? hostCancellationPenalty((nextStart - Date.now()) / 3600000).feeRate : 0.25} base={m(b.price.baseAmount)} onDone={(reason, ext) => act('host-cancel', { reason, extenuating: ext })} onClose={() => setPanel(null)} />
          )}
          {panel === 'review' && <ReviewPanel isHost={isHost} bookingId={b.id} onDone={() => { setPanel(null); load(); }} />}
          {panel === 'incident' && <IncidentPanel b={b} types={isHost ? HOST_TYPES : GUEST_TYPES} onDone={() => { setPanel(null); load(); }} />}
          {panel === 'invites' && <InvitesPanel b={b} onDone={load} />}

          {b.incidents.length > 0 && (
            <section className="section">
              <h2>{t('incident.title')}</h2>
              {b.incidents.map((i) => <IncidentItem key={i.id} inc={i} currency={b.price.currency} meId={me.id} onChange={load} />)}
            </section>
          )}

          {b.reviews.length > 0 && (
            <section className="section">
              <h2>{t('reviews.title')}</h2>
              {b.reviews.filter((r) => r.kind !== 'client_to_listing').map((r) => <div key={r.id}><ReviewItem r={r} />{!r.visible && <p className="muted small">{t('review.hiddenUntil', { days: REVIEW_RULES.windowDays })}</p>}</div>)}
              {b.reviews.some((r) => r.kind === 'client_to_listing') && <p className="muted small">{t('invites.received', { n: b.reviews.filter((r) => r.kind === 'client_to_listing').length })}</p>}
            </section>
          )}

          <section className="section">
            <h2>{t('messages.title', { name: other.name })}</h2>
            <div className="messages">
              {msgs.length === 0 && <p className="muted small">{t('messages.empty')}</p>}
              {msgs.map((x) => (
                <div key={x.id} className={`msg ${x.senderId === me.id ? 'mine' : ''}`}>
                  <p>{x.text}</p>
                  <span className="muted small">{formatDateTime(x.createdAt, locale)}</span>
                </div>
              ))}
            </div>
            <form className="row gap" onSubmit={send}>
              <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('messages.placeholder')} maxLength={2000} />
              <button className="btn btn-primary">{t('messages.send')}</button>
            </form>
            <p className="muted small">{t('messages.safety')}</p>
          </section>
        </div>

        <aside>
          <div className="panel">
            <h3>{isHost ? t('booking.guest') : t('booking.host')}</h3>
            <p><strong>{other.name}</strong> {other.identityVerified && '✅'}</p>
            {isHost && b.guest.professionalLicense && <p className="small">🪪 {b.guest.professionalLicense.body} {b.guest.professionalLicense.number} {b.guest.professionalLicenseVerified && `(${t('profile.verified')})`}</p>}
            <p className="muted small">{isHost ? (b.guest.ratingAsGuest ? `★ ${b.guest.ratingAsGuest} · ${t('reviews.count', { n: b.guest.reviewCountAsGuest })}` : t('reviews.none')) : (b.host.ratingAsHost ? `★ ${b.host.ratingAsHost}` : '')}</p>
            {b.guarantor && <p className="small">🤝 {t('booking.guarantor')}: {b.guarantor.name} — {t(`guarantor.status.${b.guarantor.status}` as DictKey)}</p>}
          </div>
          <div className="panel">
            <h3>{t('booking.payment')}</h3>
            <PriceLines p={b.price} showHost={isHost} hideDeposit={!!b.payment?.depositHold} />
            {b.payment && <ul className="small plain">
              <li>{PAYMENT_METHOD_LABELS[b.payment.method as PaymentMethodId] ?? b.payment.method} · {t(`payment.${b.payment.status}` as DictKey)}</li>
              {b.payment.refunded > 0 && <li>{t('booking.refunded')}: {m(b.payment.refunded)}</li>}
              {b.payment.depositHold > 0 && <li>{t('price.deposit')}: {m(b.payment.depositHold)} · {t(`deposit.${b.payment.depositStatus}` as DictKey)}</li>}
              {b.payment.extraCharges.map((c, i) => <li key={i}>{t('booking.extraCharge')}: {m(c.amount)} ({t(`incident.type.${c.reason}` as DictKey)})</li>)}
              {isHost && b.payment.payoutAmount !== undefined && <li><strong>{t('booking.payout')}: {m(b.payment.payoutAmount)} · {t(`payout.${b.payment.payoutStatus}` as DictKey)}</strong></li>}
            </ul>}
            {b.hostPenalty && isHost && <p className="errors small">{t('booking.hostPenalty', { amount: m(b.hostPenalty.amount) })}</p>}
          </div>
          <div className="panel small">
            <Link to="/regras/cancellation-refunds">{t('legal.cancellation-refunds')}</Link><br />
            <Link to="/regras/penalties">{t('legal.penalties')}</Link><br />
            <Link to="/regras/disputes">{t('legal.disputes')}</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CancelPanel({ b, onDone, onClose }: { b: View; onDone: (reason: string) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [reason, setReason] = useState('');
  const refund = b.status === 'confirmed' ? b.refundPreview?.total ?? 0 : b.price.total;
  return (
    <div className="panel">
      <h3>{t('booking.cancel')}</h3>
      <p>{t('cancel.refundPreview', { amount: money(refund, b.price.currency, locale), total: money(b.price.total, b.price.currency, locale) })}</p>
      {b.refundPreview && <p className="muted small">{t(`cancel.rule.${b.refundPreview.rule}` as DictKey)}</p>}
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('cancel.reason')} />
      <div className="row gap">
        <button className="btn btn-danger" disabled={reason.trim().length < 3} onClick={() => onDone(reason)}>{t('cancel.confirm')}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t('common.back')}</button>
      </div>
    </div>
  );
}

function HostCancelPanel({ penaltyRate, base, onDone, onClose }: { penaltyRate: number; base: string; onDone: (reason: string, extenuating: boolean) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [ext, setExt] = useState(false);
  return (
    <div className="panel">
      <h3>{t('booking.hostCancel')}</h3>
      <p className="notice warn">{t('hostCancel.warning', { pct: Math.round(penaltyRate * 100), base })}</p>
      <label className="check"><input type="checkbox" checked={ext} onChange={(e) => setExt(e.target.checked)} /> {t('hostCancel.extenuating')}</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('cancel.reason')} />
      <div className="row gap">
        <button className="btn btn-danger" disabled={reason.trim().length < 3} onClick={() => onDone(reason, ext)}>{t('cancel.confirm')}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t('common.back')}</button>
      </div>
    </div>
  );
}

function ReviewPanel({ isHost, bookingId, onDone }: { isHost: boolean; bookingId: string; onDone: () => void }) {
  const { t } = useI18n();
  const cats = isHost ? REVIEW_RULES.hostCategories : REVIEW_RULES.guestCategories;
  const [rating, setRating] = useState(5);
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(cats.map((c) => [c, 5])));
  const [comment, setComment] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [recommend, setRecommend] = useState(true);
  const [error, setError] = useState('');
  async function submit() {
    try {
      await api(`/bookings/${bookingId}/review`, { body: { rating, categories: scores, comment, privateNote: privateNote || undefined, wouldRecommend: isHost ? recommend : undefined } });
      onDone();
    } catch (e) { setError(errorText(e, t)); }
  }
  return (
    <div className="panel">
      <h3>{isHost ? t('review.rateGuest') : t('review.rateSpace')}</h3>
      <p className="muted small">{t('review.doubleBlind', { days: REVIEW_RULES.windowDays })}</p>
      <StarInput label={t('review.overall')} value={rating} onChange={setRating} />
      {cats.map((c) => <StarInput key={c} label={t(`review.cat.${c}` as DictKey)} value={scores[c]} onChange={(v) => setScores({ ...scores, [c]: v })} />)}
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('review.commentPlaceholder')} minLength={REVIEW_RULES.minCommentLength} />
      <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} placeholder={t('review.privateNote')} />
      {isHost && <label className="check"><input type="checkbox" checked={recommend} onChange={(e) => setRecommend(e.target.checked)} /> {t('review.wouldRecommend')}</label>}
      {error && <p className="errors">{error}</p>}
      <button className="btn btn-primary" disabled={comment.trim().length < REVIEW_RULES.minCommentLength} onClick={submit}>{t('review.submit')}</button>
    </div>
  );
}

function IncidentPanel({ b, types, onDone }: { b: View; types: IncidentType[]; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [type, setType] = useState<IncidentType>(types[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [minutes, setMinutes] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState('');
  const rule = PENALTIES.find((p) => p.type === type)!;
  async function submit() {
    try {
      await api(`/bookings/${b.id}/incidents`, { body: { type, description, requestedAmount: amount ? Number(amount) : undefined, minutes: minutes ? Number(minutes) : undefined, evidence: evidence.split('\n').map((x) => x.trim()).filter(Boolean) } });
      onDone();
    } catch (e) { setError(errorText(e, t)); }
  }
  return (
    <div className="panel">
      <h3>{t('incident.report')}</h3>
      <label>{t('incident.type')}
        <select value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
          {types.map((x) => <option key={x} value={x}>{t(`incident.type.${x}` as DictKey)}</option>)}
        </select>
      </label>
      <p className="muted small">{t(`incident.rule.${rule.base}` as DictKey, { value: rule.base === 'booking' ? Math.round(rule.value * 100) : rule.value, hours: rule.reportWindowHours })}{rule.strike ? ` · ${t('incident.strike')}` : ''}</p>
      {type === 'overstay' && <label>{t('incident.minutes')}<input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>}
      {(rule.base === 'cost' || GUEST_TYPES.includes(type)) && <label>{t('incident.amount', { currency: b.price.currency })}<input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('incident.description')} />
      <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder={t('incident.evidence')} />
      <p className="muted small">{t('incident.explain', { total: money(b.price.total, b.price.currency, locale) })}</p>
      {error && <p className="errors">{error}</p>}
      <button className="btn btn-primary" disabled={description.trim().length < 10} onClick={submit}>{t('incident.submit')}</button>
    </div>
  );
}

export function IncidentItem({ inc, currency, meId, onChange }: { inc: Incident; currency: string; meId: string; onChange: () => void }) {
  const { t, locale } = useI18n();
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  async function respond(accept: boolean) {
    try { await api(`/incidents/${inc.id}/respond`, { body: { accept, response } }); onChange(); } catch (e) { setError(errorText(e, t)); }
  }
  return (
    <div className="incident">
      <div className="row between"><strong>{t(`incident.type.${inc.type}` as DictKey)}</strong><span className={`status status-inc-${inc.status}`}>{t(`incident.status.${inc.status}` as DictKey)}</span></div>
      <p>{inc.description}</p>
      {inc.evidence.length > 0 && <ul className="small">{inc.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <p className="small">{t('incident.requested')}: <strong>{money(inc.requestedAmount, currency, locale)}</strong> · {t('incident.deadline', { at: formatDateTime(inc.responseDeadline, locale) })}</p>
      {inc.guestResponse && <p className="small response">{t('incident.response')}: {inc.guestResponse}</p>}
      {inc.resolution && <p className="small">{t('incident.resolution', { amount: money(inc.resolution.chargedAmount, currency, locale) })} {inc.resolution.strike && `· ${t('incident.strike')}`}</p>}
      {inc.status === 'open' && inc.againstUserId === meId && (
        <div>
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder={t('incident.responsePlaceholder')} />
          <div className="row gap">
            <button className="btn btn-outline" onClick={() => respond(true)}>{t('incident.accept')}</button>
            <button className="btn btn-primary" disabled={response.trim().length < 5} onClick={() => respond(false)}>{t('incident.contest')}</button>
          </div>
          {error && <p className="errors">{error}</p>}
        </div>
      )}
    </div>
  );
}

function InvitesPanel({ b, onDone }: { b: View; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [count, setCount] = useState(5);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const invites = b.clientInvites ?? [];
  async function create() {
    try { await api(`/bookings/${b.id}/client-invites`, { body: { count, label: label || undefined } }); onDone(); } catch (e) { setError(errorText(e, t)); }
  }
  const url = (tok: string) => `${location.origin}/avaliar/${tok}`;
  return (
    <div className="panel">
      <h3>{t('invites.title')}</h3>
      <p className="muted small">{t('invites.explain', { days: REVIEW_RULES.clientInviteDays, max: REVIEW_RULES.maxClientInvitesPerBooking })}</p>
      <div className="row gap wrap">
        <label>{t('invites.count')}<input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <label className="grow">{t('invites.label')}<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('invites.labelPlaceholder')} /></label>
        <button className="btn btn-primary" onClick={create}>{t('invites.create')}</button>
      </div>
      {error && <p className="errors">{error}</p>}
      {invites.length > 0 && (
        <ul className="invite-list small">
          {invites.map((i) => (
            <li key={i.token}>
              <code>{url(i.token)}</code>
              {i.usedAt ? <span className="badge">{t('invites.used')}</span> : <button className="btn btn-ghost small" onClick={() => navigator.clipboard?.writeText(url(i.token))}>{t('invites.copy')}</button>}
              <span className="muted"> · {t('invites.expires', { at: formatDateTime(i.expiresAt, locale) })}{i.label ? ` · ${i.label}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
