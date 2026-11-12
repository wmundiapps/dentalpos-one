// Regras PURAS do Agente de análise de documentos (sem banco, sem rede): extração de campos a partir de texto, checklist por tipo,
// validações, conflitos entre documentos, sinais de adulteração, equivalência de disciplinas e pontuação.
// Tudo é determinístico e explicável: cada achado traz regra, gravidade, explicação e evidência.

export type Gravidade = 'INFO' | 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'
export type Categoria = 'CONFORMIDADE' | 'CONFLITO' | 'AUTENTICIDADE' | 'INSTITUICAO' | 'EQUIVALENCIA' | 'DUPLICIDADE'
export interface AchadoDraft {
  regra: string
  categoria: Categoria
  gravidade: Gravidade
  titulo: string
  explicacao: string
  evidencia?: Record<string, unknown>
  sugestao?: string
  documentoIdx?: number
}

export const ORIGENS = ['SECRETARIA', 'FINANCEIRO', 'JURIDICO'] as const
export type Origem = (typeof ORIGENS)[number]
export const CONTEXTOS = ['MATRICULA', 'TRANSFERENCIA', 'EQUIVALENCIA', 'DIPLOMA', 'COMPROVANTE', 'NOTA_FISCAL', 'CONTRATO', 'CERTIDAO', 'OUTRO'] as const

export interface DisciplinaOrigem { nome: string; cargaHoraria?: number | null; nota?: number | null; situacao?: string | null; ano?: number | null; ementa?: string | null }
export interface Campos {
  nome?: string; cpf?: string; rg?: string; dataNascimento?: string
  instituicao?: string; codigoIes?: string; cnpj?: string; uf?: string; nivelEnsino?: string // SUPERIOR | ENSINO_MEDIO | EJA
  curso?: string; cargaHorariaTotal?: number
  dataEmissao?: string; dataConclusao?: string; dataInicio?: string; validade?: string; vencimento?: string
  numeroDocumento?: string; assinaturaDigital?: boolean; qrCode?: boolean; codigoVerificacao?: string
  valor?: number; emitente?: string; emitenteCnpj?: string; chaveAcesso?: string
  partes?: string; vigenciaInicio?: string; vigenciaFim?: string
  disciplinas?: DisciplinaOrigem[]
}
export interface Metadados {
  producer?: string; creator?: string; criadoEm?: string; modificadoEm?: string
  softwareEdicao?: boolean; camposSobrepostos?: boolean; fontesDistintas?: number
  assinaturaValida?: boolean; qrConfere?: boolean; assinaturaPresente?: boolean
}

// ------------------------------------------------------------------ catálogo de tipos e checklist
export interface ItemChecklist { item: string; campo: string; obrigatorio: boolean; ok?: boolean }
export const TIPOS_DOCUMENTO: Record<string, { nome: string; origens: Origem[]; itens: Array<{ item: string; campo: string; obrigatorio?: boolean }> }> = {
  HISTORICO_ESCOLAR: {
    nome: 'Histórico escolar (ensino superior)', origens: ['SECRETARIA'],
    itens: [
      { item: 'Nome do aluno', campo: 'nome' }, { item: 'CPF', campo: 'cpf', obrigatorio: false }, { item: 'Instituição de origem', campo: 'instituicao' },
      { item: 'Curso', campo: 'curso' }, { item: 'Carga horária total', campo: 'cargaHorariaTotal' }, { item: 'Disciplinas com carga horária e nota', campo: 'disciplinas' },
      { item: 'Data de emissão', campo: 'dataEmissao' }, { item: 'Assinatura ou QR/código de verificação', campo: 'assinaturaOuQr' },
    ],
  },
  HISTORICO_ENSINO_MEDIO: {
    nome: 'Histórico do ensino médio / EJA', origens: ['SECRETARIA'],
    itens: [
      { item: 'Nome do aluno', campo: 'nome' }, { item: 'Escola de origem', campo: 'instituicao' }, { item: 'UF da escola', campo: 'uf' },
      { item: 'Data de conclusão', campo: 'dataConclusao' }, { item: 'Data de emissão', campo: 'dataEmissao' }, { item: 'Assinatura ou QR/código de verificação', campo: 'assinaturaOuQr' },
    ],
  },
  DIPLOMA: {
    nome: 'Diploma / certificado de conclusão', origens: ['SECRETARIA'],
    itens: [
      { item: 'Nome do diplomado', campo: 'nome' }, { item: 'CPF', campo: 'cpf' }, { item: 'Instituição', campo: 'instituicao' }, { item: 'Curso', campo: 'curso' },
      { item: 'Data de conclusão', campo: 'dataConclusao' }, { item: 'Número de registro do diploma', campo: 'numeroDocumento' }, { item: 'Assinatura ou QR/código de verificação', campo: 'assinaturaOuQr' },
    ],
  },
  RG_CPF: {
    nome: 'RG / CPF', origens: ['SECRETARIA', 'FINANCEIRO', 'JURIDICO'],
    itens: [{ item: 'Nome', campo: 'nome' }, { item: 'CPF', campo: 'cpf' }, { item: 'Data de nascimento', campo: 'dataNascimento' }, { item: 'RG', campo: 'rg', obrigatorio: false }],
  },
  COMPROVANTE: {
    nome: 'Comprovante (pagamento/residência)', origens: ['FINANCEIRO', 'SECRETARIA'],
    itens: [{ item: 'Nome do titular/pagador', campo: 'nome' }, { item: 'Valor', campo: 'valor' }, { item: 'Data', campo: 'dataEmissao' }, { item: 'Emitente / banco', campo: 'emitente' }],
  },
  NOTA_FISCAL: {
    nome: 'Nota fiscal', origens: ['FINANCEIRO'],
    itens: [
      { item: 'Emitente', campo: 'emitente' }, { item: 'CNPJ do emitente', campo: 'emitenteCnpj' }, { item: 'Número da nota', campo: 'numeroDocumento' }, { item: 'Valor', campo: 'valor' },
      { item: 'Data de emissão', campo: 'dataEmissao' }, { item: 'Chave de acesso / código de verificação', campo: 'chaveOuCodigo', obrigatorio: false },
    ],
  },
  CONTRATO: {
    nome: 'Contrato', origens: ['JURIDICO', 'FINANCEIRO'],
    itens: [{ item: 'Partes', campo: 'partes' }, { item: 'Início da vigência', campo: 'vigenciaInicio' }, { item: 'Fim da vigência', campo: 'vigenciaFim', obrigatorio: false }, { item: 'Valor', campo: 'valor', obrigatorio: false }, { item: 'Assinatura', campo: 'assinaturaOuQr' }],
  },
  CERTIDAO: {
    nome: 'Certidão', origens: ['JURIDICO', 'FINANCEIRO', 'SECRETARIA'],
    itens: [{ item: 'Emitente (órgão)', campo: 'emitente' }, { item: 'Titular (nome ou CNPJ)', campo: 'titular' }, { item: 'Data de emissão', campo: 'dataEmissao' }, { item: 'Validade', campo: 'validade' }, { item: 'Código de verificação', campo: 'codigoVerificacao', obrigatorio: false }],
  },
  DECLARACAO: {
    nome: 'Declaração', origens: ['SECRETARIA', 'JURIDICO', 'FINANCEIRO'],
    itens: [{ item: 'Nome', campo: 'nome' }, { item: 'Instituição/emitente', campo: 'instituicao' }, { item: 'Data de emissão', campo: 'dataEmissao' }, { item: 'Assinatura ou QR/código de verificação', campo: 'assinaturaOuQr' }],
  },
}
export const tipoValido = (t: string) => t in TIPOS_DOCUMENTO

