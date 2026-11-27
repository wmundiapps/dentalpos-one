/**
 * Cria/atualiza um usuário CONVIDADO com prazo de acesso (idempotente).
 * Variáveis: GUEST_USER_EMAIL, GUEST_USER_PASSWORD, GUEST_EXPIRES_AT (data ISO, ex.: 2026-11-27T23:59:00-03:00) — obrigatórias;
 * GUEST_USER_NAME, GUEST_USER_ROLE (padrão BOARD: vê tudo), DEMO_TENANT (padrão sua-instituicao).
 * Para prorrogar o acesso basta trocar GUEST_EXPIRES_AT e reiniciar a API; a data nunca é recalculada sozinha.
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

async function main() {
  const email = String(process.env.GUEST_USER_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.GUEST_USER_PASSWORD || '')
  const expira = new Date(String(process.env.GUEST_EXPIRES_AT || ''))
  if (!email || !password || Number.isNaN(expira.getTime())) { console.log('[guest-user] GUEST_USER_EMAIL/GUEST_USER_PASSWORD/GUEST_EXPIRES_AT ausentes ou inválidos; nada a fazer.'); return }
  const tenantId = process.env.DEMO_TENANT || 'sua-instituicao'
  const clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) { console.log(`[guest-user] instituição ${tenantId} não encontrada; rode o seed antes.`); return }
  const [firstName, ...rest] = String(process.env.GUEST_USER_NAME || 'Especialista Convidado').split(' ')
  const role = process.env.GUEST_USER_ROLE || 'BOARD'
  const hash = await bcrypt.hash(password, 10)
  const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
  if (ex) {
    await prisma.user.update({ where: { id: ex.id }, data: { password: hash, isActive: true, role, accessExpiresAt: expira } as any })
    console.log(`[guest-user] atualizado: ${email} (expira em ${expira.toISOString()})`)
  } else {
    await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: hash, firstName, lastName: rest.join(' ') || 'Convidado', role, isActive: true, accessExpiresAt: expira } as any })
    console.log(`[guest-user] criado: ${email} (expira em ${expira.toISOString()})`)
  }
}
main().catch((e) => { console.error('[guest-user] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
