import { one, pool } from '../db.js';

/** 3 denúncias abertas de pessoas diferentes tiram o anúncio do ar até a moderação olhar. */
export async function autoPauseOnReports(listingId: string) {
  const n = (await one(pool, "SELECT count(DISTINCT COALESCE(reporter_id, id))::int AS n FROM reports WHERE listing_id = $1 AND status = 'open'", [listingId])).n;
  if (n >= 3) await pool.query("UPDATE listings SET status = 'pending_review', review_note = 'Retirado automaticamente: 3 denúncias abertas' WHERE id = $1 AND status = 'active'", [listingId]);
}
