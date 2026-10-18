// Robô de atendimento (WhatsApp, Instagram, Facebook, SMS, chat do site).
// Regras determinísticas para agenda/preço/endereço (sem "alucinar") + IA opcional para perguntas livres.
import { db } from './db.js';
import { nowIso, json, normalizePhone, brl, fmtDateTimeBR, localDate, addDays, localWeekday, zonedToUtc, uid } from './util.js';
import { scanInbound } from './security.js';
import { ensureConversation, storeMessage, sendOut, parseState, saveState, addOptOut } from './messaging.js';
import { getSlots, nextAvailableDays, hoursText } from './availability.js';
import { createAppointment, findOrCreateClient, upsertLead, setAppointmentStatus } from './domain.js';
import { aiReply } from './integrations/ai.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const has = (t, re) => re.test(t);
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const OPTOUT = /^(parar|pare|sair|stop|cancelar inscricao|descadastrar|nao quero receber|remover)$/;
const YES = /^(sim|s|confirmo|confirmar|isso|ok|pode|claro|1)$/;
const NO = /^(nao|n|negativo|2)$/;

function pick(text, n) {
  const m = /^\s*(\d{1,2})\s*[).]?\s*$/.exec(text);
  if (!m) return null;
  const i = Number(m[1]) - 1;
  return i >= 0 && i < n ? i : null;
}

function dateLabel(date, salon) {
  const today = localDate(new Date(), salon.timezone);
  if (date === today) return `hoje (${date.slice(8)}/${date.slice(5, 7)})`;
  if (date === addDays(today, 1)) return `amanhã (${date.slice(8)}/${date.slice(5, 7)})`;
  return `${WD[localWeekday(date)]} ${date.slice(8)}/${date.slice(5, 7)}`;
}

function parseDateInput(text, salon) {
  const today = localDate(new Date(), salon.timezone);
  if (/\bhoje\b/.test(text)) return today;
  if (/\bamanha\b/.test(text)) return addDays(today, 1);
  const m = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(text);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    if (y < 100) y += 2000;
    let iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(iso))) return null;
    if (!m[3] && iso < today) iso = `${y + 1}-${iso.slice(5)}`;
    return iso;
  }
  return null;
}

