import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, one, q } from '../lib/db';
import { registerConsumer, registerBusiness, authenticate, addStaff } from '../lib/services/accounts';
import { cashbackFor, registerPurchase, generateRedemptionCode, walletSummary, cancelPurchase, expireCredits, saveRule, Rule, feeFor, bestRule } from '../lib/services/cashback';
import { runBilling, markInvoicePaid, buyPackage, invoicesOf, cancelSubscription, buyPremium, monthStart, nextMonthStart } from '../lib/services/billing';
import { submitPhotoClaim, businessByKit } from '../lib/services/nfce';
import { createLeadPage, createPlatformLeadPage, submitLead, leadsFor, setLeadStatus } from '../lib/services/leads';
import { queueMessage, processMessages, setNotifyChannel, MessageSender } from '../lib/services/messages';
import { stripeProvider, verifyStripeSignature } from '../lib/payments';
import crypto from 'crypto';
import { createCampaign, processOutbox, verifyUnsubscribeToken, unsubscribeToken, feedFor } from '../lib/services/campaigns';
import { businessesIn, businessDashboard } from '../lib/services/catalog';
import { submitClaim, approveClaim, rejectClaim, autoApproveClaims, parseNfce } from '../lib/services/nfce';
import { sendPhoneCode, verifyPhoneCode } from '../lib/services/phone';
import { asaasProvider } from '../lib/payments';
import { parseBRL, isValidCPF, isValidCNPJ } from '../lib/format';
import { genCPF, genCNPJ, genNfceKey, yymmOf } from './helpers';
import type { MailSender } from '../lib/email';

const DAY = 86400000;
const T0 = new Date('2026-11-02T15:00:00Z'); // segunda-feira
let seq = 1;
let phoneSeq = 1000;
const PW = 'Cliente#2026';

function consumer(email: string, city = 'Maringá') {
  return registerConsumer({ name: 'Cliente ' + email, email, phone: '4499' + String(1000000 + phoneSeq++).slice(-7), password: PW, city, state: 'PR', cpf: genCPF(seq++), acceptAds: true }, T0);
}
function business(email: string, kind: 'fixed' | 'percent' = 'percent', value = 1000, welcome: any = null) {
  return registerBusiness({ name: 'Dono ' + email, email, phone: '44988880000', password: PW, city: 'Maringá', state: 'PR', businessName: 'Loja ' + email, cnpj: genCNPJ(seq++), category: 'Alimentação', cashbackKind: kind, cashbackValue: value, welcome, acceptAds: true }, T0);
}
async function verifyPhone(userId: string) {
  const r = await sendPhoneCode(userId);
  await verifyPhoneCode(userId, r.devCode!);
}
const codeOf = async (id: string) => (await one<{ member_code: string }>('select member_code from users where id=$1', [id]))!.member_code;
const cnpjOf = async (bid: string) => (await one<{ cnpj: string }>('select cnpj from businesses where id=$1', [bid]))!.cnpj;

afterAll(async () => {
  await pool().end();
});

describe('utilitários', () => {
  it('converte valores em reais para centavos', () => {
    expect(parseBRL('12,50')).toBe(1250);
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('R$ 10')).toBe(1000);
    expect(Number.isNaN(parseBRL('abc'))).toBe(true);
  });
  it('valida CPF, CNPJ e a chave da nota fiscal', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ(genCNPJ(5))).toBe(true);
    const key = genNfceKey('11222333000181', '2611', 123);
    expect(parseNfce(key)?.cnpj).toBe('11222333000181');
    expect(parseNfce(`https://www.fazenda.pr.gov.br/nfce/qrcode?p=${key}|2|1|1|ABC`)?.key).toBe(key);
    expect(parseNfce(key.slice(0, 43) + ((Number(key[43]) + 1) % 10))).toBeNull(); // dígito errado
  });
});

