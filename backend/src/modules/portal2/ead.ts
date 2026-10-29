import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId } from '../academico/middleware'
import { audit, notify } from '../core/notify'
import { gravarNota } from '../notas/service'
import { bodyOf, httpErr, isMgmt, nomeDe, nomesUsuarios, pct, qs, role, turmaAcesso, TIPOS_MATERIAL, urlSegura, DAY } from './common'

// ============================================================================
// SALA VIRTUAL (EAD e apoio ao presencial): materiais/trilhas/aulas gravadas e ao vivo/atividades com entrega,
// fórum, recados, progresso e acessos. Professor publica; aluno consome, entrega e é acompanhado.
// ============================================================================
const router = Router()

const matSchema = z.object({
  tipo: z.enum(TIPOS_MATERIAL),
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(4000).optional().nullable(),
  trilha: z.string().trim().max(120).optional().nullable(),
  ordem: z.number().int().min(0).max(9999).optional(),
  url: z.string().trim().max(2000).optional().nullable(),
  arquivoNome: z.string().trim().max(200).optional().nullable(),
  conteudo: z.string().max(20000).optional().nullable(),
  status: z.enum(['RASCUNHO', 'PUBLICADO', 'ARQUIVADO']).optional(),
  visivelDe: z.coerce.date().optional().nullable(),
  visivelAte: z.coerce.date().optional().nullable(),
  inicioEm: z.coerce.date().optional().nullable(),
  duracaoMin: z.number().int().min(1).max(1440).optional().nullable(),
  aceitaEntrega: z.boolean().optional(),
  prazoEntrega: z.coerce.date().optional().nullable(),
  notaMaxima: z.number().min(0).max(1000).optional().nullable(),
  componenteId: z.string().optional().nullable(),
})

function validarMaterial(d: z.infer<typeof matSchema> | Partial<z.infer<typeof matSchema>>) {
  if (d.url) urlSegura(d.url)
  if (d.tipo && ['VIDEO', 'LINK', 'AULA_GRAVADA', 'AULA_AO_VIVO'].includes(d.tipo) && d.url === undefined) throw httpErr(400, 'Informe a URL do conteúdo.')
  if (d.tipo === 'AULA_AO_VIVO' && !d.inicioEm) throw httpErr(400, 'Informe a data/hora da aula ao vivo.')
  if (d.visivelDe && d.visivelAte && d.visivelAte < d.visivelDe) throw httpErr(400, 'A data final de visibilidade é anterior à inicial.')
  if (d.aceitaEntrega && d.tipo && d.tipo !== 'ATIVIDADE') throw httpErr(400, 'Só atividades recebem entregas.')
}

const visivelAgora = (m: any, now = new Date()) => m.status === 'PUBLICADO' && (!m.visivelDe || m.visivelDe <= now) && (!m.visivelAte || m.visivelAte >= now)

// ---- listagem (aluno: só publicados e visíveis; professor/gestão: todos) ----
router.get('/turmas/:id/materiais', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec, papel, studentId } = await turmaAcesso(req, String(req.params.id))
  const now = new Date()
  let mats = await prisma.porMaterial.findMany({ where: { tenantId, classSectionId: sec.id, ...(papel === 'ALUNO' ? { status: 'PUBLICADO' } : {}) }, orderBy: [{ trilha: 'asc' }, { ordem: 'asc' }, { createdAt: 'asc' }] })
  if (papel === 'ALUNO') mats = mats.filter((m) => visivelAgora(m, now))
  const ids = mats.map((m) => m.id)
  let prog: any[] = [], ent: any[] = []
  if (papel === 'ALUNO' && ids.length) {
    ;[prog, ent] = await Promise.all([
      prisma.porProgresso.findMany({ where: { tenantId, studentId: studentId!, materialId: { in: ids } } }),
      prisma.porEntrega.findMany({ where: { tenantId, studentId: studentId!, materialId: { in: ids } } }),
    ])
  }
  const contagem = papel !== 'ALUNO' && ids.length ? await prisma.porEntrega.groupBy({ by: ['materialId'], where: { tenantId, materialId: { in: ids } }, _count: true }) : []
  const itens = mats.map((m) => ({
    ...m,
    meuProgresso: prog.find((p) => p.materialId === m.id) ?? null,
    minhaEntrega: ent.find((e) => e.materialId === m.id) ?? null,
    entregas: contagem.find((c) => c.materialId === m.id)?._count ?? undefined,
    prazoVencido: !!m.prazoEntrega && m.prazoEntrega < now,
  }))
  const trilhas = [...new Set(itens.map((i) => i.trilha || 'Geral'))].map((nome) => {
    const doGrupo = itens.filter((i) => (i.trilha || 'Geral') === nome)
    const concl = doGrupo.filter((i) => i.meuProgresso?.concluido || i.minhaEntrega).length
    return { nome, total: doGrupo.length, concluidos: concl, percentual: pct(concl, doGrupo.length) }
  })
  res.json({ turma: { id: sec.id, nome: sec.nome, disciplina: sec.discipline.nome }, itens, trilhas })
}))

