import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, Submit } from '@/components/ui';
import { Field } from '@/components/fields';
import { loginAction } from '../actions';
import { getSession, homeFor } from '@/lib/auth';
import { Captcha } from '@/components/Captcha';

export const metadata = { title: 'Entrar' };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ senha?: string; volta?: string; conta?: string }> }) {
  const sp = await searchParams;
  const s = await getSession();
  if (s) redirect(s.role === 'consumer' && sp.volta?.startsWith('/n/') ? sp.volta : homeFor(s.role));
  return (
    <main className="auth">
      <div className="card">
        <Link href="/" aria-label="Página inicial">
          <img src="/logo.svg" alt="Cashbacksmart" className="logo" />
        </Link>
        <h1>Entrar</h1>
        {sp.senha && <p className="alert ok" style={{ marginBottom: 14 }}>Senha alterada. Entre com a nova senha.</p>}
        {sp.conta === 'excluida' && <p className="alert ok" style={{ marginBottom: 14 }}>Sua conta foi excluída e seus dados pessoais foram apagados.</p>}
        <ActionForm action={loginAction}>
          {sp.volta && <input type="hidden" name="volta" value={sp.volta} />}
          <Field label="E-mail" name="email" type="email" autoComplete="email" required />
          <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
          <Captcha />
          <Submit className="btn block">Entrar</Submit>
          <p style={{ marginTop: 12, textAlign: 'center' }}>
            <Link href="/recuperar-senha">Esqueci minha senha</Link>
          </p>
        </ActionForm>
        <p className="muted" style={{ marginTop: 18 }}>
          Ainda não participa? <Link href={sp.volta ? `/cadastro?volta=${encodeURIComponent(sp.volta)}` : '/cadastro'}>Criar conta grátis</Link> · <Link href="/cadastro/empresa">Cadastrar minha empresa</Link>
        </p>
      </div>
    </main>
  );
}
