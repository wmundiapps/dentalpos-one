/**
 * Seed do módulo COBRANÇA (EduMaster Pro). NÃO altera edu-demo-seed.ts: importe e chame como etapa opcional:
 *   import { seedCobranca } from './seeds/cobranca'
 *   await seedCobranca(c.api, c)         // c = Ctx do edu-demo-seed (usa api com token ADMIN e tenantId)
 * Também roda sozinho:  DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/cobranca.ts
 * Idempotente: se já existir acordo/promessa demo, não duplica. Usa a API real; títulos vencidos extras via Prisma.
 */
import { prisma } from '../../src/lib/prisma'

type Api = (method: string, path: string, body?: any) => Promise<any>
interface SeedCtx { tenantId: string; failures?: string[] }

const DIA = 86_400_000
const iso = (n: number) => new Date(Date.now() + n * DIA).toISOString()

export async function seedCobranca(api: Api, ctx: SeedCtx) {
  const tenantId = ctx.tenantId
  const nota = (m: string) => console.log(`  [cobranca] ${m}`)
  await api('POST', '/edu/cobranca/bootstrap', {})

  // garante devedores em todas as faixas de aging, com contato cadastrado
  const alunos = await prisma.student.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' }, take: 40 })
  if (!alunos.length) { nota('sem alunos: rode as etapas acadêmicas antes'); return }
  const faixas = [8, 20, 40, 70, 100, 150]
  let criados = 0
  for (let i = 0; i < Math.min(alunos.length, 12); i++) {
    const a = alunos[i]
    const dias = faixas[i % faixas.length]
    const ja = await prisma.accountReceivable.count({ where: { tenantId, studentId: a.id, status: { in: ['PENDENTE', 'ATRASADO'] }, dataVencimento: { lt: new Date() } } })
    if (!ja && i < 8) {
      for (let k = 0; k < 1 + (i % 3); k++) {
        await prisma.accountReceivable.create({ data: { tenantId, studentId: a.id, descricao: `Mensalidade (cobrança demo) ${k + 1}/6`, numeroParcela: k + 1, valor: 650 + (i % 3) * 120, dataVencimento: new Date(Date.now() - (dias + k * 30) * DIA), status: 'ATRASADO' } })
        criados++
      }
    }
    if (!(await prisma.comContato.count({ where: { tenantId, studentId: a.id } }))) {
      const u = await prisma.user.findFirst({ where: { id: a.userId, tenantId }, select: { email: true, phone: true } })
      await prisma.comContato.create({ data: { tenantId, nome: a.nomeCompleto, tipo: 'ALUNO', studentId: a.id, email: u?.email ?? `aluno${i}@exemplo.edu.br`, telefone: u?.phone ?? `+55119${String(81000000 + i)}` } })
    }
  }
  nota(`${criados} títulos vencidos de demonstração criados`)

  const lista = await api('GET', '/edu/cobranca/inadimplentes?pageSize=100&sort=saldo&dir=desc')
  const devedores: any[] = lista?.items ?? []
  if (devedores.length < 5) { nota('poucos inadimplentes para a demonstração'); return }
  const resp = await api('GET', '/edu/cobranca/responsaveis')
  const respId = resp?.items?.[0]?.id
  if (respId) await api('POST', '/edu/cobranca/casos/atribuir', { studentIds: devedores.slice(0, 4).map((d) => d.studentId), responsavelUserId: respId })

  const jaDemo = await prisma.cobAcordo.count({ where: { tenantId } })
  if (jaDemo === 0) {
    // 1) acordo ativo com entrada paga
    const [d0, d1, d2, d3, d4] = devedores
    const ac = await api('POST', '/edu/cobranca/acordos', { studentId: d0.studentId, parcelas: 4, entradaPct: 25, primeiroVencimento: iso(15), descontoEncargosPct: 50 })
    if (ac?.id) {
      const ativo = await api('POST', `/edu/cobranca/acordos/${ac.id}/aceitar`, { canal: 'PRESENCIAL', aceitoPor: d0.nome })
      const entrada = ativo?.parcelas?.find((p: any) => p.numero === 0)
      if (entrada) await api('POST', `/edu/cobranca/acordos/${ac.id}/parcelas/${entrada.id}/pagar`, { forma: 'PIX' })
    }
    // 2) proposta com contraproposta do aluno aguardando análise
    const pr = await api('POST', '/edu/cobranca/acordos', { studentId: d1.studentId, parcelas: 3, entradaPct: 30, primeiroVencimento: iso(12), descontoEncargosPct: 20 })
    if (pr?.id) await api('POST', `/edu/cobranca/acordos/${pr.id}/contraproposta`, { parcelas: 6, entrada: 100, primeiroVencimento: iso(20), descontoEncargosPct: 60, observacao: 'Aluno pediu mais prazo' })
    // 3) promessa de pagamento
    await api('POST', '/edu/cobranca/promessas', { studentId: d2.studentId, valor: Math.min(d2.saldo, 700), dataPrometida: iso(5), canal: 'TELEFONE', observacao: 'Prometeu pagar após o salário' })
    // 4) interações e opt-out
    await api('POST', '/edu/cobranca/contatos/registrar', { studentId: d3.studentId, tipo: 'LIGACAO', canal: 'TELEFONE', resultado: 'NAO_ATENDEU', observacao: 'Caixa postal; tentar novamente amanhã' })
    await api('POST', '/edu/cobranca/contatos/registrar', { studentId: d4.studentId, tipo: 'VISITA', canal: 'PRESENCIAL', resultado: 'ATENDEU', observacao: 'Compareceu à secretaria; vai avaliar proposta de acordo' })
    if (d3.casoId) await api('POST', `/edu/cobranca/casos/${d3.casoId}/optout`, { canal: 'WHATSAPP', motivo: 'Prefere contato por e-mail' })
  }
  // 5) uma rodada da régua (sem despacho: a caixa de saída fica visível em Comunicação)
  const r = await api('POST', '/edu/cobranca/motor/executar', { despachar: false })
  nota(`régua executada: ${r?.motor?.contatos ?? 0} contato(s), ${r?.motor?.escalonamentos ?? 0} escalonamento(s)`)
}

// execução isolada
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const tenant = process.env.TENANT || 'sua-instituicao'
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: tenant } })
    if (!clinic) throw new Error('clínica/tenant não encontrado')
    const lg = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const token = ((await lg.json()) as any).token
    const api: Api = async (method, path, body) => {
      const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      const t = await res.text()
      if (!res.ok) { console.log('  falha', method, path, res.status, t.slice(0, 120)); return null }
      try { return JSON.parse(t) } catch { return t }
    }
    await seedCobranca(api, { tenantId: tenant })
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
