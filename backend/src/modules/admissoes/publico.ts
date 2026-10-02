import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { asyncHandler } from '../academico/middleware'
import { dateISO, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { gerarProtocolo, normalizarCpf, validarCpf } from './logic'
import { gerarCobrancaInscricao, httpErr } from './services'

// Rotas PÚBLICAS (sem login) — /api/public/edu/admissoes
// O tenant vem em ?tenant=<id> ou no cabeçalho x-tenant-id.
export const publicRouter = Router()

// ---------- Anti-spam simples (rate limit em memória por IP + honeypot) ----------
const hits = new Map<string, number[]>()
function limitar(chave: string, max: number, janelaMs: number) {
  const agora = Date.now()
  const lista = (hits.get(chave) ?? []).filter((t) => agora - t < janelaMs)
  if (lista.length >= max) throw httpErr(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.')
  lista.push(agora)
  hits.set(chave, lista)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => agora - t < janelaMs)) hits.delete(k)
}
// req.ip respeita 'trust proxy' (TRUST_PROXY=true); ler x-forwarded-for direto permitiria burlar o rate limit forjando o cabeçalho.
const ip = (req: Request) => String(req.ip ?? req.socket?.remoteAddress ?? 'ip')

async function tenantDe(req: Request): Promise<string> {
  const t = String(req.headers['x-tenant-id'] ?? qs(req.query.tenant) ?? (req.body as any)?.tenant ?? '').trim()
  if (!t || t.length > 100) throw httpErr(400, 'Instituição não informada (parâmetro tenant).')
  const existe = await prisma.admProcessoSeletivo.findFirst({ where: { tenantId: t }, select: { id: true } }) ?? (await prisma.eduInstitution.findUnique({ where: { tenantId: t }, select: { id: true } }))
  if (!existe) throw httpErr(404, 'Instituição não encontrada.')
  return t
}

// ---------- Processos e ofertas abertos ----------
publicRouter.get('/processos', asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await tenantDe(req)
  const agora = new Date()
  const ps = await prisma.admProcessoSeletivo.findMany({
    where: { tenantId, status: 'ABERTO', inscricaoInicio: { lte: agora }, inscricaoFim: { gte: agora } },
    include: { ofertas: { where: { ativo: true, vagas: { gt: 0 } }, orderBy: { nomeCurso: 'asc' } } },
    orderBy: { inscricaoFim: 'asc' },
  })
  const inst = await prisma.eduInstitution.findUnique({ where: { tenantId }, select: { nome: true, sigla: true } })
  res.json({
    instituicao: inst,
    processos: ps.map((p) => ({
      id: p.id, codigo: p.codigo, nome: p.nome, tipo: p.tipo, nivel: p.nivel, edital: p.edital, editalUrl: p.editalUrl,
      inscricaoInicio: p.inscricaoInicio, inscricaoFim: p.inscricaoFim, provaData: p.provaData, resultadoData: p.resultadoData, taxaInscricao: p.taxaInscricao,
      ofertas: p.ofertas.map((o) => ({ id: o.id, nomeCurso: o.nomeCurso, turno: o.turno, modalidade: o.modalidade, poloNome: o.poloNome, vagas: o.vagas, valorMensalidade: o.valorMensalidade, parcelas: o.parcelas })),
    })),
  })
}))

// ---------- Inscrição ----------
const inscricaoSchema = z.object({
  processoId: z.string(),
  ofertaId: z.string(),
  ofertaId2: z.string().optional().nullable(),
  nome: z.string().min(5).max(150),
  cpf: z.string(),
  email: z.string().email(),
  telefone: z.string().min(8).max(20),
  dataNascimento: dateISO().optional(),
  cota: z.string().max(60).optional(),
  consentimentoLgpd: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar o termo de consentimento (LGPD).' }) } as any),
  aceitaComunicacoes: z.boolean().optional(),   // opt-in de marketing: opcional, nunca pré-marcado
  utmSource: z.string().max(100).optional(), utmMedium: z.string().max(100).optional(), utmCampaign: z.string().max(150).optional(),
  website: z.string().optional(),                 // honeypot: humanos não preenchem
  tempoPreenchimentoMs: z.number().optional(),    // opcional: tempo entre abrir e enviar o formulário
  dados: z.record(z.string(), z.any()).optional(),
})

