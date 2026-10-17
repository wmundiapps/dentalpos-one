// Ordens de serviço: check-in (checklist + fotos), pronto (aviso), entrega (checklist de saída, pagamento, cashback, estoque, nota).
import { Router } from 'express';
import { z } from 'zod';
import { pool, one, rows, withTx, lockKey, type Db } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError, audit, clientIp } from '../security.js';
import { getRec, insertRec, listRecs, patchRec, cashbackBalance } from '../repo.js';
import { loadSettings, getAsaasCreds, getTenant } from '../tenant.js';
import { notifyCustomer, render, appUrl } from '../notify.js';
import { feeOf, ensureCustomer, createCharge } from '../asaas.js';
import { emitInvoice } from '../invoice.js';
import { decrypt } from '../secure.js';
import { nowLocal, addDays, FREQ_DAYS } from '../time.js';
import { isoDate, text, uuid } from '../validators.js';

export const ordersRouter = Router();

export const STATES = ['ok', 'sujo', 'risco', 'amassado', 'trinca', 'quebrado', 'mancha', 'rasgado', 'faltando'] as const;
const DAMAGE = new Set(['risco', 'amassado', 'trinca', 'quebrado', 'mancha', 'rasgado', 'faltando']);
const checklistInput = z.record(uuid, z.array(z.enum(STATES)).max(5));
const FUEL = ['vazio', '1/4', '1/2', '3/4', 'cheio'] as const;

const createSchema = z.object({
  customerId: uuid, vehicleId: uuid, serviceIds: z.array(uuid).min(1).max(15),
  appointmentId: uuid.optional(), subscriptionId: uuid.optional(),
  checkin: z.object({
    checklist: checklistInput, fuel: z.enum(FUEL).default('1/2'), km: z.number().int().min(0).max(5_000_000).optional(),
    belongings: text(300).default(''), notes: text(600).default(''),
    customerAgrees: z.literal(true, { errorMap: () => ({ message: 'o cliente precisa concordar com o estado registrado' }) }),
    photoConsent: z.boolean().default(false),
  }),
});

async function snapshotChecklist(db: Db, tenantId: string, input: Record<string, string[]>) {
  const items = await listRecs(db, tenantId, 'checklistItem', { order: "(data->>'order')::int, created_at", limit: 500 });
  return items.filter((i) => i.data.active !== false).map((i) => ({ id: i.id, name: i.data.name as string, area: i.data.area as string, states: input[i.id] ?? [] }));
}

ordersRouter.post('/', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = createSchema.parse(req.body);
  const customer = await getRec(pool, tenantId, 'customer', b.customerId);
  const vehicle = await getRec(pool, tenantId, 'vehicle', b.vehicleId);
  if (!customer || !vehicle || vehicle.data.customerId !== customer.id) throw new HttpError(400, 'Cliente ou veículo inválido.', 'invalido');
  const cat = vehicle.data.categoryKey as string;
  let includedIds = new Set<string>();
  let sub: Awaited<ReturnType<typeof getRec>>;
  if (b.subscriptionId) {
    sub = await getRec(pool, tenantId, 'subscription', b.subscriptionId);
    if (!sub || sub.data.customerId !== customer.id || sub.data.vehicleId !== vehicle.id) throw new HttpError(400, 'Assinatura inválida para este veículo.', 'invalido');
    if (sub.data.status !== 'ativa') throw new HttpError(409, `Assinatura ${sub.data.status}: regularize antes de lavar pelo clube.`, 'assinatura_inativa');
    if (sub.data.nextWashDate > nowLocal().date) throw new HttpError(409, `Próxima lavagem do clube liberada em ${sub.data.nextWashDate}.`, 'cedo_demais');
    const plan = await getRec(pool, tenantId, 'plan', sub.data.planId);
    includedIds = new Set<string>(plan?.data.serviceIds ?? []);
  }
  const items: any[] = [];
  for (const id of b.serviceIds) {
    const s = await getRec(pool, tenantId, 'service', id);
    if (!s || s.data.archived) throw new HttpError(400, 'Serviço inválido.', 'invalido');
    const included = includedIds.has(id);
    items.push({ serviceId: id, name: s.data.name, priceCents: included ? 0 : s.data.prices[cat], included });
  }
  const totalCents = items.reduce((a, i) => a + i.priceCents, 0);
  const checklist = await snapshotChecklist(pool, tenantId, b.checkin.checklist);
  const rec = await withTx(async (tx) => {
    const seq = await one<{ order_seq: number }>(tx, 'UPDATE tenants SET order_seq = order_seq + 1 WHERE id = $1 RETURNING order_seq', [tenantId]);
    const o = await insertRec(tx, tenantId, 'order', {
      number: seq!.order_seq, customerId: customer.id, vehicleId: vehicle.id, categoryKey: cat, customerName: customer.data.name,
      plate: vehicle.data.plate, vehicleLabel: `${vehicle.data.brand} ${vehicle.data.model} ${vehicle.data.year}`,
      items, status: 'em_servico', appointmentId: b.appointmentId ?? null, subscriptionId: b.subscriptionId ?? null,
      checkin: { at: new Date().toISOString(), by: req.user!.name, items: checklist, fuel: b.checkin.fuel, km: b.checkin.km ?? null, belongings: b.checkin.belongings, notes: b.checkin.notes, customerAgrees: true, photoConsent: b.checkin.photoConsent },
      discountCents: 0, cashbackUsedCents: 0, totalCents, paidCents: 0, paymentIds: [],
    });
    if (b.appointmentId) await patchRec(tx, tenantId, 'appointment', b.appointmentId, { status: 'em_atendimento', orderId: o.id });
    await audit(tx, 'os_criada', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { orderId: o.id });
    return o;
  });
  res.status(201).json(rec);
});

