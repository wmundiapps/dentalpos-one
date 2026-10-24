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

/** Mescla o padrão com o que está salvo, em qualquer profundidade (listas são trocadas inteiras). */
function deepMerge(base: any, over: any): any {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  if (typeof over !== 'object' || over === null || Array.isArray(over)) return base;
  const out: Record<string, any> = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

/** Configurações sempre completas: o que faltar no banco (inclusive campos novos de versões futuras) vem do padrão. */
export function parseSettings(raw: any): Settings {
  return settingsSchema.parse(deepMerge(defaultSettings(), raw ?? {}));
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