router.post('/turmas/:id/materiais', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec, papel } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const d = bodyOf(matSchema, req)
  validarMaterial(d)
  if (d.componenteId) {
    const c = await prisma.ntComponente.findFirst({ where: { id: d.componenteId, tenantId, classSectionId: sec.id } })
    if (!c) throw httpErr(404, 'Componente de nota não encontrado nesta turma.')
  }
  const m = await prisma.porMaterial.create({ data: { ...d, tenantId, classSectionId: sec.id, autorUserId: getUserId(req), status: d.status ?? 'PUBLICADO' } as any })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'MATERIAL_PUBLICADO', refType: 'PorMaterial', refId: m.id, detalhes: { tipo: m.tipo, papel } })
  if (m.status === 'PUBLICADO') await avisarTurma(tenantId, sec.id, `Novo ${rotuloTipo(m.tipo)} em ${sec.discipline.nome}`, m.titulo)
  res.status(201).json(m)
}))

function rotuloTipo(t: string) { return ({ ATIVIDADE: 'atividade', ARQUIVO: 'arquivo', VIDEO: 'vídeo', LINK: 'link', TEXTO: 'conteúdo', AULA_GRAVADA: 'aula gravada', AULA_AO_VIVO: 'aula ao vivo' } as any)[t] || 'material' }

async function avisarTurma(tenantId: string, classSectionId: string, assunto: string, mensagem: string) {
  const alunos = await prisma.classSectionEnrollment.findMany({ where: { classSectionId }, select: { enrollment: { select: { studentId: true } } } })
  const ids = [...new Set(alunos.map((a) => a.enrollment.studentId))].slice(0, 500)
  await Promise.all(ids.map((studentId) => notify({ tenantId, studentId, assunto, mensagem, refType: 'PorMaterial' }).catch(() => null)))
}

async function materialDoDocente(req: AuthenticatedRequest, id: string) {
  const tenantId = getTenantId(req)
  const m = await prisma.porMaterial.findFirst({ where: { id, tenantId } })
  if (!m) throw httpErr(404, 'Material não encontrado.')
  const a = await turmaAcesso(req, m.classSectionId, { soDocente: true })
  return { m, ...a }
}

router.patch('/materiais/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { m } = await materialDoDocente(req, String(req.params.id))
  const d = bodyOf(matSchema.partial(), req)
  validarMaterial({ ...m, ...d } as any)
  res.json(await prisma.porMaterial.update({ where: { id: m.id }, data: d as any }))
}))

router.delete('/materiais/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { m } = await materialDoDocente(req, String(req.params.id))
  const n = await prisma.porEntrega.count({ where: { materialId: m.id } })
  if (n) { await prisma.porMaterial.update({ where: { id: m.id }, data: { status: 'ARQUIVADO' } }); return res.json({ ok: true, arquivado: true }) }
  await prisma.$transaction([prisma.porProgresso.deleteMany({ where: { materialId: m.id } }), prisma.porMaterial.delete({ where: { id: m.id } })])
  res.json({ ok: true })
}))

