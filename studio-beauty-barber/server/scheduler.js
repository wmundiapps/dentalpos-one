// Agendador interno: lembretes, aniversários, reativação, fila de campanhas, expiração de teste e limpeza.
// Cada ação "reivindica" o registro no banco antes de enviar (UPDATE condicional), então é seguro
// rodar em mais de uma instância sem enviar duplicado.
import { db } from './db.js';
import { nowIso, json, localHour, localDate, fmtDateTimeBR, uid } from './util.js';
import { ensureConversation, sendOut, saveState } from './messaging.js';
import { processCampaigns, render, firstName } from './campaigns.js';
import { expirePendingPayments } from './payments.js';
import { rollClub, chargeClubVisits } from './club.js';
import { blockHash } from './prospect.js';
import { cfg } from './config.js';

const defaults = { reminders: true, confirmation: true, recall: false, birthday: false, reactivation: false, reactivationDays: 45 };
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

// Recall (retorno): chama o cliente quando passou o ciclo do serviço (ex.: corte a cada 25 dias), uma vez por ciclo.
async function recalls(salon, now) {
  if (!automations(salon).recall) return 0;
  const rows = await db.all(
    `SELECT c.id AS cid, c.name, c.phone, s.id AS sid, s.name AS sname, s.recall_days, MAX(a.starts_at) AS last_at
       FROM appointments a JOIN clients c ON c.id = a.client_id JOIN services s ON s.id = a.service_id
      WHERE a.salon_id = ? AND a.status = 'done' AND s.recall_days > 0 AND c.consent_marketing = 1 AND c.phone IS NOT NULL AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.phone, s.id, s.name, s.recall_days LIMIT 400`, [salon.id]);
  let n = 0;
  for (const r of rows) {
    if (n >= 20) break;
    const dueAt = Date.parse(r.last_at) + r.recall_days * 86400_000;
    if (dueAt > now.getTime() || now.getTime() - dueAt > 60 * 86400_000) continue; // só a janela de 60 dias depois do ciclo
    const future = await db.get("SELECT 1 AS x FROM appointments WHERE salon_id = ? AND client_id = ? AND status IN ('scheduled','confirmed','pending_payment') AND starts_at > ?", [salon.id, r.cid, now.toISOString()]);
    if (future) continue;
    if (!(await claimRun(`recall:${r.cid}:${r.sid}:${r.last_at}`))) continue;
    await db.run('INSERT INTO recall_log (id, salon_id, client_id, service_id, due_since, sent_at) VALUES (?,?,?,?,?,?)', [uid(), salon.id, r.cid, r.sid, r.last_at, nowIso()]);
    const days = Math.max(r.recall_days, Math.round((now.getTime() - Date.parse(r.last_at)) / 86400_000));
    const conv = await ensureConversation(salon.id, 'whatsapp', r.phone, { name: r.name, clientId: r.cid });
    await sendOut(salon, { channel: 'whatsapp', to: r.phone, body: `Oi, ${firstName(r.name)}! Já faz ${days} dias do seu ${r.sname} no ${salon.name}. Que tal agendar o retorno? Responda "agendar". (Para não receber mais mensagens, responda PARAR.)`, kind: 'marketing', conversation: conv, sender: 'system', templateVars: [firstName(r.name), r.sname, salon.name] });
    n++;
  }
  return n;
}

// Convites de captação por e-mail: só em dia útil, em horário comercial, sem quem pediu para sair.
async function sendInvites(now) {
  const due = await db.all("SELECT * FROM prospect_invites WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20", [now.toISOString()]);
  let n = 0;
  for (const inv of due) {
    const salon = await db.get('SELECT * FROM salons WHERE id = ?', [inv.salon_id]);
    if (!salon) continue;
    const hour = localHour(now, salon.timezone);
    const dow = new Date(`${localDate(now, salon.timezone)}T12:00:00Z`).getUTCDay();
    if (hour < 8 || hour >= 18 || dow === 0 || dow === 6) continue;
    const claim = await db.run("UPDATE prospect_invites SET status = 'sending' WHERE id = ? AND status = 'scheduled'", [inv.id]);
    if (!claim.changes) continue;
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', [inv.lead_id]);
    const blocked = lead && (await db.get('SELECT 1 AS x FROM lead_blocks WHERE salon_id = ? AND hash IN (?,?)', [inv.salon_id, blockHash('email', inv.email), blockHash('cnpj', lead.document || '-')]));
    if (!lead || blocked || lead.stage === 'lost') { await db.run("UPDATE prospect_invites SET status = 'cancelled' WHERE id = ?", [inv.id]); continue; }
    const body = `${inv.body}\n\nSe não quiser receber mais mensagens nossas, clique aqui: ${cfg.baseUrl}/api/public/optout/${inv.token}\nWMundi Technologies & Co · Maringá/PR`;
    const r = await sendOut(salon, { channel: 'email', to: inv.email, subject: inv.subject, body, kind: 'marketing', sender: 'system' });
    await db.run('UPDATE prospect_invites SET status = ?, sent_at = ?, error = ? WHERE id = ?', [r.status === 'sent' || r.status === 'simulated' ? 'sent' : 'failed', nowIso(), r.error || null, inv.id]);
    if (r.status === 'sent' || r.status === 'simulated') { await db.run("UPDATE leads SET stage = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END, updated_at = ? WHERE id = ?", [nowIso(), lead.id]); n++; }
  }
  return n;
}

async function trials(now) {
  await db.run("UPDATE salons SET status = 'trial_expired' WHERE lifetime = 0 AND status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?", [now.toISOString()]);
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
  const stats = { reminders: 0, birthdays: 0, reactivation: 0, recall: 0, campaigns: 0, club: 0, charges: 0 };
  try {
    await trials(now);
    await housekeeping(now);
    await expirePendingPayments(now);
    stats.invites = await sendInvites(now);
    const salons = await db.all("SELECT * FROM salons WHERE status IN ('trial','active','past_due')");
    for (const salon of salons) {
      const hour = localHour(now, salon.timezone);
      const quiet = hour >= salon.quiet_start || hour < salon.quiet_end;
      if (!quiet) {
        stats.reminders += await reminders(salon, now);
        stats.birthdays += await birthdays(salon, now);
        stats.reactivation += await reactivation(salon, now);
        stats.recall += await recalls(salon, now);
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
