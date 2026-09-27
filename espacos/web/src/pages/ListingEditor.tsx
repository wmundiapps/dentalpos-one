import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { useApp } from '../state';
import { AMENITIES, BOOKING_LIMITS, CATEGORIES, CATEGORY_ICONS, FEES, HEALTH_CATEGORIES } from '../../../shared/rules';
import { LAUNCH_COUNTRIES, COUNTRY_BY_CODE } from '../../../shared/countries';
import type { Listing, TimeRange, Weekday } from '../../../shared/types';
import { countryName, flag, timeSlots } from '../format';
import { errorText } from '../errors';
import { PhotoUploader } from '../components/PhotoUploader';
import { PlacePicker } from '../components/PlacePicker';

type Form = Omit<Listing, 'id' | 'hostId' | 'createdAt' | 'currency' | 'timezone'>;

const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function blank(country: string): Form {
  const c = LAUNCH_COUNTRIES.find((x) => x.code === country) ?? LAUNCH_COUNTRIES[0];
  return {
    title: '', description: '', category: 'dental', countryCode: c.code, state: '', city: '', neighborhood: '', address: '',
    capacity: 2, areaM2: undefined, amenities: ['wifi'], equipment: '', photos: [], pricePerHour: 0, pricePerDay: undefined,
    minHours: 1, cleaningFee: 0, securityDeposit: 0, instantBook: true, cancellationPolicy: 'moderate', guarantorPolicy: 'none',
    guarantorThreshold: undefined, requiresLicense: true, hostLicenseResponsibility: false, houseRules: '', buildingRules: '', allowedActivities: '', forbiddenActivities: '',
    bufferMinutes: 30, weeklyAvailability: { 1: [{ start: '18:00', end: '22:00' }], 2: [{ start: '18:00', end: '22:00' }], 3: [{ start: '18:00', end: '22:00' }], 4: [{ start: '18:00', end: '22:00' }], 5: [{ start: '18:00', end: '22:00' }], 6: [{ start: '08:00', end: '14:00' }] },
    blockedDates: [], active: true,
  };
}

// Campo numérico que guarda o texto digitado: evita o "0" grudado ("020") e aceita vírgula decimal.
function NumInput({ value, onChange, ...rest }: { value: number | undefined; onChange: (v: number | undefined) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : Number(text.replace(',', '.'));
    if (parsed !== value) setText(value === undefined ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input {...rest} type="text" inputMode="decimal" value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, '');
        setText(raw);
        const n = raw === '' ? undefined : Number(raw.replace(',', '.'));
        onChange(n === undefined || Number.isNaN(n) ? undefined : n);
      }} />
  );
}

// Em que seção do formulário está o problema apontado pelo servidor
const FIELD_SECTION: Record<string, number> = {
  category: 1, countryCode: 2, state: 2, city: 2, neighborhood: 2, address: 2,
  title: 3, description: 3, capacity: 3, areaM2: 3, amenities: 3, equipment: 3, photos: 3,
  weeklyAvailability: 4, blockedDates: 4, bufferMinutes: 4, minHours: 4,
  pricePerHour: 5, pricePerDay: 5, cleaningFee: 5, securityDeposit: 5,
  instantBook: 6, cancellationPolicy: 6, guarantorPolicy: 6, guarantorThreshold: 6, requiresLicense: 6, hostLicenseResponsibility: 6,
  houseRules: 7, buildingRules: 7, allowedActivities: 7, forbiddenActivities: 7,
};
const CODE_SECTION: Record<string, number> = {
  country_not_supported: 2, state_required: 2, city_not_supported: 2, availability_outside_platform_hours: 4,
  cleaning_fee_too_high: 5, deposit_too_high: 5, guarantor_threshold_required: 6,
};
const FIELD_LABEL: Record<string, DictKey> = {
  city: 'form.city', state: 'form.state', address: 'form.address', title: 'form.title', description: 'form.description',
  capacity: 'form.capacity', areaM2: 'form.area', equipment: 'form.equipment', bufferMinutes: 'form.buffer', minHours: 'form.minHours',
  pricePerHour: 'form.pricePerHour', pricePerDay: 'form.pricePerDay', cleaningFee: 'form.cleaningFee', securityDeposit: 'form.deposit',
  guarantorThreshold: 'form.guarantorThreshold', houseRules: 'listing.houseRules',
};

function sectionOf(err: unknown): number | undefined {
  if (!(err instanceof ApiError)) return undefined;
  if (err.code === 'validation' && Array.isArray(err.params)) {
    const first = (err.params as Array<{ path: string }>)[0]?.path.split('.')[0];
    return first ? FIELD_SECTION[first] : undefined;
  }
  return CODE_SECTION[err.code];
}