ordersRouter.get('/', async (req: AuthedRequest, res) => {
  const q = z.object({ status: z.enum(['em_servico', 'pronto', 'entregue', 'cancelada']).optional(), from: isoDate.optional(), to: isoDate.optional(), customerId: uuid.optional() }).parse(req.query);
  const where: string[] = []; const params: unknown[] = [];
  if (q.status) { params.push(q.status); where.push(`data->>'status' = $${params.length + 2}`); }
  if (q.customerId) { params.push(q.customerId); where.push(`data->>'customerId' = $${params.length + 2}`); }
  if (q.from) { params.push(q.from); where.push(`created_at >= $${params.length + 2}::date`); }
  if (q.to) { params.push(q.to); where.push(`created_at < ($${params.length + 2}::date + 1)`); }
  res.json(await listRecs(pool, tenantOf(req), 'order', { where: where.join(' AND ') || undefined, params, limit: 500 }));
});

ordersRouter.get('/:id', async (req: AuthedRequest, res) => {
  const o = await getRec(pool, tenantOf(req), 'order', req.params.id as string);
  if (!o) throw new HttpError(404, 'Ordem não encontrada.', 'nao_encontrado');
  res.json(o);
});

async function requireOrder(tenantId: string, id: string) {
  const o = await getRec(pool, tenantId, 'order', id);
  if (!o) throw new HttpError(404, 'Ordem não encontrada.', 'nao_encontrado');
  return o;
}

function vars(order: any, customer: any, lavacar: string, extra: Record<string, string> = {}) {
  return { nome: String(customer.name).split(' ')[0]!, veiculo: order.vehicleLabel, placa: order.plate, lavacar, ...extra };
}

ordersRouter.post('/:id/ready', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const o = await requireOrder(tenantId, req.params.id as string);
  if (o.data.status !== 'em_servico') throw new HttpError(409, 'A ordem não está em serviço.', 'estado_invalido');
  const [s, t, c] = [await loadSettings(pool, tenantId), await getTenant(pool, tenantId), await getRec(pool, tenantId, 'customer', o.data.customerId)];
  const upd = await patchRec(pool, tenantId, 'order', o.id, { status: 'pronto', readyAt: new Date().toISOString() });
  let avisos = 0;
  if (c) avisos = await notifyCustomer(pool, tenantId, s.reminders.readyNotice, c.data as any, 'pronto', `Seu veículo está pronto — ${t.name}`, render(s.templates.pronto, vars(o.data, c.data, t.name)), { dedupe: `pronto:${o.id}` });
  res.json({ order: upd, avisosEnfileirados: avisos });
});

const payMethods = ['dinheiro', 'pix', 'debito', 'credito', 'cheque', 'asaas_pix', 'asaas_cartao', 'asaas_boleto'] as const;
const deliverSchema = z.object({
  checklist: checklistInput, notes: text(600).default(''),
  customerAgrees: z.literal(true, { errorMap: () => ({ message: 'o cliente precisa conferir e concordar na entrega' }) }),
  discountCents: z.number().int().min(0).default(0), cashbackUseCents: z.number().int().min(0).default(0),
  payments: z.array(z.object({ method: z.enum(payMethods), amountCents: z.number().int().min(1) })).max(6).default([]),
});

