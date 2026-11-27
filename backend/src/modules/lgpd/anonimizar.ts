import { randomBytes } from 'crypto'
import { prisma } from '../../lib/prisma'
import { ANON, AcaoEntidade, Pessoa, CATALOGO, temCampo, whereDaEntidade } from './catalogo'
import { revogarConsentimentosPessoa } from './consentimentos'

// ============================================================
// Rotina de anonimização/eliminação por titular (art. 18, IV e VI) com a EXCEÇÃO DO ART. 16.
// - dry-run por padrão (planejar) e execução em UMA transação (executar);
// - registros que a lei obriga a guardar (histórico escolar, diplomas, notas, frequência, financeiro/fiscal,
//   estágio, ocorrências disciplinares) NÃO são tocados e aparecem no plano como "mantidos" com o fundamento;
// - nada de dado pessoal é devolvido: só contagens.
// ============================================================

export interface ItemPlano {
  model: string
  titulo: string
  categoria: string
  sensivel: boolean
  acaoPlanejada: AcaoEntidade
  registros: number
  aplicaveis: number            // quantos serão efetivamente alterados/removidos
  retidos: number               // quantos ficam por prazo mínimo de guarda ou por obrigação legal
  motivo: string | null
}

export interface Plano {
  titular: { tipo: string; id: string }
  modo: 'ANONIMIZACAO' | 'ELIMINACAO'
  itens: ItemPlano[]
  aluno: { acao: AcaoEntidade; motivo: string } | null
  usuario: { acao: AcaoEntidade; motivo: string } | null
  consentimentosAtivos: number
  totalAlteracoes: number
  totalMantidos: number
  excecaoArt16: string
}

export const TEXTO_ART16 = 'LGPD art. 16, I: os dados podem ser conservados para cumprimento de obrigação legal ou regulatória pelo controlador. O histórico escolar, diplomas/certificados, notas, frequência e os registros fiscais/financeiros são de guarda obrigatória e, por isso, não são apagados nem anonimizados; ficam apenas com acesso restrito e finalidade limitada.'

const CATEGORIAS_ACADEMICAS = new Set(['ACADEMICO', 'FINANCEIRO'])

function valoresDe(campos: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) out[k] = typeof v === 'function' ? (v as () => unknown)() : v
  return out
}

function corte(meses: number) { const d = new Date(); d.setMonth(d.getMonth() - meses); return d }

export async function planejar(p: Pessoa, modo: 'ANONIMIZACAO' | 'ELIMINACAO', opts: { excluirSolicitacaoId?: string } = {}): Promise<Plano> {
  const itens: ItemPlano[] = []
  let academicos = 0
  for (const e of CATALOGO) {
    let where = whereDaEntidade(e, p)
    if (!where) continue
    if (e.model === 'lgpSolicitacao' && opts.excluirSolicitacaoId) where = { AND: [where, { id: { not: opts.excluirSolicitacaoId } }] }
    const d = (prisma as any)[e.model]
    const registros = await d.count({ where })
    if (!registros) continue
    let acao: AcaoEntidade = e.acao
    let motivo: string | null = e.base ?? null
    if (e.soSemMatricula && p.matriculado) { acao = 'MANTER'; motivo = e.base ?? 'Compõe o dossiê do aluno matriculado' }
    let aplicaveis = acao === 'MANTER' ? 0 : registros
    if (acao !== 'MANTER' && e.minMeses && temCampo(e.model, 'createdAt')) {
      aplicaveis = await d.count({ where: { AND: [where, { createdAt: { lt: corte(e.minMeses) } }] } })
    }
    if (acao === 'MANTER' && CATEGORIAS_ACADEMICAS.has(e.categoria)) academicos += registros
    itens.push({ model: e.model, titulo: e.titulo, categoria: e.categoria, sensivel: !!e.sensivel, acaoPlanejada: acao, registros, aplicaveis, retidos: registros - aplicaveis, motivo: registros - aplicaveis > 0 && acao !== 'MANTER' ? `${e.base ?? 'Prazo mínimo de guarda'} (${e.minMeses ?? 0} meses)` : motivo })
  }

  let aluno: Plano['aluno'] = null
  if (p.studentId) {
    const temRegistro = academicos > 0 || (await prisma.enrollment.count({ where: { studentId: p.studentId } })) > 0
    aluno = temRegistro
      ? { acao: 'MANTER', motivo: 'Identificação do aluno integra o histórico escolar (guarda obrigatória) - art. 16, I' }
      : { acao: 'ANONIMIZAR', motivo: 'Sem matrícula, notas, certificados ou cobranças: sem dever de guarda do cadastro' }
  }
  let usuario: Plano['usuario'] = null
  if (p.userId) {
    usuario = p.userRole === 'STUDENT'
      ? { acao: 'ANONIMIZAR', motivo: 'Conta de acesso do titular: identificação removida e acesso encerrado' }
      : { acao: 'MANTER', motivo: 'A conta pertence a um usuário com outro papel na instituição (não é só aluno)' }
  }
  const consentimentosAtivos = await prisma.lgpConsentimento.count({ where: { tenantId: p.tenantId, status: 'ATIVO', titularId: { in: p.todosIds } } })
  const totalAlteracoes = itens.reduce((a, i) => a + i.aplicaveis, 0) + (aluno?.acao === 'ANONIMIZAR' ? 1 : 0) + (usuario?.acao === 'ANONIMIZAR' ? 1 : 0)
  const totalMantidos = itens.reduce((a, i) => a + i.retidos + (i.acaoPlanejada === 'MANTER' ? i.registros - i.retidos : 0), 0) + (aluno?.acao === 'MANTER' ? 1 : 0)
  return { titular: { tipo: p.tipo, id: p.id }, modo, itens, aluno, usuario, consentimentosAtivos, totalAlteracoes, totalMantidos, excecaoArt16: TEXTO_ART16 }
}

