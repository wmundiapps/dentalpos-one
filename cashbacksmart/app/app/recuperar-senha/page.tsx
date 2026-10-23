import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ui';
import { Field } from '@/components/fields';
import { Captcha } from '@/components/Captcha';
import { forgotPasswordAction } from '../actions';

export const metadata = { title: 'Recuperar senha' };

export default function Recuperar() {
  return (
    <main className="auth">
      <div className="card">
        <Link href="/" aria-label="Página inicial">
          <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        </Link>
        <h1>Recuperar senha</h1>
        <p className="muted">Informe o e-mail da conta. Enviamos um link para criar uma nova senha.</p>
        <ActionForm action={forgotPasswordAction}>
          <Field label="E-mail" name="email" type="email" autoComplete="email" required />
          <Captcha />
          <Submit className="btn block">Enviar link</Submit>
        </ActionForm>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link href="/entrar">Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
