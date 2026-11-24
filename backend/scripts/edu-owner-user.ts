/**
 * Cria/atualiza a conta pessoal do proprietário, com acesso total (ADMIN) e sem prazo de expiração.
 * Variáveis: OWNER_USER_EMAIL, OWNER_USER_PASSWORD (obrigatórias), OWNER_USER_NAME, DEMO_TENANT (padrão sua-instituicao).
 * Deliberadamente fora do roteiro de contas da instituição (edu-uninga-test-users.ts): é a conta de administração
 * do próprio dono do sistema, não um papel/setor da Uningá.
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

async function main() {
  const email = String(process.env.OWNER_USER_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.OWNER_USER_PASSWORD || '')
  if (!email || !password) { console.log('[owner-user] OWNER_USER_EMAIL/OWNER_USER_PASSWORD ausentes; nada a fazer.'); return }
  const tenantId = process.env.DEMO_TENANT || 'sua-instituicao'
  const clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) { console.log(`[owner-user] instituição ${tenantId} não encontrada; rode o seed antes.`); return }
  const [firstName, ...rest] = String(process.env.OWNER_USER_NAME || 'Administrador').split(' ')
  const hash = await bcrypt.hash(password, 10)
  const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
  if (ex) {
    await prisma.user.update({ where: { id: ex.id }, data: { password: hash, isActive: true, role: 'OWNER', accessExpiresAt: null } as any })
    console.log(`[owner-user] atualizado.`)
  } else {
    await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: hash, firstName, lastName: rest.join(' ') || '', role: 'OWNER', isActive: true } as any })
    console.log(`[owner-user] criado.`)
  }
}
main().catch((e) => { console.error('[owner-user] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
