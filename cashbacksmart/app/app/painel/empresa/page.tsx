import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { one } from '@/lib/db';
import { staffOf } from '@/lib/services/catalog';
import { ActionForm, Submit } from '@/components/ui';
import { CashbackFields, CategorySelect, Field, StateSelect } from '@/components/fields';
import { addBusinessAction, addStaffAction, logoutAction, updateBusinessAction } from '@/app/actions';

export const metadata = { title: 'Empresa' };

export default async function Empresa() {
  const { business, isOwner } = await requireBusiness();
  const [b, staff] = await Promise.all([one<any>('select * from businesses where id=$1', [business.id]), staffOf(business.id)]);
  return (
    <div className="stack">
      <h1>Empresa</h1>
      <p className="row">
        <Link href="/painel/kit" className="btn coin sm">
          Kit do caixa (QR para imprimir)
        </Link>
        <Link href="/painel/leads" className="btn ghost sm">
          Captação de clientes
        </Link>
        {isOwner && (
          <Link href="/painel/faturas" className="btn ghost sm">
            Assinatura e faturas
          </Link>
        )}
      </p>
      {isOwner ? (
        <section className="card">
          <h2>Dados da loja</h2>
          <ActionForm action={updateBusinessAction}>
            <Field label="Nome" name="name" defaultValue={b.name} required />
            <CategorySelect defaultValue={b.category} />
            <div className="field">
              <label htmlFor="f-description">Descrição (aparece no app)</label>
              <textarea id="f-description" name="description" defaultValue={b.description} maxLength={600} style={{ minHeight: 80 }} />
            </div>
            <div className="grid-2">
              <Field label="Endereço" name="address" defaultValue={b.address} />
              <Field label="Bairro" name="neighborhood" defaultValue={b.neighborhood} />
            </div>
            <Field label="Telefone" name="phone" defaultValue={b.phone || ''} />
            <p className="muted">
              Cidade: {b.city}/{b.state}
            </p>
            <Submit>Salvar</Submit>
          </ActionForm>
        </section>
      ) : (
        <section className="card">
          <h2>{b.name}</h2>
          <p className="muted">Você entrou como operador de caixa.</p>
        </section>
      )}

      <section className="card">
        <h2>Equipe</h2>
        <div className="list">
          {staff.map((u: any) => (
            <div key={u.id} className="row between">
              <span>
                {u.name} <small>{u.email}</small>
              </span>
              <span className="tag">{u.role === 'owner' ? 'Dono' : 'Caixa'}</span>
            </div>
          ))}
        </div>
        {isOwner && (
          <>
            <h3 style={{ marginTop: 16 }}>Adicionar operador de caixa</h3>
            <ActionForm action={addStaffAction} resetOnOk>
              <div className="grid-2">
                <Field prefix="st" label="Nome" name="name" required />
                <Field prefix="st" label="E-mail" name="email" type="email" required />
              </div>
              <Field prefix="st" label="Senha inicial" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Passe para o operador; ele lança compras mas não vê faturas nem muda regras." />
              <Submit className="btn ghost">Adicionar</Submit>
            </ActionForm>
          </>
        )}
      </section>

      {isOwner && (
        <section className="card">
          <h2>Cadastrar outra loja</h2>
          <p className="muted">Cada loja tem seus próprios 6 meses sem mensalidade, assinatura e regras.</p>
          <ActionForm action={addBusinessAction}>
            <Field prefix="nb" label="Nome da loja" name="businessName" required />
            <div className="grid-2">
              <CategorySelect prefix="nb" />
              <Field prefix="nb" label="CNPJ (opcional)" name="cnpj" inputMode="numeric" />
            </div>
            <div className="grid-2">
              <Field prefix="nb" label="Endereço" name="address" />
              <Field prefix="nb" label="Bairro" name="neighborhood" />
            </div>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 220px' }}>
                <Field prefix="nb" label="Cidade" name="city" required />
              </div>
              <div style={{ width: 110 }}>
                <StateSelect prefix="nb" />
              </div>
            </div>
            <CashbackFields />
            <Submit className="btn ghost">Cadastrar loja</Submit>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2>Segurança</h2>
        <p className="muted">Recomendado: ative a verificação em duas etapas para proteger o caixa e as faturas.</p>
        <a href="/seguranca" className="btn ghost sm">
          Abrir segurança da conta
        </a>
      </section>

      <form action={logoutAction}>
        <button className="btn ghost">Sair</button>
      </form>
    </div>
  );
}
