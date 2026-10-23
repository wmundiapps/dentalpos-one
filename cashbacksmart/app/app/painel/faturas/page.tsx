import { redirect } from 'next/navigation';
import { requireBusiness } from '@/lib/auth';
import { describeSubscription, invoicesOf, subscriptionOf } from '@/lib/services/billing';
import { config } from '@/lib/config';
import { brl } from '@/lib/format';
import { InvoiceList } from '@/components/Invoices';
import { businessSubscriptionAction } from '@/app/actions';
import { CancelGuarantee } from '@/components/LaunchPromo';

export const metadata = { title: 'Faturas' };

export default async function Faturas() {
  const { business, isOwner } = await requireBusiness();
  if (!isOwner) redirect('/painel');
  const [sub, invoices] = await Promise.all([subscriptionOf({ businessId: business.id }), invoicesOf({ businessId: business.id })]);
  return (
    <div className="stack">
      <h1>Assinatura e faturas</h1>
      <section className="card">
        <p>
          <strong>{describeSubscription(sub)}</strong>
        </p>
        <p className="muted">
          {Math.round(config.businessTrialDays / 30)} meses sem mensalidade; depois {brl(config.businessMonthlyCents)} por mês. Taxa de {config.cashbackFeeBps / 100}% só sobre o cashback que o cliente usar na
          sua loja. Tudo numa fatura só, emitida no dia 1º de cada mês pelo que foi usado no mês anterior (Pix, boleto ou cartão). Campanhas locais por e-mail inclusas ({config.localCampaignsPerMonth} por mês).
        </p>
        <CancelGuarantee />
        <form action={businessSubscriptionAction}>
          {sub?.status === 'canceled' ? (
            <button className="btn" name="op" value="reactivate">
              Reativar assinatura
            </button>
          ) : (
            <button className="btn danger sm" name="op" value="cancel" style={{ marginTop: 10 }}>
              Cancelar assinatura (sem multa)
            </button>
          )}
        </form>
      </section>
      <section className="card">
        <h2>Faturas</h2>
        <InvoiceList invoices={invoices} />
      </section>
    </div>
  );
}
