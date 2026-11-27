import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { AcademicRole } from '../academico/middleware'
import {
  ACOES_LIVENESS, FacialError, assinarDesafio, avaliarLiveness, cifrarTemplate, decifrarTemplate, identificar, novoNonce,
  sortearAcao, validarEmbedding, EvidenciaLiveness, MAX_AMOSTRAS, verificar,
} from './facial'
import { MIN, parsePessoaKey, pessoaKey } from './logic'

export const MOD = 'presenca'
export const FINALIDADE_CONSENTIMENTO = 'BIOMETRIA_FACIAL'
export const httpErr = (status: number, message: string, codigo?: string) => Object.assign(new Error(message), { status, ...(codigo ? { codigo } : {}) })

// Papéis
export const OPERADORES: AcademicRole[] = ['TEACHER', 'COORDINATOR', 'SECRETARY', 'STAFF', 'LIBRARIAN', 'FACILITIES', 'SUPPORT']
export const GESTAO: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'FACILITIES']
export const LEITURA_GESTAO: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'FACILITIES', 'LIBRARIAN', 'STAFF', 'TEACHER', 'SUPPORT']
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const ehSuper = (role?: string) => SUPER.includes(String(role || '').toUpperCase())

// ---------- configuração ----------
export async function getConfig(tenantId: string) {
  return prisma.preConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

// ---------- log (sem vetor, sem imagem) ----------
export async function registrarLog(p: {
  tenantId: string; acao: string; resultado?: string; pessoaKey?: string | null; dispositivoId?: string | null; finalidade?: string
  distancia?: number | null; userId?: string | null; detalhe?: unknown
}) {
  try {
    await prisma.preLogBiometrico.create({
      data: { tenantId: p.tenantId, acao: p.acao, resultado: p.resultado, pessoaKey: p.pessoaKey ?? undefined, dispositivoId: p.dispositivoId ?? undefined, finalidade: p.finalidade, distancia: p.distancia ?? undefined, userId: p.userId ?? undefined, detalhe: p.detalhe as any },
    })
  } catch (e: any) { console.error('[presenca-log]', String(e?.message || e).slice(0, 160)) }
}

// ---------- alertas ----------
export async function alertar(p: { tenantId: string; tipo: string; severidade?: string; mensagem: string; spaceId?: string | null; pessoaKey?: string | null; dispositivoId?: string | null; dedupeKey?: string; dedupeMin?: number }) {
  if (p.dedupeKey) {
    const ja = await prisma.preAlerta.findFirst({ where: { tenantId: p.tenantId, dedupeKey: p.dedupeKey, status: { in: ['ABERTO', 'RECONHECIDO'] }, createdAt: { gte: new Date(Date.now() - (p.dedupeMin ?? 30) * MIN) } } })
    if (ja) return ja
  }
  return prisma.preAlerta.create({ data: { tenantId: p.tenantId, tipo: p.tipo, severidade: p.severidade ?? 'ATENCAO', mensagem: p.mensagem, spaceId: p.spaceId ?? undefined, pessoaKey: p.pessoaKey ?? undefined, dispositivoId: p.dispositivoId ?? undefined, dedupeKey: p.dedupeKey } })
}

// ---------- pessoas ----------
export interface PessoaInfo { pessoaKey: string; tipo: 'ALUNO' | 'USUARIO'; id: string; nome: string; ra?: string | null; role?: string | null; studentId?: string; userId?: string; ativo: boolean }

export async function infoPessoas(tenantId: string, keys: string[]): Promise<Map<string, PessoaInfo>> {
  const out = new Map<string, PessoaInfo>()
  const alunos: string[] = [], users: string[] = []
  for (const k of new Set(keys)) { const p = parsePessoaKey(k); if (p) (p.tipo === 'ALUNO' ? alunos : users).push(p.id) }
  if (alunos.length) {
    for (const s of await prisma.student.findMany({ where: { tenantId, id: { in: alunos } }, select: { id: true, nomeCompleto: true, ra: true, status: true } }))
      out.set(pessoaKey('ALUNO', s.id), { pessoaKey: pessoaKey('ALUNO', s.id), tipo: 'ALUNO', id: s.id, studentId: s.id, nome: s.nomeCompleto, ra: s.ra, role: 'STUDENT', ativo: s.status === 'ATIVO' })
  }
  if (users.length) {
    for (const u of await prisma.user.findMany({ where: { tenantId, id: { in: users } }, select: { id: true, firstName: true, lastName: true, role: true, isActive: true } }))
      out.set(pessoaKey('USUARIO', u.id), { pessoaKey: pessoaKey('USUARIO', u.id), tipo: 'USUARIO', id: u.id, userId: u.id, nome: `${u.firstName} ${u.lastName}`.trim(), role: String(u.role).toUpperCase(), ativo: u.isActive })
  }
  return out
}

export async function exigirPessoa(tenantId: string, key: string): Promise<PessoaInfo> {
  const p = (await infoPessoas(tenantId, [key])).get(key)
  if (!p) throw httpErr(404, 'Pessoa não encontrada nesta instituição.')
  return p
}

/** Chave da pessoa logada (aluno -> ALUNO:studentId; demais -> USUARIO:userId). */
export function pessoaDoUsuario(u: { id: string; role?: string; studentId?: string }): string {
  return u.role === 'STUDENT' && u.studentId ? pessoaKey('ALUNO', u.studentId) : pessoaKey('USUARIO', u.id)
}

// ---------- consentimento ----------
export async function consentimentoAtivo(tenantId: string, pessoa: PessoaInfo) {
  const ids = [pessoa.id, pessoa.studentId, pessoa.userId].filter(Boolean) as string[]
  return prisma.lgpConsentimento.findFirst({ where: { tenantId, finalidade: FINALIDADE_CONSENTIMENTO, status: 'ATIVO', titularId: { in: ids } }, orderBy: { concedidoEm: 'desc' } })
}

// ---------- desafio de liveness ----------
export async function emitirDesafio(tenantId: string) {
  const nonce = novoNonce()
  const acao = sortearAcao()
  const expiraEm = new Date(Date.now() + 60_000)
  await prisma.preDesafio.create({ data: { tenantId, nonce, acao, expiraEm } })
  return { nonce, acao, expiraEm, assinatura: assinarDesafio(nonce, acao, expiraEm.getTime()), instrucao: acao === 'PISCAR' ? 'Olhe para a câmera e pisque.' : 'Vire levemente a cabeça para um lado e volte.' }
}

/** Consome (uso único) o desafio e avalia a evidência. Lança FacialError se inválido. */
export async function validarLiveness(tenantId: string, ev: Partial<EvidenciaLiveness> | undefined, obrigatorio: boolean): Promise<void> {
  if (!obrigatorio && !ev) return
  const nonce = String(ev?.nonce ?? '')
  if (!nonce) throw new FacialError(422, 'Verificação de vivacidade obrigatória: solicite um desafio.', 'LIVENESS')
  const d = await prisma.preDesafio.findUnique({ where: { nonce } })
  if (!d || d.tenantId !== tenantId) throw new FacialError(422, 'Desafio de vivacidade inválido.', 'LIVENESS')
  const claim = await prisma.preDesafio.updateMany({ where: { id: d.id, usadoEm: null, expiraEm: { gt: new Date() } }, data: { usadoEm: new Date() } })
  if (claim.count === 0) throw new FacialError(422, 'Desafio de vivacidade expirado ou já utilizado.', 'LIVENESS')
  if (!(ACOES_LIVENESS as readonly string[]).includes(d.acao)) throw new FacialError(422, 'Desafio inválido.', 'LIVENESS')
  const motivo = avaliarLiveness(d.acao, ev)
  if (motivo) throw new FacialError(422, motivo, 'LIVENESS')
}

// ---------- limite de tentativas ----------
const FALHAS = ['NAO_RECONHECIDO', 'LIVENESS_FALHOU', 'AMBIGUO']

/** Bloqueia a origem (dispositivo ou operador) após N falhas consecutivas dentro da janela. */
export async function checarBloqueio(tenantId: string, origem: string, cfg: { maxTentativas: number; janelaTentativasMin: number; bloqueioMin: number }): Promise<Date | null> {
  const disp = origem.startsWith('op:') ? null : await prisma.preDispositivo.findFirst({ where: { id: origem, tenantId }, select: { bloqueadoAte: true } })
  if (disp?.bloqueadoAte && disp.bloqueadoAte > new Date()) return disp.bloqueadoAte
  const ultimoOk = await prisma.preLogBiometrico.findFirst({ where: { tenantId, dispositivoId: origem, acao: 'COMPARACAO', resultado: 'OK' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  const falhas = await prisma.preLogBiometrico.findMany({
    where: { tenantId, dispositivoId: origem, acao: 'COMPARACAO', resultado: { in: FALHAS }, createdAt: { gte: new Date(Math.max(Date.now() - cfg.bloqueioMin * MIN, ultimoOk?.createdAt.getTime() ?? 0)) } },
    orderBy: { createdAt: 'desc' }, take: cfg.maxTentativas, select: { createdAt: true },
  })
  if (falhas.length >= cfg.maxTentativas && falhas[0].createdAt.getTime() - falhas[falhas.length - 1].createdAt.getTime() <= cfg.janelaTentativasMin * MIN) {
    return new Date(falhas[0].createdAt.getTime() + cfg.bloqueioMin * MIN)
  }
  return null
}

async function registrarFalha(tenantId: string, origem: string, finalidade: string, resultado: string, distancia: number | undefined, userId: string | undefined, cfg: Awaited<ReturnType<typeof getConfig>>) {
  await registrarLog({ tenantId, acao: 'COMPARACAO', resultado, dispositivoId: origem, finalidade, distancia, userId })
  const ate = await checarBloqueio(tenantId, origem, cfg)
  if (ate) {
    if (!origem.startsWith('op:')) await prisma.preDispositivo.updateMany({ where: { id: origem, tenantId }, data: { bloqueadoAte: ate } })
    await registrarLog({ tenantId, acao: 'BLOQUEIO', resultado: 'BLOQUEADO', dispositivoId: origem, finalidade, userId })
    await alertar({ tenantId, tipo: 'TENTATIVAS', severidade: 'CRITICO', mensagem: `Muitas tentativas de reconhecimento sem sucesso (${origem.startsWith('op:') ? 'operador' : 'dispositivo'}). Bloqueado até ${ate.toISOString()}.`, dispositivoId: origem.startsWith('op:') ? undefined : origem, dedupeKey: `tentativas:${origem}`, dedupeMin: cfg.bloqueioMin })
  }
}

// ---------- templates ----------
/** Templates decifrados SOMENTE de quem tem consentimento ATIVO (revogação no portal LGPD tem efeito imediato). */
export async function templatesAtivos(tenantId: string, somente?: string[]) {
  const rows = await prisma.preTemplateFacial.findMany({ where: { tenantId, ...(somente ? { pessoaKey: { in: somente } } : {}) }, select: { id: true, pessoaKey: true, cifrado: true, consentimentoId: true } })
  if (!rows.length) return []
  const ativos = new Set((await prisma.lgpConsentimento.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.consentimentoId))] }, status: 'ATIVO' }, select: { id: true } })).map((c) => c.id))
  const out: Array<{ id: string; pessoaKey: string; vetor: number[] }> = []
  for (const r of rows) {
    if (!ativos.has(r.consentimentoId)) continue
    try { out.push({ id: r.id, pessoaKey: r.pessoaKey, vetor: decifrarTemplate(tenantId, r.pessoaKey, r.cifrado) }) } catch { /* template ilegível: ignora */ }
  }
  return out
}