// ---- aluno: registrar acesso/progresso ----
router.post('/materiais/:id/acesso', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (role(req) !== 'STUDENT') throw httpErr(403, 'Somente alunos registram progresso.')
  const m = await prisma.porMaterial.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!m || !visivelAgora(m)) throw httpErr(404, 'Material não encontrado.')
  const { studentId } = await turmaAcesso(req, m.classSectionId)
  const d = bodyOf(z.object({ percentual: z.number().min(0).max(100).optional(), concluido: z.boolean().optional() }), req)
  const ex = await prisma.porProgresso.findUnique({ where: { materialId_studentId: { materialId: m.id, studentId: studentId! } } })
  const percentual = Math.max(ex?.percentual ?? 0, d.percentual ?? 0)
  const concluido = d.concluido ?? ex?.concluido ?? percentual >= 95
  const p = ex
    ? await prisma.porProgresso.update({ where: { id: ex.id }, data: { percentual: concluido ? Math.max(percentual, 100) : percentual, concluido, acessos: { increment: 1 }, ultimoAcessoEm: new Date() } })
    : await prisma.porProgresso.create({ data: { tenantId, materialId: m.id, classSectionId: m.classSectionId, studentId: studentId!, percentual: concluido ? 100 : percentual, concluido, acessos: 1 } })
  await prisma.porAcesso.create({ data: { tenantId, studentId: studentId!, classSectionId: m.classSectionId, materialId: m.id, tipo: m.tipo.startsWith('AULA') ? 'AULA' : 'MATERIAL' } })
  res.json(p)
}))

router.post('/turmas/:id/entrar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sec, studentId } = await turmaAcesso(req, String(req.params.id))
  if (studentId) await prisma.porAcesso.create({ data: { tenantId: sec.tenantId, studentId, classSectionId: sec.id, tipo: 'SALA' } })
  res.json({ ok: true })
}))

// ---- entrega de trabalhos ----
router.post('/materiais/:id/entrega', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (role(req) !== 'STUDENT') throw httpErr(403, 'Somente alunos entregam atividades.')
  const m = await prisma.porMaterial.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!m || !visivelAgora(m) || !m.aceitaEntrega) throw httpErr(404, 'Atividade não encontrada ou sem entrega.')
  const { studentId } = await turmaAcesso(req, m.classSectionId)
  const d = bodyOf(z.object({ texto: z.string().trim().max(20000).optional(), url: z.string().trim().max(2000).optional(), arquivoNome: z.string().trim().max(200).optional() }), req)
  if (!d.texto && !d.url) throw httpErr(400, 'Escreva a resposta ou informe o link do arquivo.')
  if (d.url) urlSegura(d.url)
  const now = new Date()
  const atrasada = !!m.prazoEntrega && m.prazoEntrega < now
  const ex = await prisma.porEntrega.findUnique({ where: { materialId_studentId: { materialId: m.id, studentId: studentId! } } })
  if (ex && ex.status === 'CORRIGIDA') throw httpErr(409, 'Esta entrega já foi corrigida e não pode ser alterada.')
  const e = ex
    ? await prisma.porEntrega.update({ where: { id: ex.id }, data: { ...d, atrasada, status: 'ENVIADA', versao: { increment: 1 }, enviadaEm: now } })
    : await prisma.porEntrega.create({ data: { ...d, tenantId, materialId: m.id, classSectionId: m.classSectionId, studentId: studentId!, atrasada } })
  await prisma.porProgresso.upsert({ where: { materialId_studentId: { materialId: m.id, studentId: studentId! } }, update: { concluido: true, percentual: 100, ultimoAcessoEm: now }, create: { tenantId, materialId: m.id, classSectionId: m.classSectionId, studentId: studentId!, concluido: true, percentual: 100, acessos: 1 } })
  await prisma.porAcesso.create({ data: { tenantId, studentId: studentId!, classSectionId: m.classSectionId, materialId: m.id, tipo: 'ENTREGA' } })
  res.status(ex ? 200 : 201).json(e)
}))

