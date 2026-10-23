import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool, one, q } from '../lib/db';
import { registerConsumer, registerBusiness, addStaff, titleCity } from '../lib/services/accounts';
import { registerPurchase, saveRule } from '../lib/services/cashback';
import { runBilling } from '../lib/services/billing';
import { createCampaign } from '../lib/services/campaigns';
import { moderateRules, moderateCampaign } from '../lib/moderation';
import { botReply, unresolvedQuestions, userByPhone } from '../lib/services/bot';
import { runFraudScan, openFlags, resolveFlag } from '../lib/services/fraud';
import { welcome, dailyReminders } from '../lib/services/notify';
import { _setLlmFetch } from '../lib/llm';
import { genCNPJ } from './helpers';

function cpf(seed: number) {
  const d = String(100000000 + seed * 7919).slice(0, 9).split('').map(Number);
  const dv = (arr: number[]) => {
    const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}
const DAY = 86400000;
const T0 = new Date(Date.now() - DAY);
let n = 100;
const consumer = (email: string, extra: Partial<Parameters<typeof registerConsumer>[0]> = {}) =>
  registerConsumer({ name: 'Rob ' + email, email, phone: '4498' + String(1000000 + n).slice(-7), password: 'Cliente#2026', city: 'Curitiba', state: 'PR', cpf: cpf(n++), acceptAds: true, ...extra }, T0);
const shop = (email: string) =>
  registerBusiness({ name: 'Dono ' + email, email, phone: '4197' + String(1000000 + n++).slice(-7), password: 'Cliente#2026', city: 'Curitiba', state: 'PR', businessName: 'Loja ' + email, cnpj: genCNPJ(n + 500), category: 'Mercado', cashbackKind: 'percent', cashbackValue: 500, acceptAds: true }, T0);

afterAll(async () => {
  _setLlmFetch((...a) => fetch(...a));
  delete process.env.ANTHROPIC_API_KEY;
  await pool().end();
});

describe('cadastro', () => {
  it('padroniza o nome da cidade', () => {
    expect(titleCity('  SÃO josé   dos campos ')).toBe('São José dos Campos');
    expect(titleCity('maringá')).toBe('Maringá');
  });
  it('indicação: os dois ganham 30 dias de Premium (saldo que não vence)', async () => {
    const a = await consumer('indicador@r.com');
    const code = (await one<{ referral_code: string }>('select referral_code from users where id=$1', [a.id]))!.referral_code;
    const b = await consumer('indicado@r.com', { referral: code });
    const pb = await one<any>('select premium_until from users where id=$1', [b.id]);
    expect(new Date(pb.premium_until).getTime() - T0.getTime()).toBe(30 * DAY);
    const pa = await one<any>('select premium_until from users where id=$1', [a.id]);
    expect(Math.round((new Date(pa.premium_until).getTime() - T0.getTime()) / DAY)).toBe(30);
    await expect(consumer('x@r.com', { referral: 'NAOEXISTE' })).rejects.toThrow('indicação');
  });
});

describe('robô moderador', () => {
  it('bloqueia golpe, apostas, links encurtados e spam', () => {
    expect(moderateRules('Promoção', 'Faça um Pix para liberar seu prêmio').ok).toBe(false);
    expect(moderateRules('Ganhe', 'Aposte no tigrinho hoje').ok).toBe(false);
    expect(moderateRules('Oferta', 'Veja em bit.ly/abc').ok).toBe(false);
    expect(moderateRules('OFERTA IMPERDÍVEL', 'COMPRE AGORA TUDO COM DESCONTO NA NOSSA LOJA HOJE').ok).toBe(false);
    expect(moderateRules('Oferta', 'Corre!!!!!').ok).toBe(false);
    expect(moderateRules('Sexta tem pão quentinho', 'Fornada às 17h, 10% de volta.').ok).toBe(true);
  });
  it('campanha bloqueada não é enviada', async () => {
    const s = await shop('modera@r.com');
    await expect(createCampaign({ businessId: s.businessId, actorId: s.id, scope: 'local', subject: 'Prêmio', body: 'Informe sua senha do banco para ganhar' }, T0)).rejects.toThrow('Campanha não enviada');
  });
  it('usa a IA quando há chave e respeita o veredito', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    _setLlmFetch((async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'BLOQUEAR: promessa enganosa' }], stop_reason: 'end_turn' }))) as any);
    const v = await moderateCampaign('Oferta', 'Produto milagroso para todos');
    expect(v).toEqual({ ok: false, reason: 'promessa enganosa', by: 'ai' });
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe('robô de atendimento', () => {
  let c: { id: string };
  let s: { id: string; businessId: string };
  beforeAll(async () => {
    c = await consumer('bot@r.com');
    s = await shop('botloja@r.com');
    const code = (await one<{ member_code: string }>('select member_code from users where id=$1', [c.id]))!.member_code;
    await registerPurchase({ businessId: s.businessId, actorId: s.id, customer: code, amountCents: 10000 }, T0);
  });

  it('sem IA: responde saldo, faturas e lojas com dados reais', async () => {
    const r1 = await botReply({ userId: c.id, role: 'consumer' }, 'qual é meu saldo?');
    expect(r1.text).toContain('Loja botloja@r.com');
    expect(r1.text).toMatch(/R\$\s?5,00/);
    const r2 = await botReply({ userId: c.id, role: 'consumer' }, 'quando vence minha fatura?');
    expect(r2.text).toContain('Grátis');
    expect(r2.text).toMatch(/R\$\s?4,00/); // menciona o Premium opcional
    const r3 = await botReply({ userId: c.id, role: 'consumer' }, 'tem padaria por aqui?');
    expect(r3.text).toContain('Loja');
  });

  it('sem IA: lojista consulta vendas e regras', async () => {
    const r = await botReply({ userId: s.id, role: 'business' }, 'quanto vendi esse mês?');
    expect(r.text).toMatch(/compras/);
    const r2 = await botReply({ userId: s.id, role: 'business' }, 'quais minhas regras?');
    expect(r2.text).toContain('5%');
  });

  it('registra o que não entendeu para melhorar', async () => {
    const r = await botReply({ userId: c.id, role: 'consumer' }, 'xyzzy plugh');
    expect(r.resolved).toBe(false);
    const list = await unresolvedQuestions();
    expect(list.some((x: any) => x.question === 'xyzzy plugh')).toBe(true);
  });

  it('com IA: usa ferramenta de saldo e responde com o resultado', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const calls: any[] = [];
    _setLlmFetch((async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (calls.length === 1) return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'ver_saldo', input: {} }] }));
      const toolResult = body.messages.at(-1).content[0].content;
      return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: `Seu saldo: ${toolResult}` }] }));
    }) as any);
    const r = await botReply({ userId: c.id, role: 'consumer' }, 'oi, saldo?');
    expect(r.text).toMatch(/Seu saldo: Loja botloja@r\.com: R\$\s?5,00/);
    expect(calls[0].tools.map((t: any) => t.name)).toContain('cancelar_assinatura');
    expect(calls[0].messages[0].role).toBe('user');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('encontra a conta pelo número do WhatsApp, com ou sem o 9', async () => {
    const phone = (await one<{ phone: string }>('select phone from users where id=$1', [c.id]))!.phone;
    expect((await userByPhone('55' + phone))!.id).toBe(c.id);
    expect((await userByPhone('55' + phone.slice(0, 2) + phone.slice(3)))!.id).toBe(c.id);
  });
});