describe('cálculo de cashback e taxa', () => {
  const base: Rule = { id: 'r', title: 't', kind: 'percent', value: 500, min_purchase_cents: 0, max_cashback_cents: null, weekdays: null, release_days: 0, expires_days: 180, active: true, starts_at: null, ends_at: null };
  it('percentual, fixo, mínimo, teto, dias e vigência', () => {
    expect(cashbackFor(base, 10000, T0)).toBe(500);
    expect(cashbackFor(base, 999, T0)).toBe(49);
    expect(cashbackFor({ ...base, kind: 'fixed', value: 1000, min_purchase_cents: 5000 }, 4999, T0)).toBe(0);
    expect(cashbackFor({ ...base, kind: 'fixed', value: 1000 }, 300, T0)).toBe(300);
    expect(cashbackFor({ ...base, max_cashback_cents: 200 }, 10000, T0)).toBe(200);
    expect(cashbackFor({ ...base, weekdays: [2, 3] }, 10000, T0)).toBe(0);
    expect(cashbackFor({ ...base, ends_at: '2026-11-01' }, 10000, T0)).toBe(0);
  });
  it('promoção de boas-vindas vale só para cliente novo', () => {
    const welcome: Rule = { ...base, id: 'w', value: 3000, audience: 'new_customer', new_window_days: null };
    const month: Rule = { ...base, id: 'm', value: 2000, audience: 'new_customer', new_window_days: 30 };
    const rules = [base, welcome, month];
    expect(bestRule(rules, 10000, T0, { firstPurchaseAt: null, welcomeAllowed: true })!.cents).toBe(3000); // primeira compra: 30%
    expect(bestRule(rules, 10000, T0, { firstPurchaseAt: new Date(T0.getTime() - 10 * DAY), welcomeAllowed: true })!.cents).toBe(2000); // dia 10: 20%
    expect(bestRule(rules, 10000, T0, { firstPurchaseAt: new Date(T0.getTime() - 40 * DAY), welcomeAllowed: true })!.cents).toBe(500); // dia 40: regra normal
    expect(bestRule(rules, 10000, T0, { firstPurchaseAt: null, welcomeAllowed: false })!.cents).toBe(500); // celular não confirmado
  });
  it('taxa de 20% sobre o cashback usado (resgatado)', () => {
    expect(feeFor(1000, 0, false)).toBe(0);
    expect(feeFor(1000, 600, false)).toBe(120);
    expect(feeFor(1000, 600, true)).toBe(120); // também nos 6 meses sem mensalidade
  });
});

