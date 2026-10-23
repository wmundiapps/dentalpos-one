import { headers } from 'next/headers';
import { requireRole } from '@/lib/auth';
import { getUser } from '@/lib/services/accounts';
import { invoicesOf } from '@/lib/services/billing';
import { one } from '@/lib/db';
import { config, premiumPriceCents } from '@/lib/config';
import { brl, dateBR } from '@/lib/format';
import { InvoiceList } from '@/components/Invoices';
import { ActionForm, Submit } from '@/components/ui';
import { deleteAccountAction, emailOptinAction, logoutAction, premiumAction, notifyChannelAction } from '@/app/actions';
import { PhoneVerify } from './PhoneVerify';

export const metadata = { title: 'Conta' };

export default async function Conta() {
  const { userId } = await requireRole('consumer');
  const [u, invoices, extra] = await Promise.all([
    getUser(userId),
    invoicesOf({ userId }),
    one<{ premium_until: Date | null; phone_verified_at: Date | null; notify_channel: string }>('select premium_until, phone_verified_at, notify_channel from users where id=$1', [userId]),
  ]);
  const premium = extra?.premium_until && new Date(extra.premium_until) > new Date();
  // Regra 3.1.1 da Apple: dentro do app do iPhone não se oferece compra de recurso digital fora do pagamento da Apple
  const inIosApp = ((await headers()).get('user-agent') || '').includes('CashbacksmartApp/ios');
  return (
    <div className="stack">
      <h1>Conta</h1>
      <section className="card">
        <h2>{u!.name}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {u!.email} · {u!.city}/{u!.state}
        </p>
        <p style={{ margin: '8px 0 0' }}>
          <span className="tag green">Conta grátis</span> {premium && <span className="tag coin">Premium até {dateBR(extra!.premium_until)}</span>}
        </p>
      </section>

      <section className="card">
        <h2>Celular</h2>
        {extra?.phone_verified_at ? (
          <p style={{ margin: 0 }}>
            <span className="tag green">Confirmado</span> {u!.phone}
          </p>
        ) : (
          <>
            <p className="muted">Confirme seu celular para ganhar as promoções de boas-vindas das lojas e enviar notas fiscais.</p>
            <PhoneVerify />
          </>
        )}
      </section>

      <section className="card">
        <h2>Avisos do seu cashback</h2>
        <p className="muted">Avisamos por e-mail quando cai cashback, quando a loja confirma sua nota e antes do saldo vencer. Escolha também um canal no celular:</p>
        <form action={notifyChannelAction} className="row">
          <select key={extra?.notify_channel || "whatsapp"} name="channel" defaultValue={extra?.notify_channel || "whatsapp"} aria-label="Canal de aviso" style={{ width: 'auto' }}>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="none">Só e-mail</option>
          </select>
          <button className="btn sm">Salvar</button>
        </form>
      </section>

      {(!inIosApp || premium) && (
      <section className="card">
        <h2>Premium: seu saldo nunca vence</h2>
        <p className="muted">
          Na conta grátis, o saldo de cada loja vale pelo prazo dela (mínimo de {config.minExpiresDays} dias). No Premium, nenhum saldo vence. {brl(config.premiumMonthlyCents)} por mês, cobrados uma vez por ano (
          {brl(premiumPriceCents())}).
        </p>
        {premium ? (
          <p style={{ margin: 0 }}>Você é Premium até {dateBR(extra!.premium_until)}.</p>
        ) : (
          <ActionForm action={premiumAction}>
            <Submit className="btn coin">Assinar Premium</Submit>
          </ActionForm>
        )}
      </section>
      )}

      {invoices.length > 0 && (
        <section className="card">
          <h2>Faturas</h2>
          <InvoiceList invoices={invoices} />
        </section>
      )}

      <section className="card">
        <h2>Ofertas por e-mail</h2>
        <p className="muted">As ofertas das lojas sempre aparecem no app. Por e-mail é opcional.</p>
        <form action={emailOptinAction}>
          {u!.email_optin ? (
            <button className="btn ghost sm" name="optin" value="0">
              Parar de receber por e-mail
            </button>
          ) : (
            <button className="btn sm" name="optin" value="1">
              Voltar a receber por e-mail
            </button>
          )}
        </form>
      </section>

      <section className="card">
        <h2>Segurança</h2>
        <p className="muted">Verificação em duas etapas, troca de senha e acessos recentes.</p>
        <a href="/seguranca" className="btn ghost sm">
          Abrir segurança da conta
        </a>
      </section>

      <section className="card">
        <h2>Seus dados</h2>
        <p className="muted">Baixe uma cópia de tudo o que guardamos sobre você ou exclua sua conta.</p>
        <a href="/api/conta/exportar" className="btn ghost sm">
          Baixar meus dados
        </a>
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Excluir minha conta</summary>
          <ActionForm action={deleteAccountAction} className="stack">
            <p className="muted" style={{ marginTop: 12 }}>
              Seus dados pessoais são apagados e o saldo de cashback de todas as lojas é encerrado (ele não é dinheiro e não pode ser sacado). Não dá para desfazer.
            </p>
            <label>
              Senha
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <label>
              Digite EXCLUIR para confirmar
              <input name="confirm" autoComplete="off" required />
            </label>
            <Submit className="btn danger">Excluir minha conta para sempre</Submit>
          </ActionForm>
        </details>
      </section>

      <form action={logoutAction}>
        <button className="btn ghost">Sair</button>
      </form>
    </div>
  );
}