// ------------------------------------------------------------------ utilitários de texto, datas e documentos
export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D+/g, '')
export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])
export function normNome(s: unknown): string {
  return semAcento(String(s ?? '')).toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter((t) => t && !PARTICULAS.has(t)).join(' ')
}
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}
/** 0..1. Considera abreviações de nomes do meio (ex.: "MARIA J SILVA" ~ "MARIA JOSE SILVA"). */
export function similaridadeNome(a: unknown, b: unknown): number {
  const x = normNome(a), y = normNome(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const tx = x.split(' '), ty = y.split(' ')
  // mesmo primeiro e último nome e demais compatíveis (iniciais) => quase igual
  if (tx[0] === ty[0] && tx[tx.length - 1] === ty[ty.length - 1]) {
    const mx = tx.slice(1, -1), my = ty.slice(1, -1)
    const compat = mx.every((t) => my.some((u) => u === t || u[0] === t[0])) || my.every((t) => mx.some((u) => u === t || u[0] === t[0]))
    if (compat) return 0.92
  }
  const d = levenshtein(x, y)
  return Math.max(0, 1 - d / Math.max(x.length, y.length))
}

export function validarCpf(v: unknown): boolean {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
export function validarCnpj(v: unknown): boolean {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((acc, p, i) => acc + p * Number(c[i]), 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13])
}
export const formatarCpf = (v: string) => { const c = soDigitos(v); return c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : v }
export const mascararCpfDoc = (v: unknown) => { const c = soDigitos(v); return c.length === 11 ? `***.${c.slice(3, 6)}.***-${c.slice(9)}` : c ? '***' : '' }
export function mascararNomeDoc(v: unknown): string {
  const p = String(v ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return ''
  return p.map((t, i) => (i === 0 || PARTICULAS.has(t.toUpperCase()) ? t : t[0] + '.')).join(' ')
}

/** Aceita dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd e ISO. Retorna 'aaaa-mm-dd' ou undefined. */
export function parseData(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const s = String(v).trim()
  let m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/)
  let y: number, mo: number, d: number
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3] } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; mo = +m[2]; d = +m[3] } else return undefined
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined
  return dt.toISOString().slice(0, 10)
}
const ts = (d?: string) => (d ? Date.parse(d + 'T12:00:00Z') : NaN)
const DAY = 86_400_000
export const anosEntre = (a: string, b: string) => (ts(b) - ts(a)) / (365.25 * DAY)

// ------------------------------------------------------------------ extração a partir de texto
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'))
const linhaRe = (rot: string) => new RegExp(`(?:^|\\n)\\s*(?:${rot})\\s*[:\\-]\\s*([^\\n]+)`, 'i')
const pega = (t: string, rot: string) => t.match(linhaRe(rot))?.[1]?.trim()

