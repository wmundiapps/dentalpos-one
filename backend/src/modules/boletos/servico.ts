import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { httpError, proximoNumero, r2, soDigitos } from '../tesouraria/common'
import { alertarBoletoRisco, encerrarAvisosBoleto } from './alertas'
import { DuplicidadeAchada, EntradaCheckup, NotaCad, avaliarBoleto, Motivo } from './checkup'
import { AnexoLido, DadosExtraidos, lerAnexo, mesclar, extrairDeTexto } from './extracao'
import { barrasParaLinha47, barrasParaLinha48, lerLinhaDigitavel } from './linha'
import { obterProvedorDda } from './provedorDda'

export const MODULO = 'boletos'
export const DIA = 86_400_000
export const DOMINIO_PADRAO = process.env.BOLETOS_DOMINIO_EMAIL || 'instituicao-exemplo.edu.br'
export const MAX_ANEXO_BYTES = 2_800_000

export const iso10 = (d: Date) => d.toISOString().slice(0, 10)
export const meioDia = (v: string | Date): Date => {
  const d = new Date(v)
  if (isNaN(d.getTime())) throw httpError(400, 'Data inválida.')
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCHours(12, 0, 0, 0)
  return d
}
export const inicioDoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0))
export const fimDoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))

// ---------------- configuração ----------------
export async function getCfg(tenantId: string) {
  return prisma.bolConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}
