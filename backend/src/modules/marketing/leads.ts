// Captura, scoring, distribuição, cadências e integração com o funil de Admissões.
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { gerarProtocolo } from '../admissoes/logic'
import { sincronizarMarketing } from '../lgpd/consentimentos'
import { hashIp, hashUa, mascararEmail } from '../lgpd/mascara'
import { db, getConfig, hashId, normEmail, normFone, ORIGENS, sha } from './common'
import { chavesDe, estaSuprimido } from './compliance'
import { clampScore, eventoDeOrigem, origemPorUtm, REGRAS_PADRAO, temperatura } from './logic'
import { enviar } from './envio'

export interface CapturaInput {
  tenantId: string; nome: string; email?: string | null; telefone?: string | null; cpf?: string | null
  curso?: string | null; origem?: string | null; detalheOrigem?: string | null
  utm?: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string }
  campanhaId?: string | null; formularioId?: string | null; paginaId?: string | null; cupom?: string | null; indicacao?: string | null; convenio?: string | null
  extras?: Record<string, any>
  consentimento: { contato: boolean; marketing: boolean; texto: string; versao: string; origem: string; url?: string | null; canais?: string[] }
  ip?: string | null; ua?: string | null; menor?: boolean
}

export async function regrasDoTenant(tenantId: string): Promise<Record<string, number>> {
  const rows = await db.mktScoreRegra.findMany({ where: { tenantId } })
  const m = { ...REGRAS_PADRAO }
  for (const r of rows) { if (r.ativo) m[r.evento] = r.pontos; else delete m[r.evento] }
  return m
}

/** Registra evento e recalcula score/temperatura. dedupe evita pontuar o mesmo fato duas vezes. */
export async function registrarEvento(tenantId: string, leadId: string, tipo: string, opts: { descricao?: string; dados?: any; dedupe?: string; userId?: string; pontos?: number } = {}) {
  const regras = await regrasDoTenant(tenantId)
  const pontos = opts.pontos ?? regras[tipo] ?? 0
  try {
    await db.mktLeadEvento.create({ data: { tenantId, leadId, tipo, pontos, descricao: opts.descricao, dados: opts.dados, dedupe: opts.dedupe, userId: opts.userId } })
  } catch (e: any) {
    if (e?.code === 'P2002') return null
    throw e
  }
  return recalcular(tenantId, leadId)
}
export async function recalcular(tenantId: string, leadId: string) {
  const agg = await db.mktLeadEvento.aggregate({ where: { tenantId, leadId }, _sum: { pontos: true } })
  const score = clampScore(agg._sum.pontos ?? 0)
  const lead = await db.mktLead.findUnique({ where: { id: leadId } })
  const data: any = { score, temperatura: temperatura(score), ultimaInteracaoEm: new Date() }
  return db.mktLead.update({ where: { id: leadId }, data, select: { id: true, score: true, temperatura: true, etapa: lead ? true : undefined } })
}