export function extrairCampos(texto: string): Campos {
  const t = texto.replace(/\r/g, '')
  const c: Campos = {}
  const nome = pega(t, 'nome completo|nome do aluno|nome do diplomado|diplomado\\(a\\)|diplomado|nome do titular|nome|aluno\\(a\\)|aluno|titular|requerente|pagador')
  if (nome) c.nome = nome.replace(/\s{2,}/g, ' ')
  const cpf = t.match(/cpf[^\d\n]{0,12}(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i)?.[1]
  if (cpf) c.cpf = soDigitos(cpf)
  const rg = t.match(/\brg[^\dA-Za-z\n]{0,12}([\dxX][\dxX.\-]{4,13})/i)?.[1]
  if (rg) c.rg = rg
  const nasc = pega(t, 'data de nascimento|nascimento|nasc\\.?')
  if (nasc) c.dataNascimento = parseData(nasc)
  const inst = pega(t, 'institui[cç][aã]o de origem|institui[cç][aã]o|escola de origem|escola|col[eé]gio|universidade|faculdade|centro universit[aá]rio|emitida por|expedido por')
  if (inst) c.instituicao = inst
  const cod = t.match(/c[oó]digo (?:e-?mec|da ies|da institui[cç][aã]o|ies|da escola|inep)[^\d\n]{0,6}(\d{3,10})/i)?.[1]
  if (cod) c.codigoIes = cod
  const uf = pega(t, 'uf|estado')
  if (uf && /^[A-Za-z]{2}\b/.test(uf)) c.uf = uf.slice(0, 2).toUpperCase()
  const curso = pega(t, 'curso')
  if (curso) c.curso = curso
  const ch = t.match(/carga hor[aá]ria total[^\d\n]{0,10}(\d{2,5})/i)?.[1]
  if (ch) c.cargaHorariaTotal = Number(ch)
  const lvl = pega(t, 'n[ií]vel de ensino|modalidade')
  if (lvl) c.nivelEnsino = /eja|jovens e adultos/i.test(lvl) ? 'EJA' : /m[eé]dio/i.test(lvl) ? 'ENSINO_MEDIO' : /superior|gradua/i.test(lvl) ? 'SUPERIOR' : undefined
  else if (/ensino m[eé]dio/i.test(t)) c.nivelEnsino = /\beja\b|jovens e adultos/i.test(t) ? 'EJA' : 'ENSINO_MEDIO'
  const dEm = pega(t, 'data de emiss[aã]o|emitido em|emiss[aã]o|data do documento|data do pagamento|data')
  if (dEm) c.dataEmissao = parseData(dEm)
  const dCon = pega(t, 'data de conclus[aã]o|conclus[aã]o|data de colação de grau|colação de grau')
  if (dCon) c.dataConclusao = parseData(dCon)
  const dIni = pega(t, 'data de in[ií]cio|in[ií]cio do curso|ingresso')
  if (dIni) c.dataInicio = parseData(dIni)
  const val = pega(t, 'validade|v[aá]lida at[eé]')
  if (val) c.validade = parseData(val)
  const venc = pega(t, 'vencimento')
  if (venc) c.vencimento = parseData(venc)
  const reg = t.match(/(?:registro|diploma|nota fiscal|nf-?e?|certid[aã]o)\s*(?:n[ºo°.]{0,2}|n[uú]mero)\s*[:\-]?\s*([A-Z0-9][A-Z0-9./\-]{2,30})/i)?.[1]
  if (reg) c.numeroDocumento = reg
  const cv = t.match(/c[oó]digo de (?:verifica[cç][aã]o|controle|autenticidade)\s*[:\-]?\s*([A-Z0-9.\-]{6,40})/i)?.[1]
  if (cv) c.codigoVerificacao = cv
  const chave = t.match(/chave de acesso[^\d\n]{0,6}((?:\d[\s.]?){44})/i)?.[1]
  if (chave) c.chaveAcesso = soDigitos(chave)
  const cnpjs = [...t.matchAll(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g)].map((m) => soDigitos(m[1]))
  if (cnpjs[0]) { c.cnpj = cnpjs[0]; c.emitenteCnpj = cnpjs[0] }
  const emit = pega(t, 'emitente|fornecedor|prestador|benefici[aá]rio|banco|[oó]rg[aã]o emissor|[oó]rg[aã]o')
  if (emit) c.emitente = emit
  const valor = t.match(/valor(?: total| pago| da nota)?\s*[:\-]?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/i)?.[1]
  if (valor) c.valor = valor.includes(',') ? num(valor) : Number(valor)
  const partes = [...t.matchAll(/(?:contratante|contratada|locador|locat[aá]rio|partes)\s*[:\-]\s*([^\n]+)/gi)].map((m) => m[1].trim())
  if (partes.length) c.partes = partes.join(' / ')
  const vi = pega(t, 'in[ií]cio da vig[eê]ncia|vig[eê]ncia (?:de|inicial)|in[ií]cio')
  if (vi) c.vigenciaInicio = parseData(vi)
  const vf = pega(t, 'fim da vig[eê]ncia|t[eé]rmino|vig[eê]ncia at[eé]|fim')
  if (vf) c.vigenciaFim = parseData(vf)
  if (/assinad[oa] digitalmente|assinatura digital|icp-?brasil|assinatura eletr[oô]nica|assinatura:\s*(?:presente|ok|sim)/i.test(t)) c.assinaturaDigital = true
  if (/assinatura:\s*(?:ausente|n[aã]o|sem)/i.test(t)) c.assinaturaDigital = false
  if (/qr[\s-]?code|qrcode/i.test(t)) c.qrCode = !/qr[\s-]?code\s*[:\-]?\s*(?:ausente|n[aã]o|sem)/i.test(t)
  // disciplinas: "Nome | CH | Nota | Situação | Ano" (separador | ou ;)
  const disc: DisciplinaOrigem[] = []
  const ementas = new Map<string, string>()
  for (const m of t.matchAll(/^\s*ementa\s*\(([^)]+)\)\s*[:\-]\s*(.+)$/gim)) ementas.set(normNome(m[1]), m[2].trim())
  for (const ln of t.split('\n')) {
    const m = ln.match(/^\s*([^|;\n]{3,80}?)\s*[|;]\s*(\d{1,4})\s*h?\s*[|;]\s*(\d{1,2}(?:[.,]\d{1,2})?|-)\s*[|;]\s*([A-Za-zÀ-ú ]{3,24}?)\s*(?:[|;]\s*(\d{4}))?\s*$/)
    if (!m || /^disciplina\b/i.test(m[1])) continue
    disc.push({ nome: m[1].trim(), cargaHoraria: Number(m[2]), nota: m[3] === '-' ? null : num(m[3]), situacao: m[4].trim().toUpperCase().replace(/\s+/g, '_'), ano: m[5] ? Number(m[5]) : null, ementa: ementas.get(normNome(m[1])) ?? null })
  }
  if (disc.length) c.disciplinas = disc
  return c
}

export const temAssinaturaOuQr = (c: Campos, m?: Metadados) => Boolean(c.assinaturaDigital || c.qrCode || c.codigoVerificacao || m?.assinaturaPresente)