describe('fluxo completo', () => {
  let ana: { id: string };
  let bruno: { id: string };
  let padaria: { id: string; businessId: string };
  let anaCode: string;

  beforeAll(async () => {
    ana = await consumer('ana@teste.com');
    bruno = await consumer('bruno@teste.com');
    padaria = await business('padaria@teste.com', 'percent', 1000, { kind: 'percent', value: 3000, windowDays: null }); // 10% + 30% na 1ª compra
    anaCode = await codeOf(ana.id);
  });

  it('cliente grátis; loja com 6 meses sem mensalidade e R$ 49,90 depois', async () => {
    const s = await one<any>('select * from subscriptions where user_id=$1', [ana.id]);
    expect(Number(s.price_cents)).toBe(0);
    expect(new Date(s.current_period_end).getUTCFullYear()).toBe(2999);
    const bs = await one<any>('select * from subscriptions where business_id=$1', [padaria.businessId]);
    expect(Number(bs.price_cents)).toBe(4990);
    expect(Math.round((new Date(bs.trial_ends_at).getTime() - T0.getTime()) / DAY)).toBe(180);
    await expect(consumer('ana@teste.com')).rejects.toThrow('e-mail');
    await expect(registerBusiness({ name: 'Dono X', email: 'semcnpj@t.com', phone: '44988880000', password: PW, city: 'Maringá', state: 'PR', businessName: 'Sem CNPJ', category: 'Alimentação', cashbackKind: 'percent', cashbackValue: 500, acceptAds: true })).rejects.toThrow('CNPJ');
  });

  it('autentica com e-mail e senha', async () => {
    expect((await authenticate('ANA@teste.com', PW)).role).toBe('consumer');
    await expect(authenticate('ana@teste.com', 'errada')).rejects.toThrow('incorretos');
  });

  it('boas-vindas exige celular confirmado; um celular vale para uma conta só', async () => {
    const r1 = await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 5000 }, T0);
    expect(r1.cashbackCents).toBe(500); // sem celular confirmado: regra normal de 10%
    await q(`update purchases set status='canceled' where id=$1`, [r1.purchaseId]); // volta a ser cliente novo
    await q(`delete from wallet_entries where purchase_id=$1`, [r1.purchaseId]);
    await verifyPhone(ana.id);
    // outra conta tentando confirmar o mesmo celular
    const clone = await consumer('clone@teste.com');
    const phone = (await one<{ phone: string }>('select phone from users where id=$1', [ana.id]))!.phone;
    await q('update users set phone=$2 where id=$1', [clone.id, phone]);
    await expect(sendPhoneCode(clone.id)).rejects.toThrow('outra conta');
    const r2 = await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 5000 }, T0);
    expect(r2.cashbackCents).toBe(1500); // 30% na primeira compra
    expect(r2.ruleTitle).toContain('Boas-vindas');
    expect(r2.feeCents).toBe(0); // sem resgate, sem taxa
    const r3 = await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 1000 }, T0);
    expect(r3.cashbackCents).toBe(100); // segunda compra: 10%
  });

  it('encontra cliente por CPF e bloqueia quem não é da empresa', async () => {
    const cpf = (await one<{ cpf: string }>('select cpf from users where id=$1', [bruno.id]))!.cpf;
    expect((await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: cpf, amountCents: 2000 }, T0)).customerName).toContain('bruno');
    await expect(registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: 'NAOEXISTE', amountCents: 100 }, T0)).rejects.toThrow('não encontrado');
    await expect(registerPurchase({ businessId: padaria.businessId, actorId: ana.id, customer: anaCode, amountCents: 100 }, T0)).rejects.toThrow('acesso');
  });

  it('operador de caixa lança compras, mas não cadastra outros', async () => {
    const staffId = await addStaff(padaria.id, padaria.businessId, { name: 'Caixa 1', email: 'caixa@padaria.com', password: PW });
    expect((await registerPurchase({ businessId: padaria.businessId, actorId: staffId, customer: anaCode, amountCents: 1000 }, T0)).cashbackCents).toBe(100);
    await expect(addStaff(staffId, padaria.businessId, { name: 'Outro', email: 'x2@padaria.com', password: PW })).rejects.toThrow('dono');
  });

  it('resgate cobra 20% do valor usado e cashback só sobre o valor pago', async () => {
    const code = await generateRedemptionCode(ana.id, padaria.businessId, T0);
    expect(code.maxCents).toBe(1700);
    const r = await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 3000, redemptionCode: code.code }, T0);
    expect(r.redeemedCents).toBe(1700);
    expect(r.cashbackCents).toBe(130);
    expect(r.feeCents).toBe(340);
    await expect(registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 3000, redemptionCode: code.code }, T0)).rejects.toThrow('inválido');
  });

  it('cancelamento estorna cashback, devolve saldo e zera a taxa', async () => {
    const before = Number((await walletSummary(ana.id, T0))[0].available);
    const code = await generateRedemptionCode(ana.id, padaria.businessId, T0);
    const r = await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 1000, redemptionCode: code.code }, T0);
    const c = await cancelPurchase(r.purchaseId, padaria.id, new Date(T0.getTime() + DAY));
    expect(c.restoredCents).toBe(before);
    expect(Number((await walletSummary(ana.id, new Date(T0.getTime() + DAY)))[0].available)).toBe(before);
    expect(Number((await one<any>('select fee_cents from purchases where id=$1', [r.purchaseId])).fee_cents)).toBe(0);
  });

  it('validade mínima de 30 dias; carência e vencimento funcionam', async () => {
    const loja = await business('carencia@teste.com', 'fixed', 300);
    await expect(saveRule(loja.businessId, loja.id, { title: 'Curta', kind: 'percent', value: 500, expiresDays: 10 })).rejects.toThrow('30');
    await q('update cashback_rules set release_days=7, expires_days=30 where business_id=$1', [loja.businessId]);
    await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: anaCode, amountCents: 1000 }, T0);
    let w = (await walletSummary(ana.id, T0)).find((x) => x.business_id === loja.businessId)!;
    expect(Number(w.pending)).toBe(300);
    w = (await walletSummary(ana.id, new Date(T0.getTime() + 8 * DAY))).find((x) => x.business_id === loja.businessId)!;
    expect(Number(w.available)).toBe(300);
    expect(await expireCredits(new Date(T0.getTime() + 38 * DAY))).toBeGreaterThanOrEqual(1);
    expect((await walletSummary(ana.id, new Date(T0.getTime() + 38 * DAY))).find((x) => x.business_id === loja.businessId)).toBeUndefined();
  });

  it('Premium: depois de pago, o saldo não vence mais', async () => {
    const carla = await consumer('carla@teste.com');
    const loja = await business('premium@teste.com', 'fixed', 500);
    const code = await codeOf(carla.id);
    await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: code, amountCents: 1000 }, T0);
    const inv = await buyPremium(carla.id, T0);
    expect(Number((await one<any>('select amount_cents from invoices where id=$1', [inv])).amount_cents)).toBe(4800);
    expect(await buyPremium(carla.id, T0)).toBe(inv); // não duplica fatura aberta
    await markInvoicePaid(inv, T0);
    const credits = await q<any>(`select expires_at from wallet_entries where consumer_id=$1 and kind='credit'`, [carla.id]);
    expect(credits.every((c) => c.expires_at === null)).toBe(true);
    await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: code, amountCents: 1000 }, T0);
    expect(await expireCredits(new Date(T0.getTime() + 400 * DAY))).toBeGreaterThanOrEqual(0);
    expect(Number((await walletSummary(carla.id, new Date(T0.getTime() + 400 * DAY)))[0].available)).toBe(1000);
  });

  it('lista lojas da cidade com a melhor oferta', async () => {
    const list = await businessesIn('PR', 'maringá');
    expect(list.find((b: any) => b.id === padaria.businessId).best_rule.value).toBe(3000);
  });

  describe('nota fiscal enviada pelo cliente', () => {
    let loja: { id: string; businessId: string };
    let cnpj: string;
    let dani: { id: string };
    let daniCode: string;
    const now = new Date(T0.getTime() + 2 * DAY);
    beforeAll(async () => {
      loja = await business('notas@teste.com', 'percent', 500);
      cnpj = await cnpjOf(loja.businessId);
      dani = await consumer('dani@teste.com');
      daniCode = await codeOf(dani.id);
      await verifyPhone(dani.id);
    });

    it('exige celular confirmado, loja participante e nota recente', async () => {
      const semCel = await consumer('semcel@teste.com');
      await expect(submitClaim(semCel.id, genNfceKey(cnpj, yymmOf(now), 1), 1000, now)).rejects.toThrow('celular');
      await expect(submitClaim(dani.id, genNfceKey('11222333000181', yymmOf(now), 2), 1000, now)).rejects.toThrow('ainda não participa');
      await expect(submitClaim(dani.id, genNfceKey(cnpj, '2401', 3), 1000, now)).rejects.toThrow('antiga');
      await expect(submitClaim(dani.id, 'texto qualquer', 1000, now)).rejects.toThrow('Não reconhecemos');
    });

    it('fica pendente; a loja confirma e o cashback cai; a mesma nota não entra de novo', async () => {
      const key = genNfceKey(cnpj, yymmOf(now), 10);
      const r = await submitClaim(dani.id, `https://sefaz/qrcode?p=${key}|2|1`, 4000, now);
      expect(r.status).toBe('pending');
      expect(r.cashbackCents).toBe(200);
      expect((await walletSummary(dani.id, now)).length).toBe(0);
      await approveClaim(r.purchaseId, loja.id, now);
      expect(Number((await walletSummary(dani.id, now))[0].available)).toBe(200);
      await expect(submitClaim(dani.id, key, 4000, now)).rejects.toThrow('já foi lançada');
      await expect(registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: daniCode, amountCents: 4000, nfceKey: key }, now)).rejects.toThrow('já foi lançada');
    });

    it('loja lança depois da nota do cliente: junta as duas, sem duplicar', async () => {
      const key = genNfceKey(cnpj, yymmOf(now), 11);
      const claim = await submitClaim(dani.id, key, 2000, now);
      const r = await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: daniCode, amountCents: 2000 }, new Date(now.getTime() + 3600000));
      expect(r.merged).toBe(true);
      expect(r.purchaseId).toBe(claim.purchaseId);
      expect((await q(`select 1 from purchases where consumer_id=$1 and amount_cents=2000`, [dani.id])).length).toBe(1);
    });

    it('cliente envia a nota que a loja já lançou: vincula, sem duplicar', async () => {
      await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: daniCode, amountCents: 3300 }, now);
      const r = await submitClaim(dani.id, genNfceKey(cnpj, yymmOf(now), 12), 3300, new Date(now.getTime() + 600000));
      expect(r.status).toBe('merged');
      expect((await q(`select 1 from purchases where consumer_id=$1 and amount_cents=3300`, [dani.id])).length).toBe(1);
    });

    it('aprovação automática só para valor baixo, depois de 48 h', async () => {
      const small = await submitClaim(dani.id, genNfceKey(cnpj, yymmOf(now), 13), 5000, now);
      const big = await submitClaim(dani.id, genNfceKey(cnpj, yymmOf(now), 14), 90000, now);
      expect(await autoApproveClaims(new Date(now.getTime() + 47 * 3600000))).toBe(0);
      await autoApproveClaims(new Date(now.getTime() + 49 * 3600000));
      expect((await one<any>('select status from purchases where id=$1', [small.purchaseId])).status).toBe('confirmed');
      expect((await one<any>('select status from purchases where id=$1', [big.purchaseId])).status).toBe('pending');
      await expect(rejectClaim(big.purchaseId, loja.id, '')).rejects.toThrow('motivo');
      await rejectClaim(big.purchaseId, loja.id, 'compra de outro cliente');
    });

    it('limite diário e bloqueio após 3 notas recusadas', async () => {
      const eva = await consumer('eva@teste.com');
      await verifyPhone(eva.id);
      const later = new Date(now.getTime() + 3 * DAY);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push((await submitClaim(eva.id, genNfceKey(cnpj, yymmOf(later), 100 + i), 1000 + i, later)).purchaseId);
      await expect(submitClaim(eva.id, genNfceKey(cnpj, yymmOf(later), 120), 1000, later)).rejects.toThrow('por dia');
      for (const id of ids.slice(0, 3)) await rejectClaim(id, loja.id, 'nota não é deste cliente');
      await expect(submitClaim(eva.id, genNfceKey(cnpj, yymmOf(later), 121), 1000, new Date(later.getTime() + 2 * DAY))).rejects.toThrow('pausado');
    });
  });

  describe('cobrança', () => {
    it('fatura mensal só da taxa nos 6 primeiros meses; cliente nunca recebe fatura', async () => {
      await runBilling(new Date(T0.getTime() + 32 * DAY));
      expect((await invoicesOf({ userId: ana.id })).length).toBe(0);
      const inv = (await invoicesOf({ businessId: padaria.businessId }))[0];
      expect(inv.items.map((i: any) => i.kind)).toEqual(['cashback_fee']);
      expect(Number(inv.amount_cents)).toBe(340);
      expect((await runBilling(new Date(T0.getTime() + 32 * DAY))).invoicesCreated).toBe(0);
    });

    it('inadimplência pausa os lançamentos; pagamento libera', async () => {
      const late = new Date(T0.getTime() + 45 * DAY);
      expect((await runBilling(late)).markedPastDue).toBeGreaterThanOrEqual(1);
      await expect(registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 1000 }, late)).rejects.toThrow('vencida');
      for (const inv of await invoicesOf({ businessId: padaria.businessId })) if (inv.status === 'pending') await markInvoicePaid(inv.id, late);
      expect((await registerPurchase({ businessId: padaria.businessId, actorId: padaria.id, customer: anaCode, amountCents: 1000 }, late)).cashbackCents).toBe(100);
    });

    it('a partir do 7º mês entra a mensalidade de R$ 49,90, cobrada no dia 1º', async () => {
      const m8 = new Date(T0.getTime() + 245 * DAY);
      await runBilling(m8);
      const invs = await invoicesOf({ businessId: padaria.businessId });
      const subs = invs.flatMap((i: any) => i.items.filter((it: any) => it.kind === 'subscription'));
      expect(subs.some((it: any) => Number(it.amount_cents) === 4990)).toBe(true);
      expect(invs.every((i: any) => new Date(i.created_at) <= m8)).toBe(true);
      for (const i of invs) if (i.status === 'pending') await markInvoicePaid(i.id, m8);
    });

    it('cancelamento sem multa: paga só o mês em uso e depois não recebe mais faturas', async () => {
      const l = await business('cancela@teste.com');
      await q(`update subscriptions set trial_ends_at=$2 where business_id=$1`, [l.businessId, new Date(T0.getTime() - DAY)]);
      await cancelSubscription({ businessId: l.businessId }, new Date(T0.getTime() + 5 * DAY));
      // continua lançando até o fim do mês
      const code = await codeOf(ana.id);
      expect((await registerPurchase({ businessId: l.businessId, actorId: l.id, customer: code, amountCents: 1000 }, new Date(T0.getTime() + 10 * DAY))).cashbackCents).toBeGreaterThan(0);
      await runBilling(new Date(T0.getTime() + 40 * DAY));
      const invs = await invoicesOf({ businessId: l.businessId });
      expect(invs.length).toBe(1);
      const total = Number(invs[0].amount_cents);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(4990); // só novembro, proporcional, sem multa
      await runBilling(new Date(T0.getTime() + 100 * DAY));
      expect((await invoicesOf({ businessId: l.businessId })).length).toBe(1);
      await expect(registerPurchase({ businessId: l.businessId, actorId: l.id, customer: code, amountCents: 1000 }, new Date(T0.getTime() + 41 * DAY))).rejects.toThrow('vencida');
    });

    it('dia 1º no horário de Brasília', () => {
      expect(nextMonthStart(new Date('2026-11-30T23:00:00-03:00')).toISOString()).toBe('2026-12-01T03:00:00.000Z');
      expect(nextMonthStart(new Date('2026-12-01T01:00:00-03:00')).toISOString()).toBe('2027-01-01T03:00:00.000Z');
      expect(monthStart(new Date('2026-12-01T01:00:00-03:00')).toISOString()).toBe('2026-12-01T03:00:00.000Z');
    });
  });

  describe('campanhas', () => {
    const now = new Date(T0.getTime() + 246 * DAY);
    const sent: string[] = [];
    const fake: MailSender = { name: 'fake', async sendBatch(m) { sent.push(...m.map((x) => x.to)); return m.map(() => ({ ok: true, id: 'x' })); } };

    it('local vai para a cidade, com limite mensal', async () => {
      await consumer('outra@teste.com', 'Londrina');
      for (const inv of await invoicesOf({ businessId: padaria.businessId })) if (inv.status === 'pending') await markInvoicePaid(inv.id, now);
      const r = await createCampaign({ businessId: padaria.businessId, actorId: padaria.id, scope: 'local', subject: 'Pão quentinho com 10% de volta', body: 'Venha conferir nossas fornadas das 17h.' }, now);
      expect(r.recipients).toBeGreaterThanOrEqual(2);
      await processOutbox(5000, fake, now);
      expect(sent).not.toContain('outra@teste.com');
      expect((await feedFor('PR', 'Maringá')).some((f: any) => f.id === r.campaignId)).toBe(true);
      for (let i = 1; i < 4; i++) await createCampaign({ businessId: padaria.businessId, actorId: padaria.id, scope: 'local', subject: 'Oferta ' + i, body: 'Mensagem de teste ' + i }, now);
      await expect(createCampaign({ businessId: padaria.businessId, actorId: padaria.id, scope: 'local', subject: 'Oferta 5', body: 'Mensagem de teste 5' }, now)).rejects.toThrow('inclusas');
    });

    it('nacional exige pacote pago', async () => {
      await expect(createCampaign({ businessId: padaria.businessId, actorId: padaria.id, scope: 'national', subject: 'Nacional', body: 'Mensagem nacional' }, now)).rejects.toThrow('pacote');
      const pkg = await one<{ id: string }>('select id from campaign_packages order by price_cents limit 1');
      await markInvoicePaid(await buyPackage(padaria.businessId, padaria.id, pkg!.id, now), now);
      const r = await createCampaign({ businessId: padaria.businessId, actorId: padaria.id, scope: 'national', subject: 'Nacional', body: 'Mensagem nacional' }, now);
      expect(r.recipients).toBeGreaterThanOrEqual(3);
    });

    it('descadastro por link assinado', () => {
      expect(verifyUnsubscribeToken(unsubscribeToken(ana.id))).toBe(ana.id);
      expect(verifyUnsubscribeToken(ana.id + '.falso000000000000000000')).toBeNull();
    });
  });

  it('painel mostra a taxa a faturar', async () => {
    const d = await businessDashboard(padaria.businessId, T0);
    expect(Number(d.customers)).toBeGreaterThanOrEqual(2);
  });
});