export interface ReconhecimentoIn {
  tenantId: string
  embedding: unknown
  liveness?: Partial<EvidenciaLiveness>
  dispositivoId?: string | null
  operadorId?: string
  finalidade: 'PRESENCA' | 'ACESSO' | 'EMPRESTIMO'
}

/** Identificação 1:N com liveness, limite de tentativas e log. Lança FacialError (401 não reconhecido, 409 ambíguo, 422 liveness, 429 bloqueado). */
export async function reconhecerFace(p: ReconhecimentoIn): Promise<{ pessoaKey: string; distancia: number }> {
  const { tenantId } = p
  const cfg = await getConfig(tenantId)
  const origem = p.dispositivoId || `op:${p.operadorId ?? 'anon'}`
  const ate = await checarBloqueio(tenantId, origem, cfg)
  if (ate) { await registrarLog({ tenantId, acao: 'COMPARACAO', resultado: 'BLOQUEADO', dispositivoId: origem, finalidade: p.finalidade, userId: p.operadorId }); throw new FacialError(429, `Reconhecimento bloqueado temporariamente por excesso de tentativas. Use QR/código ou tente após ${ate.toLocaleTimeString('pt-BR')}.`, 'BLOQUEADO') }
  const vetor = validarEmbedding(p.embedding)
  try { await validarLiveness(tenantId, p.liveness, cfg.livenessObrigatorio) }
  catch (e) { if (e instanceof FacialError) await registrarFalha(tenantId, origem, p.finalidade, 'LIVENESS_FALHOU', undefined, p.operadorId, cfg); throw e }
  const cands = await templatesAtivos(tenantId)
  const r = identificar(vetor, cands, cfg.limiarDistancia, cfg.margemAmbiguidade)
  if (r.resultado !== 'OK' || !r.pessoaKey) {
    await registrarFalha(tenantId, origem, p.finalidade, r.resultado, r.distancia, p.operadorId, cfg)
    if (r.resultado === 'AMBIGUO') throw new FacialError(409, 'Rosto ambíguo: não foi possível identificar com segurança. Use QR/código.', 'AMBIGUO')
    throw new FacialError(401, 'Rosto não reconhecido. Tente novamente ou use QR/código.', 'NAO_RECONHECIDO')
  }
  await registrarLog({ tenantId, acao: 'COMPARACAO', resultado: 'OK', pessoaKey: r.pessoaKey, dispositivoId: origem, finalidade: p.finalidade, distancia: r.distancia, userId: p.operadorId })
  await prisma.preTemplateFacial.updateMany({ where: { tenantId, pessoaKey: r.pessoaKey }, data: { ultimoUsoEm: new Date() } })
  if (p.dispositivoId) await prisma.preDispositivo.updateMany({ where: { id: p.dispositivoId, tenantId }, data: { ultimoUsoEm: new Date() } })
  return { pessoaKey: r.pessoaKey, distancia: r.distancia! }
}

