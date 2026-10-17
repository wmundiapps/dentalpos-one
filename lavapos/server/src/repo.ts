// Acesso aos registros de negócio (tabela `records`). Toda consulta é amarrada ao tenant: um lava-rápido nunca enxerga outro.
import { one, rows, type Db } from './db.js';

export interface Rec<T = Record<string, any>> { id: string; kind: string; createdAt: string; updatedAt: string; data: T }

const map = (r: any): Rec => ({ id: r.id, kind: r.kind, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(), data: r.data });

export async function listRecs(db: Db, tenantId: string, kind: string, opts: { archived?: boolean; limit?: number; where?: string; params?: unknown[]; order?: string } = {}): Promise<Rec[]> {
  const params = [tenantId, kind, ...(opts.params ?? [])];
  const arch = opts.archived ? '' : "AND COALESCE(data->>'archived','false') <> 'true'";
  const sql = `SELECT * FROM records WHERE tenant_id = $1 AND kind = $2 ${arch} ${opts.where ? 'AND ' + opts.where : ''} ORDER BY ${opts.order ?? 'created_at DESC'} LIMIT ${Math.min(opts.limit ?? 1000, 5000)}`;
  return (await rows(db, sql, params)).map(map);
}

export async function getRec(db: Db, tenantId: string, kind: string, id: string): Promise<Rec | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const r = await one(db, 'SELECT * FROM records WHERE tenant_id = $1 AND kind = $2 AND id = $3', [tenantId, kind, id]);
  return r ? map(r) : undefined;
}

export async function insertRec(db: Db, tenantId: string, kind: string, data: Record<string, any>): Promise<Rec> {
  return map(await one(db, 'INSERT INTO records (tenant_id, kind, data) VALUES ($1,$2,$3) RETURNING *', [tenantId, kind, JSON.stringify(data)]));
}

/** Mescla `patch` por cima dos dados atuais (nível raiz). */
export async function patchRec(db: Db, tenantId: string, kind: string, id: string, patch: Record<string, any>): Promise<Rec | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const r = await one(db, `UPDATE records SET data = data || $4::jsonb, updated_at = now() WHERE tenant_id = $1 AND kind = $2 AND id = $3 RETURNING *`,
    [tenantId, kind, id, JSON.stringify(patch)]);
  return r ? map(r) : undefined;
}

export const archiveRec = (db: Db, tenantId: string, kind: string, id: string) => patchRec(db, tenantId, kind, id, { archived: true, archivedAt: new Date().toISOString() });

export async function cashbackBalance(db: Db, tenantId: string, customerId: string): Promise<number> {
  const r = await one<{ s: number | null }>(db,
    "SELECT SUM((data->>'deltaCents')::int) AS s FROM records WHERE tenant_id = $1 AND kind = 'cashback' AND data->>'customerId' = $2", [tenantId, customerId]);
  return r?.s ?? 0;
}