export default function ListingEditor() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const { me, country } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState<Form>(() => blank(country || me?.countryCode || 'BR'));
  const [blockedText, setBlockedText] = useState('');
  const [error, setError] = useState<{ text: string; section?: number } | null>(null);
  const invalidShown = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<Listing[]>('/host/listings').then((ls) => {
      const l = ls.find((x) => x.id === id);
      if (!l) return;
      const { id: _i, hostId: _h, createdAt: _c, currency: _cu, timezone: _tz, ...rest } = l;
      setF(rest as Form);
      setBlockedText(l.blockedDates.join('\n'));
    });
  }, [id]);

  if (!me) return <div className="container empty"><p>{t('host.loginFirst')}</p><Link to="/entrar?next=/anfitriao/novo" className="btn btn-primary">{t('auth.login')}</Link></div>;

  const cfg = COUNTRY_BY_CODE[f.countryCode];
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const sectionTitle = (n: number) => (document.querySelector(`#sec-${n} h2`)?.textContent ?? '').trim();
  const slots = timeSlots(BOOKING_LIMITS.earliestStart, BOOKING_LIMITS.latestEnd);

  function setRange(d: Weekday, i: number, key: keyof TimeRange, v: string) {
    const ranges = [...(f.weeklyAvailability[d] ?? [])];
    ranges[i] = { ...ranges[i], [key]: v };
    set('weeklyAvailability', { ...f.weeklyAvailability, [d]: ranges });
  }
  function addRange(d: Weekday) {
    set('weeklyAvailability', { ...f.weeklyAvailability, [d]: [...(f.weeklyAvailability[d] ?? []), { start: '08:00', end: '12:00' }] });
  }
  function removeRange(d: Weekday, i: number) {
    set('weeklyAvailability', { ...f.weeklyAvailability, [d]: (f.weeklyAvailability[d] ?? []).filter((_, j) => j !== i) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = {
      ...f,
      blockedDates: blockedText.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
      weeklyAvailability: Object.fromEntries(Object.entries(f.weeklyAvailability).filter(([, r]) => r && r.length)),
      buildingRules: f.buildingRules || undefined, allowedActivities: f.allowedActivities || undefined, forbiddenActivities: f.forbiddenActivities || undefined,
      state: f.state || undefined, neighborhood: f.neighborhood || undefined, guarantorThreshold: f.guarantorPolicy === 'required_over_amount' ? f.guarantorThreshold : undefined,
    };
    try {
      const l = await api<Listing>(id ? `/listings/${id}` : '/listings', { method: id ? 'PUT' : 'POST', body });
      nav(id ? `/espacos/${l.id}` : `/espacos/${l.id}?publicado=1`);
    } catch (err) {
      const section = sectionOf(err);
      let text = errorText(err, t);
      if (err instanceof ApiError && err.code === 'validation' && Array.isArray(err.params)) {
        const fields = [...new Set((err.params as Array<{ path: string }>).map((p) => p.path.split('.')[0]))];
        text = `${t('err.validation')}: ${fields.map((k) => (FIELD_LABEL[k] ? t(FIELD_LABEL[k]) : k)).join(', ')}`;
      }
      setError({ text: section ? t('editor.errorIn', { section: sectionTitle(section), error: text }) : text, section });
    } finally { setBusy(false); }
  }

  return (
    <div className="container editor">
      <h1>{id ? t('editor.editTitle') : t('editor.newTitle')}</h1>
      <p className="muted">{t('editor.intro')}</p>
      <form onSubmit={save} onInvalidCapture={(e) => {
        // Campo obrigatório vazio: o navegador bloqueia o envio; mostramos onde está, ao lado do botão
        if (invalidShown.current) return;
        invalidShown.current = true;
        const el = e.target as HTMLElement;
        const field = (el.closest('label')?.firstChild?.textContent ?? '').trim();
        const section = Number(el.closest('section')?.id.replace('sec-', '')) || undefined;
        setError({ text: t('editor.missingField', { field, section: section ? sectionTitle(section) : '' }), section });
      }}>
        <section id="sec-1" className="section">
          <h2>1. {t('editor.type')}</h2>
          <div className="grid-choices">
            {CATEGORIES.map((c) => (
              <button type="button" key={c} className={`choice ${f.category === c ? 'selected' : ''}`} onClick={() => { set('category', c); set('requiresLicense', HEALTH_CATEGORIES.includes(c) || c === 'law'); }}>
                <span className="cat-icon">{CATEGORY_ICONS[c]}</span> {t(`cat.${c}` as DictKey)}
              </button>
            ))}
          </div>
        </section>

        <section id="sec-2" className="section form-grid">
          <h2 className="span2">2. {t('editor.location')}</h2>
          <label>{t('form.country')}
            <select value={f.countryCode} onChange={(e) => { const c = COUNTRY_BY_CODE[e.target.value]; setF((x) => ({ ...x, countryCode: c.code, state: '', city: '' })); }}>
              {LAUNCH_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {countryName(c.code, locale)}</option>)}
            </select>
          </label>
          <PlacePicker required country={f.countryCode} state={f.state ?? ''} city={f.city} onChange={(st, ci) => setF((x) => ({ ...x, state: st, city: ci }))} />
          <label>{t('form.neighborhood')}<input value={f.neighborhood ?? ''} onChange={(e) => set('neighborhood', e.target.value)} /></label>
          <label>{t('form.address')}<input required minLength={5} value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
          <p className="muted small span2">{t('editor.addressPrivate')} · {t('place.currencyInfo', { currency: cfg.currency })}</p>
        </section>

        <section id="sec-3" className="section form-grid">
          <h2 className="span2">3. {t('editor.details')}</h2>
          <label className="span2">{t('form.title')}<input required minLength={5} maxLength={120} value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="span2">{t('form.description')}<textarea required minLength={20} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label>{t('form.capacity')}<NumInput min={1} required value={f.capacity} onChange={(v) => set('capacity', v ?? 0)} /></label>
          <label>{t('form.area')}<NumInput min={1} value={f.areaM2} onChange={(v) => set('areaM2', v)} /></label>
          <label className="span2">{t('form.equipment')}<textarea value={f.equipment} onChange={(e) => set('equipment', e.target.value)} placeholder={t('editor.equipmentPlaceholder')} /></label>
          <div className="span2 amenity-filter">
            {AMENITIES.map((a) => {
              const on = f.amenities.includes(a);
              return <button type="button" key={a} className={`chip ${on ? 'on' : ''}`} onClick={() => set('amenities', on ? f.amenities.filter((x) => x !== a) : [...f.amenities, a])}>{t(`amen.${a}` as DictKey)}</button>;
            })}
          </div>
          <div className="span2"><span className="block-label">{t('form.photos')}</span><PhotoUploader photos={f.photos} onChange={(p) => set('photos', p)} /></div>
        </section>

        <section id="sec-4" className="section">
          <h2>4. {t('editor.idleHours')}</h2>
          <p className="muted small">{t('editor.idleHoursHelp', { from: BOOKING_LIMITS.earliestStart, to: BOOKING_LIMITS.latestEnd })}</p>
          <table className="hours">
            <tbody>
              {WEEK.map((d) => (
                <tr key={d}>
                  <th>{t(`weekday.${d}` as DictKey)}</th>
                  <td>
                    {(f.weeklyAvailability[d] ?? []).map((r, i) => (
                      <span key={i} className="range">
                        <select value={r.start} onChange={(e) => setRange(d, i, 'start', e.target.value)}>{slots.map((s) => <option key={s}>{s}</option>)}</select>–
                        <select value={r.end} onChange={(e) => setRange(d, i, 'end', e.target.value)}>{slots.map((s) => <option key={s}>{s}</option>)}</select>
                        <button type="button" className="icon-btn" onClick={() => removeRange(d, i)} aria-label={t('common.remove')}>✕</button>
                      </span>
                    ))}
                    <button type="button" className="link-btn" onClick={() => addRange(d)}>+ {t('editor.addRange')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-grid">
            <label>{t('form.buffer')}<NumInput min={0} max={120} step={15} value={f.bufferMinutes} onChange={(v) => set('bufferMinutes', v ?? 0)} /></label>
            <label>{t('form.minHours')}<NumInput min={1} max={BOOKING_LIMITS.maxHoursPerOccurrence} value={f.minHours} onChange={(v) => set('minHours', v ?? 1)} /></label>
            <label className="span2">{t('form.blockedDates')}<textarea value={blockedText} onChange={(e) => setBlockedText(e.target.value)} placeholder="2026-12-24&#10;2026-12-25" /></label>
          </div>
        </section>

        <section id="sec-5" className="section form-grid">
          <h2 className="span2">5. {t('editor.pricing', { currency: cfg.currency })}</h2>
          <label>{t('form.pricePerHour')}<NumInput min={0.01} step="0.01" required value={f.pricePerHour || undefined} onChange={(v) => set('pricePerHour', v ?? 0)} /></label>
          <label>{t('form.pricePerDay')}<NumInput min={0} step="0.01" value={f.pricePerDay} onChange={(v) => set('pricePerDay', v)} /></label>
          <label>{t('form.cleaningFee')}<NumInput min={0} step="0.01" placeholder="0" value={f.cleaningFee || undefined} onChange={(v) => set('cleaningFee', v ?? 0)} /></label>
          <label>{t('form.deposit')}<NumInput min={0} step="0.01" placeholder="0" value={f.securityDeposit || undefined} onChange={(v) => set('securityDeposit', v ?? 0)} /></label>
          <p className="muted small span2">🔒 {t('editor.depositHelp')} <Link to="/regras/guarantor-deposit">{t('legal.guarantor-deposit')}</Link></p>
          <p className="muted small span2">{t('editor.feesHelp', { guest: FEES.guestServiceFeeRate * 100, host: FEES.hostServiceFeeRate * 100, clean: FEES.maxCleaningFeeRate * 100, dep: FEES.maxDepositMultiple })}</p>
        </section>

        <section id="sec-6" className="section form-grid">
          <h2 className="span2">6. {t('editor.policies')}</h2>
          <label>{t('form.cancellationPolicy')}
            <select value={f.cancellationPolicy} onChange={(e) => set('cancellationPolicy', e.target.value as Form['cancellationPolicy'])}>
              {(['flexible', 'moderate', 'strict'] as const).map((p) => <option key={p} value={p}>{t(`policy.${p}` as DictKey)}</option>)}
            </select>
          </label>
          <label>{t('form.guarantorPolicy')}
            <select value={f.guarantorPolicy} onChange={(e) => set('guarantorPolicy', e.target.value as Form['guarantorPolicy'])}>
              {(['none', 'optional', 'required', 'required_over_amount'] as const).map((p) => <option key={p} value={p}>{t(`guarantor.option.${p}` as DictKey)}</option>)}
            </select>
          </label>
          {f.guarantorPolicy === 'required_over_amount' && <label>{t('form.guarantorThreshold')}<NumInput min={1} required value={f.guarantorThreshold} onChange={(v) => set('guarantorThreshold', v)} /></label>}
          <label className="check"><input type="checkbox" checked={f.instantBook} onChange={(e) => set('instantBook', e.target.checked)} /> ⚡ {t('form.instantBook')}</label>
          <label className="check"><input type="checkbox" checked={f.requiresLicense} onChange={(e) => set('requiresLicense', e.target.checked)} /> 🪪 {t('form.requiresLicense', { body: cfg.licenseBodies[f.category] ?? cfg.licenseBodies.default ?? '' })}</label>
          {f.requiresLicense && <>
            <label className="check"><input type="checkbox" checked={f.hostLicenseResponsibility} onChange={(e) => set('hostLicenseResponsibility', e.target.checked)} /> ✅ {t('form.hostLicenseResponsibility')}</label>
            <p className="muted small span2">{t('editor.licenseResponsibilityHelp')} <Link to="/regras/host-obligations">{t('legal.host-obligations')}</Link></p>
          </>}
          <Link to="/regras/cancellation-refunds" className="small span2">{t('common.readFullPolicy')}</Link>
        </section>

        <section id="sec-7" className="section form-grid">
          <h2 className="span2">7. {t('editor.rules')}</h2>
          <label className="span2">{t('listing.houseRules')}<textarea required minLength={10} value={f.houseRules} onChange={(e) => set('houseRules', e.target.value)} placeholder={t('editor.houseRulesPlaceholder')} /></label>
          <label className="span2">{t('listing.buildingRules')}<textarea value={f.buildingRules ?? ''} onChange={(e) => set('buildingRules', e.target.value)} /></label>
          <label>{t('listing.allowed')}<textarea value={f.allowedActivities ?? ''} onChange={(e) => set('allowedActivities', e.target.value)} /></label>
          <label>{t('listing.forbidden')}<textarea value={f.forbiddenActivities ?? ''} onChange={(e) => set('forbiddenActivities', e.target.value)} /></label>
          {cfg.notes && <p className="notice small span2">ℹ {cfg.notes}</p>}
          <p className="muted small span2">{t('editor.hostObligations')} <Link to="/regras/host-obligations">{t('legal.host-obligations')}</Link></p>
        </section>

        <section id="sec-8" className="section">
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> {t('form.active')}</label>
          <div className="publish-row">
            <button className="btn btn-primary" disabled={busy} onClick={() => { invalidShown.current = false; }}>{busy ? t('common.wait') : t('editor.publish')}</button>
            {error && (
              <p className="publish-error" role="alert">
                ⚠️ {error.text}{' '}
                {error.section && <button type="button" className="btn-link" onClick={() => document.getElementById(`sec-${error.section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t('editor.goToSection')}</button>}
              </p>
            )}
          </div>
        </section>
      </form>
    </div>
  );
}
