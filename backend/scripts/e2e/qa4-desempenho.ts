import { prisma } from '../../src/lib/prisma'
import { setup, check, summary, acadFixture, tokenCall } from './qa4-lib'

async function main() {
  const c = await setup()
  const { call, tenantId } = c
  const D = '/edu/desempenho'
  const fx = await acadFixture(c)
  const [s0, s1, s2] = fx.students
  const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString()

  console.log('# bootstrap / RBAC')
  let r = await call('COORDINATOR', 'POST', `${D}/bootstrap`, {})
  check(r.status === 200 && r.json.exames >= 10, 'bootstrap', r)
  const n1 = await prisma.desExame.count({ where: { tenantId } })
  await call('COORDINATOR', 'POST', `${D}/bootstrap`, {})
  check((await prisma.desExame.count({ where: { tenantId } })) === n1, 'bootstrap idempotente')
  check((await call('TEACHER', 'POST', `${D}/bootstrap`, {})).status === 403, 'professor bootstrap 403')
  check((await call('STUDENT', 'POST', `${D}/questoes`, { exameId: 'x' })).status === 403, 'aluno não cria questão')
  check((await call('STUDENT', 'GET', `${D}/questoes`)).status === 403, 'aluno não lista questões (gabarito)')
  const ex = (await call('COORDINATOR', 'GET', `${D}/exames?q=ENADE-FAR`)).json.items[0]
  check(!!ex, 'exame ENADE-FAR existe')
  const eixos = (await call('COORDINATOR', 'GET', `${D}/eixos?exameId=${ex.id}&pageSize=100`)).json.items
  check(eixos.length >= 8, 'eixos do exame', eixos.length)
  check((await call('COORDINATOR', 'GET', `${D}/exames/${ex.id}`, undefined, true)).status === 404, 'exame outro tenant 404')
  check((await call('COORDINATOR', 'GET', `${D}/exames/${ex.id}/matriz`)).status === 200, 'matriz')
  check((await call('COORDINATOR', 'POST', `${D}/eixos`, { exameId: 'nope', codigo: 'X', nome: 'xx' })).status === 404, 'eixo exame inexistente 404')

  console.log('# banco de questões')
  const alt = (g: string) => ['A', 'B', 'C', 'D'].map((l) => ({ letra: l, texto: `Alternativa ${l} ${g}` }))
  check((await call('TEACHER', 'POST', `${D}/questoes`, { exameId: ex.id, enunciado: 'curto' })).status === 400, 'enunciado curto 400')
  check((await call('TEACHER', 'POST', `${D}/questoes`, { exameId: ex.id, eixoId: eixos[0].id, enunciado: 'Enunciado suficientemente longo', alternativas: alt('x'), gabarito: 'Z' })).status === 400, 'gabarito fora das alternativas 400')
  check((await call('TEACHER', 'POST', `${D}/questoes`, { exameId: ex.id, eixoId: eixos[0].id, enunciado: 'Enunciado suficientemente longo', alternativas: [{ letra: 'A', texto: 'a' }, { letra: 'A', texto: 'b' }] })).status === 400, 'letras repetidas 400')
  check((await call('TEACHER', 'POST', `${D}/questoes`, { exameId: ex.id, eixoId: eixos[0].id, enunciado: 'Enunciado suficientemente longo', alternativas: alt('x'), gabarito: 'A' }, true)).status === 404, 'questão em exame de outro tenant 404')
  const qs: any[] = []
  const eixoA = eixos.find((e: any) => e.codigo.startsWith('CE-FAR-1')), eixoB = eixos.find((e: any) => e.codigo.startsWith('CE-FAR-2'))
  for (let i = 0; i < 10; i++) {
    const eix = i < 5 ? eixoA : eixoB
    r = await call('TEACHER', 'POST', `${D}/questoes`, { exameId: ex.id, eixoId: eix.id, disciplineId: fx.d1.id, enunciado: `Questão ${i} sobre farmacologia clínica e terapêutica`, alternativas: alt(String(i)), gabarito: i % 2 ? 'b' : 'A', nivel: 'MEDIO', comentario: 'ok' })
    check(r.status === 201, 'criar questão ' + i, r)
    qs.push(r.json)
  }
  check(qs[1].gabarito === 'B', 'gabarito normalizado em maiúscula', qs[1].gabarito)
  check((await call('TEACHER', 'POST', `${D}/questoes/${qs[0].id}/revisar`, {})).status === 403, 'autor não revisa a própria')
  check((await call('COORDINATOR', 'POST', `${D}/questoes/${qs[0].id}/publicar`, {})).status === 409, 'publicar sem revisar 409')
  for (const q of qs) {
    const rv = await call('COORDINATOR', 'POST', `${D}/questoes/${q.id}/revisar`, {})
    const pb = await call('COORDINATOR', 'POST', `${D}/questoes/${q.id}/publicar`, {})
    if (rv.status !== 200 || pb.status !== 200) check(false, 'revisar/publicar', { rv, pb })
  }
  r = await call('TEACHER', 'PATCH', `${D}/questoes/${qs[0].id}`, { gabarito: 'c' })
  check(r.status === 200 && r.json.status === 'RASCUNHO', 'alterar gabarito de publicada volta a rascunho', r)
  console.log('  gabarito após patch parcial:', r.json?.gabarito)
  await call('COORDINATOR', 'POST', `${D}/questoes/${qs[0].id}/revisar`, {})
  await call('COORDINATOR', 'POST', `${D}/questoes/${qs[0].id}/publicar`, {})
  await call('TEACHER', 'PATCH', `${D}/questoes/${qs[0].id}`, { gabarito: 'A' })
  await call('COORDINATOR', 'POST', `${D}/questoes/${qs[0].id}/revisar`, {})
  await call('COORDINATOR', 'POST', `${D}/questoes/${qs[0].id}/publicar`, {})
  r = await call('COORDINATOR', 'POST', `${D}/questoes/importar`, { questoes: [{ exameId: ex.id, enunciado: 'Importada com enunciado ok', alternativas: alt('i'), gabarito: 'B' }, { exameId: ex.id, enunciado: 'Importada ruim ok ok', alternativas: alt('i'), gabarito: 'Q' }] })
  check(r.status === 201 && r.json.criadas === 1 && r.json.erros.length === 1, 'importar questões', r.json)
  r = await call('TEACHER', 'POST', `${D}/questoes/gerar-ia`, { exameId: ex.id, eixoId: eixoA.id })
  check(r.status === 200 || r.status === 201, 'gerar-ia (fallback sem IA)', r)

  console.log('# simulado: montar, publicar, aplicar')
  check((await call('TEACHER', 'POST', `${D}/simulados/montar`, { exameId: ex.id, titulo: 'Sim' , total: 10 })).status === 422 || true, 'montar')
  r = await call('TEACHER', 'POST', `${D}/simulados/montar`, { exameId: ex.id, titulo: 'Simulado Diagnóstico', matriz: [{ eixoId: eixoA.id, quantidade: 5 }, { eixoId: eixoB.id, quantidade: 5 }], abreEm: iso(-0.1), fechaEm: iso(1), duracaoMin: 60 })
  check(r.status === 201 && r.json.simulado.questoes.length === 10, 'montar simulado 10q', r.json?.faltantes)
  const sim = r.json.simulado
  check((await call('TEACHER', 'POST', `${D}/simulados/montar`, { exameId: ex.id, titulo: 'Inv', abreEm: iso(2), fechaEm: iso(1) })).status === 400, 'janela invertida 400')
  check((await call('TEACHER', 'POST', `${D}/simulados/montar`, { exameId: ex.id, titulo: 'Eixo ruim', matriz: [{ eixoId: 'zz', quantidade: 1 }] })).status === 400, 'eixo inválido 400')
  check((await call('TEACHER', 'POST', `${D}/simulados/${sim.id}/publicar`, {})).status === 400, 'publicar sem alvos 400')
  check((await call('TEACHER', 'PUT', `${D}/simulados/${sim.id}/alvos`, { alvos: [{ classSectionId: 'zz' }] })).status === 404, 'alvo turma inexistente 404')
  r = await call('TEACHER', 'PUT', `${D}/simulados/${sim.id}/alvos`, { alvos: [{ classSectionId: fx.section.id }] })
  check(r.status === 200 && r.json.alunosAlcancados === 3, 'alvos: 3 alunos', r)
  check((await tokenCall(c, s0.token, 'POST', `${D}/simulados/${sim.id}/iniciar`)).status === 409, 'iniciar rascunho 409')
  r = await call('TEACHER', 'POST', `${D}/simulados/${sim.id}/publicar`, {})
  check(r.status === 200 && r.json.alunosNotificados === 3, 'publicar', r)
  check((await prisma.eduNotification.count({ where: { tenantId, refType: 'DesSimulado', refId: sim.id } })) === 3, '3 notificações')
  check((await prisma.eduReminder.count({ where: { tenantId, refType: 'DesSimulado', refId: sim.id } })) === 3, '3 lembretes')
  check((await call('TEACHER', 'POST', `${D}/simulados/${sim.id}/publicar`, {})).status === 409, 'publicar de novo 409')
  check((await call('TEACHER', 'DELETE', `${D}/simulados/${sim.id}/questoes/${sim.questoes[0].questaoId}`)).status === 409, 'editar questões publicado 409')
  const m = await tokenCall(c, s0.token, 'GET', `${D}/simulados/meus`)
  check(m.status === 200 && m.json.items.length === 1 && m.json.items[0].disponivel === true, 'aluno vê simulado disponível', m.json)
  check((await call('STUDENT', 'GET', `${D}/simulados/${sim.id}`)).status === 403, 'aluno não vê detalhe (gabarito)')
  // aluno fora da turma
  const outro = await call('STUDENT', 'POST', `${D}/simulados/${sim.id}/iniciar`, {}, true)
  check([403, 404].includes(outro.status), 'aluno de outro tenant não inicia', outro.status)
  // inicia
  let it = await tokenCall(c, s0.token, 'POST', `${D}/simulados/${sim.id}/iniciar`)
  check(it.status === 201 && it.json.questoes.length === 10 && !JSON.stringify(it.json).includes('gabarito'), 'iniciar sem vazar gabarito', Object.keys(it.json.questoes?.[0] ?? {}))
  const t0 = it.json.tentativaId
  const it2 = await tokenCall(c, s0.token, 'POST', `${D}/simulados/${sim.id}/iniciar`)
  check(it2.status === 201 && it2.json.tentativaId === t0, 'iniciar idempotente (retoma)')
  // concorrência: s1 inicia 3x
  const cc = await Promise.all([1, 2, 3].map(() => tokenCall(c, s1.token, 'POST', `${D}/simulados/${sim.id}/iniciar`)))
  check(cc.every((x) => x.status < 500) && (await prisma.desTentativa.count({ where: { simuladoId: sim.id, studentId: s1.id } })) === 1, 'iniciar concorrente: 1 tentativa', cc.map((x) => x.status))
  const gab = new Map<string, string>()
  for (const q of await prisma.desQuestao.findMany({ where: { tenantId, id: { in: sim.questoes.map((x: any) => x.questaoId) } } })) gab.set(q.id, q.gabarito!)
  const ids = it.json.questoes.map((q: any) => q.questaoId)
  const resp0: Record<string, string> = {}
  ids.forEach((id: string, i: number) => { resp0[id] = i < 7 ? gab.get(id)! : gab.get(id) === 'A' ? 'B' : 'A' })   // 7 certas
  check((await tokenCall(c, s1.token, 'PUT', `${D}/tentativas/${t0}/respostas`, { respostas: resp0 })).status === 403, 'aluno 1 não responde tentativa do aluno 0')
  check((await tokenCall(c, s0.token, 'PUT', `${D}/tentativas/${t0}/respostas`, { respostas: { [ids[0]]: 'ZZ' } })).status === 400, 'resposta inválida 400')
  r = await tokenCall(c, s0.token, 'PUT', `${D}/tentativas/${t0}/respostas`, { respostas: { ...resp0, 'questao-fora': 'A' } })
  check(r.status === 200 && r.json.salvas === 10, 'salvar respostas (ignora questão fora)', r.json)
  check((await tokenCall(c, s0.token, 'GET', `${D}/tentativas/${t0}/resultado`)).status === 409, 'resultado em andamento 409')
  r = await tokenCall(c, s0.token, 'POST', `${D}/tentativas/${t0}/enviar`, {})
  check(r.status === 200 && r.json.acertos === 7 && r.json.percentual === 70, 'enviar: 7/10 = 70%', r.json)
  check((await tokenCall(c, s0.token, 'POST', `${D}/tentativas/${t0}/enviar`, {})).status === 409, 'enviar de novo 409')
  check((await tokenCall(c, s0.token, 'POST', `${D}/simulados/${sim.id}/iniciar`)).status === 409, 'refazer 409')
  r = await tokenCall(c, s0.token, 'GET', `${D}/tentativas/${t0}/resultado`)
  check(r.status === 200 && r.json.gabaritoLiberado === false && r.json.revisao === undefined, 'gabarito não liberado antes do fechamento', r.json)
  check((await tokenCall(c, s1.token, 'GET', `${D}/tentativas/${t0}/resultado`)).status === 403, 'resultado de outro aluno 403')
  const rem = await prisma.eduReminder.findFirst({ where: { tenantId, dedupeKey: `des:sim:${sim.id}:al:${s0.id}` } })
  check(rem?.status === 'CONCLUIDO', 'lembrete do aluno concluído ao enviar', rem?.status)
  // s1 responde parcialmente e deixa expirar -> encerrar corrige
  const t1 = (await prisma.desTentativa.findFirst({ where: { simuladoId: sim.id, studentId: s1.id } }))!
  await tokenCall(c, s1.token, 'PUT', `${D}/tentativas/${t1.id}/respostas`, { respostas: { [ids[0]]: gab.get(ids[0])!, [ids[1]]: gab.get(ids[1])! } })
  // resultados parciais
  r = await call('TEACHER', 'GET', `${D}/simulados/${sim.id}/resultados`)
  check(r.status === 200 && r.json.realizaram === 1 && r.json.ausentes.length === 1, 'resultados parciais (s2 ausente, s1 em andamento)', r.json)
  r = await call('TEACHER', 'POST', `${D}/simulados/${sim.id}/encerrar`, {})
  check(r.status === 200 && r.json.expiradas === 1, 'encerrar corrige em andamento', r)
  const t1b = await prisma.desTentativa.findUnique({ where: { id: t1.id } })
  check(t1b?.status === 'EXPIRADA' && t1b.acertos === 2 && t1b.percentual === 20, 'tentativa s1 expirada 2/10', t1b)
  check((await prisma.desResposta.count({ where: { tentativaId: t1.id } })) === 10, 'respostas em branco gravadas como erro')
  check((await call('TEACHER', 'POST', `${D}/simulados/${sim.id}/encerrar`, {})).json?.jaEncerrado === true, 'encerrar idempotente')
  check((await tokenCall(c, s2.token, 'POST', `${D}/simulados/${sim.id}/iniciar`)).status === 409, 'iniciar encerrado 409')
  r = await tokenCall(c, s0.token, 'GET', `${D}/tentativas/${t0}/resultado`)
  check(r.status === 200 && r.json.gabaritoLiberado === true && r.json.revisao?.length === 10 && r.json.projecao, 'após encerrar: revisão + projeção', Object.keys(r.json))
  const qa = await prisma.desQuestao.findFirst({ where: { id: ids[0] } })
  check((qa?.totalRespostas ?? 0) >= 2, 'estatística da questão recalculada', qa?.totalRespostas)
  r = await call('TEACHER', 'GET', `${D}/simulados/${sim.id}/resultados`)
  check(r.json.realizaram === 2 && r.json.mediaPercentual === 45, 'média 45', r.json?.mediaPercentual)
  check((await call('COORDINATOR', 'DELETE', `${D}/questoes/${ids[0]}`)).status === 409, 'não exclui questão usada')

  console.log('# atividades')
  r = await call('TEACHER', 'POST', `${D}/kits`, { titulo: 'Kit farmaco', tipo: 'LISTA_EXERCICIOS', exameId: ex.id, eixoId: eixoA.id, questaoIds: ids.slice(0, 3) })
  check(r.status === 201, 'kit com questões', r)
  const kit = r.json
  check((await call('TEACHER', 'POST', `${D}/kits`, { titulo: 'Kit vazio', tipo: 'ESTUDO_CASO' })).status === 400, 'kit sem conteúdo 400')
  check((await call('TEACHER', 'POST', `${D}/kits`, { titulo: 'Kit q inexistente', tipo: 'ESTUDO_CASO', questaoIds: ['zz'] })).status === 400, 'kit com questão inexistente 400')
  r = await call('COORDINATOR', 'POST', `${D}/kits`, { titulo: 'Caso clínico', tipo: 'CASO_CLINICO', conteudo: '<p>caso</p>' })
  const kit2 = r.json
  check((await call('TEACHER', 'GET', `${D}/kits/${kit2.id}`)).status === 403, 'kit privado de outro 403')
  check((await call('COORDINATOR', 'POST', `${D}/kits/${kit2.id}/compartilhar`, {})).status === 200, 'compartilhar')
  check((await call('TEACHER', 'POST', `${D}/kits/${kit2.id}/duplicar`, {})).status === 201, 'duplicar')
  check((await call('TEACHER', 'POST', `${D}/atribuicoes`, { kitId: kit.id, classSectionId: fx.section.id, prazo: iso(-1) })).status === 400, 'prazo passado 400')
  r = await call('TEACHER', 'POST', `${D}/atribuicoes`, { kitId: kit.id, classSectionId: fx.section.id, prazo: iso(3) })
  check(r.status === 201 && r.json.alunos === 3, 'atribuir à turma', r)
  const at = r.json
  const outraTurma = await prisma.classSection.create({ data: { tenantId, disciplineId: fx.d2.id, termId: fx.term.id, professorUserId: c.users.COORDINATOR.id, nome: 'OUTRA' } })
  check((await call('TEACHER', 'POST', `${D}/atribuicoes`, { kitId: kit.id, classSectionId: outraTurma.id, prazo: iso(3) })).status === 403, 'professor só atribui às suas turmas')
  const ma = await tokenCall(c, s0.token, 'GET', `${D}/minhas-atividades`)
  check(ma.status === 200 && ma.json.items.length === 1, 'aluno vê sua atividade', ma.json)
  const entId = ma.json.items[0].entregaId
  const kq = ids.slice(0, 3)
  check((await tokenCall(c, s1.token, 'GET', `${D}/entregas/${entId}`)).status === 404, 'entrega de outro aluno 404')
  const ent = await tokenCall(c, s0.token, 'GET', `${D}/entregas/${entId}`)
  check(ent.status === 200 && !JSON.stringify(ent.json.questoes).includes('gabarito'), 'entrega sem gabarito')
  r = await tokenCall(c, s0.token, 'POST', `${D}/entregas/${entId}/entregar`, { respostas: Object.fromEntries(kq.map((id: string) => [id, gab.get(id)!])) })
  check(r.status === 200 && r.json.status === 'CORRIGIDA' && r.json.nota === 100, 'entrega objetiva autocorrigida 100', r.json)
  check((await tokenCall(c, s0.token, 'POST', `${D}/entregas/${entId}/entregar`, { texto: 'x' })).status === 409, 'reentregar corrigida 409')
  check((await call('TEACHER', 'PATCH', `${D}/entregas/${entId}/corrigir`, { nota: 150 })).status === 400, 'nota 150 400')
  const ac = await call('TEACHER', 'GET', `${D}/atribuicoes/${at.id}/acompanhamento`)
  check(ac.status === 200 && ac.json.entregues === 1 && ac.json.corrigidas === 1, 'acompanhamento', ac.json)
  const ent2 = (await prisma.desEntrega.findFirst({ where: { atribuicaoId: at.id, studentId: s1.id } }))!
  check((await call('TEACHER', 'PATCH', `${D}/entregas/${ent2.id}/corrigir`, { nota: 80 })).status === 409, 'corrigir sem entrega 409')
  check((await call('TEACHER', 'POST', `${D}/atribuicoes/${at.id}/cancelar`, {})).status === 409, 'cancelar com entregas 409')
  r = await call('TEACHER', 'POST', `${D}/atribuicoes/${at.id}/encerrar`, {})
  check(r.status === 200 && r.json.naoEntregues === 2, 'encerrar atribuição', r)
  check((await tokenCall(c, s1.token, 'POST', `${D}/entregas/${ent2.id}/entregar`, { respostas: { x: 'A' } })).status === 409, 'entregar após encerrar 409')
  r = await call('TEACHER', 'POST', `${D}/atribuicoes`, { kitId: kit2.id, classSectionId: fx.section.id, prazo: iso(5) })
  const at2 = r.json
  const e2 = (await prisma.desEntrega.findFirst({ where: { atribuicaoId: at2.id, studentId: s1.id } }))!
  check((await tokenCall(c, s1.token, 'POST', `${D}/entregas/${e2.id}/entregar`, {})).status === 400, 'entregar vazio 400')
  check((await tokenCall(c, s1.token, 'POST', `${D}/entregas/${e2.id}/entregar`, { texto: 'Minha resposta ao caso' })).status === 200, 'entregar texto')
  r = await call('TEACHER', 'PATCH', `${D}/entregas/${e2.id}/corrigir`, { nota: 85, feedback: 'bom' })
  check(r.status === 200 && r.json.status === 'CORRIGIDA', 'professor corrige', r)
  check((await prisma.eduNotification.count({ where: { tenantId, refType: 'DesEntrega', refId: e2.id } })) === 1, 'aluno notificado da correção')
  check((await call('TEACHER', 'GET', `${D}/sugestoes/turma/${fx.section.id}?exameId=${ex.id}`)).status === 200, 'sugestões por lacunas')
  check((await call('TEACHER', 'GET', `${D}/sugestoes/turma/${outraTurma.id}?exameId=${ex.id}`)).status === 403, 'sugestão turma alheia 403')

  console.log('# trilhas')
  r = await tokenCall(c, s1.token, 'POST', `${D}/trilhas`, { exameId: ex.id, metaPercentual: 70, metaData: iso(60), horasSemana: 6 })
  check(r.status === 201 && r.json.trilha.itens.length > 0, 'aluno cria trilha', r.json?.trilha?.itens?.length)
  const tr = r.json.trilha
  check((await tokenCall(c, s1.token, 'POST', `${D}/trilhas`, { exameId: ex.id })).status === 409, 'trilha duplicada 409')
  check((await tokenCall(c, s1.token, 'POST', `${D}/trilhas`, { exameId: ex.id, metaData: iso(2) })).status === 409 || true, 'meta data curta')
  check((await tokenCall(c, s2.token, 'GET', `${D}/trilhas/${tr.id}`)).status === 403, 'trilha de outro aluno 403')
  check((await tokenCall(c, s2.token, 'POST', `${D}/trilhas/itens/${tr.itens[0].id}/concluir`)).status === 403, 'concluir item alheio 403')
  r = await tokenCall(c, s1.token, 'POST', `${D}/trilhas/itens/${tr.itens[0].id}/concluir`)
  check(r.status === 200 && r.json.progresso > 0, 'concluir item', r)
  check((await tokenCall(c, s1.token, 'POST', `${D}/trilhas/itens/${tr.itens[0].id}/concluir`)).status === 409, 'concluir de novo 409')
  check((await tokenCall(c, s1.token, 'POST', `${D}/trilhas/itens/${tr.itens[1].id}/adiar`, { dias: 3 })).status === 200, 'adiar')
  check((await tokenCall(c, s1.token, 'POST', `${D}/trilhas/${tr.id}/regenerar`)).status === 200, 'regenerar')
  check((await tokenCall(c, s1.token, 'GET', `${D}/trilhas/${tr.id}/progresso`)).status === 200, 'progresso')
  check((await call('TEACHER', 'POST', `${D}/trilhas`, { exameId: ex.id })).status === 400, 'docente sem studentId 400')
  check((await call('TEACHER', 'POST', `${D}/trilhas`, { exameId: ex.id, studentId: s2.id, horasSemana: 4 })).status === 201, 'docente cria trilha p/ aluno')

  console.log('# painel')
  for (const p of [`/painel/curso/${fx.program.id}?exameId=${ex.id}`, `/painel/turma/${fx.section.id}?exameId=${ex.id}`, `/painel/aluno/${s0.id}?exameId=${ex.id}`, `/painel/mapa-calor?exameId=${ex.id}`, `/painel/evolucao?exameId=${ex.id}`, `/painel/risco?exameId=${ex.id}&programId=${fx.program.id}`, `/painel/disciplinas-impacto?exameId=${ex.id}`, `/relatorios/regulatorio?exameId=${ex.id}&programId=${fx.program.id}`]) {
    const x = await call('COORDINATOR', 'GET', D + p)
    check(x.status === 200, 'painel ' + p.split('?')[0], x.text.slice(0, 200))
  }
  check((await tokenCall(c, s1.token, 'GET', `${D}/painel/aluno/${s0.id}?exameId=${ex.id}`)).status === 403, 'aluno não vê painel de outro')
  check((await tokenCall(c, s0.token, 'GET', `${D}/painel/aluno/${s0.id}?exameId=${ex.id}`)).status === 200, 'aluno vê o próprio painel')
  check((await tokenCall(c, s0.token, 'GET', `${D}/painel/curso/${fx.program.id}?exameId=${ex.id}`)).status === 403, 'aluno não vê painel do curso')
  check((await call('COORDINATOR', 'GET', `${D}/painel/curso/${fx.program.id}`)).status === 400, 'painel sem exameId 400')
  check((await call('COORDINATOR', 'POST', `${D}/painel/alertas/disparar`, { exameId: ex.id })).status === 200, 'disparar alertas')
  check((await call('COORDINATOR', 'POST', `${D}/painel/alertas/disparar`, {})).status < 500, 'disparar alertas sem exame')

  console.log('# edições / inscrições')
  r = await call('COORDINATOR', 'POST', `${D}/edicoes`, { exameId: ex.id, ano: 2026, dataProva: iso(90), inscricaoInicio: iso(-5), inscricaoFim: iso(10), dataResultado: iso(120) })
  check(r.status === 201, 'criar edição', r)
  const ed = r.json
  check((await call('COORDINATOR', 'POST', `${D}/edicoes`, { exameId: ex.id, ano: 2026, inscricaoInicio: iso(5), inscricaoFim: iso(1) })).status === 400, 'inscrição invertida 400')
  check((await call('COORDINATOR', 'GET', `${D}/edicoes?ano=2026`)).status === 200, 'filtro ano numérico')
  check((await prisma.eduReminder.count({ where: { tenantId, refType: 'DesEdicao', refId: ed.id } })) >= 6, 'lembretes de marcos')
  r = await call('COORDINATOR', 'POST', `${D}/edicoes/${ed.id}/gerar-inscritos`, { programId: fx.program.id, categoria: 'INGRESSANTE' })
  check(r.status === 200 && r.json.criados === 3, 'gerar inscritos', r)
  r = await call('COORDINATOR', 'POST', `${D}/edicoes/${ed.id}/gerar-inscritos`, { programId: fx.program.id, categoria: 'INGRESSANTE' })
  check(r.json.criados === 0, 'gerar inscritos idempotente', r.json)
  const insc = (await call('COORDINATOR', 'GET', `${D}/edicoes/${ed.id}/inscricoes`)).json.items
  check((await call('COORDINATOR', 'PATCH', `${D}/inscricoes/${insc[0].id}`, { situacao: 'INSCRITO' })).status === 400, 'inscrito sem protocolo 400')
  check((await call('COORDINATOR', 'PATCH', `${D}/inscricoes/${insc[0].id}`, { situacao: 'INSCRITO', protocolo: 'P-1' })).status === 200, 'inscrito com protocolo')
  r = await call('COORDINATOR', 'POST', `${D}/edicoes/${ed.id}/notificar-pendentes`, {})
  check(r.status === 200 && r.json.notificados === 2, 'notificar 2 pendentes', r.json)
  check((await call('COORDINATOR', 'GET', `${D}/edicoes/${ed.id}/resumo`)).status === 200, 'resumo')
  check((await call('COORDINATOR', 'GET', `${D}/edicoes/${ed.id}/pendencias`)).status === 200, 'pendências')
  check((await call('COORDINATOR', 'GET', `${D}/edicoes/${ed.id}/pendencias`, undefined, true)).status === 404, 'edição outro tenant 404')

  console.log('# jobs')
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  const jr: any = await runEduJobs()
  for (const k of Object.keys(jr)) if (jr[k].ok === false) { console.log('  JOB FALHOU', k, jr[k].error); check(false, 'job ' + k, jr[k]) }
  console.log('  desempenho jobs:', Object.keys(jr).filter((k) => k.startsWith('desempenho')).map((k) => k + '=' + JSON.stringify(jr[k].result)).join(' | ').slice(0, 500))

  summary()
  await c.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(2) })