/** Cria/atualiza templates de uma pessoa (substitui os anteriores). Exige consentimento ativo. */
export async function cadastrarTemplates(p: { tenantId: string; pessoa: PessoaInfo; embeddings: unknown[]; modelo: string; qualidade?: number; canal: 'PORTAL' | 'PRESENCIAL'; liveness?: Partial<EvidenciaLiveness>; cadastradoPorId?: string }) {
  const { tenantId, pessoa } = p
  const cons = await consentimentoAtivo(tenantId, pessoa)
  if (!cons) throw httpErr(403, 'Cadastro facial exige consentimento específico, destacado e ativo (LGPD art. 11, I). Registre o consentimento antes.', 'SEM_CONSENTIMENTO')
  if (!Array.isArray(p.embeddings) || p.embeddings.length < 1 || p.embeddings.length > MAX_AMOSTRAS) throw httpErr(400, `Envie de 1 a ${MAX_AMOSTRAS} amostras (vetores) para o cadastro.`)
  const cfg = await getConfig(tenantId)
  await validarLiveness(tenantId, p.liveness, cfg.livenessObrigatorio)
  const vetores = p.embeddings.map((e) => validarEmbedding(e))
  // não permitir que o mesmo rosto seja cadastrado para outra pessoa (fraude/duplicidade)
  const outros = (await templatesAtivos(tenantId)).filter((t) => t.pessoaKey !== pessoa.pessoaKey)
  for (const v of vetores) {
    const r = identificar(v, outros, cfg.limiarDistancia, 0)
    if (r.resultado === 'OK') throw httpErr(409, 'Este rosto já está associado a outro cadastro. Procure a secretaria.', 'DUPLICADO')
  }
  await prisma.$transaction([
    prisma.preTemplateFacial.deleteMany({ where: { tenantId, pessoaKey: pessoa.pessoaKey } }),
    ...vetores.map((v) => prisma.preTemplateFacial.create({ data: { tenantId, pessoaKey: pessoa.pessoaKey, studentId: pessoa.studentId, userId: pessoa.userId, cifrado: cifrarTemplate(tenantId, pessoa.pessoaKey, p.modelo, v), dimensao: v.length, modelo: p.modelo.slice(0, 60), qualidade: p.qualidade, consentimentoId: cons.id, cadastradoPorId: p.cadastradoPorId, canal: p.canal } })),
  ])
  await registrarLog({ tenantId, acao: 'CADASTRO', resultado: 'OK', pessoaKey: pessoa.pessoaKey, userId: p.cadastradoPorId, finalidade: 'PRESENCA', detalhe: { amostras: vetores.length, modelo: p.modelo, canal: p.canal } })
  await audit({ tenantId, userId: p.cadastradoPorId, modulo: MOD, acao: 'CADASTRO_FACIAL', refType: 'Pessoa', refId: pessoa.pessoaKey, detalhes: { amostras: vetores.length, canal: p.canal } })
  return { amostras: vetores.length, consentimentoId: cons.id }
}

