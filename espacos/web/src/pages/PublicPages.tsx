// Páginas públicas acessadas por link: aceite do avalista e avaliação de cliente final.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { StarInput } from '../components/Stars';
import { REVIEW_RULES } from '../../../shared/rules';
import type { Occurrence } from '../../../shared/types';
import { errorText } from '../errors';
import { formatDate, formatDateTime, money } from '../format';

type GInfo = { guarantorName: string; guestName: string; status: string; bookingStatus: string; liabilityCap: number; currency: string; total: number; listing: { title: string; city: string }; occurrences: Occurrence[]; deadline?: string };

export function GuarantorPage() {
  const { token } = useParams();
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<GInfo | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const load = () => api<GInfo>(`/guarantor/${token}`).then(setInfo).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  async function respond(accept: boolean) {
    try { await api(`/guarantor/${token}`, { body: { accept, consent } }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  if (!info) return <div className="container narrow">{error && <p className="errors">{error}</p>}</div>;
  return (
    <div className="container narrow">
      <h1>{t('gpage.title')}</h1>
      <div className="panel">
        <p>{t('gpage.intro', { name: info.guarantorName, guest: info.guestName, title: info.listing.title, city: info.listing.city })}</p>
        <ul>{info.occurrences.map((o) => <li key={o.date}>{formatDate(o.date, locale)} · {o.start}–{o.end}</li>)}</ul>
        <p>{t('gpage.total')}: <strong>{money(info.total, info.currency, locale)}</strong></p>
        <p className="notice">{t('gpage.liability', { cap: money(info.liabilityCap, info.currency, locale) })}</p>
        <Link to="/regras/guarantor-deposit" target="_blank">{t('legal.guarantor-deposit')}</Link>
        {info.status === 'invited' && info.bookingStatus === 'pending_guarantor' ? (
          <>
            {info.deadline && <p className="muted small">{t('booking.deadline', { at: formatDateTime(info.deadline, locale) })}</p>}
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('gpage.consent')}</label>
            <div className="row gap">
              <button className="btn btn-primary" disabled={!consent} onClick={() => respond(true)}>{t('gpage.accept')}</button>
              <button className="btn btn-outline" onClick={() => respond(false)}>{t('gpage.decline')}</button>
            </div>
          </>
        ) : <p><strong>{t(`guarantor.status.${info.status}` as DictKey)}</strong></p>}
        {error && <p className="errors">{error}</p>}
      </div>
    </div>
  );
}

export function ClientReviewPage() {
  const { token } = useParams();
  const { t } = useI18n();
  const [info, setInfo] = useState<{ listing: { title: string; city: string }; used: boolean; expired: boolean } | null>(null);
  const [rating, setRating] = useState(5);
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(REVIEW_RULES.clientCategories.map((c) => [c, 5])));
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<typeof info>(`/client-review/${token}`).then(setInfo).catch((e) => setError(errorText(e, t))); }, [token, t]);
  async function submit() {
    try { await api(`/client-review/${token}`, { body: { rating, categories: scores, comment, displayName: name || undefined, consent } }); setDone(true); } catch (e) { setError(errorText(e, t)); }
  }
  if (!info) return <div className="container narrow">{error && <p className="errors">{error}</p>}</div>;
  if (done || info.used) return <div className="container narrow"><h1>{t('cpage.thanks')}</h1></div>;
  if (info.expired) return <div className="container narrow"><p className="errors">{t('err.invite_expired')}</p></div>;
  return (
    <div className="container narrow">
      <h1>{t('cpage.title')}</h1>
      <div className="panel">
        <p>{t('cpage.intro', { title: info.listing.title, city: info.listing.city })}</p>
        <StarInput label={t('review.overall')} value={rating} onChange={setRating} />
        {REVIEW_RULES.clientCategories.map((c) => <StarInput key={c} label={t(`review.cat.${c}` as DictKey)} value={scores[c]} onChange={(v) => setScores({ ...scores, [c]: v })} />)}
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('cpage.comment')} />
        <label>{t('cpage.name')}<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <p className="notice small">{t('cpage.privacy')}</p>
        <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('cpage.consent')}</label>
        {error && <p className="errors">{error}</p>}
        <button className="btn btn-primary" disabled={!consent || comment.trim().length < REVIEW_RULES.minCommentLength} onClick={submit}>{t('review.submit')}</button>
      </div>
    </div>
  );
}
