/**
 * Cria/atualiza vários usuários de demonstração, um por instituição/contato interessado (idempotente).
 * Cada um pode ter seu próprio link de acesso direto (ver PROSPECT_USERS_JSON em app.ts).
 * Variável: PROSPECT_USERS_JSON = [{"email":"...","password":"...","name":"...","accessKey":"...","expiresAt":"ISO"}, ...]
 * Sem a variável, não faz nada (não derruba os usuários já criados nem exige a variável em todo ambiente).
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

interface ProspectUser {
  email?: string
  password?: string
  name?: string
  role?: string
  expiresAt?: string
}

async function main() {
  let lista: ProspectUser[] = []
  try { lista = JSON.parse(process.env.PROSPECT_USERS_JSON || '[]') } catch { console.log('[prospect-demo-users] PROSPECT_USERS_JSON inválida; nada a fazer.'); return }
  if (!Array.isArray(lista) || !lista.length) { console.log('[prospect-demo-users] PROSPECT_USERS_JSON ausente ou vazia; nada a fazer.'); return }

  const tenantId = process.env.DEMO_TENANT || 'sua-instituicao'
  const clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) { console.log(`[prospect-demo-users] instituição ${tenantId} não encontrada; rode o seed antes.`); return }

  for (const p of lista) {
    const email = String(p.email || '').trim().toLowerCase()
    const password = String(p.password || '')
    if (!email || !password) { console.log('[prospect-demo-users] registro sem email/password, pulado.'); continue }
    const [firstName, ...rest] = String(p.name || 'Demonstração EduMaster').split(' ')
    const hash = await bcrypt.hash(password, 10)
    const expiraRaw = p.expiresAt ? new Date(p.expiresAt) : null
    const accessExpiresAt = expiraRaw && !Number.isNaN(expiraRaw.getTime()) ? expiraRaw : null
    const role = p.role || 'ADMIN'
    const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
    if (ex) {
      await prisma.user.update({ where: { id: ex.id }, data: { password: hash, isActive: true, role, accessExpiresAt } as any })
      console.log(`[prospect-demo-users] atualizado: ${email}${accessExpiresAt ? ` (expira ${accessExpiresAt.toISOString()})` : ''}`)
    } else {
      await prisma.user.create({
        data: { clinicId: clinic.id, tenantId, email, password: hash, firstName, lastName: rest.join(' ') || 'EduMaster', role, isActive: true, accessExpiresAt } as any,
      })
      console.log(`[prospect-demo-users] criado: ${email}${accessExpiresAt ? ` (expira ${accessExpiresAt.toISOString()})` : ''}`)
    }
  }
}
main().catch((e) => { console.error('[prospect-demo-users] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