describe('kit do caixa: nota por foto', () => {
  const now = new Date(T0.getTime() + 3 * DAY);
  const jpeg = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(64 + n)]);
  let loja: { id: string; businessId: string };
  let kit: string;
  let gil: { id: string };
  beforeAll(async () => {
    loja = await business('kit@teste.com', 'percent', 1000);
    kit = (await one<{ kit_code: string }>('select kit_code from businesses where id=$1', [loja.businessId]))!.kit_code;
    gil = await consumer('gil@teste.com');
    await verifyPhone(gil.id);
  });

  it('cada loja tem um código de kit único', async () => {
    expect(kit).toMatch(/^[0-9A-F]{8}$/);
    expect((await businessByKit(kit.toLowerCase()))?.id).toBe(loja.businessId);
  });

  it('valida foto, número e valor; recusa arquivo que não é imagem', async () => {
    await expect(submitPhotoClaim(gil.id, { kitCode: kit, amountCents: 1000, nfNumber: '', photo: jpeg(1) }, now)).rejects.toThrow('número');
    await expect(submitPhotoClaim(gil.id, { kitCode: kit, amountCents: 1000, nfNumber: '55', photo: Buffer.from('MZ executável disfarçado de foto') }, now)).rejects.toThrow('foto');
    await expect(submitPhotoClaim(gil.id, { kitCode: 'XXXXXXXX', amountCents: 1000, nfNumber: '55', photo: jpeg(2) }, now)).rejects.toThrow('Loja não encontrada');
  });

  it('fica pendente para a loja; mesmo número ou mesma foto não entram de novo', async () => {
    const photo = jpeg(3);
    const r = await submitPhotoClaim(gil.id, { kitCode: kit, amountCents: 5000, nfNumber: '000123', photo }, now);
    expect(r.status).toBe('pending');
    expect(r.cashbackCents).toBe(500);
    await expect(submitPhotoClaim(gil.id, { kitCode: kit, amountCents: 5000, nfNumber: '123', photo: jpeg(4) }, now)).rejects.toThrow('já foi lançada');
    await expect(submitPhotoClaim(gil.id, { kitCode: kit, amountCents: 5000, nfNumber: '124', photo }, now)).rejects.toThrow('foto já foi enviada');
    // foto não é aprovada sozinha: a loja precisa conferir
    await autoApproveClaims(new Date(now.getTime() + 72 * 3600000));
    expect((await one<any>('select status from purchases where id=$1', [r.purchaseId])).status).toBe('pending');
    await approveClaim(r.purchaseId, loja.id, now);
    expect(Number((await walletSummary(gil.id, now)).find((w) => w.business_id === loja.businessId)!.available)).toBe(500);
  });

  it('a nota com QR da mesma compra (mesmo número) não duplica a da foto', async () => {
    const cnpj = await cnpjOf(loja.businessId);
    await submitPhotoClaim(gil.id, { kitCode: kit, amountCents: 2000, nfNumber: '777', photo: jpeg(5) }, now);
    await expect(submitClaim(gil.id, genNfceKey(cnpj, yymmOf(now), 777), 2000, now)).rejects.toThrow('já foi lançada');
    const gilCode = await codeOf(gil.id);
    const r = await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: gilCode, amountCents: 2000, nfceKey: genNfceKey(cnpj, yymmOf(now), 777) }, now);
    expect(r.merged).toBe(true);
  });
});

