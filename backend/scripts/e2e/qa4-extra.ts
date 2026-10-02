import { prisma } from '../../src/lib/prisma'
import { setup, check, summary, acadFixture, tokenCall } from './qa4-lib'

async function main() {
  const c = await setup()
  const { call, tenantId } = c
  const S = '/edu/suprimentos', D = '/edu/desempenho', B = '/edu/biblioteca'
  const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
  await call('SUPPLIES', 'POST', `${S}/bootstrap`, {})
  const alm = (await call('SUPPLIES', 'GET', `${S}/almoxarifados`)).json.items[0]
  const item = (await call('SUPPLIES', 'GET', `${S}/itens?pageSize=100`)).json.items.find((i: any) => i.codigo === 'ESC-A4')
  const f1 = (await call('SUPPLIES', 'POST', `${S}/fornecedores`, { razaoSocial: 'Papelaria A', cnpj: '11222333000181' })).json
  const f2 = (await call('SUPPLIES', 'POST', `${S}/fornecedores`, { razaoSocial: 'Papelaria B' })).json

  console.log('# pedidos diretos')
  const ped = (b: any = {}) => ({ fornecedorId: f1.id, almoxarifadoId: alm.id, parcelas: 2, itens: [{ itemId: item.id, quantidade: 10, precoUnitario: 20 }], ...b })
  check((await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ fornecedorId: 'zz' }))).status === 404, 'pedido fornecedor inexistente 404')
  check((await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ fornecedorId: f1.id }), true)).status === 404, 'pedido fornecedor outro tenant 404')
  check((await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ itens: [] }))).status === 400, 'pedido sem itens 400')
  check((await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ itens: [{ itemId: item.id, quantidade: -1, precoUnitario: 1 }] }))).status === 400, 'qtd negativa 400')
  check((await call('FINANCE', 'POST', `${S}/pedidos`, ped())).status === 403, 'financeiro não cria pedido')
  let r = await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ frete: 20 }))
  check(r.status === 201 && r.json.valorTotal === 220, 'pedido 220', r.json)
  const p1 = r.json
  await call('SUPPLIES', 'POST', `${S}/fornecedor-documentos`, { fornecedorId: f1.id, tipo: 'CND', validade: iso(-3) })
  r = await call('SUPPLIES', 'POST', `${S}/pedidos/${p1.id}/emitir`, {})
  check(r.status === 409, 'emitir com documento vencido 409', r)
  r = await call('SUPPLIES', 'POST', `${S}/pedidos/${p1.id}/emitir?forcar=true`, {})
  check(r.status === 409, 'SUPPLIES não força emissão 409')
  r = await call('FINANCE', 'POST', `${S}/pedidos/${p1.id}/emitir?forcar=true`, {})
  check(r.status === 403, 'FINANCE sem GESTAO 403 na emissão')
  r = await call('ADMIN', 'POST', `${S}/pedidos/${p1.id}/emitir?forcar=true`, {})
  check(r.status === 200, 'ADMIN força emissão', r)
  // recebimento parcial com rejeição + frete rateado + 2 parcelas
  r = await call('SUPPLIES', 'POST', `${S}/pedidos/${p1.id}/receber`, { notaFiscal: 'NF9', itens: [{ pedidoItemId: p1.itens[0].id, quantidadeRecebida: 4, quantidadeRejeitada: 1, motivoRejeicao: 'amassado' }] })
  check(r.status === 201 && r.json.statusPedido === 'PARCIALMENTE_RECEBIDO', 'receber parcial', r.json)
  console.log('  valor recebimento', r.json?.valor, 'AP ids', r.json?.contasPagarIds?.length)
  check(Math.abs(r.json.valor - 88) < 0.01, 'valor do recebimento = 4*20 + frete proporcional (8) = 88', r.json.valor)
  const sd = await prisma.supSaldo.findFirst({ where: { itemId: item.id, almoxarifadoId: alm.id } })
  check(sd?.quantidade === 4 && Math.abs(sd.custoMedio - 22) < 0.01, 'saldo 4 a custo 22 (frete 10% rateado)', sd)
  check((await call('SUPPLIES', 'POST', `${S}/pedidos/${p1.id}/cancelar`, {})).status === 409, 'cancelar parcial 409')
  r = await call('SUPPLIES', 'POST', `${S}/pedidos/${p1.id}/encerrar-saldo`, {})
  check(r.status === 200, 'encerrar saldo', r)
  check((await call('SUPPLIES', 'POST', `${S}/pedidos/${p1.id}/receber`, { itens: [{ pedidoItemId: p1.itens[0].id, quantidadeRecebida: 1 }] })).status === 409, 'receber pedido encerrado 409')
  // cancelar pedido emitido
  const p2 = (await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ fornecedorId: f2.id }))).json
  await call('SUPPLIES', 'POST', `${S}/pedidos/${p2.id}/emitir`, {})
  check((await call('SUPPLIES', 'POST', `${S}/pedidos/${p2.id}/cancelar`, {})).status === 200, 'cancelar emitido')
  check((await call('SUPPLIES', 'POST', `${S}/pedidos/${p2.id}/cancelar`, {})).status === 409, 'cancelar de novo 409')
  // fornecedor bloqueado
  const p3 = (await call('SUPPLIES', 'POST', `${S}/pedidos`, ped({ fornecedorId: f2.id }))).json
  await call('SUPPLIES', 'PATCH', `${S}/fornecedores/${f2.id}`, { status: 'BLOQUEADO' })
  check((await call('SUPPLIES', 'POST', `${S}/pedidos/${p3.id}/emitir`, {})).status === 409, 'fornecedor bloqueado não emite 409')

  console.log('# alçada de 3 níveis e RBAC de requisição')
  const cc = await prisma.eduCostCenter.create({ data: { tenantId, nome: 'CC' } })
  const rq = (await call('TEACHER', 'POST', `${S}/requisicoes`, { centroCustoId: cc.id, itens: [{ descricao: 'Equipamento caro', quantidade: 1, precoEstimado: 15000 }] })).json
  check(rq.valorEstimado === 15000, 'req 15000')
  await call('TEACHER', 'POST', `${S}/requisicoes/${rq.id}/enviar`, {})
  const g = (await call('TEACHER', 'GET', `${S}/requisicoes/${rq.id}`)).json
  check(g.aprovacoes.length === 3, '3 níveis (R$15k)', g.aprovacoes?.map((a: any) => a.papel))
  check((await call('SECRETARY', 'GET', `${S}/requisicoes/${rq.id}`)).status === 403, 'secretária não acessa requisição (papel sem permissão)')
  check((await call('STAFF', 'GET', `${S}/requisicoes/${rq.id}`)).status === 403, 'outro solicitante não vê requisição alheia')
  check((await call('STAFF', 'GET', `${S}/requisicoes`)).json.items.length === 0, 'listagem filtrada por solicitante')
  check((await call('COORDINATOR', 'POST', `${S}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })).status === 200, 'nível 1')
  check((await call('COORDINATOR', 'POST', `${S}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })).status === 403, 'coord não decide nível 2')
  check((await call('FINANCE', 'POST', `${S}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })).status === 200, 'nível 2')
  check((await call('FINANCE', 'POST', `${S}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })).status === 403, 'financeiro não decide nível 3')
  const pend = await call('ADMIN', 'GET', `${S}/requisicoes?pendentesMinhaAprovacao=true`)
  check(pend.status === 200 && pend.json.items.length === 1, 'pendentes minha aprovação (admin)')
  check((await call('ADMIN', 'POST', `${S}/requisicoes/${rq.id}/decidir`, { decisao: 'APROVADO' })).status === 200, 'nível 3 pelo admin')
  check((await call('TEACHER', 'POST', `${S}/requisicoes/${rq.id}/cancelar`, {})).status === 200, 'cancelar aprovada')
  // aprovar duas vezes concorrente (mesmo nível)
  const rq2 = (await call('TEACHER', 'POST', `${S}/requisicoes`, { centroCustoId: cc.id, itens: [{ descricao: 'Item barato', quantidade: 1, precoEstimado: 100 }] })).json
  await call('TEACHER', 'POST', `${S}/requisicoes/${rq2.id}/enviar`, {})
  const dc = await Promise.all([1, 2, 3].map(() => call('COORDINATOR', 'POST', `${S}/requisicoes/${rq2.id}/decidir`, { decisao: 'APROVADO' })))
  check(dc.filter((x) => x.status === 200).length === 1, 'decisão concorrente do mesmo nível: só 1', dc.map((x) => x.status))
  const notifs = await prisma.eduNotification.count({ where: { tenantId, refType: 'SupRequisicao', refId: rq2.id } })
  check(notifs === 1, 'uma notificação de aprovação', notifs)

  console.log('# desempenho: janela de tempo e expiração')
  const fx = await acadFixture(c)
  const [s0, s1] = fx.students
  await call('COORDINATOR', 'POST', `${D}/bootstrap`, {})
  const ex = (await call('COORDINATOR', 'GET', `${D}/exames?q=ENADE-FAR`)).json.items[0]
  const eixos = (await call('COORDINATOR', 'GET', `${D}/eixos?exameId=${ex.id}&pageSize=100`)).json.items
  const alt = ['A', 'B', 'C', 'D'].map((l) => ({ letra: l, texto: 'alt ' + l }))
  const qids: string[] = []
  for (let i = 0; i < 4; i++) {
    const q = (await call('COORDINATOR', 'POST', `${D}/questoes`, { exameId: ex.id, eixoId: eixos[5 + (i % 2)].id, enunciado: `Questão número ${i} suficientemente longa`, alternativas: alt, gabarito: 'A' })).json
    await call('ADMIN', 'POST', `${D}/questoes/${q.id}/revisar`, {}); await call('COORDINATOR', 'POST', `${D}/questoes/${q.id}/publicar`, {})
    qids.push(q.id)
  }
  const mont = (extra: any) => call('COORDINATOR', 'POST', `${D}/simulados/montar`, { exameId: ex.id, titulo: 'Sim janela', total: 4, matriz: [{ eixoId: eixos[5].id, quantidade: 2 }, { eixoId: eixos[6].id, quantidade: 2 }], alvos: [{ classSectionId: fx.section.id }], duracaoMin: 10, ...extra })
  r = await mont({ abreEm: iso(0.5), fechaEm: iso(1) })
  const simFut = r.json.simulado
  check(r.status === 201, 'montar simulado futuro', r)
  await call('COORDINATOR', 'POST', `${D}/simulados/${simFut.id}/publicar`, {})
  check((await tokenCall(c, s0.token, 'POST', `${D}/simulados/${simFut.id}/iniciar`)).status === 409, 'iniciar antes da abertura 409')
  check((await tokenCall(c, s0.token, 'GET', `${D}/simulados/meus`)).json.items[0].disponivel === false, 'meus: indisponível antes da abertura')
  check((await call('COORDINATOR', 'PATCH', `${D}/simulados/${simFut.id}`, { abreEm: iso(0.1) })).status === 409, 'PATCH abertura em publicado 409')
  r = await mont({ abreEm: iso(-0.5), fechaEm: iso(1), titulo: 'Sim expira' })
  const simExp = r.json.simulado
  await call('COORDINATOR', 'POST', `${D}/simulados/${simExp.id}/publicar`, {})
  const it = await tokenCall(c, s0.token, 'POST', `${D}/simulados/${simExp.id}/iniciar`)
  check(it.status === 201, 'iniciar', it)
  // força expiração do tempo
  await prisma.desTentativa.update({ where: { id: it.json.tentativaId }, data: { expiraEm: new Date(Date.now() - 120000), iniciadaEm: new Date(Date.now() - 900000) } })
  check((await tokenCall(c, s0.token, 'PUT', `${D}/tentativas/${it.json.tentativaId}/respostas`, { respostas: { [qids[0]]: 'A' } })).status === 409, 'responder após expirar 409')
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  const jr: any = await runEduJobs()
  check(jr['desempenho.simulados']?.result?.tentativasExpiradas === 1, 'job expira tentativa', jr['desempenho.simulados'])
  const tt = await prisma.desTentativa.findUnique({ where: { id: it.json.tentativaId } })
  check(tt?.status === 'EXPIRADA' && tt.percentual === 0, 'tentativa expirada corrigida (0%)', tt)
  // janela vencida -> job encerra simulado
  await prisma.desSimulado.update({ where: { id: simExp.id }, data: { fechaEm: new Date(Date.now() - 1000) } })
  const jr2: any = await runEduJobs()
  check(jr2['desempenho.simulados']?.result?.simuladosEncerrados >= 1, 'job encerra simulado vencido', jr2['desempenho.simulados'])
  check((await prisma.desSimulado.findUnique({ where: { id: simExp.id } }))?.status === 'ENCERRADO', 'simulado ENCERRADO')
  // cross-tenant alvo no montar
  r = await mont({ abreEm: iso(-0.5), fechaEm: iso(1), alvos: [{ studentId: 'student-de-outro-tenant' }], titulo: 'Alvo inválido' })
  check(r.status === 404 || r.status === 400, 'montar com alvo inexistente é rejeitado', r.status)

  console.log('# biblioteca: renovação com reserva, multa máxima, perfis')
  await call('LIBRARIAN', 'POST', `${B}/bootstrap`, {})
  const obra = (await call('LIBRARIAN', 'POST', `${B}/obras`, { titulo: 'Obra Concorrida', autores: ['X'] })).json
  const lote = (await call('LIBRARIAN', 'POST', `${B}/obras/${obra.id}/exemplares-lote`, { quantidade: 1 })).json
  const l0 = (await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/${s0.id}`, {})).json
  const l1 = (await call('LIBRARIAN', 'POST', `${B}/leitores/de-aluno/${s1.id}`, {})).json
  const emp = (await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: lote.tombos[0] })).json
  check(!!emp.id, 'empréstimo')
  const rv = await call('LIBRARIAN', 'POST', `${B}/reservas`, { leitorId: l1.id, obraId: obra.id })
  check(rv.status === 201 && rv.json.status === 'AGUARDANDO', 'reserva fila', rv.json)
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/${emp.id}/renovar`, {})
  check(r.status === 409, 'não renova com reserva aguardando 409', r)
  const posicao = await tokenCall(c, s1.token, 'GET', `${B}/meus/resumo`)
  check(posicao.json.reservas[0]?.posicaoFila === 1, 'posição na fila = 1', posicao.json.reservas)
  // multa máxima por política
  const pol = (await call('LIBRARIAN', 'GET', `${B}/politicas`)).json.items.find((p: any) => p.perfil === 'ALUNO')
  await call('LIBRARIAN', 'PATCH', `${B}/politicas/${pol.id}`, { multaDia: 2, multaMaxima: 5 })
  await prisma.bibEmprestimo.update({ where: { id: emp.id }, data: { dataPrevista: new Date(Date.now() - 20 * 86400000) } })
  r = await call('LIBRARIAN', 'POST', `${B}/emprestimos/devolver`, { tombo: lote.tombos[0] })
  check(r.status === 200 && r.json.multaAtraso === 5 && r.json.multaLimitada === true, 'multa limitada ao máximo (5)', r.json)
  check((await prisma.bibReserva.findUnique({ where: { id: rv.json.id } }))?.status === 'DISPONIVEL', 'devolução atende a fila')
  // política com valores inválidos
  check((await call('LIBRARIAN', 'POST', `${B}/politicas`, { perfil: 'ALUNO', prazoDias: 0, limiteEmprestimos: 1, maxRenovacoes: 1, multaDia: 1, limiteReservas: 1, diasRetiradaReserva: 1 })).status === 400, 'política prazo 0 400')
  // limite de empréstimos
  const outras = []
  for (let i = 0; i < 4; i++) { const o = (await call('LIBRARIAN', 'POST', `${B}/obras`, { titulo: 'Obra lim ' + i })).json; const t = (await call('LIBRARIAN', 'POST', `${B}/obras/${o.id}/exemplares-lote`, { quantidade: 1 })).json.tombos[0]; outras.push(t) }
  await prisma.bibLeitor.update({ where: { id: l0.id }, data: { bloqueadoAte: null, motivoBloqueio: null } })
  await prisma.bibMulta.updateMany({ where: { leitorId: l0.id }, data: { status: 'PAGA' } })
  const rs = []
  for (const t of outras) rs.push((await call('LIBRARIAN', 'POST', `${B}/emprestimos`, { leitorId: l0.id, tombo: t })).status)
  check(rs.join() === '201,201,201,409', 'limite de 3 empréstimos para aluno', rs)

  summary()
  await c.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(2) })
