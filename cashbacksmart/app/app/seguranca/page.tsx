import Link from 'next/link';
import { requireSession, homeFor } from '@/lib/auth';
import { recentLogins, securityStatus } from '@/lib/services/security';
import { dateTimeBR } from '@/lib/format';
import { ActionForm, Submit } from '@/components/ui';
import { Field } from '@/components/fields';
import { changePasswordAction, disableTotpAction, logoutEverywhereAction } from '../actions';
import { TotpSetup } from './TotpSetup';

export const metadata = { title: 'Segurança da conta' };
export const dynamic = 'force-dynamic';

export default async function Seguranca({ searchParams }: { searchParams: Promise<{ obrigatorio?: string; recuperacao?: string }> }) {
  const sess = await requireSession();
  const sp = await searchParams;
  const [st, logins] = await Promise.all([securityStatus(sess.userId), recentLogins(sess.userId)]);
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href={homeFor(sess.role)} className="logo">
            <img src="/logo-negativo.svg" alt="Cashbacksmart" />
          </Link>
          <Link href={homeFor(sess.role)}>Voltar</Link>
        </div>
      </header>
      <main className="page">
        <div className="wrap stack" style={{ maxWidth: 680 }}>
          <h1>Segurança da conta</h1>
          {sp.obrigatorio && !st?.totp_enabled && <p className="alert warn">Administradores precisam ativar a verificação em duas etapas antes de entrar no painel.</p>}
          {sp.recuperacao && <p className="alert warn">Você entrou com um código de recuperação. Restam {st?.recovery_left} códigos. Se perdeu o celular, desative e ative de novo a verificação para gerar códigos novos.</p>}

          <section className="card">
            <h2>Verificação em duas etapas</h2>
            {st?.totp_enabled ? (
              <>
                <p>
                  <span className="tag green">Ativa</span> Códigos de recuperação restantes: {st.recovery_left}
                </p>
                {st.role !== 'admin' && (
                  <ActionForm action={disableTotpAction}>
                    <Field label="Sua senha, para desativar" name="password" type="password" autoComplete="current-password" required />
                    <Submit className="btn danger sm">Desativar</Submit>
                  </ActionForm>
                )}
              </>
            ) : (
              <>
                <p className="muted">Além da senha, a entrada pede um código do aplicativo autenticador do celular (Google Authenticator, Microsoft Authenticator ou Authy). Mesmo quem descobrir sua senha não entra.</p>
                <TotpSetup />
              </>
            )}
          </section>

          <section className="card">
            <h2>Trocar senha</h2>
            <ActionForm action={changePasswordAction} resetOnOk>
              <Field label="Senha atual" name="current" type="password" autoComplete="current-password" required />
              <div className="grid-2">
                <Field label="Nova senha" name="next" type="password" autoComplete="new-password" minLength={8} required />
                <Field label="Repita a nova senha" name="next2" type="password" autoComplete="new-password" required />
              </div>
              <Submit className="btn ghost">Trocar senha</Submit>
            </ActionForm>
          </section>

          <section className="card">
            <h2>Acessos recentes</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Rede</th>
                    <th>Aparelho</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {logins.map((l, i) => (
                    <tr key={i}>
                      <td>{dateTimeBR(l.created_at)}</td>
                      <td>{l.ip || '—'}</td>
                      <td>
                        <small>{(l.user_agent || '').slice(0, 60)}</small>
                      </td>
                      <td>{l.ok ? 'Entrou' : <span className="tag coral">Senha errada</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={logoutEverywhereAction} style={{ marginTop: 12 }}>
              <button className="btn danger sm">Sair de todos os aparelhos</button>
            </form>
          </section>
        </div>
      </main>
    </>
  );
}
