import { NextFunction, Response, Router } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { CARGOS, CARGOS_EDITORES, CARGOS_SUPER, ESTADOS, MODULOS, cargoValido, ehEssencial, ehSuper, moduloValido } from './catalogo'
import { estadoDe, invalidarCacheAcesso, regrasDoTenant } from './regras'

// Matriz de acesso por cargo — /api/edu/acesso. Ver README.md deste diretório.
const router = Router()
const bad = (m: string, status = 400) => Object.assign(new Error(m), { status })

function exigirEditor(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const role = String(req.user?.role || '').toUpperCase()
  if (!CARGOS_EDITORES.includes(role)) return next(bad('Somente administrador ou proprietário altera o acesso por cargo.', 403))
  next()
}

async function nomeDe(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } }).catch(() => null)
  return u ? ([u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email || null) : null
}

router.get('/catalogo', requireRole(), asyncHandler(async (_req, res) => {
  res.json({
    cargos: CARGOS.map((c) => ({ ...c, super: ehSuper(c.cargo) })),
    modulos: MODULOS.map((m) => ({ ...m, essencial: ehEssencial(m.modulo) })),
    estados: ESTADOS,
    cargosSuper: CARGOS_SUPER,
    editores: CARGOS_EDITORES,
  })
}))

router.get('/matriz', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = getTenantId(req)
  const regras = await prisma.acsRegra.findMany({ where: { tenantId }, orderBy: [{ cargo: 'asc' }, { modulo: 'asc' }] })
  res.json({
    regras: regras.map((r) => ({ cargo: r.cargo, modulo: r.modulo, estado: r.estado, alteradoPor: r.alteradoPor, alteradoPorNome: r.alteradoPorNome, alteradoEm: r.updatedAt })),
    totais: { bloqueios: regras.filter((r) => r.estado === 'BLOQUEAR').length, concessoes: regras.filter((r) => r.estado === 'PERMITIR').length },
    podeEditar: CARGOS_EDITORES.includes(String(req.user?.role || '').toUpperCase()),
  })
}))

// Salva uma ou várias células: { cargo, modulo, estado } ou { alteracoes: [{ cargo, modulo, estado }] }.
router.put('/regras', exigirEditor, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  const bruto: any[] = Array.isArray(req.body?.alteracoes) ? req.body.alteracoes : req.body && req.body.cargo ? [req.body] : []
  if (!bruto.length) throw bad('Informe cargo, módulo e estado (ou uma lista em "alteracoes").')
  if (bruto.length > 600) throw bad('Máximo de 600 alterações por chamada.')
  const final = new Map<string, { cargo: string; modulo: string; estado: string }>()
  for (const [i, a] of bruto.entries()) {
    const cargo = String(a?.cargo || '').toUpperCase()
    const modulo = String(a?.modulo || '').toLowerCase()
    const estado = String(a?.estado || '').toUpperCase()
    const pos = bruto.length > 1 ? ` (item ${i + 1})` : ''
    if (!cargoValido(cargo)) throw bad(`Cargo inválido: ${cargo || 'vazio'}${pos}.`)
    if (!moduloValido(modulo)) throw bad(`Módulo inválido: ${modulo || 'vazio'}${pos}.`)
    if (!(ESTADOS as readonly string[]).includes(estado)) throw bad(`Estado inválido: ${estado || 'vazio'}. Use PADRAO, PERMITIR ou BLOQUEAR${pos}.`)
    if (estado !== 'PADRAO' && ehSuper(cargo)) throw bad(`O cargo ${cargo} tem acesso total e não pode ser bloqueado nem receber regra${pos}.`)
    if (estado !== 'PADRAO' && ehEssencial(modulo)) throw bad(`O módulo "${modulo}" é essencial ao sistema e não pode ser bloqueado nem receber regra${pos}.`)
    final.set(`${cargo}|${modulo}`, { cargo, modulo, estado })
  }
  const lista = [...final.values()]
  const atuais = await prisma.acsRegra.findMany({ where: { tenantId, OR: lista.map((l) => ({ cargo: l.cargo, modulo: l.modulo })) } })
  const mapa = new Map(atuais.map((r) => [`${r.cargo}|${r.modulo}`, r.estado]))
  const mudou = lista.filter((l) => (mapa.get(`${l.cargo}|${l.modulo}`) ?? 'PADRAO') !== l.estado)
  const nome = await nomeDe(userId)
  if (mudou.length) {
    await prisma.$transaction(mudou.map((l) => prisma.acsRegra.upsert({
      where: { tenantId_cargo_modulo: { tenantId, cargo: l.cargo, modulo: l.modulo } },
      create: { tenantId, cargo: l.cargo, modulo: l.modulo, estado: l.estado, alteradoPor: userId, alteradoPorNome: nome },
      update: { estado: l.estado, alteradoPor: userId, alteradoPorNome: nome },
    })))
    invalidarCacheAcesso(tenantId)
    for (const l of mudou) {
      await audit({ tenantId, userId, modulo: 'acesso', acao: 'REGRA_ALTERADA', refType: 'AcsRegra', refId: `${l.cargo}:${l.modulo}`, detalhes: { cargo: l.cargo, modulo: l.modulo, de: mapa.get(`${l.cargo}|${l.modulo}`) ?? 'PADRAO', para: l.estado } })
    }
  }
  res.json({ alteradas: mudou.length, semMudanca: lista.length - mudou.length })
}))

