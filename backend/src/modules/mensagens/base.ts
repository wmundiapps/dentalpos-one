import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { notify } from '../core/notify'
import { AuthenticatedRequest, MOD, fail, isSuper, nomesUsuarios, tid, uid } from './common'
import { ContextoRef, ROTULO_CONTEXTO, TIPOS_CONTEXTO, TipoContexto, linkContexto, textoNotificacao } from './logic'

// ============================================================
// Primitivas do Mensageiro: criação de canais de departamento, acesso por canal, participantes, inserção de mensagem,
// contagem de não lidas e notificações (sem conteúdo: ver textoNotificacao).
// ============================================================

/** Canal acessível a qualquer usuário da equipe? (departamento/grupo aberto). Conversa direta e canal restrito: só membros. */
export const canalAberto = (c: { tipo: string; restrito: boolean }) => c.tipo !== 'DIRETA' && !c.restrito

/** Cria o canal de departamento de cada setor ativo do atendimento que ainda não tem um (idempotente). */
export async function garantirCanais(tenantId: string, porUserId?: string) {
  const { garantirPadroes } = await import('../atendimento/bootstrap')
  await garantirPadroes(tenantId)
  const [setores, existentes] = await Promise.all([
    prisma.atdSetor.findMany({ where: { tenantId, ativo: true }, select: { id: true, nome: true, descricao: true } }),
    prisma.msgCanal.findMany({ where: { tenantId, tipo: 'DEPARTAMENTO' }, select: { setorId: true } }),
  ])
  const tem = new Set(existentes.map((e) => e.setorId))
  const novos = setores.filter((s) => !tem.has(s.id))
  for (const s of novos) {
    const c = await prisma.msgCanal.create({ data: { tenantId, tipo: 'DEPARTAMENTO', nome: s.nome, descricao: s.descricao ?? `Canal do departamento ${s.nome}`, setorId: s.id, criadoPorId: porUserId } })
    await prisma.msgAuto.create({ data: { tenantId, canalId: c.id } })
    await sincronizarMembrosDoSetor(tenantId, c.id)
  }
  return novos.length
}

/** Traz para o canal do departamento os integrantes do setor (AtdSetorMembro), sem remover quem entrou por outro caminho. */
export async function sincronizarMembrosDoSetor(tenantId: string, canalId: string) {
  const canal = await prisma.msgCanal.findFirst({ where: { id: canalId, tenantId } })
  if (!canal?.setorId) return 0
  const ms = await prisma.atdSetorMembro.findMany({ where: { tenantId, setorId: canal.setorId, ativo: true }, select: { userId: true } })
  if (!ms.length) return 0
  const r = await prisma.msgMembro.createMany({ data: ms.map((m) => ({ tenantId, canalId, userId: m.userId, origem: 'SETOR' })), skipDuplicates: true })
  // quem já estava no canal por outro caminho (entrou, foi mencionado) e é do setor passa a ser integrante do departamento
  await prisma.msgMembro.updateMany({ where: { canalId, userId: { in: ms.map((m) => m.userId) }, origem: { not: 'SETOR' } }, data: { origem: 'SETOR' } })
  return r.count
}

/** Mantém as participações do usuário coerentes com os setores a que pertence (entra/sai conforme AtdSetorMembro). */
export async function sincronizarUsuario(tenantId: string, userId: string) {
  const meus = await prisma.atdSetorMembro.findMany({ where: { tenantId, userId, ativo: true }, select: { setorId: true } })
  const setorIds = meus.map((m) => m.setorId)
  const canais = await prisma.msgCanal.findMany({ where: { tenantId, tipo: 'DEPARTAMENTO', setorId: { in: setorIds } }, select: { id: true } })
  if (canais.length) {
    await prisma.msgMembro.createMany({ data: canais.map((c) => ({ tenantId, canalId: c.id, userId, origem: 'SETOR' })), skipDuplicates: true })
    await prisma.msgMembro.updateMany({ where: { tenantId, userId, canalId: { in: canais.map((c) => c.id) }, origem: { not: 'SETOR' } }, data: { origem: 'SETOR' } })
  }
  await prisma.msgMembro.deleteMany({ where: { tenantId, userId, origem: 'SETOR', canal: { setorId: { notIn: setorIds.length ? setorIds : ['-'] } } } })
}

/** Usuários do setor (live) — destinatários de menções ao departamento e de pedidos de atendimento humano. */
export async function usuariosDoSetor(tenantId: string, setorId: string | null | undefined): Promise<string[]> {
  if (!setorId) return []
  const ms = await prisma.atdSetorMembro.findMany({ where: { tenantId, setorId, ativo: true }, select: { userId: true } })
  return ms.map((m) => m.userId)
}

