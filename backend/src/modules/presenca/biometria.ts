import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, pageParams, qs } from '../core/crud'
import { audit } from '../core/notify'
import { hashesDe } from '../lgpd/base'
import { registrarConsentimento, revogar, textoVigente } from '../lgpd/consentimentos'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import { FacialError } from './facial'
import {
  FINALIDADE_CONSENTIMENTO, GESTAO, MOD, PessoaInfo, cadastrarTemplates, consentimentoAtivo, emitirCredencial, emitirDesafio,
  exigirPessoa, getConfig, httpErr, payloadQr, pessoaDoUsuario, registrarLog,
} from './servico'
import { parsePessoaKey } from './logic'

export const AVISO_BIOMETRIA = {
  finalidade: 'Registrar presença em aulas e controlar acesso e retirada de materiais. Nenhuma outra finalidade.',
  oQueGuardamos: 'Apenas um vetor numérico (template) calculado no seu próprio aparelho, guardado criptografado. Não guardamos fotos nem vídeos do seu rosto.',
  baseLegal: 'Consentimento específico e destacado (LGPD, art. 11, II, "a" e art. 8º).',
  alternativa: 'A biometria é opcional. Sem ela você registra presença e acesso por QR da carteirinha, código ou chamada manual, sem qualquer prejuízo.',
  revogacao: 'Você pode revogar a qualquer momento; o vetor é excluído imediatamente.',
  retencao: 'O vetor é excluído na revogação, no desligamento ou após período sem uso. Registros de presença consolidados seguem o prazo acadêmico, sem dado biométrico.',
  compartilhamento: 'Não compartilhamos com terceiros nem usamos para vigilância, marketing ou avaliação.',
}

async function pessoaDeRequisicao(req: AuthenticatedRequest): Promise<PessoaInfo> {
  const key = pessoaDoUsuario(req.user!)
  return exigirPessoa(getTenantId(req), key)
}

async function dadosConsent(tenantId: string, pessoa: PessoaInfo) {
  let dataNascimento: string | undefined, nome = pessoa.nome
  if (pessoa.studentId) {
    const s = await prisma.student.findFirst({ where: { id: pessoa.studentId, tenantId }, select: { dataNascimento: true } })
    if (s?.dataNascimento) dataNascimento = s.dataNascimento.toISOString().slice(0, 10)
  }
  return { nome, dataNascimento }
}

const responsavelSchema = z.object({
  nome: z.string().min(3).max(150), parentesco: z.string().min(2).max(40),
  email: z.string().email().max(150).optional(), telefone: z.string().max(30).optional(), documento: z.string().max(20).optional(),
  declaracao: z.literal(true),
}).optional()
const consentSchema = z.object({ versao: z.string().min(1).max(40), responsavel: responsavelSchema })
const cadastroSchema = z.object({
  embeddings: z.array(z.array(z.number()).length(128)).min(1).max(5),
  modelo: z.string().min(2).max(60).default('face-api-128'),
  qualidade: z.number().min(0).max(1).optional(),
  liveness: z.object({ nonce: z.string().max(80) }).passthrough().optional(),
})

async function statusPessoa(tenantId: string, pessoa: PessoaInfo) {
  const [cons, templates, cred, ultimoRevogado] = await Promise.all([
    consentimentoAtivo(tenantId, pessoa),
    prisma.preTemplateFacial.findMany({ where: { tenantId, pessoaKey: pessoa.pessoaKey }, select: { id: true, createdAt: true, ultimoUsoEm: true, modelo: true, canal: true, qualidade: true } }),
    prisma.preCredencial.findFirst({ where: { tenantId, pessoaKey: pessoa.pessoaKey, ativo: true }, select: { id: true, codigo: true, createdAt: true } }),
    prisma.lgpConsentimento.findFirst({ where: { tenantId, finalidade: FINALIDADE_CONSENTIMENTO, status: 'REVOGADO', titularId: { in: [pessoa.id] } }, orderBy: { revogadoEm: 'desc' }, select: { revogadoEm: true } }),
  ])
  return {
    pessoa: { pessoaKey: pessoa.pessoaKey, nome: pessoa.nome, tipo: pessoa.tipo },
    consentimento: cons ? { id: cons.id, versao: cons.versaoTexto, concedidoEm: cons.concedidoEm, canal: cons.canal } : null,
    biometriaCadastrada: templates.length > 0,
    amostras: templates.length,
    cadastradoEm: templates[0]?.createdAt ?? null,
    ultimoUsoEm: templates.map((t) => t.ultimoUsoEm).filter(Boolean).sort().pop() ?? null,
    modelo: templates[0]?.modelo ?? null,
    credencialAlternativa: cred ? { codigo: cred.codigo, emitidaEm: cred.createdAt } : null,
    revogadoEm: cons ? null : ultimoRevogado?.revogadoEm ?? null,
  }
}

