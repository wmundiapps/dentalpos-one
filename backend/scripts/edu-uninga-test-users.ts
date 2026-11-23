/**
 * Cria/atualiza os 10 acessos de teste da Uningá (idempotente), um por setor, com prazo de acesso de 1 semana.
 * Só o cargo RECTOR enxerga tudo (reitoria@); os demais ficam restritos ao próprio setor pela matriz "Acesso por cargo".
 * Senhas vêm de UNINGA_TEST_PASSWORDS_JSON (variável de ambiente, nunca no código): {"email@uninga.edu.br":"senha", ...}.
 * Reexecute depois de qualquer mudança: senha, cargo e prazo são sempre reaplicados.
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const EXPIRA = new Date(process.env.UNINGA_TEST_EXPIRES_AT || '2026-11-30T23:59:00-03:00')

const CONTAS: Array<{ email: string; nome: string; role: string }> = [
  { email: 'reitoria@uninga.edu.br', nome: 'Reitoria Uningá', role: 'RECTOR' },
  { email: 'pro-reitoria@uninga.edu.br', nome: 'Pró-Reitoria Uningá', role: 'COORDINATOR' },
  { email: 'financeiro@uninga.edu.br', nome: 'Financeiro Uningá', role: 'FINANCE' },
  { email: 'diretoria.ead@uninga.edu.br', nome: 'Diretoria EAD Uningá', role: 'COORDINATOR' },
  { email: 'robsonravel@uninga.edu.br', nome: 'Robson Ravel de Oliveira', role: 'COORDINATOR' },
  { email: 'diretoria.administrativa@uninga.edu.br', nome: 'Diretoria Administrativa Uningá', role: 'SUPPLIES' },
  { email: 'marketing@uninga.edu.br', nome: 'Marketing Uningá', role: 'MARKETING' },
  { email: 'dir.ensinoesupervisao@uninga.edu.br', nome: 'Direção de Ensino e Supervisão Uningá', role: 'COORDINATOR' },
  { email: 'diretoriati@uninga.edu.br', nome: 'Diretoria de TI Uningá', role: 'STAFF' },
  { email: 'diretoriaposgraduacao@uninga.edu.br', nome: 'Diretoria de Pós-Graduação Uningá', role: 'COORDINATOR' },
]

async function main() {
  if (Number.isNaN(EXPIRA.getTime())) { console.log('[uninga-test-users] UNINGA_TEST_EXPIRES_AT inválida; nada a fazer.'); return }
  let senhas: Record<string, string> = {}
  try { senhas = JSON.parse(process.env.UNINGA_TEST_PASSWORDS_JSON || '{}') } catch { console.log('[uninga-test-users] UNINGA_TEST_PASSWORDS_JSON inválido; nada a fazer.'); return }
  if (!Object.keys(senhas).length) { console.log('[uninga-test-users] UNINGA_TEST_PASSWORDS_JSON ausente; nada a fazer.'); return }
  const tenantId = process.env.DEMO_TENANT || 'sua-instituicao'
  const clinic = await prisma.clinic.findFirst({ where: { tenantId } })
  if (!clinic) { console.log(`[uninga-test-users] instituição ${tenantId} não encontrada; rode o seed antes.`); return }
  for (const u of CONTAS) {
    const email = u.email.toLowerCase()
    const senha = senhas[email]
    if (!senha) { console.log(`[uninga-test-users] sem senha para ${email}, pulado.`); continue }
    const [firstName, ...rest] = u.nome.split(' ')
    const hash = await bcrypt.hash(senha, 10)
    const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
    if (ex) {
      await prisma.user.update({ where: { id: ex.id }, data: { password: hash, isActive: true, role: u.role, accessExpiresAt: EXPIRA } as any })
      console.log(`[uninga-test-users] atualizado: ${email} (${u.role}, expira ${EXPIRA.toISOString()})`)
    } else {
      await prisma.user.create({ data: { clinicId: clinic.id, tenantId, email, password: hash, firstName, lastName: rest.join(' ') || 'Uningá', role: u.role, isActive: true, accessExpiresAt: EXPIRA } as any })
      console.log(`[uninga-test-users] criado: ${email} (${u.role}, expira ${EXPIRA.toISOString()})`)
    }
  }
}
main().catch((e) => { console.error('[uninga-test-users] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
