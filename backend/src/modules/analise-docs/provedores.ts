// Provedores de verificação de instituição de origem e extrator de documentos.
//
// HONESTIDADE: neste ambiente NÃO há credencial nem acesso garantido à rede do MEC (cadastro e-MEC) nem às secretarias estaduais
// de educação. O provedor ativo é o SIMULADO: consulta uma base local de DEMONSTRAÇÃO (cadastro FICTÍCIO em AdcInstituicao).
// Todo resultado devolve `simulada: true` e a interface mostra isso. O ponto de integração real é `ProvedorGatewayReal`
// (variáveis EMEC_API_URL / EMEC_API_TOKEN): um adaptador HTTP para um gateway que devolva o contrato descrito em README.md.
// Ele NÃO foi testado contra o serviço oficial.
import { createHash } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import { normNome, semAcento, similaridadeTexto, soDigitos } from './logic'

export interface CursoInst { nome: string; grau?: string; reconhecido: boolean; portaria?: string }
export interface InstituicaoInfo { tipo: 'IES' | 'ESCOLA'; codigo: string; nome: string; sigla?: string | null; uf: string; municipio?: string | null; situacao: string; secretariaEstadual?: string | null; cursos?: CursoInst[] }
export interface ConsultaResultado {
  provedor: 'SIMULADO' | 'EMEC'
  simulada: boolean
  encontrada: boolean
  situacao?: string
  instituicao?: InstituicaoInfo
  nomeConfere?: boolean
  cursoReconhecido?: boolean | null
  observacao?: string
}
export interface ProvedorInstituicoes {
  readonly id: 'SIMULADO' | 'EMEC'
  readonly simulado: boolean
  consultarIes(q: { codigo?: string; nome?: string; curso?: string }): Promise<ConsultaResultado>
  consultarEscola(q: { codigo?: string; nome?: string; uf?: string }): Promise<ConsultaResultado>
}

export class ProvedorIndisponivelError extends Error {
  status = 503
  constructor(msg = 'Provedor de consulta ao MEC/secretarias estaduais não configurado.') { super(msg) }
}

function cursoReconhecido(cursos: CursoInst[] | undefined, curso?: string): boolean | null {
  if (!curso) return null
  if (!cursos?.length) return null
  const alvo = cursos.find((c) => similaridadeTexto(c.nome, curso) >= 0.5 || normNome(c.nome) === normNome(curso))
  return alvo ? alvo.reconhecido : false
}

// ------------------------------------------------------------------ SIMULADO (base local de demonstração)
export class ProvedorSimulado implements ProvedorInstituicoes {
  readonly id = 'SIMULADO' as const
  readonly simulado = true
  constructor(private tenantId: string) {}

  private async achar(tipo: 'IES' | 'ESCOLA', q: { codigo?: string; nome?: string }) {
    const codigo = soDigitos(q.codigo)
    if (codigo) {
      const porCodigo = await prisma.adcInstituicao.findFirst({ where: { tenantId: this.tenantId, tipo, codigo, ativo: true } })
      if (porCodigo) return { row: porCodigo, via: 'codigo' as const }
    }
    if (q.nome) {
      const todas = await prisma.adcInstituicao.findMany({ where: { tenantId: this.tenantId, tipo, ativo: true }, take: 2000 })
      const alvo = normNome(q.nome)
      let best: { row: (typeof todas)[number]; s: number } | null = null
      for (const r of todas) {
        const cand = [r.nome, r.sigla].filter(Boolean) as string[]
        const s = Math.max(...cand.map((n) => (normNome(n) === alvo ? 1 : similaridadeTexto(n, q.nome))))
        if (!best || s > best.s) best = { row: r, s }
      }
      if (best && best.s >= 0.6) return { row: best.row, via: 'nome' as const }
    }
    return null
  }

