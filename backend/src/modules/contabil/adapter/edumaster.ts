// Implementação do adapter para o EduMaster Pro. É o ÚNICO arquivo do bloco que lê tabelas do hospedeiro (User e Clinic).
import { prisma } from '../nucleo/db'
import type { ContabilAdapter, EntidadeExterna } from './tipos'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

async function entidades(tenantId: string, busca?: string): Promise<EntidadeExterna[]> {
  // A própria instituição é a única entidade natural no EduMaster; outros sistemas devolvem clientes, fornecedores etc.
  const c = await prisma.clinic.findFirst({ where: { tenantId }, select: { id: true, name: true, cnpj: true, email: true, phone: true } })
  if (!c) return []
  const e: EntidadeExterna = { id: c.id, tipoPessoa: 'PJ', documento: String(c.cnpj || '').replace(/\D+/g, ''), nome: c.name, email: c.email, telefone: c.phone }
  return !busca || e.nome.toLowerCase().includes(busca.toLowerCase()) ? [e] : []
}

export const adapterEduMaster: ContabilAdapter = {
  nome: 'EduMaster Pro',
  contexto(req) {
    const u = req?.user
    if (!u?.tenantId || !u?.id) return null
    return { tenantId: String(u.tenantId), userId: String(u.id), cargo: String(u.role || '').toUpperCase(), acessoConcedido: !!req.acessoConcedido }
  },
  mapearCargo(cargo) {
    const c = String(cargo || '').toUpperCase()
    if (c === 'STUDENT' || c === 'TEACHER') return 'NEGAR'   // aluno e professor nunca acessam a contabilidade
    if (SUPER.includes(c)) return 'GESTOR'
    if (c === 'FINANCE') return 'FINANCEIRO'
    if (c === 'CONTADOR' || c === 'ACCOUNTANT') return 'CONTADOR'
    return null
  },
  async nomesUsuarios(tenantId, ids) {
    if (!ids.length) return {}
    const rows = await prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })
    return Object.fromEntries(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]))
  },
  async nomeInstituicao(tenantId) {
    const c = await prisma.clinic.findFirst({ where: { tenantId }, select: { name: true } })
    return c?.name || 'SUA INSTITUIÇÃO'
  },
  listarEntidades: entidades,
  async obterEntidade(tenantId, id) { return (await entidades(tenantId)).find((e) => e.id === id) ?? null },
}
