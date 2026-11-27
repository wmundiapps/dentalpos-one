import { prisma } from '../../lib/prisma'
import { Entidade, Pessoa, todasEntidades, whereDaEntidade } from './catalogo'
import { mascararCpf, sha256 } from './mascara'

// ============================================================
// Pacote de dados do titular (art. 18, II e V - acesso e portabilidade): JSON estruturado e legível por máquina.
// Varre TODAS as entidades do catálogo e as tabelas com studentId/candidatoId/egressoId descobertas pelo schema.
// Nunca inclui hashes, sais, segredos ou tokens. O pacote NÃO é armazenado: só seu hash e contagens vão para a trilha.
// ============================================================

const LIMITE_POR_ENTIDADE = 5000
const LIMITE_TEXTO = 20000
const CAMPO_PROIBIDO = /(hash|salt|senha|password|token|secret|segredo|apikey)/i

export function limparRegistro(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (CAMPO_PROIBIDO.test(k)) continue
    if (typeof v === 'string' && v.length > LIMITE_TEXTO) out[k] = v.slice(0, LIMITE_TEXTO) + ` […truncado: ${v.length} caracteres]`
    else out[k] = v instanceof Date ? v.toISOString() : v
  }
  return out
}

export async function compartilhamentoDoTenant(tenantId: string) {
  const ativs = await prisma.lgpAtividadeTratamento.findMany({ where: { tenantId, status: 'ATIVA' }, select: { codigo: true, atividade: true, compartilhamento: true, operadores: true, transferenciaInternacional: true } })
  return ativs
    .filter((a) => Array.isArray(a.compartilhamento) && (a.compartilhamento as any[]).length)
    .map((a) => ({ atividade: a.atividade, codigo: a.codigo, destinatarios: a.compartilhamento, operadores: a.operadores ?? [], transferenciaInternacional: a.transferenciaInternacional }))
}

export async function gerarPacote(p: Pessoa, ctx: { motivo?: string; solicitacaoId?: string } = {}) {
  const entidades: any[] = []
  const camposVazios: string[] = []

  // identidade básica
  if (p.studentId) {
    const aluno = await prisma.student.findFirst({ where: { id: p.studentId, tenantId: p.tenantId } })
    if (aluno) entidades.push({ model: 'student', titulo: 'Cadastro do aluno', categoria: 'IDENTIFICACAO', sensivel: false, acao: 'MANTER', base: 'Cadastro acadêmico - guarda obrigatória (art. 16, I)', total: 1, truncado: false, registros: [limparRegistro(aluno as any)] })
  }
  if (p.userId) {
    const u = await prisma.user.findFirst({ where: { id: p.userId, tenantId: p.tenantId }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true, createdAt: true } })
    if (u) entidades.push({ model: 'user', titulo: 'Conta de acesso', categoria: 'IDENTIFICACAO', sensivel: false, acao: 'ANONIMIZAR', total: 1, truncado: false, registros: [limparRegistro(u as any)] })
  }

  for (const e of todasEntidades()) {
    const where = whereDaEntidade(e, p)
    if (!where) continue
    const d = (prisma as any)[e.model]
    if (!d) continue
    try {
      const [total, rows] = await Promise.all([d.count({ where }), d.findMany({ where, take: LIMITE_POR_ENTIDADE })])
      if (!total) continue
      entidades.push({ model: e.model, titulo: e.titulo, categoria: e.categoria, sensivel: !!e.sensivel, acao: e.acao, base: e.base ?? null, total, truncado: total > rows.length, registros: rows.map((r: any) => limparRegistro(r)) })
    } catch (err: any) {
      camposVazios.push(`${e.model}: ${String(err?.message || err).slice(0, 120)}`)
    }
  }

  const compartilhamento = await compartilhamentoDoTenant(p.tenantId)
  const conteudo = JSON.stringify(entidades)
  const hashConteudo = sha256(conteudo)
  const total = entidades.reduce((a, e) => a + e.total, 0)
  return {
    formato: 'edumaster-lgpd-pacote/1',
    geradoEm: new Date().toISOString(),
    aviso: 'Este arquivo contém dados pessoais (inclusive sensíveis, quando existirem). Entregue somente ao titular ou ao seu representante legal, por canal seguro, após verificação de identidade.',
    titular: { tipo: p.tipo, id: p.id, nome: p.nome, identificadores: { emails: p.emails, telefones: p.telefones, documentos: p.docs.map(mascararCpf) } },
    solicitacaoId: ctx.solicitacaoId ?? null,
    motivo: ctx.motivo ?? null,
    resumo: { entidades: entidades.length, registros: total, sensiveis: entidades.filter((e) => e.sensivel).length },
    entidades,
    compartilhamento,
    excecoesArt16: entidades.filter((e) => e.acao === 'MANTER').map((e) => ({ entidade: e.titulo, fundamento: e.base })),
    avisosDeLeitura: camposVazios,
    hashConteudo,
  }
}

export type EntidadeExport = Entidade
