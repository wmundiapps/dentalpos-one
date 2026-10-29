/**
 * Cria/atualiza o usuário de apresentação do ambiente de demonstração (idempotente).
 * Variáveis: DEMO_USER_EMAIL, DEMO_USER_PASSWORD (obrigatórias), DEMO_USER_NAME, DEMO_USER_ROLE (padrão ADMIN), DEMO_TENANT (padrão sua-instituicao).
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

async function main() {
  const email = String(process.env.DEMO_USER_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.DEMO_USER_PASSWORD || '')
  if (!email || !password) { console.log('[demo-user] DEMO_USER_EMAIL/DEMO_USER_PASSWORD ausentes; nada a fazer.'); return }
  const tenantId = process.env.DEMO_TENANT || 'sua-instituicao'
  const clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) { console.log(`[demo-user] instituição ${tenantId} não encontrada; rode o seed antes.`); return }
  const [firstName, ...rest] = String(process.env.DEMO_USER_NAME || 'Apresentação EduMaster').split(' ')
  const hash = await bcrypt.hash(password, 10)
  const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
  if (ex) {
    await prisma.user.update({ where: { id: ex.id }, data: { password: hash, isActive: true } as any })
    console.log(`[demo-user] atualizado: ${email}`)
  } else {
    await prisma.user.create({
      data: { clinicId: clinic.id, tenantId, email, password: hash, firstName, lastName: rest.join(' ') || 'EduMaster', role: process.env.DEMO_USER_ROLE || 'ADMIN', isActive: true } as any,
    })
    console.log(`[demo-user] criado: ${email}`)
  }
}
main().catch((e) => { console.error('[demo-user] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
