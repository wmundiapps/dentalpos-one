import { validarChaveNFe, validarDocumento } from '../tesouraria/fiscal'
import { extrairTextoPdf } from './pdfSimples'
import { lerLinhaDigitavel, soDigitos } from './linha'

// Extração de dados de boleto a partir de TEXTO (corpo do e-mail, .txt, PDF com texto embutido) e de XML de NF-e.
// Heurística por rótulos e padrões; nunca inventa: campo não encontrado fica indefinido.

export interface DadosExtraidos {
  linhaDigitavel?: string        // somente dígitos (47/48) ou 44 de barras
  valor?: number
  vencimento?: string            // AAAA-MM-DD
  beneficiarioNome?: string
  beneficiarioDocumento?: string // somente dígitos
  numeroDocumento?: string
  nfChave?: string
  nfNumero?: string
  nfValor?: number
  nfEmitenteDocumento?: string
  nfEmitenteNome?: string
  duplicatas?: Array<{ numero?: string; vencimento?: string; valor?: number }>
  fonte: string[]                // de onde vieram os dados (texto, xml, pdf)
}

const dinheiro = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function dataBr(s: string): string | undefined {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  if (m) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12))
    if (d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1) return d.toISOString().slice(0, 10)
  }
  const i = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return i ? i[0] : undefined
}

/** Candidatos a linha digitável: sequências de dígitos (com pontos/espaços/hífens) que somam 44, 47 ou 48 dígitos. */
export function acharLinhas(texto: string): string[] {
  const achados: string[] = []
  const re = /\d[\d.\s\-]{41,70}\d/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const bruto = m[0]
    const d = soDigitos(bruto)
    if ([47, 48, 44].includes(d.length) && !achados.includes(d)) { achados.push(d); continue }
    // blocos grudados a outros números (ex.: valor logo após): tenta janelas de 47/48
    for (const n of [47, 48]) {
      for (let i = 0; i + n <= d.length; i++) {
        const j = d.slice(i, i + n)
        if (lerLinhaDigitavel(j).ok && !achados.includes(j)) achados.push(j)
      }
    }
  }
  // 44 dígitos que na verdade são chave de NF-e não são linha digitável
  return achados.filter((d) => !(d.length === 44 && validarChaveNFe(d) && !lerLinhaDigitavel(d).ok))
}

const rotulo = (texto: string, nomes: string[]): string | undefined => {
  const re = new RegExp(`(?:${nomes.join('|')})\\s*[:\\-]?\\s*([^\\n\\r]{1,160})`, 'i')
  const m = re.exec(texto)
  return m ? m[1].trim() : undefined
}

