/**
 * Aprova automaticamente qualquer dispositivo pendente da conta pessoal do proprietário (OWNER_USER_EMAIL).
 * Mesmo tratamento dado ao papel dessa conta em requireRole (ver academico/middleware.ts): ela nunca fica
 * bloqueada por uma verificação pensada para as demais contas — aqui, a aprovação de dispositivo novo.
 */
import { prisma } from '../src/lib/prisma'

async function main() {
  const email = String(process.env.OWNER_USER_EMAIL || '').trim().toLowerCase()
  if (!email) { console.log('[owner-device] OWNER_USER_EMAIL ausente; nada a fazer.'); return }
  const user = await prisma.user.findFirst({ where: { email } })
  if (!user) { console.log(`[owner-device] usuário ${email} não encontrado; nada a fazer.`); return }
  const r = await prisma.segDispositivo.updateMany({
    where: { userId: user.id, aprovado: false, recusado: false },
    data: { aprovado: true, aprovadoEm: new Date() },
  })
  if (r.count) console.log(`[owner-device] ${r.count} dispositivo(s) aprovado(s) automaticamente para ${email}.`)
}
main().catch((e) => { console.error('[owner-device] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