export const enderecoEmail = (cfg: { emailLocal: string; dominioEmail?: string | null }) => `${cfg.emailLocal}@${(cfg.dominioEmail || DOMINIO_PADRAO).toLowerCase()}`
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')
export function novoToken() {
  const token = 'bol_' + randomBytes(24).toString('base64url')
  return { token, hash: hashToken(token), prefixo: token.slice(0, 8) }
}
export function tokenConfere(cfg: { webhookTokenHash?: string | null }, token: string): boolean {
  if (!cfg.webhookTokenHash || !token) return false
  const a = Buffer.from(hashToken(token))
  const b = Buffer.from(cfg.webhookTokenHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function evento(p: { tenantId: string; boletoId?: string; loteId?: string; acao: string; de?: string; para?: string; userId?: string; papel?: string; detalhe?: unknown }) {
  return prisma.bolEvento.create({ data: { tenantId: p.tenantId, boletoId: p.boletoId, loteId: p.loteId, acao: p.acao, de: p.de, para: p.para, userId: p.userId, papel: p.papel, detalhe: p.detalhe as any } })
}
export const auditar = (tenantId: string, userId: string | undefined, acao: string, refType: string, refId: string, detalhes?: unknown) =>
  audit({ tenantId, userId, modulo: MODULO, acao, refType, refId, detalhes })

// ---------------- contexto do check-up ----------------
const normNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Formas equivalentes do mesmo código (44 barras, linha de 47/48) para comparar com títulos já lançados. */
export function variantesCodigo(codigoBarras?: string | null, linha?: string | null): string[] {
  const out = new Set<string>()
  const b = soDigitos(codigoBarras)
  if (b.length === 44) {
    out.add(b)
    try { out.add(b[0] === '8' ? barrasParaLinha48(b) : barrasParaLinha47(b)) } catch { /* ignora */ }
  }
  const l = soDigitos(linha)
  if (l.length) out.add(l)
  return Array.from(out)
}

type BolRow = Awaited<ReturnType<typeof prisma.bolBoleto.findFirstOrThrow>>

export async function montarContexto(tenantId: string, b: BolRow, cfg: Awaited<ReturnType<typeof getCfg>>) {
  const fornecedores = await prisma.supFornecedor.findMany({ where: { tenantId, ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, banco: true }, take: 2000 })
  const doc = soDigitos(b.beneficiarioDocumento)
  // fornecedor provisório (por CNPJ) para histórico
  const fornDoc = doc ? fornecedores.find((f) => soDigitos(f.cnpj) === doc) : undefined
  const tituloProprio = b.tituloId ?? undefined
  const filtroForn = [
    ...(doc ? [{ fornecedorDocumento: doc }] : []),
    ...(fornDoc ? [{ fornecedorId: fornDoc.id }] : []),
  ]
  const titulosHist = filtroForn.length
    ? await prisma.tesTitulo.findMany({
        where: { tenantId, OR: filtroForn, status: { notIn: ['CANCELADO', 'REJEITADO'] }, ...(tituloProprio ? { id: { not: tituloProprio } } : {}) },
        select: { valorBruto: true, codigoBarras: true, favorecidoBanco: true }, take: 200, orderBy: { vencimento: 'desc' },
      })
    : []
  const bolHist = doc
    ? await prisma.bolBoleto.findMany({ where: { tenantId, beneficiarioDocumento: doc, status: 'AUTORIZADO', id: { not: b.id } }, select: { valor: true, banco: true }, take: 100 })
    : []
  const historicoValores = [...titulosHist.map((t) => t.valorBruto), ...bolHist.map((x) => x.valor).filter((v): v is number => v != null)]
  const bancos = new Set<string>()
  for (const t of titulosHist) {
    const cb = soDigitos(t.codigoBarras)
    if ((cb.length === 44 || cb.length === 47) && cb[0] !== '8') bancos.add(cb.slice(0, 3))
    if (/^\d{3}$/.test(soDigitos(t.favorecidoBanco))) bancos.add(soDigitos(t.favorecidoBanco))
  }
  bolHist.forEach((x) => x.banco && bancos.add(x.banco))
  if (fornDoc?.banco && /^\d{3}$/.test(fornDoc.banco.trim())) bancos.add(fornDoc.banco.trim())

  const notasRaw = doc
    ? await prisma.tesNotaFiscal.findMany({ where: { tenantId, direcao: 'ENTRADA', status: 'LANCADA', participanteDocumento: doc }, orderBy: { emissao: 'desc' }, take: 100 })
    : []
  const mapNota = (n: any): NotaCad => ({ id: n.id, numero: n.numero, chave: n.chave, emissao: n.emissao, valorTotal: n.valorTotal, valorLiquido: n.valorLiquido, participanteDocumento: n.participanteDocumento })
  let notaPorChave: NotaCad | null = null
  if (b.nfChave) {
    const n = await prisma.tesNotaFiscal.findFirst({ where: { tenantId, chave: soDigitos(b.nfChave), status: 'LANCADA' } })
    if (n) notaPorChave = mapNota(n)
  }

  // duplicidade
  const duplicidade = await buscarDuplicidade(tenantId, b, doc, fornDoc?.id, cfg.toleranciaDiasDuplicidade)
  return {
    fornecedores,
    historicoValores,
    bancosHistorico: Array.from(bancos),
    notas: notasRaw.map(mapNota),
    notaPorChave,
    duplicidade,
    cfg: { diasVencidoSuspeito: cfg.diasVencidoSuspeito, fatorValorSuspeito: cfg.fatorValorSuspeito, prazoNotaDias: cfg.prazoNotaDias },
  }
}

async function buscarDuplicidade(tenantId: string, b: BolRow, doc: string, fornId: string | undefined, tolDias: number): Promise<DuplicidadeAchada | null> {
  const anterior = { OR: [{ createdAt: { lt: b.createdAt } }, { createdAt: b.createdAt, id: { lt: b.id } }] }
  const variantes = variantesCodigo(b.codigoBarras, b.linhaDigitavel)
  const semProprio = b.tituloId ? { id: { not: b.tituloId } } : {}
  if (variantes.length) {
    const outroBol = await prisma.bolBoleto.findFirst({
      where: { tenantId, id: { not: b.id }, duplicadoDeId: null, duplicadoTituloId: null, AND: [anterior], OR: [{ codigoBarras: { in: variantes } }, { linhaDigitavel: { in: variantes } }] },
      orderBy: { createdAt: 'asc' },
    })
    if (outroBol) return { tipo: 'BOLETO', id: outroBol.id, numero: outroBol.numero, status: outroBol.status, criterio: 'CODIGO_BARRAS' }
    const tit = await prisma.tesTitulo.findFirst({ where: { tenantId, codigoBarras: { in: variantes }, status: { not: 'CANCELADO' }, ...semProprio }, orderBy: { createdAt: 'asc' } })
    if (tit) return { tipo: 'TITULO', id: tit.id, numero: tit.numero, status: tit.status, criterio: 'CODIGO_BARRAS' }
  }
  if (b.valor != null && b.vencimento && (doc || fornId)) {
    const de = new Date(b.vencimento.getTime() - tolDias * DIA)
    const ate = new Date(b.vencimento.getTime() + tolDias * DIA)
    const valorOk = { gte: b.valor - 0.01, lte: b.valor + 0.01 }
    if (doc) {
      const outroBol = await prisma.bolBoleto.findFirst({
        where: { tenantId, id: { not: b.id }, duplicadoDeId: null, duplicadoTituloId: null, beneficiarioDocumento: doc, valor: valorOk, vencimento: { gte: de, lte: ate }, status: { not: 'REFUTADO' }, AND: [anterior] },
        orderBy: { createdAt: 'asc' },
      })
      if (outroBol) return { tipo: 'BOLETO', id: outroBol.id, numero: outroBol.numero, status: outroBol.status, criterio: 'FORNECEDOR_VALOR_VENCIMENTO' }
    }
    const orForn = [...(doc ? [{ fornecedorDocumento: doc }] : []), ...(fornId ? [{ fornecedorId: fornId }] : [])]
    const tit = await prisma.tesTitulo.findFirst({ where: { tenantId, OR: orForn, valorBruto: valorOk, vencimento: { gte: de, lte: ate }, status: { notIn: ['CANCELADO', 'REJEITADO'] }, ...semProprio }, orderBy: { createdAt: 'asc' } })
    if (tit) return { tipo: 'TITULO', id: tit.id, numero: tit.numero, status: tit.status, criterio: 'FORNECEDOR_VALOR_VENCIMENTO' }
  }
  return null
}

/** Roda o check-up e grava resultado/score/motivos (e dispara os avisos quando passa a SUSPEITO/DUPLICADO). */
export async function analisarBoleto(tenantId: string, boletoId: string, userId?: string) {
  const b = await prisma.bolBoleto.findFirst({ where: { id: boletoId, tenantId } })
  if (!b) throw httpError(404, 'Boleto não encontrado.')
  const cfg = await getCfg(tenantId)
  const ctx = await montarContexto(tenantId, b, cfg)
  const entrada: EntradaCheckup = {
    linhaDigitavel: b.linhaDigitavel, codigoBarras: b.codigoBarras, valor: b.valor, vencimento: b.vencimento,
    beneficiarioNome: b.beneficiarioNome, beneficiarioDocumento: b.beneficiarioDocumento, nfChave: b.nfChave,
  }
  const r = avaliarBoleto(entrada, ctx as any)
  const dup = r.duplicidade
  const atualizado = await prisma.bolBoleto.update({
    where: { id: b.id },
    data: {
      resultado: r.resultado, score: r.score, motivos: r.motivos as any, checkupEm: new Date(),
      fornecedorId: r.fornecedorId ?? b.fornecedorId, notaFiscalId: r.notaFiscalId ?? b.notaFiscalId,
      codigoBarras: r.codigoBarras ?? b.codigoBarras, banco: r.banco ?? b.banco, tipoBoleto: r.tipoBoleto ?? b.tipoBoleto,
      duplicadoDeId: dup?.tipo === 'BOLETO' ? dup.id : null, duplicadoTituloId: dup?.tipo === 'TITULO' ? dup.id : null,
    },
  })
  if (b.resultado !== r.resultado || !b.checkupEm) {
    await evento({ tenantId, boletoId: b.id, acao: 'CHECKUP', de: b.checkupEm ? b.resultado : undefined, para: r.resultado, userId, detalhe: { score: r.score, motivos: r.motivos.filter((m) => m.gravidade !== 'OK').map((m) => m.codigo) } })
  }
  const aberto = ['RECEBIDO', 'A_CONFERIR', 'EM_APROVACAO'].includes(atualizado.status)
  if (aberto && (r.resultado === 'SUSPEITO' || r.resultado === 'DUPLICADO') && (b.resultado !== r.resultado || !b.checkupEm)) {
    await alertarBoletoRisco({ tenantId, boletoId: b.id, numero: b.numero, resultado: r.resultado, motivos: r.motivos.filter((m) => m.gravidade === 'CRITICO' || m.gravidade === 'ATENCAO').length }).catch((e) => console.error('[boletos-alerta]', e?.message))
  }
  return { boleto: atualizado, checkup: r }
}

// ---------------- criação ----------------
export interface NovoBoleto {
  linhaDigitavel?: string | null
  valor?: number | null
  vencimento?: string | Date | null
  beneficiarioNome?: string | null
  beneficiarioDocumento?: string | null
  numeroDocumento?: string | null
  nfChave?: string | null
  nfNumero?: string | null
  nfValor?: number | null
  descricao?: string | null
  recebidoEm?: Date
}

export async function criarBoleto(tenantId: string, d: NovoBoleto, o: { origem: 'DDA' | 'EMAIL' | 'MANUAL'; origemRef?: string; emailId?: string; userId?: string; papel?: string }) {
  if (o.origemRef) {
    const ja = await prisma.bolBoleto.findFirst({ where: { tenantId, origemRef: o.origemRef } })
    if (ja) return { boleto: ja, criado: false }
  }
  const linhaDig = soDigitos(d.linhaDigitavel)
  const leitura = linhaDig ? lerLinhaDigitavel(linhaDig, d.vencimento ? meioDia(d.vencimento as any) : new Date()) : null
  const valor = d.valor ?? (leitura?.ok && leitura.valor ? leitura.valor : null)
  const venc = d.vencimento ? meioDia(d.vencimento as any) : leitura?.ok && leitura.vencimento ? leitura.vencimento : null
  const numero = `BOL-${String(await proximoNumero(tenantId, 'boleto')).padStart(6, '0')}`
  const doc = soDigitos(d.beneficiarioDocumento)
  const b = await prisma.bolBoleto.create({
    data: {
      tenantId, numero, origem: o.origem, origemRef: o.origemRef, emailId: o.emailId, lancadoPorId: o.origem === 'DDA' ? undefined : o.userId,
      linhaDigitavel: linhaDig || null, codigoBarras: leitura && leitura.formato !== 'INVALIDO' ? leitura.codigoBarras : null,
      tipoBoleto: leitura?.tipo, banco: leitura?.tipo === 'BANCARIO' && leitura.codigoBarras ? leitura.codigoBarras.slice(0, 3) : null,
      valor: valor != null ? r2(valor) : null, vencimento: venc,
      beneficiarioNome: d.beneficiarioNome?.trim() || null, beneficiarioDocumento: doc || null, numeroDocumento: d.numeroDocumento || null,
      nfChave: d.nfChave ? soDigitos(d.nfChave) : null, nfNumero: d.nfNumero || null, nfValor: d.nfValor ?? null, descricao: d.descricao || null,
      recebidoEm: d.recebidoEm ?? new Date(),
    },
  })
  await evento({ tenantId, boletoId: b.id, acao: 'RECEBIDO', para: 'RECEBIDO', userId: o.userId, papel: o.papel, detalhe: { origem: o.origem, origemRef: o.origemRef } })
  await auditar(tenantId, o.userId, 'BOLETO_RECEBIDO', 'BolBoleto', b.id, { numero, origem: o.origem })
  const { boleto } = await analisarBoleto(tenantId, b.id, o.userId)
  return { boleto, criado: true }
}

// ---------------- e-mail dedicado ----------------
export interface AnexoEmail { nome: string; mime?: string; conteudo: Buffer }
export interface EntradaEmail { messageId?: string; remetente?: string; destinatario?: string; assunto?: string; texto?: string; html?: string; anexos: AnexoEmail[]; recebidoEm?: Date }

export async function processarEmail(tenantId: string, e: EntradaEmail, o: { origem: 'WEBHOOK' | 'SIMULADO'; userId?: string; papel?: string; bloqueados?: Array<{ nome: string; motivo: string }> }) {
  const messageId = (e.messageId || `${o.origem === 'SIMULADO' ? 'sim' : 'msg'}-${randomBytes(8).toString('hex')}`).slice(0, 200)
  const existente = await prisma.bolEmail.findFirst({ where: { tenantId, messageId } })
  if (existente) return { email: existente, boletos: await prisma.bolBoleto.findMany({ where: { tenantId, emailId: existente.id } }), duplicadoEmail: true, anexos: [] as AnexoLido[] }
  const corpoTxt = (e.texto && e.texto.trim()) || (e.html ? e.html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ') : '')
  const email = await prisma.bolEmail.create({
    data: { tenantId, messageId, origem: o.origem, remetente: e.remetente?.slice(0, 200), destinatario: e.destinatario?.slice(0, 200), assunto: e.assunto?.slice(0, 300), corpo: corpoTxt.slice(0, 20000), recebidoEm: e.recebidoEm ?? new Date(), anexos: e.anexos.length + (o.bloqueados?.length ?? 0), criadoPorId: o.userId },
  })
  // leitura de cada anexo (PDF com texto, XML, texto) e do corpo
  const lidos: Array<{ anexo: AnexoEmail; lido: AnexoLido; anexoId: string }> = []
  for (const a of e.anexos) {
    const lido = lerAnexo({ nome: a.nome, mime: a.mime, conteudo: a.conteudo })
    const row = await prisma.bolAnexo.create({
      data: {
        tenantId, emailId: email.id, nome: a.nome.slice(0, 200), mime: lido.mime, tamanho: a.conteudo.length, sha256: createHash('sha256').update(a.conteudo).digest('hex'),
        conteudo: a.conteudo.length <= MAX_ANEXO_BYTES ? a.conteudo.toString('base64') : null, leitura: lido.leitura, leituraNota: lido.nota ?? (a.conteudo.length > MAX_ANEXO_BYTES ? 'Anexo grande demais para guardar no sistema' : null),
      },
    })
    lidos.push({ anexo: a, lido, anexoId: row.id })
  }
  for (const bl of o.bloqueados ?? []) {
    await prisma.bolAnexo.create({ data: { tenantId, emailId: email.id, nome: bl.nome.slice(0, 200), leitura: 'BLOQUEADO', leituraNota: bl.motivo } })
  }
  const dadosCorpo = corpoTxt ? extrairDeTexto(corpoTxt, 'corpo do e-mail') : null
  const xmls = lidos.filter((l) => l.lido.dados?.fonte.includes('xml')).map((l) => l.lido.dados!)
  const demais: Array<{ dados: DadosExtraidos; anexoId?: string }> = [
    ...lidos.filter((l) => l.lido.dados && !l.lido.dados.fonte.includes('xml')).map((l) => ({ dados: l.lido.dados!, anexoId: l.anexoId })),
    ...(dadosCorpo ? [{ dados: dadosCorpo }] : []),
  ]
  const nf = xmls.length ? mesclar(xmls) : null
  const geral = mesclar([...xmls, ...demais.map((x) => x.dados)])
  const criados: BolRow[] = []
  const vistos = new Set<string>()
  const novoDe = async (dados: DadosExtraidos, anexoId: string | undefined, chaveRef: string, extra?: Partial<NovoBoleto>) => {
    const dadosNovo: NovoBoleto = {
      linhaDigitavel: dados.linhaDigitavel, valor: dados.valor ?? geral.valor, vencimento: dados.vencimento ?? geral.vencimento,
      beneficiarioNome: dados.beneficiarioNome ?? geral.beneficiarioNome ?? nf?.nfEmitenteNome, beneficiarioDocumento: dados.beneficiarioDocumento ?? geral.beneficiarioDocumento ?? nf?.nfEmitenteDocumento,
      numeroDocumento: dados.numeroDocumento ?? geral.numeroDocumento, nfChave: dados.nfChave ?? nf?.nfChave ?? geral.nfChave, nfNumero: dados.nfNumero ?? nf?.nfNumero, nfValor: nf?.nfValor,
      descricao: e.assunto?.slice(0, 200), recebidoEm: e.recebidoEm, ...extra,
    }
    const r = await criarBoleto(tenantId, dadosNovo, { origem: 'EMAIL', origemRef: `email:${email.id}:${chaveRef}`, emailId: email.id, userId: o.userId, papel: o.papel })
    if (r.criado) {
      criados.push(r.boleto)
      if (anexoId) await prisma.bolAnexo.update({ where: { id: anexoId }, data: { boletoId: r.boleto.id } })
      for (const l of lidos) if (l.lido.dados?.fonte.includes('xml')) await prisma.bolAnexo.updateMany({ where: { id: l.anexoId, boletoId: null }, data: { boletoId: r.boleto.id } })
    }
  }
  for (const x of demais) {
    const l = x.dados.linhaDigitavel
    if (!l || vistos.has(l)) continue
    vistos.add(l)
    await novoDe(x.dados, x.anexoId, l)
  }
  if (!criados.length && nf?.duplicatas?.length) {
    // XML de NF-e com cobrança (duplicatas), sem linha digitável: lança sem linha (check-up sinaliza) em vez de inventar o código
    let i = 0
    for (const dp of nf.duplicatas) { await novoDe({ fonte: ['xml'], valor: dp.valor, vencimento: dp.vencimento, numeroDocumento: dp.numero }, undefined, `dup${i++}`) }
  }
  const algumIlegivel = lidos.some((l) => l.lido.leitura === 'SEM_TEXTO') || (o.bloqueados?.length ?? 0) > 0
  const status = criados.length ? 'PROCESSADO' : algumIlegivel ? 'ILEGIVEL' : 'SEM_DADOS'
  const observacao = criados.length
    ? undefined
    : algumIlegivel
      ? 'Não foi possível ler o anexo (sem texto embutido/OCR ou bloqueado). Lance o boleto manualmente a partir do anexo guardado.'
      : 'Nenhuma linha digitável ou dados de boleto encontrados no e-mail.'
  const em = await prisma.bolEmail.update({ where: { id: email.id }, data: { boletosGerados: criados.length, status, observacao } })
  await auditar(tenantId, o.userId, 'EMAIL_RECEBIDO', 'BolEmail', email.id, { origem: o.origem, anexos: e.anexos.length, boletos: criados.length, status })
  const anexos = lidos.map((l) => l.lido)
  return { email: em, boletos: criados, duplicadoEmail: false, anexos }
}

// ---------------- DDA ----------------
export async function sincronizarDda(tenantId: string, userId?: string, hoje = new Date()) {
  const cfg = await getCfg(tenantId)
  if (!cfg.ddaAtivo) throw httpError(409, 'O DDA não está ativado para esta instituição. Ative em Configurações (provedor simulado até a integração com o banco).', { code: 'DDA_INATIVO' })
  const provedor = obterProvedorDda(cfg.ddaProvedor)
  const fornecedores = await prisma.supFornecedor.findMany({ where: { tenantId, ativo: true }, select: { razaoSocial: true, cnpj: true, banco: true }, take: 500 })
  const lista = await provedor.listarBoletos({ tenantId, documentoPagador: cfg.ddaDocumento, desde: cfg.ddaUltimaSincEm, fornecedores, hoje })
  let novos = 0
  let jaExistiam = 0
  const ids: string[] = []
  for (const x of lista) {
    const r = await criarBoleto(tenantId, {
      linhaDigitavel: x.linhaDigitavel, valor: x.valor, vencimento: x.vencimento, beneficiarioNome: x.beneficiarioNome, beneficiarioDocumento: x.beneficiarioDocumento,
      numeroDocumento: x.numeroDocumento, descricao: `DDA — ${x.beneficiarioNome}`,
    }, { origem: 'DDA', origemRef: `dda:${x.idExterno}`, userId })
    if (r.criado) { novos++; ids.push(r.boleto.id) } else jaExistiam++
  }
  const resumo = { provedor: provedor.nome, simulado: provedor.simulado, consultados: lista.length, novos, jaExistiam, em: new Date().toISOString() }
  await prisma.bolConfig.update({ where: { tenantId }, data: { ddaUltimaSincEm: new Date(), ddaUltimaSincResumo: resumo as any } })
  await auditar(tenantId, userId, 'DDA_SINCRONIZADO', 'BolConfig', cfg.id, resumo)
  return { ...resumo, ids }
}

// ---------------- apresentação ----------------
export const mascararDoc = (d?: string | null) => {
  const s = soDigitos(d)
  return s.length === 11 ? `***.${s.slice(3, 6)}.${s.slice(6, 9)}-**` : d ?? null
}

export function paraApi(b: BolRow, extra: Record<string, unknown> = {}) {
  const motivos = (Array.isArray(b.motivos) ? b.motivos : []) as unknown as Motivo[]
  return { ...b, beneficiarioDocumento: mascararDoc(b.beneficiarioDocumento), motivos, pendencias: motivos.filter((m) => m.gravidade === 'ATENCAO' || m.gravidade === 'CRITICO').length, ...extra }
}

export { encerrarAvisosBoleto }
