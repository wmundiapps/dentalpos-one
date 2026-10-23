import { describe, it, expect, afterAll } from 'vitest';
import { pool, one, q } from '../lib/db';
import { registerConsumer, registerBusiness, authenticate } from '../lib/services/accounts';
import { registerPurchase, walletSummary } from '../lib/services/cashback';
import { exportUserData, deleteConsumerAccount } from '../lib/services/privacy';
import { genCPF, genCNPJ } from './helpers';

const T0 = new Date('2026-11-02T15:00:00Z');
const PW = 'Cliente#2026';
let n = 0;
afterAll(async () => {
  await pool().end();
});

async function setup(tag: string) {
  const biz = await registerBusiness({ name: 'Dono ' + tag, email: `dono-${tag}@t.com`, phone: '44988880000', password: PW, city: 'Maringá', state: 'PR', businessName: 'Loja ' + tag, cnpj: genCNPJ(900 + ++n * 13), category: 'Alimentação', cashbackKind: 'percent', cashbackValue: 1000, welcome: null, acceptAds: true }, T0);
  const cons = await registerConsumer({ name: 'Cliente ' + tag, email: `cli-${tag}@t.com`, phone: '4499111000' + n, password: PW, city: 'Maringá', state: 'PR', cpf: genCPF(800 + n * 11), acceptAds: true }, T0);
  const code = (await one<{ member_code: string }>('select member_code from users where id=$1', [cons.id]))!.member_code;
  await registerPurchase({ businessId: biz.businessId, actorId: biz.id, customer: code, amountCents: 5000 }, T0);
  return { biz, cons };
}

describe('LGPD: exportar e excluir a própria conta', () => {
  it('exporta os dados do cliente sem senha nem segredos', async () => {
    const { cons } = await setup('exp');
    const d = await exportUserData(cons.id);
    expect(d.conta.email).toBe('cli-exp@t.com');
    expect(JSON.stringify(d)).not.toMatch(/password_hash|totp_secret/);
    expect(d.compras).toHaveLength(1);
    expect(d.carteira.length).toBeGreaterThan(0);
  });

  it('exclui a conta: pede a senha, anonimiza, encerra o saldo e bloqueia o login', async () => {
    const { cons, biz } = await setup('del');
    await expect(deleteConsumerAccount(cons.id, 'senhaerrada', T0)).rejects.toThrow('Senha incorreta');
    await expect(deleteConsumerAccount(biz.id, PW, T0)).rejects.toThrow('cancele a assinatura');
    await deleteConsumerAccount(cons.id, PW, T0);

    const u = await one<any>('select name, email, phone, cpf, notify_channel from users where id=$1', [cons.id]);
    expect(u.name).toBe('Conta excluída');
    expect(u.email).toMatch(/@excluida\.invalid$/);
    expect(u.phone).toBeNull();
    expect(u.cpf).toBeNull();
    expect(await walletSummary(cons.id, T0)).toHaveLength(0);
    const ledger = await one<{ s: string }>('select sum(amount_cents) s from wallet_entries where consumer_id=$1 and kind in (\'credit\',\'expire\')', [cons.id]);
    expect(Number(ledger!.s)).toBe(0);
    expect(await q('select 1 from audit_log where actor_id=$1 and action=\'account_deleted\'', [cons.id])).toHaveLength(1);
    await expect(authenticate('cli-del@t.com', PW)).rejects.toThrow();
    // o CPF e o e-mail ficam livres para um novo cadastro
    await registerConsumer({ name: 'Volta', email: 'cli-del@t.com', phone: '44991110002', password: PW, city: 'Maringá', state: 'PR', cpf: genCPF(800 + 2 * 11), acceptAds: true }, T0);
  });
});

describe('banco', () => {
  it('toda tabela do esquema public tem RLS ligado (nada exposto pela API pública do Supabase)', async () => {
    const rows = await q<{ tablename: string }>(`select c.relname tablename from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
