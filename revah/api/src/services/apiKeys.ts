import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { randomToken, sha256 } from '../lib/crypto'

export async function createApiKey(tenantId: string, name: string) {
  const prefix = crypto.randomBytes(6).toString('hex').slice(0, 8)
  const raw = `rvh_${prefix}_${randomToken(24)}`
  const key = await prisma.apiKey.create({ data: { tenantId, name, prefix, hash: sha256(raw) } })
  return { id: key.id, name: key.name, prefix, key: raw, createdAt: key.createdAt }
}
