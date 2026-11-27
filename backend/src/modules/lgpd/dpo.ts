import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { exigirGestorLgpd, httpError, instituicaoPublica, tenantPublico, tid, trilha, uid } from './base'
import { PRAZO_SOLICITACAO_DIAS } from './prazos'

// ============================================================
// 6) Encarregado pelo tratamento de dados pessoais (DPO) - art. 41.
//    Identidade e contato devem ser divulgados publicamente, de preferência no sítio eletrônico do controlador.
// ============================================================

const dpoSchema = z.object({
  nome: z.string().min(3).max(150), email: z.string().email().max(150), telefone: z.string().max(30).optional(), cargo: z.string().max(100).optional(),
  tipo: z.enum(['INTERNO', 'TERCEIRIZADO']).default('INTERNO'), empresa: z.string().max(150).optional(), cnpj: z.string().max(20).optional(),
  userId: z.string().max(80).optional(), ato: z.string().max(300).optional(), designadoEm: z.string().max(10).optional(),
  horarioAtendimento: z.string().max(150).optional(), endereco: z.string().max(300).optional(), canalUrl: z.string().url().max(300).optional(), ativo: z.boolean().default(true),
})

async function validarUsuario(tenantId: string, userId?: string) {
  if (!userId) return
  const u = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } })
  if (!u) throw httpError(404, 'Usuário informado não existe nesta instituição.')
}

export function mountDpo(router: Router) {
  router.get('/dpo', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const items = await prisma.lgpDpo.findMany({ where: { tenantId: tid(req) }, orderBy: [{ ativo: 'desc' }, { createdAt: 'desc' }] })
    res.json({ items, ativo: items.find((i) => i.ativo) ?? null })
  }))

  router.post('/dpo', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(dpoSchema, req.body)
    await validarUsuario(tenantId, b.userId)
    if (b.ativo) await prisma.lgpDpo.updateMany({ where: { tenantId, ativo: true }, data: { ativo: false } })
    const r = await prisma.lgpDpo.create({ data: { ...b, tenantId, designadoEm: b.designadoEm ? new Date(b.designadoEm) : new Date() } })
    await trilha({ tenantId, refType: 'Dpo', refId: r.id, acao: 'DESIGNADO', userId: uid(req), ator: 'EQUIPE', detalhe: { tipo: r.tipo } })
    res.status(201).json(r)
  }))

  router.put('/dpo/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const d = await prisma.lgpDpo.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!d) throw httpError(404, 'Encarregado não encontrado.')
    const b = parseBody(dpoSchema.partial(), req.body)
    await validarUsuario(tenantId, b.userId)
    if (b.ativo) await prisma.lgpDpo.updateMany({ where: { tenantId, ativo: true, id: { not: d.id } }, data: { ativo: false } })
    const { designadoEm, ...resto } = b
    const r = await prisma.lgpDpo.update({ where: { id: d.id }, data: { ...resto, ...(designadoEm ? { designadoEm: new Date(designadoEm) } : {}) } })
    await trilha({ tenantId, refType: 'Dpo', refId: d.id, acao: 'ATUALIZADO', userId: uid(req), ator: 'EQUIPE', detalhe: { campos: Object.keys(b) } })
    res.json(r)
  }))
}

export async function dadosPublicosDpo(tenantId: string) {
  const [inst, dpo] = await Promise.all([instituicaoPublica(tenantId), prisma.lgpDpo.findFirst({ where: { tenantId, ativo: true }, orderBy: { createdAt: 'desc' } })])
  return {
    instituicao: inst,
    encarregado: dpo
      ? { nome: dpo.nome, email: dpo.email, telefone: dpo.telefone, cargo: dpo.cargo, tipo: dpo.tipo, empresa: dpo.empresa, horarioAtendimento: dpo.horarioAtendimento, endereco: dpo.endereco, canalUrl: dpo.canalUrl }
      : null,
    aviso: dpo ? null : 'A instituição ainda não divulgou o encarregado. Use o formulário do Portal do Titular: a solicitação chega à equipe responsável.',
    prazoRespostaDias: PRAZO_SOLICITACAO_DIAS,
  }
}

export function mountDpoPublic(pub: Router) {
  pub.get('/:tenant/dpo', asyncHandler(async (req: Request, res: Response) => {
    res.json(await dadosPublicosDpo(await tenantPublico(req)))
  }))

  // Dados para a Política de Privacidade pública: instituição, encarregado e resumo do inventário (sem detalhes de segurança)
  pub.get('/:tenant/politica', asyncHandler(async (req: Request, res: Response) => {
    const tenantId = await tenantPublico(req)
    const base = await dadosPublicosDpo(tenantId)
    const ativs = await prisma.lgpAtividadeTratamento.findMany({ where: { tenantId, status: { not: 'DESCONTINUADA' } }, orderBy: { atividade: 'asc' } })
    res.json({
      ...base,
      atividades: ativs.map((a) => ({
        atividade: a.atividade, finalidade: a.finalidade, baseLegal: a.baseLegal, categoriasDados: a.categoriasDados, categoriasTitulares: a.categoriasTitulares, dadosSensiveis: a.dadosSensiveis, dadosMenores: a.dadosMenores,
        retencao: a.retencao, compartilhamento: ((a.compartilhamento as any[]) ?? []).map((c) => c.destinatario), transferenciaInternacional: a.transferenciaInternacional,
      })),
      revisadoEm: ativs.map((a) => a.revisadoEm).filter(Boolean).sort().pop() ?? null,
    })
  }))
}
