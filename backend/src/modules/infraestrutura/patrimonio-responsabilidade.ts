// Localização (prédio/sala), departamento e RESPONSÁVEL do patrimônio: termo de responsabilidade com aceite,
// transferência com histórico e aceite do novo responsável, e relatório.
import { Router, Response } from 'express'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, pageParams, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { cppNumero, getPolitica } from '../suprimentos/cpp'
import { depreciacaoDoBem, registrarMov } from './patrimonio'
import { nomeLocal, nomesDeUsuarios } from './patrimonio-etiquetas'
import { GESTAO, LEITURA, MODULO, ensureDepartamento, ensureSpace, fail, money } from './util'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const roleOf = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
const ipOf = (req: AuthenticatedRequest) => String((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || '').slice(0, 64)

export function textoTermo(i: { nome: string; descricao: string; tombamento: string; estado: string; local?: string | null; departamento?: string | null; valor: number }): string {
  const brl = i.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return [
    'TERMO DE RESPONSABILIDADE PELA GUARDA DE BEM PATRIMONIAL',
    `Eu, ${i.nome}, declaro ter recebido o bem "${i.descricao}" (tombamento ${i.tombamento}), em estado ${i.estado.toLowerCase()}, valor de aquisição ${brl}${i.local ? `, localizado em ${i.local}` : ''}${i.departamento ? `, vinculado ao departamento ${i.departamento}` : ''}.`,
    'Comprometo-me a: (i) zelar pela guarda, conservação e uso exclusivo em atividades institucionais; (ii) comunicar imediatamente ao setor de patrimônio qualquer dano, extravio, furto ou necessidade de manutenção; (iii) não emprestar, remover das dependências nem transferir o bem sem autorização formal registrada no sistema; (iv) devolvê-lo quando solicitado, na troca de setor ou no meu desligamento.',
    'Estou ciente de que o uso indevido, a perda ou o dano por negligência podem acarretar responsabilização conforme as normas internas e a legislação aplicável.',
  ].join('\n\n')
}

async function contexto(tenantId: string, bem: any, responsavelId: string) {
  const [space, dep, users] = await Promise.all([
    bem.spaceId ? prisma.eduSpace.findFirst({ where: { id: bem.spaceId, tenantId } }) : null,
    bem.departamentoId ? prisma.cppDepartamento.findFirst({ where: { id: bem.departamentoId, tenantId } }) : null,
    nomesDeUsuarios(tenantId, [responsavelId]),
  ])
  return { local: nomeLocal(space), departamento: dep?.nome ?? null, nome: users.get(responsavelId) ?? responsavelId }
}

async function emitirTermo(tx: typeof prisma | any, tenantId: string, bem: any, responsavelId: string, emitidoPorId: string, opt: { aceite?: { ip: string }; transferenciaId?: string } = {}) {
  const c = await contexto(tenantId, bem, responsavelId)
  const numero = await cppNumero(tx, tenantId, 'TR')
  const texto = textoTermo({ nome: c.nome, descricao: bem.descricao, tombamento: bem.tombamento, estado: bem.estado, local: c.local, departamento: c.departamento, valor: bem.valorAquisicao })
  const agora = new Date()
  const base: any = { tenantId, numero, bemId: bem.id, responsavelUserId: responsavelId, departamentoId: bem.departamentoId, spaceId: bem.spaceId, texto, valorBem: bem.valorAquisicao, estadoBem: bem.estado, emitidoPorId, transferenciaId: opt.transferenciaId }
  if (opt.aceite) {
    base.status = 'VIGENTE'; base.aceitoEm = agora; base.aceiteIp = opt.aceite.ip
    base.aceiteHash = createHash('sha256').update(`${numero}|${texto}|${responsavelId}|${agora.toISOString()}`).digest('hex')
  }
  return tx.cppTermoResponsabilidade.create({ data: base })
}

/** Aplica o destino da transferência ao bem, grava o histórico e troca o termo de responsabilidade. */
async function concluirTransferencia(tenantId: string, tr: any, userId: string, ip: string, aceitoPorId?: string) {
  const out = await prisma.$transaction(async (tx) => {
    const claim = await tx.cppTransferencia.updateMany({ where: { id: tr.id, status: 'AGUARDANDO_ACEITE' }, data: { status: 'CONCLUIDA', concluidaEm: new Date(), aceitoPorId: aceitoPorId ?? null, aceitoEm: aceitoPorId ? new Date() : null } })
    if (claim.count === 0) fail(409, 'Transferência já decidida.')
    await tx.$queryRaw`SELECT "id" FROM "InfBem" WHERE "id" = ${tr.bemId} FOR UPDATE`
    const bem = await tx.infBem.findFirst({ where: { id: tr.bemId, tenantId } })
    if (!bem) fail(404, 'Bem não encontrado.')
    if (bem.status === 'BAIXADO') fail(409, 'O bem foi baixado.')
    if (bem.spaceId !== tr.origemSpaceId || bem.departamentoId !== tr.origemDepartamentoId || bem.responsavelUserId !== tr.origemResponsavelId) fail(409, 'A situação do bem mudou desde o pedido de transferência: cancele e refaça.')
    const data: any = {}
    if (tr.destinoSpaceId !== undefined && tr.destinoSpaceId !== null) data.spaceId = tr.destinoSpaceId
    if (tr.destinoDepartamentoId !== undefined && tr.destinoDepartamentoId !== null) data.departamentoId = tr.destinoDepartamentoId
    if (tr.destinoResponsavelId !== undefined && tr.destinoResponsavelId !== null) data.responsavelUserId = tr.destinoResponsavelId
    const novo = await tx.infBem.update({ where: { id: bem.id }, data })
    const mudouLocal = novo.spaceId !== bem.spaceId
    const mudouResp = novo.responsavelUserId !== bem.responsavelUserId
    await tx.infMovimentacaoBem.create({ data: { tenantId, bemId: bem.id, userId, tipo: mudouLocal || !mudouResp ? 'TRANSFERENCIA' : 'MUDANCA_RESPONSAVEL', origemSpaceId: bem.spaceId, destinoSpaceId: novo.spaceId, origemResponsavelId: bem.responsavelUserId, destinoResponsavelId: novo.responsavelUserId, motivo: `${tr.numero}: ${tr.motivo}${novo.departamentoId !== bem.departamentoId ? ` (departamento: ${bem.departamentoId ?? '—'} → ${novo.departamentoId ?? '—'})` : ''}`, documento: tr.documento ?? tr.numero } })
    let termo: any = null
    if (mudouResp) {
      await tx.cppTermoResponsabilidade.updateMany({ where: { tenantId, bemId: bem.id, status: { in: ['VIGENTE', 'PENDENTE_ACEITE'] } }, data: { status: 'ENCERRADO', encerradoEm: new Date(), motivoEncerramento: `Transferência ${tr.numero}` } })
      if (novo.responsavelUserId) termo = await emitirTermo(tx, tenantId, novo, novo.responsavelUserId, userId, { aceite: aceitoPorId ? { ip } : undefined, transferenciaId: tr.id })
    }
    return { bem: novo, termo }
  }, { timeout: 30_000 })
  await completeReminders({ tenantId, refType: 'CppTransferencia', refId: tr.id, userId })
  await audit({ tenantId, userId, modulo: MODULO, acao: 'TRANSFERENCIA_CONCLUIDA', refType: 'InfBem', refId: tr.bemId, detalhes: { numero: tr.numero, aceitoPor: aceitoPorId } })
  return out
}

export function mountResponsabilidade(router: Router) {
  // ---------- Consultas auxiliares ----------
  // Árvore de localização: prédio (bloco) > andar > sala/espaço, com contagem de bens.
  router.get('/localizacoes', requireRole(...LEITURA, 'TEACHER', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [spaces, cont] = await Promise.all([prisma.eduSpace.findMany({ where: { tenantId, ativo: true }, orderBy: [{ bloco: 'asc' }, { andar: 'asc' }, { nome: 'asc' }] }), prisma.infBem.groupBy({ by: ['spaceId'], where: { tenantId, status: { not: 'BAIXADO' } }, _count: true })])
    const n = new Map(cont.map((c) => [c.spaceId, c._count]))
    const predios: Record<string, { predio: string; andares: Record<string, { andar: string; espacos: any[] }>; bens: number }> = {}
    for (const s of spaces) {
      const p = (predios[s.bloco ?? 'Sem prédio'] ??= { predio: s.bloco ?? 'Sem prédio', andares: {}, bens: 0 })
      const a = (p.andares[s.andar ?? '—'] ??= { andar: s.andar ?? '—', espacos: [] })
      const q = n.get(s.id) ?? 0
      a.espacos.push({ id: s.id, codigo: s.codigo, nome: s.nome, tipo: s.tipo, bens: q })
      p.bens += q
    }
    res.json({ predios: Object.values(predios).map((p) => ({ ...p, andares: Object.values(p.andares) })), semLocalizacao: n.get(null) ?? 0 })
  }))

  // Busca de usuários da instituição para escolher o responsável (sem alunos).
  router.get('/usuarios-responsaveis', requireRole(...GESTAO, ...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const q = qs(req.query.q)
    const us = await prisma.user.findMany({ where: { tenantId, role: { not: 'STUDENT' as any }, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, firstName: true, lastName: true, email: true, role: true }, take: 50, orderBy: { firstName: 'asc' } })
    res.json({ items: us.map((u) => ({ id: u.id, nome: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email, email: u.email, role: u.role })) })
  }))

  // ---------- Termos de responsabilidade ----------
  router.post('/bens/:id/termos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ responsavelUserId: z.string().optional() }), req.body ?? {})
    const bem = await prisma.infBem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
    if (bem.status === 'BAIXADO') fail(409, 'Bem baixado não recebe termo de responsabilidade.')
    const resp = d.responsavelUserId ?? bem.responsavelUserId
    if (!resp) fail(400, 'O bem não tem responsável: informe responsavelUserId ou transfira o bem antes.')
    if (resp !== bem.responsavelUserId) fail(409, 'O termo deve ser do responsável atual do bem; para trocar de responsável use a transferência.')
    if (!(await prisma.user.findFirst({ where: { id: resp, tenantId }, select: { id: true } }))) fail(404, 'Responsável (usuário) não encontrado.')
    const aberto = await prisma.cppTermoResponsabilidade.findFirst({ where: { tenantId, bemId: bem.id, responsavelUserId: resp, status: { in: ['PENDENTE_ACEITE', 'VIGENTE'] } } })
    if (aberto) fail(409, `Já existe o termo ${aberto.numero} (${aberto.status}) para este bem e responsável.`)
    const termo = await prisma.$transaction((tx) => emitirTermo(tx, tenantId, bem, resp, getUserId(req)))
    await notify({ tenantId, userId: resp, assunto: `Termo de responsabilidade ${termo.numero}`, mensagem: `Você é responsável pelo bem ${bem.tombamento} — ${bem.descricao}. Leia e registre o aceite do termo.`, refType: 'CppTermoResponsabilidade', refId: termo.id })
    await scheduleReminder({ tenantId, modulo: MODULO, refType: 'CppTermoResponsabilidade', refId: termo.id, dedupeKey: `cpp-termo-${termo.id}`, titulo: `Aceitar termo de responsabilidade ${termo.numero} (${bem.tombamento})`, dueAt: new Date(Date.now() + 7 * 86_400_000), assigneeUserId: resp, severity: 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'TERMO_EMITIDO', refType: 'InfBem', refId: bem.id, detalhes: { numero: termo.numero, responsavel: resp } })
    res.status(201).json(termo)
  }))

  router.get('/termos', requireRole(...LEITURA, 'TEACHER', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'bemId', 'responsavelUserId', 'departamentoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const gestor = [...SUPER, ...GESTAO, ...LEITURA].includes(roleOf(req) as any)
    if (!gestor || qs(req.query.meus) === 'true') where.responsavelUserId = getUserId(req)
    const [rows, total] = await Promise.all([prisma.cppTermoResponsabilidade.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cppTermoResponsabilidade.count({ where })])
    const [bens, users] = await Promise.all([prisma.infBem.findMany({ where: { tenantId, id: { in: rows.map((r) => r.bemId) } }, select: { id: true, tombamento: true, descricao: true, responsavelUserId: true } }), nomesDeUsuarios(tenantId, rows.map((r) => r.responsavelUserId))])
    res.json({ items: rows.map((r) => { const b = bens.find((x) => x.id === r.bemId); return { ...r, bem: b ? { tombamento: b.tombamento, descricao: b.descricao } : null, responsavel: users.get(r.responsavelUserId) ?? null, desatualizado: r.status === 'VIGENTE' && !!b && b.responsavelUserId !== r.responsavelUserId } }), total, page, pageSize })
  }))

  async function termoDoUsuario(req: AuthenticatedRequest, id: string, somenteDono: boolean) {
    const tenantId = getTenantId(req)
    const t = await prisma.cppTermoResponsabilidade.findFirst({ where: { id, tenantId } })
    if (!t) throw Object.assign(new Error('Termo não encontrado.'), { status: 404 })
    const gestor = [...SUPER, ...GESTAO, ...LEITURA].includes(roleOf(req) as any)
    if ((somenteDono || !gestor) && t.responsavelUserId !== getUserId(req)) throw Object.assign(new Error('Somente o responsável pelo termo pode fazer isto.'), { status: 403 })
    return t
  }

  router.get('/termos/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await termoDoUsuario(req, String(req.params.id), false))
  }))

  router.get('/termos/:id/documento', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const t = await termoDoUsuario(req, String(req.params.id), false)
    const [b, users] = await Promise.all([getBranding(tenantId), nomesDeUsuarios(tenantId, [t.responsavelUserId, t.emitidoPorId])])
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:800px;margin:auto;font:14px/1.5 sans-serif">${brandHeaderHtml(b, { titulo: `Termo de responsabilidade ${t.numero}`, subtitulo: `Situação: ${t.status.replace(/_/g, ' ')}` })}
<div style="padding:16px 28px">${t.texto.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}
<p><b>Responsável:</b> ${esc(users.get(t.responsavelUserId) ?? t.responsavelUserId)} · <b>Emitido por:</b> ${esc(users.get(t.emitidoPorId) ?? '')} em ${t.emitidoEm.toLocaleDateString('pt-BR')}</p>
${t.aceitoEm ? `<p style="border:1px solid #16a34a;padding:8px;background:#f0fdf4"><b>Aceite eletrônico</b> em ${t.aceitoEm.toLocaleString('pt-BR')} · IP ${esc(t.aceiteIp ?? '')}<br><small>Impressão digital: ${esc(t.aceiteHash ?? '')}</small></p>` : '<p><i>Aceite pendente.</i></p>'}
<div style="display:flex;gap:40px;margin-top:70px"><div style="flex:1;border-top:1px solid #000;text-align:center">Responsável</div><div style="flex:1;border-top:1px solid #000;text-align:center">Patrimônio</div></div></div></body>`)
  }))

  router.post('/termos/:id/aceitar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    parseBody(z.object({ confirmo: z.literal(true, { errorMap: () => ({ message: 'Confirme o aceite (confirmo: true).' }) }) }), req.body ?? {})
    const t = await termoDoUsuario(req, String(req.params.id), true)
    const agora = new Date()
    const hash = createHash('sha256').update(`${t.numero}|${t.texto}|${t.responsavelUserId}|${agora.toISOString()}`).digest('hex')
    const claim = await prisma.cppTermoResponsabilidade.updateMany({ where: { id: t.id, tenantId, status: 'PENDENTE_ACEITE' }, data: { status: 'VIGENTE', aceitoEm: agora, aceiteIp: ipOf(req), aceiteHash: hash } })
    if (claim.count === 0) fail(409, `Termo em ${t.status} não pode ser aceito.`)
    await completeReminders({ tenantId, refType: 'CppTermoResponsabilidade', refId: t.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'TERMO_ACEITO', refType: 'InfBem', refId: t.bemId, detalhes: { numero: t.numero } })
    res.json(await prisma.cppTermoResponsabilidade.findFirst({ where: { id: t.id } }))
  }))

  router.post('/termos/:id/recusar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ motivo: z.string().min(5) }), req.body ?? {})
    const t = await termoDoUsuario(req, String(req.params.id), true)
    const claim = await prisma.cppTermoResponsabilidade.updateMany({ where: { id: t.id, tenantId, status: 'PENDENTE_ACEITE' }, data: { status: 'RECUSADO', recusadoMotivo: d.motivo } })
    if (claim.count === 0) fail(409, `Termo em ${t.status} não pode ser recusado.`)
    await completeReminders({ tenantId, refType: 'CppTermoResponsabilidade', refId: t.id })
    await scheduleReminder({ tenantId, modulo: MODULO, refType: 'InfBem', refId: t.bemId, dedupeKey: `cpp-termo-recusado-${t.id}`, titulo: `Termo ${t.numero} recusado pelo responsável: ${d.motivo}`, dueAt: new Date(Date.now() + 3 * 86_400_000), assigneeRole: 'FACILITIES', severity: 'ATENCAO' })
    res.json(await prisma.cppTermoResponsabilidade.findFirst({ where: { id: t.id } }))
  }))

  router.post('/termos/:id/encerrar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ motivo: z.string().min(5) }), req.body ?? {})
    const t = await prisma.cppTermoResponsabilidade.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) return res.status(404).json({ error: 'Termo não encontrado.' })
    if (!['VIGENTE', 'PENDENTE_ACEITE'].includes(t.status)) fail(409, `Termo em ${t.status} não pode ser encerrado.`)
    res.json(await prisma.cppTermoResponsabilidade.update({ where: { id: t.id }, data: { status: t.status === 'VIGENTE' ? 'ENCERRADO' : 'CANCELADO', encerradoEm: new Date(), motivoEncerramento: d.motivo } }))
  }))

  router.get('/bens/:id/termos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const rows = await prisma.cppTermoResponsabilidade.findMany({ where: { tenantId, bemId: String(req.params.id) }, orderBy: { createdAt: 'desc' } })
    const users = await nomesDeUsuarios(tenantId, rows.map((r) => r.responsavelUserId))
    res.json({ items: rows.map((r) => ({ ...r, responsavel: users.get(r.responsavelUserId) ?? null })) })
  }))

  // Bens sob a responsabilidade do usuário logado (e termos a aceitar).
  router.get('/meus-bens', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), uid = getUserId(req)
    const [bens, termos, transf] = await Promise.all([
      prisma.infBem.findMany({ where: { tenantId, responsavelUserId: uid, status: { not: 'BAIXADO' } }, include: { categoria: true }, orderBy: { tombamento: 'asc' }, take: 500 }),
      prisma.cppTermoResponsabilidade.findMany({ where: { tenantId, responsavelUserId: uid, status: { in: ['PENDENTE_ACEITE', 'VIGENTE'] } } }),
      prisma.cppTransferencia.findMany({ where: { tenantId, destinoResponsavelId: uid, status: 'AGUARDANDO_ACEITE' } }),
    ])
    res.json({ bens: bens.map((b) => ({ id: b.id, tombamento: b.tombamento, descricao: b.descricao, categoria: b.categoria.nome, estado: b.estado, valorAquisicao: b.valorAquisicao, termo: termos.find((t) => t.bemId === b.id) ? { id: termos.find((t) => t.bemId === b.id)!.id, status: termos.find((t) => t.bemId === b.id)!.status } : null })), termosPendentes: termos.filter((t) => t.status === 'PENDENTE_ACEITE'), transferenciasParaAceitar: transf })
  }))

  // ---------- Transferências com aceite ----------
  const trCreate = z.object({ bemId: z.string(), destinoSpaceId: z.string().optional().nullable(), destinoDepartamentoId: z.string().optional().nullable(), destinoResponsavelId: z.string().optional().nullable(), motivo: z.string().min(5), documento: z.string().optional() })

  router.post('/transferencias', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), userId = getUserId(req)
    const d = parseBody(trCreate, req.body)
    const bem = await prisma.infBem.findFirst({ where: { id: d.bemId, tenantId } })
    if (!bem) fail(404, 'Bem não encontrado.')
    if (bem.status === 'BAIXADO') fail(409, 'Bem baixado não pode ser transferido.')
    await ensureSpace(tenantId, d.destinoSpaceId)
    await ensureDepartamento(tenantId, d.destinoDepartamentoId)
    if (d.destinoResponsavelId && !(await prisma.user.findFirst({ where: { id: d.destinoResponsavelId, tenantId }, select: { id: true } }))) fail(404, 'Novo responsável (usuário) não encontrado.')
    const mudaLocal = !!d.destinoSpaceId && d.destinoSpaceId !== bem.spaceId
    const mudaDep = !!d.destinoDepartamentoId && d.destinoDepartamentoId !== bem.departamentoId
    const mudaResp = !!d.destinoResponsavelId && d.destinoResponsavelId !== bem.responsavelUserId
    if (!mudaLocal && !mudaDep && !mudaResp) fail(400, 'Nada a transferir: informe local, departamento ou responsável diferentes dos atuais.')
    const pend = await prisma.cppTransferencia.findFirst({ where: { tenantId, bemId: bem.id, status: 'AGUARDANDO_ACEITE' } })
    if (pend) fail(409, `Já existe a transferência ${pend.numero} aguardando aceite para este bem.`)
    const pol = await getPolitica(tenantId)
    const precisaAceite = mudaResp && pol.exigirAceiteTransferencia
    const tr = await prisma.$transaction(async (tx) => tx.cppTransferencia.create({ data: {
      tenantId, numero: await cppNumero(tx, tenantId, 'TRF'), bemId: bem.id, origemSpaceId: bem.spaceId, origemDepartamentoId: bem.departamentoId, origemResponsavelId: bem.responsavelUserId,
      destinoSpaceId: mudaLocal ? d.destinoSpaceId : null, destinoDepartamentoId: mudaDep ? d.destinoDepartamentoId : null, destinoResponsavelId: mudaResp ? d.destinoResponsavelId : null,
      motivo: d.motivo, documento: d.documento, solicitadoPorId: userId, expiraEm: precisaAceite ? new Date(Date.now() + pol.prazoAceiteDias * 86_400_000) : null,
    } }))
    await audit({ tenantId, userId, modulo: MODULO, acao: 'TRANSFERENCIA_SOLICITADA', refType: 'InfBem', refId: bem.id, detalhes: { numero: tr.numero, precisaAceite } })
    if (precisaAceite) {
      await notify({ tenantId, userId: d.destinoResponsavelId!, assunto: `Aceite de transferência ${tr.numero}`, mensagem: `O bem ${bem.tombamento} — ${bem.descricao} será transferido para a sua responsabilidade. Acesse Patrimônio > Transferências para aceitar ou recusar.`, refType: 'CppTransferencia', refId: tr.id })
      await scheduleReminder({ tenantId, modulo: MODULO, refType: 'CppTransferencia', refId: tr.id, dedupeKey: `cpp-transf-${tr.id}`, titulo: `Aceitar transferência ${tr.numero} (${bem.tombamento})`, dueAt: tr.expiraEm!, assigneeUserId: d.destinoResponsavelId!, severity: 'ATENCAO' })
      return res.status(201).json({ ...tr, exigeAceite: true })
    }
    // Sem troca de responsável (ou aceite dispensado pela política): conclui na hora.
    await concluirTransferencia(tenantId, tr, userId, ipOf(req))
    res.status(201).json({ ...(await prisma.cppTransferencia.findFirst({ where: { id: tr.id } })), exigeAceite: false })
  }))

  router.get('/transferencias', requireRole(...LEITURA, 'TEACHER', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), uid = getUserId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'bemId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const gestor = [...SUPER, ...GESTAO, ...LEITURA].includes(roleOf(req) as any)
    if (!gestor || qs(req.query.minhas) === 'true') where.OR = [{ destinoResponsavelId: uid }, { origemResponsavelId: uid }, { solicitadoPorId: uid }]
    const [rows, total] = await Promise.all([prisma.cppTransferencia.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cppTransferencia.count({ where })])
    const [bens, users, spaces, deps] = await Promise.all([
      prisma.infBem.findMany({ where: { tenantId, id: { in: rows.map((r) => r.bemId) } }, select: { id: true, tombamento: true, descricao: true } }),
      nomesDeUsuarios(tenantId, rows.flatMap((r) => [r.origemResponsavelId, r.destinoResponsavelId, r.solicitadoPorId].filter(Boolean) as string[])),
      prisma.eduSpace.findMany({ where: { tenantId, id: { in: rows.flatMap((r) => [r.origemSpaceId, r.destinoSpaceId].filter(Boolean) as string[]) } } }),
      prisma.cppDepartamento.findMany({ where: { tenantId, id: { in: rows.flatMap((r) => [r.origemDepartamentoId, r.destinoDepartamentoId].filter(Boolean) as string[]) } } }),
    ])
    const sp = (id: string | null) => nomeLocal(spaces.find((s) => s.id === id))
    const dp = (id: string | null) => deps.find((x) => x.id === id)?.nome ?? null
    res.json({ items: rows.map((r) => ({ ...r, bem: bens.find((b) => b.id === r.bemId) ?? null, origem: { local: sp(r.origemSpaceId), departamento: dp(r.origemDepartamentoId), responsavel: r.origemResponsavelId ? users.get(r.origemResponsavelId) ?? null : null }, destino: { local: sp(r.destinoSpaceId), departamento: dp(r.destinoDepartamentoId), responsavel: r.destinoResponsavelId ? users.get(r.destinoResponsavelId) ?? null : null }, solicitante: users.get(r.solicitadoPorId) ?? null })), total, page, pageSize })
  }))

  router.get('/transferencias/:id', requireRole(...LEITURA, 'TEACHER', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const t = await prisma.cppTransferencia.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!t) return res.status(404).json({ error: 'Transferência não encontrada.' })
    res.json(t)
  }))

  router.post('/transferencias/:id/aceitar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), uid = getUserId(req)
    parseBody(z.object({ confirmo: z.literal(true, { errorMap: () => ({ message: 'Confirme o aceite (confirmo: true).' }) }) }), req.body ?? {})
    const t = await prisma.cppTransferencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) return res.status(404).json({ error: 'Transferência não encontrada.' })
    if (t.status !== 'AGUARDANDO_ACEITE') fail(409, `Transferência em ${t.status}.`)
    if (t.destinoResponsavelId !== uid) fail(403, 'Somente o novo responsável pode aceitar a transferência.')
    if (t.expiraEm && t.expiraEm.getTime() < Date.now()) fail(409, 'O prazo de aceite expirou.')
    const r = await concluirTransferencia(tenantId, t, uid, ipOf(req), uid)
    res.json({ transferencia: await prisma.cppTransferencia.findFirst({ where: { id: t.id } }), bem: r.bem, termo: r.termo })
  }))

  router.post('/transferencias/:id/recusar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), uid = getUserId(req)
    const d = parseBody(z.object({ motivo: z.string().min(5) }), req.body ?? {})
    const t = await prisma.cppTransferencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) return res.status(404).json({ error: 'Transferência não encontrada.' })
    if (t.destinoResponsavelId !== uid) fail(403, 'Somente o novo responsável pode recusar a transferência.')
    const claim = await prisma.cppTransferencia.updateMany({ where: { id: t.id, status: 'AGUARDANDO_ACEITE' }, data: { status: 'RECUSADA', recusaMotivo: d.motivo } })
    if (claim.count === 0) fail(409, `Transferência em ${t.status}.`)
    await completeReminders({ tenantId, refType: 'CppTransferencia', refId: t.id, userId: uid })
    await notify({ tenantId, userId: t.solicitadoPorId, assunto: `Transferência ${t.numero} recusada`, mensagem: `Motivo: ${d.motivo}`, refType: 'CppTransferencia', refId: t.id })
    res.json(await prisma.cppTransferencia.findFirst({ where: { id: t.id } }))
  }))

  router.post('/transferencias/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const t = await prisma.cppTransferencia.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!t) return res.status(404).json({ error: 'Transferência não encontrada.' })
    const claim = await prisma.cppTransferencia.updateMany({ where: { id: t.id, status: 'AGUARDANDO_ACEITE' }, data: { status: 'CANCELADA' } })
    if (claim.count === 0) fail(409, `Transferência em ${t.status} não pode ser cancelada.`)
    await completeReminders({ tenantId, refType: 'CppTransferencia', refId: t.id })
    res.json({ ok: true })
  }))

  // ---------- Histórico completo do bem (movimentações + transferências + termos) ----------
  router.get('/bens/:id/historico', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req), id = String(req.params.id)
    const bem = await prisma.infBem.findFirst({ where: { id, tenantId }, select: { id: true } })
    if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
    const [movs, trs, termos] = await Promise.all([
      prisma.infMovimentacaoBem.findMany({ where: { tenantId, bemId: id }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.cppTransferencia.findMany({ where: { tenantId, bemId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.cppTermoResponsabilidade.findMany({ where: { tenantId, bemId: id }, orderBy: { createdAt: 'desc' } }),
    ])
    const eventos = [
      ...movs.map((m) => ({ quando: m.createdAt, tipo: `MOVIMENTACAO_${m.tipo}`, descricao: m.motivo ?? m.tipo, ref: m.id })),
      ...trs.map((t) => ({ quando: t.createdAt, tipo: `TRANSFERENCIA_${t.status}`, descricao: `${t.numero}: ${t.motivo}`, ref: t.id })),
      ...termos.map((t) => ({ quando: t.createdAt, tipo: `TERMO_${t.status}`, descricao: `${t.numero}`, ref: t.id })),
    ].sort((a, b) => b.quando.getTime() - a.quando.getTime())
    res.json({ items: eventos })
  }))

  // ---------- Relatório de responsabilidade ----------
  router.get('/relatorios/responsabilidade', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [bens, termos, deps, pend] = await Promise.all([
      prisma.infBem.findMany({ where: { tenantId, status: { not: 'BAIXADO' } }, include: { categoria: true } }),
      prisma.cppTermoResponsabilidade.findMany({ where: { tenantId, status: { in: ['VIGENTE', 'PENDENTE_ACEITE'] } } }),
      prisma.cppDepartamento.findMany({ where: { tenantId } }),
      prisma.cppTransferencia.count({ where: { tenantId, status: 'AGUARDANDO_ACEITE' } }),
    ])
    const users = await nomesDeUsuarios(tenantId, bens.map((b) => b.responsavelUserId ?? ''))
    const vig = new Set(termos.filter((t) => t.status === 'VIGENTE').map((t) => `${t.bemId}|${t.responsavelUserId}`))
    const porDep: Record<string, { departamento: string; bens: number; valorContabil: number }> = {}
    const porResp: Record<string, { responsavel: string; bens: number; valorContabil: number; semTermo: number }> = {}
    for (const b of bens) {
      const vc = depreciacaoDoBem(b, b.categoria).valorContabil
      const dk = b.departamentoId ?? '_'
      const d = (porDep[dk] ??= { departamento: b.departamentoId ? deps.find((x) => x.id === b.departamentoId)?.nome ?? b.departamentoId : 'Sem departamento', bens: 0, valorContabil: 0 })
      d.bens++; d.valorContabil += vc
      const rk = b.responsavelUserId ?? '_'
      const r = (porResp[rk] ??= { responsavel: b.responsavelUserId ? users.get(b.responsavelUserId) ?? b.responsavelUserId : 'Sem responsável', bens: 0, valorContabil: 0, semTermo: 0 })
      r.bens++; r.valorContabil += vc
      if (b.responsavelUserId && !vig.has(`${b.id}|${b.responsavelUserId}`)) r.semTermo++
    }
    const fmt = <T extends { valorContabil: number }>(o: Record<string, T>) => Object.values(o).map((x) => ({ ...x, valorContabil: money(x.valorContabil) })).sort((a, b) => b.valorContabil - a.valorContabil)
    const out = {
      bensAtivos: bens.length, semResponsavel: bens.filter((b) => !b.responsavelUserId).length, semDepartamento: bens.filter((b) => !b.departamentoId).length, semLocalizacao: bens.filter((b) => !b.spaceId).length,
      semTermoVigente: bens.filter((b) => b.responsavelUserId && !vig.has(`${b.id}|${b.responsavelUserId}`)).length, termosPendentesAceite: termos.filter((t) => t.status === 'PENDENTE_ACEITE').length, transferenciasAguardandoAceite: pend,
      porDepartamento: fmt(porDep), porResponsavel: fmt(porResp),
    }
    if (qs(req.query.format) !== 'html') return res.json(out)
    const b = await getBranding(tenantId)
    const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:900px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: 'Patrimônio — responsabilidade', subtitulo: new Date().toLocaleDateString('pt-BR') })}<div style="padding:16px 28px">
<p>Bens ativos: <b>${out.bensAtivos}</b> · sem responsável: <b>${out.semResponsavel}</b> · sem departamento: <b>${out.semDepartamento}</b> · sem termo vigente: <b>${out.semTermoVigente}</b> · termos pendentes: <b>${out.termosPendentesAceite}</b></p>
<h3>Por departamento</h3><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><tr><th align="left">Departamento</th><th>Bens</th><th align="right">Valor contábil</th></tr>${out.porDepartamento.map((x) => `<tr><td>${esc(x.departamento)}</td><td align="center">${x.bens}</td><td align="right">${brl(x.valorContabil)}</td></tr>`).join('')}</table>
<h3>Por responsável</h3><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><tr><th align="left">Responsável</th><th>Bens</th><th>Sem termo</th><th align="right">Valor contábil</th></tr>${out.porResponsavel.map((x) => `<tr><td>${esc(x.responsavel)}</td><td align="center">${x.bens}</td><td align="center">${x.semTermo}</td><td align="right">${brl(x.valorContabil)}</td></tr>`).join('')}</table></div></body>`)
  }))

  // Transferências sem resposta dentro do prazo expiram.
  registerEduJob('cpp:transferencias-expiradas', async () => {
    const venc = await prisma.cppTransferencia.findMany({ where: { status: 'AGUARDANDO_ACEITE', expiraEm: { lt: new Date() } }, take: 500 })
    for (const t of venc) {
      const c = await prisma.cppTransferencia.updateMany({ where: { id: t.id, status: 'AGUARDANDO_ACEITE' }, data: { status: 'EXPIRADA' } })
      if (c.count) await notify({ tenantId: t.tenantId, userId: t.solicitadoPorId, assunto: `Transferência ${t.numero} expirou`, mensagem: 'O novo responsável não respondeu no prazo. Refaça a solicitação se necessário.', refType: 'CppTransferencia', refId: t.id })
    }
    return { expiradas: venc.length }
  })
}