// ------------------------------------------------------------------ checklist
export function montarChecklist(tipo: string, c: Campos, m?: Metadados): ItemChecklist[] {
  const def = TIPOS_DOCUMENTO[tipo]
  if (!def) return []
  return def.itens.map((i) => {
    const campo = i.campo
    let ok: boolean
    if (campo === 'assinaturaOuQr') ok = temAssinaturaOuQr(c, m)
    else if (campo === 'chaveOuCodigo') ok = Boolean(c.chaveAcesso || c.codigoVerificacao)
    else if (campo === 'titular') ok = Boolean(c.nome || c.cnpj || c.emitenteCnpj)
    else if (campo === 'disciplinas') ok = Boolean(c.disciplinas?.length && c.disciplinas.every((d) => d.cargaHoraria && (d.nota != null || d.situacao)))
    else { const v = (c as any)[campo]; ok = v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && !(v > 0) && campo !== 'valor') }
    return { item: i.item, campo, obrigatorio: i.obrigatorio !== false, ok }
  })
}

// ------------------------------------------------------------------ regras por documento
export interface CtxRegras { hoje?: Date; origem?: Origem }
const SOFTWARE_EDICAO = /(photoshop|gimp|canva|pixlr|\bpaint\b|coreldraw|corel|illustrator|ilovepdf|smallpdf|sejda|pdfescape|pdf-?xchange|foxit phantom|nitro|inkscape|affinity|snapseed)/i

export function sinaisAdulteracao(m: Metadados | undefined, c: Campos): Array<{ sinal: string; peso: number; detalhe: string }> {
  if (!m) return []
  const s: Array<{ sinal: string; peso: number; detalhe: string }> = []
  const prod = `${m.producer ?? ''} ${m.creator ?? ''}`
  if (m.softwareEdicao || (prod.trim() && SOFTWARE_EDICAO.test(prod))) s.push({ sinal: 'SOFTWARE_EDICAO', peso: 1, detalhe: `Gerado/alterado por programa de edição de imagem/PDF (${prod.trim() || 'informado'})` })
  const cr = parseData(m.criadoEm), md = parseData(m.modificadoEm)
  if (cr && md && ts(md) - ts(cr) > DAY) s.push({ sinal: 'MODIFICADO_APOS_CRIACAO', peso: 1, detalhe: `Arquivo modificado ${Math.round((ts(md) - ts(cr)) / DAY)} dia(s) após ser criado` })
  const emis = c.dataEmissao
  if (cr && emis && ts(cr) < ts(emis) - DAY) s.push({ sinal: 'CRIADO_ANTES_DA_EMISSAO', peso: 2, detalhe: `Arquivo criado em ${cr}, antes da data de emissão declarada (${emis})` })
  if (m.camposSobrepostos) s.push({ sinal: 'CAMPOS_SOBREPOSTOS', peso: 2, detalhe: 'Há texto/imagem sobreposto sobre campos do documento (nome, nota ou data)' })
  if ((m.fontesDistintas ?? 0) >= 4) s.push({ sinal: 'FONTES_MISTURADAS', peso: 1, detalhe: `${m.fontesDistintas} tipos de letra distintos no mesmo documento` })
  if (m.assinaturaPresente && m.assinaturaValida === false) s.push({ sinal: 'ASSINATURA_INVALIDA', peso: 3, detalhe: 'A assinatura digital está presente, mas a verificação do certificado/integridade falhou' })
  if ((c.qrCode || m.qrConfere === false) && m.qrConfere === false) s.push({ sinal: 'QR_NAO_CONFERE', peso: 3, detalhe: 'O QR Code/código de verificação não confere com os dados impressos' })
  return s
}

