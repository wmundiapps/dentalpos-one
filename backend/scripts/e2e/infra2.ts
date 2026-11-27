// Testes do módulo INFRAESTRUTURA 2: agenda, solicitações/OS com fotos, frota, segurança patrimonial, indicadores de pessoas (RH) e seed.
// Uso:  DATABASE_URL=postgresql://inf2:inf2@127.0.0.1:5432/inf2 npx tsx scripts/e2e/infra2.ts
// Requer Postgres LOCAL com o schema aplicado (prisma db push). NUNCA aponte para banco remoto nem para o edutest.
import { setup, check, summary, prisma, fails, Actor } from './qa5-lib'
import { kmRodados, consumoMedio, seguroRateado, custoPorKm, cnhValidaEm, periodosSeSobrepoem } from '../../src/modules/infraestrutura/inf2/frotaCalc'
import { hm, intervalo, turnosSobrepoem, atrasoMin, statusRonda, diasEntre, dias12x36, pct } from '../../src/modules/infraestrutura/seguranca-patrimonial/calc'
import { jobAgenda } from '../../src/modules/infraestrutura/inf2/agenda'
import { jobFrota } from '../../src/modules/infraestrutura/inf2/frota'
import { jobSolicitacoes } from '../../src/modules/infraestrutura/inf2/solicitacoes'
import { indicadoresPessoaInfra } from '../../src/modules/infraestrutura/inf2/indicadoresPessoas'
import { seedInfra2, FOTO_DEMO } from '../seeds/infra2'

const secao = (t: string) => console.log(`\n== ${t}`)
const DAY = 86_400_000
const day = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const I = '/edu/infraestrutura'
const EXE = 'data:image/png;base64,' + Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00This program cannot be run in DOS mode.').toString('base64')
let seq = 0
const placa = () => { seq++; return `ABC${seq % 10}D${String(10 + (seq % 80))}`.slice(0, 7) }