export interface Acesso { canal: Awaited<ReturnType<typeof carregarCanalBruto>>; membro: { id: string; papel: string; origem: string; ultimaLeituraEm: Date; silenciado: boolean; fixado: boolean } | null; admin: boolean }
async function carregarCanalBruto(tenantId: string, id: string) {
  return prisma.msgCanal.findFirst({ where: { id, tenantId } })
}

/** Resolve o canal e verifica se o usuário pode ler. 404 também quando o canal existe mas é privado (não revela existência). */
export async function acessoCanal(req: AuthenticatedRequest, canalId: string, opts: { exigirMembro?: boolean } = {}): Promise<Acesso & { canal: NonNullable<Acesso['canal']> }> {
  const tenantId = tid(req), userId = uid(req)
  const canal = await carregarCanalBruto(tenantId, canalId)
  if (!canal) fail(404, 'Conversa não encontrada.')
  const membro = await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId, userId } }, select: { id: true, papel: true, origem: true, ultimaLeituraEm: true, silenciado: true, fixado: true } })
  if (!membro && !canalAberto(canal)) fail(404, 'Conversa não encontrada.')
  if (!membro && opts.exigirMembro) fail(403, 'Entre na conversa para participar.')
  const admin = membro?.papel === 'ADMIN' || (canal.tipo !== 'DIRETA' && isSuper(req) && !canal.restrito)
  return { canal, membro, admin }
}

/** Entra no canal aberto (cria a participação). Idempotente. */
export async function garantirMembro(tenantId: string, canalId: string, userId: string, origem = 'ENTROU', papel = 'MEMBRO') {
  const ex = await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId, userId } } })
  if (ex) return ex
  return prisma.msgMembro.create({ data: { tenantId, canalId, userId, origem, papel } })
}

/** O usuário pertence ao departamento do canal (é do setor, ou administra o canal)? Quem é "de casa" não aciona a resposta automática. */
export async function pertenceAoDepartamento(tenantId: string, canal: { id: string; setorId: string | null }, userId: string) {
  if (canal.setorId && (await prisma.atdSetorMembro.count({ where: { tenantId, setorId: canal.setorId, userId, ativo: true } }))) return true
  return !!(await prisma.msgMembro.count({ where: { canalId: canal.id, userId, OR: [{ papel: 'ADMIN' }, { origem: 'SETOR' }] } }))
}

// ------------------------------------------------------------ não lidas
export interface ContagemCanal { canalId: string; naoLidas: number; mencoes: number }
export async function contarNaoLidas(tenantId: string, userId: string, canalIds?: string[]): Promise<ContagemCanal[]> {
  const filtro = canalIds ? Prisma.sql`AND m."canalId" IN (${Prisma.join(canalIds.length ? canalIds : ['-'])})` : Prisma.empty
  const rows = await prisma.$queryRaw<Array<{ canalId: string; n: number; men: number }>>`
    SELECT m."canalId" AS "canalId", COUNT(*)::int AS n, COUNT(*) FILTER (WHERE ${userId} = ANY(m."mencoesUsuarios"))::int AS men
    FROM "MsgMensagem" m JOIN "MsgMembro" b ON b."canalId" = m."canalId" AND b."userId" = ${userId}
    WHERE m."tenantId" = ${tenantId} AND m."createdAt" > b."ultimaLeituraEm" AND m."removidaEm" IS NULL AND (m."autorId" IS NULL OR m."autorId" <> ${userId}) ${filtro}
    GROUP BY m."canalId"`
  return rows.map((r) => ({ canalId: r.canalId, naoLidas: r.n, mencoes: r.men }))
}

// ------------------------------------------------------------ notificações (sem conteúdo)
export async function notificarUsuarios(tenantId: string, userIds: string[], tipo: Parameters<typeof textoNotificacao>[0], canal: { id: string; tipo: string; nome: string }, extra: { refType?: string; refId?: string } = {}) {
  const alvo = [...new Set(userIds)].slice(0, 200)
  if (!alvo.length) return 0
  const t = textoNotificacao(tipo, canal.tipo, canal.nome)
  for (const userId of alvo) await notify({ tenantId, canal: 'IN_APP', userId, assunto: t.assunto, mensagem: t.mensagem, templateKey: `mensagens.${tipo.toLowerCase()}`, refType: extra.refType ?? 'MsgCanal', refId: extra.refId ?? canal.id })
  return alvo.length
}

// ------------------------------------------------------------ contexto (vínculo com registros do sistema)
// Perfis que podem vincular registros com dados de alunos/financeiro/atendimento a uma conversa (os demais só conversam).
const VINCULA = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'SUPPORT', 'SECRETARY', 'ADMISSIONS', 'FINANCE', 'COORDINATOR', 'STAFF', 'LEGAL']
export const podeVincular = (role?: string) => VINCULA.includes(String(role ?? '').toUpperCase())