/** Exclui os templates da pessoa (revogação, desligamento, pedido do titular). */
export async function excluirTemplates(tenantId: string, key: string, motivo: string, userId?: string, acao = 'EXCLUSAO') {
  const r = await prisma.preTemplateFacial.deleteMany({ where: { tenantId, pessoaKey: key } })
  if (r.count) {
    await registrarLog({ tenantId, acao, resultado: 'OK', pessoaKey: key, userId, detalhe: { motivo, templates: r.count } })
    await audit({ tenantId, userId, modulo: MOD, acao: 'EXCLUIR_TEMPLATE', refType: 'Pessoa', refId: key, detalhes: { motivo, templates: r.count } })
  }
  return r.count
}

// ---------- credenciais alternativas (QR da carteirinha / código) ----------
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function chaveCred() { return process.env.SECURITY_ENC_KEY || process.env.JWT_SECRET || 'dev-presenca' }
const assinarCred = (id: string) => createHmac('sha256', chaveCred()).update('pre-cred:' + id).digest('base64url').slice(0, 16)
export const payloadQr = (credId: string) => `EDUPRE1:${credId}:${assinarCred(credId)}`

export async function emitirCredencial(tenantId: string, pessoa: PessoaInfo, opts: { validadeAte?: Date } = {}) {
  await prisma.preCredencial.updateMany({ where: { tenantId, pessoaKey: pessoa.pessoaKey, ativo: true }, data: { ativo: false, revogadoEm: new Date() } })
  for (let i = 0; i < 6; i++) {
    let codigo = ''
    for (let j = 0; j < 8; j++) codigo += ALFA[randomInt(ALFA.length)]
    try {
      const c = await prisma.preCredencial.create({ data: { tenantId, pessoaKey: pessoa.pessoaKey, studentId: pessoa.studentId, userId: pessoa.userId, codigo, validadeAte: opts.validadeAte } })
      return { ...c, qr: payloadQr(c.id) }
    } catch (e: any) { if (e?.code !== 'P2002') throw e }
  }
  throw httpErr(500, 'Não foi possível gerar a credencial.')
}