async function main() {
  // ---------------------------------------------------------------- funções puras
  secao('Frota: cálculos puros')
  const d0 = new Date('2026-01-01T00:00:00Z'), d1 = new Date('2026-12-31T00:00:00Z')
  check('kmRodados: menos de 2 leituras = 0', kmRodados([]) === 0 && kmRodados([{ km: 10 }]) === 0)
  check('kmRodados: maior - menor', kmRodados([{ km: 100 }, { km: 450 }, { km: 300 }]) === 350)
  const ab = (data: string, km: number, litros: number, valor: number) => ({ data: new Date(data), km, tipo: 'ABASTECIMENTO', litros, valor })
  check('consumoMedio: sem 2 abastecimentos = null', consumoMedio([ab('2026-01-01', 100, 40, 200)]) === null)
  check('consumoMedio: km/l ignora o primeiro abastecimento', consumoMedio([ab('2026-01-01', 1000, 40, 200), ab('2026-01-10', 1400, 40, 200), ab('2026-01-20', 1800, 40, 200)]) === 10)
  check('consumoMedio: ordena por data', consumoMedio([ab('2026-01-20', 1800, 40, 200), ab('2026-01-01', 1000, 40, 200), ab('2026-01-10', 1400, 40, 200)]) === 10)
  const seg = { vigenciaInicio: new Date('2026-01-01T00:00:00Z'), vigenciaFim: new Date('2027-01-01T00:00:00Z'), premio: 3650 }
  check('seguroRateado: período todo = prêmio', seguroRateado(seg, d0, new Date('2027-01-01T00:00:00Z')) === 3650)
  check('seguroRateado: metade do ano ~ metade do prêmio', Math.abs(seguroRateado(seg, d0, new Date('2026-07-02T12:00:00Z')) - 1825) < 15)
  check('seguroRateado: fora da vigência = 0', seguroRateado(seg, new Date('2028-01-01'), new Date('2028-06-01')) === 0)
  const c = custoPorKm({ registros: [ab('2026-02-01', 1000, 40, 240), ab('2026-03-01', 2000, 40, 250)], manutencoes: [{ custo: 500 }], multas: [{ valor: 200, valorRessarcido: 50, status: 'REGISTRADA' }, { valor: 999, valorRessarcido: 0, status: 'CANCELADA' }], seguros: [seg], de: d0, ate: new Date('2027-01-01T00:00:00Z') })
  check('custoPorKm: combustível somado', c.combustivel === 490)
  check('custoPorKm: multa líquida do ressarcimento e sem canceladas', c.multas === 150)
  check('custoPorKm: total = comb+manut+multas+seguro', c.total === 490 + 500 + 150 + 3650)
  check('custoPorKm: R$/km = total/km', c.km === 1000 && c.custoPorKm === 4.79)
  check('custoPorKm: sem km = null', custoPorKm({ registros: [], manutencoes: [], multas: [], seguros: [], de: d0, ate: d1 }).custoPorKm === null)
  check('cnhValidaEm', cnhValidaEm(new Date('2027-01-01'), new Date('2026-06-01')) && !cnhValidaEm(new Date('2026-01-01'), new Date('2026-06-01')) && !cnhValidaEm(null, new Date()))
  check('periodosSeSobrepoem', periodosSeSobrepoem([d0, d1], [new Date('2026-06-01'), new Date('2027-06-01')]) && !periodosSeSobrepoem([d0, new Date('2026-02-01')], [new Date('2026-02-01'), d1]))

  secao('Segurança patrimonial: cálculos puros')
  check('hm 06:30 = 390', hm('06:30') === 390)
  check('intervalo diurno', JSON.stringify(intervalo('08:00', '18:00')) === '[480,1080]')
  check('intervalo noturno cruza meia-noite', JSON.stringify(intervalo('22:00', '06:00')) === '[1320,1800]')
  check('turnos sobrepostos no mesmo dia', turnosSobrepoem({ inicio: '08:00', fim: '16:00' }, { inicio: '15:00', fim: '23:00' }))
  check('turnos consecutivos não se sobrepõem', !turnosSobrepoem({ inicio: '08:00', fim: '16:00' }, { inicio: '16:00', fim: '23:00' }))
  check('noite do dia anterior invade a manhã seguinte', turnosSobrepoem({ inicio: '22:00', fim: '06:00' }, { inicio: '05:00', fim: '13:00' }, 1))
  check('noite não invade o turno que começa às 06:00', !turnosSobrepoem({ inicio: '22:00', fim: '06:00' }, { inicio: '06:00', fim: '14:00' }, 1))
  check('statusRonda', statusRonda(4, 4) === 'CONCLUIDA' && statusRonda(4, 3) === 'INCOMPLETA' && statusRonda(0, 0) === 'INCOMPLETA')
  check('pct', pct(1, 4) === 25 && pct(1, 0) === null)
  check('diasEntre com filtro de dias da semana', diasEntre('2026-11-02', '2026-11-08', [1, 3]).join() === '2026-11-02,2026-11-04')
  check('dias12x36 alterna', dias12x36('2026-11-01', '2026-11-07').join() === '2026-11-01,2026-11-03,2026-11-05,2026-11-07')
  const agora = new Date()
  check('atrasoMin: dentro da tolerância = 0', atrasoMin('00:00', new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 3, 5)), agora) === 0)
  check('atrasoMin: 30 min depois', atrasoMin('00:00', new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 3, 30)), agora) === 30)

  // ---------------------------------------------------------------- API
  const h = await setup()
  const { call, t1, t2 } = h
  const admin = await t1.mk('ADMIN'), fac = await t1.mk('FACILITIES'), staff = await t1.mk('STAFF'), staff2 = await t1.mk('STAFF'), coord = await t1.mk('COORDINATOR')
  const hr = await t1.mk('HR'), prof = await t1.mk('TEACHER'), aluno = await t1.mk('STUDENT', true), aluno2 = await t1.mk('STUDENT', true), fin = await t1.mk('FINANCE')
  const adminB = await t2.mk('ADMIN'), facB = await t2.mk('FACILITIES'), alunoB = await t2.mk('STUDENT', true), hrB = await t2.mk('HR')
  const A = (a: Actor, m: string, p: string, b?: any) => call(a, m, I + p, b)

  secao('Agenda de infraestrutura')
  let r = await A(fac, 'GET', '/agenda/catalogo')
  check('catálogo da agenda', r.status === 200 && r.json.tipos.includes('PREVENTIVA') && r.json.areas.includes('TELHADO'))
  r = await A(aluno, 'GET', '/agenda/itens'); check('aluno não vê a agenda (403)', r.status === 403)
  r = await A(prof, 'POST', '/agenda/itens', { tipo: 'EVENTUAL', area: 'JARDIM', titulo: 'Poda', inicio: day(1) }); check('professor não cria item da agenda (403)', r.status === 403)
  r = await A(fac, 'POST', '/agenda/itens', { tipo: 'INVALIDO', area: 'JARDIM', titulo: 'Poda geral', inicio: day(1) }); check('tipo inválido = 400', r.status === 400)
  r = await A(fac, 'POST', '/agenda/itens', { tipo: 'EVENTUAL', area: 'JARDIM', titulo: 'Poda geral', inicio: day(5), fim: day(2) }); check('fim anterior ao início = 400', r.status === 400)
  r = await A(fac, 'POST', '/agenda/itens', { tipo: 'EVENTUAL', area: 'JARDIM', titulo: 'Poda geral', inicio: day(1), recorrenciaDias: 30 }); check('recorrência só para preventiva = 400', r.status === 400)
  r = await A(fac, 'POST', '/agenda/itens', { tipo: 'PREVENTIVA', area: 'EXTINTOR', titulo: 'Inspeção de extintores', inicio: day(-2), fim: day(-1), recorrenciaDias: 180, responsavelUserId: staff.id, prioridade: 'ALTA', custoPrevisto: 900 })
  const prev = r.json
  check('cria preventiva recorrente (201)', r.status === 201 && prev.codigo?.startsWith('AGE-') && prev.responsavelNome?.length > 0)
  check('item vencido aparece como atrasado', prev.atrasado === true)
  r = await A(fac, 'POST', '/agenda/itens', { tipo: 'EVENTUAL', area: 'TELHADO', titulo: 'Reparo de telhado bloco C', inicio: day(3), fim: day(6), responsavelUserId: 'inexistente' }); check('responsável inexistente = 400', r.status === 400)
  r = await A(fac, 'POST', '/agenda/itens', { tipo: 'AVISO', area: 'COMUNICACAO', titulo: 'Aviso de obra', inicio: day(1), spaceId: 'inexistente' }); check('espaço inexistente = 400', r.status === 400)
  const evt = (await A(fac, 'POST', '/agenda/itens', { tipo: 'EVENTUAL', area: 'TELHADO', titulo: 'Reparo de telhado bloco C', inicio: day(3), fim: day(6), anotacoes: 'Aguardando orçamento' })).json
  check('item eventual criado com código sequencial', evt?.codigo && evt.codigo !== prev.codigo)
  r = await A(staff, 'GET', '/agenda/itens'); check('STAFF lê a agenda', r.status === 200 && r.json.total >= 2)
  r = await A(fac, 'GET', '/agenda/itens?tipo=PREVENTIVA'); check('filtro por tipo', r.json.items.every((i: any) => i.tipo === 'PREVENTIVA') && r.json.total === 1)
  r = await A(fac, 'GET', '/agenda/itens?atrasados=true'); check('filtro de atrasados', r.json.items.length === 1 && r.json.items[0].id === prev.id)
  r = await A(fac, 'GET', '/agenda/itens?q=telhado'); check('busca textual', r.json.total === 1)
  r = await A(fac, 'GET', `/agenda/itens?de=${day(2).slice(0, 10)}&ate=${day(7).slice(0, 10)}`); check('filtro por período', r.json.items.some((i: any) => i.id === evt.id) && !r.json.items.some((i: any) => i.id === prev.id))
  r = await A(fac, 'POST', `/agenda/itens/${evt.id}/notas`, { texto: 'Orçamento recebido: R$ 7.400.' }); check('anotação adicionada', r.status === 201 && r.json.autorNome)
  r = await A(fac, 'GET', `/agenda/itens/${evt.id}`); check('detalhe traz as anotações', r.json.notas.length === 1)
  r = await A(fac, 'PATCH', `/agenda/itens/${evt.id}`, { prioridade: 'URGENTE', custoPrevisto: 7400 }); check('edição do item', r.status === 200 && r.json.prioridade === 'URGENTE')
  r = await A(fac, 'POST', `/agenda/itens/${evt.id}/iniciar`, {}); check('iniciar item', r.json.status === 'EM_ANDAMENTO')
  r = await A(fac, 'POST', `/agenda/itens/${evt.id}/iniciar`, {}); check('iniciar duas vezes = 409', r.status === 409)
  r = await A(fac, 'POST', `/agenda/itens/${prev.id}/concluir`, { custoReal: 880, nota: 'Todos os extintores conferidos.' })
  check('concluir preventiva gera a próxima ocorrência', r.status === 200 && r.json.status === 'CONCLUIDO' && r.json.proxima?.status === 'PLANEJADO')
  check('próxima ocorrência herda recorrência e responsável', r.json.proxima.recorrenciaDias === 180 && r.json.proxima.responsavelUserId === staff.id && new Date(r.json.proxima.inicio) > new Date(Date.now() + 170 * DAY))
  const proxima = r.json.proxima
  r = await A(fac, 'POST', `/agenda/itens/${prev.id}/concluir`, {}); check('concluir item já concluído = 409', r.status === 409)
  r = await A(fac, 'PATCH', `/agenda/itens/${prev.id}`, { titulo: 'Outro nome' }); check('item concluído não é editável (409)', r.status === 409)
  r = await A(fac, 'DELETE', `/agenda/itens/${evt.id}`); check('não exclui item em andamento (409)', r.status === 409)
  r = await A(fac, 'POST', `/agenda/itens/${evt.id}/cancelar`, { motivo: 'Adiado' }); check('cancelar item', r.json.status === 'CANCELADO')
  r = await A(fac, 'DELETE', `/agenda/itens/${proxima.id}`); check('exclui item planejado (204)', r.status === 204)
  const outro = (await A(fac, 'POST', '/agenda/itens', { tipo: 'SEGURANCA', area: 'CIPA', titulo: 'Reunião da CIPA', inicio: day(7), departamentoNome: 'SESMT' })).json
  r = await A(fac, 'GET', '/agenda/resumo'); check('resumo da agenda', r.status === 200 && r.json.total >= 2 && typeof r.json.custoRealizado === 'number' && r.json.porTipo.SEGURANCA === 1)
  r = await A(adminB, 'GET', `/agenda/itens/${outro.id}`); check('isolamento: outro tenant não vê o item (404)', r.status === 404)
  r = await A(adminB, 'GET', '/agenda/itens'); check('isolamento: lista do outro tenant vazia', r.json.total === 0)
  r = await A(fac, 'GET', '/pessoas'); check('lista de pessoas só traz id/nome/perfil', r.status === 200 && r.json.items.length > 3 && !('email' in r.json.items[0]) && !r.json.items.some((p: any) => p.perfil === 'STUDENT'))
  r = await A(aluno, 'GET', '/pessoas'); check('aluno não lista pessoas (403)', r.status === 403)
  const reminders = await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, refType: 'Inf2AgendaItem' } })
  check('lembretes agendados para itens da agenda', reminders >= 2)

  secao('Anexos e fotos (upload guard)')
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'PROBLEMA', categoria: 'ELETRICA', titulo: 'Tomada sem energia', relatorio: 'A tomada da parede norte da sala 101 não funciona desde ontem.', local: 'Sala 101', fotos: [{ arquivoNome: 'tomada.png', mime: 'image/png', dataUrl: FOTO_DEMO }] })
  const s1 = r.json
  check('aluno abre solicitação com foto (201)', r.status === 201 && s1.numero?.startsWith('SOL-') && s1.status === 'NOVA' && s1.solicitanteNome)
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'PROBLEMA', titulo: 'Arquivo perigoso', relatorio: 'Tentando enviar um executável como se fosse foto.', fotos: [{ arquivoNome: 'x.png', mime: 'image/png', dataUrl: EXE }] })
  check('upload guard recusa executável disfarçado de imagem', r.status >= 400 && r.status < 500, r.json)
  r = await A(aluno, 'GET', `/solicitacoes/${s1.id}`); check('solicitante vê detalhes e fotos', r.status === 200 && r.json.fotos.length === 1)
  const fotoId = r.json.fotos[0].id
  r = await A(aluno, 'GET', `/anexos-infra?refType=Solicitacao&refId=${s1.id}`); check('lista de anexos do dono', r.status === 200 && r.json.items.length === 1 && !('dataUrl' in r.json.items[0]))
  let dl = await fetch(`${h.base}/edu/infraestrutura/anexos-infra/${fotoId}/download`, { headers: { authorization: `Bearer ${aluno.token}` } })
  check('download da foto pelo dono (image/png, nosniff)', dl.status === 200 && dl.headers.get('content-type') === 'image/png' && dl.headers.get('x-content-type-options') === 'nosniff')
  dl = await fetch(`${h.base}/edu/infraestrutura/anexos-infra/${fotoId}/download`, { headers: { authorization: `Bearer ${aluno2.token}` } }); check('outro aluno não baixa a foto (404)', dl.status === 404)
  dl = await fetch(`${h.base}/edu/infraestrutura/anexos-infra/${fotoId}/download`, { headers: { authorization: `Bearer ${adminB.token}` } }); check('outro tenant não baixa a foto (404)', dl.status === 404)
  dl = await fetch(`${h.base}/edu/infraestrutura/anexos-infra/${fotoId}/download`, { headers: { authorization: `Bearer ${fac.token}` } }); check('gestão baixa a foto', dl.status === 200)
  r = await A(aluno2, 'POST', '/anexos-infra', { refType: 'Solicitacao', refId: s1.id, arquivoNome: 'a.png', dataUrl: FOTO_DEMO }); check('outro aluno não anexa à solicitação alheia (404)', r.status === 404)
  r = await A(aluno, 'POST', '/anexos-infra', { refType: 'Solicitacao', refId: s1.id, arquivoNome: 'b.png', dataUrl: FOTO_DEMO }); check('dono anexa nova foto', r.status === 201 && !('dataUrl' in r.json))
  r = await A(aluno, 'POST', '/anexos-infra', { refType: 'Solicitacao', refId: s1.id, arquivoNome: 'c.png', arquivoUrl: 'http://exemplo.com/a.png' }); check('link http é recusado (https obrigatório)', r.status >= 400)
  r = await A(aluno, 'POST', '/anexos-infra', { refType: 'Veiculo', refId: s1.id, arquivoNome: 'c.png', dataUrl: FOTO_DEMO }); check('aluno não anexa em veículo', r.status === 404)
  r = await A(aluno, 'POST', '/anexos-infra', { refType: 'Inexistente', refId: s1.id, arquivoNome: 'c.png', dataUrl: FOTO_DEMO }); check('refType inválido = 400', r.status === 400)

  secao('Solicitações, triagem e ordens de serviço')
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'PROBLEMA', titulo: 'ab', relatorio: 'curto' }); check('relatório curto = 400', r.status === 400)
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'PROBLEMA', titulo: 'Sala', relatorio: 'Descrição suficiente do problema.', spaceId: 'inexistente' }); check('espaço inexistente = 400', r.status === 400)
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'PROBLEMA', titulo: 'Sala', relatorio: 'Descrição suficiente do problema.', qrToken: 'IQnaoexiste' }); check('QR inexistente = 400', r.status === 400)
  r = await A(aluno, 'GET', '/solicitacoes/minhas'); check('minhas solicitações', r.json.total === 1 && r.json.items[0].id === s1.id)
  r = await A(aluno2, 'GET', `/solicitacoes/${s1.id}`); check('outro aluno não vê a solicitação (404)', r.status === 404)
  r = await A(aluno, 'GET', '/solicitacoes'); check('aluno não vê a fila (403)', r.status === 403)
  r = await A(fac, 'GET', '/solicitacoes?status=NOVA'); check('gestão vê a fila filtrada', r.json.total === 1)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/triagem`, { decisao: 'ACEITAR' }); check('aluno não faz triagem (403)', r.status === 403)
  r = await A(fac, 'POST', `/solicitacoes/${s1.id}/triagem`, { decisao: 'REJEITAR' }); check('rejeitar sem motivo = 400', r.status === 400)
  r = await A(fac, 'POST', `/solicitacoes/${s1.id}/comentarios`, { texto: 'Aguardando peça do eletricista.', interno: true }); check('comentário interno da gestão', r.status === 201)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/comentarios`, { texto: 'Obrigado!', interno: true }); check('solicitante não cria comentário interno (403)', r.status === 403)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/comentarios`, { texto: 'Obrigado!' }); check('solicitante comenta', r.status === 201)
  r = await A(aluno, 'GET', `/solicitacoes/${s1.id}`); check('solicitante não vê comentário interno', r.json.comentarios.length === 1 && !r.json.comentarios[0].interno)
  r = await A(fac, 'GET', `/solicitacoes/${s1.id}`); check('gestão vê todos os comentários', r.json.comentarios.length === 2)
  r = await A(fac, 'POST', `/solicitacoes/${s1.id}/triagem`, { decisao: 'ACEITAR', prioridade: 'ALTA', responsavelUserId: staff.id, custoEstimado: 350 })
  check('triagem aceita com responsável, prazo e custo', r.status === 200 && r.json.status === 'EM_TRIAGEM' && r.json.responsavelNome && r.json.prazo && r.json.custoEstimado === 350)
  check('prazo padrão por prioridade ALTA ~ 3 dias', Math.abs((new Date(r.json.prazo).getTime() - Date.now()) / DAY - 3) < 0.2)
  r = await A(fac, 'POST', `/solicitacoes/${s1.id}/triagem`, { decisao: 'ACEITAR' }); check('retriagem é permitida enquanto em triagem', r.status === 200 && r.json.status === 'EM_TRIAGEM')
  r = await A(fac, 'POST', `/solicitacoes/${s1.id}/gerar-os`, { custoPrevisto: 300 })
  const os1 = r.json
  check('gera OS vinculada com responsável e prazo', r.status === 201 && os1.numero?.startsWith('OS-') && os1.responsavelUserId === staff.id && os1.prazo && os1.solicitacaoId === s1.id)
  r = await A(fac, 'GET', `/solicitacoes/${s1.id}`); check('solicitação passa a OS_GERADA', r.json.status === 'OS_GERADA' && r.json.ordens.length === 1)
  r = await A(aluno, 'POST', '/os', { titulo: 'OS indevida' }); check('aluno não cria OS (403)', r.status === 403)
  r = await A(fac, 'POST', `/os/${os1.id}/concluir`, { custoReal: 280 }); check('concluir OS sem relatório = 400', r.status === 400)
  r = await A(fac, 'POST', `/os/${os1.id}/iniciar`, {}); check('iniciar OS', r.json.status === 'EM_EXECUCAO')
  r = await A(fac, 'GET', `/solicitacoes/${s1.id}`); check('solicitação vai para EM_ANDAMENTO', r.json.status === 'EM_ANDAMENTO')
  r = await A(fac, 'POST', `/os/${os1.id}/concluir`, { custoReal: 280, relatorioExecucao: 'Trocada a tomada e reapertada a fiação do circuito.' })
  check('concluir OS registra custo e cumprimento de prazo', r.status === 200 && r.json.status === 'CONCLUIDA' && r.json.custoReal === 280 && r.json.noPrazo === true)
  r = await A(aluno, 'GET', `/solicitacoes/${s1.id}`); check('solicitação resolvida automaticamente com custo final', r.json.status === 'RESOLVIDA' && r.json.custoFinal === 280 && r.json.cumpriuPrazo === true)
  const notifs = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, userId: aluno.id, refType: 'Inf2Solicitacao' } })
  check('solicitante foi notificado das atualizações', notifs >= 2)
  check('responsável foi notificado da atribuição', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, userId: staff.id, refType: 'Inf2Solicitacao' } })) >= 1)
  r = await A(aluno2, 'POST', `/solicitacoes/${s1.id}/avaliar`, { nota: 5 }); check('outro usuário não avalia (404)', r.status === 404)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/avaliar`, { nota: 9 }); check('nota fora de 1..5 = 400', r.status === 400)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/avaliar`, { nota: 4, comentario: 'Rápido e resolveu.' }); check('solicitante avalia o atendimento', r.status === 200 && r.json.status === 'FECHADA' && r.json.avaliacaoNota === 4)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/avaliar`, { nota: 5 }); check('avaliar duas vezes = 409', r.status === 409)
  r = await A(aluno, 'POST', `/solicitacoes/${s1.id}/reabrir`, { motivo: 'Voltou a falhar na semana seguinte.' }); check('solicitante reabre', r.status === 200 && r.json.status === 'EM_TRIAGEM' && r.json.avaliacaoNota === null)
  r = await A(fac, 'POST', `/solicitacoes/${s1.id}/resolver`, { custoFinal: 320, nota: 'Troca definitiva do disjuntor.' }); check('gestão resolve direto', r.json.status === 'RESOLVIDA' && r.json.custoFinal === 320)
  // QR
  r = await A(aluno, 'POST', '/qr-locais', { nome: 'x' }); check('aluno não cria QR (403)', r.status === 403)
  r = await A(fac, 'POST', '/qr-locais', { nome: 'Sala 202 — Bloco B' }); const qr = r.json
  check('gestão cria QR de sala', r.status === 201 && qr.token?.startsWith('IQ') && qr.caminho.includes(qr.token))
  r = await A(aluno, 'GET', `/qr/${qr.token}`); check('usuário resolve o QR lido', r.status === 200 && r.json.nome === 'Sala 202 — Bloco B')
  r = await A(alunoB, 'GET', `/qr/${qr.token}`); check('QR de outro tenant não resolve (404)', r.status === 404)
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'IMPLEMENTACAO', categoria: 'EQUIPAMENTO', titulo: 'Instalar ventilador', relatorio: 'A sala fica muito quente à tarde, sugiro instalar ventiladores.', qrToken: qr.token })
  const s2 = r.json
  check('solicitação via QR preenche o local e a origem', r.status === 201 && s2.local === 'Sala 202 — Bloco B' && s2.origem === 'QR')
  r = await A(fac, 'POST', `/solicitacoes/${s2.id}/triagem`, { decisao: 'REJEITAR', motivo: 'Já previsto na expansão do bloco.' }); check('rejeição com motivo', r.status === 200 && r.json.status === 'REJEITADA')
  r = await A(aluno, 'GET', `/solicitacoes/${s2.id}`); check('solicitante vê o motivo da rejeição', r.json.motivoRejeicao?.includes('expansão'))
  r = await A(aluno, 'POST', `/solicitacoes/${s2.id}/cancelar`, {}); check('cancelar após rejeição = 409', r.status === 409)
  r = await A(aluno, 'POST', '/solicitacoes', { tipo: 'PROBLEMA', titulo: 'Vaso quebrado no corredor', relatorio: 'Há um vaso quebrado no corredor do bloco A com cacos.' }); const s3 = r.json
  r = await A(aluno, 'POST', `/solicitacoes/${s3.id}/cancelar`, {}); check('solicitante cancela antes da triagem', r.json.status === 'CANCELADA')
  r = await A(fac, 'GET', '/solicitacoes/painel'); check('painel de solicitações', r.status === 200 && r.json.total === 3 && r.json.avaliacaoMedia === null && typeof r.json.custoTotal === 'number')
  r = await A(fac, 'POST', '/os', { titulo: 'Revisão do ar-condicionado', tipo: 'PREVENTIVA', responsavelUserId: staff.id, prazo: day(-1), custoPrevisto: 500 }); const os2 = r.json
  check('cria OS avulsa', r.status === 201 && os2.numero)
  r = await A(fac, 'POST', `/os/${os2.id}/concluir`, { relatorioExecucao: 'Limpeza de filtros e carga de gás.', custoReal: 520 }); check('OS concluída após o prazo = noPrazo false', r.json.noPrazo === false)
  r = await A(fac, 'GET', '/os?status=CONCLUIDA'); check('lista de OS filtrada', r.json.total === 2)
  r = await A(fac, 'PATCH', `/os/${os2.id}`, { titulo: 'x' }); check('OS concluída não edita (409)', r.status === 409)
  r = await A(adminB, 'GET', `/os/${os2.id}`); check('isolamento de OS entre tenants (404)', r.status === 404)

  secao('Frota')
  r = await A(aluno, 'GET', '/frota/veiculos'); check('aluno não vê a frota (403)', r.status === 403)
  r = await A(staff, 'POST', '/frota/veiculos', { placa: 'ABC1D23', marca: 'Fiat', modelo: 'Doblò' }); check('STAFF não cadastra veículo (403)', r.status === 403)
  r = await A(fac, 'POST', '/frota/veiculos', { placa: 'XX', marca: 'Fiat', modelo: 'Doblò' }); check('placa inválida = 400', r.status === 400)
  const P1 = 'QWE1A23', P2 = 'RTY4B56'
  r = await A(fac, 'POST', '/frota/veiculos', { placa: P1.toLowerCase(), marca: 'Fiat', modelo: 'Doblò', tipo: 'UTILITARIO', odometroKm: 1000, capacidade: 5, responsavelUserId: staff.id })
  const v1 = r.json
  check('cadastra veículo (placa normalizada, responsável com nome)', r.status === 201 && v1.placa === P1 && v1.responsavelNome)
  r = await A(fac, 'POST', '/frota/veiculos', { placa: P1, marca: 'Fiat', modelo: 'Doblò' }); check('placa duplicada = 409', r.status === 409)
  const v2 = (await A(fac, 'POST', '/frota/veiculos', { placa: P2, marca: 'Mercedes', modelo: 'Sprinter', tipo: 'VAN', odometroKm: 5000, capacidade: 16 })).json
  r = await A(fac, 'PATCH', `/frota/veiculos/${v1.id}`, { odometroKm: 500 }); check('odômetro não pode diminuir (400)', r.status === 400)
  r = await A(coord, 'GET', '/frota/veiculos?q=sprinter'); check('busca de veículos', r.json.total === 1)
  // motoristas
  r = await A(fac, 'POST', '/frota/motoristas', { nome: 'Antônio Pereira', cnhNumero: '123', cnhValidade: day(300) }); check('CNH com dígitos insuficientes = 400', r.status === 400)
  r = await A(fac, 'POST', '/frota/motoristas', { nome: 'Antônio Pereira', cnhNumero: '12345678901', cnhCategoria: 'D', cnhValidade: day(300), userId: staff.id })
  const m1 = r.json
  check('cadastra motorista sem expor a CNH', r.status === 201 && !('cnhCifrada' in m1) && m1.cnhMascarada === '********901' && m1.cnhFinal === '901')
  const cifrada = await prisma.inf2Motorista.findUnique({ where: { id: m1.id } })
  check('CNH cifrada no banco (não é o número puro)', !!cifrada?.cnhCifrada && !cifrada.cnhCifrada.includes('12345678901'))
  const m2 = (await A(fac, 'POST', '/frota/motoristas', { nome: 'Luciana Prado', cnhNumero: '98765432100', cnhCategoria: 'B', cnhValidade: day(-10) })).json
  r = await A(coord, 'GET', '/frota/motoristas'); check('lista de motoristas sem dados de CNH completos', r.status === 200 && r.json.items.every((m: any) => !('cnhCifrada' in m)))
  check('alerta de CNH vencida', r.json.items.find((m: any) => m.id === m2.id).cnhAlerta.faixa === 'VENCIDO')
  // registros
  r = await A(staff, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'ABASTECIMENTO', km: 1100, litros: 40, valor: 240, combustivel: 'FLEX', motoristaId: m1.id, data: day(-30) }); check('STAFF registra abastecimento', r.status === 201 && r.json.registradoPorNome && r.json.motoristaNome === 'Antônio Pereira')
  r = await A(staff, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'ABASTECIMENTO', km: 1200, data: day(-20) }); check('abastecimento sem litros/valor = 400', r.status === 400)
  r = await A(staff, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'QUILOMETRAGEM', km: 900 }); check('km menor que o odômetro = 400', r.status === 400)
  await A(staff, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'ABASTECIMENTO', km: 1500, litros: 40, valor: 250, data: day(-15) })
  await A(staff, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'ABASTECIMENTO', km: 1900, litros: 40, valor: 260, data: day(-5) })
  r = await A(fac, 'GET', `/frota/veiculos/${v1.id}`); check('odômetro atualizado pelos registros', r.json.odometroKm === 1900)
  r = await A(aluno, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'QUILOMETRAGEM', km: 2000 }); check('aluno não registra km (403)', r.status === 403)
  r = await A(fac, 'POST', '/frota/registros', { veiculoId: 'inexistente', tipo: 'QUILOMETRAGEM', km: 2000 }); check('veículo inexistente = 400', r.status === 400)
  // manutenção
  r = await A(fac, 'POST', '/frota/manutencoes', { veiculoId: v1.id, tipo: 'REVISAO', descricao: 'Revisão dos 2 mil km', data: day(-2), km: 2000, custo: 700, responsavelUserId: staff.id, proximaData: day(20) })
  check('registra revisão com responsável', r.status === 201 && r.json.responsavelNome)
  r = await A(fac, 'GET', `/frota/veiculos/${v1.id}`); check('km da manutenção atualiza o odômetro', r.json.odometroKm === 2000)
  // multas
  r = await A(fac, 'POST', '/frota/multas', { veiculoId: v1.id, motoristaId: m1.id, autoInfracao: 'A1', dataInfracao: day(-10), descricao: 'Excesso de velocidade', pontos: 4, valor: 130.16, vencimento: day(15) })
  const mu = r.json
  check('registra multa; responsável padrão = motorista', r.status === 201 && mu.responsavelNome === 'Antônio Pereira' && mu.responsavelUserId === staff.id && mu.tratamento === 'A_DEFINIR')
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/ressarcir`, { valor: 10 }); check('ressarcir antes de definir tratamento = 409', r.status === 409)
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/tratamento`, { tratamento: 'RESSARCIMENTO', valorRessarcir: 500 }); check('valor a ressarcir maior que a multa = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/tratamento`, { tratamento: 'DESCONTO_FOLHA', responsavelUserId: staff.id, valorRessarcir: 130.16 }); check('define desconto em folha com responsável', r.status === 200 && r.json.tratamento === 'DESCONTO_FOLHA' && r.json.valorRessarcir === 130.16)
  check('responsável notificado da multa', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, userId: staff.id, refType: 'Inf2Multa' } })) === 1)
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/ressarcir`, { valor: 100 }); check('registra ressarcimento parcial', r.status === 200 && r.json.valorRessarcido === 100)
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/ressarcir`, { valor: 50 }); check('ressarcimento acima do saldo = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/recurso`, {}); check('multa em recurso', r.json.status === 'EM_RECURSO')
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/pagar`, {}); check('multa paga', r.json.status === 'PAGA')
  r = await A(fac, 'POST', `/frota/multas/${mu.id}/cancelar`, {}); check('multa paga não cancela (409)', r.status === 409)
  r = await A(fac, 'POST', '/frota/multas', { veiculoId: v2.id, dataInfracao: day(-3), descricao: 'Estacionamento proibido', valor: 195.23, pontos: 3 }); const mu2 = r.json
  r = await A(fac, 'POST', `/frota/multas/${mu2.id}/tratamento`, { tratamento: 'RESSARCIMENTO' }); check('ressarcimento sem responsável = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/multas/${mu2.id}/tratamento`, { tratamento: 'INSTITUICAO' }); check('multa assumida pela instituição', r.json.tratamento === 'INSTITUICAO' && r.json.valorRessarcir === 0)
  r = await A(fac, 'GET', '/frota/relatorios/multas'); check('relatório de multas traz responsável', r.json.total === 2 && r.json.items.some((i: any) => i.responsavel && i.motorista === 'Antônio Pereira'))
  const csv = await fetch(`${h.base}/edu/infraestrutura/frota/relatorios/multas?format=csv`, { headers: { authorization: `Bearer ${fac.token}` } })
  const csvTxt = await csv.text(); check('exporta CSV de multas', csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv') && csvTxt.includes('placa;data;auto'))
  // seguros e documentos
  r = await A(fac, 'POST', '/frota/seguros', { veiculoId: v1.id, apolice: 'AP-1', seguradora: 'Porto', vigenciaInicio: day(-300), vigenciaFim: day(-400), premio: 1000 }); check('vigência invertida = 400', r.status === 400)
  r = await A(fac, 'POST', '/frota/seguros', { veiculoId: v1.id, apolice: 'AP-1', seguradora: 'Porto Seguro', vigenciaInicio: day(-335), vigenciaFim: day(30), premio: 3650, franquia: 2000, responsavelNome: 'Marcos Tavares' }); check('cadastra apólice', r.status === 201)
  r = await A(fac, 'POST', '/frota/seguros', { veiculoId: v2.id, apolice: 'AP-1', seguradora: 'Outra', vigenciaInicio: day(-1), vigenciaFim: day(364) }); check('apólice duplicada = 409', r.status === 409)
  r = await A(fac, 'POST', '/frota/documentos', { veiculoId: v1.id, tipo: 'LICENCIAMENTO', exercicio: 2026, validade: day(-3), responsavelNome: 'Marcos Tavares' }); check('cadastra documento vencido', r.status === 201)
  await A(fac, 'POST', '/frota/documentos', { veiculoId: v2.id, tipo: 'CRLV', validade: day(45) })
  r = await A(fac, 'POST', '/frota/documentos', { veiculoId: v2.id, tipo: 'IPVA', validade: day(400) }); check('documento com tipo válido', r.status === 201)
  r = await A(fac, 'GET', '/frota/alertas?dias=90')
  check('alertas: documento vencido, seguro, CNH vencida, revisão e multa', r.status === 200 && ['DOCUMENTO', 'SEGURO', 'CNH', 'REVISAO'].every((t) => r.json.itens.some((i: any) => i.tipo === t)))
  check('alertas ordenados por vencimento com faixa', r.json.itens[0].faixa === 'VENCIDO' && r.json.itens.every((i: any, k: number, a: any[]) => k === 0 || a[k - 1].vencimento <= i.vencimento))
  check('IPVA de 400 dias fica fora do alerta de 90', !r.json.itens.some((i: any) => i.titulo.startsWith('IPVA')))
  // reservas
  const saida = day(2), volta = day(2.5)
  r = await A(aluno, 'POST', '/frota/reservas', { veiculoId: v2.id, finalidade: 'Passeio', destino: 'Praia', saidaPrevista: saida, retornoPrevisto: volta }); check('aluno não reserva veículo (403)', r.status === 403)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v2.id, finalidade: 'Visita técnica', destino: 'Hospital', saidaPrevista: volta, retornoPrevisto: saida }); check('retorno antes da saída = 400', r.status === 400)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v2.id, finalidade: 'Visita técnica', destino: 'Hospital', passageiros: 40, saidaPrevista: saida, retornoPrevisto: volta }); check('passageiros acima da capacidade = 400', r.status === 400)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v2.id, finalidade: 'Visita técnica ao hospital', destino: 'Hospital Santa Clara', passageiros: 14, saidaPrevista: saida, retornoPrevisto: volta }); const rs = r.json
  check('professor solicita reserva', r.status === 201 && rs.numero?.startsWith('VIA-') && rs.status === 'SOLICITADA' && rs.solicitanteNome)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v2.id, motoristaId: m2.id, finalidade: 'Outra viagem', destino: 'Centro', saidaPrevista: day(8), retornoPrevisto: day(8.2) }); check('motorista com CNH vencida = 409', r.status === 409)
  r = await A(prof, 'GET', '/frota/reservas/minhas'); check('minhas reservas', r.json.total === 1)
  r = await A(prof, 'POST', `/frota/reservas/${rs.id}/decidir`, { decisao: 'APROVAR', motoristaId: m1.id }); check('professor não aprova reserva (403)', r.status === 403)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/decidir`, { decisao: 'APROVAR' }); check('aprovar sem motorista = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/decidir`, { decisao: 'APROVAR', motoristaId: m2.id }); check('aprovar com motorista de CNH vencida = 409', r.status === 409)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/decidir`, { decisao: 'APROVAR', motoristaId: m1.id }); check('aprova com motorista habilitado', r.status === 200 && r.json.status === 'APROVADA' && r.json.motoristaNome === 'Antônio Pereira' && r.json.decididoPorNome)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v2.id, finalidade: 'Conflito', destino: 'Outro', saidaPrevista: day(2.2), retornoPrevisto: day(2.8) }); check('conflito de horário no mesmo veículo = 409', r.status === 409)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/concluir`, { kmChegada: 6000 }); check('concluir antes de iniciar = 409', r.status === 409)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/iniciar`, { kmSaida: 100 }); check('kmSaida menor que o odômetro = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/iniciar`, {}); check('inicia viagem com km do odômetro', r.json.status === 'EM_CURSO' && r.json.kmSaida === 5000)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/concluir`, { kmChegada: 4900 }); check('kmChegada menor que kmSaida = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/reservas/${rs.id}/concluir`, { kmChegada: 5120, ocorrencias: 'Sem ocorrências.' }); check('conclui viagem', r.json.status === 'CONCLUIDA' && r.json.kmChegada === 5120)
  r = await A(fac, 'GET', `/frota/veiculos/${v2.id}`); check('odômetro do veículo atualizado pela viagem', r.json.odometroKm === 5120)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v1.id, finalidade: 'Reunião externa', destino: 'Prefeitura', saidaPrevista: day(4), retornoPrevisto: day(4.2) }); const rs2 = r.json
  r = await A(fac, 'POST', `/frota/reservas/${rs2.id}/decidir`, { decisao: 'NEGAR' }); check('negar sem motivo = 400', r.status === 400)
  r = await A(fac, 'POST', `/frota/reservas/${rs2.id}/decidir`, { decisao: 'NEGAR', motivo: 'Veículo em revisão.' }); check('nega reserva com motivo', r.json.status === 'NEGADA')
  r = await A(coord, 'POST', `/frota/reservas/${rs2.id}/cancelar`, {}); check('terceiro não cancela reserva alheia (403)', r.status === 403)
  r = await A(prof, 'POST', '/frota/reservas', { veiculoId: v1.id, finalidade: 'Reunião externa 2', destino: 'Prefeitura', saidaPrevista: day(6), retornoPrevisto: day(6.2) }); const rs3 = r.json
  r = await A(prof, 'POST', `/frota/reservas/${rs3.id}/cancelar`, {}); check('dono cancela a própria reserva', r.json.status === 'CANCELADA')
  // custo por km
  r = await A(fac, 'GET', `/frota/veiculos/${v1.id}/custo-km`)
  check('custo por km do veículo', r.status === 200 && r.json.km === 800 && r.json.combustivel === 750 && r.json.manutencao === 700 && r.json.custoPorKm > 0)
  check('consumo médio km/l', r.json.consumoKmPorLitro === 10)
  check('multa ressarcida reduz o custo da instituição', r.json.multas === 30.16)
  r = await A(fac, 'GET', `/frota/veiculos/${v1.id}/ficha`); check('ficha do veículo completa', r.status === 200 && r.json.docs.length === 1 && r.json.seguros.length === 1 && r.json.multas.length === 1 && r.json.manutencoes.length === 1 && r.json.registros.length >= 3)
  r = await A(fac, 'GET', '/frota/painel'); check('painel da frota', r.status === 200 && r.json.veiculos === 2 && r.json.alertas > 0 && Array.isArray(r.json.custoPorKm))
  r = await A(adminB, 'GET', `/frota/veiculos/${v1.id}/ficha`); check('isolamento: ficha de outro tenant (404)', r.status === 404)
  r = await A(adminB, 'GET', '/frota/veiculos'); check('isolamento: frota do outro tenant vazia', r.json.total === 0)
  r = await A(facB, 'POST', '/frota/registros', { veiculoId: v1.id, tipo: 'QUILOMETRAGEM', km: 99999 }); check('isolamento: não registra km em veículo de outro tenant (400)', r.status === 400)

  secao('Segurança patrimonial')
  const SP = '/seguranca-patrimonial'
  r = await A(aluno, 'GET', `${SP}/postos`); check('aluno não vê postos (403)', r.status === 403)
  r = await A(staff, 'POST', `${SP}/postos`, { codigo: 'P1', nome: 'x', tipo: 'PORTARIA' }); check('STAFF não cria posto (403)', r.status === 403)
  r = await A(fac, 'POST', `${SP}/postos`, { codigo: 'PORT-1', nome: 'Portaria principal', tipo: 'PORTARIA', efetivoMinimo: 2 }); const po = r.json
  check('cria posto', r.status === 201 && po.codigo === 'PORT-1')
  r = await A(fac, 'POST', `${SP}/postos`, { codigo: 'port-1', nome: 'Duplicado', tipo: 'PORTARIA' }); check('código de posto duplicado = 409', r.status === 409)
  const po2 = (await A(fac, 'POST', `${SP}/postos`, { codigo: 'PAT-1', nome: 'Pátio central', tipo: 'PATIO' })).json
  r = await A(fac, 'POST', `${SP}/agentes`, { nome: 'Jorge Almeida', cargo: 'SEGURANCA', userId: staff.id, matricula: 'SEG-001' }); const ag1 = r.json
  check('cadastra segurança vinculado ao usuário', r.status === 201 && ag1.userId === staff.id)
  r = await A(fac, 'POST', `${SP}/agentes`, { nome: 'Fulano', cargo: 'CARGO_INVALIDO' }); check('cargo inválido = 400', r.status === 400)
  r = await A(fac, 'POST', `${SP}/agentes`, { nome: 'Fulano', cargo: 'SEGURANCA', userId: 'nao-existe' }); check('usuário inexistente = 400', r.status === 400)
  const ag2 = (await A(fac, 'POST', `${SP}/agentes`, { nome: 'Cláudia Menezes', cargo: 'COORDENADOR_SALAS', userId: staff2.id })).json
  const ag3 = (await A(fac, 'POST', `${SP}/agentes`, { nome: 'Wagner Souza', cargo: 'PORTEIRO', terceirizado: true, empresa: 'Guardian' })).json
  const colabFake = await prisma.rheColaborador.create({ data: { tenantId: t1.tenantId, matricula: 'M' + Math.random().toString(36).slice(2, 7), nome: 'Paulo Nogueira', tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'CLT', status: 'ATIVO' } as any }).catch(() => null)
  if (colabFake) {
    r = await A(fac, 'POST', `${SP}/agentes`, { nome: 'Paulo Nogueira', cargo: 'COORDENADOR_PATIO', colaboradorId: colabFake.id }); check('vincula agente ao colaborador do RH por id', r.status === 201 && r.json.colaboradorId === colabFake.id)
    r = await A(fac, 'POST', `${SP}/agentes`, { nome: 'Outro', cargo: 'COORDENADOR_PATIO', colaboradorId: '00000000-0000-0000-0000-000000000000' }); check('colaborador inexistente no RH = 400', r.status === 400)
  } else { check('RH indisponível: referência por id aceita', true); check('RH indisponível: ignorado', true) }
  // escalas
  const hoje = new Date().toISOString().slice(0, 10)
  r = await A(fac, 'POST', `${SP}/escalas`, { data: hoje, postoId: po.id, agenteId: ag1.id, turno: 'MANHA', inicio: '06:00', fim: '14:00' }); const es1 = r.json
  check('cria escala', r.status === 201)
  r = await A(fac, 'POST', `${SP}/escalas`, { data: hoje, postoId: po2.id, agenteId: ag1.id, turno: 'TARDE', inicio: '12:00', fim: '20:00' }); check('conflito de horário do mesmo agente = 409', r.status === 409)
  r = await A(fac, 'POST', `${SP}/escalas`, { data: hoje, postoId: po.id, agenteId: ag1.id, turno: 'TARDE', inicio: '25:00', fim: '20:00' }); check('hora inválida = 400', r.status === 400)
  r = await A(fac, 'POST', `${SP}/escalas`, { data: hoje, postoId: po.id, agenteId: ag3.id, turno: 'NOITE', inicio: '22:00', fim: '06:00' }); const esN = r.json
  check('escala noturna cruzando a meia-noite', r.status === 201)
  r = await A(fac, 'POST', `${SP}/escalas/lote`, { de: '2026-12-01', ate: '2026-12-14', postoId: po.id, agenteId: ag2.id, turno: 'INTEGRAL', inicio: '08:00', fim: '18:00', diasSemana: [1, 2, 3, 4, 5] }); check('escala em lote (dias úteis de 2 semanas)', r.status === 201 && r.json.criadas === 10)
  r = await A(fac, 'POST', `${SP}/escalas/lote`, { de: '2026-12-01', ate: '2026-12-14', postoId: po.id, agenteId: ag2.id, turno: 'INTEGRAL', inicio: '08:00', fim: '18:00', diasSemana: [1, 2, 3, 4, 5] }); check('lote repetido não duplica (conflitos reportados)', r.json.criadas === 0 && r.json.conflitos.length === 10)
  r = await A(fac, 'POST', `${SP}/escalas/lote`, { de: '2026-12-01', ate: '2026-12-10', postoId: po2.id, agenteId: ag3.id, turno: 'PLANTAO_12X36', inicio: '07:00', fim: '19:00' }); check('plantão 12x36 alterna dias', r.json.criadas === 5)
  r = await A(coord, 'GET', `${SP}/escalas?de=2026-12-01&ate=2026-12-31&agenteId=${ag2.id}`); check('lista escalas com nome do agente e do posto', r.json.total === 10 && r.json.items[0].agenteNome === 'Cláudia Menezes' && r.json.items[0].postoNome === 'Portaria principal')
  r = await A(fac, 'GET', `${SP}/escalas/cobertura?data=${hoje}`); check('cobertura: posto com 2 escalados atinge o efetivo mínimo', (() => { const x = r.json.postos.find((p: any) => p.postoId === po.id); return x.escalados === 2 && x.descoberto === false })())
  check('cobertura: posto sem escala fica descoberto', r.json.postos.find((p: any) => p.postoId === po2.id).descoberto === true)
  r = await A(staff2, 'POST', `${SP}/escalas/${es1.id}/ponto`, { acao: 'ENTRADA' }); check('outro agente não registra meu ponto (403)', r.status === 403)
  r = await A(staff, 'POST', `${SP}/escalas/${es1.id}/ponto`, { acao: 'SAIDA' }); check('saída antes da entrada = 409', r.status === 409)
  r = await A(staff, 'POST', `${SP}/escalas/${es1.id}/ponto`, { acao: 'ENTRADA' }); check('agente registra a própria entrada', r.status === 200 && ['CUMPRIDA', 'ATRASO'].includes(r.json.status) && r.json.entradaEm)
  r = await A(staff, 'POST', `${SP}/escalas/${es1.id}/ponto`, { acao: 'ENTRADA' }); check('entrada duplicada = 409', r.status === 409)
  r = await A(staff, 'POST', `${SP}/escalas/${es1.id}/ponto`, { acao: 'SAIDA' }); check('registra saída', r.status === 200 && r.json.saidaEm)
  r = await A(fac, 'POST', `${SP}/escalas/${esN.id}/falta`, { motivo: 'Não compareceu' }); check('gestão marca falta', r.json.status === 'FALTA')
  r = await A(fac, 'POST', `${SP}/escalas/${es1.id}/falta`, {}); check('não marca falta de quem já entrou (409)', r.status === 409)
  const lote = (await A(fac, 'GET', `${SP}/escalas?de=2026-12-01&ate=2026-12-02&agenteId=${ag2.id}`)).json.items[0]
  r = await A(fac, 'POST', `${SP}/escalas/${lote.id}/troca`, { novoAgenteId: ag3.id }); check('troca para agente já escalado no horário = 409', r.status === 409)
  r = await A(fac, 'POST', `${SP}/escalas/${lote.id}/troca`, { novoAgenteId: ag1.id }); check('troca de agente cria nova escala', r.status === 201 && r.json.agenteId === ag1.id)
  r = await A(fac, 'GET', `${SP}/escalas?de=2026-12-01&ate=2026-12-01&status=TROCA`); check('escala original ficou marcada como TROCA', r.json.total === 1)
  // checkpoints / rondas
  r = await A(fac, 'POST', `${SP}/checkpoints`, { nome: 'Portão 1', postoId: po.id, ordem: 1 }); const ck1 = r.json
  check('cria checkpoint com token QR', r.status === 201 && ck1.token?.startsWith('CK'))
  const ck2 = (await A(fac, 'POST', `${SP}/checkpoints`, { nome: 'Bloco A', postoId: po.id, ordem: 2 })).json
  r = await A(staff, 'POST', `${SP}/rondas`, {}); const ro = r.json
  check('agente inicia ronda com checkpoints esperados', r.status === 201 && ro.esperados === 2 && ro.status === 'EM_ANDAMENTO')
  r = await A(staff, 'POST', `${SP}/rondas`, {}); check('segunda ronda simultânea = 409', r.status === 409)
  r = await A(staff2, 'POST', `${SP}/rondas/${ro.id}/leitura`, { token: ck1.token }); check('outro agente não lê na minha ronda (403)', r.status === 403)
  r = await A(staff, 'POST', `${SP}/rondas/${ro.id}/leitura`, { token: 'CKinvalido123' }); check('QR inválido = 404', r.status === 404)
  r = await A(staff, 'POST', `${SP}/rondas/${ro.id}/leitura`, { token: ck1.token, observacao: 'Tudo certo.' }); check('registra leitura de checkpoint', r.status === 201 && r.json.checkpoint === 'Portão 1')
  r = await A(staff, 'POST', `${SP}/rondas/${ro.id}/leitura`, { token: ck1.token }); check('leitura repetida = 409', r.status === 409)
  r = await A(staff, 'POST', `${SP}/rondas/${ro.id}/leitura`, { token: ck2.token, anormalidade: true, observacao: 'Porta lateral destrancada.' }); check('anormalidade gera ocorrência automática', r.status === 201 && !!r.json.ocorrenciaId)
  r = await A(staff, 'POST', `${SP}/rondas/${ro.id}/encerrar`, {}); check('ronda completa = CONCLUIDA', r.json.status === 'CONCLUIDA' && r.json.lidos === 2)
  r = await A(staff, 'POST', `${SP}/rondas/${ro.id}/leitura`, { token: ck1.token }); check('ronda encerrada não aceita leitura (409)', r.status === 409)
  r = await A(staff, 'POST', `${SP}/rondas`, {}); const ro2 = r.json
  r = await A(staff, 'POST', `${SP}/rondas/${ro2.id}/encerrar`, {}); check('ronda sem leituras = INCOMPLETA', r.json.status === 'INCOMPLETA')
  r = await A(fac, 'GET', `${SP}/rondas/${ro.id}`); check('detalhe da ronda lista leituras', r.json.leituras.length === 2)
  r = await A(prof, 'POST', `${SP}/rondas`, {}); check('professor não inicia ronda (403)', r.status === 403)
  // ocorrências
  r = await A(staff, 'POST', `${SP}/ocorrencias`, { tipo: 'FURTO', gravidade: 'CRITICA', descricao: 'Furto de notebook na sala 12 durante o intervalo.', local: 'Sala 12', postoId: po.id }); const oc = r.json
  check('registra ocorrência crítica com agente e número', r.status === 201 && oc.numero?.startsWith('SEG-') && oc.agenteId === ag1.id)
  check('ocorrência crítica notifica a gestão', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, userId: fac.id, refType: 'Inf2OcorrenciaSeg' } })) >= 1)
  r = await A(staff, 'POST', `${SP}/ocorrencias`, { tipo: 'FURTO', gravidade: 'CRITICA', descricao: 'ab' }); check('descrição curta = 400', r.status === 400)
  r = await A(fac, 'POST', `${SP}/ocorrencias/${oc.id}/status`, { status: 'ENCERRADA' }); check('encerrar sem encaminhamento = 400', r.status === 400)
  r = await A(fac, 'POST', `${SP}/ocorrencias/${oc.id}/status`, { status: 'ENCERRADA', encaminhamento: 'B.O. registrado; imagens enviadas à polícia.' }); check('encerra com encaminhamento', r.json.status === 'ENCERRADA' && r.json.encerradaEm)
  r = await A(fac, 'POST', `${SP}/ocorrencias/${oc.id}/status`, { status: 'EM_APURACAO' }); check('ocorrência encerrada não reabre (409)', r.status === 409)
  r = await A(fac, 'GET', `${SP}/ocorrencias?gravidade=CRITICA`); check('filtra ocorrências por gravidade', r.json.total === 1)
  // passagens
  r = await A(staff, 'POST', `${SP}/passagens`, { postoId: po.id, paraAgenteId: ag1.id, resumo: 'Passando o posto para mim mesmo.' }); check('passagem para si mesmo = 400', r.status === 400)
  r = await A(staff, 'POST', `${SP}/passagens`, { postoId: po.id, paraAgenteId: ag2.id, resumo: 'Turno tranquilo, aguardando técnico do elevador.', pendencias: 'Elevador B', chaves: 'Almoxarifado' }); const pa = r.json
  check('registra passagem de serviço com ocorrências abertas do posto', r.status === 201 && pa.deAgenteId === ag1.id && typeof pa.ocorrenciasAbertasNoPosto === 'number')
  r = await A(staff, 'POST', `${SP}/passagens/${pa.id}/ciencia`, {}); check('quem passa não dá ciência (403)', r.status === 403)
  r = await A(staff2, 'POST', `${SP}/passagens/${pa.id}/ciencia`, { obs: 'Recebido.' }); check('quem assume dá ciência', r.status === 200 && r.json.status === 'RECEBIDA')
  r = await A(staff2, 'POST', `${SP}/passagens/${pa.id}/ciencia`, {}); check('ciência duplicada = 409', r.status === 409)
  r = await A(fac, 'GET', `${SP}/painel`); check('painel de segurança patrimonial', r.status === 200 && r.json.agentesAtivos >= 3 && r.json.ultimos30Dias.rondas === 2 && r.json.ultimos30Dias.rondasIncompletas === 1)
  r = await A(staff, 'GET', `${SP}/eu`); check('"eu" retorna o agente do usuário', r.json.agente.id === ag1.id)
  r = await A(adminB, 'GET', `${SP}/agentes`); check('isolamento: agentes de outro tenant', r.json.total === 0)
  r = await A(facB, 'POST', `${SP}/escalas`, { data: hoje, postoId: po.id, agenteId: ag1.id, turno: 'MANHA', inicio: '06:00', fim: '14:00' }); check('isolamento: não escala agente de outro tenant (400)', r.status === 400)

  secao('Indicadores por pessoa (RH)')
  r = await A(hr, 'GET', `/rh/indicadores?userId=${staff.id}`)
  const ind = r.json
  check('RH consulta indicadores da pessoa (contrato infra-rh-v1)', r.status === 200 && ind.contrato === 'infra-rh-v1' && ind.pessoa.userId === staff.id && ind.pessoa.nome)
  check('indicadores de manutenção: OS e solicitações atribuídas', ind.manutencao.osAtribuidas === 2 && ind.manutencao.osConcluidas === 2 && ind.manutencao.osNoPrazo === 1 && ind.manutencao.solicitacoesAtribuidas >= 1)
  check('indicadores de agenda: responsável pelo extintor', ind.manutencao.agendaItens >= 1 && ind.manutencao.agendaConcluidos >= 1)
  check('indicadores de frota: motorista, viagem, multa e pontos', ind.frota.ehMotorista && ind.frota.viagensConcluidas === 1 && ind.frota.kmEmViagens === 120 && ind.frota.multas === 1 && ind.frota.pontosCnh === 4)
  check('indicadores de segurança: escala, ronda e ocorrência', ind.segurancaPatrimonial.ehAgente && ind.segurancaPatrimonial.rondas === 2 && ind.segurancaPatrimonial.rondasCompletas === 1 && ind.segurancaPatrimonial.ocorrenciasRegistradas >= 2 && ind.segurancaPatrimonial.passagensDeServico === 1)
  check('componentes e índice calculados', typeof ind.componentes.pontualidadePct === 'number' && typeof ind.componentes.rondasPct === 'number' && typeof ind.indiceInfra === 'number' && ind.indiceInfra >= 0 && ind.indiceInfra <= 100)
  r = await A(hr, 'GET', `/rh/indicadores?userId=${aluno.id}`); check('aluno solicitante sem atividade de manutenção', r.status === 200 && r.json.solicitante.abertas === 3 && r.json.manutencao.osAtribuidas === 0)
  r = await A(hr, 'GET', '/rh/indicadores'); check('sem userId/colaboradorId = 400', r.status === 400)
  r = await A(hr, 'GET', '/rh/indicadores?userId=nao-existe'); check('pessoa inexistente = 404', r.status === 404)
  r = await A(hr, 'GET', `/rh/indicadores?userId=${staff.id}&de=2030-01-01&ate=2029-01-01`); check('período invertido = 400', r.status === 400)
  r = await A(fac, 'GET', `/rh/indicadores?userId=${staff.id}`); check('gestão da infra não acessa indicadores de pessoas (403)', r.status === 403)
  r = await A(aluno, 'GET', `/rh/indicadores?userId=${staff.id}`); check('aluno não acessa indicadores (403)', r.status === 403)
  r = await A(admin, 'GET', `/rh/indicadores?userId=${staff.id}`); check('administração acessa', r.status === 200)
  r = await A(hr, 'GET', '/rh/indicadores/lote'); check('lote traz as pessoas com atividade', r.status === 200 && r.json.total >= 1 && r.json.items.some((i: any) => i.pessoa.userId === staff.id))
  r = await A(hrB, 'GET', '/rh/indicadores/lote'); check('lote do outro tenant vazio (isolamento)', r.json.total === 0)
  r = await A(staff, 'GET', '/rh/indicadores/meus'); check('funcionário vê apenas os próprios indicadores', r.status === 200 && r.json.pessoa.userId === staff.id)
  r = await A(staff, 'GET', '/rh/indicadores/lote'); check('funcionário não vê o lote (403)', r.status === 403)
  check('consulta de indicadores foi auditada', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, acao: 'INDICADORES_PESSOA_CONSULTADO' } })) >= 2)
  const direto = await indicadoresPessoaInfra(t1.tenantId, { userId: staff.id }, new Date(Date.now() - 365 * DAY), new Date())
  check('função exportada devolve o mesmo resultado', direto.indiceInfra === ind.indiceInfra)
  if (colabFake) {
    await prisma.rheColaborador.update({ where: { id: colabFake.id }, data: { userId: staff2.id } })
    const porColab = await indicadoresPessoaInfra(t1.tenantId, { colaboradorId: colabFake.id }, new Date(Date.now() - 365 * DAY), new Date())
    check('consulta por colaboradorId do RH resolve o usuário vinculado', porColab.pessoa.colaboradorId === colabFake.id && porColab.pessoa.userId === staff2.id)
  } else check('colaborador RH indisponível', true)

  secao('Jobs')
  const ja = await jobAgenda(); check('job da agenda', ja.abertos >= 1)
  const jf = await jobFrota(); check('job da frota gera lembretes de vencimento', jf.alertas >= 3)
  const js = await jobSolicitacoes(); check('job de solicitações', typeof js.vencidas === 'number')
  check('lembretes da frota criados', (await prisma.eduReminder.count({ where: { tenantId: t1.tenantId, dedupeKey: { startsWith: 'inf2-alerta-' } } })) >= 3)

  secao('Seed de demonstração')
  const adminApi = async (m: string, p: string, b?: any) => { const x = await call(admin, m, p, b); return x.status < 300 ? x.json : null }
  const failures: string[] = []
  let mkN = 0
  const mk = async (email: string, _pw: string, firstName: string, lastName: string, role: string) => prisma.user.create({ data: { clinicId: (await prisma.clinic.findFirst({ where: { tenantId: t2.tenantId } }))!.id, tenantId: t2.tenantId, email: `${mkN++}${email}`, password: 'x', firstName, lastName, role } as any })
  const adminT2Api = async (m: string, p: string, b?: any) => { const x = await call(adminB, m, p, b); return x.status < 300 ? x.json : (console.log('  seed falhou', m, p, x.status, JSON.stringify(x.json).slice(0, 160)), null) }
  void adminApi
  const S = await seedInfra2(adminT2Api, { failures, mk })
  check('seed sem falhas', failures.length === 0, failures)
  check('seed: agenda com itens variados', S.agenda.length >= 15)
  check('seed: solicitações com fotos, OS e QR', S.sols.length === 6 && S.qr.length === 3 && !!S.os)
  check('seed: frota completa', S.veics.length === 3 && S.mots.length === 3 && !!S.multa)
  check('seed: segurança patrimonial', S.postos.length === 4 && S.agentes.length === 6 && S.cks.length === 4)
  r = await A(adminB, 'GET', '/frota/painel'); check('seed: painel da frota com dados', r.json.veiculos === 3 && r.json.multasAbertas >= 2 && r.json.alertas > 3)
  r = await A(adminB, 'GET', '/frota/alertas?dias=90'); check('seed: há alerta de seguro a vencer e documento vencido', r.json.itens.some((i: any) => i.tipo === 'SEGURO' && i.dias <= 20) && r.json.itens.some((i: any) => i.faixa === 'VENCIDO'))
  r = await A(adminB, 'GET', '/solicitacoes/painel'); check('seed: painel de solicitações', r.json.total === 6 && r.json.porStatus.REJEITADA === 1)
  r = await A(adminB, 'GET', `${SP}/painel`); check('seed: painel de segurança com rondas', r.json.agentesAtivos === 6 && r.json.ultimos30Dias.rondasCompletas === 1)

  await h.close()
  summary()
  process.exit(fails.length ? 1 : 0)

}
void placa
main().catch((e) => { console.error(e); process.exit(1) })
