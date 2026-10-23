/**
 * Robô antifraude (roda no agendador). Sinaliza e, nos casos graves, bloqueia a loja sozinho
 * e avisa o dono por e-mail. O admin pode desbloquear.
 */
import { q, tx } from '../db';
import { queueEmail } from './notify';

const DAY = 86400000;

export const LIMITS = {
  velocityFlag: 5, // compras do mesmo cliente na mesma loja em 24h
  velocityBlock: 15,
  selfBlock: 3, // compras para si mesmo (dono/caixa como cliente) em 30 dias
  maxPercentBps: 5000, // regra acima de 50% é suspeita
  burstMin: 60, // compras em 24h para considerar pico
  burstFactor: 8, // vezes a média diária dos 30 dias anteriores
};

type Flag = { kind: string; business_id: string | null; consumer_id: string | null; ref: string; details: any; block: boolean };

export async function runFraudScan(now = new Date()) {
  const since24 = new Date(now.getTime() - DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const flags: Flag[] = [];

  // 1) Mesmo cliente comprando muitas vezes na mesma loja em 24h
  const vel = await q<{ business_id: string; consumer_id: string; n: string; cb: string }>(
    `select business_id, consumer_id, count(*) n, sum(cashback_cents) cb from purchases
     where status='confirmed' and created_at > $1 and created_at <= $2 group by 1,2 having count(*) >= $3`,
    [since24, now, LIMITS.velocityFlag],
  );
  for (const v of vel)
    flags.push({ kind: 'velocity', business_id: v.business_id, consumer_id: v.consumer_id, ref: `${v.business_id}:${v.consumer_id}:${now.toISOString().slice(0, 10)}`, details: { compras_24h: Number(v.n), cashback: Number(v.cb) }, block: Number(v.n) >= LIMITS.velocityBlock });

  // 2) Dono ou caixa lançando cashback para si mesmo (mesmo celular, e-mail ou CPF)
  const self = await q<{ business_id: string; consumer_id: string; n: string }>(
    `select p.business_id, p.consumer_id, count(*) n from purchases p
     join users c on c.id = p.consumer_id
     join business_members m on m.business_id = p.business_id
     join users s on s.id = m.user_id
     where p.status='confirmed' and p.cashback_cents > 0 and p.created_at > $1 and p.created_at <= $2
       and ((c.phone <> '' and c.phone = s.phone) or lower(c.email) = lower(s.email) or (c.cpf is not null and c.cpf = s.cpf))
     group by 1,2`,
    [since30, now],
  );
  for (const v of self)
    flags.push({ kind: 'self_purchase', business_id: v.business_id, consumer_id: v.consumer_id, ref: `${v.business_id}:${v.consumer_id}`, details: { compras_30d: Number(v.n) }, block: Number(v.n) >= LIMITS.selfBlock });

  // 3) Regras com percentual muito alto
  const high = await q<{ id: string; business_id: string; value: number }>(`select id, business_id, value from cashback_rules where active and kind='percent' and value > $1`, [LIMITS.maxPercentBps]);
  for (const r of high) flags.push({ kind: 'high_rule', business_id: r.business_id, consumer_id: null, ref: r.id, details: { percentual: r.value / 100 }, block: false });

  // 4) Pico de lançamentos fora do padrão da loja
  const burst = await q<{ business_id: string; n24: string; avg30: string }>(
    `select business_id,
       count(*) filter (where created_at > $1) n24,
       count(*) filter (where created_at <= $1 and created_at > $2) / 30.0 avg30
     from purchases where status='confirmed' and created_at > $2 and created_at <= $3 group by 1`,
    [since24, since30, now],
  );
  for (const b of burst) {
    const n = Number(b.n24), avg = Number(b.avg30);
    if (n >= LIMITS.burstMin && n > Math.max(1, avg) * LIMITS.burstFactor)
      flags.push({ kind: 'burst', business_id: b.business_id, consumer_id: null, ref: `${b.business_id}:${now.toISOString().slice(0, 10)}`, details: { compras_24h: n, media_diaria_30d: Math.round(avg * 10) / 10 }, block: false });
  }

  // 5) Loja que recusa notas legítimas para não dar cashback
  const rej = await q<{ business_id: string; total: string; rejected: string }>(
    `select business_id, count(*) total, count(*) filter (where status='rejected') rejected from purchases
     where source='customer' and decided_at > $1 and decided_at <= $2 group by 1 having count(*) >= 10`,
    [since30, now],
  );
  for (const r of rej) {
    const rate = Number(r.rejected) / Number(r.total);
    if (rate > 0.4) flags.push({ kind: 'claim_rejections', business_id: r.business_id, consumer_id: null, ref: `${r.business_id}:${now.toISOString().slice(0, 7)}`, details: { notas_30d: Number(r.total), recusadas: Number(r.rejected) }, block: false });
  }

  // 6) Cliente que envia muitas notas recusadas (já fica bloqueado para novos envios)
  const badC = await q<{ consumer_id: string; n: string }>(
    `select consumer_id, count(*) n from purchases where source='customer' and status='rejected' and decided_at > $1 group by 1 having count(*) >= 3`,
    [since30],
  );
  for (const r of badC) flags.push({ kind: 'claim_abuse', business_id: null, consumer_id: r.consumer_id, ref: `${r.consumer_id}:${now.toISOString().slice(0, 7)}`, details: { notas_recusadas_30d: Number(r.n) }, block: false });

  let created = 0, blocked = 0;
  for (const f of flags) {
    const inserted = await tx(async (c) => {
      const r = await c.query(
        `insert into fraud_flags (kind, business_id, consumer_id, ref, details, action) values ($1,$2,$3,$4,$5,$6) on conflict (kind, ref) do nothing returning id`,
        [f.kind, f.business_id, f.consumer_id, f.ref, f.details, f.block ? 'blocked' : 'flagged'],
      );
      if (!r.rowCount) return false;
      if (f.block && f.business_id) await c.query(`update businesses set status='blocked' where id=$1 and status='active'`, [f.business_id]);
      return true;
    });
    if (!inserted) continue;
    created++;
    if (f.block && f.business_id) {
      blocked++;
      const owner = await q<{ id: string; email: string; name: string; bname: string }>(
        `select u.id, u.email, u.name, b.name bname from businesses b join users u on u.id=b.owner_id where b.id=$1`,
        [f.business_id],
      );
      if (owner[0])
        await queueEmail(owner[0].id, owner[0].email, 'Sua loja foi pausada no Cashbacksmart', `Olá, ${owner[0].name.split(' ')[0]}.\n\nNosso sistema de segurança pausou a loja ${owner[0].bname} por lançamentos fora do padrão (${f.kind === 'self_purchase' ? 'cashback lançado para a própria equipe' : 'muitas compras do mesmo cliente em pouco tempo'}).\n\nSe foi um engano, responda este e-mail explicando o que aconteceu que a análise é refeita.`, 'fraud');
    }
  }
  return { flags: created, blocked };
}

export async function openFlags(limit = 100) {
  return q<any>(
    `select f.*, b.name business, u.name consumer from fraud_flags f left join businesses b on b.id=f.business_id left join users u on u.id=f.consumer_id
     where f.resolved_at is null order by f.created_at desc limit $1`,
    [limit],
  );
}

export async function resolveFlag(id: string, unblock: boolean) {
  await tx(async (c) => {
    const r = await c.query(`update fraud_flags set resolved_at=now() where id=$1 returning business_id`, [id]);
    if (unblock && r.rows[0]?.business_id) await c.query(`update businesses set status='active' where id=$1`, [r.rows[0].business_id]);
  });
}
