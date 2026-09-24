import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { CANCELLATION_POLICIES, GRACE_PERIOD } from '../../../shared/rules';
import type { CancellationPolicyId } from '../../../shared/types';

export function PolicySummary({ policy, withdrawalDays }: { policy: CancellationPolicyId; withdrawalDays?: number }) {
  const { t } = useI18n();
  const tiers = CANCELLATION_POLICIES[policy];
  return (
    <div>
      <p><strong>{t(`policy.${policy}` as never)}</strong></p>
      <ul className="policy-list">
        {tiers.map((tier, i) => {
          const pct = Math.round(tier.refundRate * 100);
          return <li key={i}>{tier.minHoursBefore > 0
            ? t('policy.tierBefore', { h: tier.minHoursBefore, pct })
            : t('policy.tierLast', { h: tiers[i - 1]?.minHoursBefore ?? 0, pct })}</li>;
        })}
        <li>{t('policy.grace', { h: GRACE_PERIOD.hoursAfterBooking, min: GRACE_PERIOD.minHoursBeforeStart })}</li>
        {!!withdrawalDays && <li>{t('policy.withdrawal', { days: withdrawalDays })}</li>}
        <li>{t('policy.noShow')}</li>
      </ul>
      <Link to="/regras/cancellation-refunds" className="small">{t('common.readFullPolicy')}</Link>
    </div>
  );
}