/** Resolve a credencial (conteúdo do QR ou código digitado) para a pessoa. Aplica o mesmo limite de tentativas. */
export async function resolverCredencial(p: { tenantId: string; credencial: string; dispositivoId?: string | null; operadorId?: string; finalidade: 'PRESENCA' | 'ACESSO' | 'EMPRESTIMO' }): Promise<string> {
  const { tenantId } = p
  const cfg = await getConfig(tenantId)
  const origem = p.dispositivoId || `op:${p.operadorId ?? 'anon'}`
  const ate = await checarBloqueio(tenantId, origem, cfg)
  if (ate) throw new FacialError(429, `Leitura bloqueada temporariamente por excesso de tentativas até ${ate.toLocaleTimeString('pt-BR')}.`, 'BLOQUEADO')
  const texto = String(p.credencial || '').trim()
  let cred = null as Awaited<ReturnType<typeof prisma.preCredencial.findFirst>>
  const m = /^EDUPRE1:([\w-]{20,40}):([\w-]{16})$/.exec(texto)
  if (m) {
    const esperado = Buffer.from(assinarCred(m[1])), recebido = Buffer.from(m[2])
    if (esperado.length === recebido.length && timingSafeEqual(esperado, recebido)) cred = await prisma.preCredencial.findFirst({ where: { id: m[1], tenantId } })
  } else if (/^[A-Za-z0-9-]{6,12}$/.test(texto)) {
    cred = await prisma.preCredencial.findFirst({ where: { tenantId, codigo: texto.replace(/-/g, '').toUpperCase() } })
  }
  if (!cred || !cred.ativo || (cred.validadeAte && cred.validadeAte < new Date())) {
    await registrarFalha(tenantId, origem, p.finalidade, 'NAO_RECONHECIDO', undefined, p.operadorId, cfg)
    throw new FacialError(401, 'Credencial inválida, revogada ou vencida.', 'CREDENCIAL_INVALIDA')
  }
  return cred.pessoaKey
}