describe('robô antifraude', () => {
  it('pausa a loja que lança cashback para a própria equipe e avisa o dono', async () => {
    const s = await shop('fraude@r.com');
    const staffPhone = '41955554444';
    await addStaff(s.id, s.businessId, { name: 'Caixa', email: 'caixa.fraude@r.com', password: 'Cliente#2026', phone: staffPhone });
    const self = await consumer('laranja@r.com', { phone: staffPhone });
    const code = (await one<{ member_code: string }>('select member_code from users where id=$1', [self.id]))!.member_code;
    for (let i = 0; i < 3; i++) await registerPurchase({ businessId: s.businessId, actorId: s.id, customer: code, amountCents: 5000 }, new Date(T0.getTime() + i * 3600000));
    const r = await runFraudScan(new Date(T0.getTime() + 4 * 3600000));
    expect(r.blocked).toBeGreaterThanOrEqual(1);
    const b = await one<any>('select status from businesses where id=$1', [s.businessId]);
    expect(b.status).toBe('blocked');
    const mail = await one<any>(`select subject from email_outbox where kind='fraud' and to_email='fraude@r.com'`);
    expect(mail.subject).toContain('pausada');
    // rodar de novo não duplica
    expect((await runFraudScan(new Date(T0.getTime() + 5 * 3600000))).flags).toBe(0);
    const flag = (await openFlags()).find((f: any) => f.business_id === s.businessId && f.kind === 'self_purchase');
    await resolveFlag(String(flag.id), true);
    expect((await one<any>('select status from businesses where id=$1', [s.businessId])).status).toBe('active');
  });

  it('sinaliza regra com percentual acima de 50%', async () => {
    const s = await shop('alta@r.com');
    await saveRule(s.businessId, s.id, { title: 'Exagero', kind: 'percent', value: 8000 });
    await runFraudScan(T0);
    expect((await openFlags()).some((f: any) => f.business_id === s.businessId && f.kind === 'high_rule')).toBe(true);
  });
});

describe('robô de avisos', () => {
  it('boas-vindas uma vez só', async () => {
    const c = await consumer('welcome@r.com');
    await welcome(c.id, 'consumer');
    await welcome(c.id, 'consumer');
    const rows = await q(`select * from email_outbox where kind='welcome' and to_email='welcome@r.com'`);
    expect(rows.length).toBe(1);
  });
  it('avisa a loja do fim dos meses grátis, da fatura do dia 1º e do atraso', async () => {
    const l = await shop('aviso@r.com');
    await q(`update subscriptions set trial_ends_at=$2 where business_id=$1`, [l.businessId, new Date(T0.getTime() + 20 * DAY)]);
    await dailyReminders(new Date(T0.getTime() + 18 * DAY));
    expect((await q(`select 1 from email_outbox where kind='trial' and to_email='aviso@r.com'`)).length).toBe(1);
    await runBilling(new Date(T0.getTime() + 70 * DAY));
    expect((await q(`select 1 from email_outbox where kind='invoice' and to_email='aviso@r.com'`)).length).toBeGreaterThanOrEqual(1);
    await dailyReminders(new Date(T0.getTime() + 100 * DAY));
    expect((await q(`select 1 from email_outbox where kind='overdue' and to_email='aviso@r.com'`)).length).toBeGreaterThanOrEqual(1);
  });
});