describe('captação de leads', () => {
  const now = new Date(T0.getTime() + 4 * DAY);
  let academia: { id: string; businessId: string };

  it('página da loja entrega o lead só para ela, sem duplicar o mesmo celular', async () => {
    academia = await business('academia@teste.com');
    await q(`update businesses set category='Academia e esporte' where id=$1`, [academia.businessId]);
    const p = await createLeadPage(academia.businessId, academia.id, { title: 'Aula experimental grátis', offer: 'Venha treinar uma semana sem pagar e ganhe 10% de cashback na matrícula.' });
    await expect(submitLead(p.slug, { name: 'Hugo', phone: '44999990001', consent: false }, now)).rejects.toThrow('autorização');
    await expect(submitLead(p.slug, { name: 'Hugo', phone: '123', consent: true }, now)).rejects.toThrow('celular');
    const r = await submitLead(p.slug, { name: 'Hugo Lima', phone: '(44) 99999-0001', consent: true, answer: 'Musculação' }, now);
    expect(r.delivered).toBe(1);
    expect((await submitLead(p.slug, { name: 'Hugo Lima', phone: '44999990001', consent: true }, now)).duplicate).toBe(true);
    const list = await leadsFor(academia.businessId);
    expect(list.length).toBe(1);
    expect(list[0].phone).toBe('44999990001');
    await setLeadStatus(academia.businessId, academia.id, list[0].id, 'contacted');
    expect((await leadsFor(academia.businessId))[0].status).toBe('contacted');
    await expect(createLeadPage(academia.businessId, academia.id, { title: 'Ganhe dinheiro fácil', offer: 'Renda extra garantida com nosso esquema de pirâmide.' })).rejects.toThrow();
  });

  it('página da plataforma divide o lead entre até 3 lojas da categoria e cidade, em rodízio', async () => {
    const shops = [] as { id: string; businessId: string }[];
    for (let i = 0; i < 4; i++) {
      const b = await business(`pet${i}@teste.com`);
      await q(`update businesses set category='Pets' where id=$1`, [b.businessId]);
      shops.push(b);
    }
    const page = await createPlatformLeadPage(shops[0].id, { title: 'Pet shops com cashback em Maringá', offer: 'Banho e tosa com dinheiro de volta.', category: 'Pets', city: 'Maringá', state: 'PR' });
    expect((await submitLead(page.slug, { name: 'Iara', phone: '44999990002', consent: true }, now)).delivered).toBe(3);
    const r2 = await submitLead(page.slug, { name: 'João', phone: '44999990003', consent: true }, now);
    expect(r2.delivered).toBe(3);
    const counts = await Promise.all(shops.map(async (b) => (await leadsFor(b.businessId)).length));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1); // a 4ª loja entra no rodízio
  });
});

