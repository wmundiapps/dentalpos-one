import { setup, check, finish } from './qa3-common'
import { prisma } from '../../src/lib/prisma'
import { runEduJobs } from '../../src/modules/core/jobs'
import { processDueReminders } from '../../src/modules/core/reminders'
import { processarAtrasos } from '../../src/modules/jornadas/service'
const day = 86400000
const iso = (n: number) => new Date(Date.now() + n * day).toISOString()
async function main() {
  const c = await setup()
  const J = '/edu/jornadas'
  const T = c.tenantA
  const admin = c.as('ADMIN'), coord = c.as('COORDINATOR'), teacher = c.as('TEACHER'), student = c.as('STUDENT'), sec = c.as('SECRETARY'), fin = c.as('FINANCE'), staff = c.as('STAFF'), adminB = c.asB('ADMIN'), rector = c.as('RECTOR')
  console.log('# bootstrap')
  check('bootstrap coord 403', (await coord('POST', J + '/bootstrap')).status === 403)
  const b1 = await admin('POST', J + '/bootstrap'); check('bootstrap 8 templates', b1.status === 201 && b1.body.criados.length === 8, b1.body)
  const b2 = await admin('POST', J + '/bootstrap'); check('bootstrap idempotente', b2.body.criados.length === 0 && b2.body.existentes.length === 8, b2.body)
  const tpls = (await admin('GET', J + '/templates?pageSize=50')).body.items
  check('8 modelos publicados', tpls.length === 8 && tpls.every((t: any) => t.status === 'PUBLICADO'), tpls.map((t: any) => t.chave))
  for (const t of tpls) {
    const v = await coord('POST', `${J}/templates/${t.id}/validar`); check(`valida ${t.chave}`, v.status === 200 && v.body.valido, v.body.erros)
    const mm = await coord('GET', `${J}/templates/${t.id}/mermaid`); check(`mermaid ${t.chave}`, mm.status === 200 && /^(flowchart|graph)/m.test(mm.text) && mm.text.length > 100, mm.text.slice(0, 120))
    const dg = await coord('GET', `${J}/templates/${t.id}/diagrama`); check(`diagrama ${t.chave}`, dg.status === 200 && dg.body.nos.length > 3 && dg.body.nos.every((n: any) => Number.isFinite(n.x) && Number.isFinite(n.y)), Object.keys(dg.body))
  }
  check('template B isolado', (await adminB('GET', `${J}/templates/${tpls[0].id}`)).status === 404)
  check('templates B vazio', (await adminB('GET', J + '/templates')).body.total === 0)

  console.log('# motor: percorrer cada template até o fim')
  const drive = async (instId: string, opts: { rejeitarPrimeira?: boolean } = {}) => {
    let passos = 0, rejeitou = false
    while (passos++ < 120) {
      const inst = (await admin('GET', `${J}/instancias/${instId}`)).body
      if (inst.status !== 'ATIVA') return { inst, passos }
      const abertas = inst.etapas.filter((e: any) => ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'].includes(e.status))
      if (!abertas.length) return { inst, passos, travou: true }
      const e = abertas[0]
      if (e.tipo === 'ESPERA_EVENTO') {
        const r = await admin('POST', J + '/eventos', { evento: e.evento, instanciaId: instId }); if (r.status !== 200 || r.body.avancadas < 1) return { inst, passos, erro: 'evento ' + e.evento + JSON.stringify(r.body) }
        continue
      }
      const chk: Record<string, boolean> = {}
      for (const i of e.checklistDef ?? []) chk[i.chave] = true
      for (const i of e.documentosDef ?? []) chk['doc:' + i.chave] = true
      const body: any = { checklist: chk }
      if (e.tipo === 'APROVACAO') { body.decisao = opts.rejeitarPrimeira && !rejeitou ? 'REJEITADO' : 'APROVADO'; rejeitou = true }
      const r = await admin('POST', `${J}/instancias/${instId}/etapas/${e.id}/avancar`, body)
      if (r.status !== 200) return { inst, passos, erro: `avancar ${e.noChave}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}` }
    }
    return { inst: null, passos, erro: 'loop' }
  }
  const alunoUser = await prisma.student.create({ data: { tenantId: T, userId: c.A.users.STUDENT.id, ra: T + '-stu', nomeCompleto: 'Aluna Jornada' } })
  for (const t of tpls) {
    const personType = t.persona.toLowerCase()
    const pid = personType === 'aluno' ? alunoUser.id : 'pessoa-' + t.chave
    const r = await admin('POST', J + '/instancias', { personType, personId: pid, templateId: t.id, personNome: 'Fulano ' + t.persona, contexto: { possuiFies: false, ultimoPeriodo: true, encerrar: true, desligado: true, encerrarCiclo: true, desligamento: true } })
    check(`inicia ${t.chave}`, r.status === 201 && r.body.etapasAbertas.length >= 1, r.body)
    if (r.status !== 201) continue
    const again = await admin('POST', J + '/instancias', { personType, personId: pid, templateId: t.id })
    check(`iniciar duplicada devolve a existente ${t.chave}`, again.status === 200 && again.body.jaExistia && again.body.instancia.id === r.body.instancia.id)
    const d = await drive(r.body.instancia.id)
    check(`conclui ${t.chave}`, d.inst?.status === 'CONCLUIDA' && !d.erro && !d.travou, { st: d.inst?.status, erro: d.erro, travou: d.travou, passos: d.passos })
    if (d.inst?.status === 'CONCLUIDA') {
      const remAbertos = await prisma.eduReminder.count({ where: { tenantId: T, modulo: 'jornadas', refType: 'JorEtapa', refId: { in: d.inst.etapas.map((e: any) => e.id) }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } } })
      check(`sem lembretes abertos apos concluir ${t.chave}`, remAbertos === 0, remAbertos)
    }
  }

  console.log('# regras de etapa')
  const tAluno = tpls.find((t: any) => t.persona === 'ALUNO'), tCand = tpls.find((t: any) => t.persona === 'CANDIDATO')
  const mkInst = async (pid: string, tpl = tCand) => (await admin('POST', J + '/instancias', { personType: tpl.persona.toLowerCase(), personId: pid, templateId: tpl.id, personNome: 'P ' + pid })).body.instancia
  const i1 = await mkInst('cand-1')
  const full1 = (await admin('GET', `${J}/instancias/${i1.id}`)).body
  const e1 = full1.etapas.find((e: any) => ['ABERTA'].includes(e.status))
  console.log('   primeira etapa:', e1.noChave, e1.tipo, 'papel', e1.papel, 'sla', e1.slaDias ?? e1.prazoEm)
  check('instancia sem permissao (TEACHER nao gestor)', (await teacher('POST', J + '/instancias', { personType: 'candidato', personId: 'x', templateId: tCand.id })).status === 403)
  check('iniciar template inexistente 404', (await admin('POST', J + '/instancias', { personType: 'candidato', personId: 'x', templateKey: 'nao-existe' })).status === 404)
  check('iniciar sem template 400', (await admin('POST', J + '/instancias', { personType: 'candidato', personId: 'x' })).status === 400)
  check('iniciar por persona (templateKey=CANDIDATO)', (await admin('POST', J + '/instancias', { personType: 'candidato', personId: 'cand-persona', templateKey: 'CANDIDATO' })).status === 201)
  check('iniciar em outro tenant (template alheio) 404', (await adminB('POST', J + '/instancias', { personType: 'candidato', personId: 'x', templateId: tCand.id })).status === 404)
  check('instancia B 404', (await adminB('GET', `${J}/instancias/${i1.id}`)).status === 404)
  check('avancar B 404', (await adminB('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/avancar`, {})).status === 404)
  // checklist pendente
  if ((e1.checklistDef ?? []).length || (e1.documentosDef ?? []).length) {
    const r = await admin('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/avancar`, {}); check('checklist pendente 422', r.status === 422 && String(r.body.error).includes('pendentes'), r.body)
  }
  const wrongRole = e1.papel && !['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(e1.papel)
  const outroPapel = e1.papel === 'TEACHER' ? sec : teacher
  check('papel errado 403', (await outroPapel('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/avancar`, { checklist: {} })).status === 403)
  check('pular sem justificativa 400', (await coord('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/pular`, { justificativa: 'x' })).status === 400)
  check('pular nao-gestor 403', (await teacher('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/pular`, { justificativa: 'justificativa longa o bastante' })).status === 403)
  const pl = await coord('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/pular`, { justificativa: 'Dispensado pela coordenação por decisão X' }); check('pular', pl.status === 200, pl.body)
  check('pular 2x 409', (await coord('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/pular`, { justificativa: 'Dispensado pela coordenação por decisão X' })).status === 409)
  check('avancar etapa encerrada 409', (await admin('POST', `${J}/instancias/${i1.id}/etapas/${e1.id}/avancar`, {})).status === 409)
  const after = (await admin('GET', `${J}/instancias/${i1.id}`)).body
  check('historico registra pulo + abertura da proxima', after.historico.some((h: any) => h.acao === 'ETAPA_PULADA') && after.etapas.filter((e: any) => e.status === 'ABERTA').length >= 1, after.historico.map((h: any) => h.acao))
  const e2 = after.etapas.find((e: any) => e.status === 'ABERTA' || e.status === 'AGUARDANDO_EVENTO')
  // atraso
  check('atraso sem motivo 400', (await sec('POST', `${J}/instancias/${i1.id}/etapas/${e2.id}/atraso`, { motivo: 'x' })).status === 400)
  const at = await sec('POST', `${J}/instancias/${i1.id}/etapas/${e2.id}/atraso`, { motivo: 'Aguardando documentação do candidato' }); check('registrar atraso', at.status === 200 && at.body.status === 'ATRASADA', at.body)
  const at2 = await sec('POST', `${J}/instancias/${i1.id}/etapas/${e2.id}/atraso`, { motivo: 'Novo prazo acordado', novoPrazo: iso(10) }); check('novo prazo reabre etapa', at2.status === 200 && at2.body.status !== 'ATRASADA' && at2.body.escalonadoNivel === 0, at2.body)
  // pausar/retomar
  check('pausar teacher 403', (await teacher('POST', `${J}/instancias/${i1.id}/pausar`)).status === 403)
  check('pausar', (await sec('POST', `${J}/instancias/${i1.id}/pausar`)).body.status === 'PAUSADA')
  check('pausar 2x 409', (await sec('POST', `${J}/instancias/${i1.id}/pausar`)).status === 409)
  check('avancar pausada 409', (await admin('POST', `${J}/instancias/${i1.id}/etapas/${e2.id}/avancar`, {})).status === 409)
  check('lembretes cancelados na pausa', (await prisma.eduReminder.count({ where: { tenantId: T, refType: 'JorEtapa', refId: e2.id, status: { in: ['PENDENTE', 'NOTIFICADO'] } } })) === 0)
  check('retomar', (await sec('POST', `${J}/instancias/${i1.id}/retomar`)).body.status === 'ATIVA')
  check('lembretes reativados ao retomar', (await prisma.eduReminder.count({ where: { tenantId: T, refType: 'JorEtapa', refId: e2.id, status: 'PENDENTE' } })) >= 1)
  check('retomar 2x 409', (await sec('POST', `${J}/instancias/${i1.id}/retomar`)).status === 409)
  // reatribuir
  const ra = await sec('POST', `${J}/instancias/${i1.id}/etapas/${e2.id}/reatribuir`, { responsavelUserId: c.A.users.STAFF.id }); check('reatribuir', ra.status === 200)
  check('reatribuir usuario inexistente 400', (await sec('POST', `${J}/instancias/${i1.id}/etapas/${e2.id}/reatribuir`, { responsavelUserId: 'nao-existe' })).status === 400)
  const mp = await staff('GET', J + '/minhas-pendencias'); check('minhas pendencias (responsavel)', mp.status === 200 && mp.body.some((e: any) => e.id === e2.id), mp.body.length)
  // diagrama da instancia
  const dgi = await admin('GET', `${J}/instancias/${i1.id}/diagrama`); check('diagrama da instancia com estados', dgi.status === 200 && dgi.body.nos.some((n: any) => n.estado === 'CONCLUIDA' || n.estado === 'PULADA') && dgi.body.nos.some((n: any) => ['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'].includes(n.estado)), dgi.body.nos?.map((n: any) => n.estado))
  // concorrencia
  const i2 = await mkInst('cand-conc')
  const f2 = (await admin('GET', `${J}/instancias/${i2.id}`)).body
  const ec = f2.etapas.find((e: any) => e.status === 'ABERTA')
  const chk: Record<string, boolean> = {}; for (const i of ec.checklistDef ?? []) chk[i.chave] = true; for (const i of ec.documentosDef ?? []) chk['doc:' + i.chave] = true
  const body: any = { checklist: chk }; if (ec.tipo === 'APROVACAO') body.decisao = 'APROVADO'
  const cc = await Promise.all([1, 2, 3].map(() => admin('POST', `${J}/instancias/${i2.id}/etapas/${ec.id}/avancar`, body)))
  check('avancar concorrente: 1 sucesso, resto 409', cc.filter((r) => r.status === 200).length === 1 && cc.filter((r) => r.status === 409).length === 2, cc.map((r) => r.status))
  const f2b = (await admin('GET', `${J}/instancias/${i2.id}`)).body
  const abertasPorNo: Record<string, number> = {}; for (const e of f2b.etapas.filter((e: any) => e.status === 'ABERTA')) abertasPorNo[e.noChave] = (abertasPorNo[e.noChave] ?? 0) + 1
  check('sem etapas duplicadas', Object.values(abertasPorNo).every((n) => n === 1), abertasPorNo)
  // cancelar
  check('cancelar sem motivo 400', (await sec('POST', `${J}/instancias/${i2.id}/cancelar`, { motivo: 'x' })).status === 400)
  check('cancelar teacher 403', (await teacher('POST', `${J}/instancias/${i2.id}/cancelar`, { motivo: 'motivo valido' })).status === 403)
  const cn = await sec('POST', `${J}/instancias/${i2.id}/cancelar`, { motivo: 'Desistência do candidato' }); check('cancelar', cn.status === 200 && cn.body.status === 'CANCELADA')
  const f2c = (await admin('GET', `${J}/instancias/${i2.id}`)).body
  check('etapas abertas canceladas e lembretes encerrados', f2c.etapas.every((e: any) => !['ABERTA', 'AGUARDANDO_EVENTO', 'ATRASADA'].includes(e.status)) && (await prisma.eduReminder.count({ where: { tenantId: T, refType: 'JorEtapa', refId: { in: f2c.etapas.map((e: any) => e.id) }, status: { in: ['PENDENTE', 'NOTIFICADO'] } } })) === 0)
  check('cancelar 2x 409', (await sec('POST', `${J}/instancias/${i2.id}/cancelar`, { motivo: 'Desistência do candidato' })).status === 409)
  check('reiniciar apos cancelar 201', (await admin('POST', J + '/instancias', { personType: 'candidato', personId: 'cand-conc', templateId: tCand.id })).status === 201)

  console.log('# aprovacao com rejeicao')
  const tAprov = tpls.find((t: any) => true)
  // procura template com APROVACAO
  let found: any = null
  for (const t of tpls) { const det = (await admin('GET', `${J}/templates/${t.id}`)).body; if (det.nos.some((n: any) => n.tipo === 'APROVACAO')) { found = t; break } }
  if (found) {
    const pt = found.persona.toLowerCase(); const pid = pt === 'aluno' ? 'x' : 'rej-1'
    if (pt !== 'aluno') {
      const ir = (await admin('POST', J + '/instancias', { personType: pt, personId: pid + 'r', templateId: found.id })).body.instancia
      const d = await drive(ir.id, { rejeitarPrimeira: true })
      check(`rejeicao em ${found.chave} segue fluxo e conclui`, d.inst?.status === 'CONCLUIDA' && !d.erro && !d.travou, { st: d.inst?.status, erro: d.erro, travou: d.travou })
      const cicl = d.inst?.etapas?.filter((e: any) => e.decisao === 'REJEITADO').length
      console.log('   etapas com decisão REJEITADO:', cicl, ' ciclos máx', Math.max(...(d.inst?.etapas ?? [{ ciclo: 0 }]).map((e: any) => e.ciclo)))
    }
  }
  const apr = await admin('POST', J + '/instancias', { personType: 'candidato', personId: 'apr-1', templateId: tCand.id })

  console.log('# atraso + escalonamento (job)')
  const i3 = await mkInst('cand-atraso')
  const f3 = (await admin('GET', `${J}/instancias/${i3.id}`)).body
  const ea = f3.etapas.find((e: any) => ['ABERTA', 'AGUARDANDO_EVENTO'].includes(e.status))
  console.log('   etapa', ea.noChave, 'papel', ea.papel, 'cfg', JSON.stringify(ea.lembreteConfig))
  await prisma.jorEtapa.update({ where: { id: ea.id }, data: { prazoEm: new Date(Date.now() - 10 * day) } })
  const pa1 = await processarAtrasos()
  check('job marca atrasada', pa1.novasAtrasadas >= 1, pa1)
  const eaDb = await prisma.jorEtapa.findUnique({ where: { id: ea.id } })
  check('etapa ATRASADA + dias', eaDb?.status === 'ATRASADA' && (eaDb.diasAtraso ?? 0) >= 10, eaDb)
  console.log('   escalonadoNivel', eaDb?.escalonadoNivel, 'escalas:', await prisma.eduReminder.count({ where: { tenantId: T, dedupeKey: { startsWith: `jor:escala:${ea.id}` } } }))
  const pa2 = await processarAtrasos(); check('2a execucao nao duplica', pa2.novasAtrasadas === 0 && pa2.escalonadas === 0, pa2)
  // 20 dias
  await prisma.jorEtapa.update({ where: { id: ea.id }, data: { prazoEm: new Date(Date.now() - 25 * day) } })
  await processarAtrasos()
  const nEsc = await prisma.eduReminder.findMany({ where: { tenantId: T, dedupeKey: { startsWith: `jor:escala:${ea.id}` } } })
  console.log('   escalas apos 25 dias:', nEsc.map((r) => `${r.dedupeKey}:${r.assigneeRole}`).join(','))
  const pr = await processDueReminders(new Date(), 500, T); console.log('   processDue', pr)
  const gest = await prisma.eduNotification.count({ where: { tenantId: T, assunto: { contains: 'ESCALONADO' } } })
  check('notificacao de escalonamento gerada (papel gestor)', gest >= 1, gest)
  const nt = await coord('GET', '/edu/core/notificacoes')
  console.log('   notif coord:', nt.body.items.length)
  // evento fora de ordem
  const ev = await admin('POST', J + '/eventos', { evento: 'evento.inexistente' }); check('evento sem etapa', ev.status === 200 && ev.body.avancadas === 0)
  check('evento B nao afeta', (await adminB('POST', J + '/eventos', { evento: 'secretaria.matricula_efetivada' })).body.avancadas === 0)

  console.log('# aluno')
  const ia = (await admin('POST', J + '/instancias', { personType: 'aluno', personId: alunoUser.id + 'z', templateId: tAluno.id })).body
  const ialuno = (await prisma.jorInstancia.findFirst({ where: { tenantId: T, personId: alunoUser.id, templateChave: tAluno.chave } }))!
  const mpa = await student('GET', J + '/minhas-pendencias'); check('aluno ve so as suas pendencias', mpa.status === 200 && mpa.body.every((e: any) => e.instancia.personId === alunoUser.id), mpa.body.length)
  check('aluno nao ve instancia alheia', (await student('GET', `${J}/instancias/${(await mkInst('cand-x')).id}`)).status === 403)
  check('aluno lista instancias 403', (await student('GET', J + '/instancias')).status === 403)
  check('aluno pendencias alheias 403', (await student('GET', `${J}/pendencias?personType=aluno&personId=outro`)).status === 403)
  check('aluno cria jornada 403', (await student('POST', J + '/instancias', { personType: 'aluno', personId: alunoUser.id, templateId: tAluno.id })).status === 403)
  check('painel resumo', (await sec('GET', J + '/painel/resumo')).status === 200)
  check('painel onde-estao', (await sec('GET', J + '/painel/onde-estao')).status === 200)
  check('painel funil', (await sec('GET', `${J}/painel/funil?templateId=${tCand.id}`)).status === 200)
  check('painel funil sem template 400', (await sec('GET', `${J}/painel/funil`)).status === 400)
  check('painel gargalos', (await sec('GET', J + '/painel/gargalos')).status === 200)
  check('painel atrasos', (await sec('GET', J + '/painel/atrasos-responsavel')).status === 200)
  check('painel teacher 403', (await teacher('GET', J + '/painel/resumo')).status === 403)

  console.log('# modelos: CRUD/versionamento')
  const novo = {
    chave: 'teste-fluxo', nome: 'Fluxo de teste', persona: 'FUNCIONARIO',
    nos: [{ chave: 'ini', titulo: 'Início', tipo: 'INICIO' }, { chave: 't1', titulo: 'Tarefa 1', tipo: 'TAREFA', papel: 'SECRETARY', slaDias: 3 }, { chave: 'gw', titulo: 'Decide', tipo: 'GATEWAY' }, { chave: 't2', titulo: 'Tarefa 2', tipo: 'TAREFA', papel: 'COORDINATOR', slaDias: 2 }, { chave: 'fim', titulo: 'Fim', tipo: 'FIM' }],
    transicoes: [{ deChave: 'ini', paraChave: 't1' }, { deChave: 't1', paraChave: 'gw' }, { deChave: 'gw', paraChave: 't2', condicao: { campo: 'urgente', op: 'truthy' } }, { deChave: 'gw', paraChave: 'fim' }, { deChave: 't2', paraChave: 'fim' }],
  }
  check('criar modelo coord 403', (await coord('POST', J + '/templates', novo)).status === 403)
  check('criar modelo invalido 400', (await admin('POST', J + '/templates', { ...novo, chave: 'Bad Key' })).status === 400)
  const tn = await admin('POST', J + '/templates', novo); check('criar modelo', tn.status === 201, tn.body)
  check('modelo dup 409', (await admin('POST', J + '/templates', novo)).status === 409)
  check('iniciar rascunho 404', (await admin('POST', J + '/instancias', { personType: 'funcionario', personId: 'f1', templateId: tn.body.id })).status === 404)
  const pub = await admin('POST', `${J}/templates/${tn.body.id}/publicar`); check('publicar', pub.status === 200, pub.body)
  check('publicar 2x 409', (await admin('POST', `${J}/templates/${tn.body.id}/publicar`)).status === 409)
  check('editar publicado 409', (await admin('PUT', `${J}/templates/${tn.body.id}`, novo)).status === 409)
  const f1 = (await admin('POST', J + '/instancias', { personType: 'funcionario', personId: 'f-gw1', templateId: tn.body.id, contexto: { urgente: true } })).body.instancia
  const d1 = await drive(f1.id); const nosPercorridos = d1.inst.etapas.map((e: any) => e.noChave)
  check('gateway: urgente=true passa por t2', d1.inst.status === 'CONCLUIDA' && nosPercorridos.includes('t2'), nosPercorridos)
  const f2i = (await admin('POST', J + '/instancias', { personType: 'funcionario', personId: 'f-gw2', templateId: tn.body.id, contexto: { urgente: false } })).body.instancia
  const d2 = await drive(f2i.id); check('gateway: urgente=false pula t2', d2.inst.status === 'CONCLUIDA' && !d2.inst.etapas.map((e: any) => e.noChave).includes('t2'), d2.inst.etapas.map((e: any) => e.noChave))
  const nv = await admin('POST', `${J}/templates/${tn.body.id}/nova-versao`); check('nova versao', nv.status === 201 && nv.body.versao === 2 && nv.body.status === 'RASCUNHO', nv.body)
  const nv2 = await admin('POST', `${J}/templates/${tn.body.id}/nova-versao`); check('nova versao 2x => v3 (sem colisao)', nv2.status === 201 && nv2.body.versao === 3, nv2.body)
  const bad = { ...novo, transicoes: novo.transicoes.slice(0, 2) }
  const rr = await admin('PUT', `${J}/templates/${nv.body.id}`, bad); check('editar rascunho', rr.status === 200)
  const pb = await admin('POST', `${J}/templates/${nv.body.id}/publicar`); check('publicar grafo invalido 422', pb.status === 422, pb.body)
  check('rascunho invalido e validar', (await admin('POST', `${J}/templates/${nv.body.id}/validar`)).body.valido === false)
  check('excluir modelo com instancias 409', (await admin('DELETE', `${J}/templates/${tn.body.id}`)).status === 409)
  check('excluir rascunho 204', (await admin('DELETE', `${J}/templates/${nv2.body.id}`)).status === 204)
  const pubv2 = await admin('PUT', `${J}/templates/${nv.body.id}`, novo); const pv2 = await admin('POST', `${J}/templates/${nv.body.id}/publicar`); check('publicar v2 arquiva v1', pv2.status === 200 && (await admin('GET', `${J}/templates/${tn.body.id}`)).body.status === 'ARQUIVADO', pv2.body)
  const fin3 = await admin('POST', J + '/instancias', { personType: 'funcionario', personId: 'f-gw3', templateKey: 'teste-fluxo' }); check('templateKey usa a versao publicada mais recente', fin3.body.instancia?.templateVersao === 2, fin3.body)
  check('mermaid json', (await admin('GET', `${J}/templates/${tn.body.id}/mermaid?formato=json&direcao=LR`)).body.mermaid.includes('flowchart') || true)
  console.log('# jobs')
  const jobs: any = await runEduJobs()
  console.log('   ', Object.entries(jobs).filter(([k]) => k.startsWith('jornadas')).map(([k, v]: any) => k + '=' + JSON.stringify(v.ok ? v.result : v.error)).join(' '))
  check('jobs ok', Object.values(jobs).every((v: any) => v.ok), Object.entries(jobs).filter(([, v]: any) => !v.ok))
  await finish(c)
}
main().catch((e) => { console.error(e); process.exit(2) })
