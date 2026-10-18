// Campanhas: público-alvo com consentimento (LGPD), modelos de mensagem e fila de envio.
import { db } from './db.js';
import { HttpError, uid, nowIso, json } from './util.js';
import { assertSafeOutbound } from './security.js';
import { allowedDomains, ensureConversation, sendOut } from './messaging.js';

export const CAMPAIGN_CHANNELS = ['whatsapp', 'sms', 'email'];

export function render(template, vars) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'cliente';

// Monta o público. REGRA LGPD: só quem deu consentimento de marketing e não pediu para sair.
export async function buildAudience(salon, channel, segment = {}) {
  const audience = segment.audience === 'leads' ? 'leads' : 'clients';
  const addrCol = channel === 'email' ? 'email' : 'phone';
  const rows = [];
  const now = Date.now();

  if (audience === 'clients') {
    const all = await db.all('SELECT * FROM clients WHERE salon_id = ? AND deleted_at IS NULL AND consent_marketing = 1', [salon.id]);
    for (const c of all) {
      if (!c[addrCol]) continue;
      const days = c.last_visit_at ? (now - Date.parse(c.last_visit_at)) / 86400_000 : null;
      if (segment.inactiveDays && !(days !== null && days >= segment.inactiveDays)) continue;
      if (segment.activeWithinDays && !(days !== null && days <= segment.activeWithinDays)) continue;
      if (segment.minVisits && c.visits < segment.minVisits) continue;
      if (segment.minSpentCents && c.total_spent_cents < segment.minSpentCents) continue;
      if (segment.neverVisited && c.visits > 0) continue;
      if (segment.tag && !String(c.tags || '').split(',').map((s) => s.trim().toLowerCase()).includes(String(segment.tag).toLowerCase())) continue;
      if (segment.birthdayMonth && String(c.birthday || '').slice(5, 7) !== String(segment.birthdayMonth).padStart(2, '0')) continue;
      rows.push({ client_id: c.id, lead_id: null, to_addr: c[addrCol], name: c.name });
    }
  } else {
    const all = await db.all('SELECT * FROM leads WHERE salon_id = ? AND consent = 1', [salon.id]);
    for (const l of all) {
      if (!l[addrCol]) continue;
      if (segment.stage && l.stage !== segment.stage) continue;
      rows.push({ client_id: null, lead_id: l.id, to_addr: l[addrCol], name: l.name });
    }
  }
  const optouts = new Set((await db.all('SELECT address FROM optouts WHERE salon_id = ? AND channel = ?', [salon.id, channel])).map((o) => o.address));
  const seen = new Set();
  return rows.filter((r) => {
    if (optouts.has(r.to_addr) || seen.has(r.to_addr)) return false;
    seen.add(r.to_addr);
    return true;
  });
}

export async function launchCampaign(salon, campaign) {
  if (campaign.status !== 'draft') throw new HttpError(409, 'A campanha já foi iniciada.');
  assertSafeOutbound(campaign.body, allowedDomains(salon));
  const seg = json(campaign.segment_json, {});
  const audience = await buildAudience(salon, campaign.channel, seg);
  if (!audience.length) throw new HttpError(422, 'Nenhum contato elegível (só entram contatos com consentimento e sem opt-out).');
  await db.tx(async (t) => {
    for (const r of audience) {
      await t.run(
        'INSERT INTO campaign_recipients (id, campaign_id, salon_id, client_id, lead_id, to_addr, name, status) VALUES (?,?,?,?,?,?,?,?)',
        [uid(), campaign.id, salon.id, r.client_id, r.lead_id, r.to_addr, r.name, 'queued']);
    }
    const scheduled = campaign.scheduled_at && campaign.scheduled_at > nowIso();
    await t.run('UPDATE campaigns SET total = ?, status = ? WHERE id = ?', [audience.length, scheduled ? 'scheduled' : 'running', campaign.id]);
  });
  return audience.length;
}

// Processa um lote de envios (chamado pelo agendador). Respeita horário de silêncio e limite por minuto.
export async function processCampaigns(salon, { batch = 20, hour }) {
  if (hour >= salon.quiet_start || hour < salon.quiet_end) return 0;
  const camps = await db.all("SELECT * FROM campaigns WHERE salon_id = ? AND status = 'running' ORDER BY created_at", [salon.id]);
  let sent = 0;
  for (const camp of camps) {
    const todo = await db.all("SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'queued' LIMIT ?", [camp.id, batch - sent]);
    for (const r of todo) {
      const claim = await db.run("UPDATE campaign_recipients SET status = 'sending' WHERE id = ? AND status = 'queued'", [r.id]);
      if (!claim.changes) continue;
      const body = render(camp.body, { nome: firstName(r.name), salao: salon.name });
      const conv = camp.channel === 'email' ? null : await ensureConversation(salon.id, camp.channel, r.to_addr, { name: r.name, clientId: r.client_id, leadId: r.lead_id });
      const res = await sendOut(salon, { channel: camp.channel, to: r.to_addr, body, subject: render(camp.subject || '', { nome: firstName(r.name), salao: salon.name }) || null, kind: 'marketing', conversation: conv, sender: 'system', templateVars: [firstName(r.name), salon.name] });
      const ok = res.status === 'sent' || res.status === 'simulated';
      await db.run('UPDATE campaign_recipients SET status = ?, error = ?, sent_at = ? WHERE id = ?', [ok ? 'sent' : 'failed', res.error ?? null, nowIso(), r.id]);
      await db.run(`UPDATE campaigns SET ${ok ? 'sent = sent + 1' : 'failed = failed + 1'} WHERE id = ?`, [camp.id]);
      sent += 1;
      if (sent >= batch) return sent;
    }
    const left = await db.get("SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = ? AND status IN ('queued','sending')", [camp.id]);
    if (Number(left.n) === 0) await db.run("UPDATE campaigns SET status = 'done' WHERE id = ?", [camp.id]);
  }
  return sent;
}