ordersRouter.post('/:id/deliver', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = deliverSchema.parse(req.body);
  const o = await requireOrder(tenantId, req.params.id as string);
  if (!['em_servico', 'pronto'].includes(o.data.status)) throw new HttpError(409, 'Esta ordem já foi encerrada.', 'estado_invalido');
  const [s, t, c] = [await loadSettings(pool, tenantId), await getTenant(pool, tenantId), await getRec(pool, tenantId, 'customer', o.data.customerId)];
  if (!c) throw new HttpError(409, 'Cliente não encontrado.', 'invalido');

  const gross = o.data.totalCents as number;
  if (b.discountCents > gross) throw new HttpError(400, 'Desconto maior que o total.', 'invalido');
  const afterDiscount = gross - b.discountCents;
  if (b.cashbackUseCents > afterDiscount) throw new HttpError(400, 'Cashback maior que o valor a pagar.', 'invalido');
  const balance = await cashbackBalance(pool, tenantId, c.id);
  if (b.cashbackUseCents > balance) throw new HttpError(400, 'Saldo de cashback insuficiente.', 'invalido');
  if (b.cashbackUseCents > 0 && b.cashbackUseCents < s.loyalty.minRedeemCents) throw new HttpError(400, 'Valor abaixo do mínimo para resgate.', 'invalido');
  const toPay = afterDiscount - b.cashbackUseCents;
  if (b.payments.reduce((a, p) => a + p.amountCents, 0) !== toPay) throw new HttpError(400, `Os pagamentos precisam somar ${(toPay / 100).toFixed(2)}.`, 'invalido');

  // Checklist de saída: compara com a entrada e destaca danos novos
  const out = await snapshotChecklist(pool, tenantId, b.checklist);
  const before = new Map<string, string[]>((o.data.checkin.items as any[]).map((i) => [i.id, i.states]));
  const newIssues = out.map((i) => ({ id: i.id, name: i.name, states: i.states.filter((st) => DAMAGE.has(st) && !(before.get(i.id) ?? []).includes(st)) })).filter((i) => i.states.length);

  // Cobranças Asaas (com repasse automático da comissão) antes de gravar
  const asaasCharges = new Map<number, { id: string; invoiceUrl?: string }>();
  const wantsAsaas = b.payments.some((p) => p.method.startsWith('asaas_'));
  if (wantsAsaas) {
    const creds = await getAsaasCreds(tenantId);
    if (!creds) throw new HttpError(409, 'Conecte sua conta Asaas em Configurações para cobrar por Pix/cartão online.', 'asaas_nao_conectado');
    let cpf = ''; try { cpf = c.data.cpfEnc ? decrypt(c.data.cpfEnc) : ''; } catch { /* sem CPF */ }
    const asaasCustomer = await ensureCustomer(creds, { name: c.data.name, cpfCnpj: cpf, email: c.data.email, phone: c.data.whatsapp, externalReference: `cust:${c.id}` });
    for (const [i, p] of b.payments.entries()) {
      if (!p.method.startsWith('asaas_')) continue;
      const billingType = p.method === 'asaas_pix' ? 'PIX' : p.method === 'asaas_cartao' ? 'CREDIT_CARD' : 'BOLETO';
      const ch = await createCharge(creds, { customerId: asaasCustomer, billingType, valueCents: p.amountCents, dueDate: nowLocal().date, description: `${t.name} — OS ${o.data.number}`, externalReference: `${tenantId}:${o.id}:${i}`, platformWalletId: process.env.PLATFORM_ASAAS_WALLET_ID });
      asaasCharges.set(i, ch);
    }
  }

  const done = await withTx(async (tx) => {
    await lockKey(tx, `os:${o.id}`);
    const cur = await getRec(tx, tenantId, 'order', o.id);
    if (!cur || !['em_servico', 'pronto'].includes(cur.data.status)) throw new HttpError(409, 'Esta ordem já foi encerrada.', 'estado_invalido');
    const paymentIds: string[] = [];
    let paidNow = 0;
    for (const [i, p] of b.payments.entries()) {
      const ch = asaasCharges.get(i);
      const pay = await insertRec(tx, tenantId, 'payment', {
        orderId: o.id, customerId: c.id, customerName: c.data.name, method: p.method, amountCents: p.amountCents,
        platformFeeCents: feeOf(p.amountCents), feeMode: ch ? 'split_automatico' : 'a_repassar',
        status: ch ? 'pendente' : 'pago', paidAt: ch ? null : new Date().toISOString(), asaasId: ch?.id ?? null, invoiceUrl: ch?.invoiceUrl ?? null,
      });
      paymentIds.push(pay.id);
      if (!ch) paidNow += p.amountCents;
    }
    if (b.cashbackUseCents > 0) await insertRec(tx, tenantId, 'cashback', { customerId: c.id, deltaCents: -b.cashbackUseCents, reason: 'resgate', orderId: o.id });
    // Cashback ganho sobre o que foi pago (sem contar o próprio cashback usado)
    let earned = 0;
    if (s.loyalty.enabled && c.data.cashbackOptIn && toPay > 0) {
      earned = Math.floor((toPay * s.loyalty.cashbackPercent) / 100);
      if (earned > 0) await insertRec(tx, tenantId, 'cashback', { customerId: c.id, deltaCents: earned, reason: 'compra', orderId: o.id, provider: s.loyalty.cashbacksmart.enabled ? 'cashbacksmart' : 'interno', sync: s.loyalty.cashbacksmart.enabled ? 'pendente' : 'nao_aplicavel' });
    }
    // Estoque: baixa o consumo previsto de cada serviço
    for (const it of cur.data.items as any[]) {
      const svc = await getRec(tx, tenantId, 'service', it.serviceId);
      for (const r of (svc?.data.recipe ?? []) as { itemId: string; qty: number }[]) {
        await tx.query(`UPDATE records SET data = jsonb_set(data, '{qty}', to_jsonb(GREATEST(0, (data->>'qty')::numeric - $3::numeric))), updated_at = now() WHERE tenant_id = $1 AND kind = 'stockItem' AND id = $2`, [tenantId, r.itemId, r.qty]);
        await insertRec(tx, tenantId, 'stockMove', { itemId: r.itemId, delta: -r.qty, reason: 'consumo', orderId: o.id });
      }
    }
    // Nota fiscal (fila)
    let invoiceId: string | null = null;
    if (s.invoice.autoIssue && toPay > 0) {
      const inv = await emitInvoice(s.invoice.provider, { tenantId, cnpj: t.cnpj, customerName: c.data.name, email: c.data.email, amountCents: toPay, description: `Lavagem — OS ${o.data.number}` });
      invoiceId = (await insertRec(tx, tenantId, 'invoice', { orderId: o.id, customerId: c.id, customerName: c.data.name, hasCpf: !!c.data.cpfEnc, amountCents: toPay, status: inv.status, number: inv.number ?? null, provider: s.invoice.provider })).id;
    }
    const today = nowLocal().date;
    await patchRec(tx, tenantId, 'customer', c.id, { lastWashAt: today });
    if (cur.data.subscriptionId) {
      const sub = await getRec(tx, tenantId, 'subscription', cur.data.subscriptionId);
      const plan = sub && (await getRec(tx, tenantId, 'plan', sub.data.planId));
      if (sub && plan) await patchRec(tx, tenantId, 'subscription', sub.id, { lastWashAt: today, nextWashDate: addDays(today, FREQ_DAYS[plan.data.frequency as keyof typeof FREQ_DAYS]) });
    }
    if (cur.data.appointmentId) await patchRec(tx, tenantId, 'appointment', cur.data.appointmentId, { status: 'concluido' });
    const upd = await patchRec(tx, tenantId, 'order', o.id, {
      status: 'entregue', deliveredAt: new Date().toISOString(), discountCents: b.discountCents, cashbackUsedCents: b.cashbackUseCents, paidCents: paidNow,
      paymentIds, invoiceId, cashbackEarnedCents: earned, totalPayableCents: toPay,
      checkout: { at: new Date().toISOString(), by: req.user!.name, items: out, notes: b.notes, customerAgrees: true, newIssues },
    });
    await audit(tx, 'os_entregue', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { orderId: o.id, newIssues: newIssues.length });
    return { upd, earned };
  });

  // Pedido de avaliação no Google (para todos os clientes: a política do Google proíbe filtrar quem recebe)
  if (s.google.placeId && c) {
    const link = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(s.google.placeId)}`;
    await notifyCustomer(pool, tenantId, s.reminders.reviewRequest, c.data as any, 'avaliacao', `Como foi seu atendimento na ${t.name}?`, render(s.templates.avaliacao, vars(o.data, c.data, t.name, { link })),
      { dedupe: `avaliacao:${o.id}`, marketing: true, scheduledAt: new Date(Date.now() + s.google.reviewDelayHours * 3600_000) });
  }
  res.json({ order: done.upd, cashbackEarnedCents: done.earned, newIssues });
});

ordersRouter.post('/:id/cancel', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const o = await requireOrder(tenantId, req.params.id as string);
  if (!['em_servico', 'pronto'].includes(o.data.status)) throw new HttpError(409, 'Só ordens abertas podem ser canceladas.', 'estado_invalido');
  const reason = text(200).parse(req.body?.reason ?? '');
  await audit(pool, 'os_cancelada', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { orderId: o.id, reason });
  res.json(await patchRec(pool, tenantId, 'order', o.id, { status: 'cancelada', cancelReason: reason, canceledAt: new Date().toISOString() }));
});
