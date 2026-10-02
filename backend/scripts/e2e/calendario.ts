import { setup, check, seedAcademic } from './_lib'
const iso = (s: string) => s + ':00-03:00'
async function main() {
  const { A, B, api, close, prisma } = await setup()
  const U = A.users
  const adm = api(U.ADMIN.token), coord = api(U.COORDINATOR.token), teacher = api(U.TEACHER.token), teacher2 = api(U.TEACHER2.token), st = api(U.STUDENT.token), sec = api(U.SECRETARY.token), fin = api(U.FINANCE.token)
  const admB = api(B.users.ADMIN.token), coordB = api(B.users.COORDINATOR.token)
  const ac = await seedAcademic(A, { n: 2 })
  const term = ac.term
  let r: any

  // bootstrap idempotente
  r = await coord('POST', '/edu/calendario/bootstrap', {}); check('bootstrap 201', r.status === 201, r)
  const first = r.json
  r = await coord('POST', '/edu/calendario/bootstrap', {}); check('bootstrap idempotent', r.status === 201 && r.json.categoriasCriadas === 0 && r.json.horariosCriados === 0 && r.json.feriadosCriados === 0, r.json)
  r = await st('POST', '/edu/calendario/bootstrap', {}); check('bootstrap student 403', r.status === 403)
  r = await teacher('POST', '/edu/calendario/bootstrap', {}); check('bootstrap teacher 403', r.status === 403)

  // eventos
  r = await coord('POST', '/edu/calendario/eventos', { tipo: 'REUNIAO', titulo: 'Reunião pedagógica', inicio: iso('2026-11-10T14:00'), fim: iso('2026-11-10T16:00'), diaInteiro: false, publico: 'PROFESSORES', lembreteDias: [1, 0] }); check('evento 201', r.status === 201, r); const ev = r.json
  r = await coord('POST', '/edu/calendario/eventos', { titulo: 'x' }); check('evento 400', r.status === 400)
  r = await coord('POST', '/edu/calendario/eventos', { titulo: 'Fim antes', inicio: iso('2026-11-10T14:00'), fim: iso('2026-11-10T10:00'), diaInteiro: false }); check('evento fim<inicio 400', r.status === 400, r)
  r = await coord('POST', '/edu/calendario/eventos', { titulo: 'Rec sem ate', inicio: iso('2026-11-10T14:00'), recorrencia: 'SEMANAL' }); check('evento rec sem ate 400', r.status === 400, r)
  r = await coord('POST', '/edu/calendario/eventos', { titulo: 'Ref outro tenant', inicio: iso('2026-11-10T14:00'), termId: '00000000-0000-0000-0000-000000000000' }); check('evento term inexistente 404', r.status === 404, r)
  r = await coord('POST', '/edu/calendario/eventos', { titulo: 'Semanal', tipo: 'REUNIAO', inicio: iso('2026-11-02T10:00'), fim: iso('2026-11-02T11:00'), diaInteiro: false, recorrencia: 'SEMANAL', recorrenciaAte: iso('2026-11-30T00:00') }); check('evento semanal 201', r.status === 201, r); const evRec = r.json
  r = await coord('GET', '/edu/calendario/eventos?de=2026-11-01&ate=2026-11-30'); check('eventos list', r.status === 200 && r.json.itens.filter((i: any) => i.eventoId === evRec.id).length === 5, r.json?.itens?.map((i: any) => i.titulo + i.inicio))
  r = await st('GET', '/edu/calendario/eventos?de=2026-11-01&ate=2026-11-30'); check('student does not see PROFESSORES events', r.status === 200 && !r.json.itens.some((i: any) => i.eventoId === ev.id), r.json?.itens?.length)
  r = await teacher('GET', '/edu/calendario/eventos?de=2026-11-01&ate=2026-11-30'); check('teacher sees PROFESSORES events', r.json.itens.some((i: any) => i.eventoId === ev.id))
  r = await st('GET', `/edu/calendario/eventos/${ev.id}`); check('student get evento hidden 404', r.status === 404)
  r = await admB('GET', `/edu/calendario/eventos/${ev.id}`); check('evento xtenant 404', r.status === 404)
  r = await coordB('PATCH', `/edu/calendario/eventos/${ev.id}`, { titulo: 'hack' }); check('evento patch xtenant 404', r.status === 404)
  r = await coord('PATCH', `/edu/calendario/eventos/${ev.id}`, { titulo: 'Reunião pedagógica 2', inicio: iso('2026-11-11T14:00'), fim: iso('2026-11-11T16:00') }); check('evento patch', r.status === 200 && r.json.titulo.endsWith('2'), r)
  r = await coord('PATCH', `/edu/calendario/eventos/${ev.id}`, { inicio: iso('2026-11-11T20:00') }); check('evento patch inicio>fim 400', r.status === 400, r)
  let rem = await prisma.eduReminder.count({ where: { tenantId: A.tenantId, refType: 'CalEvento', refId: ev.id, status: 'PENDENTE' } })
  check('evento lembretes criados', rem > 0, rem)
  r = await coord('DELETE', `/edu/calendario/eventos/${ev.id}`); check('evento delete 204', r.status === 204, r)
  rem = await prisma.eduReminder.count({ where: { tenantId: A.tenantId, refType: 'CalEvento', refId: ev.id, status: 'PENDENTE' } })
  check('evento delete cancela lembretes', rem === 0, rem)
  r = await coord('GET', '/edu/calendario/feriados/nacionais?ano=2026'); check('feriados', r.status === 200 && r.json.length > 8)
  r = await coord('GET', '/edu/calendario/feriados/nacionais?ano=abc'); check('feriados ano invalido 400', r.status === 400, r)
  r = await coord('POST', '/edu/calendario/feriados/importar', { ano: 2027 }); check('feriados importar', r.status === 201, r)
  r = await coord('POST', '/edu/calendario/feriados/importar', { ano: 2027 }); check('feriados importar idem', r.status === 201 && r.json.criados === 0, r.json)
  r = await coord('GET', `/edu/calendario/periodos/${term.id}/dias-letivos`); check('dias letivos', r.status === 200 && r.json.totalDias > 80, r)
  r = await admB('GET', `/edu/calendario/periodos/${term.id}/dias-letivos`); check('dias letivos xtenant 404', r.status === 404, r)
  r = await coord('POST', `/edu/calendario/periodos/${term.id}/gerar-calendario`, {}); check('gerar-calendario 201', r.status === 201 && r.json.eventosCriados > 10 && r.json.prazosCriados === 3, r)
  r = await coord('POST', `/edu/calendario/periodos/${term.id}/gerar-calendario`, {}); check('gerar-calendario idem', r.status === 201 && r.json.eventosCriados === 0, r.json)
  r = await coordB('POST', `/edu/calendario/periodos/${term.id}/gerar-calendario`, {}); check('gerar-calendario xtenant 404', r.status === 404, r)

  // espacos
  const mk = (codigo: string, tipo: any, cap: number, recursos: any = []) => prisma.eduSpace.create({ data: { tenantId: A.tenantId, codigo, nome: 'Sala ' + codigo, tipo, capacidade: cap, recursos } })
  const s101 = await mk('S101', 'SALA_AULA', 40, ['projetor']), s102 = await mk('S102', 'SALA_AULA', 40), lab1 = await mk('LAB1', 'LABORATORIO', 20, ['bancadas']), peq = await mk('P1', 'SALA_REUNIAO', 5)
  const sB = await prisma.eduSpace.create({ data: { tenantId: B.tenantId, codigo: 'S101', nome: 'B', tipo: 'SALA_AULA', capacidade: 30 } })

  // reservas
  const futuro = (d: string, h1: string, h2: string) => ({ inicio: iso(`${d}T${h1}`), fim: iso(`${d}T${h2}`) })
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Aula extra', tipo: 'AULA_EXTRA', ...futuro('2026-11-12', '10:00', '12:00') }); check('reserva teacher 201 PENDENTE', r.status === 201 && r.json.status === 'PENDENTE', r); const res1 = r.json
  r = await st('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Aula extra', ...futuro('2026-11-12', '10:00', '12:00') }); check('reserva student 403', r.status === 403)
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: sB.id, titulo: 'Aula extra', ...futuro('2026-11-12', '10:00', '12:00') }); check('reserva space xtenant 404', r.status === 404, r)
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: peq.id, titulo: 'Reunião grande', participantes: 20, ...futuro('2026-11-12', '10:00', '12:00') }); check('reserva capacidade 409', r.status === 409, r)
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: s102.id, titulo: 'Reunião rec', recursosSolicitados: ['projetor'], ...futuro('2026-11-12', '10:00', '12:00') }); check('reserva recurso 409', r.status === 409, r)
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Passado', ...futuro('2026-01-12', '10:00', '12:00') }); check('reserva passado 400', r.status === 400, r)
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Fim<ini', ...futuro('2026-11-12', '12:00', '10:00') }); check('reserva fim<ini 400', r.status === 400, r)
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Sem validar' }); check('reserva 400 body', r.status === 400, r)
  r = await teacher2('GET', `/edu/calendario/reservas/${res1.reservas[0].id}`); check('reserva outro prof 403', r.status === 403, r)
  r = await admB('GET', `/edu/calendario/reservas/${res1.reservas[0].id}`); check('reserva xtenant 404', r.status === 404, r)
  // aprovação direta pela coordenação + conflito
  r = await coord('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Coord direta', ...futuro('2026-11-12', '11:00', '13:00') }); check('reserva coord aprova direto, pendente nao bloqueia', r.status === 201 && r.json.status === 'APROVADA', r); const resC = r.json
  r = await coord('POST', `/edu/calendario/reservas/${res1.reservas[0].id}/aprovar`, {}); check('aprovar conflito 409', r.status === 409, r)
  r = await teacher2('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'Conflita', ...futuro('2026-11-12', '12:30', '13:30') }); check('reserva conflito 409', r.status === 409, r)
  r = await coord('POST', `/edu/calendario/reservas/${res1.reservas[0].id}/rejeitar`, { motivo: 'Conflito de agenda' }); check('rejeitar 200', r.status === 200, r)
  r = await coord('POST', `/edu/calendario/reservas/${res1.reservas[0].id}/rejeitar`, { motivo: 'Conflito de agenda' }); check('rejeitar 2x 409', r.status === 409, r)
  r = await coord('POST', `/edu/calendario/reservas/${res1.reservas[0].id}/aprovar`, {}); check('aprovar rejeitada 409', r.status === 409, r)
  let nt = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, userId: U.TEACHER.id, refType: 'CalReserva' } }); check('notificação ao rejeitar', nt >= 1, nt)
  // série
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: lab1.id, titulo: 'Série lab', recorrencia: 'SEMANAL', recorrenciaAte: iso('2026-12-10T00:00'), ...futuro('2026-11-05', '08:00', '10:00') }); check('serie 201', r.status === 201 && r.json.criadas === 6, r.json?.criadas ?? r); const serie = r.json
  r = await coord('GET', '/edu/calendario/reservas/fila'); check('fila', r.status === 200 && r.json.total >= 6, r.json?.total)
  r = await teacher('GET', '/edu/calendario/reservas/fila'); check('fila teacher 403', r.status === 403)
  r = await coord('POST', `/edu/calendario/reservas/${serie.reservas[0].id}/aprovar`, { escopo: 'serie' }); check('aprovar serie', r.status === 200 && r.json.aprovadas === 6, r)
  r = await teacher('GET', '/edu/calendario/reservas'); check('teacher só vê as suas', r.status === 200 && r.json.items.every((x: any) => x.solicitanteId === U.TEACHER.id), r.json?.total)
  r = await teacher2('POST', `/edu/calendario/reservas/${serie.reservas[0].id}/cancelar`, {}); check('cancelar de terceiro 403', r.status === 403)
  r = await teacher('POST', `/edu/calendario/reservas/${serie.reservas[2].id}/cancelar`, { escopo: 'serie' }); check('cancelar serie a partir', r.status === 200 && r.json.canceladas === 4, r)
  r = await teacher('POST', `/edu/calendario/reservas/${serie.reservas[2].id}/cancelar`, {}); check('cancelar 2x 409', r.status === 409, r)
  // concorrência: duas reservas no mesmo horário
  const rs = await Promise.all([coord('POST', '/edu/calendario/reservas', { spaceId: s102.id, titulo: 'Corrida A', ...futuro('2026-11-20', '09:00', '10:00') }), api(U.SECRETARY.token)('POST', '/edu/calendario/reservas', { spaceId: s102.id, titulo: 'Corrida B', ...futuro('2026-11-20', '09:30', '10:30') })])
  check('reserva concorrente: só uma', rs.filter((x) => x.status === 201).length === 1, rs.map((x) => x.status))
  // bloqueio
  r = await teacher('POST', '/edu/calendario/bloqueios', { spaceIds: [s101.id], titulo: 'Manutenção', ...futuro('2026-11-12', '10:00', '12:00') }); check('bloqueio teacher 403', r.status === 403)
  r = await coord('POST', '/edu/calendario/bloqueios', { spaceIds: [s101.id], titulo: 'Manutenção', ...futuro('2026-11-12', '12:00', '14:00') }); check('bloqueio conflita reserva aprovada 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/bloqueios', { spaceIds: [s101.id], titulo: 'Manutenção', cancelarConflitantes: true, ...futuro('2026-11-12', '12:00', '14:00') }); check('bloqueio cancelando 201', r.status === 201 && r.json.resultado[0].reservasCanceladas === 1, r); const bl = r.json.resultado[0]
  const blRow = await prisma.calReserva.findFirst({ where: { tenantId: A.tenantId, bloqueio: true, spaceId: s101.id } })
  r = await teacher('POST', '/edu/calendario/reservas', { spaceId: s101.id, titulo: 'No bloqueio', ...futuro('2026-11-12', '13:00', '14:00') }); check('reserva em bloqueio 409', r.status === 409, r)
  r = await coordB('POST', '/edu/calendario/bloqueios', { spaceIds: [s101.id], titulo: 'Manutenção hack', ...futuro('2026-11-12', '12:00', '14:00') }); check('bloqueio xtenant 404', r.status === 404, r)
  r = await coord('DELETE', `/edu/calendario/bloqueios/${blRow!.id}`); check('liberar bloqueio', r.status === 200 && r.json.liberados === 1, r)
  r = await coord('POST', '/edu/calendario/conflitos/verificar', { spaceId: s101.id, ...futuro('2026-11-12', '12:00', '14:00') }); check('verificar livre', r.status === 200 && r.json.livre === true, r.json)
  r = await coord('GET', `/edu/calendario/espacos/livres?inicio=${encodeURIComponent(iso('2026-11-12T12:00'))}&fim=${encodeURIComponent(iso('2026-11-12T13:00'))}&capacidade=10`); check('espaços livres', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/espacos/${s101.id}/disponibilidade?data=2026-11-12`); check('disponibilidade', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/espacos/${s101.id}/agenda?semana=2026-11-12`); check('agenda espaço', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/espacos/${sB.id}/agenda`); check('agenda espaço xtenant 404', r.status === 404, r)

  // ---- grade horária
  r = await coord('GET', '/edu/calendario/horarios'); const horarios = r.json.items ?? r.json; check('horarios list', r.status === 200)
  r = await coord('POST', '/edu/calendario/horarios', { nome: 'bad', turno: 'MANHA', ordem: 15, inicioMin: 600, fimMin: 500 }); check('horario fim<ini 400', r.status === 400, r)
  const [secA, secB, secC] = ac.sections
  r = await coord('PUT', `/edu/calendario/config/turmas/${secA.id}`, { programId: ac.program.id, periodo: 1, turno: 'MANHA', grupo: 'ODONTO-1-M', alunosEstimados: 30 }); check('cfg turma', r.status === 200, r)
  for (const s of [secB, secC]) await coord('PUT', `/edu/calendario/config/turmas/${s.id}`, { programId: ac.program.id, periodo: 1, turno: 'MANHA', grupo: 'ODONTO-1-M', alunosEstimados: 30 })
  r = await coordB('PUT', `/edu/calendario/config/turmas/${secA.id}`, { grupo: 'x' }); check('cfg turma xtenant 404', r.status === 404, r)
  r = await coord('PUT', `/edu/calendario/config/disciplinas/${ac.discs[2].id}`, { aulasSemana: 2, pratica: true, tiposEspaco: ['LABORATORIO'] }); check('cfg disc', r.status === 200, r)
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secA.id, diaSemana: 1, inicioMin: 480, fimMin: 570, spaceId: s101.id }); check('slot 201', r.status === 201, r); const slot1 = r.json.slot
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secB.id, diaSemana: 1, inicioMin: 500, fimMin: 560, spaceId: s102.id }); check('slot choque grupo 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secB.id, diaSemana: 2, inicioMin: 480, fimMin: 570, spaceId: s101.id }); check('slot ok dia 2', r.status === 201, r); const slot2 = r.json.slot
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secC.id, diaSemana: 2, inicioMin: 500, fimMin: 560, spaceId: s102.id, tipoAula: 'TEORICA' }); check('slot choque professor/grupo 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secC.id, diaSemana: 3, inicioMin: 480, fimMin: 570, spaceId: s101.id, tipoAula: 'PRATICA' }); check('slot pratica em sala 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secC.id, diaSemana: 3, inicioMin: 480, fimMin: 570, spaceId: s101.id, tipoAula: 'PRATICA', forcar: true }); check('slot forcado 201', r.status === 201 && r.json.choquesForcados.length > 0, r); const slotF = r.json.slot
  r = await coord('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secC.id, diaSemana: 4, inicioMin: 600, fimMin: 500 }); check('slot fim<ini 400', r.status === 400, r)
  r = await admB('POST', '/edu/calendario/grade/slots', { termId: term.id, classSectionId: secC.id, diaSemana: 4, inicioMin: 500, fimMin: 600 }); check('slot xtenant 404', r.status === 404, r)
  r = await coord('PATCH', `/edu/calendario/grade/slots/${slot2.id}`, { diaSemana: 1, inicioMin: 480, fimMin: 570 }); check('slot patch choque 409', r.status === 409, r)
  r = await coord('PATCH', `/edu/calendario/grade/slots/${slot2.id}`, { diaSemana: 5 }); check('slot patch ok', r.status === 200, r)
  r = await coord('POST', '/edu/calendario/grade/validar', { termId: term.id }); check('grade validar', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/grade/conflitos?termId=${term.id}`); check('grade conflitos tem forçado', r.status === 200 && r.json.total >= 1, r.json?.total)
  r = await coord('GET', `/edu/calendario/grade/ics?termId=${term.id}`); check('grade ics', r.status === 200 && r.text.startsWith('BEGIN:VCALENDAR'), r.text.slice(0, 80))
  r = await coord('GET', `/edu/calendario/grade/cobertura?termId=${term.id}`); check('grade cobertura', r.status === 200, r)
  r = await coord('DELETE', `/edu/calendario/grade/slots/${slotF.id}`); check('slot delete', r.status === 204, r)
  r = await teacher('PUT', `/edu/calendario/professores/${U.TEACHER2.id}/disponibilidade`, { itens: [] }); check('disp outro prof 403', r.status === 403)
  r = await teacher('PUT', `/edu/calendario/professores/${U.TEACHER.id}/disponibilidade`, { itens: [{ diaSemana: 1, inicioMin: 420, fimMin: 720, tipo: 'DISPONIVEL' }], perfil: { maxAulasDia: 4 } }); check('disp prof', r.status === 200, r)
  r = await teacher('GET', `/edu/calendario/professores/${U.TEACHER.id}/disponibilidade`); check('disp get', r.status === 200 && r.json.itens.length === 1, r)

  // ---- gerador
  await prisma.calSlot.deleteMany({ where: { tenantId: A.tenantId } })
  r = await coord('POST', '/edu/calendario/gerador/diagnostico', { termId: term.id }); check('gerador diagnostico', r.status === 200, r)
  r = await coord('POST', '/edu/calendario/gerador/simular', { termId: term.id }); check('gerador simular', r.status === 200 && r.json.alocacoes.length > 0, r); const sim = r.json
  check('simular não grava slots', (await prisma.calSlot.count({ where: { tenantId: A.tenantId } })) === 0)
  r = await coord('POST', '/edu/calendario/gerador/simular', { termId: 'nope' }); check('gerador simular term 404', r.status === 404, r)
  r = await coordB('POST', '/edu/calendario/gerador/simular', { termId: term.id }); check('gerador xtenant 404', r.status === 404, r)
  r = await coord('POST', '/edu/calendario/gerador/simular', { termId: term.id, dias: [] }); check('gerador dias [] 400', r.status === 400, r)
  r = await coordB('POST', '/edu/calendario/gerador/aplicar', { execucaoId: sim.execucaoId }); check('aplicar xtenant 404', r.status === 404, r)
  r = await coord('POST', '/edu/calendario/gerador/aplicar', { execucaoId: sim.execucaoId }); check('aplicar 201', r.status === 201 && r.json.slotsCriados > 0, r); const ap = r.json
  check('aplicar grava slots', (await prisma.calSlot.count({ where: { tenantId: A.tenantId, geracaoId: ap.execucaoId } })) === ap.slotsCriados)
  nt = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, refType: 'CalGeracao' } }); check('aplicar notifica professores', nt >= 1, nt)
  r = await coord('POST', '/edu/calendario/gerador/aplicar', { execucaoId: sim.execucaoId }); check('aplicar 2x 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/grade/validar', { termId: term.id }); check('grade gerada sem choque', r.status === 200 && r.json.choques === 0, r.json)
  // slot manual antes de reaplicar
  r = await coord('POST', '/edu/calendario/gerador/simular', { termId: term.id }); check('simular 2 (já alocado)', r.status === 200, r)
  const sim2 = r.json
  r = await coord('POST', `/edu/calendario/gerador/execucoes/${sim2.execucaoId}/descartar`); check('descartar', r.status === 200, r)
  r = await coord('POST', `/edu/calendario/gerador/execucoes/${sim2.execucaoId}/descartar`); check('descartar 2x 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/gerador/aplicar', { execucaoId: sim2.execucaoId }); check('aplicar descartada 409', r.status === 409, r)
  const antes = await prisma.calSlot.count({ where: { tenantId: A.tenantId } })
  r = await coord('POST', `/edu/calendario/gerador/execucoes/${ap.execucaoId}/desfazer`); check('desfazer 200', r.status === 200 && r.json.removidos === antes, { r: r.json, antes })
  check('desfazer remove slots', (await prisma.calSlot.count({ where: { tenantId: A.tenantId } })) === 0)
  r = await coord('POST', `/edu/calendario/gerador/execucoes/${ap.execucaoId}/desfazer`); check('desfazer 2x 409', r.status === 409, r)
  r = await coord('POST', '/edu/calendario/gerador/aplicar', { termId: term.id }); check('aplicar direto', r.status === 201, r); const ap2 = r.json
  // re-aplicar substitui gerados e desfazer restaura
  const idsAntes = (await prisma.calSlot.findMany({ where: { tenantId: A.tenantId }, select: { id: true } })).map((x) => x.id).sort()
  r = await coord('POST', '/edu/calendario/gerador/aplicar', { termId: term.id }); check('reaplicar', r.status === 201, r); const ap3 = r.json
  r = await coord('POST', `/edu/calendario/gerador/execucoes/${ap3.execucaoId}/desfazer`); check('desfazer reaplicação', r.status === 200, r)
  const idsDepois = (await prisma.calSlot.findMany({ where: { tenantId: A.tenantId }, select: { id: true } })).map((x) => x.id).sort()
  check('desfazer restaura slots substituídos', JSON.stringify(idsAntes) === JSON.stringify(idsDepois), { antes: idsAntes.length, depois: idsDepois.length })
  r = await coord('GET', '/edu/calendario/gerador/execucoes'); check('execucoes list', r.status === 200 && r.json.total >= 3)
  r = await teacher('POST', '/edu/calendario/gerador/simular', { termId: term.id }); check('gerador teacher 403', r.status === 403)

  // ---- provas
  r = await teacher('POST', '/edu/calendario/provas', { classSectionId: secA.id, tipo: 'PROVA_1', ...futuro('2026-10-20', '08:00', '10:00'), spaceId: s101.id, fiscais: [{ userId: U.TEACHER2.id }] }); check('prova 201', r.status === 201, r); const pv = r.json.avaliacao
  r = await teacher2('POST', '/edu/calendario/provas', { classSectionId: secA.id, tipo: 'PROVA_1', ...futuro('2026-10-21', '08:00', '10:00') }); check('prova outra turma 403', r.status === 403, r)
  r = await teacher('POST', '/edu/calendario/provas', { classSectionId: secB.id, ...futuro('2026-10-20', '08:30', '09:30') }); check('prova mesmo grupo 409', r.status === 409, r)
  r = await teacher('POST', '/edu/calendario/provas', { classSectionId: secA.id, ...futuro('2026-10-20', '09:00', '11:00'), spaceId: s101.id }); check('prova mesma sala 409', r.status === 409, r)
  r = await teacher('POST', '/edu/calendario/provas', { classSectionId: secA.id, ...futuro('2027-10-20', '09:00', '11:00') }); check('prova fora período 409', r.status === 409, r)
  r = await teacher('POST', '/edu/calendario/provas', { classSectionId: secA.id, ...futuro('2026-11-15', '09:00', '11:00') }); check('prova domingo/feriado 409?', [201, 409].includes(r.status), r.status)
  r = await teacher('POST', '/edu/calendario/provas', { classSectionId: secA.id, ...futuro('2026-11-02', '09:00', '11:00') }); check('prova em Finados (feriado) 409', r.status === 409, r)
  r = await admB('POST', '/edu/calendario/provas', { classSectionId: secA.id, ...futuro('2026-10-21', '09:00', '11:00') }); check('prova xtenant 404', r.status === 404, r)
  r = await st('GET', '/edu/calendario/provas'); check('student vê provas das suas turmas', r.status === 200 && r.json.total === 1, r.json?.total)
  r = await teacher2('GET', `/edu/calendario/provas/${pv.id}`); check('prof fiscal vê prova', r.status === 200, r)
  r = await admB('GET', `/edu/calendario/provas/${pv.id}`); check('prova get xtenant 404', r.status === 404, r)
  r = await teacher2('POST', `/edu/calendario/provas/${pv.id}/fiscais/confirmar`); check('fiscal confirma', r.status === 200, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/fiscais/confirmar`); check('nao fiscal confirmar 404', r.status === 404, r)
  r = await teacher('PATCH', `/edu/calendario/provas/${pv.id}`, { ...futuro('2026-10-22', '08:00', '10:00'), motivo: 'Remarcada' }); check('prova remarcar', r.status === 200, r)
  nt = await prisma.eduNotification.count({ where: { tenantId: A.tenantId, studentId: ac.students[0].id, refType: 'CalExame' } }); check('alunos notificados da remarcação', nt === 1, nt)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/status`, { status: 'REALIZADA' }); check('prova realizada futura 409', r.status === 409, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/status`, { status: 'CONFIRMADA' }); check('prova confirmar', r.status === 200, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/status`, { status: 'CONFIRMADA' }); check('prova confirmar 2x 409', r.status === 409, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/segunda-chamada`, { ...futuro('2026-10-27', '08:00', '10:00') }); check('segunda chamada', r.status === 201, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/segunda-chamada`, { ...futuro('2026-12-10', '08:00', '10:00') }); check('segunda chamada fora janela 409', r.status === 409, r)
  r = await coord('POST', `/edu/calendario/provas/${pv.id}/fiscais`, { userId: B.users.TEACHER.id }); check('fiscal de outro tenant 404', r.status === 404, r)
  r = await coord('POST', `/edu/calendario/provas/${pv.id}/fiscais`, { userId: U.FINANCE.id }); check('add fiscal', r.status === 201, r)
  r = await coord('DELETE', `/edu/calendario/provas/${pv.id}/fiscais/${U.FINANCE.id}`); check('del fiscal', r.status === 204, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/status`, { status: 'CANCELADA' }); check('cancelar sem motivo 400', r.status === 400, r)
  r = await teacher('POST', `/edu/calendario/provas/${pv.id}/status`, { status: 'CANCELADA', motivo: 'Greve' }); check('cancelar', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/provas/conflitos?termId=${term.id}`); check('provas conflitos', r.status === 200, r)

  // ---- prazos
  r = await coord('GET', `/edu/calendario/prazos?termId=${term.id}`); const prazos = r.json.items; check('prazos list', r.status === 200 && prazos.length === 3, prazos?.length)
  const pr = prazos.find((p: any) => p.etapa === 'N1')
  r = await coord('POST', '/edu/calendario/prazos', { termId: term.id, titulo: 'Extra', prazo: iso('2026-10-10T23:59'), abertura: iso('2026-10-11T00:00') }); check('prazo abertura>prazo 400', r.status === 400, r)
  r = await coord('POST', '/edu/calendario/prazos', { termId: term.id, titulo: 'Prazo livre', etapa: 'N3', prazo: iso('2026-10-20T23:59') }); check('prazo 201', r.status === 201 && r.json.lembretesAgendados > 0, r); const pz = r.json
  r = await admB('POST', '/edu/calendario/prazos', { termId: term.id, titulo: 'Prazo hack', prazo: iso('2026-10-20T23:59') }); check('prazo xtenant 404', r.status === 404, r)
  r = await coord('GET', `/edu/calendario/prazos/${pz.id}/pendencias`); check('pendencias', r.status === 200 && r.json.total === 2, r.json)
  r = await teacher('POST', `/edu/calendario/prazos/${pz.id}/concluir`, {}); check('concluir', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/prazos/${pz.id}/pendencias`); check('pendencias apos concluir', r.json.concluidos.length === 1, r.json)
  const remsOpen = await prisma.eduReminder.count({ where: { tenantId: A.tenantId, assigneeUserId: U.TEACHER.id, dedupeKey: { startsWith: `cal:prazo:${pz.id}:` }, status: 'PENDENTE' } }); check('concluir encerra lembretes', remsOpen === 0, remsOpen)
  r = await coord('POST', `/edu/calendario/prazos/${pz.id}/prorrogar`, { novoPrazo: iso('2026-10-10T23:59'), motivo: 'Greve de ônibus' }); check('prorrogar passado 409', r.status === 409, r)
  r = await coord('POST', `/edu/calendario/prazos/${pz.id}/prorrogar`, { novoPrazo: iso('2026-10-30T23:59'), motivo: 'Greve de ônibus' }); check('prorrogar', r.status === 200, r)
  r = await coord('POST', `/edu/calendario/prazos/${pz.id}/prorrogar`, { novoPrazo: iso('2026-11-05T23:59'), motivo: 'Individual', professorUserId: U.TEACHER2.id }); check('prorrogar individual', r.status === 200, r)
  r = await teacher2('GET', `/edu/calendario/prazos/vigente?termId=${term.id}&etapa=N3`); check('vigente prof2 com exceção', r.status === 200 && r.json.prorrogado === true, r.json)
  r = await teacher('GET', '/edu/calendario/prazos/meus'); check('prazos meus', r.status === 200 && r.json.items.length >= 3, r.json?.items?.length)
  r = await st('POST', '/edu/calendario/prazos', { termId: term.id, titulo: 'x1x', prazo: iso('2026-10-20T23:59') }); check('prazo student 403', r.status === 403)
  r = await coord('PATCH', `/edu/calendario/prazos/${pz.id}`, { ativo: false }); check('prazo desativar', r.status === 200, r)
  r = await coord('DELETE', `/edu/calendario/prazos/${pz.id}`); check('prazo delete', r.status === 204, r)

  // agenda
  r = await st('GET', '/edu/calendario/meu-calendario'); check('meu-calendario aluno', r.status === 200, r)
  r = await teacher('GET', '/edu/calendario/meu-calendario'); check('meu-calendario prof', r.status === 200, r)
  r = await st('POST', '/edu/calendario/feeds', {}); check('feed criar', [200, 201].includes(r.status), r)
  const tok = r.json?.token ?? r.json?.feed?.token
  if (tok) { const rr = await fetch(`${(await import('./_lib')).default ?? ''}`).catch(() => null) }
  r = await coord('GET', '/edu/calendario/relatorios/resumo'); check('relatorio resumo', r.status === 200, r)
  r = await coord('GET', '/edu/calendario/relatorios/ocupacao'); check('relatorio ocupacao', r.status === 200, r)
  r = await coord('GET', `/edu/calendario/relatorios/grade.html?termId=${term.id}`); check('relatorio grade html', r.status === 200, r.text.slice(0, 100))

  // jobs
  const { runEduJobs } = await import('../../src/modules/core/jobs')
  const jobs: any = await runEduJobs()
  for (const [k, v] of Object.entries<any>(jobs)) if (k.startsWith('calendario') || k.startsWith('core')) check('job ' + k, v.ok, v)
  await close()
}
main().catch((e) => { console.error(e); process.exit(2) })
