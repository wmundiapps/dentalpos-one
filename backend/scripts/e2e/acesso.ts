// Testes do ACESSO POR CARGO (matriz cargo x módulo): bloqueio, permissão, padrão, cargos SUPER imunes, isolamento entre tenants,
// auditoria, cache (30 s) e invalidação ao salvar, validações e a semente de demonstração.
// Uso:  DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/acesso_e2e npx tsx scripts/e2e/acesso.ts
// Requer Postgres próprio com o schema aplicado (prisma db push). Sem internet.
import { setup, check, summary, prisma, fails, Actor } from './qa5-lib'
import { invalidarCacheAcesso, consultasDeRegras, MENSAGEM_BLOQUEIO } from '../../src/modules/acesso/regras'
import { CARGOS, MODULOS, CARGOS_SUPER } from '../../src/modules/acesso/catalogo'
import { seedAcesso } from '../seeds/acesso'

const secao = (t: string) => console.log(`\n== ${t}`)
const SEM_PERM = 'Sem permissão para esta ação.'

async function main() {
  const { call, t1, t2, close } = await setup()
  const A = t1.tenantId
  const adm = await t1.mk('ADMIN'), own = await t1.mk('OWNER'), rec = await t1.mk('RECTOR'), brd = await t1.mk('BOARD')
  const coo = await t1.mk('COORDINATOR'), sec = await t1.mk('SECRETARY'), fin = await t1.mk('FINANCE'), tea = await t1.mk('TEACHER')
  const stu = await t1.mk('STUDENT', true), mkt = await t1.mk('MARKETING'), stf = await t1.mk('STAFF'), sup = await t1.mk('SUPPLIES')
  const admB = await t2.mk('ADMIN'), secB = await t2.mk('SECRETARY'), finB = await t2.mk('FINANCE')
  const put = (a: Actor, alteracoes: any) => call(a, 'PUT', '/edu/acesso/regras', alteracoes)
  const set = (a: Actor, cargo: string, modulo: string, estado: string) => put(a, { cargo, modulo, estado })
  const PAY = '/edu/financeiro/payables'

  // ------------------------------------------------------------------ catálogo
  secao('Catálogo')
  const cat = await call(adm, 'GET', '/edu/acesso/catalogo')
  check('catálogo: 200 para ADMIN', cat.status === 200, cat.json)
  check('catálogo: 16 cargos e mesmo conjunto do tipo AcademicRole', cat.json?.cargos?.length === 16 && cat.json.cargos.length === CARGOS.length)
  check('catálogo: cargos SUPER marcados', ['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].every((c) => cat.json.cargos.find((x: any) => x.cargo === c)?.super === true))
  check('catálogo: COORDINATOR não é super', cat.json.cargos.find((x: any) => x.cargo === 'COORDINATOR')?.super === false)
  check('catálogo: módulos incluem financeiro, juridico e rh', ['financeiro', 'juridico', 'rh'].every((m) => cat.json.modulos.some((x: any) => x.modulo === m)))
  check('catálogo: core e acesso são essenciais', cat.json.modulos.filter((m: any) => m.essencial).map((m: any) => m.modulo).sort().join() === 'acesso,core')
  check('catálogo: sem módulos repetidos', new Set(MODULOS.map((m) => m.modulo)).size === MODULOS.length)
  check('catálogo: estados PADRAO/PERMITIR/BLOQUEAR', cat.json.estados.join() === 'PADRAO,PERMITIR,BLOQUEAR')
  check('catálogo: RECTOR lê', (await call(rec, 'GET', '/edu/acesso/catalogo')).status === 200)
  check('catálogo: SECRETARY não lê (403)', (await call(sec, 'GET', '/edu/acesso/catalogo')).status === 403)
  check('catálogo: sem login (401)', (await call(null, 'GET', '/edu/acesso/catalogo')).status === 401)

  // ------------------------------------------------------------------ comportamento padrão
  secao('Padrão (nada configurado)')
  const m0 = await call(adm, 'GET', '/edu/acesso/matriz')
  check('matriz vazia: 200, sem regras, podeEditar', m0.status === 200 && m0.json.regras.length === 0 && m0.json.podeEditar === true, m0.json)
  check('padrão: FINANCE lê contas a pagar (200)', (await call(fin, 'GET', PAY)).status === 200)
  const sPad = await call(sec, 'GET', PAY)
  check('padrão: SECRETARY 403 pela regra da própria tela', sPad.status === 403 && sPad.json?.error === SEM_PERM && !sPad.json?.codigo, sPad.json)
  check('padrão: TEACHER 403 pela regra da própria tela', (await call(tea, 'GET', PAY)).json?.error === SEM_PERM)
  check('padrão: ADMIN 200', (await call(adm, 'GET', PAY)).status === 200)
  check('padrão: BOARD 200', (await call(brd, 'GET', PAY)).status === 200)
  const mm0 = await call(sec, 'GET', '/edu/acesso/meus-modulos')
  check('meus-modulos padrão: nada bloqueado nem permitido', mm0.status === 200 && mm0.json.bloqueados.length === 0 && mm0.json.permitidos.length === 0 && mm0.json.cargo === 'SECRETARY', mm0.json)
  check('meus-modulos: ADMIN marcado como super', (await call(adm, 'GET', '/edu/acesso/meus-modulos')).json?.super === true)

  // ------------------------------------------------------------------ permissões de edição
  secao('Quem edita a matriz')
  for (const [nome, a] of [['COORDINATOR', coo], ['RECTOR', rec], ['BOARD', brd], ['FINANCE', fin], ['SECRETARY', sec], ['TEACHER', tea], ['STUDENT', stu]] as Array<[string, Actor]>) {
    const r = await set(a, 'SECRETARY', 'financeiro', 'BLOQUEAR')
    check(`edição: ${nome} recebe 403`, r.status === 403 && /administrador ou proprietário/.test(r.json?.error || ''), r.json)
  }
  check('edição negada não grava nada', (await call(adm, 'GET', '/edu/acesso/matriz')).json.regras.length === 0)
  check('restaurar-padrão: COORDINATOR 403', (await call(coo, 'POST', '/edu/acesso/restaurar-padrao', {})).status === 403)
  check('restaurar-padrão: RECTOR 403', (await call(rec, 'POST', '/edu/acesso/restaurar-padrao', {})).status === 403)
  check('matriz: SECRETARY não lê (403)', (await call(sec, 'GET', '/edu/acesso/matriz')).status === 403)
  check('matriz: RECTOR lê, mas podeEditar=false', (await call(rec, 'GET', '/edu/acesso/matriz')).json?.podeEditar === false)
  check('histórico: SECRETARY 403', (await call(sec, 'GET', '/edu/acesso/historico')).status === 403)

  // ------------------------------------------------------------------ validações
  secao('Validações')
  const v = async (corpo: any, trecho: RegExp, nome: string) => { const r = await put(adm, corpo); check(`validação: ${nome}`, r.status === 400 && trecho.test(r.json?.error || ''), r.json) }
  await v({}, /Informe cargo/, 'corpo vazio')
  await v({ cargo: 'XPTO', modulo: 'financeiro', estado: 'BLOQUEAR' }, /Cargo inválido/, 'cargo inexistente')
  await v({ cargo: 'SECRETARY', modulo: 'naoexiste', estado: 'BLOQUEAR' }, /Módulo inválido/, 'módulo inexistente')
  await v({ cargo: 'SECRETARY', modulo: 'financeiro', estado: 'TALVEZ' }, /Estado inválido/, 'estado inexistente')
  await v({ cargo: 'SECRETARY', modulo: 'financeiro' }, /Estado inválido/, 'estado ausente')
  await v({ cargo: 'SECRETARY', modulo: 'core', estado: 'BLOQUEAR' }, /essencial/, 'módulo core essencial')
  await v({ cargo: 'SECRETARY', modulo: 'acesso', estado: 'BLOQUEAR' }, /essencial/, 'módulo acesso essencial')
  await v({ cargo: 'SECRETARY', modulo: 'acesso', estado: 'PERMITIR' }, /essencial/, 'permitir em módulo essencial')
  await v({ alteracoes: [{ cargo: 'SECRETARY', modulo: 'financeiro', estado: 'BLOQUEAR' }, { cargo: 'ZZZ', modulo: 'rh', estado: 'BLOQUEAR' }] }, /item 2/, 'lote com item inválido cita a posição')
  check('validação: lote inválido não grava o item válido', (await call(adm, 'GET', '/edu/acesso/matriz')).json.regras.length === 0)
  const grande = await put(adm, { alteracoes: Array.from({ length: 601 }, () => ({ cargo: 'SECRETARY', modulo: 'rh', estado: 'BLOQUEAR' })) })
  check('validação: mais de 600 alterações é recusado', grande.status === 400)
  check('validação: minúsculas são aceitas e normalizadas', (await set(adm, 'secretary', 'RH', 'bloquear')).status === 200)
  check('regra gravada normalizada', (await call(adm, 'GET', '/edu/acesso/matriz')).json.regras.some((r: any) => r.cargo === 'SECRETARY' && r.modulo === 'rh' && r.estado === 'BLOQUEAR'))
  await set(adm, 'SECRETARY', 'rh', 'PADRAO')

  // ------------------------------------------------------------------ SUPER imunes
  secao('Cargos SUPER nunca são bloqueados')
  for (const c of CARGOS_SUPER) {
    const r = await set(adm, c, 'financeiro', 'BLOQUEAR')
    check(`SUPER: bloquear ${c} é recusado (400)`, r.status === 400 && /acesso total/.test(r.json?.error || ''), r.json)
  }
  check('SUPER: conceder PERMITIR a ADMIN também recusado', (await set(adm, 'ADMIN', 'financeiro', 'PERMITIR')).status === 400)
  check('SUPER: PADRAO em cargo super é aceito (sem efeito)', (await set(adm, 'ADMIN', 'financeiro', 'PADRAO')).status === 200)
  // Mesmo que alguém grave a regra direto no banco, o middleware ignora para cargos SUPER.
  for (const c of CARGOS_SUPER) await prisma.acsRegra.create({ data: { tenantId: A, cargo: c, modulo: 'financeiro', estado: 'BLOQUEAR' } })
  invalidarCacheAcesso(A)
  for (const [nome, a] of [['ADMIN', adm], ['OWNER', own], ['RECTOR', rec], ['BOARD', brd]] as Array<[string, Actor]>) {
    const r = await call(a, 'GET', PAY)
    check(`SUPER imune: ${nome} com regra BLOQUEAR forjada no banco ainda acessa (200)`, r.status === 200, r.json)
  }
  check('SUPER imune: meus-modulos do RECTOR sem bloqueios', (await call(rec, 'GET', '/edu/acesso/meus-modulos')).json.bloqueados.length === 0)
  await prisma.acsRegra.deleteMany({ where: { tenantId: A } })
  invalidarCacheAcesso(A)

  // ------------------------------------------------------------------ BLOQUEAR
  secao('Bloqueio')
  const b = await set(adm, 'FINANCE', 'financeiro', 'BLOQUEAR')
  check('bloquear FINANCE em financeiro: 200 e 1 alteração', b.status === 200 && b.json.alteradas === 1, b.json)
  const bl = await call(fin, 'GET', PAY)
  check('bloqueio: FINANCE agora recebe 403', bl.status === 403, bl.json)
  check('bloqueio: mensagem clara em português', bl.json?.error === MENSAGEM_BLOQUEIO && /Configurações > Acesso por cargo/.test(bl.json.error), bl.json)
  check('bloqueio: código e módulo no corpo', bl.json?.codigo === 'ACESSO_CARGO_BLOQUEADO' && bl.json?.modulo === 'financeiro', bl.json)
  check('bloqueio vale para POST também', (await call(fin, 'POST', PAY, { descricao: 'x' })).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('bloqueio vale para sub-rotas do módulo', (await call(fin, 'GET', '/edu/financeiro/receivables')).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('bloqueio vale para rota inexistente do módulo (bloqueia antes)', (await call(fin, 'GET', '/edu/financeiro/nao-existe')).status === 403)
  check('bloqueio não afeta outro módulo do mesmo cargo (suprimentos continua pela regra própria)', (await call(fin, 'GET', '/edu/suprimentos/dashboard')).status === 200)
  check('bloqueio não afeta outro cargo (BOARD continua)', (await call(brd, 'GET', PAY)).status === 200)
  check('bloqueio não afeta ADMIN', (await call(adm, 'GET', PAY)).status === 200)
  const mmF = await call(fin, 'GET', '/edu/acesso/meus-modulos')
  check('meus-modulos: financeiro aparece como bloqueado para FINANCE', mmF.json.bloqueados.includes('financeiro') && !mmF.json.permitidos.length, mmF.json)
  check('meus-modulos: SECRETARY não é afetada', (await call(sec, 'GET', '/edu/acesso/meus-modulos')).json.bloqueados.length === 0)
  check('FINANCE bloqueada ainda abre o próprio acesso/meus-modulos (essencial)', mmF.status === 200)
  check('FINANCE bloqueada ainda acessa o core (essencial)', (await call(fin, 'GET', '/edu/core/branding')).status !== 403)
  const b2 = await set(adm, 'FINANCE', 'financeiro', 'BLOQUEAR')
  check('repetir o mesmo estado não altera (idempotente)', b2.json?.alteradas === 0 && b2.json?.semMudanca === 1, b2.json)
  // bloqueio em módulo "só de leitura aberta"
  await set(adm, 'TEACHER', 'biblioteca', 'BLOQUEAR')
  check('bloqueio sem requireRole: TEACHER 403 em biblioteca', (await call(tea, 'GET', '/edu/biblioteca/acervo/busca?q=a')).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('bloqueio: COORDINATOR segue em biblioteca (não é 403 de acesso)', (await call(coo, 'GET', '/edu/biblioteca/acervo/busca?q=a')).json?.codigo !== 'ACESSO_CARGO_BLOQUEADO')
  await set(adm, 'STUDENT', 'apoio', 'BLOQUEAR')
  const stuBloq = await call(stu, 'GET', '/edu/apoio/egressos/meu-perfil')
  check('bloqueio: STUDENT sem acesso ao módulo apoio', stuBloq.json?.codigo === 'ACESSO_CARGO_BLOQUEADO', stuBloq.json)
  await set(adm, 'STUDENT', 'apoio', 'PADRAO')

  // ------------------------------------------------------------------ PERMITIR
  secao('Permissão (concessão)')
  check('antes: SECRETARY 403 em contas a pagar', (await call(sec, 'GET', PAY)).json?.error === SEM_PERM)
  const p = await set(adm, 'SECRETARY', 'financeiro', 'PERMITIR')
  check('permitir SECRETARY em financeiro: 200', p.status === 200 && p.json.alteradas === 1)
  const pr = await call(sec, 'GET', PAY)
  check('permissão: SECRETARY agora lê contas a pagar (200)', pr.status === 200, pr.json)
  check('permissão: vale em outra rota do módulo (receivables)', (await call(sec, 'GET', '/edu/financeiro/receivables')).status === 200)
  check('permissão: não vaza para outro módulo (tesouraria segue pela regra própria)', (await call(sec, 'GET', '/edu/tesouraria/extratos')).json?.error === SEM_PERM)
  check('permissão: não vaza para outro cargo (TEACHER segue 403)', (await call(tea, 'GET', PAY)).json?.error === SEM_PERM)
  check('permissão: meus-modulos lista financeiro em permitidos', (await call(sec, 'GET', '/edu/acesso/meus-modulos')).json.permitidos.includes('financeiro'))
  await set(adm, 'STAFF', 'suprimentos', 'PERMITIR')
  check('permissão: STAFF passa a abrir o dashboard de suprimentos', (await call(stf, 'GET', '/edu/suprimentos/dashboard')).status === 200)
  await set(adm, 'STAFF', 'suprimentos', 'PADRAO')
  check('voltar a PADRAO remove a permissão (STAFF 403)', (await call(stf, 'GET', '/edu/suprimentos/dashboard')).status === 403)
  // PERMITIR não afrouxa rotas de dono do dado nem as exclusivas da administração
  await set(adm, 'COORDINATOR', 'apoio', 'PERMITIR')
  const rDono = await call(coo, 'GET', '/edu/apoio/pesquisas/minhas-devolutivas')
  check('PERMITIR não abre rota só de TEACHER (dono do dado)', rDono.status === 403 && rDono.json?.error === SEM_PERM, rDono.json)
  await set(adm, 'SECRETARY', 'apoio', 'PERMITIR')
  const rAl = await call(sec, 'GET', '/edu/apoio/egressos/meu-perfil')
  check('PERMITIR não abre rota só de STUDENT (dono do dado)', rAl.status === 403 && rAl.json?.error === SEM_PERM, rAl.json)
  await set(adm, 'FINANCE', 'boletos', 'PERMITIR')
  const rAdm = await call(fin, 'GET', '/edu/boletos/boletos-eventos/auditoria')
  check('PERMITIR não abre rota exclusiva da administração', rAdm.status === 403 && rAdm.json?.error === SEM_PERM, rAdm.json)
  check('PERMITIR em boletos abre rota de gestão do módulo', (await call(sec, 'GET', '/edu/boletos/boletos')).json?.error === SEM_PERM)
  await set(adm, 'SECRETARY', 'boletos', 'PERMITIR')
  check('…e SECRETARY com permissão lê a caixa de boletos', (await call(sec, 'GET', '/edu/boletos/boletos')).status === 200)
  // PERMITIR + BLOQUEAR no mesmo cargo/módulo: a última regra vence (uma linha só)
  await set(adm, 'SECRETARY', 'boletos', 'BLOQUEAR')
  check('trocar PERMITIR por BLOQUEAR: passa a 403 de acesso', (await call(sec, 'GET', '/edu/boletos/boletos')).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('só existe uma linha por cargo+módulo', (await prisma.acsRegra.count({ where: { tenantId: A, cargo: 'SECRETARY', modulo: 'boletos' } })) === 1)

  // ------------------------------------------------------------------ lote
  secao('Lote de alterações')
  const lote = await put(adm, { alteracoes: [{ cargo: 'MARKETING', modulo: 'financeiro', estado: 'BLOQUEAR' }, { cargo: 'MARKETING', modulo: 'tesouraria', estado: 'BLOQUEAR' }, { cargo: 'MARKETING', modulo: 'juridico', estado: 'BLOQUEAR' }, { cargo: 'MARKETING', modulo: 'juridico', estado: 'PERMITIR' }] })
  check('lote: 3 alterações efetivas (duplicado no lote, o último vence)', lote.status === 200 && lote.json.alteradas === 3, lote.json)
  const mmM = await call(mkt, 'GET', '/edu/acesso/meus-modulos')
  check('lote: MARKETING tem 2 bloqueios e 1 permissão', mmM.json.bloqueados.length === 2 && mmM.json.permitidos.join() === 'juridico', mmM.json)
  check('lote: bloqueio vale de imediato (cache invalidado ao salvar)', (await call(mkt, 'GET', PAY)).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('lote: OWNER também edita', (await set(own, 'MARKETING', 'rh', 'BLOQUEAR')).status === 200)

  // ------------------------------------------------------------------ prévia
  secao('Pré-visualização (o que este cargo vê)')
  const pv = await call(adm, 'GET', '/edu/acesso/previa/MARKETING')
  check('prévia: 200 com todos os módulos', pv.status === 200 && pv.json.modulos.length === MODULOS.length, pv.json?.error)
  check('prévia: financeiro BLOQUEADO para MARKETING', pv.json.modulos.find((m: any) => m.modulo === 'financeiro')?.efetivo === 'BLOQUEADO')
  check('prévia: juridico LIBERADO_POR_REGRA', pv.json.modulos.find((m: any) => m.modulo === 'juridico')?.efetivo === 'LIBERADO_POR_REGRA')
  check('prévia: sem regra = PADRAO', pv.json.modulos.find((m: any) => m.modulo === 'biblioteca')?.efetivo === 'PADRAO')
  check('prévia: core sempre LIBERADO', pv.json.modulos.find((m: any) => m.modulo === 'core')?.efetivo === 'LIBERADO')
  check('prévia: resumo coerente', pv.json.resumo.bloqueados === 3 && pv.json.resumo.liberadosPorRegra === 1, pv.json.resumo)
  const pvAdm = await call(adm, 'GET', '/edu/acesso/previa/ADMIN')
  check('prévia: ADMIN vê tudo liberado', pvAdm.json.super === true && pvAdm.json.modulos.every((m: any) => m.efetivo === 'LIBERADO'))
  check('prévia: cargo inexistente 404', (await call(adm, 'GET', '/edu/acesso/previa/NADA')).status === 404)
  check('prévia: SECRETARY 403', (await call(sec, 'GET', '/edu/acesso/previa/MARKETING')).status === 403)

  // ------------------------------------------------------------------ cache
  secao('Cache de 30 s e invalidação')
  await call(coo, 'GET', '/edu/academico/programs')
  const antes = consultasDeRegras()
  for (let i = 0; i < 5; i++) await call(coo, 'GET', '/edu/academico/programs')
  check('cache: 5 requisições seguidas não voltam ao banco', consultasDeRegras() === antes, { antes, depois: consultasDeRegras() })
  await prisma.acsRegra.create({ data: { tenantId: A, cargo: 'COORDINATOR', modulo: 'academico', estado: 'BLOQUEAR' } })
  check('cache: alteração direta no banco ainda não vale (cache vivo)', (await call(coo, 'GET', '/edu/academico/programs')).status !== 403)
  invalidarCacheAcesso(A)
  check('cache: depois de invalidar, o bloqueio vale', (await call(coo, 'GET', '/edu/academico/programs')).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  await prisma.acsRegra.delete({ where: { tenantId_cargo_modulo: { tenantId: A, cargo: 'COORDINATOR', modulo: 'academico' } } })
  check('cache: remoção direta ainda não vale (cache vivo)', (await call(coo, 'GET', '/edu/academico/programs')).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  const rp = await call(adm, 'POST', '/edu/acesso/restaurar-padrao', { cargo: 'MARKETING' })
  check('salvar pela API invalida o cache do tenant (COORDINATOR volta sem esperar 30 s)', (await call(coo, 'GET', '/edu/academico/programs')).json?.codigo !== 'ACESSO_CARGO_BLOQUEADO' && rp.status === 200)
  await call(coo, 'GET', '/edu/academico/programs')
  const n0 = consultasDeRegras()
  await call(coo, 'GET', '/edu/academico/programs')
  check('cache: após recarregar, volta a servir da memória', consultasDeRegras() === n0)

  // ------------------------------------------------------------------ restaurar
  secao('Restaurar padrão')
  check('restaurar cargo inválido 400', (await call(adm, 'POST', '/edu/acesso/restaurar-padrao', { cargo: 'XX' })).status === 400)
  check('restaurar MARKETING: removeu as regras do cargo', rp.json.restauradas === 4, rp.json)
  check('MARKETING volta a acessar o financeiro pela regra própria (sem código de bloqueio)', (await call(mkt, 'GET', PAY)).json?.codigo !== 'ACESSO_CARGO_BLOQUEADO')
  check('restaurar cargo não mexe nos outros (FINANCE segue bloqueada em financeiro)', (await call(fin, 'GET', PAY)).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  const rt = await call(adm, 'POST', '/edu/acesso/restaurar-padrao', {})
  check('restaurar tudo: 200', rt.status === 200 && rt.json.restauradas >= 4, rt.json)
  check('restaurar tudo: matriz sem bloqueios/permissões', (await call(adm, 'GET', '/edu/acesso/matriz')).json.totais.bloqueios === 0)
  check('restaurar tudo: FINANCE volta a acessar', (await call(fin, 'GET', PAY)).status === 200)
  check('restaurar tudo: SECRETARY volta ao 403 próprio da tela', (await call(sec, 'GET', PAY)).json?.error === SEM_PERM)
  const rt2 = await call(adm, 'POST', '/edu/acesso/restaurar-padrao', {})
  check('restaurar de novo: 0 regras', rt2.json?.restauradas === 0)

  // ------------------------------------------------------------------ isolamento
  secao('Isolamento entre tenants')
  await set(adm, 'SECRETARY', 'financeiro', 'PERMITIR')
  await set(adm, 'FINANCE', 'financeiro', 'BLOQUEAR')
  check('isolamento: SECRETARY do tenant A com permissão lê', (await call(sec, 'GET', PAY)).status === 200)
  check('isolamento: SECRETARY do tenant B NÃO ganha a permissão', (await call(secB, 'GET', PAY)).json?.error === SEM_PERM)
  check('isolamento: FINANCE do tenant B NÃO é bloqueada', (await call(finB, 'GET', PAY)).status === 200)
  check('isolamento: matriz do tenant B vazia', (await call(admB, 'GET', '/edu/acesso/matriz')).json.regras.length === 0)
  check('isolamento: meus-modulos de B limpo', (await call(finB, 'GET', '/edu/acesso/meus-modulos')).json.bloqueados.length === 0)
  const bPut = await set(admB, 'FINANCE', 'financeiro', 'BLOQUEAR')
  check('isolamento: B salva regra própria', bPut.status === 200 && bPut.json.alteradas === 1)
  check('isolamento: regra de B bloqueia só B', (await call(finB, 'GET', PAY)).json?.codigo === 'ACESSO_CARGO_BLOQUEADO' && (await call(fin, 'GET', '/edu/suprimentos/dashboard')).status === 200)
  await set(admB, 'FINANCE', 'financeiro', 'PADRAO')
  check('isolamento: desbloquear B não desbloqueia A', (await call(fin, 'GET', PAY)).json?.codigo === 'ACESSO_CARGO_BLOQUEADO' && (await call(finB, 'GET', PAY)).status === 200)
  await call(admB, 'POST', '/edu/acesso/restaurar-padrao', {})
  check('isolamento: restaurar em B não apaga regras de A', (await prisma.acsRegra.count({ where: { tenantId: A, estado: { not: 'PADRAO' } } })) === 2)
  check('isolamento: histórico de B só traz eventos de B', (await call(admB, 'GET', '/edu/acesso/historico')).json.items.length === (await prisma.eduAuditEvent.count({ where: { tenantId: t2.tenantId, modulo: 'acesso' } })))
  check('isolamento: eventos de auditoria de B só no tenant B', (await prisma.eduAuditEvent.count({ where: { tenantId: t2.tenantId, modulo: 'acesso' } })) >= 2 && (await prisma.eduAuditEvent.count({ where: { tenantId: t2.tenantId, modulo: 'acesso', userId: adm.id } })) === 0)

  // ------------------------------------------------------------------ auditoria
  secao('Auditoria')
  const ev = await prisma.eduAuditEvent.findMany({ where: { tenantId: A, modulo: 'acesso' }, orderBy: { createdAt: 'asc' } })
  check('auditoria: há eventos do módulo acesso', ev.length >= 10, ev.length)
  const evBloq = ev.find((e) => e.acao === 'REGRA_ALTERADA' && (e.detalhes as any)?.cargo === 'FINANCE' && (e.detalhes as any)?.modulo === 'financeiro' && (e.detalhes as any)?.para === 'BLOQUEAR')
  check('auditoria: bloqueio registra cargo, módulo, de e para', !!evBloq && (evBloq!.detalhes as any).de === 'PADRAO', evBloq?.detalhes)
  check('auditoria: registra quem alterou', evBloq?.userId === adm.id)
  check('auditoria: refType/refId identificam a regra', evBloq?.refType === 'AcsRegra' && evBloq?.refId === 'FINANCE:financeiro')
  check('auditoria: troca PERMITIR→BLOQUEAR registrada com "de" correto', ev.some((e) => (e.detalhes as any)?.cargo === 'SECRETARY' && (e.detalhes as any)?.modulo === 'boletos' && (e.detalhes as any)?.de === 'PERMITIR' && (e.detalhes as any)?.para === 'BLOQUEAR'))
  check('auditoria: volta a PADRAO registrada', ev.some((e) => (e.detalhes as any)?.para === 'PADRAO' && (e.detalhes as any)?.de === 'PERMITIR'))
  check('auditoria: edição pelo OWNER registra o OWNER', ev.some((e) => e.userId === own.id && (e.detalhes as any)?.modulo === 'rh'))
  check('auditoria: restauração registrada', ev.some((e) => e.acao === 'MATRIZ_RESTAURADA' && (e.detalhes as any)?.cargo === 'MARKETING' && (e.detalhes as any)?.regrasRemovidas === 4))
  check('auditoria: restauração geral registrada', ev.some((e) => e.acao === 'MATRIZ_RESTAURADA' && (e.detalhes as any)?.cargo === 'TODOS'))
  const nEv = ev.length
  await set(adm, 'FINANCE', 'financeiro', 'BLOQUEAR')
  check('auditoria: repetir o mesmo estado NÃO gera evento', (await prisma.eduAuditEvent.count({ where: { tenantId: A, modulo: 'acesso' } })) === nEv)
  await set(adm, 'FINANCE', 'financeiro', 'PERMITIR')
  check('auditoria: mudança real gera exatamente 1 evento', (await prisma.eduAuditEvent.count({ where: { tenantId: A, modulo: 'acesso' } })) === nEv + 1)
  check('auditoria: tentativa recusada (cargo SUPER) não gera evento', (await set(adm, 'RECTOR', 'rh', 'BLOQUEAR')).status === 400 && (await prisma.eduAuditEvent.count({ where: { tenantId: A, modulo: 'acesso' } })) === nEv + 1)
  const h = await call(adm, 'GET', '/edu/acesso/historico?pageSize=5')
  check('histórico: 200, pageSize respeitado e total', h.status === 200 && h.json.items.length === 5 && h.json.total >= 10, h.json?.total)
  check('histórico: traz o nome de quem alterou', h.json.items.some((i: any) => !!i.quem))
  check('histórico: ordem mais recente primeiro', new Date(h.json.items[0].quando) >= new Date(h.json.items[1].quando))
  check('histórico: página 2 diferente da 1', (await call(adm, 'GET', '/edu/acesso/historico?pageSize=5&page=2')).json.items[0]?.id !== h.json.items[0].id)
  const m1 = await call(adm, 'GET', '/edu/acesso/matriz')
  const rFin = m1.json.regras.find((r: any) => r.cargo === 'FINANCE' && r.modulo === 'financeiro')
  check('matriz: guarda quem alterou e quando', rFin?.alteradoPor === adm.id && !!rFin?.alteradoEm && !!rFin?.alteradoPorNome, rFin)

  // ------------------------------------------------------------------ rotas públicas e outras montagens
  secao('Rotas públicas e meus-modulos por cargo')
  for (const c of CARGOS) {
    const actor = c.cargo === 'STUDENT' ? stu : await t1.mk(c.cargo)
    const r = await call(actor, 'GET', '/edu/acesso/meus-modulos')
    check(`meus-modulos: cargo ${c.cargo} responde com seu próprio cargo`, r.status === 200 && r.json.cargo === c.cargo && Array.isArray(r.json.bloqueados), r.json)
  }

  // ------------------------------------------------------------------ seed
  secao('Seed de demonstração')
  await call(adm, 'POST', '/edu/acesso/restaurar-padrao', {})
  const apiAdm = async (method: string, path: string, body?: any) => { const r = await call(adm, method, path, body); return r.status < 400 ? r.json : null }
  const falhas: string[] = []
  const r1 = await seedAcesso(apiAdm, { failures: falhas })
  check('seed: aplicou as regras sem falhas', falhas.length === 0 && r1.alteradas === r1.regras && r1.regras >= 20, { r1, falhas })
  const r2 = await seedAcesso(apiAdm, { failures: falhas })
  check('seed: idempotente (segunda execução não altera nada)', r2.alteradas === 0 && falhas.length === 0, r2)
  check('seed: SECRETARY sem Financeiro', (await call(sec, 'GET', PAY)).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('seed: FINANCE sem Jurídico', (await call(fin, 'GET', '/edu/juridico/painel')).json?.codigo === 'ACESSO_CARGO_BLOQUEADO')
  check('seed: FINANCE continua com Financeiro', (await call(fin, 'GET', PAY)).status === 200)
  check('seed: ADMIN (apresentacao@) segue vendo tudo', (await call(adm, 'GET', PAY)).status === 200 && (await call(adm, 'GET', '/edu/juridico/painel')).status === 200 && (await call(adm, 'GET', '/edu/acesso/meus-modulos')).json.bloqueados.length === 0)
  check('seed: RECTOR e BOARD intactos', (await call(rec, 'GET', '/edu/juridico/painel')).status === 200 && (await call(brd, 'GET', PAY)).status === 200)
  const seedSuper = await prisma.acsRegra.count({ where: { tenantId: A, cargo: { in: CARGOS_SUPER }, estado: { not: 'PADRAO' } } })
  check('seed: nenhuma regra em cargos SUPER', seedSuper === 0)
  check('seed: tenant B não foi tocado', (await prisma.acsRegra.count({ where: { tenantId: t2.tenantId, estado: { not: 'PADRAO' } } })) === 0)
  const apiFalha = async () => null
  const falhas2: string[] = []
  const r3 = await seedAcesso(apiFalha, { failures: falhas2 })
  check('seed: falha da API é reportada em ctx.failures sem lançar', r3.alteradas === 0 && falhas2.length === 1)

  await close()
  summary()
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