router.get('/materiais/:id/entregas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { m, sec } = await materialDoDocente(req, String(req.params.id))
  const [entregas, matric] = await Promise.all([
    prisma.porEntrega.findMany({ where: { tenantId, materialId: m.id }, orderBy: { enviadaEm: 'asc' } }),
    prisma.classSectionEnrollment.findMany({ where: { classSectionId: sec.id }, select: { enrollment: { select: { student: { select: { id: true, ra: true, nomeCompleto: true } } } } } }),
  ])
  const alunos = matric.map((x) => x.enrollment.student)
  res.json({
    material: m,
    itens: alunos.map((a) => ({ aluno: a, entrega: entregas.find((e) => e.studentId === a.id) ?? null })).sort((x, y) => x.aluno.nomeCompleto.localeCompare(y.aluno.nomeCompleto)),
    resumo: { alunos: alunos.length, entregues: entregas.length, corrigidas: entregas.filter((e) => e.status === 'CORRIGIDA').length, atrasadas: entregas.filter((e) => e.atrasada).length },
  })
}))

router.post('/entregas/:id/corrigir', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const e = await prisma.porEntrega.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!e) throw httpErr(404, 'Entrega não encontrada.')
  const { m } = await materialDoDocente(req, e.materialId)
  const d = bodyOf(z.object({ nota: z.number().min(0).max(1000).nullable().optional(), feedback: z.string().trim().max(4000).optional(), devolver: z.boolean().optional() }), req)
  if (d.nota != null && m.notaMaxima != null && d.nota > m.notaMaxima) throw httpErr(400, `A nota máxima da atividade é ${m.notaMaxima}.`)
  if (!d.devolver && d.nota == null) throw httpErr(400, 'Informe a nota ou devolva para refazer.')
  const upd = await prisma.porEntrega.update({ where: { id: e.id }, data: d.devolver ? { status: 'DEVOLVIDA', feedback: d.feedback, corrigidaPor: getUserId(req), corrigidaEm: new Date() } : { status: 'CORRIGIDA', nota: d.nota, feedback: d.feedback, corrigidaPor: getUserId(req), corrigidaEm: new Date() } })
  // lança no diário quando a atividade está vinculada a um componente de nota
  let lancada = false
  if (!d.devolver && m.componenteId && d.nota != null) {
    const comp = await prisma.ntComponente.findFirst({ where: { id: m.componenteId, tenantId } })
    if (comp) {
      await gravarNota({ tenantId, classSectionId: m.classSectionId, componente: { id: comp.id, notaMaxima: comp.notaMaxima }, studentId: e.studentId, valor: d.nota, origem: 'CORRECAO', motivo: `Atividade "${m.titulo}"`, userId: getUserId(req) })
      lancada = true
    }
  }
  await notify({ tenantId, studentId: e.studentId, assunto: d.devolver ? 'Atividade devolvida para refazer' : 'Atividade corrigida', mensagem: `${m.titulo}${d.nota != null ? ` — nota ${d.nota}` : ''}${d.feedback ? `: ${d.feedback}` : ''}`, refType: 'PorEntrega', refId: e.id }).catch(() => null)
  res.json({ ...upd, lancadaNoDiario: lancada })
}))

// ---- fórum ----
router.get('/turmas/:id/forum', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id))
  const topicos = await prisma.porForumTopico.findMany({ where: { tenantId, classSectionId: sec.id }, orderBy: [{ fixado: 'desc' }, { createdAt: 'desc' }], take: 100 })
  const cont = topicos.length ? await prisma.porForumResposta.groupBy({ by: ['topicoId'], where: { tenantId, topicoId: { in: topicos.map((t) => t.id) } }, _count: true }) : []
  res.json({ itens: topicos.map((t) => ({ ...t, respostas: cont.find((c) => c.topicoId === t.id)?._count ?? 0 })) })
}))