/** Escolhe o consultor: ativo, que atende o curso/origem, com menor carga ponderada; empate => atribuição mais antiga. */
export async function escolherConsultor(tenantId: string, curso?: string | null, origem?: string | null) {
  const cs = await db.mktConsultor.findMany({ where: { tenantId, ativo: true } })
  const aptos = cs.filter((c: any) => (!c.cursos.length || (curso && c.cursos.some((x: string) => x.toLowerCase() === curso.toLowerCase()))) && (!c.origens.length || (origem && c.origens.includes(origem))))
  if (!aptos.length) return null
  const cargas = await db.mktLead.groupBy({ by: ['consultorId'], where: { tenantId, etapa: { in: ['NOVO', 'CONTATO', 'QUALIFICADO'] }, consultorId: { in: aptos.map((c: any) => c.id) } }, _count: { _all: true } })
  const cm = new Map<string, number>(cargas.map((g: any) => [g.consultorId, g._count._all]))
  aptos.sort((a: any, b: any) => ((cm.get(a.id) ?? 0) / a.peso) - ((cm.get(b.id) ?? 0) / b.peso) || (a.ultimaAtribuicaoEm?.getTime() ?? 0) - (b.ultimaAtribuicaoEm?.getTime() ?? 0))
  return aptos[0]
}
export async function distribuir(tenantId: string, leadId: string, forcar = false) {
  const lead = await db.mktLead.findFirst({ where: { id: leadId, tenantId } })
  if (!lead || (lead.consultorId && !forcar)) return lead
  const c = await escolherConsultor(tenantId, lead.cursoInteresse, lead.origem)
  if (!c) return lead
  const cfg = await getConfig(tenantId)
  await db.mktConsultor.update({ where: { id: c.id }, data: { ultimaAtribuicaoEm: new Date() } })
  const up = await db.mktLead.update({ where: { id: leadId }, data: { consultorId: c.id, consultorNome: c.nome, atribuidoEm: new Date(), proximoContatoEm: new Date(Date.now() + cfg.slaPrimeiroContatoMin * 60_000) } })
  await db.mktLeadEvento.create({ data: { tenantId, leadId, tipo: 'ATRIBUIDO', descricao: `Distribuído para ${c.nome}` } })
  return up
}

async function resolverAtribuicao(i: CapturaInput) {
  let { campanhaId } = i
  let origem = i.origem || origemPorUtm(i.utm?.utmSource, i.utm?.utmMedium) || 'SITE'
  let midia: any = null
  if (i.cupom) {
    midia = await db.mktMidiaOffline.findFirst({ where: { tenantId: i.tenantId, cupom: { equals: i.cupom.trim(), mode: 'insensitive' } } })
    if (midia) { origem = midia.tipo === 'PANFLETAGEM' ? 'PANFLETAGEM' : ['RADIO', 'TV', 'OUTDOOR'].includes(midia.tipo) ? midia.tipo : origem; campanhaId = campanhaId ?? midia.campanhaId }
  }
  if (!campanhaId && i.utm?.utmCampaign) {
    const c = await db.mktCampanha.findFirst({ where: { tenantId: i.tenantId, utmCampaign: i.utm.utmCampaign } })
    if (c) campanhaId = c.id
  }
  return { origem, campanhaId, midia }
}

