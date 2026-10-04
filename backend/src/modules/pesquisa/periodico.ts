import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { registerEduJob } from '../core/jobs'
import {
  CRITERIOS_PARECER, DECISAO_PARA_STATUS, TRANSICOES_SUBMISSAO, addDays, anonimizarSubmissao, consolidarRecomendacoes, estatisticasPeriodico, hashDedupe, mediaParecer,
  normalizarDoi, normalizarOrcid, normalizarTexto, novoToken, podeTransicionar, sugerirRevisores, validarIssn, validarNotasParecer, validarOrcid,
} from './lib'
import { DOCENTES, GESTAO, LEITORES, MOD, comRetentativa, ehGestor, httpErr, nomeUsuario, proximoCodigo } from './common'

const TODOS = [...DOCENTES, 'STUDENT', 'STAFF', 'LIBRARIAN', 'SECRETARY'] as any[]
const EDITORIAIS = ['EDITOR_CHEFE', 'EDITOR_ASSOCIADO', 'EDITOR_SECAO', 'EDITOR_LAYOUT']

const autorSub = z.object({ nome: z.string().trim().min(3), email: z.string().email(), orcid: z.string().optional().nullable(), afiliacao: z.string().optional().nullable(), correspondente: z.boolean().optional() })

export async function ehEditor(req: AuthenticatedRequest, periodicoId: string, tenantId: string) {
  if (ehGestor(req)) return true
  const p = await prisma.pesPeriodico.findFirst({ where: { id: periodicoId, tenantId }, select: { editorChefeUserId: true } })
  if (p?.editorChefeUserId === req.user?.id) return true
  const m = await prisma.pesPeriodicoEquipe.findFirst({ where: { tenantId, periodicoId, userId: req.user?.id, ativo: true, papel: { in: EDITORIAIS } }, select: { id: true } })
  return !!m
}

async function exigirEditor(req: AuthenticatedRequest, periodicoId: string, tenantId: string) {
  if (!(await ehEditor(req, periodicoId, tenantId))) throw httpErr(403, 'Somente a equipe editorial do periódico realiza esta ação.')
}

async function carregarSub(req: AuthenticatedRequest, id: string, include?: any) {
  const tenantId = getTenantId(req)
  const s = await prisma.pesSubmissao.findFirst({ where: { id, tenantId }, include })
  if (!s) throw httpErr(404, 'Submissão não encontrada.')
  return s as any
}

const ehAutor = (req: AuthenticatedRequest, s: any) => (!!s.submissorUserId && s.submissorUserId === req.user?.id) || (!!s.submissorStudentId && s.submissorStudentId === req.user?.studentId)

async function destinatariosEditoriais(tenantId: string, p: { id: string; editorChefeUserId: string | null }, s?: { editorUserId: string | null }) {
  const ids = new Set<string>()
  if (s?.editorUserId) ids.add(s.editorUserId)
  else if (p.editorChefeUserId) ids.add(p.editorChefeUserId)
  return [...ids]
}

async function mudarStatus(tenantId: string, s: any, para: string, userId?: string, extra: any = {}) {
  if (!podeTransicionar(TRANSICOES_SUBMISSAO, s.status, para)) throw httpErr(409, `Transição inválida: ${s.status} → ${para}.`)
  const row = await prisma.pesSubmissao.update({ where: { id: s.id }, data: { status: para as any, ...extra } })
  await audit({ tenantId, userId, modulo: MOD, acao: `SUBMISSAO_${para}`, refType: 'PesSubmissao', refId: s.id, detalhes: { de: s.status } })
  return row
}

// ----- lógica compartilhada entre rota autenticada e rota pública por token -----
export async function responderConvite(rev: any, aceitar: boolean, motivo?: string) {
  if (rev.status !== 'CONVIDADO') throw httpErr(409, `Convite já está ${rev.status.toLowerCase()}.`)
  const s = await prisma.pesSubmissao.findFirst({ where: { id: rev.submissaoId }, include: { periodico: true } })
  if (!s) throw httpErr(404, 'Submissão não encontrada.')
  const row = await prisma.pesRevisao.update({ where: { id: rev.id }, data: { status: aceitar ? 'ACEITO' : 'RECUSADO', respondidoEm: new Date() } })
  await completeReminders({ tenantId: rev.tenantId, refType: 'PesRevisaoConvite', refId: rev.id })
  if (!aceitar) await cancelReminders({ tenantId: rev.tenantId, refType: 'PesRevisao', refId: rev.id })
  for (const uid of await destinatariosEditoriais(rev.tenantId, s.periodico, s)) {
    await notify({ tenantId: rev.tenantId, userId: uid, assunto: `Parecerista ${aceitar ? 'aceitou' : 'recusou'} o convite — ${s.codigo}`, mensagem: `${rev.revisorNome} ${aceitar ? 'aceitou' : 'recusou'} avaliar o manuscrito ${s.codigo}.${motivo ? ' Motivo: ' + motivo : ''}${aceitar ? '' : ' Convide outro parecerista.'}`, refType: 'PesSubmissao', refId: s.id })
  }
  if (!aceitar) await scheduleReminder({ tenantId: rev.tenantId, modulo: MOD, titulo: `Convidar novo parecerista — ${s.codigo}`, dueAt: addDays(new Date(), 3), severity: 'ATENCAO', refType: 'PesSubmissao', refId: s.id, assigneeUserId: s.editorUserId ?? s.periodico.editorChefeUserId ?? undefined, assigneeRole: s.editorUserId || s.periodico.editorChefeUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-sub-novo-revisor-${rev.id}` })
  return row
}

const parecerSchema = z.object({
  recomendacao: z.enum(['ACEITAR', 'REVISOES_MENORES', 'REVISOES_MAIORES', 'REJEITAR']),
  notas: z.record(z.string(), z.number()),
  comentarioAutor: z.string().trim().min(20, 'Comentário ao autor muito curto (mín. 20 caracteres).'),
  comentarioEditor: z.string().optional().nullable(),
  semConflito: z.literal(true, { errorMap: () => ({ message: 'É necessário declarar ausência de conflito de interesse.' }) }),
})

export async function registrarParecer(rev: any, body: unknown) {
  const d = parseBody(parecerSchema, body)
  if (rev.status !== 'ACEITO') throw httpErr(409, rev.status === 'CONCLUIDO' ? 'Parecer já enviado.' : 'Aceite o convite antes de enviar o parecer.')
  const erros = validarNotasParecer(d.notas)
  if (erros.length) throw httpErr(422, erros.join(' '))
  const s = await prisma.pesSubmissao.findFirst({ where: { id: rev.submissaoId }, include: { periodico: true } })
  if (!s || s.rodada !== rev.rodada || s.status !== 'EM_REVISAO') throw httpErr(409, 'Esta rodada de revisão não está mais aberta.')
  const row = await prisma.pesRevisao.update({ where: { id: rev.id }, data: { status: 'CONCLUIDO', concluidoEm: new Date(), recomendacao: d.recomendacao, notas: d.notas, notaMedia: mediaParecer(d.notas), comentarioAutor: d.comentarioAutor, comentarioEditor: d.comentarioEditor ?? null, semConflito: true } })
  await completeReminders({ tenantId: rev.tenantId, refType: 'PesRevisao', refId: rev.id })
  const todas = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id, rodada: s.rodada, status: { in: ['CONVIDADO', 'ACEITO', 'CONCLUIDO'] } } })
  const concluidas = todas.filter((r) => r.status === 'CONCLUIDO')
  const completo = concluidas.length >= Math.min(s.periodico.revisoresPorSubmissao, todas.length) && !todas.some((r) => r.status === 'ACEITO')
  for (const uid of await destinatariosEditoriais(rev.tenantId, s.periodico, s)) {
    await notify({ tenantId: rev.tenantId, userId: uid, assunto: `Parecer recebido — ${s.codigo}`, mensagem: `Novo parecer (${d.recomendacao}) para ${s.codigo}. ${completo ? 'Todos os pareceres previstos foram recebidos: registre a decisão.' : `${concluidas.length}/${todas.length} concluídos.`}`, refType: 'PesSubmissao', refId: s.id })
  }
  if (completo) {
    await scheduleReminder({ tenantId: rev.tenantId, modulo: MOD, titulo: `Decidir manuscrito ${s.codigo} (pareceres completos)`, dueAt: addDays(new Date(), 7), severity: 'ATENCAO', refType: 'PesSubmissaoDecisao', refId: s.id, assigneeUserId: s.editorUserId ?? s.periodico.editorChefeUserId ?? undefined, assigneeRole: s.editorUserId || s.periodico.editorChefeUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-sub-decidir-${s.id}-${s.rodada}` })
  }
  return row
}