async function concederConsentimento(req: AuthenticatedRequest, pessoa: PessoaInfo, canal: 'PORTAL' | 'PRESENCIAL', b: z.infer<typeof consentSchema>) {
  const tenantId = getTenantId(req)
  const { nome, dataNascimento } = await dadosConsent(tenantId, pessoa)
  const r = await registrarConsentimento(tenantId, {
    finalidade: FINALIDADE_CONSENTIMENTO, versao: b.versao, titularTipo: pessoa.tipo === 'ALUNO' ? 'ALUNO' : 'OUTRO', titularId: pessoa.id, nome, dataNascimento, responsavel: b.responsavel,
  } as any, { canal, ...hashesDe(req, tenantId), registradoPorId: canal === 'PRESENCIAL' ? getUserId(req) : undefined })
  await registrarLog({ tenantId, acao: 'CONSENTIMENTO', resultado: 'OK', pessoaKey: pessoa.pessoaKey, userId: getUserId(req), detalhe: { canal, versao: b.versao } })
  return r
}

async function revogarBiometria(req: AuthenticatedRequest, pessoa: PessoaInfo, motivo: string, titular: boolean) {
  const tenantId = getTenantId(req)
  const antes = await prisma.preTemplateFacial.count({ where: { tenantId, pessoaKey: pessoa.pessoaKey } })
  const ativos = await prisma.lgpConsentimento.findMany({ where: { tenantId, finalidade: FINALIDADE_CONSENTIMENTO, status: 'ATIVO', titularId: { in: [pessoa.id] } }, select: { id: true } })
  // revogar() (módulo LGPD) já exclui os templates ligados ao consentimento; o restante é removido abaixo
  for (const c of ativos) await revogar(tenantId, c.id, motivo, { userId: getUserId(req), titular })
  await prisma.preTemplateFacial.deleteMany({ where: { tenantId, pessoaKey: pessoa.pessoaKey } })
  // a credencial alternativa (QR/código) NÃO é biométrica e permanece
  await registrarLog({ tenantId, acao: 'REVOGACAO', resultado: 'OK', pessoaKey: pessoa.pessoaKey, userId: getUserId(req), detalhe: { motivo, templates: antes, consentimentos: ativos.length, porTitular: titular } })
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'REVOGAR_BIOMETRIA', refType: 'Pessoa', refId: pessoa.pessoaKey, detalhes: { motivo, templates: antes } })
  return { consentimentosRevogados: ativos.length, templatesExcluidos: antes }
}