/** Captura/atualiza um lead (dedupe por e-mail ou telefone), registra a PROVA DE CONSENTIMENTO, pontua, distribui, cria candidato no funil de admissões e inicia cadências. */
export async function capturarLead(i: CapturaInput) {
  const { tenantId } = i
  const email = normEmail(i.email); const tel = normFone(i.telefone)
  if (!email && !tel) throw Object.assign(new Error('Informe e-mail ou telefone válido.'), { status: 400 })
  if (!i.consentimento.contato) throw Object.assign(new Error('É necessário aceitar o tratamento dos dados para contato (LGPD).'), { status: 400 })
  const { origem, campanhaId, midia } = await resolverAtribuicao(i)
  const existente = await db.mktLead.findFirst({ where: { tenantId, OR: [...(email ? [{ emailNorm: email }] : []), ...(tel ? [{ telefone: tel }] : [])] } })
  const sup = await estaSuprimido(tenantId, { email, telefone: tel })
  // Quem está suprimido pode se cadastrar de novo; só um opt-in EXPLÍCITO e novo reativa o marketing (evento registrado).
  const marketing = !!i.consentimento.marketing
  const ipHash = hashIp(i.ip, tenantId); const uaHash = hashUa(i.ua, tenantId)
  let lead = existente
  let novo = false
  if (!lead) {
    novo = true
    lead = await db.mktLead.create({ data: {
      tenantId, nome: i.nome.trim(), email: email ? i.email!.trim() : null, emailNorm: email, telefone: tel,
      cpfHash: i.cpf ? hashId(tenantId, 'DOCUMENTO', String(i.cpf).replace(/\D+/g, '')) : null,
      cursoInteresse: i.curso ?? null, origem, detalheOrigem: i.detalheOrigem, ...(i.utm ?? {}), campanhaId, formularioId: i.formularioId, paginaId: i.paginaId,
      cupom: i.cupom ?? null, midiaOfflineId: midia?.id, indicacaoCodigo: i.indicacao ?? null, convenio: i.convenio, consentimentoMarketing: marketing,
      consentimentoEm: new Date(), menor: !!i.menor, ipHash, extras: i.extras as any,
    } })
    await registrarEvento(tenantId, lead.id, 'CAPTURA', { descricao: `Captura via ${origem}`, dados: { origem, utm: i.utm, formularioId: i.formularioId, campanhaId }, dedupe: `captura:${Date.now()}` })
    const ev = eventoDeOrigem(origem); if (ev) await registrarEvento(tenantId, lead.id, ev, { dedupe: `origem` })
    if (tel) await registrarEvento(tenantId, lead.id, 'TEM_TELEFONE', { dedupe: 'tel' })
    if (i.curso) await registrarEvento(tenantId, lead.id, 'CURSO_INFORMADO', { dedupe: 'curso' })
  } else {
    await db.mktLeadEvento.create({ data: { tenantId, leadId: lead.id, tipo: 'NOVO_TOQUE', pontos: 0, descricao: `Novo toque via ${origem}`, dados: { origem, utm: i.utm, campanhaId } } })
    await registrarEvento(tenantId, lead.id, 'SOLICITOU_CONTATO', { descricao: 'Novo envio de formulário', dedupe: `toque:${new Date().toISOString().slice(0, 10)}` })
    await db.mktLead.update({ where: { id: lead.id }, data: { ...(i.curso && !lead.cursoInteresse ? { cursoInteresse: i.curso } : {}), ...(tel && !lead.telefone ? { telefone: tel } : {}), ...(email && !lead.emailNorm ? { email: i.email, emailNorm: email } : {}) } })
  }
  // prova de consentimento (sempre registrada, também para o aceite de contato sem marketing)
  const textoHash = sha(i.consentimento.texto + '|' + i.consentimento.versao)
  await db.mktConsentimento.create({ data: {
    tenantId, leadId: lead.id, email: email ? mascararEmail(email) : null, emailHash: email ? hashId(tenantId, 'EMAIL', email) : null, telefoneHash: tel ? hashId(tenantId, 'TELEFONE', tel) : null,
    titularNome: i.nome.trim(), finalidade: marketing ? 'MARKETING' : 'CONTATO_SOLICITADO', canais: i.consentimento.canais ?? [], baseLegal: marketing ? 'CONSENTIMENTO' : 'PROCEDIMENTOS_PRELIMINARES',
    textoVersao: i.consentimento.versao, textoHash, textoExibido: i.consentimento.texto.slice(0, 4000), origem: i.consentimento.origem, url: i.consentimento.url?.slice(0, 500), ipHash, uaHash, concedido: true,
  } })
  if (marketing) {
    if (sup.suprimido) {
      // novo opt-in explícito do titular: reativa (a supressão anterior fica no histórico)
      const ch = chavesDe(tenantId, { email, telefone: tel })
      await db.mktSupressao.updateMany({ where: { tenantId, ativo: true, OR: ch.map((c) => ({ tipo: c.tipo, chaveHash: c.hash })) }, data: { ativo: false, removidoEm: new Date(), motivoRemocao: 'Novo opt-in explícito do titular' } })
      await db.mktLeadEvento.create({ data: { tenantId, leadId: lead.id, tipo: 'OPT_IN_REATIVADO', descricao: 'Titular consentiu novamente (nova supressão removida)' } })
    }
    await db.mktLead.update({ where: { id: lead.id }, data: { consentimentoMarketing: true, consentimentoEm: new Date() } })
    await registrarEvento(tenantId, lead.id, 'OPT_IN_MARKETING', { dedupe: 'optin' })
    await espelharComunicacao(tenantId, lead.id, { nome: i.nome, email, tel, marketing: true })
  } else {
    await espelharComunicacao(tenantId, lead.id, { nome: i.nome, email, tel, marketing: false })
  }
  // funil de admissões: cria candidato LEAD (visível no módulo existente)
  await garantirCandidato(tenantId, lead.id, marketing)
  if (novo) {
    await distribuir(tenantId, lead.id)
    await registrarIndicacao(tenantId, lead.id, i.indicacao)
    await iniciarCadencias(tenantId, lead.id)
  }
  if (midia) await db.mktLeadEvento.create({ data: { tenantId, leadId: lead.id, tipo: 'ATRIBUICAO_OFFLINE', descricao: `Cupom ${i.cupom} -> ${midia.veiculo}`, dados: { midiaId: midia.id } } }).catch(() => null)
  await audit({ tenantId, modulo: 'marketing', acao: novo ? 'LEAD_CRIADO' : 'LEAD_TOQUE', refType: 'MktLead', refId: lead.id, detalhes: { origem, marketing } })
  return { lead: await db.mktLead.findUnique({ where: { id: lead.id } }), novo }
}