export async function resolverContexto(tenantId: string, ref: ContextoRef, role?: string): Promise<{ tipo: TipoContexto; id: string; rotulo: string; link: string }> {
  if (!TIPOS_CONTEXTO.includes(ref.tipo)) fail(400, `Tipo de contexto inválido (use ${TIPOS_CONTEXTO.join(', ')}).`)
  if (role !== undefined && !podeVincular(role)) fail(403, 'Seu perfil não vincula registros do sistema a conversas.')
  const id = String(ref.id)
  let rotulo: string | null = null
  switch (ref.tipo) {
    case 'PROTOCOLO': { const r = await prisma.atdProtocolo.findFirst({ where: { id, tenantId }, select: { numero: true, servicoNome: true } }); if (r) rotulo = `Protocolo ${r.numero} · ${r.servicoNome}`; break }
    case 'ATENDIMENTO': { const r = await prisma.atdAtendimento.findFirst({ where: { id, tenantId }, select: { numero: true, canal: true } }); if (r) rotulo = `Atendimento ${r.numero}`; break }
    case 'ALUNO': { const r = await prisma.student.findFirst({ where: { id, tenantId }, select: { nomeCompleto: true, ra: true } }); if (r) rotulo = `Aluno ${r.nomeCompleto} (RA ${r.ra})`; break }
    case 'DOCUMENTO': { const r = await prisma.atdDocumentoEmitido.findFirst({ where: { id, tenantId }, select: { numero: true, titulo: true } }); if (r) rotulo = `Documento ${r.numero} · ${r.titulo}`; break }
    case 'TITULO': { const r = await prisma.accountReceivable.findFirst({ where: { id, tenantId }, select: { descricao: true, numeroParcela: true } }); if (r) rotulo = `Título: ${r.descricao}${r.numeroParcela ? ` (parcela ${r.numeroParcela})` : ''}`; break }
  }
  if (!rotulo) fail(400, `${ROTULO_CONTEXTO[ref.tipo]} não encontrado(a) nesta instituição.`)
  return { tipo: ref.tipo, id, rotulo: rotulo.slice(0, 200), link: linkContexto(ref.tipo, id) }
}

export const REF = 'MsgCanal'
export { MOD, nomesUsuarios }

/** Busca registros para o seletor de vínculo (rótulos mínimos; sem CPF, contato ou valores). */
export async function buscarContexto(tenantId: string, tipo: TipoContexto, q: string): Promise<Array<{ id: string; rotulo: string }>> {
  const c = (campo: string) => ({ [campo]: { contains: q, mode: 'insensitive' as const } })
  switch (tipo) {
    case 'PROTOCOLO': return (await prisma.atdProtocolo.findMany({ where: { tenantId, ...(q ? { OR: [c('numero'), c('assunto'), c('solicitanteNome'), c('servicoNome')] } : {}) }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, numero: true, servicoNome: true } })).map((r) => ({ id: r.id, rotulo: `Protocolo ${r.numero} · ${r.servicoNome}` }))
    case 'ATENDIMENTO': return (await prisma.atdAtendimento.findMany({ where: { tenantId, ...(q ? { OR: [c('numero'), c('assunto'), c('solicitanteNome')] } : {}) }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, numero: true, assunto: true } })).map((r) => ({ id: r.id, rotulo: `Atendimento ${r.numero} · ${r.assunto.slice(0, 60)}` }))
    case 'ALUNO': return (await prisma.student.findMany({ where: { tenantId, ...(q ? { OR: [c('nomeCompleto'), c('ra')] } : {}) }, orderBy: { nomeCompleto: 'asc' }, take: 15, select: { id: true, nomeCompleto: true, ra: true } })).map((r) => ({ id: r.id, rotulo: `Aluno ${r.nomeCompleto} (RA ${r.ra})` }))
    case 'DOCUMENTO': return (await prisma.atdDocumentoEmitido.findMany({ where: { tenantId, ...(q ? { OR: [c('numero'), c('destinatarioNome'), c('titulo')] } : {}) }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, numero: true, titulo: true } })).map((r) => ({ id: r.id, rotulo: `Documento ${r.numero} · ${r.titulo}` }))
    case 'TITULO': return (await prisma.accountReceivable.findMany({ where: { tenantId, ...(q ? c('descricao') : {}) }, orderBy: { dataVencimento: 'desc' }, take: 15, select: { id: true, descricao: true, numeroParcela: true } })).map((r) => ({ id: r.id, rotulo: `Título: ${r.descricao}${r.numeroParcela ? ` (parcela ${r.numeroParcela})` : ''}` }))
  }
}
