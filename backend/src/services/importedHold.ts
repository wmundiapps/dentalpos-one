import { prisma } from '../lib/prisma'

// Parcelas importadas de outro sistema (Clinicorp etc.) têm boleto emitido lá: o pagamento não chega aqui sozinho.
// Enquanto a baixa não for feita, elas ficam fora da cobrança automática, para ninguém ser cobrado por uma parcela já paga.
export const IMPORTED_ORIGINS = ['CLINICORP', 'IMPORTACAO']

export async function importedOriginsToSkip(clinicId: string): Promise<string[]> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: 'FOLLOWUP_DIGEST' } } }).catch(() => null)
  const meta = (row?.metadata || {}) as { skipImported?: boolean }
  return meta.skipImported === false ? [] : IMPORTED_ORIGINS
}
