// Agendador interno: lembretes, aniversários, reativação, fila de campanhas, expiração de teste e limpeza.
// Cada ação "reivindica" o registro no banco antes de enviar (UPDATE condicional), então é seguro
// rodar em mais de uma instância sem enviar duplicado.
import { db } from './db.js';
import { nowIso, json, localHour, localDate, fmtDateTimeBR } from './util.js';
import { ensureConversation, sendOut, saveState } from './messaging.js';
import { processCampaigns, render, firstName } from './campaigns.js';
import { expirePendingPayments } from './payments.js';
import { rollClub, chargeClubVisits } from './club.js';

const defaults = { reminders: true, birthday: false, reactivation: false, reactivationDays: 45 };
export const automations = (salon) => ({ ...defaults, ...(json(salon.brand_json, {}).automations || {}) });

async function claimRun(key) {
  try {
    await db.run('INSERT INTO scheduler_runs (key, ran_at) VALUES (?, ?)', [key, nowIso()]);
    return true;
  } catch { return false; } // chave já existe: outra execução (ou instância) já cuidou
}

async function remind(salon, appt, which) {
  const flag = which === '24h' ? 'reminder_24h_sent' : 'reminder_2h_sent';
  const claim = await db.run(`UPDATE appointments SET ${flag} = 1 WHERE id = ? AND ${flag} = 0`, [appt.id]);
  if (!claim.changes) return false;
  const when = fmtDateTimeBR(appt.starts_at, salon.timezone);
  const body = `Olá, ${firstName(appt.client_name)}! Lembrete do ${salon.name}: ${appt.service_name} em ${when}.\nResponda 1 para confirmar ou 2 para cancelar.`;
  const channel = appt.client_phone ? 'whatsapp' : appt.client_email ? 'email' : null;
  if (!channel) return false;
  const to = channel === 'whatsapp' ? appt.client_phone : appt.client_email;
  const conv = channel === 'whatsapp' ? await ensureConversation(salon.id, 'whatsapp', to, { name: appt.client_name, clientId: appt.client_id }) : null;
  if (conv) await saveState(conv.id, { flow: 'reminder', apptId: appt.id });
  await sendOut(salon, { channel, to, body, subject: `Lembrete: ${appt.service_name}`, kind: 'transactional', conversation: conv, sender: 'system', templateVars: [firstName(appt.client_name), appt.service_name, when] });
  return true;
}

async function reminders(salon, now) {
  if (!automations(salon).reminders) return 0;
  const from = now.toISOString();
  const to = new Date(now.getTime() + 25 * 3600_000).toISOString();
  const list = await db.all(
    `SELECT a.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email, s.name AS service_name
       FROM appointments a JOIN clients c ON c.id = a.client_id JOIN services s ON s.id = a.service_id
      WHERE a.salon_id = ? AND a.status IN ('scheduled','confirmed') AND a.starts_at > ? AND a.starts_at <= ?`,
    [salon.id, from, to]);
  let n = 0;
  for (const a of list) {
    const msUntil = Date.parse(a.starts_at) - now.getTime();
    if (msUntil <= 2.5 * 3600_000 && !a.reminder_2h_sent) { if (await remind(salon, a, '2h')) n++; }
    else if (msUntil > 3 * 3600_000 && msUntil <= 25 * 3600_000 && !a.reminder_24h_sent) { if (await remind(salon, a, '24h')) n++; }
  }
  return n;
}