// Volta tudo (ou só um cargo) ao comportamento padrão.
router.post('/restaurar-padrao', exigirEditor, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = getTenantId(req)
  const userId = getUserId(req)
  const cargo = req.body?.cargo ? String(req.body.cargo).toUpperCase() : undefined
  if (cargo && !cargoValido(cargo)) throw bad(`Cargo inválido: ${cargo}.`)
  const alvo = await prisma.acsRegra.findMany({ where: { tenantId, estado: { not: 'PADRAO' }, ...(cargo ? { cargo } : {}) }, select: { cargo: true, modulo: true, estado: true } })
  if (alvo.length) {
    await prisma.acsRegra.updateMany({ where: { tenantId, estado: { not: 'PADRAO' }, ...(cargo ? { cargo } : {}) }, data: { estado: 'PADRAO', alteradoPor: userId, alteradoPorNome: await nomeDe(userId) } })
    invalidarCacheAcesso(tenantId)
  }
  await audit({ tenantId, userId, modulo: 'acesso', acao: 'MATRIZ_RESTAURADA', refType: 'AcsRegra', refId: cargo ?? 'TODOS', detalhes: { cargo: cargo ?? 'TODOS', regrasRemovidas: alvo.length, anteriores: alvo.slice(0, 200) } })
  res.json({ restauradas: alvo.length })
}))

// Módulos efetivos do usuário logado (o menu lateral esconde os bloqueados).
router.get('/meus-modulos', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = getTenantId(req)
  const cargo = String(req.user?.role || '').toUpperCase()
  const regras = await regrasDoTenant(tenantId)
  const bloqueados: string[] = []
  const permitidos: string[] = []
  for (const m of MODULOS) {
    const e = estadoDe(regras, cargo, m.modulo)
    if (e === 'BLOQUEAR') bloqueados.push(m.modulo)
    else if (e === 'PERMITIR') permitidos.push(m.modulo)
  }
  res.json({ cargo, super: ehSuper(cargo), bloqueados, permitidos })
}))

// "O que este cargo vê": estado efetivo de cada módulo para um cargo.
router.get('/previa/:cargo', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = getTenantId(req)
  const cargo = String(req.params.cargo || '').toUpperCase()
  if (!cargoValido(cargo)) throw bad(`Cargo inválido: ${cargo}.`, 404)
  const regras = await regrasDoTenant(tenantId)
  const modulos = MODULOS.map((m) => {
    const regra = estadoDe(regras, cargo, m.modulo)
    const efetivo = ehSuper(cargo) || ehEssencial(m.modulo) ? 'LIBERADO' : regra === 'BLOQUEAR' ? 'BLOQUEADO' : regra === 'PERMITIR' ? 'LIBERADO_POR_REGRA' : 'PADRAO'
    return { ...m, regra, efetivo }
  })
  res.json({
    cargo,
    nome: CARGOS.find((c) => c.cargo === cargo)?.nome,
    super: ehSuper(cargo),
    modulos,
    resumo: { bloqueados: modulos.filter((m) => m.efetivo === 'BLOQUEADO').length, liberadosPorRegra: modulos.filter((m) => m.efetivo === 'LIBERADO_POR_REGRA').length, padrao: modulos.filter((m) => m.efetivo === 'PADRAO').length },
    aviso: 'PADRAO = segue as regras próprias de cada tela (um cargo pode ter acesso a parte do módulo e não a outras).',
  })
}))

// Histórico de alterações (auditoria).
router.get('/historico', requireRole(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenantId = getTenantId(req)
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30))
  const where = { tenantId, modulo: 'acesso' }
  const [total, rows] = await Promise.all([
    prisma.eduAuditEvent.count({ where }),
    prisma.eduAuditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ])
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])]
  const us = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, firstName: true, lastName: true } }) : []
  const nomes = new Map(us.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ')]))
  res.json({ items: rows.map((r) => ({ id: r.id, acao: r.acao, quem: r.userId ? nomes.get(r.userId) ?? null : null, quando: r.createdAt, detalhes: r.detalhes })), total, page, pageSize })
}))

export default router
