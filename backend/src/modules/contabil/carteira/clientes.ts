import type { Request, Response, Router } from 'express'
import {
  CONTADORES, EQUIPE, GESTAO, INTERNO, asArray, clienteOuErro, dataOpt, emailOpt, exigir, gerarCsv, getCfg, hojeMeioDia, httpError, iso10, pageParams, papelDe, parseBody, prisma, qs, restrito,
  tid, txt, txtOpt, uid, whereCliente, z,
} from './common'
import { asyncHandler, auditar, equipeDoTenant, nomesDeUsuarios } from './host'
import { documentoValido, formatarDocumento, limparDocumento, tipoPorDocumento } from './documento'
import { chaveColuna, lerCsv } from './csv'
import { registrarAcesso } from './lgpdAcesso'

export const STATUS_CLIENTE = ['PROSPECTO', 'ATIVO', 'SUSPENSO', 'ENCERRADO'] as const
export const REGIMES = ['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL', 'PF', 'ISENTA', 'OUTRO'] as const
export const PAPEIS_CONTATO = ['SOCIO', 'FINANCEIRO', 'FISCAL', 'RH', 'CONTATO_GERAL', 'OUTRO'] as const
export const BASES_LEGAIS = ['EXECUCAO_CONTRATO', 'OBRIGACAO_LEGAL', 'CONSENTIMENTO', 'LEGITIMO_INTERESSE', 'EXERCICIO_DIREITOS'] as const
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const MIMES_OK = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'application/xml', 'text/xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream']
export const MAX_ANEXO_BYTES = 3 * 1024 * 1024

const endereco = z.object({
  cep: txtOpt(9), logradouro: txtOpt(160), numero: txtOpt(20), complemento: txtOpt(80), bairro: txtOpt(80), cidade: txtOpt(80),
  uf: z.string().trim().toUpperCase().refine((v) => UFS.includes(v), 'UF inválida').optional().nullable().or(z.literal('').transform(() => null)),
}).partial()

const base = z.object({
  tipo: z.enum(['PF', 'PJ']),
  documento: z.string().trim().min(11, 'documento muito curto').max(22),
  nome: txt(160).pipe(z.string().min(2, 'informe o nome')),
  nomeFantasia: txtOpt(160),
  status: z.enum(STATUS_CLIENTE).default('PROSPECTO'),
  regime: z.enum(REGIMES).optional().nullable(),
  cnaePrincipal: z.string().trim().regex(/^\d{4}-?\d\/?\d{2}$|^\d{7}$/, 'CNAE inválido (ex.: 6920-6/01)').optional().nullable().or(z.literal('').transform(() => null)),
  cnaesSecundarios: z.array(z.string().trim().max(12)).max(30).default([]),
  segmento: txtOpt(60), origem: txtOpt(60),
  responsavelId: z.string().max(80).optional().nullable(), analistaId: z.string().max(80).optional().nullable(),
  dataAbertura: dataOpt, inicioRelacionamento: dataOpt,
  email: emailOpt, telefone: txtOpt(30), endereco: endereco.optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  observacoes: txtOpt(4000),
  empresaId: txtOpt(80),
})

function checarDocumento(d: { tipo?: string; documento?: string }) {
  if (d.documento === undefined) return
  const t = tipoPorDocumento(d.documento)
  if (!t) throw httpError(400, 'Documento inválido: informe um CPF (11 dígitos) ou CNPJ (14 caracteres).')
  if (d.tipo && d.tipo !== t) throw httpError(400, `O documento informado é ${t === 'PF' ? 'um CPF' : 'um CNPJ'}, mas o tipo é ${d.tipo}.`)
  if (!documentoValido(d.documento)) throw httpError(400, t === 'PF' ? 'CPF inválido (dígitos verificadores não conferem).' : 'CNPJ inválido (dígitos verificadores não conferem).')
}

async function equipeIds(tenantId: string) {
  return new Map((await equipeDoTenant(tenantId)).map((u) => [u.id, u]))
}
async function validarResponsaveis(tenantId: string, d: { responsavelId?: string | null; analistaId?: string | null }) {
  const ids = [d.responsavelId, d.analistaId].filter(Boolean) as string[]
  if (!ids.length) return
  const eq = await equipeIds(tenantId)
  for (const id of ids) if (!eq.has(id)) throw httpError(400, 'Responsável/analista deve ser alguém da equipe do escritório neste tenant.')
}

const saida = (c: any, nomes: Map<string, string>) => ({
  ...c, documentoFormatado: c.documento ? formatarDocumento(c.documento) : null,
  responsavelNome: c.responsavelId ? nomes.get(c.responsavelId) ?? null : null, analistaNome: c.analistaId ? nomes.get(c.analistaId) ?? null : null,
})