function visaoRevisorDaSubmissao(s: any, ultimaVersao?: any) {
  // duplo-cego: sem autores, sem submissor, sem financiamento/conflito declarado
  const a = anonimizarSubmissao(s) as any
  return { id: a.id, codigo: a.codigo, titulo: a.titulo, resumo: a.resumo, abstract: a.abstract, palavrasChave: a.palavrasChave, idioma: a.idioma, rodada: a.rodada, arquivoUrl: ultimaVersao?.arquivoUrl ?? null, versao: ultimaVersao?.numero ?? null }
}

export default function mountPeriodico(router: Router) {
  // ---------- Periódicos (cadastro) ----------
  const periodicoSchema = z.object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/, 'slug: letras minúsculas, números e hífen').optional(),
    nome: z.string().trim().min(3), sigla: z.string().optional().nullable(),
    issn: z.string().optional().nullable(), eissn: z.string().optional().nullable(), area: z.string().optional().nullable(), linhaEditorial: z.string().optional().nullable(), escopo: z.string().optional().nullable(), normas: z.string().optional().nullable(),
    politicaAcessoAberto: z.boolean().optional(), licenca: z.string().optional(), doiPrefixo: z.string().regex(/^10\.\d{4,9}$/, 'Prefixo DOI deve ser 10.NNNN').optional().nullable(),
    editorChefeUserId: z.string().optional().nullable(), editorChefeNome: z.string().optional().nullable(), emailContato: z.string().email().optional().nullable(),
    duploCego: z.boolean().optional(), revisoresPorSubmissao: z.number().int().min(1).max(5).optional(), prazoRevisaoDias: z.number().int().min(7).max(120).optional(), prazoAutorDias: z.number().int().min(7).max(180).optional(), periodicidade: z.string().optional().nullable(), ativo: z.boolean().optional(),
  })
  const slugify = (s: string) => normalizarTexto(s).replace(/\s+/g, '-').slice(0, 60)
  mountCrud(router, {
    model: 'pesPeriodico', path: '/periodicos', read: [...LEITORES, 'STUDENT'], write: GESTAO, create: periodicoSchema, search: ['nome', 'sigla', 'issn'], filters: ['ativo', 'area'], orderBy: { nome: 'asc' }, modulo: MOD,
    beforeCreate: async (d, req) => {
      if (d.issn && !validarIssn(d.issn)) throw httpErr(400, 'ISSN inválido.')
      if (d.eissn && !validarIssn(d.eissn)) throw httpErr(400, 'e-ISSN inválido.')
      d.slug = d.slug ?? slugify(d.nome)
      if (d.editorChefeUserId) d.editorChefeNome = d.editorChefeNome ?? (await nomeUsuario(getTenantId(req), d.editorChefeUserId))
      return d
    },
    beforeUpdate: (d) => {
      if (d.issn && !validarIssn(d.issn)) throw httpErr(400, 'ISSN inválido.')
      if (d.eissn && !validarIssn(d.eissn)) throw httpErr(400, 'e-ISSN inválido.')
      return d
    },
    afterCreate: async (row, req) => {
      // seções padrão + editor-chefe na equipe
      await prisma.pesSecao.createMany({ data: [{ nome: 'Artigos Originais', ordem: 1 }, { nome: 'Revisões', ordem: 2 }, { nome: 'Relatos de Caso/Experiência', ordem: 3 }, { nome: 'Editorial', ordem: 4, revisadaPorPares: false }].map((s) => ({ ...s, tenantId: row.tenantId, periodicoId: row.id })) })
      if (row.editorChefeUserId || row.editorChefeNome) await prisma.pesPeriodicoEquipe.create({ data: { tenantId: row.tenantId, periodicoId: row.id, userId: row.editorChefeUserId, nome: row.editorChefeNome ?? 'Editor-chefe', papel: 'EDITOR_CHEFE' } })
    },
  })
  mountCrud(router, {
    model: 'pesPeriodicoEquipe', path: '/periodicos-equipe', read: [...DOCENTES], write: GESTAO, filters: ['periodicoId', 'papel', 'ativo', 'userId'], search: ['nome', 'email'], modulo: MOD,
    create: z.object({ periodicoId: z.string(), userId: z.string().optional().nullable(), nome: z.string().trim().min(3).optional(), email: z.string().email().optional().nullable(), papel: z.enum(['EDITOR_CHEFE', 'EDITOR_ASSOCIADO', 'EDITOR_SECAO', 'EDITOR_LAYOUT', 'PARECERISTA']).default('PARECERISTA'), areas: z.array(z.string()).default([]), instituicao: z.string().optional().nullable(), orcid: z.string().optional().nullable(), lattes: z.string().optional().nullable(), ativo: z.boolean().optional() }),
    beforeCreate: async (d, req) => {
      const tenantId = getTenantId(req)
      if (!(await prisma.pesPeriodico.findFirst({ where: { id: d.periodicoId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Periódico não encontrado.')
      d.nome = d.nome ?? (await nomeUsuario(tenantId, d.userId))
      if (!d.nome) throw httpErr(400, 'Informe o nome ou userId.')
      if (d.orcid) { if (!validarOrcid(d.orcid)) throw httpErr(400, 'ORCID inválido.'); d.orcid = normalizarOrcid(d.orcid) }
      return d
    },
  })
  mountCrud(router, { model: 'pesSecao', path: '/secoes', read: [...LEITORES, 'STUDENT'], write: GESTAO, filters: ['periodicoId', 'ativa'], orderBy: { ordem: 'asc' }, modulo: MOD,
    create: z.object({ periodicoId: z.string(), nome: z.string().trim().min(3), ordem: z.number().int().min(1).optional(), revisadaPorPares: z.boolean().optional(), ativa: z.boolean().optional() }) })

  // ---------- Edições ----------
  mountCrud(router, {
    model: 'pesEdicao', path: '/edicoes', read: [...LEITORES, 'STUDENT'], write: GESTAO, filters: ['periodicoId', 'status', 'ano'], orderBy: [{ ano: 'desc' }, { volume: 'desc' }], modulo: MOD, include: { _count: { select: { submissoes: true } } },
    create: z.object({ periodicoId: z.string(), volume: z.number().int().min(1), numero: z.string().trim().min(1), ano: z.number().int().min(1990).max(2100), titulo: z.string().optional().nullable(), tipo: z.enum(['REGULAR', 'ESPECIAL', 'SUPLEMENTO']).default('REGULAR'), editorial: z.string().optional().nullable(), capaUrl: z.string().optional().nullable() }),
    update: z.object({ titulo: z.string().optional().nullable(), tipo: z.enum(['REGULAR', 'ESPECIAL', 'SUPLEMENTO']).optional(), editorial: z.string().optional().nullable(), capaUrl: z.string().optional().nullable(), status: z.enum(['PLANEJADA', 'EM_EDICAO']).optional() }),
    beforeCreate: async (d, req) => {
      if (!(await prisma.pesPeriodico.findFirst({ where: { id: d.periodicoId, tenantId: getTenantId(req) }, select: { id: true } }))) throw httpErr(404, 'Periódico não encontrado.')
      return d
    },
    beforeUpdate: (d, _req, cur) => {
      if (cur.status === 'PUBLICADA') throw httpErr(409, 'Edição publicada não pode ser alterada (use errata/nova edição).')
      return d
    },
  })

  // Publicação da edição: gera DOI, ordena artigos, cria registro na produção científica e marca PUBLICADO.
  router.post(
    '/edicoes/:id/publicar',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ed = await prisma.pesEdicao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { periodico: true, submissoes: { where: { status: 'EDITORACAO' }, include: { secao: true, versoes: true }, orderBy: [{ ordemNaEdicao: 'asc' }, { dataSubmissao: 'asc' }] } } })
      if (!ed) return res.status(404).json({ error: 'Edição não encontrada.' })
      await exigirEditor(req, ed.periodicoId, tenantId)
      if (ed.status === 'PUBLICADA') throw httpErr(409, 'Edição já publicada.')
      if (!ed.submissoes.length) throw httpErr(422, 'A edição não possui artigos em editoração.')
      const pend: string[] = []
      for (const s of ed.submissoes) if (!s.versoes.some((v) => ['FINAL', 'EDITORACAO'].includes(v.tipo) && v.arquivoUrl)) pend.push(`${s.codigo}: falta a versão final diagramada (arquivo).`)
      if (pend.length) return res.status(422).json({ error: 'Pendências impedem a publicação.', pendencias: pend })
      const agora = new Date()
      let pagina = 1
      let ordem = 0
      const publicados: string[] = []
      for (const s of ed.submissoes) {
        ordem++
        const ini = s.paginaInicial ?? pagina
        const fim = s.paginaFinal ?? ini + 9
        pagina = fim + 1
        const doi = s.doi ? normalizarDoi(s.doi) : ed.periodico.doiPrefixo ? `${ed.periodico.doiPrefixo}/${ed.periodico.slug}.${ed.ano}.v${ed.volume}n${ed.numero}.${String(ordem).padStart(3, '0')}`.toLowerCase() : null
        const autores: any[] = Array.isArray(s.autores) ? (s.autores as any[]) : []
        let pubId: string | null = s.publicacaoId
        if (!pubId) {
          const hash = hashDedupe('ARTIGO', s.titulo, ed.ano, doi)
          const existente = await prisma.pesPublicacao.findFirst({ where: { tenantId, hashDedupe: hash }, select: { id: true } })
          const pub = existente ?? (await prisma.pesPublicacao.create({
            data: { tenantId, tipo: 'ARTIGO', titulo: s.titulo, resumo: s.resumo ?? s.abstract, palavrasChave: s.palavrasChave, ano: ed.ano, dataPublicacao: agora, veiculo: ed.periodico.nome, issn: ed.periodico.issn, volume: String(ed.volume), numero: ed.numero, paginas: `${ini}-${fim}`, doi, idioma: s.idioma, hashDedupe: hash, origem: 'PERIODICO',
              autores: { create: autores.map((a, i) => ({ tenantId, ordem: i + 1, tipo: 'EXTERNO' as const, nome: a.nome, orcid: normalizarOrcid(a.orcid), instituicao: a.afiliacao ?? null, correspondente: !!a.correspondente, userId: i === 0 ? s.submissorUserId : null, studentId: i === 0 ? s.submissorStudentId : null })) } },
          }))
          pubId = pub.id
        }
        await prisma.pesSubmissao.update({ where: { id: s.id }, data: { status: 'PUBLICADO', doi, paginaInicial: ini, paginaFinal: fim, ordemNaEdicao: ordem, dataPublicacao: agora, publicacaoId: pubId } })
        await cancelReminders({ tenantId, refType: 'PesSubmissao', refId: s.id })
        if (s.submissorUserId) await notify({ tenantId, userId: s.submissorUserId, assunto: 'Seu artigo foi publicado', mensagem: `"${s.titulo}" foi publicado em ${ed.periodico.nome} v.${ed.volume} n.${ed.numero} (${ed.ano}).${doi ? ' DOI: ' + doi : ''}`, refType: 'PesSubmissao', refId: s.id })
        for (const a of autores) if (a.email) await notify({ tenantId, canal: 'EMAIL', destino: a.email, assunto: 'Artigo publicado', mensagem: `O artigo "${s.titulo}" foi publicado em ${ed.periodico.nome} v.${ed.volume} n.${ed.numero} (${ed.ano}).${doi ? ' DOI: ' + doi : ''}`, refType: 'PesSubmissao', refId: s.id })
        publicados.push(s.id)
      }
      const row = await prisma.pesEdicao.update({ where: { id: ed.id }, data: { status: 'PUBLICADA', dataPublicacao: agora } })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'PUBLICAR_EDICAO', refType: 'PesEdicao', refId: ed.id, detalhes: { artigos: publicados.length } })
      res.json({ edicao: row, artigosPublicados: publicados.length })
    }),
  )

  // ---------- Submissões ----------
  router.get(
    '/submissoes',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId }
      for (const f of ['status', 'periodicoId', 'edicaoId', 'secaoId']) {
        const v = qs((req.query as any)[f])
        if (v) where[f] = v
      }
      const q = qs(req.query.q)
      if (q) where.OR = [{ titulo: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q, mode: 'insensitive' } }]
      const periodicoId = qs(req.query.periodicoId)
      const editor = periodicoId ? await ehEditor(req, periodicoId, tenantId) : ehGestor(req)
      if (!editor) {
        // não-editor: apenas as próprias submissões
        where.AND = [{ OR: [{ submissorUserId: req.user!.id }, ...(req.user!.studentId ? [{ submissorStudentId: req.user!.studentId }] : [])] }]
      }
      const [items, total] = await Promise.all([prisma.pesSubmissao.findMany({ where, orderBy: { dataSubmissao: 'desc' }, skip, take, select: { id: true, codigo: true, periodicoId: true, edicaoId: true, secaoId: true, titulo: true, status: true, rodada: true, dataSubmissao: true, dataDecisao: true, prazoAutorAte: true, editorUserId: true, doi: true, ...(editor ? { autores: true } : {}) } }), prisma.pesSubmissao.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/submissoes/:id',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id), { versoes: { orderBy: { numero: 'asc' } }, decisoes: { orderBy: { createdAt: 'asc' } }, periodico: { select: { id: true, nome: true, duploCego: true, revisoresPorSubmissao: true } }, edicao: true, secao: true })
      if (await ehEditor(req, s.periodicoId, tenantId)) {
        const revisoes = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id }, orderBy: [{ rodada: 'asc' }, { convidadoEm: 'asc' }], select: { id: true, rodada: true, revisorNome: true, revisorEmail: true, status: true, convidadoEm: true, prazo: true, concluidoEm: true, recomendacao: true, notaMedia: true } })
        return res.json({ ...s, revisoes, consolidado: consolidarRecomendacoes(revisoes.filter((r) => r.rodada === s.rodada && r.status === 'CONCLUIDO').map((r) => r.recomendacao as any)) })
      }
      if (ehAutor(req, s)) {
        // autor vê decisões e comentários anônimos (sem identidade dos pareceristas)
        const rev = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id, status: 'CONCLUIDO', rodada: { lt: s.status === 'EM_REVISAO' ? s.rodada : s.rodada + 1 } }, orderBy: { concluidoEm: 'asc' }, select: { rodada: true, recomendacao: true, comentarioAutor: true, notas: true } })
        const decisoesVisiveis = s.decisoes
        return res.json({ ...s, pareceres: rev.map((r, i) => ({ parecerista: `Parecerista ${String.fromCharCode(65 + (i % 26))}`, ...r })), decisoes: decisoesVisiveis })
      }
      // parecerista designado: visão duplo-cego
      const minha = await prisma.pesRevisao.findFirst({ where: { tenantId, submissaoId: s.id, revisorUserId: req.user!.id, status: { in: ['ACEITO', 'CONCLUIDO', 'CONVIDADO'] } } })
      if (!minha) return res.status(404).json({ error: 'Submissão não encontrada.' })
      res.json(visaoRevisorDaSubmissao(s, s.versoes[s.versoes.length - 1]))
    }),
  )

  router.post(
    '/submissoes',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(z.object({
        periodicoId: z.string(), secaoId: z.string().optional().nullable(), titulo: z.string().trim().min(10), resumo: z.string().trim().min(100, 'Resumo deve ter ao menos 100 caracteres.'), abstract: z.string().optional().nullable(), palavrasChave: z.array(z.string().trim().min(2)).min(3, 'Informe ao menos 3 palavras-chave.').max(8),
        idioma: z.string().default('pt-BR'), autores: z.array(autorSub).min(1), conflitoInteresse: z.string().optional().nullable(), financiamento: z.string().optional().nullable(),
        declaracaoOriginalidade: z.literal(true, { errorMap: () => ({ message: 'É necessário declarar a originalidade e a inexistência de submissão simultânea.' }) }),
        arquivoUrl: z.string().min(3, 'Anexe o manuscrito (arquivoUrl).'),
      }), req.body)
      const p = await prisma.pesPeriodico.findFirst({ where: { id: d.periodicoId, tenantId, ativo: true } })
      if (!p) throw httpErr(404, 'Periódico não encontrado ou inativo.')
      if (d.secaoId && !(await prisma.pesSecao.findFirst({ where: { id: d.secaoId, tenantId, periodicoId: p.id, ativa: true }, select: { id: true } }))) throw httpErr(404, 'Seção inválida para este periódico.')
      if (!d.autores.some((a) => a.correspondente)) d.autores[0].correspondente = true
      for (const a of d.autores) if (a.orcid) { if (!validarOrcid(a.orcid)) throw httpErr(400, `ORCID inválido para ${a.nome}.`); a.orcid = normalizarOrcid(a.orcid) }
      const dupe = await prisma.pesSubmissao.findFirst({ where: { tenantId, periodicoId: p.id, submissorUserId: req.user!.id, titulo: { equals: d.titulo, mode: 'insensitive' }, status: { notIn: ['REJEITADO', 'RETIRADO'] } } })
      if (dupe) throw httpErr(409, `Já existe submissão ativa com este título (${dupe.codigo}).`)
      const { arquivoUrl, ...resto } = d
      const row = await comRetentativa(async () => {
        const codigo = await proximoCodigo('pesSubmissao', tenantId, 'SUB', 'codigo')
        return prisma.pesSubmissao.create({ data: { ...resto, tenantId, codigo, autores: d.autores as any, submissorUserId: req.user!.id, submissorStudentId: req.user!.studentId ?? null, editorUserId: p.editorChefeUserId, versoes: { create: { tenantId, numero: 1, rodada: 1, tipo: 'ORIGINAL', arquivoUrl, enviadoPorId: req.user!.id } } } })
      })
      await scheduleReminder({ tenantId, modulo: MOD, titulo: `Triagem do manuscrito ${row.codigo} — ${p.nome}`, dueAt: addDays(new Date(), 7), antecedenciaDias: 4, refType: 'PesSubmissaoTriagem', refId: row.id, assigneeUserId: p.editorChefeUserId ?? undefined, assigneeRole: p.editorChefeUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-sub-triagem-${row.id}` })
      for (const uid of await destinatariosEditoriais(tenantId, p)) await notify({ tenantId, userId: uid, assunto: `Nova submissão ${row.codigo}`, mensagem: `Novo manuscrito submetido a ${p.nome}: "${row.titulo}".`, refType: 'PesSubmissao', refId: row.id })
      await notify({ tenantId, userId: req.user!.id, assunto: `Submissão recebida (${row.codigo})`, mensagem: `Recebemos seu manuscrito "${row.titulo}". Você será avisado a cada etapa.`, refType: 'PesSubmissao', refId: row.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'SUBMETER_MANUSCRITO', refType: 'PesSubmissao', refId: row.id })
      res.status(201).json(row)
    }),
  )

  // Editor: triagem (desk review)
  router.post(
    '/submissoes/:id/triagem',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id), { periodico: true })
      await exigirEditor(req, s.periodicoId, tenantId)
      const d = parseBody(z.object({ aprovar: z.boolean(), observacao: z.string().trim().optional(), editorUserId: z.string().optional(), similaridadePct: z.number().min(0).max(100).optional(), secaoId: z.string().optional() }), req.body)
      if (!['SUBMETIDO', 'TRIAGEM'].includes(s.status)) throw httpErr(409, 'Submissão não está na fase de triagem.')
      if (!d.aprovar && !d.observacao) throw httpErr(400, 'Rejeição na triagem exige justificativa.')
      if (d.aprovar) {
        // checklist formal
        const falhas: string[] = []
        if (!s.declaracaoOriginalidade) falhas.push('Declaração de originalidade ausente.')
        if (!s.abstract && s.idioma !== 'pt-BR') falhas.push('Abstract ausente.')
        if (d.similaridadePct != null && d.similaridadePct > 30) falhas.push(`Similaridade ${d.similaridadePct}% acima do limite de 30% para triagem.`)
        if (falhas.length) return res.status(422).json({ error: 'Triagem não aprovada pelo checklist.', pendencias: falhas })
      }
      let row = s
      if (s.status === 'SUBMETIDO') row = await mudarStatus(tenantId, s, 'TRIAGEM', getUserId(req), { dataTriagem: new Date(), triagemObs: d.observacao ?? null, editorUserId: d.editorUserId ?? s.editorUserId ?? getUserId(req), similaridadePct: d.similaridadePct ?? null, secaoId: d.secaoId ?? s.secaoId })
      if (!d.aprovar) {
        row = await mudarStatus(tenantId, row, 'REJEITADO', getUserId(req), { dataDecisao: new Date(), motivoRejeicao: d.observacao })
        await prisma.pesDecisao.create({ data: { tenantId, submissaoId: s.id, rodada: s.rodada, decisao: 'REJEITAR_TRIAGEM', editorUserId: getUserId(req), justificativa: d.observacao, cartaAutor: d.observacao } })
        await completeReminders({ tenantId, refType: 'PesSubmissaoTriagem', refId: s.id, userId: getUserId(req) })
        await notifAutores(tenantId, s, `Manuscrito ${s.codigo}: não aceito para avaliação`, `Após triagem editorial, o manuscrito "${s.titulo}" não seguirá para revisão. Motivo: ${d.observacao}`)
      } else {
        await completeReminders({ tenantId, refType: 'PesSubmissaoTriagem', refId: s.id, userId: getUserId(req) })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Designar pareceristas — ${s.codigo}`, dueAt: addDays(new Date(), 5), severity: 'ATENCAO', refType: 'PesSubmissaoRevisores', refId: s.id, assigneeUserId: row.editorUserId ?? undefined, assigneeRole: row.editorUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-sub-designar-${s.id}-${s.rodada}` })
      }
      res.json(row)
    }),
  )

  // sugestão de pareceristas (sem conflito, por área e carga)
  router.get(
    '/submissoes/:id/sugestao-revisores',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id))
      await exigirEditor(req, s.periodicoId, tenantId)
      res.json({ sugestoes: await candidatos(tenantId, s) })
    }),
  )

  router.post(
    '/submissoes/:id/revisores',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id), { periodico: true })
      await exigirEditor(req, s.periodicoId, tenantId)
      const d = parseBody(z.object({ equipeIds: z.array(z.string()).min(1), prazoDias: z.number().int().min(7).max(120).optional(), forcarConflito: z.boolean().default(false) }), req.body)
      if (!['TRIAGEM', 'EM_REVISAO'].includes(s.status)) throw httpErr(409, 'Pareceristas só podem ser designados em TRIAGEM ou EM_REVISAO.')
      const sug = await candidatos(tenantId, s)
      const prazoDias = d.prazoDias ?? s.periodico.prazoRevisaoDias
      const criadas: any[] = []
      for (const eid of [...new Set(d.equipeIds)]) {
        const c = sug.find((x) => x.id === eid)
        if (!c) throw httpErr(404, `Parecerista ${eid} não encontrado na equipe ativa do periódico.`)
        if (c.bloqueado && !(d.forcarConflito && ehGestor(req))) throw httpErr(422, `${c.nome} não pode ser designado: ${c.motivos.join('; ')}.`)
        const prazo = addDays(new Date(), prazoDias)
        const token = novoToken()
        const rev = await prisma.pesRevisao.create({ data: { tenantId, submissaoId: s.id, rodada: s.rodada, equipeId: c.id, revisorUserId: c.userId ?? null, revisorNome: c.nome, revisorEmail: c.email ?? null, token, prazo } })
        criadas.push({ id: rev.id, revisorNome: rev.revisorNome, prazo })
        const resumo = `Convite para avaliar o manuscrito "${s.titulo}" (${s.periodico.nome}). Prazo para o parecer: ${prazo.toLocaleDateString('pt-BR')}. A avaliação é duplo-cega.`
        if (c.userId) await notify({ tenantId, userId: c.userId, assunto: `Convite de revisão — ${s.periodico.nome}`, mensagem: resumo, refType: 'PesRevisao', refId: rev.id })
        else if (c.email) await notify({ tenantId, canal: 'EMAIL', destino: c.email, assunto: `Convite de revisão — ${s.periodico.nome}`, mensagem: `${resumo} Acesse: /api/public/edu/pesquisa/${tenantId}/revisao/${token}`, refType: 'PesRevisao', refId: rev.id })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Responder convite de revisão — ${s.codigo}`, dueAt: addDays(new Date(), 7), antecedenciaDias: 3, refType: 'PesRevisaoConvite', refId: rev.id, assigneeUserId: c.userId ?? undefined, dedupeKey: `pes-rev-convite-${rev.id}` })
        await scheduleReminder({ tenantId, modulo: MOD, titulo: `Enviar parecer — ${s.codigo}`, dueAt: prazo, antecedenciaDias: 5, severity: 'ATENCAO', refType: 'PesRevisao', refId: rev.id, assigneeUserId: c.userId ?? undefined, dedupeKey: `pes-rev-prazo-${rev.id}` })
      }
      let sub = s
      if (s.status === 'TRIAGEM') sub = await mudarStatus(tenantId, s, 'EM_REVISAO', getUserId(req))
      await completeReminders({ tenantId, refType: 'PesSubmissaoRevisores', refId: s.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'DESIGNAR_PARECERISTAS', refType: 'PesSubmissao', refId: s.id, detalhes: { qtd: criadas.length } })
      res.status(201).json({ revisoes: criadas, status: sub.status })
    }),
  )

  router.get(
    '/submissoes/:id/revisoes',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id))
      await exigirEditor(req, s.periodicoId, tenantId)
      const revisoes = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id }, orderBy: [{ rodada: 'asc' }, { convidadoEm: 'asc' }], select: { id: true, rodada: true, equipeId: true, revisorNome: true, revisorEmail: true, status: true, convidadoEm: true, respondidoEm: true, prazo: true, concluidoEm: true, recomendacao: true, notas: true, notaMedia: true, comentarioAutor: true, comentarioEditor: true } })
      res.json({ revisoes, consolidado: consolidarRecomendacoes(revisoes.filter((r) => r.rodada === s.rodada && r.status === 'CONCLUIDO').map((r) => r.recomendacao as any)) })
    }),
  )

  router.post(
    '/revisoes/:id/cancelar',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.pesRevisao.findFirst({ where: { id: String(req.params.id), tenantId }, include: { submissao: true } })
      if (!r) return res.status(404).json({ error: 'Revisão não encontrada.' })
      await exigirEditor(req, r.submissao.periodicoId, tenantId)
      if (['CONCLUIDO', 'CANCELADO'].includes(r.status)) throw httpErr(409, 'Revisão não pode ser cancelada.')
      const row = await prisma.pesRevisao.update({ where: { id: r.id }, data: { status: 'CANCELADO' } })
      for (const rt of ['PesRevisao', 'PesRevisaoConvite']) await cancelReminders({ tenantId, refType: rt, refId: r.id })
      res.json(row)
    }),
  )

  // Parecerista autenticado
  router.get(
    '/minhas-revisoes',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const st = qs(req.query.status)
      const revs = await prisma.pesRevisao.findMany({ where: { tenantId, revisorUserId: req.user!.id, ...(st ? { status: st as any } : {}) }, orderBy: { prazo: 'asc' }, include: { submissao: { include: { versoes: { orderBy: { numero: 'desc' }, take: 1 } } } } })
      res.json({ items: revs.map((r) => ({ id: r.id, status: r.status, prazo: r.prazo, rodada: r.rodada, recomendacao: r.recomendacao, submissao: visaoRevisorDaSubmissao(r.submissao, r.submissao.versoes[0]) })) })
    }),
  )
  const minhaRevisao = async (req: AuthenticatedRequest) => {
    const r = await prisma.pesRevisao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
    if (!r) throw httpErr(404, 'Revisão não encontrada.')
    if (r.revisorUserId !== req.user!.id) throw httpErr(403, 'Esta revisão não é sua.')
    return r
  }
  router.post('/revisoes/:id/responder', requireRole(...DOCENTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { aceitar, motivo } = parseBody(z.object({ aceitar: z.boolean(), motivo: z.string().optional() }), req.body)
    res.json(await responderConvite(await minhaRevisao(req), aceitar, motivo))
  }))
  router.post('/revisoes/:id/parecer', requireRole(...DOCENTES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.status(201).json(await registrarParecer(await minhaRevisao(req), req.body))
  }))

  // Editor: decisão
  router.post(
    '/submissoes/:id/decisao',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id), { periodico: true })
      await exigirEditor(req, s.periodicoId, tenantId)
      const d = parseBody(z.object({ decisao: z.enum(['ACEITAR', 'REVISOES_MENORES', 'REVISOES_MAIORES', 'REJEITAR']), justificativa: z.string().trim().min(10), cartaAutor: z.string().trim().min(10), prazoRevisaoDias: z.number().int().min(7).max(180).optional(), forcar: z.boolean().default(false) }), req.body)
      if (!['EM_REVISAO', 'TRIAGEM'].includes(s.status)) throw httpErr(409, 'Decisão só pode ser registrada com o manuscrito em revisão.')
      const revs = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id, rodada: s.rodada } })
      const concl = revs.filter((r) => r.status === 'CONCLUIDO')
      const ativos = revs.filter((r) => ['CONVIDADO', 'ACEITO', 'CONCLUIDO'].includes(r.status))
      const exige = s.periodico.revisoresPorSubmissao
      const secao = s.secaoId ? await prisma.pesSecao.findFirst({ where: { id: s.secaoId } }) : null
      const semPares = secao && !secao.revisadaPorPares
      if (!semPares && concl.length < Math.min(exige, Math.max(1, ativos.length))) {
        if (!(d.forcar && ehGestor(req))) return res.status(422).json({ error: `Pareceres insuficientes: ${concl.length} concluído(s), ${exige} exigido(s). A coordenação pode forçar a decisão.` })
      }
      if (!semPares && !concl.length && !d.forcar) return res.status(422).json({ error: 'Nenhum parecer concluído.' })
      const alvo = DECISAO_PARA_STATUS[d.decisao]
      if (s.status === 'TRIAGEM' && d.decisao !== 'REJEITAR' && !semPares) throw httpErr(409, 'Aceite/revisões exigem passagem por revisão por pares (seção revisada por pares).')
      if (s.status === 'TRIAGEM' && alvo === 'REVISOES_SOLICITADAS') throw httpErr(409, 'Revisões não se aplicam a manuscrito em triagem.')
      const prazoAutor = alvo === 'REVISOES_SOLICITADAS' ? addDays(new Date(), d.prazoRevisaoDias ?? s.periodico.prazoAutorDias) : null
      const novoStatus = alvo
      if (!podeTransicionar(TRANSICOES_SUBMISSAO, s.status, novoStatus)) throw httpErr(409, `Transição inválida: ${s.status} → ${novoStatus}.`)
      await prisma.pesDecisao.create({ data: { tenantId, submissaoId: s.id, rodada: s.rodada, decisao: d.decisao, editorUserId: getUserId(req), justificativa: d.justificativa, cartaAutor: d.cartaAutor } })
      // pareceres pendentes são cancelados
      for (const r of revs.filter((x) => ['CONVIDADO', 'ACEITO'].includes(x.status))) {
        await prisma.pesRevisao.update({ where: { id: r.id }, data: { status: 'CANCELADO' } })
        for (const rt of ['PesRevisao', 'PesRevisaoConvite']) await cancelReminders({ tenantId, refType: rt, refId: r.id })
      }
      const row = await mudarStatus(tenantId, s, novoStatus, getUserId(req), { dataDecisao: new Date(), prazoAutorAte: prazoAutor, motivoRejeicao: d.decisao === 'REJEITAR' ? d.justificativa : null, editorUserId: s.editorUserId ?? getUserId(req) })
      await completeReminders({ tenantId, refType: 'PesSubmissaoDecisao', refId: s.id, userId: getUserId(req) })
      const comentarios = concl.filter((r) => r.comentarioAutor).map((r, i) => `Parecerista ${String.fromCharCode(65 + (i % 26))} (${r.recomendacao}): ${r.comentarioAutor}`).join('\n\n')
      await notifAutores(tenantId, s, `Decisão editorial — ${s.codigo}`, `${d.cartaAutor}${comentarios ? '\n\n' + comentarios : ''}${prazoAutor ? `\n\nPrazo para reenvio: ${prazoAutor.toLocaleDateString('pt-BR')}.` : ''}`)
      if (prazoAutor) await scheduleReminder({ tenantId, modulo: MOD, titulo: `Enviar revisão do manuscrito ${s.codigo}`, dueAt: prazoAutor, antecedenciaDias: 7, severity: 'ATENCAO', refType: 'PesSubmissaoAutor', refId: s.id, assigneeUserId: s.submissorUserId ?? undefined, assigneeStudentId: s.submissorStudentId ?? undefined, dedupeKey: `pes-sub-autor-${s.id}-${s.rodada}` })
      if (novoStatus === 'ACEITO') await scheduleReminder({ tenantId, modulo: MOD, titulo: `Encaminhar à editoração: ${s.codigo}`, dueAt: addDays(new Date(), 10), refType: 'PesSubmissaoEditoracao', refId: s.id, assigneeUserId: s.editorUserId ?? undefined, assigneeRole: s.editorUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-sub-editoracao-${s.id}` })
      res.json({ submissao: row, decisao: d.decisao })
    }),
  )

  // Autor: reenvio após revisões solicitadas
  router.post(
    '/submissoes/:id/revisao-autor',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id), { periodico: true })
      if (!ehAutor(req, s) && !ehGestor(req)) throw httpErr(403, 'Somente o submissor reenvia o manuscrito.')
      if (s.status !== 'REVISOES_SOLICITADAS') throw httpErr(409, 'Não há revisão solicitada para este manuscrito.')
      const d = parseBody(z.object({ arquivoUrl: z.string().min(3), cartaResposta: z.string().trim().min(30, 'A carta-resposta deve detalhar as alterações.'), resumoAlteracoes: z.string().optional(), reconvidarAnteriores: z.boolean().default(true) }), req.body)
      const atrasado = !!s.prazoAutorAte && s.prazoAutorAte < new Date()
      const nova = s.rodada + 1
      await prisma.pesSubmissaoVersao.create({ data: { tenantId, submissaoId: s.id, numero: s.versaoAtual + 1, rodada: nova, tipo: 'REVISAO', arquivoUrl: d.arquivoUrl, cartaResposta: d.cartaResposta, resumoAlteracoes: d.resumoAlteracoes ?? null, enviadoPorId: getUserId(req) } })
      const row = await mudarStatus(tenantId, s, 'EM_REVISAO', getUserId(req), { rodada: nova, versaoAtual: s.versaoAtual + 1, prazoAutorAte: null })
      await completeReminders({ tenantId, refType: 'PesSubmissaoAutor', refId: s.id, userId: getUserId(req) })
      let reconvidados = 0
      if (d.reconvidarAnteriores) {
        const anteriores = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id, rodada: s.rodada, status: 'CONCLUIDO' } })
        for (const a of anteriores) {
          const prazo = addDays(new Date(), Math.max(14, Math.round(s.periodico.prazoRevisaoDias / 2)))
          const rev = await prisma.pesRevisao.create({ data: { tenantId, submissaoId: s.id, rodada: nova, equipeId: a.equipeId, revisorUserId: a.revisorUserId, revisorNome: a.revisorNome, revisorEmail: a.revisorEmail, token: novoToken(), prazo } })
          reconvidados++
          if (a.revisorUserId) await notify({ tenantId, userId: a.revisorUserId, assunto: `Nova versão para reavaliação — ${s.periodico.nome}`, mensagem: `O manuscrito "${s.titulo}" foi revisado pelos autores. Responda ao convite e envie novo parecer até ${prazo.toLocaleDateString('pt-BR')}.`, refType: 'PesRevisao', refId: rev.id })
          else if (a.revisorEmail) await notify({ tenantId, canal: 'EMAIL', destino: a.revisorEmail, assunto: `Nova versão para reavaliação — ${s.periodico.nome}`, mensagem: `Manuscrito revisado. Acesse: /api/public/edu/pesquisa/${tenantId}/revisao/${rev.token}`, refType: 'PesRevisao', refId: rev.id })
          await scheduleReminder({ tenantId, modulo: MOD, titulo: `Enviar parecer (rodada ${nova}) — ${s.codigo}`, dueAt: prazo, antecedenciaDias: 5, refType: 'PesRevisao', refId: rev.id, assigneeUserId: a.revisorUserId ?? undefined, dedupeKey: `pes-rev-prazo-${rev.id}` })
        }
      }
      for (const uid of await destinatariosEditoriais(tenantId, s.periodico, s)) await notify({ tenantId, userId: uid, assunto: `Revisão recebida — ${s.codigo}`, mensagem: `Os autores enviaram a versão ${s.versaoAtual + 1}${atrasado ? ' (fora do prazo)' : ''}. ${reconvidados ? reconvidados + ' parecerista(s) reconvidado(s).' : 'Designe pareceristas.'}`, refType: 'PesSubmissao', refId: s.id })
      res.json({ submissao: row, reconvidados, foraDoPrazo: atrasado })
    }),
  )

  router.post(
    '/submissoes/:id/retirar',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id))
      if (!ehAutor(req, s) && !(await ehEditor(req, s.periodicoId, tenantId))) throw httpErr(403, 'Sem permissão.')
      const row = await mudarStatus(tenantId, s, 'RETIRADO', getUserId(req), { motivoRejeicao: String(req.body?.motivo ?? 'Retirado pelo autor') })
      for (const rt of ['PesSubmissaoTriagem', 'PesSubmissaoRevisores', 'PesSubmissaoDecisao', 'PesSubmissaoAutor', 'PesSubmissaoEditoracao', 'PesSubmissao']) await cancelReminders({ tenantId, refType: rt, refId: s.id })
      const revs = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id, status: { in: ['CONVIDADO', 'ACEITO'] } } })
      for (const r of revs) { await prisma.pesRevisao.update({ where: { id: r.id }, data: { status: 'CANCELADO' } }); for (const rt of ['PesRevisao', 'PesRevisaoConvite']) await cancelReminders({ tenantId, refType: rt, refId: r.id }) }
      res.json(row)
    }),
  )

  // Editoração: ACEITO -> EDITORACAO (define edição/seção, DOI, páginas) e versões de editoração
  router.post(
    '/submissoes/:id/editoracao',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id))
      await exigirEditor(req, s.periodicoId, tenantId)
      const d = parseBody(z.object({ edicaoId: z.string(), secaoId: z.string().optional(), doi: z.string().optional(), paginaInicial: z.number().int().min(1).optional(), paginaFinal: z.number().int().min(1).optional(), ordemNaEdicao: z.number().int().min(1).optional() }), req.body)
      const ed = await prisma.pesEdicao.findFirst({ where: { id: d.edicaoId, tenantId, periodicoId: s.periodicoId } })
      if (!ed) throw httpErr(404, 'Edição não encontrada neste periódico.')
      if (ed.status === 'PUBLICADA') throw httpErr(409, 'Edição já publicada.')
      let doi: string | null = null
      if (d.doi) { doi = normalizarDoi(d.doi); if (!doi) throw httpErr(400, 'DOI inválido.') }
      if (d.paginaInicial && d.paginaFinal && d.paginaFinal < d.paginaInicial) throw httpErr(400, 'Página final menor que a inicial.')
      const row = s.status === 'ACEITO' ? await mudarStatus(tenantId, s, 'EDITORACAO', getUserId(req), { edicaoId: ed.id, secaoId: d.secaoId ?? s.secaoId, doi, paginaInicial: d.paginaInicial ?? null, paginaFinal: d.paginaFinal ?? null, ordemNaEdicao: d.ordemNaEdicao ?? null }) : s.status === 'EDITORACAO' ? await prisma.pesSubmissao.update({ where: { id: s.id }, data: { edicaoId: ed.id, secaoId: d.secaoId ?? s.secaoId, doi: doi ?? s.doi, paginaInicial: d.paginaInicial ?? s.paginaInicial, paginaFinal: d.paginaFinal ?? s.paginaFinal, ordemNaEdicao: d.ordemNaEdicao ?? s.ordemNaEdicao } }) : (() => { throw httpErr(409, 'A submissão precisa estar ACEITO ou EDITORACAO.') })()
      await prisma.pesEdicao.update({ where: { id: ed.id }, data: { status: 'EM_EDICAO' } })
      await completeReminders({ tenantId, refType: 'PesSubmissaoEditoracao', refId: s.id, userId: getUserId(req) })
      res.json(row)
    }),
  )

  router.post(
    '/submissoes/:id/versoes',
    requireRole(...TODOS),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const s = await carregarSub(req, String(req.params.id))
      const editor = await ehEditor(req, s.periodicoId, tenantId)
      if (!editor && !ehAutor(req, s)) throw httpErr(403, 'Sem permissão.')
      const d = parseBody(z.object({ tipo: z.enum(['FINAL', 'EDITORACAO']), arquivoUrl: z.string().min(3), resumoAlteracoes: z.string().optional() }), req.body)
      if (!['ACEITO', 'EDITORACAO'].includes(s.status)) throw httpErr(409, 'Versão final/editoração só após o aceite.')
      if (d.tipo === 'EDITORACAO' && !editor) throw httpErr(403, 'Somente a equipe editorial envia a versão diagramada.')
      const v = await prisma.pesSubmissaoVersao.create({ data: { tenantId, submissaoId: s.id, numero: s.versaoAtual + 1, rodada: s.rodada, tipo: d.tipo, arquivoUrl: d.arquivoUrl, resumoAlteracoes: d.resumoAlteracoes ?? null, enviadoPorId: getUserId(req) } })
      await prisma.pesSubmissao.update({ where: { id: s.id }, data: { versaoAtual: s.versaoAtual + 1 } })
      res.status(201).json(v)
    }),
  )

  router.get(
    '/periodicos/:id/estatisticas',
    requireRole(...DOCENTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      await exigirEditor(req, id, tenantId)
      const ano = qs(req.query.ano) ? parseInt(qs(req.query.ano)!, 10) : undefined
      const subs = await prisma.pesSubmissao.findMany({ where: { tenantId, periodicoId: id, ...(ano ? { dataSubmissao: { gte: new Date(Date.UTC(ano, 0, 1)), lt: new Date(Date.UTC(ano + 1, 0, 1)) } } : {}) }, select: { status: true, dataSubmissao: true, dataDecisao: true, dataPublicacao: true, rodada: true } })
      const revs = await prisma.pesRevisao.findMany({ where: { tenantId, submissao: { periodicoId: id } }, select: { status: true, convidadoEm: true, concluidoEm: true, prazo: true } })
      const concl = revs.filter((r) => r.status === 'CONCLUIDO' && r.concluidoEm)
      const tempoMedioParecer = concl.length ? Math.round((concl.reduce((a, r) => a + (r.concluidoEm!.getTime() - r.convidadoEm.getTime()) / 86_400_000, 0) / concl.length) * 10) / 10 : null
      const noPrazo = concl.length ? Math.round((concl.filter((r) => r.concluidoEm! <= r.prazo).length / concl.length) * 1000) / 10 : null
      const recusas = revs.filter((r) => r.status === 'RECUSADO').length
      res.json({ ...estatisticasPeriodico(subs), pareceristas: { convites: revs.length, concluidos: concl.length, recusados: recusas, expirados: revs.filter((r) => r.status === 'EXPIRADO').length, tempoMedioParecerDias: tempoMedioParecer, percentualNoPrazo: noPrazo }, mediaRodadas: subs.length ? Math.round((subs.reduce((a, s) => a + s.rodada, 0) / subs.length) * 100) / 100 : null })
    }),
  )

  // ---------- Job ----------
  registerEduJob('pesquisa:periodico-prazos', async () => {
    const agora = new Date()
    // convites sem resposta em 10 dias expiram
    const conv = await prisma.pesRevisao.findMany({ where: { status: 'CONVIDADO', convidadoEm: { lt: addDays(agora, -10) } }, include: { submissao: { include: { periodico: true } } }, take: 500 })
    for (const r of conv) {
      await prisma.pesRevisao.update({ where: { id: r.id }, data: { status: 'EXPIRADO' } })
      await cancelReminders({ tenantId: r.tenantId, refType: 'PesRevisaoConvite', refId: r.id })
      await cancelReminders({ tenantId: r.tenantId, refType: 'PesRevisao', refId: r.id })
      await scheduleReminder({ tenantId: r.tenantId, modulo: MOD, titulo: `Convite expirou sem resposta (${r.revisorNome}) — ${r.submissao.codigo}: convide outro parecerista`, dueAt: addDays(agora, 3), remindAt: agora, severity: 'ATENCAO', refType: 'PesSubmissao', refId: r.submissaoId, assigneeUserId: r.submissao.editorUserId ?? r.submissao.periodico.editorChefeUserId ?? undefined, assigneeRole: r.submissao.editorUserId || r.submissao.periodico.editorChefeUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-rev-expirado-${r.id}` })
    }
    // pareceres atrasados: avisa o editor (os lembretes do parecerista já escalam sozinhos)
    const atras = await prisma.pesRevisao.findMany({ where: { status: 'ACEITO', prazo: { lt: agora } }, include: { submissao: { include: { periodico: true } } }, take: 500 })
    for (const r of atras) {
      await scheduleReminder({ tenantId: r.tenantId, modulo: MOD, titulo: `Parecer atrasado (${r.revisorNome}) — ${r.submissao.codigo}`, dueAt: agora, remindAt: agora, severity: 'CRITICO', refType: 'PesSubmissao', refId: r.submissaoId, assigneeUserId: r.submissao.editorUserId ?? r.submissao.periodico.editorChefeUserId ?? undefined, assigneeRole: r.submissao.editorUserId || r.submissao.periodico.editorChefeUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-rev-atrasado-${r.id}` })
    }
    // autores com prazo de revisão vencido
    const aut = await prisma.pesSubmissao.findMany({ where: { status: 'REVISOES_SOLICITADAS', prazoAutorAte: { lt: agora } }, include: { periodico: true }, take: 500 })
    for (const s of aut) {
      await scheduleReminder({ tenantId: s.tenantId, modulo: MOD, titulo: `Autores não reenviaram ${s.codigo} no prazo — rejeitar/retirar ou prorrogar`, dueAt: agora, remindAt: agora, severity: 'ATENCAO', refType: 'PesSubmissao', refId: s.id, assigneeUserId: s.editorUserId ?? s.periodico.editorChefeUserId ?? undefined, assigneeRole: s.editorUserId || s.periodico.editorChefeUserId ? undefined : 'COORDINATOR', dedupeKey: `pes-sub-autor-vencido-${s.id}-${s.rodada}` })
    }
    return { convitesExpirados: conv.length, pareceresAtrasados: atras.length, autoresVencidos: aut.length }
  })
}

async function notifAutores(tenantId: string, s: any, assunto: string, mensagem: string) {
  if (s.submissorUserId) await notify({ tenantId, userId: s.submissorUserId, assunto, mensagem, refType: 'PesSubmissao', refId: s.id })
  else if (s.submissorStudentId) await notify({ tenantId, studentId: s.submissorStudentId, assunto, mensagem, refType: 'PesSubmissao', refId: s.id })
  const autores: any[] = Array.isArray(s.autores) ? s.autores : []
  for (const a of autores.filter((x) => x.correspondente && x.email)) await notify({ tenantId, canal: 'EMAIL', destino: a.email, assunto, mensagem, refType: 'PesSubmissao', refId: s.id })
}

async function candidatos(tenantId: string, s: any) {
  const equipe = await prisma.pesPeriodicoEquipe.findMany({ where: { tenantId, periodicoId: s.periodicoId, ativo: true, papel: { in: ['PARECERISTA', 'EDITOR_ASSOCIADO', 'EDITOR_SECAO'] } } })
  const cargas = await prisma.pesRevisao.groupBy({ by: ['equipeId'], where: { tenantId, status: { in: ['CONVIDADO', 'ACEITO'] }, equipeId: { in: equipe.map((e) => e.id) } }, _count: true })
  const atuais = await prisma.pesRevisao.findMany({ where: { submissaoId: s.id, rodada: s.rodada, status: { in: ['CONVIDADO', 'ACEITO', 'CONCLUIDO'] } }, select: { equipeId: true } })
  const cm = new Map(cargas.map((c) => [c.equipeId, c._count]))
  const ja = new Set(atuais.map((a) => a.equipeId))
  const lista = sugerirRevisores(
    equipe.map((e) => ({ id: e.id, nome: e.nome, email: e.email, instituicao: e.instituicao, areas: e.areas, cargaAtual: cm.get(e.id) ?? 0, userId: e.userId, jaAtribuido: ja.has(e.id) })),
    { areas: s.palavrasChave ?? [], autores: Array.isArray(s.autores) ? s.autores : [], submissorUserId: s.submissorUserId },
  )
  return lista
}

export { CRITERIOS_PARECER, visaoRevisorDaSubmissao }