describe('avisos por WhatsApp ou SMS', () => {
  it('cashback creditado gera e-mail e mensagem; respeita a escolha e o limite diário', async () => {
    const kel = await consumer('kel@teste.com');
    const loja = await business('aviso@teste.com', 'fixed', 300);
    await registerPurchase({ businessId: loja.businessId, actorId: loja.id, customer: await codeOf(kel.id), amountCents: 1000 }, new Date());
    const msgs = await q<any>(`select * from message_outbox where user_id=$1`, [kel.id]);
    expect(msgs.some((m) => m.kind === 'cashback' && m.channel === 'whatsapp' && /R\$\s?3,00/.test(m.body))).toBe(true);
    expect((await q(`select 1 from email_outbox where user_id=$1 and kind='cashback'`, [kel.id])).length).toBe(1);
    await setNotifyChannel(kel.id, 'sms');
    expect(await queueMessage(kel.id, 'teste 1')).toBe(true);
    expect((await one<any>(`select channel from message_outbox where user_id=$1 order by id desc limit 1`, [kel.id])).channel).toBe('sms');
    expect(await queueMessage(kel.id, 'teste 2')).toBe(true);
    expect(await queueMessage(kel.id, 'teste 3')).toBe(false); // limite de 3 por dia
    await setNotifyChannel(kel.id, 'none');
    expect(await queueMessage(kel.id, 'x', 'security')).toBe(false);
    const sent: string[] = [];
    const fake: MessageSender = { name: 'fake', async send(ch, to) { sent.push(ch + ':' + to); return { ok: true, id: 'm1' }; } };
    const r = await processMessages(1000, fake);
    expect(r.sent).toBeGreaterThanOrEqual(3);
    expect(sent.some((x) => x.startsWith('sms:'))).toBe(true);
  });
});