export function mountBiometria(router: Router) {
  // ---- público (autenticado): termo e desafio
  router.get('/biometria/termo', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const t = await textoVigente(getTenantId(req), FINALIDADE_CONSENTIMENTO)
    res.json({ termo: t, aviso: AVISO_BIOMETRIA, ripd: 'docs/LGPD-RIPD-biometria.md' })
  }))
  router.get('/biometria/desafio', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await emitirDesafio(getTenantId(req)))
  }))
  router.get('/biometria/configuracao', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await getConfig(getTenantId(req))
    res.json({ limiarDistancia: c.limiarDistancia, livenessObrigatorio: c.livenessObrigatorio, modelosSuportados: ['face-api-128'], dimensao: 128 })
  }))

  // ---- o próprio titular
  router.get('/biometria/meu', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    res.json({ ...(await statusPessoa(tenantId, await pessoaDeRequisicao(req))), aviso: AVISO_BIOMETRIA })
  }))
  router.post('/biometria/meu/consentimento', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(consentSchema, req.body)
    const pessoa = await pessoaDeRequisicao(req)
    const r = await concederConsentimento(req, pessoa, 'PORTAL', b)
    res.status(201).json({ consentimentoId: r.consentimento.id, jaExistia: r.jaExistia, recibo: r.recibo })
  }))
  router.post('/biometria/meu/cadastro', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(cadastroSchema, req.body)
    const tenantId = getTenantId(req)
    const pessoa = await pessoaDeRequisicao(req)
    const r = await cadastrarTemplates({ tenantId, pessoa, embeddings: b.embeddings, modelo: b.modelo, qualidade: b.qualidade, canal: 'PORTAL', liveness: b.liveness as any, cadastradoPorId: getUserId(req) })
    res.status(201).json({ ...r, status: await statusPessoa(tenantId, pessoa) })
  }))
  router.delete('/biometria/meu', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const motivo = String(req.body?.motivo || req.query.motivo || 'Revogação pelo titular').slice(0, 300)
    const pessoa = await pessoaDeRequisicao(req)
    const r = await revogarBiometria(req, pessoa, motivo, true)
    res.json({ ...r, status: await statusPessoa(getTenantId(req), pessoa) })
  }))
  router.post('/biometria/meu/credencial', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pessoa = await pessoaDeRequisicao(req)
    const c = await emitirCredencial(tenantId, pessoa)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'EMITIR_CREDENCIAL', refType: 'Pessoa', refId: pessoa.pessoaKey })
    res.status(201).json({ codigo: c.codigo, qr: c.qr, aviso: 'Credencial alternativa sem biometria. Emitir outra invalida esta.' })
  }))
  router.get('/biometria/meu/credencial', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pessoa = await pessoaDeRequisicao(req)
    const c = await prisma.preCredencial.findFirst({ where: { tenantId, pessoaKey: pessoa.pessoaKey, ativo: true } })
    res.json(c ? { codigo: c.codigo, qr: payloadQr(c.id) } : { codigo: null, qr: null })
  }))

  // ---- gestão (secretaria/coordenação): cadastro presencial, exclusão, painel e log
  const gestao = requireRole(...GESTAO)
  router.get('/biometria/painel', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const desde = new Date(Date.now() - 24 * 3600_000)
    const [templates, pessoas, consentimentos, revogados, comparacoes, falhas, bloqueios, credenciais] = await Promise.all([
      prisma.preTemplateFacial.count({ where: { tenantId } }),
      prisma.preTemplateFacial.groupBy({ by: ['pessoaKey'], where: { tenantId } }).then((r) => r.length),
      prisma.lgpConsentimento.count({ where: { tenantId, finalidade: FINALIDADE_CONSENTIMENTO, status: 'ATIVO' } }),
      prisma.lgpConsentimento.count({ where: { tenantId, finalidade: FINALIDADE_CONSENTIMENTO, status: 'REVOGADO' } }),
      prisma.preLogBiometrico.count({ where: { tenantId, acao: 'COMPARACAO', createdAt: { gte: desde } } }),
      prisma.preLogBiometrico.count({ where: { tenantId, acao: 'COMPARACAO', resultado: { not: 'OK' }, createdAt: { gte: desde } } }),
      prisma.preLogBiometrico.count({ where: { tenantId, acao: 'BLOQUEIO', createdAt: { gte: desde } } }),
      prisma.preCredencial.count({ where: { tenantId, ativo: true } }),
    ])
    res.json({ templates, pessoasComBiometria: pessoas, consentimentosAtivos: consentimentos, consentimentosRevogados: revogados, credenciaisAlternativas: credenciais, ultimas24h: { comparacoes, falhas, bloqueios }, aviso: AVISO_BIOMETRIA })
  }))
  router.get('/biometria/log', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const acao = qs(req.query.acao), pk = qs(req.query.pessoaKey), resultado = qs(req.query.resultado)
    if (acao) where.acao = acao
    if (pk) where.pessoaKey = pk
    if (resultado) where.resultado = resultado
    const [total, items] = await Promise.all([prisma.preLogBiometrico.count({ where }), prisma.preLogBiometrico.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take })])
    await registrarAcessoSensivel(req, { recurso: 'presenca/biometria/log', categoria: 'BIOMETRIA', titularTipo: pk ? 'ALUNO' : undefined, titularId: pk ? parsePessoaKey(pk)?.id : undefined })
    res.json({ total, page, pageSize, items })
  }))
  router.get('/biometria/pessoas/:key', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pessoa = await exigirPessoa(tenantId, String(req.params.key))
    await registrarAcessoSensivel(req, { recurso: 'presenca/biometria/pessoa', recursoId: pessoa.pessoaKey, categoria: 'BIOMETRIA', titularTipo: pessoa.tipo === 'ALUNO' ? 'ALUNO' : undefined, titularId: pessoa.id })
    await registrarLog({ tenantId, acao: 'ADMIN_CONSULTA', resultado: 'OK', pessoaKey: pessoa.pessoaKey, userId: getUserId(req) })
    res.json(await statusPessoa(tenantId, pessoa))
  }))
  router.post('/biometria/pessoas/:key/consentimento', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(consentSchema, req.body)
    const pessoa = await exigirPessoa(getTenantId(req), String(req.params.key))
    const r = await concederConsentimento(req, pessoa, 'PRESENCIAL', b)
    res.status(201).json({ consentimentoId: r.consentimento.id, jaExistia: r.jaExistia, recibo: r.recibo })
  }))
  router.post('/biometria/pessoas/:key/cadastro', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(cadastroSchema, req.body)
    const tenantId = getTenantId(req)
    const pessoa = await exigirPessoa(tenantId, String(req.params.key))
    const r = await cadastrarTemplates({ tenantId, pessoa, embeddings: b.embeddings, modelo: b.modelo, qualidade: b.qualidade, canal: 'PRESENCIAL', liveness: b.liveness as any, cadastradoPorId: getUserId(req) })
    res.status(201).json(r)
  }))
  router.delete('/biometria/pessoas/:key', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pessoa = await exigirPessoa(tenantId, String(req.params.key))
    const motivo = String(req.body?.motivo || req.query.motivo || '').trim()
    if (motivo.length < 5) throw httpErr(400, 'Informe o motivo da exclusão (mín. 5 caracteres).')
    const r = await revogarBiometria(req, pessoa, motivo, false)
    res.json(r)
  }))
  router.post('/biometria/pessoas/:key/credencial', gestao, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const pessoa = await exigirPessoa(tenantId, String(req.params.key))
    const c = await emitirCredencial(tenantId, pessoa)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'EMITIR_CREDENCIAL', refType: 'Pessoa', refId: pessoa.pessoaKey })
    res.status(201).json({ codigo: c.codigo, qr: c.qr })
  }))
}

export { FacialError }