function parseTimeInput(text) {
  const m = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(text);
  if (!m) return null;
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2] ?? '00'}`;
}

const menuText = (salon) =>
  `Olá! Sou a assistente virtual do ${salon.name}. Posso ajudar com:\n1) Agendar um horário\n2) Serviços e preços\n3) Endereço e horários\n4) Falar com a equipe\n\nResponda com o número ou escreva o que você precisa.`;

async function activeServices(salonId) {
  return db.all('SELECT * FROM services WHERE salon_id = ? AND active = 1 ORDER BY category, name', [salonId]);
}

async function priceList(salon) {
  const list = await activeServices(salon.id);
  if (!list.length) return 'Ainda estamos montando a tabela de serviços. Quer falar com a equipe? Responda "atendente".';
  return 'Nossos serviços:\n' + list.slice(0, 20).map((s) => `• ${s.name} — ${brl(s.price_cents)} (${s.duration_min} min)`).join('\n') + '\n\nPara agendar, responda "agendar".';
}

async function findClient(salonId, channel, externalId) {
  const phone = channel === 'whatsapp' || channel === 'sms' ? normalizePhone(externalId) : null;
  return phone ? db.get('SELECT * FROM clients WHERE salon_id = ? AND phone = ? AND deleted_at IS NULL', [salonId, phone]) : null;
}

async function upcomingAppointment(salonId, clientId) {
  if (!clientId) return null;
  return db.get(
    `SELECT a.*, s.name AS service_name FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.salon_id = ? AND a.client_id = ? AND a.status IN ('scheduled','confirmed') AND a.starts_at > ? ORDER BY a.starts_at LIMIT 1`,
    [salonId, clientId, nowIso()]);
}

// ---------- Fluxo de agendamento ----------
async function askService(salon, state) {
  const list = await activeServices(salon.id);
  if (!list.length) return { text: 'Ainda não há serviços cadastrados. Vou chamar a equipe para te ajudar.', handoff: true };
  const shown = list.slice(0, 9);
  state.flow = state.flow || 'book';
  state.step = 'service';
  state.options = shown.map((s) => s.id);
  return { text: 'Qual serviço você quer?\n' + shown.map((s, i) => `${i + 1}) ${s.name} — ${brl(s.price_cents)}`).join('\n') };
}

async function askDate(salon, state) {
  const days = await nextAvailableDays(salon, { serviceId: state.serviceId, count: 5 });
  if (!days.length) return { text: 'Não encontrei horários livres nos próximos dias. Vou chamar a equipe para encontrar um encaixe.', handoff: true };
  state.step = 'date';
  state.options = days.map((d) => d.date);
  return { text: 'Para qual dia?\n' + days.map((d, i) => `${i + 1}) ${dateLabel(d.date, salon)}`).join('\n') + '\n\nOu digite outra data, como 25/10.' };
}

async function askTime(salon, state, date) {
  const slots = await getSlots(salon, { serviceId: state.serviceId, date });
  if (!slots.length) return { text: `Sem horários livres em ${dateLabel(date, salon)}. Escolha outro dia (digite a data, ex.: 25/10).` };
  state.date = date;
  state.step = 'time';
  state.slots = slots.map((s) => ({ time: s.time, startsAt: s.startsAt, staffId: s.staffId, staffName: s.staffName }));
  state.page = state.page || 0;
  const pageSize = 8;
  const chunk = state.slots.slice(state.page * pageSize, (state.page + 1) * pageSize);
  const more = state.slots.length > (state.page + 1) * pageSize;
  state.options = chunk.map((s) => s.startsAt);
  return {
    text: `Horários livres em ${dateLabel(date, salon)}:\n` + chunk.map((s, i) => `${i + 1}) ${s.time}${s.staffName ? ` com ${s.staffName}` : ''}`).join('\n') + (more ? '\n\nDigite "mais" para ver outros horários.' : ''),
  };
}

async function summary(salon, state) {
  const svc = await db.get('SELECT * FROM services WHERE id = ?', [state.serviceId]);
  const st = await db.get('SELECT * FROM staff WHERE id = ?', [state.staffId]);
  return `Confirma?\n${svc.name} (${brl(svc.price_cents)})\n${fmtDateTimeBR(state.startsAt, salon.timezone)}\nCom ${st.name}\n\nResponda SIM para confirmar ou NÃO para cancelar.`;
}

async function bookingStep(salon, conv, state, t, client) {
  // t = texto normalizado
  switch (state.step) {
    case 'service': {
      const list = state.options;
      let id = null;
      const i = pick(t, list.length);
      if (i !== null) id = list[i];
      else {
        const all = await activeServices(salon.id);
        const hit = all.find((s) => t.length > 2 && norm(s.name).includes(t));
        if (hit) id = hit.id;
      }
      if (!id) return { text: 'Não entendi qual serviço. Responda com o número da lista.' };
      state.serviceId = id;
      return askDate(salon, state);
    }
    case 'date': {
      let date = null;
      const i = pick(t, state.options.length);
      if (i !== null) date = state.options[i];
      else date = parseDateInput(t, salon);
      if (!date) return { text: 'Não entendi a data. Responda com o número da lista ou digite, por exemplo, 25/10.' };
      state.page = 0;
      return askTime(salon, state, date);
    }
    case 'time': {
      if (/^mais/.test(t)) { state.page = (state.page || 0) + 1; return askTime(salon, state, state.date); }
      let slot = null;
      const i = pick(t, state.options.length);
      if (i !== null) slot = state.slots.find((s) => s.startsAt === state.options[i]);
      else { const tm = parseTimeInput(t); if (tm) slot = state.slots.find((s) => s.time === tm); }
      if (!slot) return { text: 'Esse horário não está na lista. Responda com o número ou digite um horário livre, como 14:30.' };
      state.startsAt = slot.startsAt;
      state.staffId = slot.staffId;
      return afterTime(salon, conv, state, client);
    }
    case 'phone': {
      const p = normalizePhone(t);
      if (!p) return { text: 'Não consegui ler o telefone. Digite com DDD, por exemplo (44) 99999-8888.' };
      state.phone = p;
      return afterPhone(salon, state, client);
    }
    case 'name': {
      const name = t.replace(/[^a-z\s'.-]/gi, '').trim();
      if (name.length < 2) return { text: 'Pode me dizer seu nome?' };
      state.name = String(t).slice(0, 80).replace(/\b\w/g, (c) => c.toUpperCase());
      state.step = 'confirm';
      return { text: await summary(salon, state) };
    }
    case 'confirm': {
      if (YES.test(t)) return finalizeBooking(salon, conv, state, client);
      if (NO.test(t)) return { text: 'Tudo bem, não agendei nada. Quando quiser, é só responder "agendar".', reset: true };
      return { text: 'Responda SIM para confirmar ou NÃO para cancelar.' };
    }
    default:
      return { text: menuText(salon), reset: true };
  }
}

async function afterTime(salon, conv, state, client) {
  const needsPhone = !client && !['whatsapp', 'sms'].includes(conv.channel) && !state.phone;
  if (needsPhone) { state.step = 'phone'; return { text: 'Qual o seu telefone com DDD? (para enviar o lembrete do horário)' }; }
  return afterPhone(salon, state, client);
}

async function afterPhone(salon, state, client) {
  if (!client && !state.name) { state.step = 'name'; return { text: 'Como é o seu nome?' }; }
  state.step = 'confirm';
  return { text: await summary(salon, state) };
}

async function finalizeBooking(salon, conv, state, client) {
  try {
    const phone = client?.phone || state.phone || (['whatsapp', 'sms'].includes(conv.channel) ? normalizePhone(conv.external_id) : null);
    const c = client || await db.tx((t) => findOrCreateClient(t, salon.id, { name: state.name || conv.display_name || 'Cliente', phone, source: conv.channel }));
    const appt = await createAppointment(salon, { clientId: c.id, staffId: state.staffId, serviceId: state.serviceId, startsAt: state.startsAt, source: `robô:${conv.channel}` });
    if (state.rescheduleOf) await setAppointmentStatus(salon.id, state.rescheduleOf, 'cancelled');
    await db.run('UPDATE conversations SET client_id = COALESCE(client_id, ?) WHERE id = ?', [c.id, conv.id]);
    return { text: `Agendado! ✅ ${fmtDateTimeBR(appt.starts_at, salon.timezone)}. Vamos te lembrar antes do horário. Para remarcar ou cancelar, é só me avisar aqui.`, reset: true };
  } catch (e) {
    if (e.status === 409) {
      state.step = 'time';
      const r = await askTime(salon, state, state.date);
      return { text: 'Esse horário acabou de ser ocupado. ' + r.text };
    }
    return { text: 'Tive um problema para concluir o agendamento. Vou chamar a equipe para te ajudar.', handoff: true };
  }
}

// ---------- Decisão principal ----------
async function decide(salon, conv, state, rawText, client) {
  const t = norm(rawText);

  if (has(t, /^(menu|inicio|oi|ola|oie|bom dia|boa tarde|boa noite|hello|hi)\b/) && !state.step) return { text: menuText(salon), reset: true };
  if (t === 'menu' || t === 'voltar') return { text: menuText(salon), reset: true };

  if (has(t, /\b(atendente|humano|pessoa|falar com alguem|gerente|reclamacao)\b/) || (!state.step && t === '4')) {
    return { text: 'Certo! Já avisei a equipe e logo alguém responde por aqui. 🙂', handoff: true };
  }

  // Resposta a lembrete / cancelamento pendente
  if (state.flow === 'reminder' && state.apptId) {
    if (YES.test(t)) { await setAppointmentStatus(salon.id, state.apptId, 'confirmed'); return { text: 'Presença confirmada! Te esperamos. ✨', reset: true }; }
    if (/\bremarcar\b/.test(t)) return startReschedule(salon, state, client);
    if (NO.test(t) || /\bcancelar\b/.test(t)) { state.flow = 'cancel'; state.step = 'confirm-cancel'; return { text: 'Quer mesmo cancelar o horário? Responda SIM para cancelar ou REMARCAR para escolher outro dia.' }; }
  }

  if (state.step === 'confirm-cancel') {
    if (/\bremarcar\b/.test(t)) return startReschedule(salon, state, client);
    if (YES.test(t)) {
      await setAppointmentStatus(salon.id, state.apptId, 'cancelled');
      return { text: 'Horário cancelado. Quando quiser marcar de novo, responda "agendar".', reset: true };
    }
    return { text: 'Mantive o seu horário. Se precisar, é só falar.', reset: true };
  }

  if (state.flow === 'book' || state.flow === 'resched') {
    if (/^(cancelar|sair|desistir)$/.test(t)) return { text: 'Sem problemas, parei por aqui. Quando quiser, responda "agendar".', reset: true };
    if (state.step) return bookingStep(salon, conv, state, t, client);
  }

  if (has(t, /\b(remarcar|trocar (o )?horario|mudar (o )?horario)\b/)) return startReschedule(salon, state, client);
  if (has(t, /\b(cancelar|desmarcar)\b/)) {
    const a = await upcomingAppointment(salon.id, client?.id);
    if (!a) return { text: 'Não encontrei agendamentos futuros neste contato. Quer falar com a equipe? Responda "atendente".' };
    state.flow = 'cancel'; state.step = 'confirm-cancel'; state.apptId = a.id;
    return { text: `Você tem ${a.service_name} em ${fmtDateTimeBR(a.starts_at, salon.timezone)}. Responda SIM para cancelar ou REMARCAR para escolher outro dia.` };
  }
  if (has(t, /\b(agendar|marcar|reservar|agenda|horario disponivel|quero um horario)\b/) || (!state.step && t === '1')) {
    state.flow = 'book';
    return askService(salon, state);
  }
  if (has(t, /\b(preco|precos|valor|valores|quanto custa|quanto e|tabela|servicos|cardapio)\b/) || (!state.step && t === '2')) return { text: await priceList(salon) };
  if (has(t, /\b(endereco|onde fica|localizacao|como chegar|local)\b/) || (!state.step && t === '3')) {
    return { text: `${salon.address ? `Estamos em ${salon.address}${salon.city ? `, ${salon.city}` : ''}.` : 'Ainda não cadastramos o endereço aqui.'}\nHorário: ${hoursText(salon)}.` };
  }
  if (has(t, /\b(funciona|aberto|abre|fecha|horario de funcionamento|que horas)\b/)) return { text: `Nosso horário: ${hoursText(salon)}.` };
  if (has(t, /\b(obrigad[oa]|valeu|agradeco)\b/)) return { text: 'Por nada! Estamos à disposição. ✨' };

  // IA (opcional) para perguntas livres
  const history = await db.all('SELECT direction, body FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10', [conv.id]);
  const ai = await aiReply({ salon, services: await activeServices(salon.id), hoursText: hoursText(salon), history: history.reverse(), userText: rawText });
  if (ai) return { text: ai };

  state.fallbacks = (state.fallbacks || 0) + 1;
  if (state.fallbacks >= 2) return { text: 'Vou pedir para uma pessoa da equipe continuar essa conversa com você. 🙂', handoff: true };
  return { text: 'Não entendi bem. ' + menuText(salon) };
}

async function startReschedule(salon, state, client) {
  const a = state.apptId ? await db.get('SELECT * FROM appointments WHERE id = ?', [state.apptId]) : await upcomingAppointment(salon.id, client?.id);
  if (!a) return { text: 'Não encontrei agendamentos futuros neste contato. Responda "agendar" para marcar um horário.' };
  state.flow = 'resched'; state.rescheduleOf = a.id; state.serviceId = a.service_id;
  return askDate(salon, state);
}

// Ponto de entrada para mensagens recebidas em qualquer canal.
export async function handleInbound(salon, { channel, externalId, name = null, text, providerId = null }) {
  text = String(text || '').slice(0, 2000);
  if (!text.trim()) return { replied: false };
  const client = await findClient(salon.id, channel, externalId);
  const conv = await ensureConversation(salon.id, channel, externalId, { name, clientId: client?.id ?? null });
  const flags = scanInbound(text);

  await storeMessage(salon.id, conv.id, { direction: 'in', sender: 'client', body: text, status: 'received', providerId });
  await db.run('UPDATE conversations SET last_inbound_at = ?, unread = unread + 1, flagged = CASE WHEN ? = 1 THEN 1 ELSE flagged END, status = ? WHERE id = ?',
    [nowIso(), flags.length ? 1 : 0, 'open', conv.id]);
  const fresh = await db.get('SELECT * FROM conversations WHERE id = ?', [conv.id]);

  if (!client && !fresh.lead_id) {
    const { lead } = await upsertLead(salon.id, {
      name: name || `Contato ${channel}`, phone: ['whatsapp', 'sms'].includes(channel) ? externalId : null, source: `robô:${channel}`,
    });
    await db.run('UPDATE conversations SET lead_id = ? WHERE id = ?', [lead.id, conv.id]);
  }

  const t = norm(text);
  if (OPTOUT.test(t)) {
    await addOptOut(salon.id, channel, externalId);
    if (client) await db.run('UPDATE clients SET consent_marketing = 0 WHERE id = ?', [client.id]);
    await sendOut(salon, { channel, to: externalId, body: 'Pronto, você não receberá mais mensagens promocionais. Se mudar de ideia, é só nos chamar.', kind: 'reply', conversation: fresh });
    return { replied: true, optedOut: true };
  }

  if (fresh.mode === 'human' || !salon.bot_enabled) return { replied: false, conversationId: conv.id };

  const state = parseState(fresh);
  const out = await decide(salon, fresh, state, text, client);
  if (out.handoff) {
    await db.run("UPDATE conversations SET mode = 'human', unread = unread + 1 WHERE id = ?", [conv.id]);
    await saveState(conv.id, {});
  } else if (out.reset) await saveState(conv.id, {});
  else await saveState(conv.id, state);

  await sendOut(salon, { channel, to: externalId, body: out.text, kind: 'reply', conversation: fresh });
  return { replied: true, conversationId: conv.id, handoff: !!out.handoff };
}
