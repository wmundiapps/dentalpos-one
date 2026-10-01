import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n, type DictKey } from '../i18n';
import { useApp } from '../state';
import { PriceLines } from '../components/PriceLines';
import { PolicySummary } from '../components/PolicySummary';
import type { ListingSummary } from '../components/ListingCard';
import { ASYNC_PAYMENT_METHODS, COUNTRY_BY_CODE, PAYMENT_METHOD_LABELS, type PaymentMethodId } from '../../../shared/countries';
import type { Occurrence, PriceBreakdown } from '../../../shared/types';
import { errorText } from '../errors';
import { formatDate, money } from '../format';
import { NextStep } from '../components/NextStep';

type Quote = { price: PriceBreakdown; errors: Array<{ code: string; params?: Record<string, string | number> }>; guarantorRequired: boolean; guarantorLiabilityCap: number };

export default function Checkout() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t, locale } = useI18n();
  const { me } = useApp();
  const nav = useNavigate();
  const occurrences = useMemo<Occurrence[]>(() => { try { return JSON.parse(params.get('o') ?? '[]'); } catch { return []; } }, [params]);
  const guests = Number(params.get('g') ?? 1);
  const [listing, setListing] = useState<ListingSummary | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<PaymentMethodId | ''>('');
  const [purpose, setPurpose] = useState('');
  const [message, setMessage] = useState('');
  const [isConsumer, setIsConsumer] = useState(false);
  const [clientReviews, setClientReviews] = useState(false);
  const [useGuarantor, setUseGuarantor] = useState(false);
  const [g, setG] = useState({ name: '', email: '', phone: '', documentNumber: '', relationship: '' });
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<'asaas' | 'mercadopago' | ''>('');
  const [taxId, setTaxId] = useState('');
  const [lic, setLic] = useState({ body: '', number: '', region: '' });
  const [pay, setPay] = useState<{ url: string; id: string } | null>(null);

  useEffect(() => {
    api<{ listing: ListingSummary }>(`/listings/${id}`).then((d) => setListing(d.listing)).catch(() => setError(t('err.listing_not_found')));
    api<Quote>(`/listings/${id}/quote`, { body: { occurrences } }).then(setQuote).catch((e) => setError(errorText(e, t)));
  }, [id, occurrences, t]);
  // Registra a intenção de reserva (lembrete por e-mail se não concluir)
  useEffect(() => {
    if (me && id) api(`/checkout-intents`, { body: { listingId: id, query: params.toString().slice(0, 2000) } }).catch(() => {});
  }, [me, id, params]);

  useEffect(() => { if (me?.documentNumber && !taxId) setTaxId(me.documentNumber); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (listing?.payProviders?.length && !provider) setProvider(listing.payProviders[0]); }, [listing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <div className="container empty"><Link to="/entrar">{t('auth.login')}</Link></div>;
  if (!listing || !quote) return <div className="container">{error || <div className="skeleton hero-skeleton" />}</div>;

  const country = COUNTRY_BY_CODE[listing.countryCode];
  const asyncMethod = method && ASYNC_PAYMENT_METHODS.includes(method);
  // Caução sem pré-autorização (Pix/boleto, ou processador que não permite, como o Mercado Pago no Brasil) → avalista
  const depositByGuarantor = listing.securityDeposit > 0 && (!!asyncMethod || listing.depositHold === false);
  const needsGuarantor = quote.guarantorRequired || depositByGuarantor;
  const showGuarantor = needsGuarantor || useGuarantor;
  // Registro profissional: sem nenhum enviado, informa aqui mesmo (fica em verificação, a reserva segue)
  const licenseMissing = listing.requiresLicense && !['approved', 'pending', 'needs_review'].includes(me.licenseStatus);
  const providers = listing.payProviders ?? [];
  const useAsaas = provider === 'asaas';
  // No Asaas: Pix, cartão e boleto, sem o cliente precisar de conta
  // Boleto compensa em até 3 dias: só para reservas que começam daqui a 3 dias ou mais
  const soonest = Math.min(...occurrences.map((o) => Date.parse(`${o.date}T${o.start}:00-03:00`)));
  const boletoOk = soonest - Date.now() >= 3 * 86400000;
  const holdText = (m: string) => m === 'pix' ? t('pay.holdPix') : m === 'boleto' ? t('pay.holdBoleto') : t('pay.holdCard');
  const methods = useAsaas ? country.paymentMethods.filter((m) => ['pix', 'card', 'boleto'].includes(m)) : country.paymentMethods;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const b = await api<{ id: string; status: string; payment?: { checkoutUrl?: string } }>('/bookings', {
        body: {
          listingId: listing!.id, occurrences, guests, purpose, paymentMethod: method, acceptRules: accept, isConsumer,
          provider: provider || undefined, payerTaxId: useAsaas ? taxId : undefined,
          license: licenseMissing ? { body: lic.body, number: lic.number, region: lic.region || undefined } : undefined,
          clientReviewsEnabled: clientReviews, message: message || undefined,
          guarantor: showGuarantor ? { ...g, phone: g.phone || undefined, relationship: g.relationship || undefined } : undefined,
        },
      });
      // Pagamento no checkout do provedor (Stripe / Mercado Pago); volta para a reserva
      // Antes de ir ao pagamento, a janela explica o que fazer lá
      if (b.status === 'pending_payment' && b.payment?.checkoutUrl) setPay({ url: b.payment.checkoutUrl, id: b.id });
      else nav(`/reservas/${b.id}?novo=1`);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container checkout">
      <h1>{listing.instantBook ? t('checkout.titleInstant') : t('checkout.titleRequest')}</h1>
      <form className="checkout-layout" onSubmit={submit}>
        <div className="checkout-main">
          <section className="section">
            <h2>{t('checkout.yourBooking')}</h2>
            <ul className="occ-list">
              {occurrences.map((o) => <li key={o.date}>{formatDate(o.date, locale)} · {o.start}–{o.end}</li>)}
            </ul>
            <p className="muted small">{t('listing.timezone', { tz: listing.timezone })} · {t('checkout.people', { n: guests })}</p>
            {quote.errors.length > 0 && <ul className="errors">{quote.errors.map((x, i) => <li key={i}>{t(`val.${x.code}` as DictKey, x.params)}</li>)}</ul>}
          </section>

          {licenseMissing && (
            <div className="notice warn">🪪 {t('checkout.licenseMissing')} <Link to={`/perfil?voltar=${encodeURIComponent(window.location.pathname + window.location.search)}`}>{t('nav.profile')}</Link></div>
          )}
          {licenseMissing && (
            <section className="section">
              <h2>🪪 {t('checkout.licenseTitle')}</h2>
              <p className="muted small">{t('checkout.licenseInlineHelp')}</p>
              <div className="form-grid">
                <label>{t('checkout.licenseBody')}<input required value={lic.body} onChange={(e) => setLic({ ...lic, body: e.target.value })} placeholder="CRO, CRM, CRP, CREFITO…" /></label>
                <label>{t('checkout.licenseNumber')}<input required value={lic.number} onChange={(e) => setLic({ ...lic, number: e.target.value })} /></label>
                <label>{t('checkout.licenseRegion')}<input maxLength={2} value={lic.region} onChange={(e) => setLic({ ...lic, region: e.target.value.toUpperCase() })} placeholder="PR" /></label>
              </div>
            </section>
          )}

          <section className="section">
            <h2>{t('checkout.purpose')}</h2>
            <p className="muted small">{t('checkout.purposeHelp')}</p>
            <textarea required minLength={3} maxLength={500} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('checkout.purposePlaceholder')} />
            <label className="block-label">{t('checkout.messageHost')}
              <textarea maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('checkout.messagePlaceholder')} />
            </label>
          </section>

          <section className="section">
            <h2>{t('checkout.payment')}</h2>
            <p className="muted small">{t('checkout.paymentCurrency', { currency: listing.currency })}</p>
            {providers.length > 1 && (
              <div className="pay-providers" role="radiogroup" aria-label={t('checkout.whereToPay')}>
                <p className="small"><strong>{t('checkout.whereToPay')}</strong></p>
                {providers.map((p) => (
                  <label key={p} className={`pay-method ${provider === p ? 'selected' : ''}`}>
                    <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => { setProvider(p); setMethod(''); }} />
                    <span><strong>{p === 'asaas' ? t('checkout.providerAsaas') : 'Mercado Pago'}</strong></span>
                    <span className="muted small">{p === 'asaas' ? t('checkout.providerAsaasHint') : t('checkout.providerMpHint')}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="pay-methods" role="radiogroup">
              {methods.map((m) => (
                <label key={m} className={`pay-method ${method === m ? 'selected' : ''} ${m === 'boleto' && !boletoOk ? 'disabled' : ''}`}>
                  <input type="radio" name="pm" value={m} checked={method === m} onChange={() => setMethod(m)} required disabled={m === 'boleto' && !boletoOk} />
                  <span>{PAYMENT_METHOD_LABELS[m]}</span>
                  <span className="muted small">{m === 'boleto' && !boletoOk ? t('pay.boletoTooSoon') : holdText(m)}</span>
                </label>
              ))}
            </div>
            {useAsaas && (
              <label className="block-label">{t('checkout.payerTaxId')}
                <input required inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="000.000.000-00" />
                <span className="muted small">{t('checkout.payerTaxIdHelp')}</span>
              </label>
            )}
            <p className="muted small">🔒 {t('checkout.securePayment')}</p>
          </section>

          {(needsGuarantor || listing.guarantorPolicy === 'optional') && <section className="section">
            <h2>{t('checkout.guarantor')}</h2>
            {needsGuarantor
              ? <p className="notice">{quote.guarantorRequired ? t('checkout.guarantorRequired') : t('checkout.guarantorForDeposit')}</p>
              : listing.guarantorPolicy === 'optional' && <label className="check"><input type="checkbox" checked={useGuarantor} onChange={(e) => setUseGuarantor(e.target.checked)} /> {t('checkout.guarantorOptional')}</label>}
            {!needsGuarantor && listing.guarantorPolicy !== 'optional' && <p className="muted small">{t('checkout.guarantorNotNeeded')}</p>}
            {showGuarantor && (
              <div className="form-grid">
                <label>{t('form.fullName')}<input required minLength={3} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></label>
                <label>{t('form.email')}<input required type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></label>
                <label>{t('form.phone')}<input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></label>
                <label>{t('form.document', { doc: country.documentLabel })}<input required minLength={4} value={g.documentNumber} onChange={(e) => setG({ ...g, documentNumber: e.target.value })} /></label>
                <label className="span2">{t('form.relationship')}<input value={g.relationship} onChange={(e) => setG({ ...g, relationship: e.target.value })} /></label>
                <p className="muted small span2">{t('checkout.guarantorExplain', { cap: money(quote.guarantorLiabilityCap, listing.currency, locale) })} <Link to="/regras/guarantor-deposit">{t('legal.guarantor-deposit')}</Link></p>
              </div>
            )}
          </section>}

          <details className="section">
            <summary><h2 className="inline">{t('checkout.options')}</h2></summary>
            <label className="check"><input type="checkbox" checked={clientReviews} onChange={(e) => setClientReviews(e.target.checked)} /> {t('checkout.enableClientReviews')}</label>
            <label className="check"><input type="checkbox" checked={isConsumer} onChange={(e) => setIsConsumer(e.target.checked)} /> {t('checkout.isConsumer')}</label>
            {country.withdrawalDays > 0 && <p className="muted small">{t('policy.withdrawal', { days: country.withdrawalDays })}</p>}
          </details>

          <details className="section">
            <summary><h2 className="inline">{t('listing.cancellation')}</h2></summary>
            <PolicySummary policy={listing.cancellationPolicy} withdrawalDays={isConsumer ? country.withdrawalDays : 0} />
          </details>

          <section className="section">
            <div className="notice warn small conduct-box">
              <ul>
                <li>{t('rules.short.lawful')}</li>
                <li>{t('rules.short.noWeapons')}</li>
                <li>{t('rules.short.noAggression')}</li>
              </ul>
              <strong>{t('rules.short.consequence')}</strong>
            </div>
            <label className="check accept">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />
              <span>
                {t('checkout.accept')}{' '}
                <Link to="/regras/terms" target="_blank">{t('legal.terms')}</Link>, <Link to="/regras/booking-rules" target="_blank">{t('legal.booking-rules')}</Link>, <Link to="/regras/space-norms" target="_blank">{t('legal.space-norms')}</Link>, <Link to="/regras/penalties" target="_blank">{t('legal.penalties')}</Link>, <Link to="/regras/cancellation-refunds" target="_blank">{t('legal.cancellation-refunds')}</Link> {t('checkout.acceptHouse')}
              </span>
            </label>
            {error && <p className="errors" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={busy || !accept || !method || quote.errors.length > 0}>
              {busy ? t('common.wait') : listing.instantBook ? t('checkout.confirmPay') : t('checkout.sendRequest')}
            </button>
            {!listing.instantBook && <p className="muted small">{t('checkout.requestExplain')}</p>}
          </section>
        </div>

        <aside>
          <div className="panel sticky">
            <strong>{listing.title}</strong>
            <p className="muted small">{listing.city} · {t(`cat.${listing.category}` as DictKey)}</p>
            <PriceLines p={quote.price} />
            {listing.securityDeposit > 0 && <p className="muted small">{listing.depositHold === false ? t('checkout.depositGuarantor') : asyncMethod ? t('checkout.depositNoHold') : t('checkout.depositHold', { h: 72 })}</p>}
            {listing.securityDeposit > 0 && <p className="muted small">{t('listing.damagesRule')}</p>}
          </div>
        </aside>
      </form>
      {pay && (
        <NextStep icon="💳" title={t('next.payTitle')}
          steps={method === 'pix' ? [t('next.payPix1'), t('next.payPix2'), t('next.payBack')] : method === 'boleto' ? [t('next.payBoleto1'), t('next.payBoleto2'), t('next.payBack')] : [t('next.payCard1'), t('next.payBack')]}
          actions={[{ label: t('booking.payNow'), onClick: () => window.location.assign(pay.url) }, { label: t('next.payLater'), to: `/reservas/${pay.id}` }]}>
          <p>{holdText(method)}</p>
        </NextStep>
      )}
    </div>
  );
}
