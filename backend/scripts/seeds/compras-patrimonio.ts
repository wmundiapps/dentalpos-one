/**
 * Seed de COMPRAS e PATRIMÔNIO: departamentos, fluxo completo de compra (3 cotações, mapa comparativo, exceção formal,
 * aprovação de valor/forma de pagamento, conta a pagar em rascunho, conferência com divergência e devolução),
 * almoxarifado (pontos de reposição, requisição por departamento, inventário), e patrimônio (bens com departamento/local/
 * responsável, galeria de fotos, termos de responsabilidade, transferência com aceite, layouts de etiqueta e inventário por QR).
 * Usa SOMENTE a API e é idempotente (se o departamento "Odontologia" já existe, não duplica nada).
 *
 *   import { seedComprasPatrimonio } from './seeds/compras-patrimonio'
 *   await seedComprasPatrimonio(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * O fluxo exige SEGREGAÇÃO DE FUNÇÕES (quem solicita não aprova; quem é responsável aceita o próprio termo). Por isso
 * `ctx.apiAs(papel)` devolve uma `api` autenticada como outro usuário (SUPPLIES, FACILITIES, COORDINATOR, FINANCE, TEACHER, STAFF).
 * Sem `apiAs` o seed usa `api` para tudo e para onde a segregação impedir (as telas mostram "aguardando aprovação").
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama esta função.
 */
import zlib from 'zlib'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export type Papel = 'SUPPLIES' | 'FACILITIES' | 'COORDINATOR' | 'FINANCE' | 'TEACHER' | 'STAFF' | 'ADMIN'
export interface SeedCtx {
  tenantId?: string
  failures?: string[]
  apiAs?: (papel: Papel) => Promise<SeedApi | null> | SeedApi | null
}

const S = '/edu/suprimentos'
const I = '/edu/infraestrutura'
const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])

export interface ResumoSeedCompras {
  departamentos: number; fornecedores: number; requisicoes: number; cotacoes: number; excecoes: number; compras: number; contasPagarRascunho: number
  conferencias: number; devolucoes: number; pontosReposicao: number; inventariosAlmoxarifado: number
  bens: number; fotos: number; termos: number; transferencias: number; layouts: number; inventariosPatrimonio: number; leituras: number
}

