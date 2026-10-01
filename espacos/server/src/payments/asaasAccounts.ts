// Carteira Asaas dos anfitriões: a plataforma cria uma subconta Asaas com os
// dados do anfitrião (ele recebe um e-mail do Asaas para criar a senha e sacar)
// ou o anfitrião informa o Wallet ID da conta Asaas que já tem.
import { one, pool, rows } from '../db.js';
import { HttpError } from '../auth.js';
import { encryptText } from '../secure.js';
import { validCnpj, validCpf } from '../identity.js';
import { AsaasError, asaasCall, asaasEnabled } from './asaas.js';
import type { User } from '../../../shared/types.js';

export interface SubaccountInput {
  taxId: string; birthDate?: string; companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
  phone: string; incomeValue: number; postalCode: string; address: string; addressNumber: string; complement?: string; province: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

export async function asaasStatus(userId: string) {
  const a = await one<{ wallet_id: string; origin: string; created_at: Date }>(pool, 'SELECT wallet_id, origin, created_at FROM asaas_accounts WHERE user_id = $1', [userId]);
  return a ? { connected: true, origin: a.origin, walletId: `${a.wallet_id.slice(0, 8)}…`, connectedAt: a.created_at.toISOString() } : { connected: false };
}

export async function asaasWallet(userId: string): Promise<string | undefined> {
  return (await one<{ wallet_id: string }>(pool, 'SELECT wallet_id FROM asaas_accounts WHERE user_id = $1', [userId]))?.wallet_id;
}

export async function asaasHostIds(hostIds: string[]): Promise<Set<string>> {
  if (!hostIds.length || !asaasEnabled()) return new Set();
  return new Set((await rows<{ user_id: string }>(pool, 'SELECT user_id FROM asaas_accounts WHERE user_id = ANY($1)', [hostIds])).map((r) => r.user_id));
}

async function save(userId: string, walletId: string, origin: 'subaccount' | 'wallet', extra: { accountId?: string; apiKey?: string; taxId?: string } = {}) {
  const other = await one(pool, 'SELECT 1 FROM asaas_accounts WHERE wallet_id = $1 AND user_id <> $2', [walletId, userId]);
  if (other) throw new HttpError(409, 'asaas_wallet_in_use');
  await pool.query(
    `INSERT INTO asaas_accounts (user_id, wallet_id, account_id, api_key_enc, origin, tax_id) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET wallet_id=EXCLUDED.wallet_id, account_id=EXCLUDED.account_id, api_key_enc=EXCLUDED.api_key_enc,
       origin=EXCLUDED.origin, tax_id=EXCLUDED.tax_id, created_at=now()`,
    [userId, walletId, extra.accountId ?? null, extra.apiKey ? encryptText(extra.apiKey) : null, origin, extra.taxId ?? null]);
}

/** Cria a subconta Asaas do anfitrião e guarda a carteira. */
export async function createSubaccount(user: User, input: SubaccountInput) {
  if (!asaasEnabled()) throw new HttpError(503, 'asaas_not_configured');
  const taxId = digits(input.taxId);
  const isCpf = taxId.length === 11;
  if (isCpf ? !validCpf(taxId) : !validCnpj(taxId)) throw new HttpError(422, 'invalid_tax_id');
  if (isCpf && !input.birthDate) throw new HttpError(422, 'birth_date_required');
  try {
    const acc = await asaasCall<{ id: string; walletId: string; apiKey?: string }>('POST', '/accounts', {
      name: user.name, email: user.email, cpfCnpj: taxId, ...(isCpf ? { birthDate: input.birthDate } : { companyType: input.companyType ?? 'LIMITED' }),
      mobilePhone: digits(input.phone), incomeValue: input.incomeValue, address: input.address, addressNumber: input.addressNumber,
      complement: input.complement || undefined, province: input.province, postalCode: digits(input.postalCode),
    });
    await save(user.id, acc.walletId, 'subaccount', { accountId: acc.id, apiKey: acc.apiKey, taxId });
  } catch (e) {
    if (e instanceof AsaasError && e.status < 500) throw new HttpError(422, 'asaas_rejected', { reason: e.description });
    throw e;
  }
  return asaasStatus(user.id);
}

/** Anfitrião que já tem conta Asaas: informa o Wallet ID (Minha conta → Integrações). */
export async function linkWallet(userId: string, walletId: string) {
  if (!asaasEnabled()) throw new HttpError(503, 'asaas_not_configured');
  const w = walletId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(w)) throw new HttpError(422, 'invalid_wallet_id');
  await save(userId, w, 'wallet');
  return asaasStatus(userId);
}

export async function disconnectAsaas(userId: string) {
  await pool.query('DELETE FROM asaas_accounts WHERE user_id = $1', [userId]);
}