async function espelharComunicacao(tenantId: string, leadId: string, p: { nome: string; email: string | null; tel: string | null; marketing: boolean }) {
  const or: any[] = []
  if (p.email) or.push({ email: { equals: p.email, mode: 'insensitive' } })
  if (p.tel) or.push({ telefone: { in: [p.tel, `+${p.tel}`] } })
  let c = await prisma.comContato.findFirst({ where: { tenantId, OR: or } })
  if (!c) c = await prisma.comContato.create({ data: { tenantId, tipo: 'CANDIDATO', nome: p.nome, email: p.email, telefone: p.tel ? `+${p.tel}` : null, tags: ['lead-marketing'] } })
  await db.mktLead.update({ where: { id: leadId }, data: { contatoId: c.id } })
  if (p.marketing) {
    // não sobrescreve um opt-out existente do titular com um opt-in "silencioso": só grava se não houver preferência registrada
    const ex = await prisma.comPreferencia.findUnique({ where: { tenantId_contatoId_canal_finalidade: { tenantId, contatoId: c.id, canal: '*', finalidade: 'MARKETING' } } })
    if (!ex || ex.consentimento === false) {
      await prisma.comPreferencia.upsert({ where: { tenantId_contatoId_canal_finalidade: { tenantId, contatoId: c.id, canal: '*', finalidade: 'MARKETING' } }, create: { tenantId, contatoId: c.id, canal: '*', finalidade: 'MARKETING', consentimento: true, origem: 'FORMULARIO', motivo: 'Opt-in de marketing (módulo Marketing)' }, update: { consentimento: true, origem: 'FORMULARIO', motivo: 'Novo opt-in explícito (módulo Marketing)', registradoEm: new Date() } })
    }
  }
  void sincronizarMarketing
}

export async function garantirCandidato(tenantId: string, leadId: string, marketing: boolean) {
  const lead = await db.mktLead.findUnique({ where: { id: leadId } })
  if (!lead || lead.candidatoId) return lead?.candidatoId ?? null
  let ex: any = null
  if (lead.emailNorm) ex = await prisma.admCandidato.findFirst({ where: { tenantId, email: { equals: lead.emailNorm, mode: 'insensitive' } } })
  if (!ex) {
    const camp = lead.campanhaId ? await db.mktCampanha.findUnique({ where: { id: lead.campanhaId }, select: { admCampanhaId: true } }) : null
    ex = await prisma.admCandidato.create({ data: {
      tenantId, protocolo: gerarProtocolo(), nome: lead.nome, email: lead.emailNorm, telefone: lead.telefone, status: 'LEAD', etapaMaxima: 0, origem: lead.origem,
      utmSource: lead.utmSource, utmMedium: lead.utmMedium, utmCampaign: lead.utmCampaign, campanhaId: camp?.admCampanhaId ?? null,
      consentimentoLgpd: true, consentimentoEm: new Date(), consentimentoMarketing: marketing, consentimentoMarketingEm: marketing ? new Date() : null, responsavelId: null,
    } })
    await prisma.admInteracao.create({ data: { tenantId, candidatoId: ex.id, tipo: 'SISTEMA', descricao: `Lead captado pelo Marketing (${lead.origem})` } }).catch(() => null)
  }
  await db.mktLead.update({ where: { id: leadId }, data: { candidatoId: ex.id } })
  return ex.id
}