export function avaliarDocumento(tipo: string, c: Campos, m: Metadados | undefined, ctx: CtxRegras = {}): AchadoDraft[] {
  const out: AchadoDraft[] = []
  const hoje = (ctx.hoje ?? new Date()).toISOString().slice(0, 10)
  const add = (a: AchadoDraft) => out.push(a)

  // checklist
  for (const it of montarChecklist(tipo, c, m)) {
    if (it.ok || !it.obrigatorio) continue
    const critico = it.campo === 'assinaturaOuQr'
    add({
      regra: critico ? 'ASSINATURA_QR_AUSENTE' : 'CAMPO_OBRIGATORIO_AUSENTE', categoria: 'CONFORMIDADE', gravidade: critico ? 'ALTA' : ['nome', 'cpf', 'instituicao'].includes(it.campo) ? 'ALTA' : 'MEDIA',
      titulo: critico ? 'Sem assinatura nem QR Code/código de verificação' : `Campo ausente: ${it.item}`,
      explicacao: critico ? 'O documento não traz assinatura (digital ou manuscrita reconhecida) nem QR Code/código que permita verificar a autenticidade.' : `O item "${it.item}" é exigido para ${TIPOS_DOCUMENTO[tipo]?.nome ?? tipo} e não foi encontrado.`,
      sugestao: critico ? 'Solicitar documento com assinatura digital ou via autenticada na origem.' : 'Solicitar documento completo ou conferir/complementar o campo manualmente.', evidencia: { campo: it.campo },
    })
  }
  // CPF / CNPJ
  if (c.cpf && !validarCpf(c.cpf)) add({ regra: 'CPF_INVALIDO', categoria: 'CONFORMIDADE', gravidade: 'ALTA', titulo: 'CPF com dígito verificador inválido', explicacao: 'O CPF informado não passa na validação dos dígitos verificadores; pode ser erro de digitação ou documento forjado.', evidencia: { cpf: mascararCpfDoc(c.cpf) }, sugestao: 'Conferir o CPF com o documento de identificação original.' })
  for (const [campo, v] of [['cnpj', c.cnpj], ['emitenteCnpj', c.emitenteCnpj]] as const) {
    if (v && soDigitos(v).length === 14 && !validarCnpj(v) && !(campo === 'cnpj' && c.emitenteCnpj === v && out.some((o) => o.regra === 'CNPJ_INVALIDO')))
      add({ regra: 'CNPJ_INVALIDO', categoria: 'CONFORMIDADE', gravidade: 'ALTA', titulo: 'CNPJ com dígito verificador inválido', explicacao: 'O CNPJ do emitente não passa na validação dos dígitos verificadores.', evidencia: { cnpj: soDigitos(v).replace(/^(\d{2})\d{6}(\d{4})(\d{2})$/, '$1.***.***/$2-$3') } })
  }
  if (c.chaveAcesso && soDigitos(c.chaveAcesso).length !== 44) add({ regra: 'CHAVE_ACESSO_INVALIDA', categoria: 'CONFORMIDADE', gravidade: 'MEDIA', titulo: 'Chave de acesso da nota com tamanho incorreto', explicacao: 'A chave de acesso da NF-e deve ter 44 dígitos.', evidencia: { digitos: soDigitos(c.chaveAcesso).length } })

  // datas
  const datas: Array<[string, string | undefined]> = [['emissão', c.dataEmissao], ['conclusão', c.dataConclusao], ['início', c.dataInicio], ['nascimento', c.dataNascimento]]
  for (const [rot, d] of datas) if (d && ts(d) > ts(hoje) + DAY && !(rot === 'conclusão' && false)) add({ regra: 'DATA_FUTURA', categoria: 'CONFLITO', gravidade: 'ALTA', titulo: `Data de ${rot} no futuro`, explicacao: `A data de ${rot} (${d}) é posterior à data de hoje (${hoje}).`, evidencia: { campo: rot, data: d } })
  if (c.dataInicio && c.dataConclusao && ts(c.dataConclusao) < ts(c.dataInicio)) add({ regra: 'DATAS_INCOERENTES', categoria: 'CONFLITO', gravidade: 'ALTA', titulo: 'Conclusão anterior ao início', explicacao: `A data de conclusão (${c.dataConclusao}) é anterior à de início (${c.dataInicio}).`, evidencia: { inicio: c.dataInicio, conclusao: c.dataConclusao } })
  if (c.dataConclusao && c.dataEmissao && ts(c.dataEmissao) < ts(c.dataConclusao) - DAY) add({ regra: 'DATAS_INCOERENTES', categoria: 'CONFLITO', gravidade: 'ALTA', titulo: 'Documento emitido antes da conclusão', explicacao: `Emissão (${c.dataEmissao}) anterior à conclusão (${c.dataConclusao}): um diploma/histórico concluído não pode ser emitido antes de o curso terminar.`, evidencia: { emissao: c.dataEmissao, conclusao: c.dataConclusao } })
  if (c.dataNascimento && c.dataConclusao) {
    const idade = anosEntre(c.dataNascimento, c.dataConclusao)
    const min = tipo === 'HISTORICO_ENSINO_MEDIO' ? 14 : 16
    if (idade < min) add({ regra: 'IDADE_INCOMPATIVEL', categoria: 'CONFLITO', gravidade: 'ALTA', titulo: 'Idade incompatível com a conclusão', explicacao: `A pessoa teria ${Math.floor(idade)} ano(s) na data de conclusão — abaixo do mínimo plausível (${min}).`, evidencia: { nascimento: c.dataNascimento, conclusao: c.dataConclusao } })
  }
  if (c.validade && ts(c.validade) < ts(hoje)) add({ regra: 'DOCUMENTO_VENCIDO', categoria: 'CONFORMIDADE', gravidade: 'ALTA', titulo: 'Documento/certidão vencido', explicacao: `A validade (${c.validade}) já passou.`, evidencia: { validade: c.validade }, sugestao: 'Solicitar nova via atualizada.' })
  if (c.vigenciaInicio && c.vigenciaFim && ts(c.vigenciaFim) < ts(c.vigenciaInicio)) add({ regra: 'DATAS_INCOERENTES', categoria: 'CONFLITO', gravidade: 'ALTA', titulo: 'Fim da vigência anterior ao início', explicacao: `Vigência de ${c.vigenciaInicio} até ${c.vigenciaFim}.`, evidencia: { inicio: c.vigenciaInicio, fim: c.vigenciaFim } })
  if (c.vigenciaFim && tipo === 'CONTRATO' && ts(c.vigenciaFim) < ts(hoje)) add({ regra: 'DOCUMENTO_VENCIDO', categoria: 'CONFORMIDADE', gravidade: 'MEDIA', titulo: 'Contrato com vigência já encerrada', explicacao: `A vigência terminou em ${c.vigenciaFim}.`, evidencia: { fim: c.vigenciaFim } })

  // disciplinas, carga horária e notas
  const ds = c.disciplinas ?? []
  if (ds.length) {
    const soma = ds.reduce((a, d) => a + (Number(d.cargaHoraria) || 0), 0)
    if (c.cargaHorariaTotal && c.cargaHorariaTotal > 0) {
      const dif = Math.abs(soma - c.cargaHorariaTotal) / c.cargaHorariaTotal
      if (dif > 0.02) add({ regra: 'CARGA_HORARIA_NAO_FECHA', categoria: 'CONFLITO', gravidade: dif > 0.05 ? 'ALTA' : 'MEDIA', titulo: 'Carga horária não fecha', explicacao: `A soma das disciplinas (${soma} h) difere da carga horária total declarada (${c.cargaHorariaTotal} h) em ${(dif * 100).toFixed(1)}%.`, evidencia: { somaDisciplinas: soma, totalDeclarado: c.cargaHorariaTotal }, sugestao: 'Conferir disciplinas omitidas ou carga horária alterada.' })
    }
    const vistos = new Set<string>()
    for (const d of ds) {
      if (d.nota != null && (d.nota < 0 || d.nota > 10)) add({ regra: 'NOTA_INVALIDA', categoria: 'CONFLITO', gravidade: 'ALTA', titulo: `Nota fora da escala 0-10 (${d.nome})`, explicacao: `A nota ${d.nota} de "${d.nome}" está fora da escala esperada.`, evidencia: { disciplina: d.nome, nota: d.nota } })
      const sit = String(d.situacao ?? '').toUpperCase()
      if (d.nota != null && d.nota < 5 && /APROVAD/.test(sit)) add({ regra: 'SITUACAO_INCOERENTE', categoria: 'CONFLITO', gravidade: 'MEDIA', titulo: `Aprovado com nota baixa (${d.nome})`, explicacao: `"${d.nome}" consta como aprovada com nota ${d.nota}.`, evidencia: { disciplina: d.nome, nota: d.nota, situacao: sit } })
      if (d.nota != null && d.nota >= 7 && /REPROVAD/.test(sit)) add({ regra: 'SITUACAO_INCOERENTE', categoria: 'CONFLITO', gravidade: 'MEDIA', titulo: `Reprovado com nota alta (${d.nome})`, explicacao: `"${d.nome}" consta como reprovada com nota ${d.nota}.`, evidencia: { disciplina: d.nome, nota: d.nota, situacao: sit } })
      const k = normNome(d.nome)
      if (vistos.has(k)) add({ regra: 'DISCIPLINA_DUPLICADA', categoria: 'CONFORMIDADE', gravidade: 'BAIXA', titulo: `Disciplina repetida (${d.nome})`, explicacao: 'A mesma disciplina aparece mais de uma vez no histórico.', evidencia: { disciplina: d.nome } })
      vistos.add(k)
    }
  }

  // adulteração por metadados
  const sinais = sinaisAdulteracao(m, c)
  if (sinais.length) {
    const peso = sinais.reduce((a, s) => a + s.peso, 0)
    const forte = sinais.some((s) => s.peso >= 3)
    add({
      regra: 'INDICIO_ADULTERACAO', categoria: 'AUTENTICIDADE', gravidade: forte || peso >= 3 ? 'CRITICA' : peso === 2 ? 'ALTA' : 'MEDIA',
      titulo: forte || peso >= 3 ? 'Indício forte de adulteração/falsidade' : 'Sinais de edição do arquivo',
      explicacao: `Regras de metadados e estrutura encontraram ${sinais.length} sinal(is): ${sinais.map((s) => s.detalhe).join('; ')}. Isto é um INDÍCIO, não uma perícia: exige conferência humana e, se confirmado, comunicação às autoridades.`,
      evidencia: { sinais: sinais.map((s) => s.sinal), pontos: peso }, sugestao: 'Pedir o documento original/nova via direto da instituição e verificar o código de autenticidade no site oficial.',
    })
  }
  return out
}