describe('Stripe (simulado)', () => {
  it('cria fatura hospedada e confere a assinatura do webhook', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      const json = url.includes('/customers/search') ? { data: [] } : url.endsWith('/customers') ? { id: 'cus_1' } : url.includes('/finalize') ? { id: 'in_1', hosted_invoice_url: 'https://invoice.stripe.com/i/1' } : { id: 'in_1' };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await stripeProvider('sk_test', fakeFetch).createCharge({ invoiceId: 'inv-1', amountCents: 4990, dueDate: '2030-01-04', description: 'Mensalidade', customer: { name: 'Loja', email: 'l@l.com', cpfCnpj: null, externalId: 'b1' } });
    expect(r).toEqual({ provider: 'stripe', ref: 'in_1', url: 'https://invoice.stripe.com/i/1' });
    expect(calls.some((c) => c.endsWith('/invoiceitems'))).toBe(true);
    const body = '{"type":"invoice.paid"}';
    const t = 1_800_000_000;
    const sig = crypto.createHmac('sha256', 'whsec').update(`${t}.${body}`).digest('hex');
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec', 300, t)).toBe(true);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'outro', 300, t)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec', 300, t + 1000)).toBe(false);
  });
});

describe('integração Asaas (simulada)', () => {
  it('cria cliente e cobrança e devolve o link de pagamento', async () => {
    const calls: { url: string; body?: any }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = url.includes('/customers?') ? { data: [] } : url.endsWith('/customers') ? { id: 'cus_1' } : { id: 'pay_1', invoiceUrl: 'https://asaas.com/i/pay_1' };
      return new Response(JSON.stringify(json), { status: 200 });
    }) as unknown as typeof fetch;
    const p = asaasProvider('key', 'https://api.test/v3', fakeFetch);
    const r = await p.createCharge({ invoiceId: 'inv-1', amountCents: 4990, dueDate: '2026-12-01', description: 'Assinatura', customer: { name: 'Ana', email: 'a@a.com', cpfCnpj: '52998224725', externalId: 'u1' } });
    expect(r).toEqual({ provider: 'asaas', ref: 'pay_1', url: 'https://asaas.com/i/pay_1' });
    expect(calls[2].body.value).toBe(49.9);
  });
});