/** Extrai campos do texto de um boleto/e-mail do fornecedor. */
export function extrairDeTexto(texto: string, fonte = 'texto'): DadosExtraidos {
  const out: DadosExtraidos = { fonte: [fonte] }
  const linhas = acharLinhas(texto)
  const boa = linhas.find((l) => lerLinhaDigitavel(l).ok) ?? linhas[0]
  if (boa) out.linhaDigitavel = boa
  // valor
  const rv = rotulo(texto, ['valor\\s+do\\s+documento', 'valor\\s+cobrado', 'valor\\s+a\\s+pagar', 'valor\\s+total', 'valor'])
  const mv = rv ? /(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(rv) : null
  if (mv) out.valor = dinheiro(mv[1])
  else {
    const m2 = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(texto)
    if (m2) out.valor = dinheiro(m2[1])
  }
  // vencimento
  const rd = rotulo(texto, ['vencimento', 'data\\s+de\\s+vencimento', 'vence\\s+em'])
  const dv = rd ? dataBr(rd) : undefined
  if (dv) out.vencimento = dv
  // beneficiário e CNPJ
  const rb = rotulo(texto, ['benefici[aá]rio', 'cedente', 'raz[aã]o\\s+social', 'favorecido'])
  if (rb) {
    const doc = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/.exec(rb)
    out.beneficiarioNome = rb.replace(/(?:CNPJ|CPF)?[:\s]*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}.*$/i, '').replace(/[-–:|]+\s*$/, '').trim() || undefined
    if (doc) out.beneficiarioDocumento = soDigitos(doc[1])
  }
  if (!out.beneficiarioDocumento) {
    const dc = /(?:cnpj|cpf)[^\d\n]{0,25}(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i.exec(texto)
    if (dc) out.beneficiarioDocumento = soDigitos(dc[1])
  }
  // número do documento
  const rn = /n[úuº°o]*\.?\s*(?:do\s+)?documento\s*[:\-]?\s*([A-Za-z0-9./\-]{2,30})/i.exec(texto)
  if (rn) out.numeroDocumento = rn[1].replace(/[.,;]+$/, '')
  // chave da NF-e (44 dígitos válidos)
  const rk = /(?:chave\s+(?:de\s+acesso)?|nf-?e)\s*[:\-]?\s*((?:\d[\s.]*){44})/i.exec(texto)
  if (rk && validarChaveNFe(rk[1])) out.nfChave = soDigitos(rk[1])
  else {
    const cand = Array.from(texto.matchAll(/(?:\d[\s.]*){44}/g)).map((x) => soDigitos(x[0])).find((d) => d.length === 44 && validarChaveNFe(d))
    if (cand) out.nfChave = cand
  }
  const rnf = /(?:nota\s+fiscal|NF-?e?|NFS-?e?)\s*(?:n[úuº°o]*\.?)?\s*[:\-]?\s*(\d{1,9})\b/i.exec(texto)
  if (rnf) out.nfNumero = rnf[1]
  return out
}

const tag = (xml: string, nome: string, de = xml): string | undefined => {
  const m = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i').exec(de)
  return m ? m[1].trim() : undefined
}

/** Lê um XML de NF-e (ou NFS-e simples): chave, emitente, número, valor e duplicatas (cobrança). */
export function extrairDeXml(xml: string): DadosExtraidos | null {
  if (!/<(nfeProc|NFe|infNFe|CompNfse|Nfse|InfNfse|InfDeclaracaoPrestacaoServico)\b/i.test(xml)) return null
  const out: DadosExtraidos = { fonte: ['xml'] }
  const id = /<infNFe[^>]*\bId="NFe(\d{44})"/i.exec(xml)
  const chave = id?.[1] ?? tag(xml, 'chNFe')
  if (chave && soDigitos(chave).length === 44) out.nfChave = soDigitos(chave)
  const emit = tag(xml, 'emit')
  if (emit) {
    const doc = tag(emit, 'CNPJ') ?? tag(emit, 'CPF')
    if (doc) out.nfEmitenteDocumento = soDigitos(doc)
    out.nfEmitenteNome = tag(emit, 'xNome')
  } else {
    const prest = tag(xml, 'PrestadorServico') ?? tag(xml, 'Prestador')
    if (prest) { const doc = tag(prest, 'Cnpj') ?? tag(prest, 'CNPJ'); if (doc) out.nfEmitenteDocumento = soDigitos(doc); out.nfEmitenteNome = tag(prest, 'RazaoSocial') }
  }
  out.nfNumero = tag(xml, 'nNF') ?? tag(xml, 'Numero')
  const vnf = tag(xml, 'vNF') ?? tag(xml, 'ValorServicos')
  if (vnf && Number.isFinite(Number(vnf))) out.nfValor = Number(vnf)
  const dups = Array.from(xml.matchAll(/<dup>([\s\S]*?)<\/dup>/gi)).map((m) => ({ numero: tag(m[1], 'nDup'), vencimento: tag(m[1], 'dVenc'), valor: Number(tag(m[1], 'vDup')) }))
  if (dups.length) out.duplicatas = dups.map((d) => ({ ...d, valor: Number.isFinite(d.valor) ? d.valor : undefined }))
  out.beneficiarioDocumento = out.nfEmitenteDocumento
  out.beneficiarioNome = out.nfEmitenteNome
  return out
}

export interface AnexoEntrada { nome: string; mime?: string; conteudo: Buffer }
export interface AnexoLido {
  nome: string; mime: string; leitura: 'LIDO' | 'SEM_TEXTO' | 'NAO_SUPORTADO'; nota?: string
  dados?: DadosExtraidos
}

const EXT = (n: string) => (n.split('.').pop() || '').toLowerCase()

/** Lê um anexo (PDF com texto, XML ou texto puro). Imagens/escaneados: honestamente "sem leitura" (sem OCR). */
export function lerAnexo(a: AnexoEntrada): AnexoLido {
  const ext = EXT(a.nome)
  const mime = (a.mime || '').toLowerCase()
  const ehPdf = ext === 'pdf' || mime.includes('pdf') || a.conteudo.subarray(0, 4).toString('latin1') === '%PDF'
  const ehXml = ext === 'xml' || mime.includes('xml') || /^\s*<\?xml|^\s*<(nfeProc|NFe)/i.test(a.conteudo.subarray(0, 200).toString('utf8'))
  const ehTexto = ['txt', 'csv', 'eml', 'html', 'htm'].includes(ext) || mime.startsWith('text/')
  const base = { nome: a.nome, mime: mime || (ehPdf ? 'application/pdf' : ehXml ? 'application/xml' : 'text/plain') }
  if (ehPdf) {
    const r = extrairTextoPdf(a.conteudo)
    if (!r.ok) return { ...base, leitura: 'SEM_TEXTO', nota: r.motivo }
    return { ...base, leitura: 'LIDO', dados: { ...extrairDeTexto(r.texto, 'pdf'), fonte: ['pdf'] } }
  }
  if (ehXml) {
    const xml = a.conteudo.toString('utf8')
    const d = extrairDeXml(xml)
    if (!d) return { ...base, leitura: 'NAO_SUPORTADO', nota: 'XML não reconhecido como NF-e/NFS-e' }
    return { ...base, leitura: 'LIDO', dados: d }
  }
  if (ehTexto) {
    let t = a.conteudo.toString('utf8')
    if (ext === 'html' || ext === 'htm' || mime.includes('html')) t = t.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
    return { ...base, leitura: 'LIDO', dados: extrairDeTexto(t, 'texto') }
  }
  if (/^image\//.test(mime) || ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'bmp', 'webp'].includes(ext)) {
    return { ...base, leitura: 'SEM_TEXTO', nota: 'Imagem: este sistema não faz OCR (reconhecimento de texto em imagem). Lance os dados manualmente a partir do anexo' }
  }
  return { ...base, leitura: 'NAO_SUPORTADO', nota: 'Tipo de anexo não suportado para leitura automática (aceitos: PDF com texto, XML de NF-e e texto)' }
}

/** Junta os dados de vários anexos/corpo, preferindo o primeiro valor encontrado e completando lacunas. */
export function mesclar(lista: DadosExtraidos[]): DadosExtraidos {
  const out: DadosExtraidos = { fonte: [] }
  for (const d of lista) {
    for (const [k, v] of Object.entries(d)) {
      if (k === 'fonte') { out.fonte.push(...(v as string[])); continue }
      if (v !== undefined && v !== null && v !== '' && (out as any)[k] === undefined) (out as any)[k] = v
    }
  }
  out.fonte = Array.from(new Set(out.fonte))
  if (out.beneficiarioDocumento && !validarDocumento(out.beneficiarioDocumento)) {
    // mantém (o check-up sinaliza), mas só dígitos
    out.beneficiarioDocumento = soDigitos(out.beneficiarioDocumento)
  }
  return out
}