// ------------------------------------------------------------------ conflitos entre documentos e com o cadastro
export interface DocParaComparar { idx: number; tipo: string; campos: Campos }
export interface CadastroAluno { nome?: string | null; cpf?: string | null; dataNascimento?: string | null }

export function compararDocumentos(docs: DocParaComparar[], cadastro?: CadastroAluno): AchadoDraft[] {
  const out: AchadoDraft[] = []
  type Fonte = { rotulo: string; idx?: number; nome?: string; cpf?: string; nasc?: string }
  const fontes: Fonte[] = docs.map((d) => ({ rotulo: `${TIPOS_DOCUMENTO[d.tipo]?.nome ?? d.tipo} #${d.idx + 1}`, idx: d.idx, nome: d.campos.nome, cpf: d.campos.cpf ? soDigitos(d.campos.cpf) : undefined, nasc: d.campos.dataNascimento }))
  if (cadastro) fontes.push({ rotulo: 'Cadastro do aluno no sistema', nome: cadastro.nome ?? undefined, cpf: cadastro.cpf ? soDigitos(cadastro.cpf) : undefined, nasc: parseData(cadastro.dataNascimento) })
  for (let i = 0; i < fontes.length; i++) {
    for (let j = i + 1; j < fontes.length; j++) {
      const a = fontes[i], b = fontes[j]
      const ref = { origem: a.rotulo, comparadoCom: b.rotulo }
      const cad = a.idx === undefined || b.idx === undefined
      const idCpf = a.cpf && b.cpf && a.cpf !== b.cpf
      const sim = a.nome && b.nome ? similaridadeNome(a.nome, b.nome) : null
      if (idCpf) out.push({
        regra: 'CONFLITO_CPF', categoria: 'CONFLITO', gravidade: 'CRITICA', documentoIdx: b.idx ?? a.idx,
        titulo: cad ? 'CPF diverge do cadastro do aluno' : 'CPF diferente entre documentos',
        explicacao: `${a.rotulo} traz CPF ${mascararCpfDoc(a.cpf)} e ${b.rotulo} traz ${mascararCpfDoc(b.cpf)}. Conflito grave de identidade: pode tratar-se de outra pessoa ou de documento falso.`,
        evidencia: { ...ref, cpfA: mascararCpfDoc(a.cpf), cpfB: mascararCpfDoc(b.cpf) }, sugestao: 'Suspender o processo e confirmar a identidade presencialmente com documento oficial com foto.',
      })
      if (sim !== null && sim < 0.999) {
        const grave = sim < 0.6
        if (grave) out.push({
          regra: 'CONFLITO_NOME', categoria: 'CONFLITO', gravidade: idCpf ? 'CRITICA' : 'ALTA', documentoIdx: b.idx ?? a.idx,
          titulo: cad ? 'Nome diverge do cadastro do aluno' : 'Nome muito diferente entre documentos',
          explicacao: `"${mascararNomeDoc(a.nome)}" (${a.rotulo}) e "${mascararNomeDoc(b.nome)}" (${b.rotulo}) têm similaridade de apenas ${(sim * 100).toFixed(0)}%.`,
          evidencia: { ...ref, similaridade: Math.round(sim * 100) }, sugestao: 'Confirmar se houve mudança de nome (casamento, retificação) e exigir a certidão correspondente.',
        })
        else if (sim < 0.95) out.push({
          regra: 'NOME_GRAFIA_DIFERENTE', categoria: 'CONFLITO', gravidade: 'BAIXA', documentoIdx: b.idx ?? a.idx,
          titulo: 'Grafia do nome diferente', explicacao: `Os nomes em ${a.rotulo} e ${b.rotulo} diferem pouco (${(sim * 100).toFixed(0)}% de similaridade): abreviação, acento ou erro de digitação.`,
          evidencia: { ...ref, similaridade: Math.round(sim * 100) }, sugestao: 'Padronizar o nome conforme o documento de identidade.',
        })
      }
      if (a.nasc && b.nasc && a.nasc !== b.nasc) out.push({
        regra: 'CONFLITO_NASCIMENTO', categoria: 'CONFLITO', gravidade: 'ALTA', documentoIdx: b.idx ?? a.idx, titulo: 'Data de nascimento diferente',
        explicacao: `Nascimento ${a.nasc} em ${a.rotulo} e ${b.nasc} em ${b.rotulo}.`, evidencia: { ...ref, a: a.nasc, b: b.nasc }, sugestao: 'Conferir com a certidão de nascimento/RG.',
      })
    }
  }
  return out
}

