import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'

// Catálogos padrão para uma IES brasileira. Idempotente (só cria o que não existe).
const CATEGORIAS = [
  'Material de consumo laboratorial', 'Reagentes e químicos', 'EPI e biossegurança', 'Material de escritório e papelaria', 'Limpeza e higiene',
  'Informática e suprimentos de TI', 'Material didático e livros', 'Uniformes e vestuário', 'Cantina e alimentos', 'Manutenção predial', 'Material odontológico e de saúde',
]
const ALMOXARIFADOS = [
  { codigo: 'CENTRAL', nome: 'Almoxarifado Central' },
  { codigo: 'LAB', nome: 'Almoxarifado de Laboratórios' },
  { codigo: 'LOJA', nome: 'Estoque da Loja/Papelaria' },
]
const ALCADAS = [
  { nivel: 1, valorMinimo: 0, papel: 'COORDINATOR', descricao: 'Coordenação/chefia imediata — qualquer valor' },
  { nivel: 2, valorMinimo: 2000, papel: 'FINANCE', descricao: 'Financeiro — a partir de R$ 2.000' },
  { nivel: 3, valorMinimo: 10000, papel: 'RECTOR', descricao: 'Reitoria/Direção — a partir de R$ 10.000' },
]
const ITENS: Array<{ codigo: string; nome: string; cat: string; un: string; min: number; max: number; lead: number; preco: number; lote?: boolean; val?: boolean }> = [
  { codigo: 'EPI-LUVA-M', nome: 'Luva de procedimento nitrílica M (cx 100)', cat: 'EPI e biossegurança', un: 'CX', min: 20, max: 120, lead: 7, preco: 42, lote: true, val: true },
  { codigo: 'EPI-MASC', nome: 'Máscara cirúrgica descartável (cx 50)', cat: 'EPI e biossegurança', un: 'CX', min: 20, max: 100, lead: 7, preco: 18, lote: true, val: true },
  { codigo: 'EPI-JALECO', nome: 'Jaleco branco de laboratório', cat: 'EPI e biossegurança', un: 'UN', min: 10, max: 60, lead: 15, preco: 79.9 },
  { codigo: 'LAB-ALCOOL70', nome: 'Álcool 70% (1 L)', cat: 'Limpeza e higiene', un: 'L', min: 30, max: 200, lead: 5, preco: 9.5, lote: true, val: true },
  { codigo: 'LAB-PIPETA', nome: 'Ponteira de pipeta 200 µL (pct 1000)', cat: 'Material de consumo laboratorial', un: 'PCT', min: 10, max: 60, lead: 10, preco: 55 },
  { codigo: 'LAB-LAMINA', nome: 'Lâmina de microscopia (cx 50)', cat: 'Material de consumo laboratorial', un: 'CX', min: 10, max: 50, lead: 10, preco: 14 },
  { codigo: 'ESC-A4', nome: 'Papel A4 75g (resma 500 fls)', cat: 'Material de escritório e papelaria', un: 'RM', min: 50, max: 400, lead: 5, preco: 26.9 },
  { codigo: 'ESC-CANETA', nome: 'Caneta esferográfica azul', cat: 'Material de escritório e papelaria', un: 'UN', min: 100, max: 800, lead: 5, preco: 1.4 },
  { codigo: 'TI-TONER', nome: 'Toner para impressora laser', cat: 'Informática e suprimentos de TI', un: 'UN', min: 4, max: 20, lead: 7, preco: 289 },
]

export function registerBootstrap(router: Router) {
  router.post('/bootstrap', requireRole('SUPPLIES', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = { categorias: 0, almoxarifados: 0, alcadas: 0, itens: 0 }
    const catIds = new Map<string, string>()
    for (const nome of CATEGORIAS) {
      const ex = await prisma.supCategoria.findUnique({ where: { tenantId_nome: { tenantId, nome } } })
      const c = ex ?? (await prisma.supCategoria.create({ data: { tenantId, nome } }))
      if (!ex) r.categorias++
      catIds.set(nome, c.id)
    }
    for (const a of ALMOXARIFADOS) {
      const ex = await prisma.supAlmoxarifado.findUnique({ where: { tenantId_codigo: { tenantId, codigo: a.codigo } } })
      if (!ex) { await prisma.supAlmoxarifado.create({ data: { tenantId, ...a } }); r.almoxarifados++ }
    }
    for (const a of ALCADAS) {
      const ex = await prisma.supAlcada.findUnique({ where: { tenantId_nivel: { tenantId, nivel: a.nivel } } })
      if (!ex) { await prisma.supAlcada.create({ data: { tenantId, ...a } }); r.alcadas++ }
    }
    for (const i of ITENS) {
      const ex = await prisma.supItem.findUnique({ where: { tenantId_codigo: { tenantId, codigo: i.codigo } } })
      if (!ex) {
        await prisma.supItem.create({ data: { tenantId, codigo: i.codigo, nome: i.nome, categoriaId: catIds.get(i.cat), unidade: i.un, estoqueMinimo: i.min, estoqueMaximo: i.max, leadTimeDias: i.lead, precoReferencia: i.preco, controlaLote: !!i.lote, controlaValidade: !!i.val } })
        r.itens++
      }
    }
    await audit({ tenantId, userId: getUserId(req), modulo: 'suprimentos', acao: 'BOOTSTRAP', detalhes: r })
    res.json({ ok: true, criados: r })
  }))
}