async function birthdays(salon, now) {
  if (!automations(salon).birthday) return 0;
  const mmdd = localDate(now, salon.timezone).slice(5);
  const list = await db.all("SELECT * FROM clients WHERE salon_id = ? AND consent_marketing = 1 AND phone IS NOT NULL AND deleted_at IS NULL AND birthday IS NOT NULL", [salon.id]);
  let n = 0;
  for (const c of list) {
    if (String(c.birthday).slice(5) !== mmdd) continue;
    if (!(await claimRun(`bday:${c.id}:${localDate(now, salon.timezone).slice(0, 4)}`))) continue;
    const conv = await ensureConversation(salon.id, 'whatsapp', c.phone, { name: c.name, clientId: c.id });
    await sendOut(salon, { channel: 'whatsapp', to: c.phone, body: `Feliz aniversário, ${firstName(c.name)}! 🎉 O ${salon.name} preparou um carinho para você neste mês. Responda "agendar" para escolher seu horário. (Para não receber mais mensagens, responda PARAR.)`, kind: 'marketing', conversation: conv, sender: 'system', templateVars: [firstName(c.name), salon.name] });
    n++;
  }
  return n;
}

async function reactivation(salon, now) {
  const a = automations(salon);
  if (!a.reactivation) return 0;
  const limit = new Date(now.getTime() - a.reactivationDays * 86400_000).toISOString();
  const list = await db.all(
    "SELECT * FROM clients WHERE salon_id = ? AND consent_marketing = 1 AND phone IS NOT NULL AND deleted_at IS NULL AND visits > 0 AND last_visit_at < ? LIMIT 25",
    [salon.id, limit]);
  let n = 0;
  const bucket = Math.floor(now.getTime() / (30 * 86400_000)); // no máximo 1 reativação por cliente a cada 30 dias
  for (const c of list) {
    if (!(await claimRun(`react:${c.id}:${bucket}`))) continue;
    const conv = await ensureConversation(salon.id, 'whatsapp', c.phone, { name: c.name, clientId: c.id });
    await sendOut(salon, { channel: 'whatsapp', to: c.phone, body: `Oi, ${firstName(c.name)}! Faz um tempinho que não te vemos no ${salon.name}. Quer reservar um horário? Responda "agendar". (Para não receber mais mensagens, responda PARAR.)`, kind: 'marketing', conversation: conv, sender: 'system', templateVars: [firstName(c.name), salon.name] });
    n++;
  }
  return n;
}

async function trials(now) {
  await db.run("UPDATE salons SET status = 'trial_expired' WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?", [now.toISOString()]);
  // campanhas agendadas que chegaram na hora
  await db.run("UPDATE campaigns SET status = 'running' WHERE status = 'scheduled' AND scheduled_at <= ?", [now.toISOString()]);
}

async function housekeeping(now) {
  const key = `clean:${now.toISOString().slice(0, 13)}`; // 1x por hora
  if (!(await claimRun(key))) return;
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [now.toISOString()]);
  await db.run('DELETE FROM webhook_events WHERE received_at < ?', [new Date(now.getTime() - 30 * 86400_000).toISOString()]);
  await db.run('DELETE FROM scheduler_runs WHERE ran_at < ?', [new Date(now.getTime() - 90 * 86400_000).toISOString()]);
}

let running = false;
export async function tick(now = new Date()) {
  if (running) return null;
  running = true;
  const stats = { reminders: 0, birthdays: 0, reactivation: 0, campaigns: 0, club: 0, charges: 0 };
  try {
    await trials(now);
    await housekeeping(now);
    await expirePendingPayments(now);
    const salons = await db.all("SELECT * FROM salons WHERE status IN ('trial','active','past_due')");
    for (const salon of salons) {
      const hour = localHour(now, salon.timezone);
      const quiet = hour >= salon.quiet_start || hour < salon.quiet_end;
      if (!quiet) {
        stats.reminders += await reminders(salon, now);
        stats.birthdays += await birthdays(salon, now);
        stats.reactivation += await reactivation(salon, now);
      }
      stats.campaigns += await processCampaigns(salon, { hour });
      try {
        stats.club += await rollClub(salon, now);
        stats.charges += await chargeClubVisits(salon, now);
      } catch (e) { console.error('[clube]', salon.slug, e.message); }
    }
  } catch (e) {
    console.error('[agendador] erro:', e.message);
  } finally { running = false; }
  return stats;
}

export function startScheduler(intervalMs = 60_000) {
  const h = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  h.unref();
  return h;
}
