import { prisma } from '../../lib/prisma'
import { decryptSecret } from '../../services/secretVault'
import { audit } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { comentariosGraph, metricasPostGraph, publicarGraph, seguidoresGraph } from './adapters'
import { triarTexto, validarPostParaRede } from './pure'

const AUTO = ['FACEBOOK', 'INSTAGRAM']

export function tokenDaConta(conta: { tokenCifrado: string | null }): string | null {
  if (!conta.tokenCifrado) return null
  try {
    return decryptSecret<{ accessToken: string }>(conta.tokenCifrado)?.accessToken ?? null
  } catch {
    return null
  }
}

// Publica um post APROVADO. Com token + rede suportada -> Graph API; senão marca MANUAL
// e cria lembrete para o marketing publicar à mão. Nunca finge publicação.
export async function publicarPost(tenantId: string, postId: string) {
  const post = await prisma.comSocialPost.findFirst({ where: { id: postId, tenantId }, include: { conta: true } })
  if (!post) throw Object.assign(new Error('Post não encontrado.'), { status: 404 })
  if (post.status !== 'APROVADO' && post.status !== 'FALHA') throw Object.assign(new Error(`Post em status ${post.status} não pode ser publicado.`), { status: 409 })
  const erros = validarPostParaRede(post.conta.rede, post.texto, post.midiaUrls)
  if (erros.length) {
    return prisma.comSocialPost.update({ where: { id: post.id }, data: { status: 'FALHA', erro: erros.join(' ') } })
  }
  const token = tokenDaConta(post.conta)
  if (!AUTO.includes(post.conta.rede) || !token || !post.conta.externalId) {
    const motivo = !AUTO.includes(post.conta.rede) ? `Publicação automática não suportada para ${post.conta.rede}.` : 'Conta sem token/ID da página: conectar via Graph API para publicar automaticamente.'
    await scheduleReminder({ tenantId, modulo: 'comunicacao', titulo: `Publicar manualmente em ${post.conta.rede}: ${post.titulo}`, descricao: motivo, dueAt: post.agendadoPara ?? new Date(), remindAt: new Date(), refType: 'ComSocialPost', refId: post.id, assigneeRole: 'MARKETING', severity: 'ATENCAO', dedupeKey: `com-post-manual-${post.id}` })
    return prisma.comSocialPost.update({ where: { id: post.id }, data: { status: 'MANUAL', erro: motivo } })
  }
  const r = await publicarGraph(post.conta.rede, post.conta.externalId, token, post.texto, post.midiaUrls)
  if (r.ok) {
    await completeReminders({ tenantId, refType: 'ComSocialPost', refId: post.id })
    await audit({ tenantId, modulo: 'comunicacao', acao: 'POST_PUBLICADO', refType: 'ComSocialPost', refId: post.id })
    return prisma.comSocialPost.update({ where: { id: post.id }, data: { status: 'PUBLICADO', publicadoEm: new Date(), externalId: r.id, erro: null, tentativas: { increment: 1 } } })
  }
  const tent = post.tentativas + 1
  // erros transitórios: volta para APROVADO e reagenda; esgotadas 3 tentativas -> FALHA
  if (r.retryable && tent < 3) {
    return prisma.comSocialPost.update({ where: { id: post.id }, data: { status: 'APROVADO', tentativas: tent, erro: r.erro, agendadoPara: new Date(Date.now() + tent * 10 * 60_000) } })
  }
  await scheduleReminder({ tenantId, modulo: 'comunicacao', titulo: `Falha ao publicar em ${post.conta.rede}: ${post.titulo}`, descricao: r.erro, dueAt: new Date(), remindAt: new Date(), refType: 'ComSocialPost', refId: post.id, assigneeRole: 'MARKETING', severity: 'CRITICO', dedupeKey: `com-post-falha-${post.id}` })
  return prisma.comSocialPost.update({ where: { id: post.id }, data: { status: 'FALHA', tentativas: tent, erro: r.erro } })
}

export async function jobSocial() {
  const posts = await prisma.comSocialPost.findMany({ where: { status: 'APROVADO', agendadoPara: { lte: new Date() } }, orderBy: { agendadoPara: 'asc' }, take: 50 })
  const r = { avaliados: posts.length, publicados: 0, manuais: 0, falhas: 0 }
  for (const p of posts) {
    try {
      const u = await publicarPost(p.tenantId, p.id)
      if (u.status === 'PUBLICADO') r.publicados++
      else if (u.status === 'MANUAL') r.manuais++
      else if (u.status === 'FALHA') r.falhas++
    } catch (e) {
      console.error('[com-social]', p.id, e)
    }
  }
  return r
}

// Importa seguidores, métricas dos posts publicados e comentários novos (para moderação).
export async function sincronizarConta(tenantId: string, contaId: string) {
  const conta = await prisma.comSocialConta.findFirst({ where: { id: contaId, tenantId } })
  if (!conta) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 })
  const token = tokenDaConta(conta)
  if (!AUTO.includes(conta.rede) || !token || !conta.externalId) throw Object.assign(new Error('Conta sem token/ID da página ou rede sem API automática: registre as métricas manualmente.'), { status: 409 })
  const res = { seguidores: undefined as number | undefined, metricas: 0, comentariosNovos: 0, erros: [] as string[] }
  res.seguidores = await seguidoresGraph(conta.rede, conta.externalId, token)
  if (res.seguidores !== undefined) await prisma.comSocialConta.update({ where: { id: conta.id }, data: { seguidores: res.seguidores } })
  const posts = await prisma.comSocialPost.findMany({ where: { tenantId, contaId, status: 'PUBLICADO', externalId: { not: null }, publicadoEm: { gte: new Date(Date.now() - 60 * 86_400_000) } }, take: 30 })
  for (const p of posts) {
    const m = await metricasPostGraph(conta.rede, p.externalId!, token)
    if (m.ok) {
      await prisma.comSocialMetrica.create({ data: { tenantId, contaId, postId: p.id, curtidas: m.dados.curtidas, comentarios: m.dados.comentarios, compartilhamentos: m.dados.compartilhamentos, seguidores: res.seguidores, origem: 'GRAPH_API' } })
      res.metricas++
    } else res.erros.push(`${p.id}: ${m.erro}`)
    const cs = await comentariosGraph(conta.rede, p.externalId!, token)
    if (cs.ok) {
      for (const c of cs.dados as Array<{ externalId: string; texto: string; autor?: string }>) {
        const ja = await prisma.comSocialInteracao.findFirst({ where: { tenantId, contaId, externalId: c.externalId }, select: { id: true } })
        if (ja) continue
        const tri = triarTexto(c.texto)
        await prisma.comSocialInteracao.create({ data: { tenantId, contaId, postId: p.id, tipo: 'COMENTARIO', autor: c.autor, texto: c.texto, externalId: c.externalId, status: tri.spam ? 'SPAM' : 'PENDENTE', alerta: tri.alerta ?? (tri.spam ? 'spam' : undefined) } })
        res.comentariosNovos++
        if (tri.alerta) await scheduleReminder({ tenantId, modulo: 'comunicacao', titulo: `Comentário sensível em ${conta.rede} (${tri.alerta})`, descricao: c.texto.slice(0, 200), dueAt: new Date(Date.now() + 4 * 3600_000), remindAt: new Date(), refType: 'ComSocialInteracao', refId: c.externalId, assigneeRole: 'MARKETING', severity: 'ATENCAO', dedupeKey: `com-int-${c.externalId}` })
      }
    }
  }
  await prisma.comSocialConta.update({ where: { id: conta.id }, data: { ultimaSincEm: new Date() } })
  return res
}
