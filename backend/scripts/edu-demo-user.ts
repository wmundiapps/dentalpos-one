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
    // O papel também é reaplicado: o usuário de apresentação sempre tem acesso total (ADMIN), mesmo que tenha sido criado antes com outro papel.
    await prisma.user.update({ where: { id: ex.id }, data: { password: hash, isActive: true, role: process.env.DEMO_USER_ROLE || 'ADMIN' } as any })
    console.log(`[demo-user] atualizado: ${email}`)
  } else {
    await prisma.user.create({
      data: { clinicId: clinic.id, tenantId, email, password: hash, firstName, lastName: rest.join(' ') || 'EduMaster', role: process.env.DEMO_USER_ROLE || 'ADMIN', isActive: true } as any,
    })
    console.log(`[demo-user] criado: ${email}`)
  }
  // Vincula o usuário de apresentação a um colaborador do RH (senão Ponto, Férias e Avaliações mostram "não vinculado").
  try {
    const u = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
    const rhe = (prisma as any).rheColaborador
    if (u && rhe && !(await rhe.findFirst({ where: { tenantId, userId: u.id } }))) {
      const livre = await rhe.findFirst({ where: { tenantId, userId: null, status: 'ATIVO' }, orderBy: { nome: 'asc' } })
      if (livre) { await rhe.update({ where: { id: livre.id }, data: { userId: u.id } }); console.log(`[demo-user] vinculado ao colaborador do RH: ${livre.nome}`) }
    }
  } catch (e: any) { console.log('[demo-user] vínculo com o RH ignorado:', e?.message || e) }
  // Entra nos canais de departamento e grupos já semeados do Mensageiro (senão /edu/mensagens abre com "Nenhuma conversa ainda").
  try {
    const u = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
    const canal = (prisma as any).msgCanal
    const membro = (prisma as any).msgMembro
    if (u && canal && membro) {
      const canais = await canal.findMany({ where: { tenantId, tipo: { in: ['DEPARTAMENTO', 'GRUPO'] }, arquivado: false }, select: { id: true } })
      if (canais.length) {
        const r = await membro.createMany({ data: canais.map((c: any) => ({ tenantId, canalId: c.id, userId: u.id, papel: 'MEMBRO', origem: 'ENTROU' })), skipDuplicates: true })
        console.log(`[demo-user] adicionado a ${r.count} canal(is) do Mensageiro`)
      }
    }
  } catch (e: any) { console.log('[demo-user] canais do Mensageiro ignorados:', e?.message || e) }
}
main().catch((e) => { console.error('[demo-user] falhou:', e?.message || e) }).finally(() => prisma.$disconnect())
