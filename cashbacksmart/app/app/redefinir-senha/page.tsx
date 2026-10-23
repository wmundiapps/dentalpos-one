import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ui';
import { Field } from '@/components/fields';
import { resetPasswordAction } from '../actions';

export const metadata = { title: 'Nova senha' };

export default async function Redefinir({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="auth">
      <div className="card">
        <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        <h1>Criar nova senha</h1>
        {t ? (
          <ActionForm action={resetPasswordAction}>
            <input type="hidden" name="token" value={t} />
            <Field label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Mínimo de 8 caracteres. Evite senhas óbvias." />
            <Field label="Repita a nova senha" name="password2" type="password" autoComplete="new-password" required />
            <Submit className="btn block">Salvar nova senha</Submit>
          </ActionForm>
        ) : (
          <p className="alert error">
            Link incompleto. <Link href="/recuperar-senha">Peça um novo link</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