// ------------------------------------------------------------------ pontuação
const PESO: Record<Gravidade, number> = { INFO: 0, BAIXA: 3, MEDIA: 10, ALTA: 25, CRITICA: 60 }
export function pontuar(achados: Array<{ gravidade: string; resolvido?: boolean }>): number {
  const s = achados.filter((a) => !a.resolvido).reduce((acc, a) => acc + (PESO[a.gravidade as Gravidade] ?? 0), 0)
  return Math.min(100, s)
}
export function resultadoDe(achados: Array<{ gravidade: string }>): 'OK' | 'ATENCAO' | 'CRITICO' {
  if (achados.some((a) => a.gravidade === 'CRITICA')) return 'CRITICO'
  if (achados.some((a) => a.gravidade === 'ALTA' || a.gravidade === 'MEDIA')) return 'ATENCAO'
  return 'OK'
}
export const ORDEM_GRAV: Record<string, number> = { CRITICA: 5, ALTA: 4, MEDIA: 3, BAIXA: 2, INFO: 1 }

export function slaDoCaso(base: Date, cfg: { slaHoras: number; slaCriticoHoras: number }, critico: boolean) {
  return new Date(base.getTime() + (critico ? cfg.slaCriticoHoras : cfg.slaHoras) * 3_600_000)
}

// ------------------------------------------------------------------ equivalência de disciplinas
const STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'A', 'O', 'AS', 'OS', 'PARA', 'COM', 'NA', 'NO', 'AO', 'POR', 'UM', 'UMA', 'BASICA', 'GERAL', 'INTRODUCAO'])
function radical(t: string) { return t.length > 5 ? t.slice(0, 5) : t }
const ROMANOS: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
export function tokens(s: unknown): string[] {
  const out: string[] = []
  for (const t of semAcento(String(s ?? '')).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/)) {
    if (!t) continue
    if (t in ROMANOS) out.push('N' + ROMANOS[t])        // numerais romanos distinguem "Cálculo I" de "Cálculo II"
    else if (/^\d{1,2}$/.test(t)) out.push('N' + Number(t))
    else if (t.length > 2 && !STOP.has(t)) out.push(radical(t))
  }
  return out
}
/** Similaridade de Jaccard por radicais (0..1). */
export function similaridadeTexto(a: unknown, b: unknown): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  // Jaccard, com piso por contenção ("Histologia" dentro de "Histologia e Embriologia") levemente penalizado.
  return Math.max(inter / (A.size + B.size - inter), 0.8 * (inter / Math.min(A.size, B.size)))
}

export interface DiscDestino { id: string; nome: string; cargaHoraria: number; ementa?: string | null; periodo?: number | null; preRequisitos?: string[]; equivalentesNomes?: string[] }
export interface HistoricoAluno { disciplineId: string; situacao: string }
export interface CfgEquiv { percentualAproveitamento: number; similaridadeMinima: number; validadeAproveitamentoAnos: number; notaMinima?: number; anoAtual?: number }
export interface AvisoEquiv { tipo: string; gravidade: Gravidade; texto: string }
export interface SugestaoEquiv {
  origem: DisciplinaOrigem; destino?: DiscDestino; similaridade: number; razaoCarga: number
  sugestao: 'EQUIVALENCIA' | 'DISPENSA_PARCIAL' | 'NAO_EQUIVALENTE'; avisos: AvisoEquiv[]
}

