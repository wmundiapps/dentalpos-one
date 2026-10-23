import { requireBusiness } from '@/lib/auth';
import { rulesFor } from '@/lib/services/cashback';
import { ruleSummary, ruleTerms } from '@/components/rules';
import { toggleRuleAction } from '@/app/actions';
import { RuleForm } from './RuleForm';
import { config } from '@/lib/config';

export const metadata = { title: 'Regras de cashback' };

export default async function Regras() {
  const { business, isOwner } = await requireBusiness();
  const rules = await rulesFor(business.id);
  return (
    <div className="stack">
      <h1>Regras de cashback</h1>
      <p className="muted">Cashback em valor fixo ou percentual, para todos ou só para clientes novos. Quando mais de uma regra vale, o cliente ganha a maior. Nossa taxa é {config.cashbackFeeBps / 100}% do cashback que o cliente usar.</p>
      <section className="card">
        {rules.length ? (
          <div className="list">
            {rules.map((r) => (
              <div key={r.id} className="row between" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <strong>{r.title}</strong> {r.active ? <span className="tag green">Ativa</span> : <span className="tag">Pausada</span>}
                  <p style={{ margin: '2px 0' }}>{ruleSummary(r)}</p>
                  <small>{ruleTerms(r)}</small>
                </div>
                {isOwner && (
                  <form action={toggleRuleAction}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <button className="btn ghost sm" name="active" value={r.active ? '0' : '1'}>
                      {r.active ? 'Pausar' : 'Ativar'}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhuma regra criada.</p>
        )}
      </section>
      {isOwner ? (
        <section className="card">
          <h2>Nova regra</h2>
          <RuleForm feePct={config.cashbackFeeBps / 100} />
        </section>
      ) : (
        <p className="muted">Só o dono da empresa cria e altera regras.</p>
      )}
    </div>
  );
}
