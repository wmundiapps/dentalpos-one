// Páginas públicas acessadas por link: aceite do fiador e avaliação de cliente final.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { StarInput } from '../components/Stars';
import { REVIEW_RULES, spouseConsentRequired } from '../../../shared/rules';
import type { MaritalStatus, Occurrence, PropertyRegime } from '../../../shared/types';
import { errorText } from '../errors';
import { formatDate, formatDateTime, money } from '../format';

type GInfo = { role: 'guarantor' | 'spouse'; guarantorName: string; spouseName?: string; guestName: string; status: string; bookingStatus: string; liabilityCap: number; currency: string; total: number; listing: { title: string; city: string }; occurrences: Occurrence[]; deadline?: string };

const MARITAL: MaritalStatus[] = ['single', 'married', 'stable_union', 'divorced', 'widowed'];
const REGIMES: PropertyRegime[] = ['partial', 'universal', 'final_participation', 'separation_conventional', 'separation_mandatory'];

/** Link do fiador e, quando ele é casado, do cônjuge (autorização da fiança, CC art. 1.647, III). */
export function GuarantorPage() {
  const { token } = useParams();
  const { t, locale } = useI18n();
  const [info, setInfo] = useState<GInfo | null>(null);
  const [consent, setConsent] = useState(false);
  const [marital, setMarital] = useState<MaritalStatus | ''>('');
  const [regime, setRegime] = useState<PropertyRegime | ''>('');
  const [spouse, setSpouse] = useState({ name: '', documentNumber: '', email: '' });
  const [error, setError] = useState('');
  const load = () => api<GInfo>(`/guarantor/${token}`).then(setInfo).catch((e) => setError(errorText(e, t)));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const isSpouse = info?.role === 'spouse';
  const needSpouse = !isSpouse && spouseConsentRequired(marital || undefined, regime || undefined);
  async function respond(accept: boolean) {
    setError('');
    const body = !accept || isSpouse ? { accept, consent } : {
      accept, consent, maritalStatus: marital || undefined, propertyRegime: marital === 'married' ? regime || undefined : undefined,
      spouse: needSpouse ? spouse : undefined,
    };
    try { await api(`/guarantor/${token}`, { body }); load(); } catch (e) { setError(errorText(e, t)); }
  }
  if (!info) return <div className="container narrow">{error && <p className="errors">{error}</p>}</div>;
  const ready = consent && (isSpouse || (!!marital && (marital !== 'married' || !!regime) && (!needSpouse || (spouse.name.trim().length >= 3 && spouse.documentNumber.trim().length >= 5 && /\S+@\S+\.\S+/.test(spouse.email)))));
  return (
    <div className="container narrow">
      <h1>{isSpouse ? t('gpage.spousePageTitle') : t('gpage.title')}</h1>
      <div className="panel">
        <p>{isSpouse
          ? t('gpage.spouseIntro', { name: info.spouseName ?? '', guarantor: info.guarantorName, guest: info.guestName, title: info.listing.title, city: info.listing.city })
          : t('gpage.intro', { name: info.guarantorName, guest: info.guestName, title: info.listing.title, city: info.listing.city })}</p>
        <ul>{info.occurrences.map((o) => <li key={o.date}>{formatDate(o.date, locale)} · {o.start}–{o.end}</li>)}</ul>
        <p>{t('gpage.total')}: <strong>{money(info.total, info.currency, locale)}</strong></p>
        <p className="notice">{t('gpage.liability', { cap: money(info.liabilityCap, info.currency, locale) })}</p>
        <Link to="/regras/guarantor-deposit" target="_blank">{t('legal.guarantor-deposit')}</Link>
        {info.status === 'invited' && info.bookingStatus === 'pending_guarantor' ? (
          <>
            {info.deadline && <p className="muted small">{t('booking.deadline', { at: formatDateTime(info.deadline, locale) })}</p>}
            {!isSpouse && (
              <div className="form-grid">
                <label>{t('gpage.maritalStatus')}
                  <select value={marital} onChange={(e) => setMarital(e.target.value as MaritalStatus | '')}>
                    <option value="">—</option>
                    {MARITAL.map((m) => <option key={m} value={m}>{t(`gpage.ms.${m}` as DictKey)}</option>)}
                  </select>
                </label>
                {marital === 'married' && (
                  <label>{t('gpage.regime')}
                    <select value={regime} onChange={(e) => setRegime(e.target.value as PropertyRegime | '')}>
                      <option value="">—</option>
                      {REGIMES.map((r) => <option key={r} value={r}>{t(`gpage.rg.${r}` as DictKey)}</option>)}
                    </select>
                  </label>
                )}
                {needSpouse && regime && <>
                  <p className="notice small span2"><strong>{t('gpage.spouseTitle')}.</strong> {t('gpage.spouseExplain')}</p>
                  <label>{t('gpage.spouseName')}<input value={spouse.name} maxLength={160} onChange={(e) => setSpouse({ ...spouse, name: e.target.value })} /></label>
                  <label>{t('gpage.spouseDoc')}<input value={spouse.documentNumber} maxLength={30} inputMode="numeric" onChange={(e) => setSpouse({ ...spouse, documentNumber: e.target.value })} /></label>
                  <label className="span2">{t('gpage.spouseEmail')}<input type="email" value={spouse.email} maxLength={200} onChange={(e) => setSpouse({ ...spouse, email: e.target.value })} /></label>
                </>}
              </div>
            )}
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {isSpouse ? t('gpage.spouseConsent') : t('gpage.consent')}</label>
            <div className="row gap">
              <button className="btn btn-primary" disabled={!ready} onClick={() => respond(true)}>{isSpouse ? t('gpage.spouseAccept') : t('gpage.accept')}</button>
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
