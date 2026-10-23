/**
 * Robô de monitoramento: confere banco, fila de e-mails, cobranças e agendador.
 * Publica aviso de instabilidade no app sozinho e avisa os administradores por e-mail; retira quando normaliza.
 */
import { one, q } from '../db';
import { queueEmail } from './notify';

export type Health = { ok: boolean; db: boolean; checks: Record<string, { ok: boolean; detail?: string }>; time: string };

export async function healthCheck(): Promise<Health> {
  const checks: Health['checks'] = {};
  let db = false;
  try {
    await one('select 1');
    db = true;
  } catch (e) {
    checks.database = { ok: false, detail: (e as Error).message.slice(0, 120) };
    return { ok: false, db, checks, time: new Date().toISOString() };
  }
  checks.database = { ok: true };
  const backlog = await one<{ n: string; oldest: Date | null }>(`select count(*) n, min(created_at) oldest from email_outbox where status='pending'`);
  const oldMin = backlog?.oldest ? (Date.now() - new Date(backlog.oldest).getTime()) / 60000 : 0;
  checks.emails = { ok: oldMin < 120, detail: `${backlog?.n || 0} na fila${oldMin ? `, mais antigo há ${Math.round(oldMin)} min` : ''}` };
  const failedMail = await one<{ n: string }>(`select count(*) n from email_outbox where status='failed' and created_at > now() - interval '1 hour'`);
  checks.email_provider = { ok: Number(failedMail!.n) < 50, detail: `${failedMail!.n} falhas na última hora` };
  const chargeErr = await one<{ n: string }>(`select count(*) n from audit_log where action='charge_error' and created_at > now() - interval '1 hour'`);
  checks.payments = { ok: Number(chargeErr!.n) < 10, detail: `${chargeErr!.n} erros de cobrança na última hora` };
  const cron = await one<{ at: Date | null }>(`select max(created_at) at from audit_log where action='cron_run'`);
  const cronHours = cron?.at ? (Date.now() - new Date(cron.at).getTime()) / 3600000 : null;
  checks.scheduler = { ok: cronHours == null || cronHours < 26, detail: cronHours == null ? 'ainda não rodou' : `última execução há ${cronHours.toFixed(1)} h` };
  return { ok: Object.values(checks).every((c) => c.ok), db, checks, time: new Date().toISOString() };
}

const AUTO = '[auto] ';

/** Chamado pelo agendador: abre/fecha aviso automático e avisa admins */
export async function monitorTick() {
  const h = await healthCheck();
  const open = await one<{ id: string }>(`select id from system_notices where active and message like $1 limit 1`, [AUTO + '%']);
  const bad = Object.entries(h.checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}: ${c.detail || 'falhou'}`);
  if (bad.length && !open) {
    const userFacing = h.checks.payments && !h.checks.payments.ok ? 'Pagamentos com instabilidade. Seu cashback continua sendo registrado normalmente.' : 'Alguns serviços estão lentos. Seu saldo e suas compras estão seguros.';
    await q(`insert into system_notices (kind, message, audience) values ('incident', $1, 'all')`, [AUTO + userFacing]);
    const admins = await q<{ id: string; email: string }>(`select id, email from users where role='admin'`);
    for (const a of admins) await queueEmail(a.id, a.email, 'Alerta do monitoramento Cashbacksmart', `Problemas detectados:\n${bad.join('\n')}\n\nO aviso de instabilidade foi publicado no app automaticamente e sai sozinho quando normalizar.`, 'monitor');
  } else if (!bad.length && open) {
    await q(`update system_notices set active=false where id=$1`, [open.id]);
  }
  return { ok: h.ok, problems: bad };
}