// ============================ importação CSV ============================
const ALIAS: Record<string, string> = {
  tipo: 'tipo', documento: 'documento', cpf: 'documento', cnpj: 'documento', cpfcnpj: 'documento', nome: 'nome', razaosocial: 'nome', nomefantasia: 'nomeFantasia', fantasia: 'nomeFantasia',
  regime: 'regime', regimetributario: 'regime', cnae: 'cnaePrincipal', cnaeprincipal: 'cnaePrincipal', segmento: 'segmento', origem: 'origem', email: 'email', telefone: 'telefone',
  status: 'status', tags: 'tags', responsavelemail: 'responsavelEmail', responsavel: 'responsavelEmail', cep: 'cep', cidade: 'cidade', uf: 'uf', logradouro: 'logradouro', numero: 'numero', bairro: 'bairro',
  dataabertura: 'dataAbertura', abertura: 'dataAbertura', observacoes: 'observacoes',
}
export const MODELO_CSV_COLUNAS = ['tipo', 'documento', 'nome', 'nome_fantasia', 'regime', 'cnae', 'segmento', 'origem', 'email', 'telefone', 'status', 'tags', 'responsavel_email', 'cep', 'cidade', 'uf', 'data_abertura']
const MAX_LINHAS = 2000

interface LinhaAnalisada { linha: number; dados: any; erros: string[]; avisos: string[]; acao: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR' | 'ERRO'; existenteId?: string }

function dataCsv(v: string): Date | null {
  const s = v.trim()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) || null
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T12:00:00Z`)
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d
}

async function analisarCsv(tenantId: string, csv: string, atualizar: boolean): Promise<{ linhas: LinhaAnalisada[]; colunasReconhecidas: string[]; colunasIgnoradas: string[] }> {
  if (!csv || !csv.trim()) throw httpError(400, 'Envie o conteúdo do CSV.')
  if (csv.length > 2_500_000) throw httpError(413, 'Arquivo CSV muito grande (máximo ~2 MB).')
  const tabela = lerCsv(csv)
  if (tabela.length < 2) throw httpError(400, 'O CSV precisa do cabeçalho e de ao menos uma linha de dados.')
  if (tabela.length - 1 > MAX_LINHAS) throw httpError(413, `O CSV tem linhas demais (máximo ${MAX_LINHAS} por importação).`)
  const cab = tabela[0].map((h) => ALIAS[chaveColuna(h)] || null)
  const colunasReconhecidas = [...new Set(cab.filter(Boolean) as string[])]
  const colunasIgnoradas = tabela[0].filter((_, i) => !cab[i])
  if (!colunasReconhecidas.includes('documento') || !colunasReconhecidas.includes('nome')) throw httpError(400, 'O cabeçalho precisa ter ao menos as colunas "documento" (CPF/CNPJ) e "nome".')
  const eq = await equipeDoTenant(tenantId)
  const porEmail = new Map<string, string>()
  const usuarios = await prisma.user.findMany({ where: { id: { in: eq.map((u) => u.id) }, tenantId }, select: { id: true, email: true } })
  for (const u of usuarios) porEmail.set(u.email.toLowerCase(), u.id)
  const docs = tabela.slice(1).map((l) => { const i = cab.indexOf('documento'); return limparDocumento(l[i]) }).filter(Boolean)
  const existentes = new Map((await prisma.ctbCliente.findMany({ where: { tenantId, documento: { in: docs } }, select: { id: true, documento: true } })).map((c) => [c.documento!, c.id]))
  const visto = new Set<string>()
  const linhas: LinhaAnalisada[] = []
  tabela.slice(1).forEach((l, idx) => {
    const raw: Record<string, string> = {}
    cab.forEach((k, i) => { if (k) raw[k] = String(l[i] ?? '').trim() })
    const erros: string[] = [], avisos: string[] = []
    const doc = limparDocumento(raw.documento)
    const tipoDoc = tipoPorDocumento(doc)
    let tipo = (raw.tipo || '').toUpperCase()
    if (tipo && !['PF', 'PJ'].includes(tipo)) { erros.push(`Tipo "${raw.tipo}" inválido (use PF ou PJ).`); tipo = '' }
    if (!doc) erros.push('Documento vazio.')
    else if (!tipoDoc) erros.push('Documento com tamanho inválido (CPF 11, CNPJ 14).')
    else if (!documentoValido(doc)) erros.push(tipoDoc === 'PF' ? 'CPF inválido (dígitos verificadores).' : 'CNPJ inválido (dígitos verificadores).')
    else if (tipo && tipo !== tipoDoc) erros.push(`Tipo ${tipo} não combina com o documento (${tipoDoc}).`)
    if (!tipo && tipoDoc) tipo = tipoDoc
    if (!raw.nome || raw.nome.length < 2) erros.push('Nome vazio ou curto demais.')
    if (raw.nome && raw.nome.length > 160) erros.push('Nome com mais de 160 caracteres.')
    const regime = raw.regime ? raw.regime.toUpperCase().replace(/\s+/g, '_').replace('SIMPLES_NACIONAL', 'SIMPLES').replace('LUCRO_PRESUMIDO', 'PRESUMIDO').replace('LUCRO_REAL', 'REAL') : ''
    if (regime && !(REGIMES as readonly string[]).includes(regime)) erros.push(`Regime "${raw.regime}" inválido (${REGIMES.join(', ')}).`)
    const status = (raw.status || 'PROSPECTO').toUpperCase()
    if (!(STATUS_CLIENTE as readonly string[]).includes(status)) erros.push(`Status "${raw.status}" inválido.`)
    if (raw.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email)) erros.push('E-mail inválido.')
    if (raw.uf && !UFS.includes(raw.uf.toUpperCase())) erros.push('UF inválida.')
    let abertura: Date | null = null
    if (raw.dataAbertura) { abertura = dataCsv(raw.dataAbertura); if (!abertura) erros.push('Data de abertura inválida (use AAAA-MM-DD ou DD/MM/AAAA).') }
    let responsavelId: string | null = null
    if (raw.responsavelEmail) { responsavelId = porEmail.get(raw.responsavelEmail.toLowerCase()) ?? null; if (!responsavelId) avisos.push(`Responsável "${raw.responsavelEmail}" não encontrado na equipe; cliente ficará sem responsável.`) }
    if (doc && visto.has(doc)) erros.push('Documento repetido dentro do próprio arquivo.')
    if (doc) visto.add(doc)
    const existenteId = doc ? existentes.get(doc) : undefined
    let acao: LinhaAnalisada['acao'] = erros.length ? 'ERRO' : 'CRIAR'
    if (!erros.length && existenteId) { acao = atualizar ? 'ATUALIZAR' : 'IGNORAR'; avisos.push(atualizar ? 'Cliente já cadastrado: será atualizado.' : 'Cliente já cadastrado: será ignorado.') }
    const dados = {
      tipo, documento: doc, nome: raw.nome, nomeFantasia: raw.nomeFantasia || null, regime: regime || null, cnaePrincipal: raw.cnaePrincipal || null, segmento: raw.segmento || null, origem: raw.origem || 'IMPORTACAO',
      email: raw.email ? raw.email.toLowerCase() : null, telefone: raw.telefone || null, status, responsavelId, dataAbertura: abertura,
      tags: raw.tags ? raw.tags.split(/[|,]/).map((t) => t.trim()).filter(Boolean).slice(0, 20) : [], observacoes: raw.observacoes || null,
      endereco: raw.cep || raw.cidade || raw.uf || raw.logradouro ? { cep: raw.cep || null, cidade: raw.cidade || null, uf: raw.uf ? raw.uf.toUpperCase() : null, logradouro: raw.logradouro || null, numero: raw.numero || null, bairro: raw.bairro || null } : null,
    }
    linhas.push({ linha: idx + 2, dados, erros, avisos, acao, existenteId })
  })
  return { linhas, colunasReconhecidas, colunasIgnoradas }
}

const resumoCsv = (linhas: LinhaAnalisada[]) => ({
  total: linhas.length, criar: linhas.filter((l) => l.acao === 'CRIAR').length, atualizar: linhas.filter((l) => l.acao === 'ATUALIZAR').length,
  ignorar: linhas.filter((l) => l.acao === 'IGNORAR').length, comErro: linhas.filter((l) => l.acao === 'ERRO').length,
})
const relatorioErros = (linhas: LinhaAnalisada[]) => gerarCsv(['linha', 'documento', 'nome', 'situacao', 'detalhes'], linhas.filter((l) => l.acao === 'ERRO' || l.acao === 'IGNORAR').map((l) => [l.linha, l.dados.documento, l.dados.nome, l.acao, [...l.erros, ...l.avisos].join(' | ')]))

export function registrarClientes(router: Router) {
  // ---------- opções ----------
  router.get('/clientes/opcoes', exigir(INTERNO), asyncHandler(async (req, res) => {
    const tenantId = tid(req)
    const w = whereCliente(req)
    const [seg, ori, tagsRows, equipe] = await Promise.all([
      prisma.ctbCliente.findMany({ where: { ...w, segmento: { not: null } }, select: { segmento: true }, distinct: ['segmento'] }),
      prisma.ctbCliente.findMany({ where: { ...w, origem: { not: null } }, select: { origem: true }, distinct: ['origem'] }),
      prisma.ctbCliente.findMany({ where: w, select: { tags: true }, take: 2000 }),
      equipeDoTenant(tenantId),
    ])
    res.json({
      status: STATUS_CLIENTE, regimes: REGIMES, papeisContato: PAPEIS_CONTATO, basesLegais: BASES_LEGAIS, ufs: UFS,
      segmentos: seg.map((s) => s.segmento).sort(), origens: ori.map((s) => s.origem).sort(), tags: [...new Set(tagsRows.flatMap((t) => t.tags))].sort(),
      equipe: equipe.map((u) => ({ id: u.id, nome: [u.firstName, u.lastName].filter(Boolean).join(' '), cargo: u.role })),
    })
  }))

  // ---------- listagem ----------
  router.get('/clientes', exigir(INTERNO), asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query)
    const q = qs(req.query.q)
    const extra: any = {}
    for (const k of ['status', 'regime', 'segmento', 'origem', 'responsavelId', 'tipo'] as const) if (qs(req.query[k])) extra[k] = qs(req.query[k])
    if (qs(req.query.tag)) extra.tags = { has: qs(req.query.tag) }
    if (qs(req.query.semResponsavel) === '1') extra.responsavelId = null
    const where = whereCliente(req, extra)
    if (q) {
      const dig = limparDocumento(q)
      where.AND = [...(where.AND || []), { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { nomeFantasia: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(dig.length >= 3 ? [{ documento: { contains: dig } }] : [])] }]
    }
    const [total, rows] = await Promise.all([prisma.ctbCliente.count({ where }), prisma.ctbCliente.findMany({ where, orderBy: [{ nome: 'asc' }], skip, take })])
    const nomes = await nomesDeUsuarios(tid(req), rows.flatMap((r) => [r.responsavelId, r.analistaId]))
    res.json({ items: rows.map((r) => saida(r, nomes)), total, page, pageSize })
  }))

  // ---------- importação / exportação (antes de /:id) ----------
  router.get('/clientes/modelo.csv', exigir(INTERNO), (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="modelo-clientes.csv"')
    res.send(gerarCsv(MODELO_CSV_COLUNAS, [['PJ', '11.222.333/0001-81', 'Padaria Exemplo Ltda', 'Padaria Exemplo', 'SIMPLES', '4721-1/02', 'Comércio', 'Indicação', 'contato@padaria.exemplo.br', '(11) 3000-0000', 'ATIVO', 'varejo|mensal', 'contador@seuescritorio.com.br', '01001-000', 'São Paulo', 'SP', '2015-03-10']]))
  })

  const csvSchema = z.object({ csv: z.string().min(10).max(2_600_000), atualizarExistentes: z.boolean().default(false) })
  router.post('/clientes/importar/previa', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(csvSchema, req.body)
    const a = await analisarCsv(tid(req), d.csv, d.atualizarExistentes)
    res.json({ resumo: resumoCsv(a.linhas), colunasReconhecidas: a.colunasReconhecidas, colunasIgnoradas: a.colunasIgnoradas, linhas: a.linhas.slice(0, 500), truncado: a.linhas.length > 500, relatorioErrosCsv: relatorioErros(a.linhas) })
  }))
  router.post('/clientes/importar', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(csvSchema, req.body)
    const tenantId = tid(req)
    const a = await analisarCsv(tenantId, d.csv, d.atualizarExistentes)
    // Restrito (contador): clientes novos entram na própria carteira se o CSV não indicou responsável.
    const meu = restrito(req) ? uid(req) : null
    let criados = 0, atualizados = 0
    for (const l of a.linhas) {
      if (l.acao === 'CRIAR') {
        await prisma.ctbCliente.create({ data: { tenantId, ...l.dados, responsavelId: l.dados.responsavelId ?? meu, criadoPorId: uid(req), inicioRelacionamento: l.dados.status === 'ATIVO' ? hojeMeioDia() : null } as any })
        criados++
      } else if (l.acao === 'ATUALIZAR' && l.existenteId) {
        const ok = await prisma.ctbCliente.findFirst({ where: whereCliente(req, { id: l.existenteId }), select: { id: true } })
        if (!ok) { l.acao = 'ERRO'; l.erros.push('Sem permissão para atualizar este cliente.'); continue }
        const { documento: _d, responsavelId: _r, status: _s, ...resto } = l.dados
        await prisma.ctbCliente.update({ where: { id: l.existenteId }, data: resto as any })
        atualizados++
      }
    }
    await auditar(req, 'CLIENTES_IMPORTADOS', 'CtbCliente', 'csv', { criados, atualizados, ignorados: a.linhas.filter((l) => l.acao === 'IGNORAR').length, erros: a.linhas.filter((l) => l.acao === 'ERRO').length })
    res.status(201).json({ resumo: { ...resumoCsv(a.linhas), criados, atualizados }, erros: a.linhas.filter((l) => l.acao === 'ERRO').map((l) => ({ linha: l.linha, documento: l.dados.documento, erros: l.erros })), relatorioErrosCsv: relatorioErros(a.linhas) })
  }))

  router.get('/clientes/exportar', exigir(CONTADORES, ['FINANCE']), asyncHandler(async (req, res) => {
    const rows = await prisma.ctbCliente.findMany({ where: whereCliente(req, qs(req.query.status) ? { status: qs(req.query.status) } : {}), orderBy: { nome: 'asc' }, take: 10_000 })
    const nomes = await nomesDeUsuarios(tid(req), rows.map((r) => r.responsavelId))
    await auditar(req, 'CLIENTES_EXPORTADOS', 'CtbCliente', 'csv', { total: rows.length })
    for (const r of rows.slice(0, 200)) void registrarAcesso(req, r.id, 'EXPORTOU', 'exportação da carteira')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"')
    res.send(gerarCsv(['tipo', 'documento', 'nome', 'nome_fantasia', 'status', 'regime', 'cnae', 'segmento', 'origem', 'email', 'telefone', 'responsavel', 'tags', 'cidade', 'uf', 'data_abertura'],
      rows.map((r) => { const e: any = r.endereco || {}; return [r.tipo, r.documento ? formatarDocumento(r.documento) : '', r.nome, r.nomeFantasia, r.status, r.regime, r.cnaePrincipal, r.segmento, r.origem, r.email, r.telefone, r.responsavelId ? nomes.get(r.responsavelId) : '', r.tags.join('|'), e.cidade, e.uf, iso10(r.dataAbertura)] })))
  }))

  // ---------- CRUD ----------
  router.post('/clientes', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const d = parseBody(base, req.body)
    const tenantId = tid(req)
    checarDocumento(d)
    await validarResponsaveis(tenantId, d)
    const doc = limparDocumento(d.documento)
    if (await prisma.ctbCliente.findFirst({ where: { tenantId, documento: doc }, select: { id: true } })) throw httpError(409, 'Já existe um cliente com este CPF/CNPJ.')
    const responsavelId = d.responsavelId ?? (restrito(req) ? uid(req) : null)
    const c = await prisma.ctbCliente.create({ data: { ...(d as any), tenantId, documento: doc, responsavelId, criadoPorId: uid(req), inicioRelacionamento: d.inicioRelacionamento ?? (d.status === 'ATIVO' ? hojeMeioDia() : null) } })
    await auditar(req, 'CLIENTE_CRIADO', 'CtbCliente', c.id, { tipo: c.tipo, status: c.status })
    res.status(201).json(saida(c, await nomesDeUsuarios(tenantId, [c.responsavelId, c.analistaId])))
  }))

  router.get('/clientes/:id', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const [contatos, socios, anexos, contrato, abertas, honAbertos, portal] = await Promise.all([
      prisma.ctbContato.findMany({ where: { tenantId, clienteId: c.id }, orderBy: [{ principal: 'desc' }, { nome: 'asc' }] }),
      prisma.ctbSocio.findMany({ where: { tenantId, clienteId: c.id }, orderBy: { nome: 'asc' } }),
      prisma.ctbCliAnexo.findMany({ where: { tenantId, clienteId: c.id }, select: { id: true, nome: true, mime: true, tamanho: true, categoria: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.ctbContrato.findFirst({ where: { tenantId, clienteId: c.id, status: 'VIGENTE' }, orderBy: { inicio: 'desc' } }),
      prisma.ctbTarefa.count({ where: { tenantId, clienteId: c.id, status: { in: ['A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'] } } }),
      prisma.ctbHonorario.count({ where: { tenantId, clienteId: c.id, status: 'ABERTO' } }),
      prisma.ctbPortalAcesso.findMany({ where: { tenantId, clienteId: c.id }, select: { id: true, userId: true, ativo: true, createdAt: true } }),
    ])
    void registrarAcesso(req, c.id, 'VISUALIZOU')
    const nomes = await nomesDeUsuarios(tenantId, [c.responsavelId, c.analistaId, ...portal.map((p) => p.userId)])
    res.json({ ...saida(c, nomes), contatos, socios, anexos, contratoVigente: contrato, tarefasAbertas: abertas, honorariosAbertos: honAbertos, portal: portal.map((p) => ({ ...p, nome: nomes.get(p.userId) ?? null })) })
  }))

  const upd = base.partial()
  router.put('/clientes/:id', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const atual = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const d = parseBody(upd, req.body)
    if (papelDe(req) === 'ANALISTA_CONTABIL' && (d.status !== undefined || d.responsavelId !== undefined || d.analistaId !== undefined || d.documento !== undefined)) throw httpError(403, 'Analista não altera status, responsáveis nem documento do cliente.')
    if (d.documento !== undefined || d.tipo !== undefined) { checarDocumento({ tipo: d.tipo ?? atual.tipo, documento: d.documento ?? atual.documento ?? undefined }) }
    await validarResponsaveis(tenantId, d)
    if (atual.anonimizadoEm) throw httpError(409, 'Cliente anonimizado não pode ser editado.')
    const data: any = { ...d }
    if (d.documento !== undefined) {
      data.documento = limparDocumento(d.documento)
      if (data.documento !== atual.documento && (await prisma.ctbCliente.findFirst({ where: { tenantId, documento: data.documento, id: { not: atual.id } }, select: { id: true } }))) throw httpError(409, 'Já existe um cliente com este CPF/CNPJ.')
    }
    if (d.status && d.status !== atual.status) return res.status(400).json({ error: 'Use PATCH /clientes/:id/status para mudar a situação do cliente.' })
    delete data.status
    const c = await prisma.ctbCliente.update({ where: { id: atual.id }, data })
    await auditar(req, 'CLIENTE_ATUALIZADO', 'CtbCliente', c.id, { campos: Object.keys(d) })
    res.json(saida(c, await nomesDeUsuarios(tenantId, [c.responsavelId, c.analistaId])))
  }))

  router.patch('/clientes/:id/status', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const atual = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(z.object({ status: z.enum(STATUS_CLIENTE), motivo: txtOpt(300) }), req.body)
    if (atual.anonimizadoEm) throw httpError(409, 'Cliente anonimizado não pode mudar de situação.')
    if ((d.status === 'ENCERRADO' || d.status === 'SUSPENSO') && !d.motivo) throw httpError(400, 'Informe o motivo para suspender ou encerrar o cliente.')
    const tenantId = tid(req)
    const c = await prisma.ctbCliente.update({
      where: { id: atual.id },
      data: { status: d.status, encerradoEm: d.status === 'ENCERRADO' ? hojeMeioDia() : null, inicioRelacionamento: d.status === 'ATIVO' && !atual.inicioRelacionamento ? hojeMeioDia() : undefined },
    })
    if (d.status === 'ENCERRADO') {
      await prisma.ctbContrato.updateMany({ where: { tenantId, clienteId: c.id, status: { in: ['VIGENTE', 'AGUARDANDO_ASSINATURA', 'RASCUNHO'] } }, data: { status: 'ENCERRADO', fim: hojeMeioDia() } })
      await prisma.ctbTarefa.updateMany({ where: { tenantId, clienteId: c.id, status: { in: ['A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE'] } }, data: { status: 'CANCELADA' } })
      await prisma.ctbPortalAcesso.updateMany({ where: { tenantId, clienteId: c.id }, data: { ativo: false } })
    }
    await auditar(req, 'CLIENTE_STATUS', 'CtbCliente', c.id, { de: atual.status, para: d.status, motivo: d.motivo })
    res.json(saida(c, await nomesDeUsuarios(tenantId, [c.responsavelId, c.analistaId])))
  }))

  router.delete('/clientes/:id', exigir(GESTAO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const [ct, hn] = await Promise.all([prisma.ctbContrato.count({ where: { tenantId, clienteId: c.id } }), prisma.ctbHonorario.count({ where: { tenantId, clienteId: c.id } })])
    if (c.status !== 'PROSPECTO' || ct || hn) throw httpError(409, 'Só é possível excluir prospecto sem contratos nem honorários. Para os demais use o encerramento e, se for o caso, a anonimização (LGPD).')
    await excluirDadosDoCliente(tenantId, c.id)
    await auditar(req, 'CLIENTE_EXCLUIDO', 'CtbCliente', c.id, { motivo: 'prospecto sem movimento' })
    res.status(204).end()
  }))

  // ---------- contatos ----------
  const contato = z.object({ nome: txt(120).pipe(z.string().min(2)), papel: z.enum(PAPEIS_CONTATO).default('OUTRO'), email: emailOpt, telefone: txtOpt(30), whatsapp: txtOpt(30), principal: z.boolean().default(false) })
  router.post('/clientes/:id/contatos', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(contato, req.body)
    const tenantId = tid(req)
    if (d.principal) await prisma.ctbContato.updateMany({ where: { tenantId, clienteId: c.id }, data: { principal: false } })
    const r = await prisma.ctbContato.create({ data: { ...d, tenantId, clienteId: c.id } as any })
    await auditar(req, 'CONTATO_CRIADO', 'CtbContato', r.id, { clienteId: c.id })
    res.status(201).json(r)
  }))
  router.put('/clientes/:id/contatos/:cid', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const atual = await prisma.ctbContato.findFirst({ where: { id: String(req.params.cid), tenantId, clienteId: c.id } })
    if (!atual) throw httpError(404, 'Contato não encontrado.')
    const d = parseBody(contato.partial(), req.body)
    if (d.principal) await prisma.ctbContato.updateMany({ where: { tenantId, clienteId: c.id }, data: { principal: false } })
    res.json(await prisma.ctbContato.update({ where: { id: atual.id }, data: d as any }))
  }))
  router.delete('/clientes/:id/contatos/:cid', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const r = await prisma.ctbContato.deleteMany({ where: { id: String(req.params.cid), tenantId: tid(req), clienteId: c.id } })
    if (!r.count) throw httpError(404, 'Contato não encontrado.')
    await auditar(req, 'CONTATO_REMOVIDO', 'CtbContato', String(req.params.cid), { clienteId: c.id })
    res.status(204).end()
  }))

  // ---------- sócios ----------
  const socio = z.object({
    nome: txt(120).pipe(z.string().min(2)), cpf: z.string().trim().max(20).optional().nullable().or(z.literal('').transform(() => null)),
    participacao: z.number().min(0).max(100).optional().nullable(), administrador: z.boolean().default(false), entradaEm: dataOpt,
  })
  const checarCpfSocio = (cpf?: string | null) => { if (cpf && !documentoValido(cpf, 'PF')) throw httpError(400, 'CPF do sócio inválido (dígitos verificadores).') }
  router.post('/clientes/:id/socios', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(socio, req.body)
    checarCpfSocio(d.cpf)
    const tenantId = tid(req)
    const soma = (await prisma.ctbSocio.aggregate({ where: { tenantId, clienteId: c.id }, _sum: { participacao: true } }))._sum.participacao ?? 0
    if (soma + (d.participacao ?? 0) > 100.0001) throw httpError(400, `A soma das participações passaria de 100% (já há ${soma}%).`)
    const r = await prisma.ctbSocio.create({ data: { ...d, cpf: d.cpf ? limparDocumento(d.cpf) : null, tenantId, clienteId: c.id } as any })
    await auditar(req, 'SOCIO_CRIADO', 'CtbSocio', r.id, { clienteId: c.id })
    res.status(201).json(r)
  }))
  router.put('/clientes/:id/socios/:sid', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const tenantId = tid(req)
    const atual = await prisma.ctbSocio.findFirst({ where: { id: String(req.params.sid), tenantId, clienteId: c.id } })
    if (!atual) throw httpError(404, 'Sócio não encontrado.')
    const d = parseBody(socio.partial(), req.body)
    checarCpfSocio(d.cpf)
    if (d.participacao != null) {
      const soma = (await prisma.ctbSocio.aggregate({ where: { tenantId, clienteId: c.id, id: { not: atual.id } }, _sum: { participacao: true } }))._sum.participacao ?? 0
      if (soma + d.participacao > 100.0001) throw httpError(400, `A soma das participações passaria de 100% (os demais somam ${soma}%).`)
    }
    res.json(await prisma.ctbSocio.update({ where: { id: atual.id }, data: { ...d, ...(d.cpf !== undefined ? { cpf: d.cpf ? limparDocumento(d.cpf) : null } : {}) } as any }))
  }))
  router.delete('/clientes/:id/socios/:sid', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const r = await prisma.ctbSocio.deleteMany({ where: { id: String(req.params.sid), tenantId: tid(req), clienteId: c.id } })
    if (!r.count) throw httpError(404, 'Sócio não encontrado.')
    res.status(204).end()
  }))

  // ---------- anexos (o uploadGuard global já varreu o corpo: tipo real, malware, moderação) ----------
  const anexo = z.object({ nome: txt(160).pipe(z.string().min(1)), mime: z.string().trim().max(120), categoria: z.string().trim().max(40).default('OUTRO'), dataUrl: z.string().max(5_000_000) })
  router.post('/clientes/:id/anexos', exigir(EQUIPE), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const d = parseBody(anexo, req.body)
    const m = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(d.dataUrl)
    if (!m) throw httpError(400, 'Arquivo inválido: envie como data URL base64.')
    if (!MIMES_OK.includes(m[1]) || (d.mime && !MIMES_OK.includes(d.mime))) throw httpError(415, 'Tipo de arquivo não permitido (aceitos: PDF, imagem PNG/JPEG, XML, CSV, TXT, DOCX, XLSX).')
    const tamanho = Math.floor((m[2].replace(/\s/g, '').length * 3) / 4)
    if (tamanho > MAX_ANEXO_BYTES) throw httpError(413, `Arquivo maior que ${Math.round(MAX_ANEXO_BYTES / 1048576)} MB.`)
    const r = await prisma.ctbCliAnexo.create({ data: { tenantId: tid(req), clienteId: c.id, nome: d.nome.replace(/[\\/]/g, '_'), mime: m[1], tamanho, categoria: d.categoria, conteudo: d.dataUrl, criadoPorId: uid(req) }, select: { id: true, nome: true, mime: true, tamanho: true, categoria: true, createdAt: true } })
    await auditar(req, 'ANEXO_ENVIADO', 'CtbCliAnexo', r.id, { clienteId: c.id, tamanho })
    res.status(201).json(r)
  }))
  router.get('/clientes/:id/anexos/:aid/download', exigir(INTERNO), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const a = await prisma.ctbCliAnexo.findFirst({ where: { id: String(req.params.aid), tenantId: tid(req), clienteId: c.id } })
    if (!a) throw httpError(404, 'Anexo não encontrado.')
    void registrarAcesso(req, c.id, 'BAIXOU_ANEXO', a.nome)
    enviarArquivo(res, a.nome, a.mime, a.conteudo)
  }))
  router.delete('/clientes/:id/anexos/:aid', exigir(CONTADORES), asyncHandler(async (req, res) => {
    const c = await clienteOuErro(req, String(req.params.id))
    const r = await prisma.ctbCliAnexo.deleteMany({ where: { id: String(req.params.aid), tenantId: tid(req), clienteId: c.id } })
    if (!r.count) throw httpError(404, 'Anexo não encontrado.')
    await auditar(req, 'ANEXO_REMOVIDO', 'CtbCliAnexo', String(req.params.aid), { clienteId: c.id })
    res.status(204).end()
  }))
}

/** Entrega um data URL como download seguro (attachment + nosniff). */
export function enviarArquivo(res: Response, nome: string, mime: string, dataUrl: string) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  res.setHeader('Content-Type', mime || 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^\w.\- ]/g, '_')}"`)
  res.send(Buffer.from(b64, 'base64'))
}