publicRouter.post('/inscricoes', asyncHandler(async (req: Request, res: Response) => {
  limitar(`insc:${ip(req)}`, 5, 10 * 60_000)
  const tenantId = await tenantDe(req)
  const b = parseBody(inscricaoSchema, req.body)
  if (b.website) return res.status(201).json({ protocolo: gerarProtocolo(), situacao: 'INSCRITO' }) // bot: finge sucesso
  if (b.tempoPreenchimentoMs != null && b.tempoPreenchimentoMs < 3000) throw httpErr(429, 'Envio rápido demais. Tente novamente.')
  const cpf = normalizarCpf(b.cpf)
  if (!validarCpf(cpf)) throw httpErr(400, 'CPF inválido.')
  if (b.ofertaId2 && b.ofertaId2 === b.ofertaId) throw httpErr(400, 'A segunda opção deve ser diferente da primeira.')
  const agora = new Date()
  const p = await prisma.admProcessoSeletivo.findFirst({ where: { id: b.processoId, tenantId } })
  if (!p || p.status !== 'ABERTO' || p.inscricaoInicio > agora || p.inscricaoFim < agora) throw httpErr(409, 'Inscrições não estão abertas para este processo.')
  const ofertas = await prisma.admOferta.findMany({ where: { tenantId, processoId: p.id, ativo: true, id: { in: [b.ofertaId, ...(b.ofertaId2 ? [b.ofertaId2] : [])] } } })
  if (!ofertas.some((o) => o.id === b.ofertaId) || (b.ofertaId2 && !ofertas.some((o) => o.id === b.ofertaId2))) throw httpErr(400, 'Curso/oferta inválido para este processo.')
  const camp = b.utmCampaign ? await prisma.admCampanha.findFirst({ where: { tenantId, utmCampaign: b.utmCampaign } }) : null
  const base = {
    processoId: p.id, ofertaId: b.ofertaId, ofertaId2: b.ofertaId2 ?? null, nome: b.nome.trim(), cpf, email: b.email.toLowerCase(), telefone: b.telefone,
    dataNascimento: b.dataNascimento, cota: b.cota, status: 'INSCRITO' as const, etapaMaxima: 1, consentimentoLgpd: true, consentimentoEm: agora, consentimentoMarketing: b.aceitaComunicacoes === true, consentimentoMarketingEm: b.aceitaComunicacoes === true ? agora : null, ipOrigem: ip(req),
    utmSource: b.utmSource, utmMedium: b.utmMedium, utmCampaign: b.utmCampaign, campanhaId: camp?.id, origem: b.utmSource ? String(b.utmSource).toUpperCase() : 'SITE', dados: b.dados as any,
  }
  // Verificação de duplicidade + criação sob trava (advisory lock por processo+CPF): o schema não tem unique (processo, cpf),
  // então envios simultâneos criariam candidatos duplicados.
  const cand = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`adm-insc:${tenantId}:${p.id}:${cpf}`}))`
    if (await tx.admCandidato.findFirst({ where: { tenantId, processoId: p.id, cpf }, select: { id: true } })) throw httpErr(409, 'Já existe inscrição para este CPF neste processo. Use a consulta por protocolo.')
    // Promove lead existente (mesmo CPF/e-mail) em vez de duplicar
    const lead = await tx.admCandidato.findFirst({ where: { tenantId, processoId: null, OR: [{ cpf }, { email: base.email }] } })
    return lead
      ? tx.admCandidato.update({ where: { id: lead.id }, data: { ...base, campanhaId: lead.campanhaId ?? base.campanhaId, origem: lead.origem ?? base.origem } })
      : tx.admCandidato.create({ data: { tenantId, protocolo: gerarProtocolo(), ...base } })
  }, { timeout: 15_000 })
  await prisma.admInteracao.create({ data: { tenantId, candidatoId: cand.id, tipo: 'SISTEMA', descricao: `Inscrição online no processo ${p.nome}` } })
  const cobranca = await gerarCobrancaInscricao({ tenantId, candidatoId: cand.id })
  await audit({ tenantId, modulo: 'admissoes', acao: 'INSCRICAO_PUBLICA', refType: 'AdmCandidato', refId: cand.id })
  res.status(201).json({
    protocolo: cand.protocolo, situacao: 'INSCRITO', processo: p.nome,
    taxa: cobranca ? { valor: cobranca.valor, vencimento: cobranca.dataVencimento, cobrancaId: cobranca.id, status: cobranca.status } : { valor: 0, isenta: true },
    mensagem: cobranca ? 'Inscrição registrada. Pague a taxa para homologá-la; use o protocolo e o CPF para acompanhar.' : 'Inscrição registrada. Use o protocolo e o CPF para acompanhar.',
  })
}))

// ---------- Captura de lead (landing page) ----------
publicRouter.post('/leads', asyncHandler(async (req: Request, res: Response) => {
  limitar(`lead:${ip(req)}`, 10, 10 * 60_000)
  const tenantId = await tenantDe(req)
  const b = parseBody(z.object({
    nome: z.string().min(3).max(150), email: z.string().email().optional(), telefone: z.string().min(8).max(20).optional(),
    consentimentoLgpd: z.literal(true), aceitaComunicacoes: z.boolean().optional(), interesse: z.string().max(150).optional(),
    utmSource: z.string().max(100).optional(), utmMedium: z.string().max(100).optional(), utmCampaign: z.string().max(150).optional(), website: z.string().optional(),
  }), req.body)
  if (b.website) return res.status(201).json({ ok: true })
  if (!b.email && !b.telefone) throw httpErr(400, 'Informe e-mail ou telefone.')
  const email = b.email?.toLowerCase()
  const dup = await prisma.admCandidato.findFirst({ where: { tenantId, OR: [...(email ? [{ email }] : []), ...(b.telefone ? [{ telefone: b.telefone }] : [])] }, select: { id: true } })
  if (dup) return res.status(201).json({ ok: true })
  const camp = b.utmCampaign ? await prisma.admCampanha.findFirst({ where: { tenantId, utmCampaign: b.utmCampaign } }) : null
  const c = await prisma.admCandidato.create({ data: { tenantId, protocolo: gerarProtocolo(), nome: b.nome.trim(), email, telefone: b.telefone, status: 'LEAD', consentimentoLgpd: true, consentimentoEm: new Date(), consentimentoMarketing: b.aceitaComunicacoes === true, consentimentoMarketingEm: b.aceitaComunicacoes === true ? new Date() : null, ipOrigem: ip(req), origem: b.utmSource?.toUpperCase() ?? 'SITE', utmSource: b.utmSource, utmMedium: b.utmMedium, utmCampaign: b.utmCampaign, campanhaId: camp?.id, dados: b.interesse ? { interesse: b.interesse } : undefined } })
  await prisma.admInteracao.create({ data: { tenantId, candidatoId: c.id, tipo: 'SISTEMA', descricao: `Lead capturado${b.interesse ? ` (interesse: ${b.interesse})` : ''}` } })
  res.status(201).json({ ok: true })
}))

// ---------- Consulta de situação por protocolo + CPF ----------
async function consultar(req: Request, res: Response) {
  limitar(`cons:${ip(req)}`, 20, 10 * 60_000)
  const tenantId = await tenantDe(req)
  const src: any = req.method === 'GET' ? req.query : req.body
  const protocolo = String(src.protocolo ?? '').trim().toUpperCase()
  const cpf = normalizarCpf(src.cpf)
  const c = protocolo && cpf ? await prisma.admCandidato.findFirst({ where: { tenantId, protocolo, cpf }, include: { processo: true, convocacoes: { orderBy: { createdAt: 'desc' }, take: 1 } } }) : null
  if (!c) return res.status(404).json({ error: 'Protocolo ou CPF não conferem.' })
  const resultadoPublicado = !!c.processo && ['CLASSIFICADO', 'EM_CONVOCACAO', 'FINALIZADO'].includes(c.processo.status) && (!c.processo.resultadoData || c.processo.resultadoData <= new Date())
  const rec = c.taxaReceivableId ? await prisma.accountReceivable.findFirst({ where: { id: c.taxaReceivableId, tenantId }, select: { status: true, valor: true, dataVencimento: true } }) : null
  const conv = c.convocacoes[0]
  res.json({
    protocolo: c.protocolo, nome: c.nome, processo: c.processo?.nome ?? null, situacao: c.status,
    taxa: rec ? { status: rec.status, valor: rec.valor, vencimento: rec.dataVencimento } : { isenta: c.taxaPaga },
    resultado: resultadoPublicado ? { notaFinal: c.notaFinal, classificacao: c.classificacao, situacao: c.situacaoClassificacao } : null,
    convocacao: conv && conv.status === 'CONVOCADO' ? { prazoMatricula: conv.prazo } : null,
  })
}
publicRouter.get('/consulta', asyncHandler(consultar as any))
publicRouter.post('/consulta', asyncHandler(consultar as any))

publicRouter.use((err: any, _req: Request, res: Response, next: any) => {
  if (res.headersSent) return next(err)
  const status = err?.status || 500
  if (status >= 500) console.error('[adm-public]', err)
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor.' : err.message })
})