// ---------------------------------------------------------------- sincronização com o funil de Admissões
const MAPA: Record<string, string> = { LEAD: 'NOVO', INSCRITO: 'INSCRITO', PROVA: 'INSCRITO', APROVADO: 'INSCRITO', CONVOCADO: 'INSCRITO', MATRICULADO: 'MATRICULADO', DESISTENTE: 'PERDIDO', REPROVADO: 'PERDIDO' }
const ORDEM = ['NOVO', 'CONTATO', 'QUALIFICADO', 'INSCRITO', 'MATRICULADO']
export async function sincronizarAdmissoes(tenantId: string) {
  const leads = await db.mktLead.findMany({ where: { tenantId, candidatoId: { not: null }, etapa: { notIn: ['MATRICULADO'] } }, take: 5000 })
  const cands = await prisma.admCandidato.findMany({ where: { tenantId, id: { in: leads.map((l: any) => l.candidatoId) } }, select: { id: true, status: true, ofertaId: true } })
  const cm = new Map(cands.map((c) => [c.id, c]))
  let atualizados = 0
  for (const l of leads) {
    const c = cm.get(l.candidatoId); if (!c) continue
    const alvo = MAPA[c.status]
    if (!alvo || alvo === l.etapa) continue
    if (alvo !== 'PERDIDO' && alvo !== 'MATRICULADO' && ORDEM.indexOf(alvo) <= ORDEM.indexOf(l.etapa)) continue
    if (alvo === 'PERDIDO' && l.etapa === 'PERDIDO') continue
    await mudarEtapa(tenantId, l.id, alvo, { origemSync: true, ofertaId: c.ofertaId })
    atualizados++
  }
  // candidatos que entraram direto pelo vestibular (sem lead): vira lead para completar o funil/atribuição
  const vinculados = new Set((await db.mktLead.findMany({ where: { tenantId, candidatoId: { not: null } }, select: { candidatoId: true } })).map((x: any) => x.candidatoId))
  const orf = await prisma.admCandidato.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 })
  let importados = 0
  for (const c of orf) {
    if (vinculados.has(c.id)) continue
    const em = normEmail(c.email)
    const dup = em ? await db.mktLead.findFirst({ where: { tenantId, emailNorm: em } }) : null
    if (dup) { if (!dup.candidatoId) await db.mktLead.update({ where: { id: dup.id }, data: { candidatoId: c.id } }); continue }
    const etapa = MAPA[c.status] ?? 'NOVO'
    const l = await db.mktLead.create({ data: { tenantId, nome: c.nome, email: c.email, emailNorm: em, telefone: normFone(c.telefone), origem: origemPorUtm(c.utmSource, c.utmMedium) ?? ((ORIGENS as readonly string[]).includes(String(c.origem)) ? String(c.origem) : 'SITE'), detalheOrigem: c.origem ?? undefined, utmSource: c.utmSource, utmMedium: c.utmMedium, utmCampaign: c.utmCampaign, etapa, candidatoId: c.id, consentimentoMarketing: c.consentimentoMarketing, consentimentoEm: c.consentimentoEm, matriculadoEm: etapa === 'MATRICULADO' ? new Date() : null, createdAt: c.createdAt } })
    await registrarEvento(tenantId, l.id, 'CAPTURA', { descricao: 'Importado do funil de Admissões', dedupe: 'import' })
    importados++
  }
  return { atualizados, importados }
}

