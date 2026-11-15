import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { AuthenticatedRequest, MOD, fail, getConfig, nomesUsuarios, tid, uid } from './common'
import { Acesso, acessoCanal, canalAberto, contarNaoLidas, garantirMembro, notificarUsuarios, pertenceAoDepartamento, resolverContexto, sincronizarMembrosDoSetor, sincronizarUsuario, usuariosDoSetor } from './base'
import { ResultadoAuto, encerrarPedidos, processarAutoResposta } from './auto'
import { ContextoRef, MAX_ANEXOS, limparTexto, mencoesDeSetores } from './logic'

// ============================================================
// Núcleo do Mensageiro: listagem de conversas, serialização de mensagens e postagem (menções, anexos, contexto,
// notificações sem conteúdo e resposta automática do departamento).
// ============================================================

export interface AnexoIn { nome: string; mime?: string; dataUrl?: string; url?: string }
export interface MensagemIn { texto?: string; anexos?: AnexoIn[]; respostaAId?: string; mencoesUsuarios?: string[]; mencoesSetores?: string[]; contexto?: ContextoRef; tipo?: string; metadados?: Record<string, unknown> }

const prev = (t: string, n = 110) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }

// ------------------------------------------------------------ conversas
export async function listarConversas(req: AuthenticatedRequest, escopo: 'meus' | 'diretorio' | 'todos', filtro: { q?: string; tipo?: string; contextoTipo?: string; contextoId?: string; arquivados?: boolean } = {}) {
  const tenantId = tid(req), userId = uid(req)
  await sincronizarUsuario(tenantId, userId)
  const meus = await prisma.msgMembro.findMany({ where: { tenantId, userId }, select: { canalId: true, fixado: true, silenciado: true, ultimaLeituraEm: true, papel: true } })
  const meuPorCanal = new Map(meus.map((m) => [m.canalId, m]))
  const meusIds = meus.map((m) => m.canalId)
  const abertos = { tipo: { in: ['DEPARTAMENTO', 'GRUPO'] }, restrito: false }
  const and: any[] = []
  if (filtro.q) and.push({ OR: [{ nome: { contains: filtro.q, mode: 'insensitive' } }, { descricao: { contains: filtro.q, mode: 'insensitive' } }, { contextoRotulo: { contains: filtro.q, mode: 'insensitive' } }] })
  if (escopo === 'meus') and.push({ id: { in: meusIds } })
  else if (escopo === 'diretorio') and.push({ ...abertos, id: { notIn: meusIds } })
  else and.push({ OR: [{ id: { in: meusIds } }, abertos] })
  const where: any = { tenantId, arquivado: !!filtro.arquivados, ...(filtro.tipo ? { tipo: filtro.tipo } : {}), ...(filtro.contextoTipo ? { contextoTipo: filtro.contextoTipo } : {}), ...(filtro.contextoId ? { contextoId: filtro.contextoId } : {}), AND: and }
  const canais = await prisma.msgCanal.findMany({ where, orderBy: [{ ultimaMensagemEm: { sort: 'desc', nulls: 'last' } }, { nome: 'asc' }], take: 300, include: { _count: { select: { membros: true } }, auto: { select: { ativa: true } } } })
  const ids = canais.map((c) => c.id)
  const [cont, ultimas, outros, setores] = await Promise.all([
    contarNaoLidas(tenantId, userId, ids),
    (ids.length ? prisma.$queryRaw<Array<{ canalId: string; id: string; autorId: string | null; conteudo: string; tipo: string; createdAt: Date; removidaEm: Date | null }>>`
      SELECT DISTINCT ON ("canalId") "canalId", id, "autorId", conteudo, tipo, "createdAt", "removidaEm" FROM "MsgMensagem" WHERE "tenantId" = ${tenantId} AND "canalId" = ANY(${ids}) ORDER BY "canalId", "createdAt" DESC` : Promise.resolve([] as Array<{ canalId: string; id: string; autorId: string | null; conteudo: string; tipo: string; createdAt: Date; removidaEm: Date | null }>)),
    prisma.msgMembro.findMany({ where: { tenantId, canalId: { in: canais.filter((c) => c.tipo === 'DIRETA').map((c) => c.id) }, userId: { not: userId } }, select: { canalId: true, userId: true } }),
    prisma.atdSetor.findMany({ where: { tenantId, id: { in: canais.map((c) => c.setorId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true, nome: true } }),
  ])
  const contPorCanal = new Map(cont.map((c) => [c.canalId, c]))
  const ultPorCanal = new Map(ultimas.map((u) => [u.canalId, u] as const))
  const outroPorCanal = new Map(outros.map((o) => [o.canalId, o.userId]))
  const nomes = await nomesUsuarios(tenantId, [...outros.map((o) => o.userId), ...ultimas.map((u) => u.autorId)])
  const setorPorId = new Map(setores.map((s) => [s.id, s]))
  const itens = canais.map((c) => {
    const eu = meuPorCanal.get(c.id)
    const u = ultPorCanal.get(c.id)
    const outro = outroPorCanal.get(c.id)
    const ct = contPorCanal.get(c.id)
    return {
      id: c.id, tipo: c.tipo, nome: c.tipo === 'DIRETA' ? (outro ? nomes[outro]?.nome ?? 'Usuário' : 'Conversa direta') : c.nome, descricao: c.descricao, restrito: c.restrito, arquivado: c.arquivado,
      setor: c.setorId ? setorPorId.get(c.setorId) ?? null : null, outro: outro ? { id: outro, ...nomes[outro] } : null, participante: !!eu, fixado: !!eu?.fixado, silenciado: !!eu?.silenciado,
      naoLidas: ct?.naoLidas ?? 0, mencoesNaoLidas: ct?.mencoes ?? 0, membros: c._count.membros, respostaAutomatica: !!c.auto?.ativa,
      contexto: c.contextoTipo ? { tipo: c.contextoTipo, id: c.contextoId, rotulo: c.contextoRotulo, link: c.contextoLink } : null,
      ultimaMensagemEm: c.ultimaMensagemEm, versao: c.updatedAt,
      ultimaMensagem: u ? { autor: u.autorId ? nomes[u.autorId]?.nome ?? null : 'Automático', tipo: u.tipo, trecho: u.removidaEm ? 'Mensagem removida' : prev(u.conteudo) } : null,
    }
  })
  itens.sort((a, b) => Number(b.fixado) - Number(a.fixado) || (new Date(b.ultimaMensagemEm ?? 0).getTime() - new Date(a.ultimaMensagemEm ?? 0).getTime()))
  return itens
}

// ------------------------------------------------------------ mensagens
export async function serializarMensagens(tenantId: string, userId: string, canalId: string, msgs: any[]) {
  if (!msgs.length) return []
  const membros = await prisma.msgMembro.findMany({ where: { canalId }, select: { userId: true, ultimaLeituraEm: true } })
  const respIds = [...new Set(msgs.map((m) => m.respostaAId).filter((x): x is string => !!x))]
  const respostas = respIds.length ? await prisma.msgMensagem.findMany({ where: { tenantId, id: { in: respIds } }, select: { id: true, autorId: true, conteudo: true, removidaEm: true } }) : []
  const setorIds = [...new Set(msgs.flatMap((m) => m.mencoesSetores as string[]))]
  const setores = setorIds.length ? await prisma.atdSetor.findMany({ where: { tenantId, id: { in: setorIds } }, select: { id: true, nome: true, codigo: true } }) : []
  const nomes = await nomesUsuarios(tenantId, [...msgs.map((m) => m.autorId), ...msgs.flatMap((m) => m.mencoesUsuarios as string[]), ...respostas.map((r) => r.autorId), ...msgs.map((m) => m.fixadaPorId)])
  const resp = new Map(respostas.map((r) => [r.id, r]))
  return msgs.map((m) => {
    const removida = !!m.removidaEm
    const r = m.respostaAId ? resp.get(m.respostaAId) : null
    const minha = m.autorId === userId
    const outros = membros.filter((x) => x.userId !== m.autorId)
    return {
      id: m.id, canalId: m.canalId, autor: m.autorId ? { id: m.autorId, ...(nomes[m.autorId] ?? { nome: 'Usuário removido', role: '' }) } : null, autorTipo: m.autorTipo, tipo: m.tipo, minha,
      conteudo: removida ? '' : m.conteudo, removida, editada: !!m.editadaEm, editadaEm: m.editadaEm, createdAt: m.createdAt,
      respostaA: r ? { id: r.id, autor: r.autorId ? nomes[r.autorId]?.nome ?? null : 'Automático', trecho: r.removidaEm ? 'Mensagem removida' : prev(r.conteudo, 90) } : null,
      mencoes: { usuarios: (m.mencoesUsuarios as string[]).map((id) => ({ id, nome: nomes[id]?.nome ?? 'Usuário' })), setores: (m.mencoesSetores as string[]).map((id) => ({ id, nome: setores.find((s) => s.id === id)?.nome ?? 'Departamento', codigo: setores.find((s) => s.id === id)?.codigo })) },
      anexos: removida ? [] : (m.anexos ?? []).map((a: any) => ({ id: a.id, nome: a.nome, mime: a.mime, tamanho: a.tamanho, externo: !!a.url && !a.dataUrl })),
      metadados: removida ? null : m.metadados ?? null, fixada: !!m.fixadaEm && !removida, fixadaEm: m.fixadaEm, fixadaPor: m.fixadaPorId ? nomes[m.fixadaPorId]?.nome ?? null : null,
      ...(minha ? { lidaPor: outros.filter((x) => x.ultimaLeituraEm >= m.createdAt).length, totalDestinatarios: outros.length } : {}),
    }
  })
}

export const INCLUDE_MSG = { anexos: { select: { id: true, nome: true, mime: true, tamanho: true, url: true, dataUrl: false as const } } }

// ------------------------------------------------------------ postagem
function validarAnexos(anexos: AnexoIn[], maxKb: number) {
  if (anexos.length > MAX_ANEXOS) fail(400, `No máximo ${MAX_ANEXOS} anexos por mensagem.`)
  return anexos.map((a) => {
    const nome = String(a.nome ?? '').replace(/[\\/\u0000-\u001F]/g, '_').trim().slice(0, 200)
    if (!nome) fail(400, 'Informe o nome do arquivo anexo.')
    if (!a.dataUrl && !a.url) fail(400, `Anexo "${nome}": informe dataUrl (base64) ou url (https).`)
    if (a.url && !/^https:\/\//i.test(a.url)) fail(400, `Anexo "${nome}": url deve usar https.`)
    let tamanho: number | undefined
    let mime = a.mime
    if (a.dataUrl) {
      const m = /^data:([\w.+/-]+);base64,/i.exec(a.dataUrl)
      if (!m) fail(400, `Anexo "${nome}": dataUrl inválido (esperado data:<tipo>;base64,...).`)
      mime = mime || m![1]
      tamanho = Math.floor(((a.dataUrl.length - a.dataUrl.indexOf(',') - 1) * 3) / 4)
      if (tamanho > maxKb * 1024) fail(413, `Anexo "${nome}" acima do limite de ${maxKb} KB.`)
    }
    return { nome, mime: mime?.slice(0, 120), tamanho, dataUrl: a.dataUrl, url: a.url }
  })
}

export async function postarMensagem(req: AuthenticatedRequest, acesso: Acesso & { canal: NonNullable<Acesso['canal']> }, input: MensagemIn) {
  const tenantId = tid(req), userId = uid(req)
  const { canal } = acesso
  if (canal.arquivado) fail(409, 'Conversa arquivada: reabra para enviar mensagens.')
  const texto = limparTexto(input.texto)
  const cfg = await getConfig(tenantId)
  const anexos = validarAnexos(input.anexos ?? [], cfg.anexoMaxKb)
  if (!texto && !anexos.length) fail(400, 'Escreva uma mensagem ou anexe um arquivo.')

  if (canal.tipo === 'DEPARTAMENTO') await sincronizarMembrosDoSetor(tenantId, canal.id)
  let membro = acesso.membro ?? (await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId: canal.id, userId } } }))
  if (!membro) {
    if (!canalAberto(canal)) fail(403, 'Você não participa desta conversa.')
    membro = (await garantirMembro(tenantId, canal.id, userId, 'ENTROU')) as any
  }

  if (input.respostaAId) {
    const r = await prisma.msgMensagem.findFirst({ where: { id: input.respostaAId, tenantId, canalId: canal.id }, select: { id: true } })
    if (!r) fail(400, 'Mensagem respondida não encontrada nesta conversa.')
  }

  // menções
  const ignoradas: Array<{ tipo: string; id: string; motivo: string }> = []
  const idsUsuarios = [...new Set((input.mencoesUsuarios ?? []).map(String))].slice(0, 30)
  const usuarios = idsUsuarios.length ? await prisma.user.findMany({ where: { tenantId, id: { in: idsUsuarios }, isActive: true, role: { not: 'STUDENT' as any } }, select: { id: true } }) : []
  if (usuarios.length !== idsUsuarios.length) fail(400, 'Usuário mencionado não encontrado nesta instituição.')
  const todosSetores = await prisma.atdSetor.findMany({ where: { tenantId, ativo: true }, select: { id: true, codigo: true, nome: true } })
  const doTexto = mencoesDeSetores(texto, todosSetores)
  const idsSetores = [...new Set([...(input.mencoesSetores ?? []).map(String), ...doTexto])].slice(0, 10)
  for (const s of idsSetores) if (!todosSetores.some((x) => x.id === s)) fail(400, 'Departamento mencionado não encontrado nesta instituição.')
  if (idsSetores.length && canal.tipo === 'DIRETA') fail(400, 'Menção a departamento não vale em conversa direta: use o canal do departamento.')

  let contexto: Awaited<ReturnType<typeof resolverContexto>> | null = null
  if (input.contexto) contexto = await resolverContexto(tenantId, input.contexto, String(req.user?.role))

  const metadados: Record<string, unknown> = { ...(input.metadados ?? {}), ...(contexto ? { contexto } : {}) }
  const msg = await prisma.msgMensagem.create({
    data: {
      tenantId, canalId: canal.id, autorId: userId, autorTipo: 'USUARIO', tipo: input.tipo ?? 'TEXTO', conteudo: texto, respostaAId: input.respostaAId, mencoesUsuarios: idsUsuarios, mencoesSetores: idsSetores,
      metadados: Object.keys(metadados).length ? (metadados as any) : undefined,
      anexos: anexos.length ? { create: anexos.map((a) => ({ tenantId, ...a })) } : undefined,
    },
    include: INCLUDE_MSG,
  })
  await prisma.msgCanal.update({ where: { id: canal.id }, data: { ultimaMensagemEm: msg.createdAt } })
  await prisma.msgMembro.updateMany({ where: { canalId: canal.id, userId }, data: { ultimaLeituraEm: msg.createdAt } })
  if (anexos.length) await audit({ tenantId, userId, modulo: MOD, acao: 'ANEXO_ENVIADO', refType: 'MsgMensagem', refId: msg.id, detalhes: { canalId: canal.id, quantidade: anexos.length, tipos: anexos.map((a) => a.mime) } })

  // notificações de menção (sem conteúdo)
  const notificar = new Set<string>()
  for (const u of idsUsuarios) {
    if (u === userId) continue
    const ja = await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId: canal.id, userId: u } } })
    if (ja) notificar.add(u)
    else if (canalAberto(canal)) { await garantirMembro(tenantId, canal.id, u, 'MENCAO'); notificar.add(u) }
    else ignoradas.push({ tipo: 'USUARIO', id: u, motivo: 'Não participa desta conversa privada.' })
  }
  await notificarUsuarios(tenantId, [...notificar], 'MENCAO', canal, { refId: canal.id })
  for (const s of idsSetores) {
    const us = (await usuariosDoSetor(tenantId, s)).filter((x) => x !== userId && !notificar.has(x))
    const aceitos: string[] = []
    for (const u of us) {
      const ja = await prisma.msgMembro.findUnique({ where: { canalId_userId: { canalId: canal.id, userId: u } } })
      if (ja) aceitos.push(u)
      else if (canalAberto(canal)) { await garantirMembro(tenantId, canal.id, u, 'MENCAO'); aceitos.push(u) }
    }
    if (us.length && !aceitos.length) ignoradas.push({ tipo: 'SETOR', id: s, motivo: 'Conversa privada: o departamento não foi adicionado.' })
    await notificarUsuarios(tenantId, aceitos, 'MENCAO_DEPARTAMENTO', canal, { refId: canal.id })
    aceitos.forEach((a) => notificar.add(a))
  }
  if (canal.tipo === 'DIRETA') {
    const antes = await prisma.msgMensagem.count({ where: { canalId: canal.id, id: { not: msg.id } } })
    if (!antes) {
      const outro = await prisma.msgMembro.findFirst({ where: { canalId: canal.id, userId: { not: userId } } })
      if (outro && !notificar.has(outro.userId)) await notificarUsuarios(tenantId, [outro.userId], 'NOVA_DIRETA', canal)
    }
  }

  // quem é do departamento responde a pedidos de "falar com uma pessoa": por resposta direta ou menção ao solicitante
  let auto: ResultadoAuto | null = null
  if (canal.tipo === 'DEPARTAMENTO') {
    try {
      const deCasa = await pertenceAoDepartamento(tenantId, canal, userId)
      if (deCasa) {
        const pend = await prisma.msgPedidoHumano.findMany({ where: { tenantId, canalId: canal.id, status: 'PENDENTE' } })
        const alvo = pend.filter((p) => (input.respostaAId && p.mensagemId === input.respostaAId) || idsUsuarios.includes(p.solicitanteId))
        if (alvo.length) await encerrarPedidos(tenantId, alvo.map((p) => p.id), 'ASSUMIDO', userId)
      } else {
        auto = await processarAutoResposta({ tenantId, canal, mensagemId: msg.id, autorId: userId, texto })
      }
    } catch (e: any) { console.error('[mensagens-auto]', e?.message) }
  }

  const [ser] = await serializarMensagens(tenantId, userId, canal.id, [msg])
  return { mensagem: ser, auto: auto && auto.acao !== 'NENHUMA' ? auto : null, mencoesIgnoradas: ignoradas }
}