export function sugerirEquivalencias(origens: DisciplinaOrigem[], destinos: DiscDestino[], cfg: CfgEquiv, historico: HistoricoAluno[] = []): SugestaoEquiv[] {
  const notaMin = cfg.notaMinima ?? 6
  const ano = cfg.anoAtual ?? new Date().getFullYear()
  // 1) melhor destino por origem
  const cand = origens.map((o) => {
    let best: { d: DiscDestino; score: number } | null = null
    for (const d of destinos) {
      const sn = Math.max(similaridadeTexto(o.nome, d.nome), ...(d.equivalentesNomes ?? []).map((n) => similaridadeTexto(o.nome, n) * 0.95), 0)
      const temEmenta = Boolean(o.ementa && d.ementa)
      const se = temEmenta ? similaridadeTexto(o.ementa, d.ementa) : 0
      const score = temEmenta ? 0.45 * sn + 0.55 * Math.max(se, sn * 0.5) : sn * 0.9
      if (!best || score > best.score) best = { d, score }
    }
    return { o, best }
  })
  // 2) cada destino é usado uma vez (maior score vence)
  const usados = new Map<string, number>()
  const ordem = cand.map((c, i) => ({ i, s: c.best?.score ?? 0 })).sort((a, b) => b.s - a.s)
  const dono = new Map<number, boolean>()
  for (const { i } of ordem) {
    const c = cand[i]
    if (!c.best || c.best.score * 100 < cfg.similaridadeMinima) { dono.set(i, false); continue }
    if (usados.has(c.best.d.id)) { dono.set(i, false); continue }
    usados.set(c.best.d.id, i); dono.set(i, true)
  }
  const aprovadasAluno = new Set(historico.filter((h) => /APROVAD|DISPENSAD|APROVEIT/.test(h.situacao.toUpperCase())).map((h) => h.disciplineId))
  const aproveitadasNesteDossie = new Set<string>()
  const res: SugestaoEquiv[] = cand.map((c, i) => {
    const o = c.o
    const avisos: AvisoEquiv[] = []
    const sim = Math.round((c.best?.score ?? 0) * 1000) / 10
    const d = c.best && dono.get(i) ? c.best.d : undefined
    if (c.best && !d && c.best.score * 100 >= cfg.similaridadeMinima) avisos.push({ tipo: 'DESTINO_DUPLICADO', gravidade: 'MEDIA', texto: `Outra disciplina de origem já foi associada a "${c.best.d.nome}"; esta ficou sem destino.` })
    const ch = Number(o.cargaHoraria) || 0
    const razao = d && d.cargaHoraria > 0 ? Math.round((ch / d.cargaHoraria) * 1000) / 10 : 0
    let sug: SugestaoEquiv['sugestao'] = 'NAO_EQUIVALENTE'
    if (d) {
      if (razao >= cfg.percentualAproveitamento) sug = 'EQUIVALENCIA'
      else if (razao >= Math.max(40, cfg.percentualAproveitamento - 30)) sug = 'DISPENSA_PARCIAL'
      if (razao < cfg.percentualAproveitamento) avisos.push({ tipo: 'CARGA_INSUFICIENTE', gravidade: razao < 50 ? 'ALTA' : 'MEDIA', texto: `Carga horária de origem (${ch} h) cobre ${razao}% da disciplina "${d.nome}" (${d.cargaHoraria} h); o mínimo configurado é ${cfg.percentualAproveitamento}%. ${sug === 'DISPENSA_PARCIAL' ? 'Possível dispensa parcial com complementação de carga.' : ''}`.trim() })
      if (!o.ementa) avisos.push({ tipo: 'SEM_EMENTA', gravidade: 'BAIXA', texto: 'A disciplina de origem não informa ementa; a similaridade foi calculada só pelo nome. Solicite o plano de ensino.' })
      if (sim < 70 && sug !== 'NAO_EQUIVALENTE') avisos.push({ tipo: 'SIMILARIDADE_MODERADA', gravidade: 'BAIXA', texto: `Similaridade de ${sim}%: revisão do coordenador recomendada.` })
    } else if (!avisos.length) avisos.push({ tipo: 'SEM_CORRESPONDENTE', gravidade: 'INFO', texto: 'Nenhuma disciplina da matriz atingiu a similaridade mínima.' })
    // conflitos com histórico/situação
    const sit = String(o.situacao ?? '').toUpperCase()
    if (/REPROVAD/.test(sit)) { avisos.push({ tipo: 'REPROVACAO', gravidade: 'ALTA', texto: `A disciplina "${o.nome}" consta como REPROVADA na instituição de origem: não pode ser aproveitada.` }); sug = 'NAO_EQUIVALENTE' }
    else if (o.nota != null && o.nota < notaMin) { avisos.push({ tipo: 'NOTA_ABAIXO_MINIMO', gravidade: 'ALTA', texto: `Nota ${o.nota} abaixo da mínima para aproveitamento (${notaMin}).` }); if (sug === 'EQUIVALENCIA') sug = 'DISPENSA_PARCIAL' }
    if (o.ano && ano - o.ano > cfg.validadeAproveitamentoAnos) { avisos.push({ tipo: 'PRAZO_VALIDADE', gravidade: 'ALTA', texto: `Disciplina concluída em ${o.ano}, há ${ano - o.ano} anos (limite de ${cfg.validadeAproveitamentoAnos}): exige parecer do colegiado.` }); }
    if (d) {
      if (aprovadasAluno.has(d.id)) avisos.push({ tipo: 'JA_CURSADA', gravidade: 'MEDIA', texto: `O aluno já tem "${d.nome}" aprovada/aproveitada no histórico local; evitar aproveitamento em duplicidade.` })
      const h = historico.find((x) => x.disciplineId === d.id)
      if (h && /CURSO|ANDAMENTO/.test(h.situacao.toUpperCase())) avisos.push({ tipo: 'EM_CURSO', gravidade: 'ALTA', texto: `O aluno está cursando "${d.nome}" neste semestre: decidir entre cursar ou aproveitar.` })
      if (h && /REPROVAD/.test(h.situacao.toUpperCase())) avisos.push({ tipo: 'REPROVADO_NO_DESTINO', gravidade: 'MEDIA', texto: `O aluno foi reprovado em "${d.nome}" no histórico local; o aproveitamento pode ser contestado.` })
      if (sug !== 'NAO_EQUIVALENTE') aproveitadasNesteDossie.add(d.id)
    }
    return { origem: o, destino: d, similaridade: sim, razaoCarga: razao, sugestao: sug, avisos }
  })
  // 3) pré-requisitos (considera o histórico e o que está sendo aproveitado neste dossiê)
  for (const r of res) {
    if (!r.destino || r.sugestao === 'NAO_EQUIVALENTE') continue
    const faltam = (r.destino.preRequisitos ?? []).filter((p) => !aprovadasAluno.has(p) && !aproveitadasNesteDossie.has(p))
    if (faltam.length) {
      const nomes = faltam.map((p) => destinos.find((d) => d.id === p)?.nome ?? 'pré-requisito').join(', ')
      r.avisos.push({ tipo: 'PRE_REQUISITO', gravidade: 'ALTA', texto: `"${r.destino.nome}" exige pré-requisito(s) ainda não cumpridos/aproveitados: ${nomes}.` })
    }
  }
  return res
}
