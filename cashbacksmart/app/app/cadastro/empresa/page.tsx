import { LaunchPromo } from '@/components/LaunchPromo';
import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ui';
import { Captcha } from '@/components/Captcha';
import { CashbackFields, CategorySelect, Field, StateSelect } from '@/components/fields';
import { signupBusinessAction } from '../../actions';

export const metadata = { title: 'Cadastrar empresa' };

export default function CadastroEmpresa() {
  return (
    <main className="auth">
      <div className="card" style={{ maxWidth: 620 }}>
        <Link href="/" aria-label="Página inicial">
          <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        </Link>
        <h1>Cadastre sua empresa</h1>
        <LaunchPromo cta={false} />
        <p className="muted">
          Depois dos 6 meses, R$ 49,90 por mês. A taxa é de 20% só sobre o cashback que o cliente usar na sua loja, numa fatura só, no dia 1º do mês seguinte. E-mails para os clientes da sua cidade, kit do caixa com QR e captação de clientes inclusos.
        </p>
        <ActionForm action={signupBusinessAction}>
          <h2 style={{ marginTop: 8 }}>Empresa</h2>
          <Field label="Nome da empresa" name="businessName" required />
          <div className="grid-2">
            <CategorySelect />
            <Field label="CNPJ" name="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" required hint="Usado para reconhecer as notas fiscais da sua loja." />
          </div>
          <div className="grid-2">
            <Field label="Endereço" name="address" autoComplete="street-address" />
            <Field label="Bairro" name="neighborhood" />
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 220px' }}>
              <Field label="Cidade" name="city" autoComplete="address-level2" required />
            </div>
            <div style={{ width: 110 }}>
              <StateSelect />
            </div>
          </div>
          <CashbackFields />
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
            <legend style={{ fontWeight: 600, fontSize: '.92rem', marginBottom: 6 }}>Promoção de boas-vindas para clientes novos</legend>
            <p className="muted" style={{ fontSize: '.88rem' }}>Um cashback maior faz o cliente experimentar sua loja. Você pode mudar depois.</p>
            <div className="field">
              <label htmlFor="f-wmode">Quando vale</label>
              <select id="f-wmode" name="welcomeMode" defaultValue="first">
                <option value="first">Na primeira compra</option>
                <option value="window">Nos primeiros dias depois da primeira compra</option>
                <option value="none">Não quero promoção agora</option>
              </select>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="f-wkind">Tipo</label>
                <select id="f-wkind" name="welcomeKind" defaultValue="percent">
                  <option value="percent">% da compra</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-wvalue">Valor</label>
                <input id="f-wvalue" name="welcomeValue" inputMode="decimal" defaultValue="30" />
                <small className="muted">ex.: 30% na primeira compra. Nossa taxa seria 6% da venda, só quando o cliente usar.</small>
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-wdays">Dias (se escolher "primeiros dias")</label>
              <input id="f-wdays" name="welcomeDays" type="number" min={1} max={365} defaultValue={30} />
            </div>
          </fieldset>
          <h2 style={{ marginTop: 8 }}>Responsável</h2>
          <Field label="Seu nome" name="name" autoComplete="name" required />
          <div className="grid-2">
            <Field label="E-mail" name="email" type="email" autoComplete="email" required />
            <Field label="Celular com DDD" name="phone" type="tel" autoComplete="tel" inputMode="tel" required />
          </div>
          <Field label="Senha" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Mínimo de 8 caracteres." />
          <div className="field">
            <label className="check">
              <input type="checkbox" name="acceptAds" required />
              <span>
                Concordo com os <Link href="/termos">termos de uso</Link>, com a taxa sobre o cashback usado, com a mensalidade após 6 meses (cancelamento sem multa a qualquer momento) e com o recebimento de comunicações das empresas parceiras.
              </span>
            </label>
          </div>
          <Captcha />
          <Submit className="btn block">Cadastrar minha loja</Submit>
        </ActionForm>
        <p className="muted" style={{ marginTop: 18 }}>
          Já tem conta? <Link href="/entrar">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