  private paraResultado(tipo: 'IES' | 'ESCOLA', achado: Awaited<ReturnType<ProvedorSimulado['achar']>>, q: { codigo?: string; nome?: string; curso?: string; uf?: string }): ConsultaResultado {
    if (!achado) return { provedor: 'SIMULADO', simulada: true, encontrada: false, observacao: `Nenhuma ${tipo === 'IES' ? 'IES' : 'escola'} com esse código/nome na base local de demonstração.` }
    const r = achado.row
    const cursos = (r.cursos as unknown as CursoInst[] | null) ?? undefined
    const nomeConfere = q.nome ? similaridadeTexto(r.nome, q.nome) >= 0.6 || normNome(r.nome) === normNome(q.nome) || (r.sigla ? normNome(r.sigla) === normNome(q.nome) : false) : undefined
    return {
      provedor: 'SIMULADO', simulada: true, encontrada: true, situacao: r.situacao, nomeConfere,
      cursoReconhecido: tipo === 'IES' ? cursoReconhecido(cursos, q.curso) : null,
      instituicao: { tipo, codigo: r.codigo, nome: r.nome, sigla: r.sigla, uf: r.uf, municipio: r.municipio, situacao: r.situacao, secretariaEstadual: r.secretariaEstadual, cursos },
    }
  }

  async consultarIes(q: { codigo?: string; nome?: string; curso?: string }) { return this.paraResultado('IES', await this.achar('IES', q), q) }
  async consultarEscola(q: { codigo?: string; nome?: string; uf?: string }) { return this.paraResultado('ESCOLA', await this.achar('ESCOLA', q), q) }
}

// ------------------------------------------------------------------ REAL (ponto de integração; exige credencial e rede)
/** Adaptador HTTP para um gateway que consulte o cadastro e-MEC / secretarias estaduais. NÃO testado contra serviços oficiais. */
export class ProvedorGatewayReal implements ProvedorInstituicoes {
  readonly id = 'EMEC' as const
  readonly simulado = false
  private base = String(process.env.EMEC_API_URL || '').replace(/\/$/, '')
  private token = String(process.env.EMEC_API_TOKEN || '')
  static configurado() { return Boolean(process.env.EMEC_API_URL && process.env.EMEC_API_TOKEN) }
  private async get(path: string, params: Record<string, string | undefined>): Promise<any> {
    if (!this.base || !this.token) throw new ProvedorIndisponivelError()
    const u = new URL(this.base + path)
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v)
    const r = await fetch(u, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (r.status === 404) return null
    if (!r.ok) throw new ProvedorIndisponivelError(`Consulta externa falhou (HTTP ${r.status}).`)
    return r.json()
  }
  private map(tipo: 'IES' | 'ESCOLA', j: any, q: { nome?: string; curso?: string }): ConsultaResultado {
    if (!j) return { provedor: 'EMEC', simulada: false, encontrada: false, observacao: 'Não localizada pelo serviço consultado.' }
    const cursos: CursoInst[] | undefined = Array.isArray(j.cursos) ? j.cursos.map((c: any) => ({ nome: String(c.nome), grau: c.grau, reconhecido: Boolean(c.reconhecido), portaria: c.portaria })) : undefined
    return {
      provedor: 'EMEC', simulada: false, encontrada: true, situacao: String(j.situacao || 'REGULAR').toUpperCase(),
      nomeConfere: q.nome ? similaridadeTexto(j.nome, q.nome) >= 0.6 : undefined, cursoReconhecido: tipo === 'IES' ? cursoReconhecido(cursos, q.curso) : null,
      instituicao: { tipo, codigo: String(j.codigo), nome: String(j.nome), sigla: j.sigla, uf: String(j.uf || ''), municipio: j.municipio, situacao: String(j.situacao || 'REGULAR').toUpperCase(), secretariaEstadual: j.secretariaEstadual, cursos },
    }
  }
  async consultarIes(q: { codigo?: string; nome?: string; curso?: string }) { return this.map('IES', await this.get('/ies', { codigo: q.codigo, nome: q.nome }), q) }
  async consultarEscola(q: { codigo?: string; nome?: string; uf?: string }) { return this.map('ESCOLA', await this.get('/escolas', { codigo: q.codigo, nome: q.nome, uf: q.uf }), q) }
}

/** Escolhe o provedor. `EMEC` só é usado se configurado; caso contrário cai no SIMULADO e informa o motivo. */
export function obterProvedor(tenantId: string, preferido: string): { provedor: ProvedorInstituicoes; aviso?: string } {
  if (preferido === 'EMEC') {
    if (ProvedorGatewayReal.configurado()) return { provedor: new ProvedorGatewayReal() }
    return { provedor: new ProvedorSimulado(tenantId), aviso: 'Provedor real (e-MEC/secretarias estaduais) não está configurado neste ambiente: usando a base local de DEMONSTRAÇÃO.' }
  }
  return { provedor: new ProvedorSimulado(tenantId) }
}

