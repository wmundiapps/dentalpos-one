import { useI18n } from '../i18n';
import { money } from '../format';
import type { PriceBreakdown } from '../../../shared/types';

export function PriceLines({ p, showHost, hideDeposit }: { p: PriceBreakdown; showHost?: boolean; hideDeposit?: boolean }) {
  const { t, locale } = useI18n();
  const m = (v: number) => money(v, p.currency, locale);
  return (
    <dl className="price-lines">
      <div><dt>{t('price.base', { hours: p.hours, n: p.occurrences })}</dt><dd>{m(p.baseAmount)}</dd></div>
      {p.days > 0 && <div className="muted small"><dt>{t('price.dailyApplied', { n: p.days })}</dt><dd /></div>}
      {p.cleaningFee > 0 && <div><dt>{t('price.cleaning')}</dt><dd>{m(p.cleaningFee)}</dd></div>}
      <div><dt>{t('price.serviceFee')}</dt><dd>{m(p.guestServiceFee)}</dd></div>
      {p.taxOnServiceFee > 0 && <div><dt>{t('price.tax', { tax: p.taxName })}</dt><dd>{m(p.taxOnServiceFee)}</dd></div>}
      <div className="total"><dt>{t('price.total')}</dt><dd>{m(p.total)}</dd></div>
      {p.securityDeposit > 0 && !hideDeposit && <div className="muted small"><dt>{t('price.deposit')}</dt><dd>{m(p.securityDeposit)}</dd></div>}
      {showHost && <>
        <div className="muted small"><dt>{t('price.hostFee')}</dt><dd>−{m(p.hostServiceFee)}</dd></div>
        <div className="total"><dt>{t('price.hostPayout')}</dt><dd>{m(p.hostPayout)}</dd></div>
      </>}
    </dl>
  );
}
