import { setup, check, summary, prisma } from './qa5-lib'
import { runEduJobs } from '../../src/modules/core/jobs'
import { conviteEgressoCodigo } from '../../src/modules/apoio/pesquisa'

const d = (n: number) => new Date(Date.now() + n * 864e5).toISOString()
async function main() {
  const { call, t1, t2, close } = await setup()
  await prisma.eduInstitution.create({ data: { tenantId: t1.tenantId, nome: 'Inst A', sigla: 'IA' + t1.tenantId.slice(-5).toUpperCase() } })
  await prisma.eduInstitution.create({ data: { tenantId: t2.tenantId, nome: 'Inst B', sigla: 'IB' + t2.tenantId.slice(-5).toUpperCase() } })
  const admin = await t1.mk('ADMIN'), sup = await t1.mk('SUPPORT'), sup2 = await t1.mk('SUPPORT'), coord = await t1.mk('COORDINATOR'), tch = await t1.mk('TEACHER'), fin = await t1.mk('FINANCE'), sec = await t1.mk('SECRETARY')
  const studs = [] as any[]; for (let i = 0; i < 7; i++) studs.push(await t1.mk('STUDENT', true))
  const [s1, s2] = studs
  const admB = await t2.mk('ADMIN'), supB = await t2.mk('SUPPORT'), stuB = await t2.mk('STUDENT', true)
  const A = '/edu/apoio'
  let r = await call(sup, 'POST', A + '/bootstrap', {}); check('boot', r.status === 200, r.text)
  r = await call(sup, 'POST', A + '/bootstrap', {}); check('boot idempotente', r.status === 200 && Object.values(r.json.criados).every((x) => x === 0), r.text)
  r = await call(s1, 'POST', A + '/bootstrap', {}); check('boot aluno 403', r.status === 403)

  // ---------- atendimentos
  const at = { studentId: s1.studentId, tipo: 'PSICOLOGICO', dataHora: d(2), motivo: 'Ansiedade nas provas' }
  r = await call(coord, 'POST', A + '/atendimentos', at); check('atend criar (coord)', r.status === 201, r.text)
  r = await call(sup, 'POST', A + '/atendimentos', at); check('atend criar', r.status === 201, r.text); const a1 = r.json
  check('sigilo padrao psicologico', a1.sigilo === 'SIGILOSO', a1.sigilo)
  r = await call(sup, 'POST', A + '/atendimentos', { ...at, studentId: s2.studentId }); check('conflito de horario 409', r.status === 409, r.text)
  r = await call(sup, 'POST', A + '/atendimentos', { ...at, studentId: 'nao-existe' }); check('aluno inexistente 404', r.status === 404, r.text)
  r = await call(sup, 'POST', A + '/atendimentos', { ...at, tipo: 'XX' }); check('tipo invalido 400', r.status === 400, r.text)
  r = await call(s1, 'POST', A + '/atendimentos', at); check('aluno nao agenda 403', r.status === 403)
  r = await call(sup2, 'GET', A + '/atendimentos/' + a1.id); check('sigiloso outro profissional 403', r.status === 403, r.text)
  r = await call(coord, 'GET', A + '/atendimentos/' + a1.id); check('sigiloso coord 403', r.status === 403, r.text)
  r = await call(sup2, 'PATCH', A + '/atendimentos/' + a1.id, { relato: 'tentando ler' }); check('sigiloso relato outro 403', r.status === 403, r.text)
  r = await call(coord, 'GET', A + '/atendimentos'); check('coord lista sem sigilosos', r.status === 200 && r.json.items.every((x: any) => x.sigilo === 'NORMAL'), r.text)
  r = await call(sup, 'GET', A + '/atendimentos/' + a1.id); check('profissional le', r.status === 200 && r.json.motivo, r.text)
  r = await call(sup2, 'GET', A + '/atendimentos?studentId=' + s1.studentId); check('lista sanitiza relato', r.status === 200 && r.json.items.every((x: any) => x.relato === undefined), r.text)
  r = await call(sup, 'PATCH', A + '/atendimentos/' + a1.id, { status: 'REALIZADO' }); check('realizado sem relato 400', r.status === 400, r.text)
  r = await call(sup, 'PATCH', A + '/atendimentos/' + a1.id, { status: 'REALIZADO', relato: 'Sessão realizada, plano definido.', retornoEm: d(14) }); check('realizado', r.status === 200, r.text)
  r = await call(sup, 'PATCH', A + '/atendimentos/' + a1.id, { status: 'CANCELADO' }); check('cancelar realizado 409', r.status === 409, r.text)
  r = await call(s1, 'GET', A + '/atendimentos/meus'); check('aluno ve proprios (sem relato)', r.status === 200 && r.json.length >= 1 && !JSON.stringify(r.json).includes('Sessão'), r.text)
  r = await call(s2, 'GET', A + '/atendimentos/meus'); check('aluno2 nao ve', r.status === 200 && r.json.length === 0, r.text)
  r = await call(s2, 'POST', A + '/atendimentos/solicitar', { tipo: 'SOCIAL', motivo: 'preciso de ajuda' }); check('solicitar', r.status === 201, r.text)
  const sol = await prisma.apoAtendimento.findFirst({ where: { studentId: s2.studentId } }); check('solicitacao criada com profissional', !!sol && sol.profissionalId !== 'PENDENTE', sol?.profissionalId)
  r = await call(admB, 'GET', A + '/atendimentos/' + a1.id); check('tenant B 404', r.status === 404, r.status)
  r = await call(sup, 'POST', A + '/atendimentos', { ...at, dataHora: d(5) }); const a2 = r.json
  r = await call(sup, 'PATCH', A + '/atendimentos/' + a2.id, { status: 'FALTOU' }); check('faltou', r.status === 200, r.text)
  const notFalta = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, studentId: s1.studentId, assunto: 'Atendimento não realizado' } }); check('notificacao falta', notFalta === 1)

  // ---------- risco
  r = await call(sup, 'GET', A + '/risco/alunos/' + s1.studentId); check('risco aluno sem dados', r.status === 200 && r.json.nivel === 'BAIXO', r.text)
  // seed: pagamentos atrasados + frequencia ruim para s2
  const inst = await prisma.eduInstitution.findFirst({ where: { tenantId: t1.tenantId } })
  const cr = (prisma as any).accountReceivable
  try {
    for (let i = 0; i < 3; i++) await cr.create({ data: { tenantId: t1.tenantId, studentId: s2.studentId, descricao: 'Mensalidade', valor: 500, dataVencimento: new Date(Date.now() - (60 + i * 30) * 864e5), status: 'ATRASADO', numeroParcela: i + 1 } })
  } catch (e: any) { console.log('  (seed AR falhou:', String(e.message).slice(-200), ')') }
  for (const st of studs) await (prisma as any).ntResultado.create({ data: { tenantId: t1.tenantId, classSectionId: 'cs-' + st.studentId, studentId: st.studentId, mediaFinal: st === s2 ? 3 : 8.5, frequenciaPct: st === s2 ? 55 : 95, aulasTotal: 100, faltas: st === s2 ? 45 : 5 } })
  // trancamento
  r = await call(sup, 'POST', A + `/risco/alunos/${s2.studentId}/avaliar`, {}); check('avaliar', r.status === 200, r.text)
  console.log('  risco s2:', r.json?.resultado?.nivel, r.json?.resultado?.score, r.json?.planoCriado)
  const plano0 = r.json?.plano
  r = await call(sup, 'POST', A + `/risco/alunos/${s2.studentId}/avaliar`, {}); check('avaliar 2x nao duplica plano', r.status === 200 && (await prisma.apoPlanoAcao.count({ where: { studentId: s2.studentId } })) <= 1, r.text)
  r = await call(sup, 'POST', A + '/risco/planos', { studentId: s1.studentId }); check('plano manual', r.status === 201, r.text); const pl = r.json
  r = await call(sup, 'POST', A + '/risco/planos', { studentId: s1.studentId }); check('plano dup 409', r.status === 409, r.text)
  r = await call(s1, 'POST', A + '/risco/planos', { studentId: s1.studentId }); check('aluno 403', r.status === 403)
  for (let i = 0; i < 4; i++) {
    r = await call(sup, 'POST', A + `/risco/planos/${pl.id}/contatos`, { resumo: 'Tentativa de contato ' + i, resultado: 'SEM_RESPOSTA' })
    check('contato ' + i, r.status === 201, r.text)
  }
  check('sem contato apos 4', r.json?.status === 'SEM_CONTATO', r.text)
  r = await call(sup, 'POST', A + `/risco/planos/${pl.id}/contatos`, { resumo: 'Tentativa extra', resultado: 'SEM_RESPOSTA' }); check('contato em plano SEM_CONTATO 409', r.status === 409, r.text)
  r = await call(sup, 'POST', A + `/risco/planos/${pl.id}/encerrar`, { status: 'RESOLVIDO', resultado: 'Aluno retornou' }); check('encerrar', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/risco/planos/${pl.id}/encerrar`, { status: 'RESOLVIDO', resultado: 'Aluno retornou' }); check('encerrar 2x 409', r.status === 409, r.text)
  r = await call(sup, 'POST', A + '/risco/recalcular', {}); check('recalcular', r.status === 200 && r.json.erros === 0, r.text)
  r = await call(sup, 'GET', A + '/risco/lista?nivelMinimo=BAIXO'); check('lista risco', r.status === 200, r.text)
  r = await call(sup, 'GET', A + '/risco/efetividade'); check('efetividade', r.status === 200, r.text)
  r = await call(admB, 'GET', A + '/risco/alunos/' + s1.studentId); check('risco tenant B 404', r.status === 404, r.status)

  // ---------- bolsas
  r = await call(sup, 'GET', A + '/bolsas/programas'); const progs = r.json.items ?? r.json; check('programas', Array.isArray(progs) && progs.length >= 4, r.text)
  const pm = progs.find((p: any) => p.tipo === 'SOCIOECONOMICA')
  r = await call(sup, 'PUT', A + '/bolsas/programas/' + pm.id, { vagas: 1 }); check('programa vagas=1', r.status === 200, r.text)
  const insBody = (extra = {}) => ({ programaId: pm.id, rendaFamiliar: 1500, numeroMembros: 4, condicoes: { cadUnico: true }, documentos: ['COMPROVANTE_RENDA', 'COMPROVANTE_RESIDENCIA', 'DOCUMENTO_FAMILIARES'], ...extra })
  r = await call(s1, 'POST', A + '/bolsas/inscricoes', insBody()); check('inscrever bolsa', r.status === 201, r.text); const i1 = r.json
  console.log('  inscricao s1:', r.json?.status, r.json?.elegivel, r.json?.avaliacao?.pendencias)
  r = await call(studs[2], 'POST', A + '/bolsas/inscricoes', insBody({ rendaFamiliar: 1000 })); const i2 = r.json; check('inscrever bolsa 2', r.status === 201, r.text)
  r = await call(studs[3], 'POST', A + '/bolsas/inscricoes', insBody({ rendaFamiliar: 99999 })); check('inscricao nao elegivel', r.status === 201 && r.json.status === 'INDEFERIDA', r.text)
  r = await call(s1, 'POST', A + '/bolsas/inscricoes', { programaId: pm.id }); check('inscricao validacao 400', r.status === 400, r.text)
  r = await call(s1, 'GET', A + '/bolsas/inscricoes'); check('aluno lista inscricoes 403', r.status === 403)
  r = await call(sup, 'POST', A + `/bolsas/inscricoes/${i1.id}/decidir`, { decisao: 'DEFERIDA', parecer: 'Atende aos critérios' }); check('deferir', r.status === 200 && r.json.concessao, r.text)
  // concorrência vaga=1
  const dec = await Promise.all([i2].map((i) => call(fin, 'POST', A + `/bolsas/inscricoes/${i.id}/decidir`, { decisao: 'DEFERIDA', parecer: 'Atende aos critérios' })))
  check('sem vagas 409', dec[0].status === 409, dec[0].text)
  r = await call(sup, 'POST', A + `/bolsas/inscricoes/${i1.id}/decidir`, { decisao: 'INDEFERIDA', parecer: 'Mudei de ideia' }); check('decidir deferida 409', r.status === 409, r.text)
  r = await call(sup, 'POST', A + `/bolsas/inscricoes/${i2.id}/decidir`, { decisao: 'LISTA_ESPERA', parecer: 'Sem vaga' }); check('lista espera', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/bolsas/programas/${pm.id}/classificar`, {}); check('classificar', r.status === 200, r.text)
  // vagas concorrentes: programa novo vagas=1 e 4 deferimentos simultâneos forçados sem forcar
  r = await call(sup, 'POST', A + '/bolsas/programas', { nome: 'Programa Conc ' + Math.random(), tipo: 'OUTRO', vagas: 1, percentualDesconto: 10 }); const pc = r.json; check('programa novo', r.status === 201, r.text)
  const incs: any[] = []
  for (const st of studs.slice(3, 7)) { const x = await call(st, 'POST', A + '/bolsas/inscricoes', { programaId: pc.id, rendaFamiliar: 1000, numeroMembros: 2, documentos: [] }); incs.push(x.json) }
  const concs = await Promise.all(incs.map((i) => call(sup, 'POST', A + `/bolsas/inscricoes/${i.id}/decidir`, { decisao: 'DEFERIDA', parecer: 'Atende aos critérios', forcar: false })))
  const nAtiv = await prisma.apoConcessaoBolsa.count({ where: { programaId: pc.id, status: 'ATIVA' } })
  check('vagas concorrentes: no maximo 1 concessao', nAtiv <= 1, { nAtiv, st: concs.map((c) => c.status) })
  const conc = await prisma.apoConcessaoBolsa.findFirst({ where: { studentId: s1.studentId } })!
  r = await call(s1, 'POST', A + `/bolsas/concessoes/${conc!.id}/renovar`, {}); check('renovar fora da janela 422', r.status === 422, r.text)
  await prisma.apoConcessaoBolsa.update({ where: { id: conc!.id }, data: { fim: new Date(Date.now() + 10 * 864e5) } })
  r = await call(studs[2], 'POST', A + `/bolsas/concessoes/${conc!.id}/renovar`, {}); check('renovar alheia 404', r.status === 404, r.text)
  r = await call(s1, 'POST', A + `/bolsas/concessoes/${conc!.id}/renovar`, {}); console.log('  renovar:', r.status, r.text.slice(0, 200)); check('renovar sem media 422 (ou ok)', [200, 422].includes(r.status), r.text)
  r = await call(sup, 'POST', A + `/bolsas/concessoes/${conc!.id}/renovar`, { forcar: true, justificativa: 'Situação excepcional justificada' }); check('renovar forcada apos renovar: fora da janela 422', r.status === 422, r.text)
  r = await call(sup, 'POST', A + `/bolsas/concessoes/${conc!.id}/encerrar`, { motivo: 'Abandono do curso', suspender: true }); check('suspender', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/bolsas/concessoes/${conc!.id}/reativar`, {}); check('reativar', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/bolsas/concessoes/${conc!.id}/encerrar`, { motivo: 'Abandono do curso' }); check('cancelar', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/bolsas/concessoes/${conc!.id}/encerrar`, { motivo: 'Abandono do curso' }); check('cancelar 2x 409', r.status === 409, r.text)
  r = await call(admB, 'POST', A + `/bolsas/concessoes/${conc!.id}/encerrar`, { motivo: 'Abandono do curso' }); check('concessao tenant B 404', r.status === 404, r.text)
  r = await call(sup, 'GET', A + '/bolsas/resumo'); check('resumo', r.status === 200, r.text)

  // ---------- ouvidoria
  const OP = `/public/edu/apoio/ouvidoria/${t1.tenantId}`
  const man = { tipo: 'RECLAMACAO', assunto: 'Ar condicionado quebrado', descricao: 'O ar condicionado da sala 12 está quebrado há duas semanas.', nome: 'Cidadão Teste', email: 'cid@x.com' }
  r = await call(null, 'POST', OP + '/manifestacoes', { ...man, nome: undefined, email: undefined }); check('publica identificada sem nome 422', r.status === 422, r.text)
  r = await call(null, 'POST', OP + '/manifestacoes', { ...man, assunto: 'x' }); check('publica validacao 400', r.status === 400, r.text)
  r = await call(null, 'POST', `/public/edu/apoio/ouvidoria/tenant-inexistente/manifestacoes`, man); check('publica tenant inexistente 404', r.status === 404, r.text)
  const resC = await Promise.all([1, 2, 3, 4].map((i) => call(null, 'POST', OP + '/manifestacoes', { ...man, assunto: 'Assunto concorrente ' + i })))
  check('protocolos concorrentes unicos', resC.every((x) => x.status === 201) && new Set(resC.map((x) => x.json?.protocolo)).size === 4, resC.map((x) => x.status + ' ' + (x.json?.protocolo ?? x.text.slice(0, 80))))
  r = await call(null, 'POST', OP + '/manifestacoes', { ...man, anonima: true, nome: undefined, email: undefined, tipo: 'DENUNCIA', assunto: 'Denuncia de assedio' }); check('denuncia anonima', r.status === 201, r.text); const den = r.json
  const dm = await prisma.apoManifestacao.findFirst({ where: { tenantId: t1.tenantId, protocolo: den.protocolo } }); check('anonima sem identificacao', !dm?.nome && !dm?.email && !dm?.userId && dm?.prioridade === 'ALTA', dm)
  const prot = resC[0].json
  r = await call(null, 'POST', OP + '/consulta', { protocolo: prot.protocolo, senha: 'ERRADA' }); check('senha errada 404', r.status === 404, r.text)
  r = await call(null, 'POST', OP + '/consulta', { protocolo: 'OUV-2026-000001-0', senha: 'XXXXXXXX' }); check('protocolo inexistente 404', r.status === 404, r.text)
  r = await call(null, 'POST', OP + '/consulta', { protocolo: prot.protocolo, senha: prot.senhaAcompanhamento }); check('consulta', r.status === 200 && r.json.status === 'RECEBIDA' && !JSON.stringify(r.json).includes('cid@x.com'), r.text)
  r = await call(null, 'POST', `/public/edu/apoio/ouvidoria/${t2.tenantId}/consulta`, { protocolo: prot.protocolo, senha: prot.senhaAcompanhamento }); check('consulta outro tenant 404', r.status === 404, r.text)
  // bloqueio
  const p5 = resC[1].json
  for (let i = 0; i < 5; i++) await call(null, 'POST', OP + '/consulta', { protocolo: p5.protocolo, senha: 'ERRADA1' })
  r = await call(null, 'POST', OP + '/consulta', { protocolo: p5.protocolo, senha: p5.senhaAcompanhamento }); check('bloqueio apos 5 falhas 429', r.status === 429, r.text)
  const mid = (await prisma.apoManifestacao.findFirst({ where: { tenantId: t1.tenantId, protocolo: prot.protocolo } }))!.id
  r = await call(coord, 'GET', A + '/ouvidoria/manifestacoes/' + mid); check('coord nao ve identificacao', r.status === 200 && r.json.identificacaoOculta === true && !JSON.stringify(r.json).includes('cid@x.com'), r.text)
  r = await call(sup, 'GET', A + '/ouvidoria/manifestacoes/' + mid); check('ouvidor ve identificacao', r.status === 200 && r.json.email === 'cid@x.com', r.text)
  r = await call(s1, 'GET', A + '/ouvidoria/manifestacoes'); check('aluno lista 403', r.status === 403)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${mid}/responder`, { resposta: 'Resposta antes de triar com mais de vinte chars' }); check('responder direto ok (RECEBIDA)', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${mid}/triar`, {}); check('triar respondida 409', r.status === 409, r.text)
  r = await call(null, 'POST', OP + '/avaliar', { protocolo: prot.protocolo, senha: prot.senhaAcompanhamento, nota: 6 }); check('nota invalida 400', r.status === 400, r.text)
  r = await call(null, 'POST', OP + '/avaliar', { protocolo: prot.protocolo, senha: prot.senhaAcompanhamento, nota: 2 }); check('avaliar', r.status === 200 && r.json.status === 'ENCERRADA', r.text)
  r = await call(null, 'POST', OP + '/avaliar', { protocolo: prot.protocolo, senha: prot.senhaAcompanhamento, nota: 2 }); check('avaliar 2x 409', r.status === 409, r.text)
  const notifs = await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, canal: 'EMAIL', destino: 'cid@x.com' } }); check('email ao cidadao enfileirado', notifs >= 1, notifs)
  // fluxo com encaminhamento + SLA
  const setor = await prisma.apoSetorOuvidoria.findFirst({ where: { tenantId: t1.tenantId, codigo: 'INFRA' } })
  await prisma.apoSetorOuvidoria.update({ where: { id: setor!.id }, data: { responsavelUserId: tch.id } })
  const m2 = resC[2].json; const m2id = (await prisma.apoManifestacao.findFirst({ where: { tenantId: t1.tenantId, protocolo: m2.protocolo } }))!.id
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/triar`, { prioridade: 'ALTA' }); check('triar', r.status === 200 && r.json.status === 'EM_ANALISE', r.text)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/encaminhar`, { setorId: setor!.id, solicitacao: 'Verificar o ar condicionado da sala 12' }); check('encaminhar', r.status === 201, r.text); const enc = r.json
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/responder`, { resposta: 'Resposta final com mais de vinte caracteres' }); check('responder com enc pendente 422', r.status === 422, r.text)
  r = await call(coord, 'POST', A + `/ouvidoria/encaminhamentos/${enc.id}/responder`, { resposta: 'Setor respondeu em tempo hábil' }); check('coord nao responde pelo setor 403', r.status === 403, r.text)
  r = await call(tch, 'POST', A + `/ouvidoria/encaminhamentos/${enc.id}/responder`, { resposta: 'Setor respondeu em tempo hábil' }); check('setor responde', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/prorrogar`, { justificativa: 'Complexidade do caso exige mais prazo' }); check('prorrogar', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/prorrogar`, { justificativa: 'Complexidade do caso exige mais prazo' }); check('prorrogar 2x 409', r.status === 409, r.text)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/responder`, { resposta: 'Resposta final com mais de vinte caracteres' }); check('responder final', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${m2id}/reabrir`, { motivo: 'Cidadão pediu revisão' }); check('reabrir', r.status === 200, r.text)
  // SLA vencido -> job
  await prisma.apoManifestacao.update({ where: { id: m2id }, data: { prazoEm: new Date(Date.now() - 5 * 864e5) } })
  const e2 = await prisma.apoEncaminhamento.create({ data: { tenantId: t1.tenantId, manifestacaoId: m2id, setorId: setor!.id, solicitacao: 'x'.repeat(12), prazoEm: new Date(Date.now() - 20 * 864e5), createdAt: new Date(Date.now() - 30 * 864e5) } })
  r = await call(sup, 'GET', A + '/ouvidoria/manifestacoes?vencidas=true'); check('lista vencidas', r.status === 200 && r.json.items.some((x: any) => x.id === m2id), r.text)
  r = await call(sup, 'GET', A + '/ouvidoria/relatorio'); check('relatorio', r.status === 200, r.text)
  r = await call(sup, 'GET', A + '/ouvidoria/relatorio-anual'); check('relatorio anual html', r.status === 200 && r.text.includes('<html'), r.status)
  r = await call(sup, 'POST', A + `/ouvidoria/manifestacoes/${(await prisma.apoManifestacao.findFirst({ where: { tenantId: t1.tenantId, protocolo: den.protocolo } }))!.id}/arquivar`, { motivo: 'Sem elementos suficientes para apuração' }); check('arquivar', r.status === 200, r.text)
  // interno
  r = await call(s1, 'POST', A + '/ouvidoria/manifestacoes', { ...man, nome: undefined, email: undefined }); check('manifestacao interna aluno', r.status === 201, r.text); const mi = r.json
  r = await call(s1, 'GET', A + '/ouvidoria/minhas'); check('minhas', r.status === 200 && r.json.length === 1, r.text)
  r = await call(s2, 'GET', A + '/ouvidoria/minhas'); check('minhas aluno2 vazio', r.status === 200 && r.json.length === 0, r.text)
  r = await call(s2, 'POST', A + `/ouvidoria/manifestacoes/${mi.id}/avaliar`, { nota: 5 }); check('avaliar alheia 404', r.status === 404, r.text)

  // ---------- egressos
  r = await call(sup, 'POST', A + '/egressos', { nome: 'Egresso Um', email: 'eg1@x.com', anoConclusao: 2020, situacaoProfissional: 'EMPREGADO', atuaNaArea: true }); check('egresso', r.status === 201, r.text); const eg1 = r.json
  r = await call(sup, 'POST', A + '/egressos', { nome: 'Egresso Dois', email: 'eg1@x.com' }); check('egresso email dup 409', r.status === 409, r.text)
  r = await call(sup, 'POST', A + '/egressos', { nome: 'Egresso Dois', email: 'eg2@x.com', anoConclusao: 2021 }); const eg2 = r.json
  r = await call(sup, 'POST', A + '/egressos', { nome: 'Egresso Tres', telefone: '1199999', consenteContato: false }); const eg3 = r.json
  r = await call(sup, 'POST', A + '/egressos/importar-concluintes', {}); check('importar concluintes', r.status === 200, r.text)
  r = await call(sup, 'GET', A + '/egressos/recall'); check('recall respeita consentimento', r.status === 200 && !r.json.items.some((x: any) => x.id === eg3.id), r.text)
  r = await call(sup, 'GET', A + '/egressos/indicadores'); check('indicadores egressos', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/egressos/${eg1.id}/trajetoria`, { tipo: 'EMPREGO', organizacao: 'Empresa X', inicio: d(-300), fim: d(-400) }); check('trajetoria fim<inicio 400', r.status === 400, r.text)
  r = await call(sup, 'POST', A + `/egressos/${eg1.id}/trajetoria`, { tipo: 'EMPREGO', organizacao: 'Empresa X', inicio: d(-300) }); check('trajetoria', r.status === 201, r.text)
  r = await call(coord, 'POST', A + `/egressos/${eg1.id}/anonimizar`, {}); check('anonimizar so SUPPORT 403', r.status === 403, r.text)
  // pesquisa de egressos (convite público)
  const instEg = await prisma.apoInstrumento.findFirst({ where: { tenantId: t1.tenantId, finalidade: 'EGRESSOS' } })
  r = await call(sup, 'POST', A + '/pesquisas/aplicacoes', { instrumentoId: instEg!.id, titulo: 'Pesquisa egressos 2026', alvoTipo: 'EGRESSOS', abertura: d(-1), fechamento: d(20) }); check('aplicacao egressos', r.status === 201, r.text); const ae = r.json
  r = await call(sup, 'POST', A + `/pesquisas/aplicacoes/${ae.id}/abrir`, {}); check('abrir egressos', r.status === 200, r.text)
  const conv = await prisma.eduNotification.findFirst({ where: { tenantId: t1.tenantId, templateKey: 'apoio.pesquisa.egresso', destino: 'eg1@x.com' } })
  const url = conv?.mensagem.match(/(\/api\/public[^\s]+)/)?.[1]
  console.log('  convite url:', url)
  const gp = url ? url.replace('/api', '') : ''
  r = await call(null, 'GET', gp); check('link do convite funciona (GET)', r.status === 200, r.text)
  const code = conviteEgressoCodigo(t1.tenantId, ae.id, eg1.id)
  r = await call(null, 'GET', `/public/edu/apoio/pesquisa-egresso/${t1.tenantId}/${ae.id}?egressoId=${eg1.id}&codigo=ruim`); check('codigo invalido 403', r.status === 403, r.text)
  const resp = { egressoId: eg1.id, codigo: code, respostas: { situacao: 'Empregado(a)', atuaArea: true, formacao: 5, infra: 4, nps: 9, comentario: 'ok' } }
  r = await call(null, 'POST', `/public/edu/apoio/pesquisa-egresso/${t1.tenantId}/${ae.id}`, { ...resp, codigo: 'x' }); check('POST codigo invalido 403', r.status === 403, r.text)
  r = await call(null, 'POST', `/public/edu/apoio/pesquisa-egresso/${t1.tenantId}/${ae.id}`, { ...resp, respostas: { formacao: 99 } }); check('resposta invalida 422', r.status === 422, r.text)
  r = await call(null, 'POST', `/public/edu/apoio/pesquisa-egresso/${t1.tenantId}/${ae.id}`, resp); check('responder egresso', r.status === 201, r.text)
  r = await call(null, 'POST', `/public/edu/apoio/pesquisa-egresso/${t1.tenantId}/${ae.id}`, resp); check('responder 2x 409', r.status === 409, r.text)
  r = await call(null, 'POST', `/public/edu/apoio/pesquisa-egresso/${t2.tenantId}/${ae.id}`, resp); check('outro tenant 404', r.status === 404 || r.status === 403, r.text)
  const eg2code = conviteEgressoCodigo(t1.tenantId, ae.id, eg3.id)
  r = await call(null, 'POST', `/public/edu/apoio/pesquisa-egresso/${t1.tenantId}/${ae.id}`, { egressoId: eg3.id, codigo: eg2code, respostas: {} }); check('sem consentimento nao convidado 403', r.status === 403, r.text)

  // ---------- avaliação docente anônima
  const instDoc = await prisma.apoInstrumento.findFirst({ where: { tenantId: t1.tenantId, finalidade: 'AVALIACAO_DOCENTE' } })
  r = await call(sup, 'POST', A + '/pesquisas/aplicacoes', { instrumentoId: instDoc!.id, titulo: 'Avaliação sem professor', alvoTipo: 'DOCENTE', abertura: d(-1), fechamento: d(10) }); check('aval docente sem prof 422', r.status === 422, r.text)
  r = await call(sup, 'POST', A + '/pesquisas/aplicacoes', { instrumentoId: instDoc!.id, titulo: 'Avaliação Prof Teste', alvoTipo: 'DOCENTE', professorUserId: tch.id, abertura: d(-1), fechamento: d(10) }); check('aplicacao docente', r.status === 201, r.text); const ad = r.json
  r = await call(studs[0], 'POST', A + `/pesquisas/aplicacoes/${ad.id}/responder`, { respostas: {} }); check('responder antes de abrir 422', r.status === 422, r.text)
  r = await call(sup, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/abrir`, {}); check('abrir docente', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/abrir`, {}); check('abrir 2x 409', r.status === 409, r.text)
  const rsp = (n: number) => ({ respostas: { dominio: n, didatica: n, clareza: n, pontualidade: n, respeito: n, feedback: n, nps: 9, comentario: 'Bom professor ' + n } })
  r = await call(studs[0], 'GET', A + '/pesquisas/pendentes'); check('pendentes', r.status === 200 && r.json.length >= 1, r.text)
  r = await call(studs[0], 'POST', A + `/pesquisas/aplicacoes/${ad.id}/responder`, { respostas: { dominio: 9 } }); check('resposta invalida 422', r.status === 422, r.text)
  for (let i = 0; i < 4; i++) { r = await call(studs[i], 'POST', A + `/pesquisas/aplicacoes/${ad.id}/responder`, rsp(3 + (i % 3))); check('responder ' + i, r.status === 201, r.text) }
  r = await call(studs[0], 'POST', A + `/pesquisas/aplicacoes/${ad.id}/responder`, rsp(4)); check('responder 2x 409', r.status === 409, r.text)
  r = await call(stuB, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/responder`, rsp(4)); check('aluno outro tenant 404', r.status === 404, r.text)
  r = await call(sup, 'GET', A + `/pesquisas/aplicacoes/${ad.id}/resultados`); check('resultados suprimidos (<5)', r.status === 200 && r.json.suprimido === true && !JSON.stringify(r.json).includes('Bom professor'), r.text)
  r = await call(sup, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/encerrar`, {}); check('encerrar', r.status === 200, r.text)
  r = await call(sup, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/publicar`, {}); check('publicar sem minimo 422', r.status === 422, r.text)
  // anonimato: nada liga resposta ao aluno
  const respRows = await prisma.apoResposta.findMany({ where: { aplicacaoId: ad.id } }); check('respostas sem respondenteId', respRows.every((x) => x.respondenteId === null), respRows.map((x) => x.respondenteId))
  const dia = respRows.every((x) => x.createdAt.getHours() === 0 && x.createdAt.getMinutes() === 0); check('horario truncado ao dia', dia)
  await prisma.apoAplicacao.update({ where: { id: ad.id }, data: { status: 'ABERTA' } })
  r = await call(studs[4], 'POST', A + `/pesquisas/aplicacoes/${ad.id}/responder`, rsp(5)); check('5a resposta', r.status === 201, r.text)
  r = await call(sup, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/encerrar`, {})
  r = await call(tch, 'GET', A + `/pesquisas/aplicacoes/${ad.id}/resultados`); check('prof nao ve antes de publicar 403', r.status === 403, r.text)
  r = await call(coord, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/publicar`, {}); check('publicar', r.status === 200, r.text)
  r = await call(tch, 'GET', A + `/pesquisas/aplicacoes/${ad.id}/resultados`); check('prof ve apos publicar', r.status === 200 && r.json.suprimido !== true, r.text)
  check('resultado do professor sem identificar alunos', !JSON.stringify(r.json).includes(s1.studentId))
  r = await call(coord, 'POST', A + `/pesquisas/aplicacoes/${ad.id}/devolutiva`, { mensagem: 'Parabéns pelo desempenho, continue assim.' }); check('devolutiva', r.status === 201, r.text)
  r = await call(tch, 'GET', A + '/pesquisas/minhas-devolutivas'); check('prof ve devolutivas', r.status === 200 && r.json.length === 1, r.text)
  r = await call(sup, 'GET', A + '/pesquisas/painel-docente'); check('painel docente', r.status === 200, r.text)
  r = await call(sup, 'GET', A + '/pesquisas/nps'); check('nps', r.status === 200, r.text)
  r = await call(sup, 'GET', A + `/pesquisas/aplicacoes/${ad.id}/adesao`); check('adesao', r.status === 200, r.text)
  r = await call(sup, 'PUT', A + `/pesquisas/instrumentos/${instDoc!.id}`, { perguntas: [{ id: 'x', texto: 'abc', tipo: 'TEXTO' }] }); check('alterar instrumento aplicado 409', r.status === 409, r.text)
  // jobs
  const j = await runEduJobs(); check('jobs ok', Object.values(j).every((x: any) => x.ok), Object.entries(j).filter(([, v]: any) => !v.ok))
  const jo: any = (j as any)['apoio:ouvidoria-sla']; console.log('  job ouvidoria:', JSON.stringify(jo?.result))
  const j2 = await runEduJobs(); check('jobs 2x ok', Object.values(j2).every((x: any) => x.ok))
  const dd = await prisma.eduReminder.groupBy({ by: ['dedupeKey'], where: { tenantId: t1.tenantId, dedupeKey: { not: null } }, _count: true, having: { dedupeKey: { _count: { gt: 1 } } } }); check('sem lembrete duplicado', dd.length === 0)
  await close(); summary()
}
main().catch((e) => { console.error(e); process.exit(2) })
