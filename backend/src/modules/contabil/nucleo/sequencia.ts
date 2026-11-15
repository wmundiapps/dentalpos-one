import { prisma } from './db'

/** Próximo número da sequência (atômico: upsert com incremento). `empresaId` vazio = sequência do tenant. */
export async function proximoNumero(tenantId: string, empresaId: string, chave: string): Promise<number> {
  const r = await prisma.ctbSequencia.upsert({
    where: { tenantId_empresaId_chave: { tenantId, empresaId, chave } },
    create: { tenantId, empresaId, chave, atual: 1 },
    update: { atual: { increment: 1 } },
  })
  return r.atual
}