router.post('/turmas/:id/forum', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec, papel, studentId } = await turmaAcesso(req, String(req.params.id))
  const d = bodyOf(z.object({ titulo: z.string().trim().min(3).max(200), corpo: z.string().trim().min(2).max(8000), fixado: z.boolean().optional() }), req)
  const t = await prisma.porForumTopico.create({ data: { tenantId, classSectionId: sec.id, autorUserId: getUserId(req), autorNome: await nomeDe(getUserId(req)), autorPapel: papel, titulo: d.titulo, corpo: d.corpo, fixado: papel !== 'ALUNO' && !!d.fixado } })
  if (studentId) await prisma.porAcesso.create({ data: { tenantId, studentId, classSectionId: sec.id, tipo: 'FORUM' } })
  res.status(201).json(t)
}))

router.get('/forum/:topicoId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await prisma.porForumTopico.findFirst({ where: { id: String(req.params.topicoId), tenantId } })
  if (!t) throw httpErr(404, 'Tópico não encontrado.')
  await turmaAcesso(req, t.classSectionId)
  res.json({ topico: t, respostas: await prisma.porForumResposta.findMany({ where: { tenantId, topicoId: t.id }, orderBy: { createdAt: 'asc' }, take: 500 }) })
}))

router.post('/forum/:topicoId/respostas', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await prisma.porForumTopico.findFirst({ where: { id: String(req.params.topicoId), tenantId } })
  if (!t) throw httpErr(404, 'Tópico não encontrado.')
  if (t.fechado) throw httpErr(409, 'Este tópico está fechado.')
  const { papel } = await turmaAcesso(req, t.classSectionId)
  const d = bodyOf(z.object({ corpo: z.string().trim().min(1).max(8000) }), req)
  res.status(201).json(await prisma.porForumResposta.create({ data: { tenantId, topicoId: t.id, autorUserId: getUserId(req), autorNome: await nomeDe(getUserId(req)), autorPapel: papel, corpo: d.corpo } }))
}))

router.post('/forum/:topicoId/fechar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const t = await prisma.porForumTopico.findFirst({ where: { id: String(req.params.topicoId), tenantId } })
  if (!t) throw httpErr(404, 'Tópico não encontrado.')
  await turmaAcesso(req, t.classSectionId, { soDocente: true })
  res.json(await prisma.porForumTopico.update({ where: { id: t.id }, data: { fechado: req.body?.fechado !== false } }))
}))

// ---- recados à turma ----
router.get('/turmas/:id/recados', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sec } = await turmaAcesso(req, String(req.params.id))
  res.json({ itens: await prisma.porRecado.findMany({ where: { tenantId: sec.tenantId, classSectionId: sec.id }, orderBy: [{ fixado: 'desc' }, { createdAt: 'desc' }], take: 100 }) })
}))

router.post('/turmas/:id/recados', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const d = bodyOf(z.object({ titulo: z.string().trim().min(2).max(160), mensagem: z.string().trim().min(2).max(4000), fixado: z.boolean().optional() }), req)
  const r = await prisma.porRecado.create({ data: { tenantId, classSectionId: sec.id, autorUserId: getUserId(req), autorNome: await nomeDe(getUserId(req)), ...d } })
  await avisarTurma(tenantId, sec.id, `${sec.discipline.nome}: ${d.titulo}`, d.mensagem)
  res.status(201).json(r)
}))

router.delete('/recados/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await prisma.porRecado.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!r) throw httpErr(404, 'Recado não encontrado.')
  await turmaAcesso(req, r.classSectionId, { soDocente: true })
  await prisma.porRecado.delete({ where: { id: r.id } })
  res.json({ ok: true })
}))

