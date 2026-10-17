// Rotina periódica (Vercel Cron a cada 5 min): lembretes de agenda, relembrar lavagem, cobrança do clube, alertas legais e envio da fila.
import { pool, rows } from './db.js';
import { listRecs, patchRec, insertRec, getRec } from './repo.js';
import { getAsaasCreds, parseSettings } from './tenant.js';
import { flushOutbox, notifyCustomer, render, appUrl, enqueue } from './notify.js';
import { complianceAlerts } from './routes/dashboard.js';
import { apptVars } from './routes/agenda.js';
import { addDays, addMonths, daysBetween, nowLocal } from './time.js';
import { createCharge, ensureCustomer, feeOf } from './asaas.js';
import { decrypt } from './secure.js';

export async function runJobs() {
  const out = { appointmentReminders: 0, washReminders: 0, subscriptionCharges: 0, legalAlerts: 0, tenantsClosed: 0, outbox: { sent: 0, failed: 0, pending: 0 } };
  const tenants = await rows(pool, "SELECT * FROM tenants WHERE billing_status <> 'cancelada'");
  const now = nowLocal();
  for (const t of tenants) {
    try {
      const s = parseSettings(t.settings);
      // 1) Aviso de horário marcado
      const soon = new Date(Date.now() + s.reminders.appointmentReminderHours * 3600_000);
      const limit = nowLocal(soon).iso;
      const apps = await listRecs(pool, t.id, 'appointment', { where: `data->>'status' IN ('agendado','confirmado') AND data->>'start' > $3 AND data->>'start' <= $4 AND COALESCE(data->>'reminderSent','false') <> 'true'`, params: [now.iso, limit], limit: 200 });
      for (const a of apps) {
        const [c, v] = [await getRec(pool, t.id, 'customer', a.data.customerId), await getRec(pool, t.id, 'vehicle', a.data.vehicleId)];
        if (c && v) await notifyCustomer(pool, t.id, s.reminders.appointmentReminder, c.data as any, 'agenda', `Lembrete do seu horário — ${t.name}`, render(s.templates.agenda, apptVars(a.data, c.data, v.data, t.name)), { dedupe: `lembrete-agenda:${a.id}` });
        await patchRec(pool, t.id, 'appointment', a.id, { reminderSent: true });
        out.appointmentReminders++;
      }
      // 2) Relembrar lavagem (só quem autorizou receber ofertas e não tem horário futuro)
      const cutoff = addDays(now.date, -s.reminders.washReminderDays);
      const cust = await listRecs(pool, t.id, 'customer', { where: `data->>'consentMarketing' = 'true' AND data->>'lastWashAt' <= $3 AND data->>'lastWashAt' <> ''`, params: [cutoff], limit: 300 });
      for (const c of cust) {
        const vs = await listRecs(pool, t.id, 'vehicle', { where: `data->>'customerId' = $3`, params: [c.id], limit: 1 });
        const days = daysBetween(c.data.lastWashAt, now.date);
        const n = await notifyCustomer(pool, t.id, s.reminders.washReminder, c.data as any, 'lembrete', `Hora de lavar o carro — ${t.name}`,
          render(s.templates.lembrete, { nome: String(c.data.name).split(' ')[0], veiculo: vs[0] ? `${vs[0].data.brand} ${vs[0].data.model}` : 'carro', placa: vs[0]?.data.plate ?? '', lavacar: t.name, dias: String(days), link: `${appUrl()}/l/${t.slug}` }),
          { dedupe: `lembrete:${c.id}:${c.data.lastWashAt}`, marketing: true });
        out.washReminders += n;
      }
      // 3) Mensalidade do clube
      const subs = await listRecs(pool, t.id, 'subscription', { where: `data->>'status' = 'ativa' AND data->>'nextBillingDate' <= $3`, params: [now.date], limit: 200 });
      const creds = subs.length ? await getAsaasCreds(t.id) : null;
      for (const sub of subs) {
        const cust2 = await getRec(pool, t.id, 'customer', sub.data.customerId);
        if (!cust2) continue;
        let asaasId: string | null = null, invoiceUrl: string | null = null;
        if (creds) {
          try {
            let cpf = ''; try { cpf = cust2.data.cpfEnc ? decrypt(cust2.data.cpfEnc) : ''; } catch { /* sem CPF */ }
            const ac = await ensureCustomer(creds, { name: cust2.data.name, cpfCnpj: cpf, email: cust2.data.email, phone: cust2.data.whatsapp, externalReference: `cust:${cust2.id}` });
            const ch = await createCharge(creds, { customerId: ac, billingType: 'UNDEFINED', valueCents: sub.data.priceCents, dueDate: now.date, description: `Clube ${t.name}`, externalReference: `${t.id}:sub:${sub.id}:${sub.data.nextBillingDate}`, platformWalletId: process.env.PLATFORM_ASAAS_WALLET_ID });
            asaasId = ch.id; invoiceUrl = ch.invoiceUrl ?? null;
          } catch (e) { console.error('[clube] cobrança falhou', (e as Error).message); continue; }
        }
        await insertRec(pool, t.id, 'payment', { subscriptionId: sub.id, customerId: cust2.id, customerName: cust2.data.name, method: asaasId ? 'asaas_pix' : 'pix', amountCents: sub.data.priceCents, platformFeeCents: feeOf(sub.data.priceCents), feeMode: asaasId ? 'split_automatico' : 'a_repassar', status: 'pendente', paidAt: null, asaasId, invoiceUrl, kind: 'mensalidade_clube' });
        await patchRec(pool, t.id, 'subscription', sub.id, { nextBillingDate: addMonths(sub.data.nextBillingDate, 1) });
        if (invoiceUrl && cust2.data.whatsapp) await enqueue(pool, { tenantId: t.id, channel: 'whatsapp', to: cust2.data.whatsapp, body: `Olá, ${String(cust2.data.name).split(' ')[0]}! A mensalidade do clube da ${t.name} venceu hoje. Pague aqui: ${invoiceUrl}`, topic: 'cobranca', dedupeKey: `mensal:${sub.id}:${sub.data.nextBillingDate}` });
        out.subscriptionCharges++;
      }
      // 4) Alertas legais (licenças, alvarás, aluguel, contratos) por e-mail ao dono
      for (const a of await complianceAlerts(t.id)) {
        const threshold = a.daysLeft <= 0 ? 'vencido' : a.daysLeft <= 7 ? '7d' : '30d';
        const msg = a.daysLeft < 0 ? `venceu há ${-a.daysLeft} dia(s)` : a.daysLeft === 0 ? 'vence hoje' : `vence em ${a.daysLeft} dia(s)`;
        if (await enqueue(pool, { tenantId: t.id, channel: 'email', to: t.email, subject: `Atenção: ${a.title} ${msg}`, body: `${a.title} ${msg} (${a.dueDate.split('-').reverse().join('/')}).\nAbra o LavaPos > Lembretes para marcar como renovado.`, topic: 'legal', dedupeKey: `legal:${a.id}:${a.dueDate}:${threshold}` })) out.legalAlerts++;
      }
    } catch (e) { console.error(`[jobs] tenant ${t.id}`, (e as Error).message); }
  }
  // 5) Contas encerradas há mais de 30 dias: anonimiza dados pessoais (os registros financeiros ficam, sem identificação)
  const closed = await rows(pool, "SELECT id FROM tenants WHERE billing_status = 'cancelada' AND (settings->>'closeRequestedAt')::timestamptz < now() - interval '30 days' AND (settings->>'anonymized') IS NULL");
  for (const c of closed) {
    await pool.query(`UPDATE records SET data = data - 'cpfEnc' - 'cpfLast2' - 'whatsapp' - 'email' - 'notes' || jsonb_build_object('name','Anonimizado') WHERE tenant_id = $1 AND kind = 'customer'`, [c.id]);
    await pool.query("DELETE FROM photos WHERE tenant_id = $1", [c.id]);
    await pool.query("UPDATE tenants SET settings = jsonb_set(settings, '{anonymized}', 'true'), secrets = NULL WHERE id = $1", [c.id]);
    out.tenantsClosed++;
  }
  out.outbox = await flushOutbox();
  await pool.query("DELETE FROM rate_hits WHERE window_start < now() - interval '1 day'");
  return out;
}
