import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ui';
import { Captcha } from '@/components/Captcha';
import { Field, StateSelect } from '@/components/fields';
import { signupConsumerAction } from '../actions';

export const metadata = { title: 'Criar conta' };

export default async function Cadastro({ searchParams }: { searchParams: Promise<{ indicacao?: string; volta?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="auth">
      <div className="card">
        <Link href="/" aria-label="Página inicial">
          <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        </Link>
        <h1>Crie sua conta</h1>
        <p className="muted">Grátis. Ganhe dinheiro de volta nas lojas da sua cidade.</p>
        <ActionForm action={signupConsumerAction}>
          {sp.volta && <input type="hidden" name="volta" value={sp.volta} />}
          <Field label="Nome completo" name="name" autoComplete="name" required />
          <Field label="E-mail" name="email" type="email" autoComplete="email" required />
          <div className="grid-2">
            <Field label="Celular com DDD" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(44) 99999-0000" required />
            <Field label="CPF" name="cpf" inputMode="numeric" placeholder="000.000.000-00" required hint="Usado para a loja te identificar no caixa." />
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 220px' }}>
              <Field label="Cidade" name="city" autoComplete="address-level2" required />
            </div>
            <div style={{ width: 110 }}>
              <StateSelect />
            </div>
          </div>
          <Field label="Senha" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Mínimo de 8 caracteres." />
          <Field label="Código de indicação (opcional)" name="referral" defaultValue={sp.indicacao || ''} />
          <div className="field">
            <label className="check">
              <input type="checkbox" name="acceptAds" required />
              <span>
                Aceito receber ofertas das empresas participantes e avisos do meu cashback no app, por e-mail e por WhatsApp ou SMS, e concordo com os <Link href="/termos">termos de uso e privacidade</Link>.
              </span>
            </label>
          </div>
          <Captcha />
          <Submit className="btn block">Criar conta grátis</Submit>
        </ActionForm>
        <p className="muted" style={{ marginTop: 18 }}>
          Já tem conta? <Link href={sp.volta ? `/entrar?volta=${encodeURIComponent(sp.volta)}` : '/entrar'}>Entrar</Link>
        </p>
      </div>
    </main>
  );
}