// ---- visão geral da sala + controle de progresso/acessos (professor) ----
router.get('/turmas/:id/sala', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec, papel, studentId } = await turmaAcesso(req, String(req.params.id))
  const now = new Date()
  const mats = (await prisma.porMaterial.findMany({ where: { tenantId, classSectionId: sec.id, status: 'PUBLICADO' }, orderBy: [{ inicioEm: 'asc' }, { ordem: 'asc' }] })).filter((m) => visivelAgora(m, now))
  const aulas = mats.filter((m) => m.tipo.startsWith('AULA'))
  const ativs = mats.filter((m) => m.tipo === 'ATIVIDADE')
  const [recados, topicos, prof] = await Promise.all([
    prisma.porRecado.findMany({ where: { tenantId, classSectionId: sec.id }, orderBy: [{ fixado: 'desc' }, { createdAt: 'desc' }], take: 5 }),
    prisma.porForumTopico.count({ where: { tenantId, classSectionId: sec.id } }),
    nomesUsuarios([sec.professorUserId]),
  ])
  let progresso: any = null
  if (papel === 'ALUNO') {
    const [prog, ent, ac] = await Promise.all([
      prisma.porProgresso.findMany({ where: { tenantId, studentId: studentId!, classSectionId: sec.id } }),
      prisma.porEntrega.findMany({ where: { tenantId, studentId: studentId!, classSectionId: sec.id } }),
      prisma.porAcesso.findFirst({ where: { tenantId, studentId: studentId!, classSectionId: sec.id }, orderBy: { createdAt: 'desc' } }),
    ])
    const concl = mats.filter((m) => prog.find((p) => p.materialId === m.id)?.concluido || ent.find((e) => e.materialId === m.id)).length
    progresso = { total: mats.length, concluidos: concl, percentual: pct(concl, mats.length) ?? 0, ultimoAcesso: ac?.createdAt ?? null, pendentes: ativs.filter((a) => !ent.find((e) => e.materialId === a.id)).map((a) => ({ id: a.id, titulo: a.titulo, prazoEntrega: a.prazoEntrega })) }
  }
  res.json({
    turma: { id: sec.id, nome: sec.nome, disciplina: sec.discipline.nome, periodo: sec.term.codigo, professor: prof.get(sec.professorUserId) ?? null },
    aulasGravadas: aulas.filter((a) => a.tipo === 'AULA_GRAVADA'),
    aulasAoVivo: aulas.filter((a) => a.tipo === 'AULA_AO_VIVO').map((a) => ({ ...a, emBreve: !!a.inicioEm && a.inicioEm.getTime() - now.getTime() < DAY && a.inicioEm.getTime() > now.getTime() - (a.duracaoMin ?? 60) * 60000 })),
    atividades: ativs, recados, forumTopicos: topicos, progresso,
  })
}))

router.get('/turmas/:id/progresso', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const [mats, matric, prog, ent, acessos] = await Promise.all([
    prisma.porMaterial.findMany({ where: { tenantId, classSectionId: sec.id, status: 'PUBLICADO' }, select: { id: true, tipo: true } }),
    prisma.classSectionEnrollment.findMany({ where: { classSectionId: sec.id }, select: { enrollment: { select: { student: { select: { id: true, ra: true, nomeCompleto: true } } } } } }),
    prisma.porProgresso.findMany({ where: { tenantId, classSectionId: sec.id } }),
    prisma.porEntrega.findMany({ where: { tenantId, classSectionId: sec.id }, select: { materialId: true, studentId: true } }),
    prisma.porAcesso.groupBy({ by: ['studentId'], where: { tenantId, classSectionId: sec.id }, _count: true, _max: { createdAt: true } }),
  ])
  const itens = matric.map((x) => x.enrollment.student).map((a) => {
    const feitos = new Set([...prog.filter((p) => p.studentId === a.id && p.concluido).map((p) => p.materialId), ...ent.filter((e) => e.studentId === a.id).map((e) => e.materialId)])
    const concl = mats.filter((m) => feitos.has(m.id)).length
    const ac = acessos.find((c) => c.studentId === a.id)
    const dias = ac?._max.createdAt ? Math.floor((Date.now() - ac._max.createdAt.getTime()) / DAY) : null
    return { aluno: a, concluidos: concl, total: mats.length, percentual: pct(concl, mats.length) ?? 0, acessos: ac?._count ?? 0, ultimoAcesso: ac?._max.createdAt ?? null, diasSemAcesso: dias, inativo: dias === null || dias > 7 }
  })
  res.json({ itens, resumo: { alunos: itens.length, inativos: itens.filter((i) => i.inativo).length, mediaPercentual: itens.length ? Math.round(itens.reduce((s, i) => s + i.percentual, 0) / itens.length) : 0 } })
}))

export default router
export { isMgmt, qs }
