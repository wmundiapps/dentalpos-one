/**
 * E2E: Comissão de avaliação do MEC + seed "instituição nota máxima" (dados FICTÍCIOS).
 * Banco local próprio:  DATABASE_URL=postgresql://... npx tsx scripts/e2e/mec-comissao.ts
 */
import { setup, check, finish } from './qa3-common'
import { prisma } from '../../src/lib/prisma'
import { runEduJobs } from '../../src/modules/core/jobs'
import { seedMecComissao } from '../seeds/mec-comissao'
import * as L from '../../src/modules/regulatorio/mecLogic'

const DAY = 86_400_000
const iso = (n: number) => new Date(Date.now() + n * DAY).toISOString()

async function main() {
  const c = await setup()
  const T = c.tenantA
  const R = '/edu/regulatorio'
  const M = `${R}/mec`
  const admin = c.as('ADMIN'), rector = c.as('RECTOR'), coord = c.as('COORDINATOR'), staff = c.as('STAFF'), teacher = c.as('TEACHER'), student = c.as('STUDENT'), adminB = c.asB('ADMIN')
  const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])

  console.log('# lógica pura (mecLogic)')
  check('nivelPrazo vencido', L.nivelPrazo(-1) === 'VENCIDO')
  check('nivelPrazo 0 crítico', L.nivelPrazo(0) === 'CRITICO')
  check('nivelPrazo 7 crítico', L.nivelPrazo(7) === 'CRITICO')
  check('nivelPrazo 8 alto', L.nivelPrazo(8) === 'ALTO')
  check('nivelPrazo 15 alto', L.nivelPrazo(15) === 'ALTO')
  check('nivelPrazo 30 atenção', L.nivelPrazo(30) === 'ATENCAO')
  check('nivelPrazo 31 normal', L.nivelPrazo(31) === 'NORMAL')
  check('ehCritico alto', L.ehCritico('ALTO') && !L.ehCritico('ATENCAO'))
  check('severidade crítico', L.severidadeLembrete('VENCIDO') === 'CRITICO' && L.severidadeLembrete('ALTO') === 'ATENCAO' && L.severidadeLembrete('NORMAL') === 'INFO')
  check('7 fases do processo', L.FASES_MEC.length === 7)
  const fi = L.fasesIniciais(new Date(), 'AVALIACAO_IN_LOCO', new Date(Date.now() - 100 * DAY))
  check('fases iniciais: 3 concluídas até designação', fi.filter((f) => f.status === 'CONCLUIDA').length === 3 && fi[3].status === 'EM_ANDAMENTO' && fi[4].status === 'PENDENTE')
  check('fase atual = visita', L.faseAtual(fi)?.chave === 'VISITA_IN_LOCO')
  check('progresso das fases', L.progressoFases(fi) === Math.round((3 / 7) * 1000) / 10)
  const sim1 = L.simularConceitoComissao([{ dimensao: 'ORGANIZACAO_DIDATICO_PEDAGOGICA', conceitoEstimado: 5 }, { dimensao: 'CORPO_DOCENTE_TUTORIAL', conceitoEstimado: 5 }, { dimensao: 'INFRAESTRUTURA', conceitoEstimado: 4 }])
  check('simulação 5/5/4 = 4,7 faixa 5', sim1.disponivel && sim1.continuo === 4.7 && sim1.faixa === 5, sim1)
  const sim2 = L.simularConceitoComissao([{ dimensao: 'ORGANIZACAO_DIDATICO_PEDAGOGICA', conceitoEstimado: 2 }, { dimensao: 'CORPO_DOCENTE_TUTORIAL', conceitoEstimado: 2 }, { dimensao: 'INFRAESTRUTURA', conceitoEstimado: 2 }])
  check('simulação insatisfatória alerta', sim2.faixa === 2 && sim2.alertas.some((a) => /insatisfat/i.test(a)))
  check('simulação sem dimensão indisponível', !L.simularConceitoComissao([{ dimensao: 'INFRAESTRUTURA', conceitoEstimado: 4 }]).disponivel)
  check('simulação sobrescrever', L.simularConceitoComissao([], { ORGANIZACAO_DIDATICO_PEDAGOGICA: 5, CORPO_DOCENTE_TUTORIAL: 5, INFRAESTRUTURA: 5 }).faixa === 5)
  let lancou = false; try { L.simularConceitoComissao([], { INFRAESTRUTURA: 9 }) } catch { lancou = true }
  check('simulação conceito fora de 1..5 lança', lancou)
  check('classificarTitulacao', L.classificarTitulacao('Doutora em Educação') === 'DOUTOR' && L.classificarTitulacao('Mestre') === 'MESTRE' && L.classificarTitulacao('Especialista') === 'ESPECIALISTA' && L.classificarTitulacao('') === 'NAO_INFORMADA')
  const cd = L.resumoCorpoDocente([{ titulacao: 'Doutor', regime: 'INTEGRAL' }, { titulacao: 'Mestre', regime: 'PARCIAL' }, { titulacao: 'Especialista', regime: 'HORISTA' }, { titulacao: 'Doutor', regime: 'INTEGRAL' }])
  check('resumo corpo docente', cd.pctDoutores === 50 && cd.pctMestresDoutores === 75 && cd.pctIntegral === 50 && cd.pctIntegralParcial === 75, cd)
  check('faixaContinuo cortes', L.faixaContinuo(3.945) === 5 && L.faixaContinuo(3.94) === 4 && L.faixaContinuo(0.5) === 1 && L.faixaContinuo(2.9) === 3 && L.faixaContinuo(2.95) === 4)
  const pz = L.montarPrazos({
    processo: { id: 'p', etapa: 'PREPARACAO', prazoProtocolo: new Date(Date.now() + 3 * DAY) },
    fases: [{ id: 'f1', chave: 'PROTOCOLO', nome: 'Protocolo', status: 'CONCLUIDA', previstaEm: new Date(Date.now() - DAY) }, { id: 'f2', chave: 'RELATORIO', nome: 'Relatório', status: 'PENDENTE', previstaEm: new Date(Date.now() + 40 * DAY) }],
    visita: { id: 'v', inicio: new Date(Date.now() + 10 * DAY), status: 'AGENDADA' },
    evidencias: [{ id: 'e', indicadorCodigo: '1.1', status: 'PENDENTE', obrigatorio: true, prazo: new Date(Date.now() - 2 * DAY) }, { id: 'e2', indicadorCodigo: '1.2', status: 'ATENDIDO', obrigatorio: true, prazo: new Date(Date.now() - 2 * DAY) }],
    diligencias: [{ id: 'd', descricao: 'Apresentar PPC', status: 'ABERTA', prazoResposta: new Date(Date.now() + 5 * DAY) }],
  })
  check('montarPrazos ignora concluídos/atendidos', pz.length === 5 && !pz.some((x) => x.refId === 'f1' || x.refId === 'e2'), pz.map((x) => x.titulo))
  check('montarPrazos ordenado e vencido primeiro', pz[0].nivel === 'VENCIDO' && pz[0].origem === 'EVIDENCIA')

  console.log('# RBAC, validação e isolamento (antes do seed)')
  check('catálogo admin 200', (await admin('GET', `${M}/catalogo`)).status === 200)
  const cat = (await admin('GET', `${M}/catalogo`)).body
  check('catálogo tem 5 tipos, 3 dimensões e 7 fases', cat.tipos.length === 5 && cat.dimensoes.length === 3 && cat.fases.length === 7, cat)
  check('catálogo traz aviso de simulação', /simula/i.test(cat.aviso || ''))
  check('painel staff lê', (await staff('GET', `${M}/painel`)).status === 200)
  check('painel student 403', (await student('GET', `${M}/painel`)).status === 403)
  check('painel teacher 403', (await teacher('GET', `${M}/painel`)).status === 403)
  check('painel reitor lê', (await rector('GET', `${M}/painel`)).status === 200)
  check('excelência student 403', (await student('GET', `${M}/excelencia`)).status === 403)
  check('conceito staff não escreve', (await staff('POST', `${M}/conceitos`, { tipo: 'CI', ano: 2026, faixa: 5 })).status === 403)
  check('avisos processar staff 403', (await staff('POST', `${M}/avisos/processar`, {})).status === 403)
  const pv = (await admin('GET', `${M}/painel`)).body
  check('painel vazio sem processos', pv.items.length === 0 && pv.resumo.processos === 0 && !pv.aviso, pv)

  // ----- baseline "demo": cursos, espaços, alunos, atos vencendo/vencido, processo atrasado, NDE e PDI parciais -----
  const progs: any[] = []
  for (const n of ['Odontologia', 'Direito', 'Administração']) progs.push(await prisma.academicProgram.create({ data: { tenantId: T, nome: n, modalidade: 'PRESENCIAL', cargaHorariaTotal: 3600 } }))
  for (const [cod, tipo] of [['S1', 'SALA_AULA'], ['L1', 'LABORATORIO'], ['B1', 'BIBLIOTECA']] as const) await prisma.eduSpace.create({ data: { tenantId: T, codigo: cod, nome: `Espaço ${cod}`, tipo: tipo as any, capacidade: 40 } })
  const clinic = await prisma.clinic.findFirst({ where: { tenantId: T } })
  for (let i = 0; i < 8; i++) {
    const u = await prisma.user.create({ data: { clinicId: clinic!.id, tenantId: T, email: `aluno${i}@${T}.com`, password: 'x', firstName: 'Aluno', lastName: `D${i}`, role: 'STUDENT' } as any })
    await prisma.student.create({ data: { tenantId: T, userId: u.id, ra: `RA-${T}-${i}`, nomeCompleto: `Aluno Demo ${i}` } as any })
  }
  await admin('POST', `${R}/bootstrap`, {})
  await admin('POST', `${R}/atos`, { tipo: 'PORTARIA_RENOVACAO', numero: 'Portaria SERES nº 301/2020', dataPublicacao: iso(-1500), vencimento: iso(-12), escopo: 'CURSO', cursoNome: 'Administração', conceito: 3, cicloAvaliativoAnos: 4 })
  await admin('POST', `${R}/atos`, { tipo: 'PORTARIA_RECONHECIMENTO', numero: 'Portaria MEC nº 188/2022', dataPublicacao: iso(-1300), vencimento: iso(24), escopo: 'CURSO', programId: progs[0].id, conceito: 4, cicloAvaliativoAnos: 4 })
  await admin('POST', `${R}/atos`, { tipo: 'PORTARIA_RECREDENCIAMENTO', numero: 'Portaria MEC nº 412/2023', dataPublicacao: iso(-900), vencimento: iso(150), escopo: 'INSTITUICAO', conceito: 3, cicloAvaliativoAnos: 3 })
  const pAdit = (await admin('POST', `${R}/processos`, { tipo: 'ADITAMENTO_VAGAS', titulo: 'Aditamento de vagas — Odontologia (60 → 80)', programId: progs[0].id, vagasSolicitadas: 80, prazoProtocolo: iso(-4) })).body
  const pAdit2 = (await admin('POST', `${R}/processos`, { tipo: 'ADITAMENTO_VAGAS', titulo: 'Aditamento de vagas — Direito', programId: progs[1].id, vagasSolicitadas: 100, prazoProtocolo: iso(10) })).body
  await admin('POST', `${R}/processos/${pAdit2.id}/avancar`, { etapa: 'PROTOCOLADO', protocoloEmec: '202609018812', forcar: true })
  await admin('POST', `${R}/processos/${pAdit2.id}/avancar`, { etapa: 'EM_ANALISE' })
  await admin('POST', `${R}/processos/${pAdit2.id}/diligencias`, { descricao: 'Apresentar PPC revisado e comprovar acervo bibliográfico', prazoResposta: iso(9), exigencias: [{ texto: 'PPC revisado' }] })
  const modelos = lst((await admin('GET', `${R}/checklist-modelos?pageSize=50`)).body)
  const cl = await admin('POST', `${R}/checklists`, { modeloId: (modelos.find((m: any) => /RECONHEC/i.test(m.chave)) ?? modelos[0]).id, processoId: pAdit.id, programId: progs[0].id, prazo: iso(25) })
  await admin('POST', `${R}/indicadores/gerar`, {})
  await admin('POST', `${R}/indicadores/gerar`, { programId: progs[0].id })
  const pdi = (await admin('POST', '/edu/governanca/pdis', { titulo: 'PDI 2026–2030', anoInicio: 2026, anoFim: 2030 })).body
  const eixo = (await admin('POST', '/edu/governanca/pdi-eixos', { pdiId: pdi.id, nome: 'Ensino', peso: 1 })).body
  const obj = (await admin('POST', '/edu/governanca/pdi-objetivos', { eixoId: eixo.id, titulo: 'Reduzir a evasão' })).body
  const meta = (await admin('POST', '/edu/governanca/pdi-metas', { objetivoId: obj.id, titulo: 'Reduzir evasão para 8%', indicador: 'Taxa de evasão', sentido: 'MENOR_MELHOR', linhaBase: 18, valorMeta: 8, periodicidade: 'TRIMESTRAL', prazo: iso(500) })).body
  await admin('POST', `/edu/governanca/pdi-metas/${meta.id}/medicoes`, { valor: 16 })
  await admin('POST', `/edu/governanca/pdis/${pdi.id}/ativar`, {})
  const nde = (await admin('POST', '/edu/governanca/ndes', { programId: progs[0].id, nome: 'NDE — Odontologia' })).body
  await admin('POST', '/edu/governanca/nde-membros', { ndeId: nde.id, docenteId: 'd-1', nome: 'Docente Um', titulacao: 'ESPECIALISTA', regime: 'HORISTA', inicio: iso(-400) })
  await admin('PUT', '/edu/core/instituicao', { nome: 'SUA INSTITUIÇÃO', sigla: 'SUAINST', codigoEmec: '24819', uf: 'SP', cidade: 'São Paulo' })
  await admin('POST', '/edu/reitoria/comparativo/ies/propria', {})
  const conc = (await admin('POST', '/edu/reitoria/comparativo/ies', { tipo: 'CONCORRENTE', nome: 'Centro Universitário Horizonte (fictício)', sigla: 'UNIHORIZ', codigoEmec: '1121' })).body
  const propBase = lst((await admin('GET', '/edu/reitoria/comparativo/ies?tipo=PROPRIA')).body)[0]
  await admin('PUT', '/edu/reitoria/comparativo/indicadores', { iesId: conc.id, ano: 2025, indicador: 'IGC', valor: 3.9 })
  await admin('PUT', '/edu/reitoria/comparativo/indicadores', { iesId: propBase.id, ano: 2025, indicador: 'IGC', valor: 3.71 })
  await admin('POST', '/edu/governanca/cpa/comissoes', { nome: 'CPA — Comissão Própria de Avaliação' })
  const antes = (await admin('GET', '/edu/reitoria/painel?perfil=reitoria')).body
  const indAntes = (k: string) => antes.indicadores.find((i: any) => i.chave === k)
  check('ANTES: prazos regulatórios não estão verdes', indAntes('prazos_regulatorios')?.semaforo !== 'VERDE', indAntes('prazos_regulatorios'))
  check('ANTES: sem conceitos MEC (valor nulo)', indAntes('conceitos_mec')?.valor == null)
  check('ANTES: PDI abaixo de 100%', (indAntes('pdi_execucao')?.valor ?? 0) < 100, indAntes('pdi_execucao'))
  const exAntes = (await admin('GET', `${M}/excelencia`)).body
  check('ANTES: excelência não é nota máxima', exAntes.resumo.notaMaxima === false, exAntes.resumo)

  console.log('# processo manual: fases, comissão, visita, roteiro, evidências, simulação, kit, avisos')
  const outro = (await admin('POST', `${R}/processos`, { tipo: 'ADITAMENTO_ENDERECO', titulo: 'Mudança de endereço (fora do escopo)' })).body
  check('iniciar em tipo fora do escopo 409', (await admin('POST', `${M}/processos/${outro.id}/iniciar`, {})).status === 409)
  check('detalhe em tipo fora do escopo 409', (await admin('GET', `${M}/processos/${outro.id}`)).status === 409)
  check('processo inexistente 404', (await admin('GET', `${M}/processos/00000000-0000-0000-0000-000000000000`)).status === 404)
  const pm = (await admin('POST', `${R}/processos`, { tipo: 'AUTORIZACAO_CURSO', titulo: 'Autorização — Nutrição (e2e)', cursoNome: 'Nutrição', prazoProtocolo: iso(30) })).body
  const ini = await admin('POST', `${M}/processos/${pm.id}/iniciar`, {})
  check('iniciar cria 7 fases e 18 evidências', ini.status === 201 && ini.body.fasesCriadas === 7 && ini.body.evidenciasCriadas === 18, ini.body)
  const ini2 = await admin('POST', `${M}/processos/${pm.id}/iniciar`, {})
  check('iniciar idempotente', ini2.status === 201 && ini2.body.fasesCriadas === 0 && ini2.body.evidenciasCriadas === 0, ini2.body)
  check('iniciar coord ok / staff 403', (await staff('POST', `${M}/processos/${pm.id}/iniciar`, {})).status === 403 && (await coord('POST', `${M}/processos/${pm.id}/iniciar`, {})).status === 201)
  check('iniciar tenant B 404', (await adminB('POST', `${M}/processos/${pm.id}/iniciar`, {})).status === 404)
  let det = (await admin('GET', `${M}/processos/${pm.id}`)).body
  check('detalhe: 7 fases, fase atual PROTOCOLO', det.fases.length === 7 && det.faseAtual?.chave === 'PROTOCOLO', det.faseAtual)
  check('detalhe: kit 18 evidências em 3 dimensões', det.evidencias.length === 18 && Object.keys(det.resumoEvidencias.porDimensao).length === 3)
  check('detalhe: simulação indisponível sem conceitos', det.simulacao.disponivel === false)
  check('detalhe: tenant B 404', (await adminB('GET', `${M}/processos/${pm.id}`)).status === 404)
  const fase = det.fases.find((f: any) => f.chave === 'PROTOCOLO')
  check('fase status inválido 400', (await admin('PATCH', `${M}/fases/${fase.id}`, { status: 'XX' })).status === 400)
  const fp = await admin('PATCH', `${M}/fases/${fase.id}`, { status: 'CONCLUIDA' })
  check('fase concluída recebe data realizada', fp.status === 200 && !!fp.body.realizadaEm, fp.body)
  check('fase inexistente 404', (await admin('PATCH', `${M}/fases/00000000-0000-0000-0000-000000000000`, { status: 'PENDENTE' })).status === 404)
  check('fase: staff 403', (await staff('PATCH', `${M}/fases/${fase.id}`, { status: 'PENDENTE' })).status === 403)
  check('fase reaberta limpa data', (await admin('PATCH', `${M}/fases/${fase.id}`, { status: 'EM_ANDAMENTO' })).body.realizadaEm === null)

  // comissão
  const m1 = await admin('POST', `${M}/processos/${pm.id}/membros`, { nome: 'Profa. Dra. Fulana Fictícia', papel: 'COORDENADOR', instituicao: 'Universidade Fictícia', titulacao: 'Doutora', dimensaoFoco: 'ORGANIZACAO_DIDATICO_PEDAGOGICA' })
  check('membro criado', m1.status === 201 && m1.body.designadoEm, m1.body)
  check('segundo coordenador 409', (await admin('POST', `${M}/processos/${pm.id}/membros`, { nome: 'Outro Coordenador', papel: 'COORDENADOR' })).status === 409)
  check('membro nome curto 400', (await admin('POST', `${M}/processos/${pm.id}/membros`, { nome: 'Ab' })).status === 400)
  check('membro e-mail inválido 400', (await admin('POST', `${M}/processos/${pm.id}/membros`, { nome: 'Fulano Teste', email: 'x' })).status === 400)
  check('membro dimensão inválida 400', (await admin('POST', `${M}/processos/${pm.id}/membros`, { nome: 'Fulano Teste', dimensaoFoco: 'DOCUMENTAL' })).status === 400)
  const m2 = await admin('POST', `${M}/processos/${pm.id}/membros`, { nome: 'Prof. Dr. Beltrano Fictício', papel: 'AVALIADOR', dimensaoFoco: 'INFRAESTRUTURA' })
  check('avaliador criado', m2.status === 201)
  check('promover a coordenador com coordenador existente 409', (await admin('PATCH', `${M}/membros/${m2.body.id}`, { papel: 'COORDENADOR' })).status === 409)
  check('membro patch ok', (await admin('PATCH', `${M}/membros/${m2.body.id}`, { areaAtuacao: 'Laboratórios' })).body.areaAtuacao === 'Laboratórios')
  check('membros listados', (await admin('GET', `${M}/processos/${pm.id}/membros`)).body.total === 2)
  check('membro: staff lê mas não escreve', (await staff('GET', `${M}/processos/${pm.id}/membros`)).status === 200 && (await staff('DELETE', `${M}/membros/${m2.body.id}`)).status === 403)
  check('membro tenant B não remove', (await adminB('DELETE', `${M}/membros/${m2.body.id}`)).status === 404)
  check('membro removido 204', (await admin('DELETE', `${M}/membros/${m2.body.id}`)).status === 204)
  check('membro processo fora do escopo 409', (await admin('POST', `${M}/processos/${outro.id}/membros`, { nome: 'Fulano Teste' })).status === 409)

  // visita e roteiro
  check('visita fim antes do início 400', (await admin('POST', `${M}/processos/${pm.id}/visita`, { inicio: iso(20), fim: iso(18) })).status === 400)
  check('visita sem datas 400', (await admin('POST', `${M}/processos/${pm.id}/visita`, {})).status === 400)
  const v1 = await admin('POST', `${M}/processos/${pm.id}/visita`, { inicio: iso(20), fim: iso(21), local: 'Campus sede' })
  check('visita agendada 201', v1.status === 201 && v1.body.status === 'AGENDADA', v1.body)
  const v1b = await admin('POST', `${M}/processos/${pm.id}/visita`, { inicio: iso(22), fim: iso(23), local: 'Campus sede' })
  check('reagendar mantém a mesma visita (200)', v1b.status === 200 && v1b.body.id === v1.body.id)
  const procApos = await prisma.regProcesso.findFirst({ where: { id: pm.id } })
  check('visita atualiza avaliacaoPrevistaEm do processo', Math.abs(procApos!.avaliacaoPrevistaEm!.getTime() - new Date(v1b.body.inicio).getTime()) < 1000)
  const rg = await admin('POST', `${M}/visitas/${v1.body.id}/roteiro/gerar`, {})
  check('roteiro gerado (9 atividades)', rg.status === 201 && rg.body.criados === 9, rg.body)
  check('roteiro duplicado 409', (await admin('POST', `${M}/visitas/${v1.body.id}/roteiro/gerar`, {})).status === 409)
  check('roteiro refazer 201', (await admin('POST', `${M}/visitas/${v1.body.id}/roteiro/gerar`, { refazer: true })).status === 201)
  det = (await admin('GET', `${M}/processos/${pm.id}`)).body
  const dimsRot = new Set(det.visita.roteiro.map((r: any) => r.dimensao))
  check('roteiro cobre as 3 dimensões do INEP', dimsRot.size === 3 && det.visita.roteiro.length === 9, [...dimsRot])
  check('roteiro em dois dias', new Set(det.visita.roteiro.map((r: any) => String(r.dia).slice(0, 10))).size === 2)
  const it0 = det.visita.roteiro[0]
  check('roteiro item horário inválido 400', (await admin('PATCH', `${M}/roteiro/${it0.id}`, { horaInicio: '18:00', horaFim: '09:00' })).status === 400)
  check('roteiro item marcado realizado', (await admin('PATCH', `${M}/roteiro/${it0.id}`, { realizada: true })).body.realizada === true)
  const rn = await admin('POST', `${M}/visitas/${v1.body.id}/roteiro`, { dia: iso(20), horaInicio: '18:00', horaFim: '19:00', dimensao: 'INFRAESTRUTURA', atividade: 'Visita extra ao estacionamento' })
  check('roteiro item novo 201', rn.status === 201)
  check('roteiro item dimensão inválida 400', (await admin('POST', `${M}/visitas/${v1.body.id}/roteiro`, { dia: iso(20), horaInicio: '18:00', horaFim: '19:00', dimensao: 'X', atividade: 'Visita extra' })).status === 400)
  check('roteiro item removido', (await admin('DELETE', `${M}/roteiro/${rn.body.id}`)).status === 204)
  check('roteiro tenant B 404', (await adminB('POST', `${M}/visitas/${v1.body.id}/roteiro/gerar`, { refazer: true })).status === 404)
  check('visita fim<início no patch 400', (await admin('PATCH', `${M}/visitas/${v1.body.id}`, { fim: iso(1) })).status === 400)

  // evidências
  const evs = det.evidencias as any[]
  const e1 = evs[0]
  check('evidência ATENDIDA sem documento 400', (await admin('PATCH', `${M}/evidencias/${e1.id}`, { status: 'ATENDIDO' })).status === 400)
  check('evidência conceito 6 → 400', (await admin('PATCH', `${M}/evidencias/${e1.id}`, { conceitoEstimado: 6 })).status === 400)
  const e1ok = await admin('PATCH', `${M}/evidencias/${e1.id}`, { status: 'ATENDIDO', documentoNome: 'estudo-demanda.pdf', conceitoEstimado: 5 })
  check('evidência atendida registra data', e1ok.status === 200 && !!e1ok.body.concluidoEm)
  check('evidência reaberta limpa data', (await admin('PATCH', `${M}/evidencias/${e1.id}`, { status: 'EM_ANDAMENTO' })).body.concluidoEm === null)
  const novaEv = await admin('POST', `${M}/processos/${pm.id}/evidencias`, { dimensao: 'INFRAESTRUTURA', indicadorCodigo: '3.9', indicadorNome: 'Item extra', descricao: 'Laudo extra de acessibilidade', responsavelNome: 'Infraestrutura', prazo: iso(5) })
  check('evidência nova 201', novaEv.status === 201 && novaEv.body.status === 'PENDENTE')
  check('evidência dimensão DOCUMENTAL 400', (await admin('POST', `${M}/processos/${pm.id}/evidencias`, { dimensao: 'DOCUMENTAL', indicadorCodigo: '9.1', indicadorNome: 'Item', descricao: 'Algo qualquer' })).status === 400)
  const gerar2 = await admin('POST', `${M}/processos/${pm.id}/evidencias/gerar`, {})
  check('gerar evidências é idempotente', gerar2.status === 201 && gerar2.body.criadas === 0, gerar2.body)
  check('student não atualiza evidência', (await student('POST', `${M}/evidencias/${novaEv.body.id}/atualizar`, { status: 'EM_ANDAMENTO' })).status === 403)
  check('staff atualiza evidência pelo atalho', (await staff('POST', `${M}/evidencias/${novaEv.body.id}/atualizar`, { status: 'EM_ANDAMENTO', observacao: 'em andamento' })).status === 200)
  check('atalho não altera conceito (campo ignorado)', (await staff('POST', `${M}/evidencias/${novaEv.body.id}/atualizar`, { conceitoEstimado: 1 })).body.conceitoEstimado == null)
  check('evidências filtradas por dimensão', (await admin('GET', `${M}/processos/${pm.id}/evidencias?dimensao=INFRAESTRUTURA`)).body.items.every((e: any) => e.dimensao === 'INFRAESTRUTURA'))
  check('evidência remover tenant B 404', (await adminB('DELETE', `${M}/evidencias/${novaEv.body.id}`)).status === 404)
  check('evidência extra removida', (await admin('DELETE', `${M}/evidencias/${novaEv.body.id}`)).status === 204)

  // simulação por dimensão
  const todas = (await admin('GET', `${M}/processos/${pm.id}/evidencias`)).body.items as any[]
  for (const [i, e] of todas.entries()) await admin('PATCH', `${M}/evidencias/${e.id}`, { conceitoEstimado: e.dimensao === 'INFRAESTRUTURA' ? 3 : i % 2 ? 5 : 4 })
  const sim = (await admin('GET', `${M}/processos/${pm.id}/simulacao`)).body
  check('simulação disponível com 3 dimensões', sim.disponivel === true && sim.dimensoes.length === 3 && typeof sim.continuo === 'number', sim)
  check('simulação: infra média 3', sim.dimensoes.find((d: any) => d.dimensao === 'INFRAESTRUTURA').media === 3)
  check('simulação: pesos 40/30/30', sim.pesos.organizacaoDidatico === 0.4 && sim.pesos.corpoDocente === 0.3 && sim.pesos.infraestrutura === 0.3)
  check('simulação: obrigatórias pendentes geram alerta', sim.alertas.some((a: string) => /obrigat/i.test(a)))
  const simW = (await admin('POST', `${M}/processos/${pm.id}/simulacao`, { infraestrutura: 5 })).body
  check('simulação what-if sobe o contínuo', simW.continuo > sim.continuo, [sim.continuo, simW.continuo])
  check('simulação what-if inválida 400', (await admin('POST', `${M}/processos/${pm.id}/simulacao`, { infraestrutura: 9 })).status === 400)
  check('simulação é só simulação (aviso)', /simula/i.test(sim.aviso))

  // kit
  const kit = (await admin('GET', `${M}/processos/${pm.id}/kit`)).body
  check('kit por dimensão e indicador', kit.porDimensao.length === 3 && kit.porDimensao[0].indicadores.length >= 5, kit.porDimensao.map((d: any) => d.indicadores.length))
  check('kit traz prontidão e visita', kit.prontidao.total === 18 && !!kit.visita)
  const html = await admin('GET', `${M}/processos/${pm.id}/kit.html`)
  check('kit.html imprimível', html.status === 200 && /Kit da visita/.test(html.text) && /Organização didático-pedagógica/.test(html.text) && /Pasta do kit/.test(html.text))
  check('kit.html student 403', (await student('GET', `${M}/processos/${pm.id}/kit.html`)).status === 403)

  // avisos à reitoria/diretoria
  await admin('PATCH', `${M}/evidencias/${todas[0].id}`, { status: 'PENDENTE', prazo: iso(-3) })
  await admin('PATCH', `${M}/evidencias/${todas[1].id}`, { status: 'EM_ANDAMENTO', prazo: iso(5) })
  const proc1 = (await admin('POST', `${M}/avisos/processar`, {})).body
  check('processar avisos gera lembretes', proc1.avisos > 0 && proc1.processos >= 1, proc1)
  const rems = await prisma.eduReminder.findMany({ where: { tenantId: T, modulo: 'regulatorio', dedupeKey: { startsWith: 'reg:mec:' } } })
  check('avisos vão para reitoria (RECTOR) e diretoria (BOARD)', rems.some((r) => r.assigneeRole === 'RECTOR') && rems.some((r) => r.assigneeRole === 'BOARD'))
  check('prazo vencido/≤7 dias é CRÍTICO', rems.some((r) => r.severity === 'CRITICO'))
  check('visita em 22 dias não gera aviso', !rems.some((r) => r.dedupeKey?.includes(':visita:')))
  const n1 = rems.length
  await admin('POST', `${M}/avisos/processar`, {})
  check('avisos idempotentes (sem duplicar)', (await prisma.eduReminder.count({ where: { tenantId: T, modulo: 'regulatorio', dedupeKey: { startsWith: 'reg:mec:' } } })) === n1)
  const lista = (await rector('GET', `${M}/avisos`)).body
  check('GET avisos lista abertos', lista.total >= 1 && lista.papeis.includes('RECTOR') && lista.papeis.includes('BOARD') && lista.limiteDias === 15)
  check('avisos: student 403 / tenant B vazio', (await student('GET', `${M}/avisos`)).status === 403 && (await adminB('GET', `${M}/avisos`)).body.total === 0)
  for (const e of todas) await admin('PATCH', `${M}/evidencias/${e.id}`, { status: 'ATENDIDO', documentoNome: `doc-${e.indicadorCodigo}.pdf` })
  const aposOk = await prisma.eduReminder.count({ where: { tenantId: T, dedupeKey: { startsWith: 'reg:mec:evidencias:' }, status: 'CONCLUIDO' } })
  check('aviso agregado de evidências é concluído ao regularizar', aposOk >= 1, aposOk)
  check('job diário registrado', Object.keys(await runEduJobs()).includes('regulatorio:mec-avisos'))

  // fase VISITA concluída com visita realizada
  await admin('PATCH', `${M}/visitas/${v1.body.id}`, { status: 'REALIZADA' })
  det = (await admin('GET', `${M}/processos/${pm.id}`)).body
  check('visita realizada conclui a fase de visita', det.fases.find((f: any) => f.chave === 'VISITA_IN_LOCO').status === 'CONCLUIDA')

  console.log('# conceitos regulatórios')
  check('CI sem faixa 400', (await admin('POST', `${M}/conceitos`, { tipo: 'CI', ano: 2026, valor: 4.8 })).status === 400)
  check('CPC sem curso 400', (await admin('POST', `${M}/conceitos`, { tipo: 'CPC', ano: 2026, valor: 4.8 })).status === 400)
  check('IGC com curso 400', (await admin('POST', `${M}/conceitos`, { tipo: 'IGC', ano: 2026, valor: 4.8, cursoNome: 'X' })).status === 400)
  check('tipo inválido 400', (await admin('POST', `${M}/conceitos`, { tipo: 'XYZ', ano: 2026, faixa: 5 })).status === 400)
  check('valor fora de 0..5 400', (await admin('POST', `${M}/conceitos`, { tipo: 'IGC', ano: 2026, valor: 7 })).status === 400)
  check('sem valor nem faixa 400', (await admin('POST', `${M}/conceitos`, { tipo: 'IGC', ano: 2026 })).status === 400)
  check('curso de outro tenant 400', (await admin('POST', `${M}/conceitos`, { tipo: 'CPC', ano: 2026, programId: '00000000-0000-0000-0000-000000000000', valor: 4 })).status === 400)
  const cx = await admin('POST', `${M}/conceitos`, { tipo: 'IGC', ano: 2020, valor: 4.2 })
  check('faixa derivada do contínuo (4,2 → 5)', cx.status === 201 && cx.body.faixa === 5, cx.body)
  const cx2 = await admin('POST', `${M}/conceitos`, { tipo: 'IGC', ano: 2020, valor: 2.5 })
  check('upsert atualiza a mesma linha (2,5 → 3)', cx2.body.id === cx.body.id && cx2.body.faixa === 3)
  check('conceito ficticio default false', cx2.body.ficticio === false)
  check('conceitos filtrados por tipo/ano', lst((await admin('GET', `${M}/conceitos?tipo=IGC&ano=2020`)).body).length === 1)
  check('conceito remover tenant B 404', (await adminB('DELETE', `${M}/conceitos/${cx.body.id}`)).status === 404)
  check('conceito removido', (await admin('DELETE', `${M}/conceitos/${cx.body.id}`)).status === 204)

  console.log('# SEED nota máxima (fictício) — 1ª execução')
  const failures: string[] = []
  let nUser = 0
  const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
    nUser++
    return prisma.user.create({ data: { clinicId: c.A.clinic.id, tenantId: T, email: `${nUser}-${T}-${email}`, password, firstName, lastName, role } as any })
  }
  const seedApi = async (method: string, path: string, body?: any) => {
    const r = await admin(method, path, body)
    return r.status < 400 ? r.body : null
  }
  const t0 = Date.now()
  const rs = await seedMecComissao(seedApi, { tenantId: T, failures, mk })
  console.log('   resumo:', JSON.stringify(rs), `${Date.now() - t0}ms`)
  check('seed sem falhas de API', failures.length === 0, failures.slice(0, 5))
  check('seed: 4 processos de avaliação', rs.processos === 4)
  check('seed: comissão com membros fictícios', rs.membros === 9)
  check('seed: conceitos criados', rs.conceitos >= 20, rs.conceitos)
  check('seed: atos ajustados', rs.atosAjustados >= 3, rs.atosAjustados)
  check('seed: respostas CPA', rs.cpa === 48, rs.cpa)
  check('seed: docentes', rs.docentes >= 10, rs.docentes)
  check('seed: egressos', rs.egressos === 32, rs.egressos)
  check('seed: inscrições de exame com conceito 5', rs.inscricoesExame > 0, rs.inscricoesExame)
  check('seed: avisos à reitoria gerados', rs.avisos > 0, rs.avisos)

  console.log('# painel da comissão após o seed')
  const pn = (await admin('GET', `${M}/painel`)).body
  check('painel lista os processos de avaliação (4 + manual)', pn.items.length === 5, pn.items.map((i: any) => i.titulo))
  check('painel traz aviso de dados fictícios', /FICT/i.test(pn.aviso || ''), pn.aviso)
  const por = (t: string) => pn.items.find((i: any) => i.titulo.includes(t))
  const enf = por('Enfermagem'), fis = por('Fisioterapia'), odo = por('Odontologia'), rec = por('Recredenciamento')
  check('painel: Enfermagem em preparo com visita agendada', enf?.visita?.status === 'AGENDADA' && enf.evidencias.total === 18, enf)
  check('painel: Fisioterapia com visita realizada e fase de relatório', fis?.visita?.status === 'REALIZADA' && fis.faseAtual?.chave === 'RELATORIO', fis?.faseAtual)
  check('painel: Odontologia com prazos críticos (visita em 6 dias)', odo?.prazosCriticos >= 1 && odo.proximoPrazo?.dias <= 7, odo?.proximoPrazo)
  check('painel: recredenciamento sem comissão e fase de designação', rec?.membros === 0 && rec.faseAtual?.chave === 'DESIGNACAO_COMISSAO', rec?.faseAtual)
  check('painel: conceito simulado 5 nos processos preparados', [enf, fis, odo].every((p) => p?.conceitoSimulado?.faixa === 5), [enf, fis, odo].map((p) => p?.conceitoSimulado))
  check('painel: lista de críticos', pn.criticos.length >= 1 && pn.resumo.prazosCriticos >= 1)
  check('painel: resumo com visitas e prontidão', pn.resumo.comVisitaAgendada >= 2 && pn.resumo.prontidaoMediaKit > 80, pn.resumo)
  const detOdo = (await admin('GET', `${M}/processos/${odo.id}`)).body
  check('detalhe Odontologia: comissão fictícia de 3 membros (1 coordenador)', detOdo.membros.length === 3 && detOdo.membros.filter((m: any) => m.papel === 'COORDENADOR').length === 1)
  check('detalhe: pendências obrigatórias listadas', detOdo.pendencias.filter((p: any) => p.tipo === 'EVIDENCIA').length === 3, detOdo.pendencias.length)
  check('detalhe: simulação de conceito 5 por dimensão', detOdo.simulacao.disponivel && detOdo.simulacao.faixa === 5 && detOdo.simulacao.dimensoes.every((d: any) => d.media >= 4), detOdo.simulacao.dimensoes)
  check('detalhe: aviso fictício presente', /FICT/i.test(detOdo.aviso || ''))
  const kitHtml = await admin('GET', `${M}/processos/${odo.id}/kit.html`)
  check('kit.html mostra aviso fictício e roteiro', /FICT/i.test(kitHtml.text) && /Roteiro da visita/.test(kitHtml.text) && /Comissão avaliadora/.test(kitHtml.text))
  check('avisos da reitoria cobrem a visita em 6 dias', (await prisma.eduReminder.count({ where: { tenantId: T, dedupeKey: { contains: ':visita:' }, assigneeRole: 'RECTOR' } })) >= 1)

  console.log('# excelência: tudo coerente e no máximo')
  const ex = (await admin('GET', `${M}/excelencia`)).body
  const item = (k: string) => ex.itens.find((i: any) => i.chave === k)
  check('excelência: nota máxima', ex.resumo.notaMaxima === true && ex.resumo.verdes === ex.resumo.avaliaveis, ex.itens.filter((i: any) => i.semaforo !== 'VERDE'))
  check('excelência: faixa mínima dos conceitos = 5', ex.resumo.faixaMinimaConceitos === 5)
  check('excelência: aviso de dados fictícios', ex.ficticio === true && /FICT/i.test(ex.aviso))
  check('CI 5', item('CI').valor === 5 && ex.ci.faixa === 5)
  check('IGC 5 (contínuo 4,71)', item('IGC').valor === 5 && ex.igc.valor === 4.71, ex.igc)
  check('CPC 5 em todos os cursos', ex.cpc.length === 3 && ex.cpc.every((x: any) => x.faixa === 5), ex.cpc)
  check('ENADE 5 em todos os cursos', ex.enade.length === 3 && ex.enade.every((x: any) => x.faixa === 5))
  check('IDD 5 em todos os cursos', ex.idd.length === 3 && ex.idd.every((x: any) => x.faixa === 5))
  check('CC 5 em todos os cursos', ex.cc.length === 3 && ex.cc.every((x: any) => x.faixa === 5))
  check('atos/portarias com conceito 5', ex.atosComConceito.length >= 3 && ex.atosComConceito.every((a: any) => a.conceito === 5), ex.atosComConceito)
  check('PDI cumprido (≥95%)', item('PDI').valor >= 95, item('PDI'))
  check('CPA: participação ≥ 80% e relatório anual', item('CPA').valor >= 80 && ex.cpa.relatoriosAnuais === 1, ex.cpa)
  check('CPA: ciclo concluído e plano de ação concluído', ex.cpa.ciclos.some((x: any) => x.status === 'CONCLUIDO') && ex.cpa.planosAcao.total === 3 && ex.cpa.planosAcao.concluidos === 3)
  check('autoavaliação regulatória ≥ 90%', item('AUTOAVALIACAO').valor >= 90, item('AUTOAVALIACAO'))
  check('egressos inseridos ≥ 90%', item('EGRESSOS').valor >= 90 && ex.egressos.total === 32, item('EGRESSOS'))
  check('docentes mestres/doutores ≥ 90%', item('DOCENTES_MESTRES_DOUTORES').valor >= 90, item('DOCENTES_MESTRES_DOUTORES'))
  check('docentes em regime integral ≥ 60%', item('DOCENTES_REGIME').valor >= 60, item('DOCENTES_REGIME'))
  check('docentes: maioria doutores', ex.docentes.pctDoutores >= 70, ex.docentes)
  check('NDE 100% mestres/doutores em regime integral', ex.nde.total >= 1 && ex.nde.pctMestresDoutores === 100 && ex.nde.pctIntegral === 100, ex.nde)
  check('infraestrutura: 100% dos itens exigidos', item('INFRAESTRUTURA').valor === 100 && ex.infra.length === 3, ex.infra)
  check('desempenho em exames ≥ 4,5', item('DESEMPENHO_EXAMES').valor >= 4.5, item('DESEMPENHO_EXAMES'))
  const igcPos = ex.comparativo?.posicoes?.find((p: any) => p.indicador === 'IGC')
  check('comparativo: 1º lugar em IGC', igcPos?.posicao === 1 && igcPos.participantes >= 2 && igcPos.valorProprio === 4.71, igcPos)
  check('comparativo: acima da média dos concorrentes', igcPos?.valorProprio > igcPos?.mediaConcorrentes)

  console.log('# painéis existentes passam a exibir verde')
  const pd = (await admin('GET', '/edu/reitoria/painel?perfil=reitoria')).body
  const ind = (k: string) => pd.indicadores.find((i: any) => i.chave === k)
  check('reitoria: conceitos MEC = 5 e VERDE', ind('conceitos_mec')?.valor === 5 && ind('conceitos_mec').semaforo === 'VERDE', ind('conceitos_mec'))
  check('reitoria: conceitos MEC com aviso fictício', /FICT/i.test(ind('conceitos_mec')?.detalhe?.aviso || ''))
  check('reitoria: titulação docente VERDE', ind('titulacao_docente')?.semaforo === 'VERDE' && ind('titulacao_docente').valor >= 90, ind('titulacao_docente'))
  check('reitoria: PDI VERDE', ind('pdi_execucao')?.semaforo === 'VERDE', ind('pdi_execucao'))
  check('reitoria: prontidão regulatória 100% VERDE', ind('prontidao_regulatoria')?.semaforo === 'VERDE' && ind('prontidao_regulatoria').valor === 100, ind('prontidao_regulatoria'))
  check('reitoria: prazos regulatórios VERDE', ind('prazos_regulatorios')?.semaforo === 'VERDE', ind('prazos_regulatorios'))
  check('reitoria: desempenho em exames VERDE', ind('desempenho_exames')?.semaforo === 'VERDE', ind('desempenho_exames'))
  check('reitoria: nenhum indicador de regulatório/governança VERMELHO', pd.indicadores.filter((i: any) => i.categoria === 'Regulatório e governança').every((i: any) => i.semaforo !== 'VERMELHO' && !i.erro), pd.indicadores.filter((i: any) => i.categoria === 'Regulatório e governança').map((i: any) => [i.chave, i.semaforo]))
  check('reitoria: painel sem erros de indicador', (pd.indicadoresComErro ?? []).length === 0, pd.indicadoresComErro)
  const pr = (await admin('GET', `${R}/painel`)).body
  check('regulatório: nenhum ato vencido', pr.resumo.atosPorSituacao.VENCIDO === 0, pr.resumo.atosPorSituacao)
  check('regulatório: nenhum ato vencendo', pr.resumo.atosPorSituacao.VENCENDO === 0 && pr.resumo.atosPorSituacao.RENOVACAO_ABERTA === 0, pr.resumo.atosPorSituacao)
  check('regulatório: cursos sem risco crítico/alto', pr.resumo.cursosEmRisco.CRITICO === 0 && pr.resumo.cursosEmRisco.ALTO === 0, pr.cursos.map((x: any) => [x.curso, x.risco, x.motivosRisco]))
  check('regulatório: diligências abertas = 0', pr.resumo.diligenciasAbertas === 0 && pr.resumo.diligenciasVencidas === 0)
  const cpaRes = lst((await admin('GET', '/edu/governanca/cpa/ciclos?q=concluído')).body)[0]
  const resCpa = (await admin('GET', `/edu/governanca/cpa/ciclos/${cpaRes.id}/resultados`)).body
  check('CPA: respondentes e fragilidades zero', resCpa.totalRespondentes === 48 && (resCpa.fragilidades ?? []).length === 0, resCpa.totalRespondentes)
  const comp = (await admin('GET', '/edu/reitoria/comparativo/painel')).body
  const igcL = comp.indicadores.find((i: any) => i.indicador === 'IGC')
  check('comparativo (painel da reitoria): própria IES em 1º no IGC', igcL.posicaoPropria === 1 && igcL.valorProprio === 4.71, igcL)
  const adq = (await admin('GET', `/edu/infraestrutura/adequacao/${progs[0].id}`)).body
  check('infraestrutura: conceito sugerido máximo e 100% obrigatórios', adq.totais.obrigatoriosAtendidosPct === 100 && adq.conceitoSugerido === 5, adq.totais)
  const egr = (await admin('GET', '/edu/apoio/egressos/indicadores')).body
  check('egressos: taxa de inserção ≥ 90%', (egr.geral.taxaInsercao ?? 0) >= 90, egr.geral)

  console.log('# idempotência (2ª execução do seed)')
  const antesCont = {
    proc: await prisma.regProcesso.count({ where: { tenantId: T } }), mem: await prisma.regMecMembro.count({ where: { tenantId: T } }), ev: await prisma.regMecEvidencia.count({ where: { tenantId: T } }),
    conc: await prisma.regMecConceito.count({ where: { tenantId: T } }), eg: await prisma.apoEgresso.count({ where: { tenantId: T } }), ciclos: await prisma.govCpaCiclo.count({ where: { tenantId: T } }),
    resp: await prisma.govCpaResposta.count({ where: { tenantId: T } }), visitas: await prisma.regMecVisita.count({ where: { tenantId: T } }), req: await prisma.infRequisitoCurso.count({ where: { tenantId: T } }),
    rot: await prisma.regMecRoteiro.count({ where: { tenantId: T } }), ins: await prisma.desInscricao.count({ where: { tenantId: T } }), fases: await prisma.regMecFase.count({ where: { tenantId: T } }),
  }
  const f2: string[] = []
  await seedMecComissao(seedApi, { tenantId: T, failures: f2 })
  const depois = {
    proc: await prisma.regProcesso.count({ where: { tenantId: T } }), mem: await prisma.regMecMembro.count({ where: { tenantId: T } }), ev: await prisma.regMecEvidencia.count({ where: { tenantId: T } }),
    conc: await prisma.regMecConceito.count({ where: { tenantId: T } }), eg: await prisma.apoEgresso.count({ where: { tenantId: T } }), ciclos: await prisma.govCpaCiclo.count({ where: { tenantId: T } }),
    resp: await prisma.govCpaResposta.count({ where: { tenantId: T } }), visitas: await prisma.regMecVisita.count({ where: { tenantId: T } }), req: await prisma.infRequisitoCurso.count({ where: { tenantId: T } }),
    rot: await prisma.regMecRoteiro.count({ where: { tenantId: T } }), ins: await prisma.desInscricao.count({ where: { tenantId: T } }), fases: await prisma.regMecFase.count({ where: { tenantId: T } }),
  }
  for (const k of Object.keys(antesCont) as Array<keyof typeof antesCont>) check(`idempotente: ${k} não duplica`, antesCont[k] === depois[k], [antesCont[k], depois[k]])
  check('2ª execução sem falhas', f2.length === 0, f2.slice(0, 4))
  const exDepois = (await admin('GET', `${M}/excelencia`)).body
  check('após 2ª execução continua nota máxima', exDepois.resumo.notaMaxima === true)

  console.log('# isolamento entre instituições')
  const bPain = (await adminB('GET', `${M}/painel`)).body
  check('tenant B não vê processos', bPain.items.length === 0)
  const bEx = (await adminB('GET', `${M}/excelencia`)).body
  check('tenant B sem conceitos nem aviso fictício', bEx.ci == null && bEx.cpc.length === 0 && !bEx.aviso)
  check('tenant B não vê conceitos', lst((await adminB('GET', `${M}/conceitos`)).body).length === 0)

  await finish(c)
}
main().catch(async (e) => { console.error(e); process.exit(1) })