export interface ResultadoExecucao {
  executadoEm: string
  consentimentosRevogados: number
  itens: Array<{ model: string; acao: AcaoEntidade; afetados: number }>
  aluno: string | null
  usuario: string | null
  mantidos: Array<{ model: string; registros: number; fundamento: string | null }>
}

export async function executar(p: Pessoa, plano: Plano, ctx: { userId?: string; excluirSolicitacaoId?: string }): Promise<ResultadoExecucao> {
  // 1) consentimentos e opt-out de marketing PRIMEIRO (fora da transação: tem upserts em outras tabelas, idempotentes)
  const revogados = await revogarConsentimentosPessoa(p, 'Anonimização/eliminação solicitada pelo titular (LGPD art. 18)', ctx.userId)

  const ops: any[] = []
  const rotulos: Array<{ model: string; acao: AcaoEntidade; i: number }> = []
  for (const item of plano.itens) {
    if (item.acaoPlanejada === 'MANTER' || item.aplicaveis === 0) continue
    const e = CATALOGO.find((x) => x.model === item.model)!
    let where = whereDaEntidade(e, p)
    if (!where) continue
    if (e.model === 'lgpSolicitacao' && ctx.excluirSolicitacaoId) where = { AND: [where, { id: { not: ctx.excluirSolicitacaoId } }] }
    if (e.minMeses && temCampo(e.model, 'createdAt')) where = { AND: [where, { createdAt: { lt: corte(e.minMeses) } }] }
    const d = (prisma as any)[e.model]
    rotulos.push({ model: e.model, acao: item.acaoPlanejada, i: ops.length })
    ops.push(item.acaoPlanejada === 'ELIMINAR' ? d.deleteMany({ where }) : d.updateMany({ where, data: valoresDe(e.campos ?? {}) }))
  }

  let alunoRes: string | null = null
  if (p.studentId && plano.aluno?.acao === 'ANONIMIZAR') {
    ops.push(prisma.student.updateMany({ where: { id: p.studentId, tenantId: p.tenantId }, data: { nomeCompleto: ANON, cpf: null, dataNascimento: null } }))
    alunoRes = 'ANONIMIZADO'
  } else if (p.studentId) alunoRes = 'MANTIDO_ART16'

  let usuarioRes: string | null = null
  if (p.userId && plano.usuario?.acao === 'ANONIMIZAR') {
    ops.push(prisma.user.updateMany({ where: { id: p.userId, tenantId: p.tenantId }, data: { email: `anon-${p.userId}@anonimizado.invalid`, firstName: 'Titular', lastName: 'Anonimizado', phone: null, avatar: null, isActive: false, password: 'x!' + randomBytes(24).toString('hex') } }))
    ops.push(prisma.refreshToken.deleteMany({ where: { userId: p.userId } }))
    ops.push(prisma.passwordResetToken.deleteMany({ where: { userId: p.userId } }))
    ops.push(prisma.segDoisFatores.deleteMany({ where: { userId: p.userId } }))
    usuarioRes = 'ANONIMIZADO_E_ACESSO_ENCERRADO'
  } else if (p.userId) usuarioRes = 'MANTIDO'

  const rs = await prisma.$transaction(ops)
  const itens = rotulos.map((r) => ({ model: r.model, acao: r.acao, afetados: Number((rs[r.i] as any)?.count ?? 0) }))
  const mantidos = plano.itens.filter((i) => i.acaoPlanejada === 'MANTER').map((i) => ({ model: i.model, registros: i.registros, fundamento: i.motivo }))
  return { executadoEm: new Date().toISOString(), consentimentosRevogados: revogados, itens, aluno: alunoRes, usuario: usuarioRes, mantidos }
}