/** PNG sólido 64x64 gerado em memória (sem dependências), para as fotos de demonstração. */
export function pngDemo(r: number, g: number, b: number): Buffer {
  const crc = (buf: Buffer) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const w = 64, h = 64
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const f = 0.6 + 0.4 * (y / h); raw[o] = Math.min(255, r * f + (x % 8 === 0 ? 30 : 0)); raw[o + 1] = Math.min(255, g * f); raw[o + 2] = Math.min(255, b * f) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

export async function seedComprasPatrimonio(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedCompras> {
  const falha = (m: string) => ctx.failures?.push(`seedComprasPatrimonio: ${m}`)
  const r: ResumoSeedCompras = { departamentos: 0, fornecedores: 0, requisicoes: 0, cotacoes: 0, excecoes: 0, compras: 0, contasPagarRascunho: 0, conferencias: 0, devolucoes: 0, pontosReposicao: 0, inventariosAlmoxarifado: 0, bens: 0, fotos: 0, termos: 0, transferencias: 0, layouts: 0, inventariosPatrimonio: 0, leituras: 0 }

  const como = async (papel: Papel): Promise<SeedApi> => (ctx.apiAs ? await ctx.apiAs(papel) : null) ?? api
  const sup = await como('SUPPLIES'), fac = await como('FACILITIES'), coord = await como('COORDINATOR'), fin = await como('FINANCE'), prof = await como('TEACHER'), func = await como('STAFF')
  const admin = await como('ADMIN')

  const deptosExistentes = lst(await sup('GET', `${S}/departamentos?pageSize=100`))
  if (deptosExistentes.some((d: any) => d.codigo === 'ODONTO')) return r   // idempotente

  await sup('POST', `${S}/bootstrap`, {})
  await fac('POST', `${I}/bootstrap`, {})

  // ---------------- departamentos (cada um com o seu centro de custo) ----------------
  const pessoas = lst(await sup('GET', '/edu/core/pessoas'))
  const pessoa = (role: string) => pessoas.find((p: any) => p.role === role)
  const centros = lst(await fin('GET', '/edu/financeiro/cost-centers'))
  const deptos: Record<string, any> = {}
  for (const [codigo, nome] of [['ODONTO', 'Odontologia'], ['FARMA', 'Farmácia'], ['ADM', 'Administração'], ['BIBLIO', 'Biblioteca']]) {
    let cc = centros.find((c: any) => c.nome === `CC ${nome}`)
    if (!cc) cc = await fin('POST', '/edu/financeiro/cost-centers', { nome: `CC ${nome}` })
    const d = await sup('POST', `${S}/departamentos`, { codigo, nome, centroCustoId: cc?.id, responsavelUserId: pessoa('COORDINATOR')?.id })
    if (!d) { falha(`departamento ${nome}`); continue }
    deptos[codigo] = d; r.departamentos++
  }
  if (!deptos.ODONTO) return r

  // ---------------- fornecedores ----------------
  const forn: any[] = []
  for (const [i, nome] of ['Dental Brasil Distribuidora', 'MedLab Comércio de Materiais', 'Odonto Supply Ltda', 'Papelaria Central', 'Toner Express Informática'].entries()) {
    const f = await sup('POST', `${S}/fornecedores`, { razaoSocial: nome, cnpj: `1234567800${String(1000 + i)}`, prazoPagamentoDias: 30, email: `contato${i}@exemplo.com.br`, categorias: ['material odontológico'] })
    if (f) { forn.push(f); r.fornecedores++ }
  }
  if (forn.length < 5) { falha('fornecedores incompletos'); return r }
  const itens = lst(await sup('GET', `${S}/itens?pageSize=100`))
  const item = (cod: string) => itens.find((i: any) => i.codigo === cod)
  const almox = lst(await sup('GET', `${S}/almoxarifados`))
  const central = almox.find((a: any) => a.codigo === 'CENTRAL')
  const luva = item('EPI-LUVA-M'), toner = item('TI-TONER'), a4 = item('ESC-A4'), alcool = item('LAB-ALCOOL70')
  if (!central || !luva || !toner || !a4 || !alcool) { falha('catálogo do bootstrap incompleto'); return r }

  // helper: requisição do departamento, enviada e aprovada pela alçada
  async function requisicao(depto: string, itensReq: Array<{ itemId: string; quantidade: number }>, justificativa: string) {
    const rq = await prof('POST', `${S}/requisicoes`, { departamentoId: deptos[depto].id, justificativa, itens: itensReq })
    if (!rq) { falha(`requisição ${depto}`); return null }
    r.requisicoes++
    await prof('POST', `${S}/requisicoes/${rq.id}/enviar`, {})
    for (const quem of [coord, fin, admin]) {
      const g = await sup('GET', `${S}/requisicoes/${rq.id}`)
      if (g?.status === 'APROVADA') break
      await quem('POST', `${S}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })
    }
    return sup('GET', `${S}/requisicoes/${rq.id}`)
  }
  async function cotar(rq: any, fornecedores: any[], precos: number[]) {
    const cot = await sup('POST', `${S}/requisicoes/${rq.id}/cotacoes`, { fornecedorIds: fornecedores.map((f) => f.id), prazoResposta: dia(5) })
    if (!cot) { falha('cotação'); return null }
    r.cotacoes++
    for (let i = 0; i < fornecedores.length; i++) {
      if (precos[i] == null) continue
      await sup('PUT', `${S}/cotacoes/${cot.id}/propostas/${fornecedores[i].id}`, { frete: 20 * i, prazoEntregaDias: 4 + i * 2, parcelas: 1, precos: rq.itens.map((it: any) => ({ requisicaoItemId: it.id, precoUnitario: precos[i] * (it.descricao.includes('Luva') ? 1 : 1) })) })
    }
    return cot
  }

  // ---------------- compra 1: fluxo completo (3 cotações -> aprovação -> rascunho de conta a pagar -> conferência) ----------------
  const rq1 = await requisicao('ODONTO', [{ itemId: luva.id, quantidade: 120 }, { itemId: alcool.id, quantidade: 100 }], 'Material de consumo da clínica odontológica — semestre')
  if (rq1) {
    const cot1 = await cotar(rq1, forn.slice(0, 3), [44, 41.5, 43])
    if (cot1) {
      await sup('POST', `${S}/cotacoes/${cot1.id}/encerrar`, {})
      const compra = await sup('POST', `${S}/compras`, { cotacaoId: cot1.id, formaPagamento: 'PARCELADO', parcelas: 3, intervaloParcelasDias: 30, observacao: 'Pagamento em 3x no boleto' })
      if (compra) {
        r.compras++
        await coord('POST', `${S}/compras/${compra.id}/decidir`, { decisao: 'APROVADO' })
        const ap = await fin('POST', `${S}/compras/${compra.id}/decidir`, { decisao: 'APROVADO', parecer: 'Dentro do orçamento do departamento' })
        r.contasPagarRascunho += ap?.contasPagar?.contas?.length ?? 0
        const ped = await sup('POST', `${S}/cotacoes/${cot1.id}/gerar-pedido`, { almoxarifadoId: central.id, parcelas: 3 })
        if (ped) {
          await sup('POST', `${S}/pedidos/${ped.id}/emitir`, {})
          const pLuva = ped.itens.find((i: any) => i.itemId === luva.id), pAlc = ped.itens.find((i: any) => i.itemId === alcool.id)
          // conferência 1: chegou menos, com caixas amassadas e preço da nota acima do pedido
          const conf = await sup('POST', `${S}/conferencias`, { pedidoId: ped.id, notaFiscal: 'NF-45872', valorNota: 9300, itens: [
            { pedidoItemId: pLuva.id, quantidadeNota: 120, quantidadeContada: 112, precoNota: 43.2, qualidadeOk: false, qualidadeObs: '8 caixas amassadas com lacre violado', loteNumero: 'LT-2026-10', validade: dia(540) },
            { pedidoItemId: pAlc.id, quantidadeNota: 100, quantidadeContada: 100, precoNota: pAlc.precoUnitario, loteNumero: 'AL-778', validade: dia(300) },
          ] })
          if (conf) {
            r.conferencias++
            const divLuva = conf.itens.find((i: any) => i.pedidoItemId === pLuva.id)
            const fim = await sup('POST', `${S}/conferencias/${conf.id}/finalizar`, { justificativa: 'Aceite parcial: devolver caixas amassadas.', decisoes: [{ itemId: divLuva.id, decisao: 'ACEITE_PARCIAL', quantidadeAceita: 104, destinoRejeitado: 'DEVOLVER', motivo: '8 caixas amassadas' }] })
            r.devolucoes += fim?.devolucoes?.length ?? 0
          }
        }
      }
    }
  }

  // ---------------- compra 2: fornecedor único (exceção formal aprovada) e compra aguardando aprovação ----------------
  const rq2 = await requisicao('ADM', [{ itemId: toner.id, quantidade: 6 }], 'Toners homologados das impressoras da secretaria')
  if (rq2) {
    const cot2 = await cotar(rq2, [forn[4]], [279])
    const exc = await sup('POST', `${S}/excecoes-cotacao`, { requisicaoId: rq2.id, motivo: 'FORNECEDOR_UNICO', justificativa: 'Único distribuidor autorizado dos toners homologados (garantia do fabricante das impressoras do campus).', valorEstimado: rq2.valorEstimado, fornecedorSugeridoId: forn[4].id })
    if (exc) {
      r.excecoes++
      await (exc.papelAprovador === 'FINANCE' ? fin : coord)('POST', `${S}/excecoes-cotacao/${exc.id}/decidir`, { decisao: 'APROVADA', parecer: 'Exclusividade comprovada' })
      if (cot2) {
        await sup('POST', `${S}/cotacoes/${cot2.id}/encerrar`, { justificativa: 'Exceção aprovada: fornecedor único dos toners homologados.' })
        const compra = await sup('POST', `${S}/compras`, { cotacaoId: cot2.id, formaPagamento: 'PIX' })
        if (compra) r.compras++   // fica aguardando a aprovação na tela de Aprovações
      }
    }
  }

  // ---------------- cotação bloqueada: só 2 propostas (demonstra a exigência de 3) ----------------
  const rq3 = await requisicao('BIBLIO', [{ itemId: a4.id, quantidade: 200 }], 'Papel A4 para impressão da biblioteca')
  if (rq3) await cotar(rq3, forn.slice(2, 4), [26.5, 25.9])

  // ---------------- almoxarifado: pontos de reposição, requisição por departamento e inventário ----------------
  for (const [it, min, pp, max] of [[luva, 20, 40, 150], [alcool, 30, 60, 200], [a4, 50, 90, 400]] as Array<[any, number, number, number]>) {
    if (await sup('PUT', `${S}/almoxarifado/pontos-reposicao`, { almoxarifadoId: central.id, itemId: it.id, minimo: min, pontoPedido: pp, maximo: max })) r.pontosReposicao++
  }
  await sup('POST', `${S}/estoque/movimentacoes`, { tipo: 'ENTRADA', itemId: a4.id, almoxarifadoId: central.id, quantidade: 45, custoUnitario: 26.9 })
  const rin = await prof('POST', `${S}/requisicoes`, { departamentoId: deptos.FARMA.id, tipo: 'INSUMO', almoxarifadoId: central.id, justificativa: 'Álcool 70% para o laboratório de Farmácia', itens: [{ itemId: alcool.id, quantidade: 12 }] })
  if (rin) {
    r.requisicoes++
    await prof('POST', `${S}/requisicoes/${rin.id}/enviar`, {})
    await coord('POST', `${S}/requisicoes/${rin.id}/decidir`, { decisao: 'APROVADO' })
    await sup('POST', `${S}/requisicoes/${rin.id}/atender-estoque`, { parcial: true })
  }
  if (await sup('POST', `${S}/inventarios`, { almoxarifadoId: central.id, tipo: 'GERAL', observacao: 'Inventário geral (contagem cega) — demonstração' })) r.inventariosAlmoxarifado++

  // ---------------- patrimônio: locais, layouts e bens ----------------
  const espacos = lst(await fac('GET', '/edu/core/espacos?pageSize=100'))
  const mkEspaco = async (codigo: string, nome: string, bloco: string, andar: string, tipo: string) => espacos.find((e: any) => e.codigo === codigo) ?? (await fac('POST', '/edu/core/espacos', { codigo, nome, tipo, bloco, andar, capacidade: 30 }))
  const lab = await mkEspaco('CPP-B-LAB1', 'Laboratório Odontológico 1', 'B', '1', 'LABORATORIO')
  const clinica = await mkEspaco('CPP-B-CLI1', 'Clínica Escola', 'B', '2', 'LABORATORIO')
  const sala = await mkEspaco('CPP-A-S101', 'Sala 101', 'A', '1', 'SALA_AULA')
  const secretaria = await mkEspaco('CPP-A-SEC', 'Secretaria Acadêmica', 'A', '0', 'ADMINISTRATIVO')
  if (await fac('POST', `${I}/etiquetas/layouts-predefinidos/instalar`, {})) r.layouts = 4
  const cats = lst(await fac('GET', `${I}/categorias-bem?pageSize=100`))
  const cat = (cod: string) => cats.find((c: any) => c.codigo === cod)
  const respProf = pessoa('TEACHER'), respFunc = pessoa('STAFF') ?? pessoa('SECRETARY')
  const bensDef: Array<[string, string, string, number, any, any?]> = [
    ['Cadeira odontológica completa com refletor', 'CADEIRA-ODONTO', 'ODONTO', 18500, clinica, respProf],
    ['Cadeira odontológica completa com refletor (2)', 'CADEIRA-ODONTO', 'ODONTO', 18500, clinica, respProf],
    ['Autoclave horizontal 21 L', 'AUTOCLAVE', 'ODONTO', 7200, lab, respProf],
    ['Microscópio binocular Olympus CX23', 'MICROSCOPIO', 'FARMA', 5400, lab, respProf],
    ['Microscópio binocular Olympus CX23 (2)', 'MICROSCOPIO', 'FARMA', 5400, lab, respProf],
    ['Balança analítica 220 g', 'BALANCA', 'FARMA', 4300, lab],
    ['Projetor Epson PowerLite', 'PROJETOR', 'ADM', 3900, sala, respFunc],
    ['Notebook Dell Latitude 5440', 'COMPUTADOR', 'ADM', 6100, secretaria, respFunc],
    ['Notebook Dell Latitude 5440 (2)', 'COMPUTADOR', 'ADM', 6100, secretaria, respFunc],
    ['Ar-condicionado split 24.000 BTU', 'AR-COND', 'ADM', 4800, sala],
    ['Manequim odontológico para simulação', 'MANEQUIM', 'ODONTO', 2600, lab, respProf],
    ['Servidor de arquivos Dell PowerEdge', 'SERVIDOR', 'ADM', 21000, secretaria, respFunc],
  ]
  const bens: any[] = []
  for (const [descricao, c, dep, valor, esp, resp] of bensDef) {
    const b = await fac('POST', `${I}/bens`, { descricao, categoriaId: cat(c)?.id, valorAquisicao: valor, dataAquisicao: dia(-420), spaceId: esp?.id, departamentoId: deptos[dep].id, responsavelUserId: resp?.id, marca: 'Demonstração', numeroSerie: `SN-${Math.floor(Math.random() * 1e6)}` })
    if (b) { bens.push(b); r.bens++ } else falha(`bem ${descricao}`)
  }
  // galeria: 2-3 fotos nos primeiros bens
  const cores: Array<[number, number, number]> = [[60, 120, 200], [200, 90, 60], [70, 170, 110], [180, 150, 60], [130, 80, 170]]
  for (const [bi, b] of bens.slice(0, 4).entries()) {
    for (let k = 0; k < 2 + (bi % 2); k++) {
      const [cr, cg, cb] = cores[(bi + k) % cores.length]
      const foto = await fac('POST', `${I}/bens/${b.id}/fotos`, { nome: `${b.tombamento}-${k + 1}.png`, dataUrl: `data:image/png;base64,${pngDemo(cr + k * 7, cg, cb + bi * 9).toString('base64')}`, legenda: ['Vista frontal', 'Detalhe da etiqueta', 'Plaqueta de série'][k] })
      if (foto) r.fotos++
    }
  }
  // termos de responsabilidade: aceita pelo próprio responsável quando temos a sessão dele
  for (const b of bens.filter((x) => x.responsavelUserId).slice(0, 5)) {
    const t = await fac('POST', `${I}/bens/${b.id}/termos`, {})
    if (!t) continue
    r.termos++
    const dono = b.responsavelUserId === respProf?.id ? prof : b.responsavelUserId === respFunc?.id ? func : null
    if (dono && dono !== fac) await dono('POST', `${I}/termos/${t.id}/aceitar`, { confirmo: true })
  }
  // transferência aguardando aceite do novo responsável
  if (bens[5] && respFunc && sala) {
    const tr = await fac('POST', `${I}/transferencias`, { bemId: bens[5].id, destinoSpaceId: sala.id, destinoDepartamentoId: deptos.ADM.id, destinoResponsavelId: respFunc.id, motivo: 'Balança será usada na sala de aula prática de Administração Farmacêutica' })
    if (tr) r.transferencias++
  }
  if (bens[9] && secretaria) {
    const tr = await fac('POST', `${I}/transferencias`, { bemId: bens[9].id, destinoSpaceId: secretaria.id, motivo: 'Ar-condicionado realocado para a secretaria' })
    if (tr) r.transferencias++
  }
  // inventário físico por QR no Laboratório: leituras parciais
  if (lab) {
    const inv = await fac('POST', `${I}/inventarios`, { titulo: 'Inventário do Laboratório Odontológico 1 (QR)', spaceId: lab.id })
    if (inv) {
      r.inventariosPatrimonio++
      const noLab = bens.filter((b) => b.spaceId === lab.id)
      for (const b of noLab.slice(0, Math.max(1, noLab.length - 1))) {
        if (await fac('POST', `${I}/inventarios/${inv.id}/leitura`, { payload: `EDU:BEM:${b.tombamento}` })) r.leituras++
      }
      if (await fac('POST', `${I}/inventarios/${inv.id}/leitura`, { payload: 'EDU:BEM:PAT-SEM-CADASTRO' })) r.leituras++
    }
  }
  return r
}
