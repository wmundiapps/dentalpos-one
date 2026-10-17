import { one, pool, type Db } from './db.js';
import { settingsSchema, defaultSettings, type Settings } from './settings.js';
import { decrypt, encrypt } from './secure.js';
import type { AsaasCreds } from './asaas.js';

export interface TenantRow { id: string; slug: string; name: string; owner_name: string; email: string; phone: string | null; cnpj: string | null; trial_ends_at: Date; billing_status: string; terms_version: string | null; asaas_subscription_id: string | null; monthly_fee_cents: number; settings: any; secrets: string | null }

export async function getTenant(db: Db, id: string): Promise<TenantRow> {
  const t = await one<TenantRow>(db, 'SELECT * FROM tenants WHERE id = $1', [id]);
  if (!t) throw new Error('lava-rápido não encontrado');
  return t;
}

/** Configurações sempre completas: o que faltar no banco vem do padrão. */
export function parseSettings(raw: any): Settings {
  const d = defaultSettings();
  const merged = { ...d, ...(raw ?? {}) };
  for (const k of Object.keys(d) as (keyof Settings)[]) {
    if (typeof d[k] === 'object' && !Array.isArray(d[k]) && raw?.[k]) (merged as any)[k] = { ...(d[k] as object), ...raw[k] };
  }
  return settingsSchema.parse(merged);
}

export async function loadSettings(db: Db, tenantId: string): Promise<Settings> {
  return parseSettings((await getTenant(db, tenantId)).settings);
}

export async function getAsaasCreds(tenantId: string): Promise<AsaasCreds | null> {
  const t = await getTenant(pool, tenantId);
  if (!t.secrets) return null;
  try {
    const s = JSON.parse(decrypt(t.secrets));
    if (!s.asaasApiKey) return null;
    return { apiKey: s.asaasApiKey, sandbox: parseSettings(t.settings).asaas.sandbox };
  } catch { return null; }
}

export async function setSecret(tenantId: string, key: string, value: string) {
  const t = await getTenant(pool, tenantId);
  const cur = t.secrets ? JSON.parse(decrypt(t.secrets)) : {};
  cur[key] = value;
  await pool.query('UPDATE tenants SET secrets = $2 WHERE id = $1', [tenantId, encrypt(JSON.stringify(cur))]);
}