/** Remove TODOS os dados do cliente (usado na exclusão de prospecto e na exclusão LGPD após a retenção). */
export async function excluirDadosDoCliente(tenantId: string, clienteId: string) {
  const w = { tenantId, clienteId }
  const portal = await prisma.ctbPortalAcesso.findMany({ where: w, select: { userId: true } })
  await prisma.$transaction([
    prisma.ctbContato.deleteMany({ where: w }), prisma.ctbSocio.deleteMany({ where: w }), prisma.ctbCliAnexo.deleteMany({ where: w }), prisma.ctbInteracao.deleteMany({ where: w }),
    prisma.ctbTarefa.deleteMany({ where: w }), prisma.ctbApontamento.deleteMany({ where: w }), prisma.ctbHonorario.deleteMany({ where: w }), prisma.ctbContrato.deleteMany({ where: w }),
    prisma.ctbNps.deleteMany({ where: w }), prisma.ctbPortalMsg.deleteMany({ where: w }), prisma.ctbCaixaDoc.deleteMany({ where: w }), prisma.ctbCarGuia.deleteMany({ where: w }),
    prisma.ctbPortalAcesso.deleteMany({ where: w }), prisma.ctbLead.updateMany({ where: w, data: { clienteId: null } }), prisma.ctbProposta.updateMany({ where: w, data: { clienteId: null } }),
    prisma.ctbCliente.deleteMany({ where: { id: clienteId, tenantId } }),
  ])
  if (portal.length) await prisma.user.updateMany({ where: { tenantId, id: { in: portal.map((p) => p.userId) }, role: 'CLIENTE_CONTABIL' }, data: { isActive: false } })
}