export async function mudarEtapa(tenantId: string, leadId: string, etapa: string, o: { userId?: string; motivo?: string; origemSync?: boolean; ofertaId?: string | null } = {}) {
  const lead = await db.mktLead.findFirst({ where: { id: leadId, tenantId } })
  if (!lead) throw Object.assign(new Error('Lead não encontrado.'), { status: 404 })
  if (lead.etapa === etapa) return lead
  const cfg = await getConfig(tenantId)
  const data: any = { etapa, ultimaInteracaoEm: new Date() }
  if (etapa === 'CONTATO' && !lead.primeiroContatoEm) data.primeiroContatoEm = new Date()
  if (etapa === 'PERDIDO') data.motivoPerda = o.motivo ?? 'Não informado'
  if (etapa === 'MATRICULADO') {
    data.matriculadoEm = new Date()
    let valor = cfg.ticketMedio
    if (o.ofertaId) { const of = await prisma.admOferta.findUnique({ where: { id: o.ofertaId } }); if (of && of.valorMensalidade > 0) valor = of.valorMensalidade * Math.max(1, of.parcelas) }
    data.valorEstimado = valor
  }
  const up = await db.mktLead.update({ where: { id: leadId }, data })
  await db.mktLeadEvento.create({ data: { tenantId, leadId, tipo: 'ETAPA', pontos: 0, descricao: `${lead.etapa} -> ${etapa}${o.motivo ? ` (${o.motivo})` : ''}`, userId: o.userId, dados: { de: lead.etapa, para: etapa, sync: !!o.origemSync } } })
  if (etapa === 'INSCRITO') await registrarEvento(tenantId, leadId, 'INSCRITO', { dedupe: 'inscrito' })
  if (['PERDIDO', 'MATRICULADO'].includes(etapa)) await db.mktCadenciaExecucao.updateMany({ where: { tenantId, leadId, status: 'ATIVA' }, data: { status: 'PARADA', motivo: `Lead ${etapa}` } })
  if (etapa === 'MATRICULADO') await db.mktIndicacao.updateMany({ where: { tenantId, leadId, status: 'PENDENTE' }, data: { status: 'CONVERTIDA' } })
  // reflete no funil de admissões apenas quando a mudança parte do marketing e o candidato ainda é LEAD
  if (!o.origemSync && lead.candidatoId && etapa === 'PERDIDO') await prisma.admCandidato.updateMany({ where: { id: lead.candidatoId, tenantId, status: 'LEAD' }, data: { status: 'DESISTENTE', motivoDesistencia: o.motivo ?? 'Perdido no marketing' } })
  return up
}

// ---------------------------------------------------------------- indicação premiada
export async function registrarIndicacao(tenantId: string, leadId: string, codigo?: string | null) {
  if (!codigo) return null
  const ind = await db.mktIndicador.findFirst({ where: { tenantId, codigo: { equals: codigo.trim(), mode: 'insensitive' } } })
  if (!ind) return null
  const prog = await db.mktPrograma.findFirst({ where: { id: ind.programaId, tenantId, ativo: true } })
  if (!prog) return null
  try {
    const r = await db.mktIndicacao.create({ data: { tenantId, programaId: prog.id, indicadorId: ind.id, leadId } })
    await db.mktLead.update({ where: { id: leadId }, data: { origem: 'INDICACAO', indicacaoCodigo: ind.codigo } })
    await registrarEvento(tenantId, leadId, 'ORIGEM_INDICACAO', { dedupe: 'origem-ind' })
    return r
  } catch (e: any) { if (e?.code === 'P2002') return null; throw e }
}