/** Resolve a pessoa por face, credencial ou chave (manual, só operador). */
export async function resolverPessoaPorMetodo(p: {
  tenantId: string; metodo: string; embedding?: unknown; liveness?: any; credencial?: string; pessoaKey?: string
  dispositivoId?: string | null; operadorId?: string; finalidade: 'PRESENCA' | 'ACESSO' | 'EMPRESTIMO'
}): Promise<{ pessoa: PessoaInfo; distancia?: number }> {
  const metodo = String(p.metodo).toUpperCase()
  let key: string, distancia: number | undefined
  if (metodo === 'FACIAL') {
    const r = await reconhecerFace({ tenantId: p.tenantId, embedding: p.embedding, liveness: p.liveness, dispositivoId: p.dispositivoId, operadorId: p.operadorId, finalidade: p.finalidade })
    key = r.pessoaKey; distancia = r.distancia
  } else if (metodo === 'QR' || metodo === 'CODIGO') {
    if (!p.credencial) throw httpErr(400, 'Informe a credencial (QR ou código).')
    key = await resolverCredencial({ tenantId: p.tenantId, credencial: p.credencial, dispositivoId: p.dispositivoId, operadorId: p.operadorId, finalidade: p.finalidade })
  } else if (metodo === 'MANUAL') {
    if (!p.pessoaKey) throw httpErr(400, 'Informe a pessoa.')
    key = p.pessoaKey
  } else throw httpErr(400, 'Método inválido (use FACIAL, QR, CODIGO ou MANUAL).')
  const pessoa = await exigirPessoa(p.tenantId, key)
  return { pessoa, distancia }
}

export { verificar }