// ------------------------------------------------------------------ BASE DE DEMONSTRAÇÃO (cadastro FICTÍCIO)
export const BASE_DEMO: Array<Omit<InstituicaoInfo, 'cursos'> & { cursos?: CursoInst[] }> = [
  { tipo: 'IES', codigo: '1001', nome: 'Universidade Federal do Vale Azul', sigla: 'UFVA', uf: 'SP', municipio: 'Campinas', situacao: 'REGULAR', cursos: [
    { nome: 'Odontologia', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 101/2019' }, { nome: 'Enfermagem', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 102/2019' }, { nome: 'Farmácia', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 103/2020' }, { nome: 'Administração', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 104/2018' }] },
  { tipo: 'IES', codigo: '1002', nome: 'Centro Universitário Horizonte', sigla: 'UNIHORIZONTE', uf: 'MG', municipio: 'Belo Horizonte', situacao: 'REGULAR', cursos: [
    { nome: 'Odontologia', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 210/2021' }, { nome: 'Direito', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 211/2020' }, { nome: 'Medicina Veterinária', grau: 'Bacharelado', reconhecido: false, portaria: 'Autorização MEC 212/2023 (aguarda reconhecimento)' }] },
  { tipo: 'IES', codigo: '1003', nome: 'Faculdade Santa Aurora', sigla: 'FSA', uf: 'RJ', municipio: 'Niterói', situacao: 'DESCREDENCIADA', cursos: [{ nome: 'Odontologia', grau: 'Bacharelado', reconhecido: false, portaria: 'Descredenciada — Portaria MEC 330/2022' }, { nome: 'Administração', grau: 'Bacharelado', reconhecido: false }] },
  { tipo: 'IES', codigo: '1004', nome: 'Instituto Superior Pinheiral', sigla: 'ISP', uf: 'PR', municipio: 'Curitiba', situacao: 'EM_EXTINCAO', cursos: [{ nome: 'Pedagogia', grau: 'Licenciatura', reconhecido: true, portaria: 'Portaria MEC 150/2015' }, { nome: 'Odontologia', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 151/2015' }] },
  { tipo: 'IES', codigo: '1005', nome: 'Universidade Estadual do Sertão', sigla: 'UESERTAO', uf: 'BA', municipio: 'Feira de Santana', situacao: 'REGULAR', cursos: [
    { nome: 'Odontologia', grau: 'Bacharelado', reconhecido: true, portaria: 'Decreto Estadual 400/2012' }, { nome: 'Biomedicina', grau: 'Bacharelado', reconhecido: true, portaria: 'Decreto Estadual 401/2013' }] },
  { tipo: 'IES', codigo: '1006', nome: 'Faculdade Lumiar de Ciências', sigla: 'FLC', uf: 'SP', municipio: 'Santos', situacao: 'SUSPENSA', cursos: [{ nome: 'Fisioterapia', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 90/2017' }] },
  { tipo: 'IES', codigo: '1007', nome: 'Universidade do Planalto Central', sigla: 'UPC', uf: 'DF', municipio: 'Brasília', situacao: 'REGULAR', cursos: [{ nome: 'Odontologia', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 77/2018' }, { nome: 'Ciências Contábeis', grau: 'Bacharelado', reconhecido: true, portaria: 'Portaria MEC 78/2018' }] },
  { tipo: 'ESCOLA', codigo: '35000123', nome: 'Colégio Estadual Aurora Boreal', uf: 'SP', municipio: 'São Paulo', situacao: 'REGULAR', secretariaEstadual: 'Secretaria da Educação do Estado de São Paulo (demonstração)' },
  { tipo: 'ESCOLA', codigo: '31000456', nome: 'Escola Estadual Dom Quixote de Minas', uf: 'MG', municipio: 'Belo Horizonte', situacao: 'REGULAR', secretariaEstadual: 'Secretaria de Estado de Educação de Minas Gerais (demonstração)' },
  { tipo: 'ESCOLA', codigo: '35000777', nome: 'CEEJA Nova Jornada (Educação de Jovens e Adultos)', uf: 'SP', municipio: 'Campinas', situacao: 'REGULAR', secretariaEstadual: 'Secretaria da Educação do Estado de São Paulo (demonstração)' },
  { tipo: 'ESCOLA', codigo: '35000999', nome: 'Colégio Atlântico Supletivo Ltda', uf: 'SP', municipio: 'Guarulhos', situacao: 'DESCREDENCIADA', secretariaEstadual: 'Secretaria da Educação do Estado de São Paulo (demonstração)' },
  { tipo: 'ESCOLA', codigo: '29000321', nome: 'Colégio Estadual Serra Dourada', uf: 'BA', municipio: 'Salvador', situacao: 'REGULAR', secretariaEstadual: 'Secretaria da Educação do Estado da Bahia (demonstração)' },
]

export async function garantirBaseDemo(tenantId: string): Promise<number> {
  const existentes = await prisma.adcInstituicao.count({ where: { tenantId } })
  if (existentes > 0) return 0
  const r = await prisma.adcInstituicao.createMany({
    data: BASE_DEMO.map((b) => ({ tenantId, tipo: b.tipo, codigo: b.codigo, nome: b.nome, sigla: b.sigla ?? null, uf: b.uf, municipio: b.municipio ?? null, situacao: b.situacao, secretariaEstadual: b.secretariaEstadual ?? null, cursos: (b.cursos ?? undefined) as any, fonte: 'DEMONSTRACAO' })),
    skipDuplicates: true,
  })
  return r.count
}

// ------------------------------------------------------------------ EXTRATOR de arquivo (texto/PDF) — sem OCR
export interface ArquivoEntrada { nome?: string; mime?: string; dataUrl?: string; base64?: string }
export interface ArquivoLido { hash?: string; tamanho?: number; mime?: string; texto?: string; metadados: Record<string, unknown>; modo: 'TEXTO' | 'PDF_TEXTO' | 'SEM_TEXTO'; assinaturaPdf?: boolean }

export function decodificar(a: ArquivoEntrada): { buf: Buffer; mime?: string } | null {
  let b64 = a.base64
  let mime = a.mime
  if (a.dataUrl) {
    const m = a.dataUrl.match(/^\s*data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!m) return null
    mime = mime || m[1]
    if (m[2]) b64 = m[3]
    else return { buf: Buffer.from(decodeURIComponent(m[3]), 'utf8'), mime }
  }
  if (!b64) return null
  try { return { buf: Buffer.from(b64, 'base64'), mime } } catch { return null }
}

function dataPdf(s?: string) {
  const m = s?.match(/D:(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

/** Lê o arquivo: hash, texto (text/* e PDF com texto não comprimido) e metadados de PDF. NÃO faz OCR de imagens. */
export function lerArquivo(a: ArquivoEntrada | undefined): ArquivoLido | null {
  if (!a) return null
  const d = decodificar(a)
  if (!d) return null
  const hash = createHash('sha256').update(d.buf).digest('hex')
  const mime = (d.mime || a.mime || '').toLowerCase()
  const base: Pick<ArquivoLido, 'hash' | 'tamanho' | 'mime'> = { hash, tamanho: d.buf.length, mime }
  if (mime.startsWith('text/') || /\.(txt|csv|md)$/i.test(a.nome || '')) return { ...base, texto: d.buf.toString('utf8'), metadados: {}, modo: 'TEXTO' }
  if (mime === 'application/pdf' || d.buf.subarray(0, 5).toString() === '%PDF-') {
    const raw = d.buf.toString('latin1')
    const pega = (k: string) => raw.match(new RegExp(`/${k}\\s*\\(([^)]*)\\)`))?.[1]
    const texto = [...raw.matchAll(/\(((?:\\.|[^\\)]){2,})\)\s*Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join('\n')
    const meta: Record<string, unknown> = { producer: pega('Producer'), creator: pega('Creator'), criadoEm: dataPdf(pega('CreationDate')), modificadoEm: dataPdf(pega('ModDate')) }
    const assin = /\/ByteRange|\/Type\s*\/Sig\b|\/SubFilter\s*\/adbe\.pkcs7/.test(raw)
    if (assin) meta.assinaturaPresente = true
    return { ...base, texto: texto || undefined, metadados: meta, modo: texto ? 'PDF_TEXTO' : 'SEM_TEXTO', assinaturaPdf: assin }
  }
  return { ...base, metadados: {}, modo: 'SEM_TEXTO' }
}

export { semAcento }
