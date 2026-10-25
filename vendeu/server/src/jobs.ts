// Rotinas diárias (cron da Vercel chama /api/cron/daily com CRON_SECRET).
import { config } from './config.js';
import { many, pool } from './db.js';
import { sendMail } from './mailer.js';
import { processOrders } from './orders.js';
import { refreshOutrosGroups } from './outros.js';
import { formatBRL } from '../../shared/fees.js';

export async function runDaily() {
  // 1) lembretes: taxa vence em até 2 dias / vencida
  const due = await many(pool, `SELECT s.id, s.fee_cents, s.due_at, s.receipt_number, u.email, l.title FROM sales s JOIN users u ON u.id = s.seller_id JOIN listings l ON l.id = s.listing_id
    WHERE s.status = 'awaiting_payment' AND s.due_at < now() + interval '2 days'`);
  for (const s of due) {
    const late = new Date(s.due_at) < new Date();
    await sendMail({ to: s.email, subject: late ? 'Taxa de venda em atraso' : 'Sua taxa de venda vence em breve',
      text: `${late ? 'A taxa venceu' : 'A taxa vence em breve'}: ${formatBRL(s.fee_cents)} referente a "${s.title}" (recibo ${s.receipt_number}). Pague em Venda > Minhas vendas. ${late ? `Com ${config.feeBlockAfterDays} dias de atraso, novos anúncios ficam bloqueados.` : ''}` });
  }
  // 2) trava novos anúncios de quem está com taxa vencida há mais de N dias
  const blocked = await pool.query(`UPDATE users SET fee_blocked_at = now() WHERE fee_blocked_at IS NULL AND id IN (
    SELECT seller_id FROM sales WHERE status = 'awaiting_payment' AND due_at + make_interval(days => $1) < now())`, [config.feeBlockAfterDays]);
  // 2b) pedidos: expirar, receber automático, devolver sem envio, liberar repasse
  const orders = await processOrders();
  // 3) grupos de "Outros"
  const outros = await refreshOutrosGroups();
  // 4) retenção: apaga registros de origem além do prazo e códigos/limites antigos
  const client = await pool.connect();
  let purged = 0;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL vendeu.allow_purge = 'on'");
    purged = (await client.query('DELETE FROM origin_records WHERE created_at < now() - make_interval(days => $1)', [config.retentionOriginDays])).rowCount ?? 0;
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await pool.query("DELETE FROM verification_codes WHERE created_at < now() - interval '2 days'");
  await pool.query("DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'");
  return { reminders: due.length, newlyBlocked: blocked.rowCount ?? 0, outros, orders, purgedOriginRecords: purged };
}
