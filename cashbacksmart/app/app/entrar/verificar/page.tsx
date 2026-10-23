import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, Submit } from '@/components/ui';
import { Field } from '@/components/fields';
import { verify2faAction } from '../../actions';
import { getPending2fa } from '@/lib/auth';

export const metadata = { title: 'Verificação em duas etapas' };

export default async function Verificar() {
  if (!(await getPending2fa())) redirect('/entrar');
  return (
    <main className="auth">
      <div className="card">
        <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        <h1>Verificação em duas etapas</h1>
        <p className="muted">Digite o código de 6 números do seu aplicativo autenticador. Sem o celular? Use um código de recuperação.</p>
        <ActionForm action={verify2faAction}>
          <Field label="Código" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          <Submit className="btn block">Confirmar</Submit>
        </ActionForm>
        <p className="muted" style={{ marginTop: 16 }}>
          <Link href="/entrar">Voltar</Link>
        </p>
      </div>
    </main>
  );
}