// ---------------------------------------------------------------- cadências
export async function iniciarCadencias(tenantId: string, leadId: string, gatilho = 'LEAD_NOVO', cadenciaId?: string) {
  const lead = await db.mktLead.findUnique({ where: { id: leadId } })
  if (!lead) return 0
  const cads = await db.mktCadencia.findMany({ where: { tenantId, ativa: true, ...(cadenciaId ? { id: cadenciaId } : { gatilho }) }, include: { passos: { orderBy: { ordem: 'asc' } } } })
  let n = 0
  for (const c of cads) {
    if (c.origens.length && !c.origens.includes(lead.origem)) continue
    if (!c.passos.length) continue
    try {
      await db.mktCadenciaExecucao.create({ data: { tenantId, cadenciaId: c.id, leadId, passoAtual: 0, proximaEm: new Date(Date.now() + c.passos[0].atrasoHoras * 3600_000) } })
      n++
    } catch (e: any) { if (e?.code !== 'P2002') throw e }
  }
  return n
}

function destinoDoCanal(canal: string, l: any): string | null {
  if (canal === 'EMAIL') return l.emailNorm
  if (canal === 'TELEGRAM') return null
  return l.telefone
}
/** Job: executa os passos vencidos. Para quando o lead responde, avança de etapa, é perdido/matriculado, ou é suprimido/sem consentimento. */
export async function processarCadencias(limite = 200) {
  const due = await db.mktCadenciaExecucao.findMany({ where: { status: 'ATIVA', proximaEm: { lte: new Date() } }, take: limite })
  let enviados = 0, parados = 0, adiados = 0
  for (const x of due) {
    const [cad, lead] = await Promise.all([db.mktCadencia.findUnique({ where: { id: x.cadenciaId }, include: { passos: { orderBy: { ordem: 'asc' } } } }), db.mktLead.findUnique({ where: { id: x.leadId } })])
    const parar = async (m: string) => { await db.mktCadenciaExecucao.update({ where: { id: x.id }, data: { status: 'PARADA', motivo: m, proximaEm: null } }); parados++ }
    if (!cad || !cad.ativa || !lead) { await parar('Cadência ou lead indisponível'); continue }
    if (['PERDIDO', 'MATRICULADO', 'INSCRITO'].includes(lead.etapa)) { await parar(`Lead em ${lead.etapa}`); continue }
    if (await db.mktLeadEvento.findFirst({ where: { leadId: lead.id, tipo: 'RESPONDEU', createdAt: { gte: x.createdAt } } })) { await parar('Lead respondeu'); continue }
    const passo = cad.passos[x.passoAtual]
    if (!passo) { await db.mktCadenciaExecucao.update({ where: { id: x.id }, data: { status: 'CONCLUIDA', proximaEm: null } }); continue }
    const destino = destinoDoCanal(passo.canal, lead)
    if (!destino) {
      // sem destino neste canal: pula o passo
    } else {
      const env = await enviar({ tenantId: x.tenantId, canal: passo.canal, destino, assunto: passo.assunto, corpo: passo.corpo, finalidade: passo.finalidade, leadId: lead.id, candidatoId: lead.candidatoId, campanhaId: lead.campanhaId, cadenciaExecId: x.id, vars: { nome: lead.nome.split(' ')[0], curso: lead.cursoInteresse ?? 'nossos cursos', consultor: lead.consultorNome ?? 'nossa equipe' } })
      if (env.status === 'BLOQUEADO') { await parar(`Bloqueado: ${env.motivo}`); continue }
      if (env.status === 'AGENDADO') { adiados++; await db.mktCadenciaExecucao.update({ where: { id: x.id }, data: { proximaEm: env.agendadoPara } }); continue }
      if (env.status === 'ENVIADO') enviados++
    }
    const prox = cad.passos[x.passoAtual + 1]
    if (!prox) await db.mktCadenciaExecucao.update({ where: { id: x.id }, data: { status: 'CONCLUIDA', passoAtual: x.passoAtual + 1, proximaEm: null } })
    else await db.mktCadenciaExecucao.update({ where: { id: x.id }, data: { passoAtual: x.passoAtual + 1, proximaEm: new Date(Date.now() + prox.atrasoHoras * 3600_000) } })
  }
  return { processadas: due.length, enviados, parados, adiados }
}
