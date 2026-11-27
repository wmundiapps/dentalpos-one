// Testes da CAIXA DE SUGESTÕES/BUGS (módulo feedback, prefixo Fbk): envio com contexto sanitizado, votação, triagem, duplicados, exportação, LGPD e integração com Atendimento.
// Uso:  DATABASE_URL=postgresql://inf2:inf2@127.0.0.1:5432/inf2 npx tsx scripts/e2e/feedback.ts
// Requer Postgres LOCAL com o schema aplicado (prisma db push). NUNCA aponte para banco remoto nem para o edutest.
import { setup, check, summary, prisma, fails, Actor } from './qa5-lib'
import { sanitizarTexto, sanitizarRota, resumirNavegador, similaridade, TRANSICOES, MAX_LOG } from '../../src/modules/feedback/sanitize'
import { jobFeedbackRetencao } from '../../src/modules/feedback/routes'
import { seedFeedback, FOTO_DEMO } from '../seeds/infra2'

const secao = (t: string) => console.log(`\n== ${t}`)
const F = '/edu/feedback'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyIsInJvbGUiOiJBRE1JTiJ9.abcDEF123_-xyzABC'
const EXE = 'data:image/png;base64,' + Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00This program cannot be run in DOS mode.').toString('base64')
const ok = (extra: any = {}) => ({ tipo: 'SUGESTAO', categoria: 'PORTAL', prioridade: 'MEDIA', titulo: 'Mostrar horário das aulas no portal', descricao: 'Seria útil ver a próxima aula logo ao abrir o portal do aluno.', ...extra })

async function main() {
  secao('Sanitização (funções puras)')
  const t = (s: string) => sanitizarTexto(s)
  check('remove JWT', !t(`erro com ${JWT} no header`).includes('eyJ') && t(`erro com ${JWT}`).includes('[jwt-omitido]'))
  check('remove Bearer', t('Authorization: Bearer abcdef1234567890xyz').includes('[omitido]') && !t('Bearer abcdef1234567890xyz').includes('abcdef1234567890xyz'))
  check('remove senha=valor', t('login falhou password=SuperSecreta123 url').includes('password=[omitido]') && !t('password=SuperSecreta123').includes('SuperSecreta123'))
  check('remove token em JSON', !t('{"token":"abc123def456ghi789","x":1}').includes('abc123def456ghi789'))
  check('mascara CPF formatado', !t('cpf do aluno 123.456.789-09 inválido').includes('123.456.789-09'))
  check('mascara CPF cru após rótulo', !t('cpf: 12345678909').includes('12345678909'))
  check('substitui e-mail', t('falha para maria.silva@exemplo.com.br ao salvar') === 'falha para [e-mail] ao salvar')
  check('substitui telefone', !t('ligar (11) 98765-4321 agora').includes('98765') && t('ligar (11) 98765-4321 agora').includes('[telefone]'))
  check('substitui número de cartão', t('cartao 4111 1111 1111 1111 recusado').includes('[numero-omitido]'))
  check('substitui UUID', t('registro 123e4567-e89b-12d3-a456-426614174000 não achado').includes('[id]'))
  check('substitui hash longo', t('sha ' + 'a'.repeat(64)).includes('[hash]'))
  check('substitui base64 longo', t('blob ' + 'QUJD'.repeat(20)).includes('[token-omitido]'))
  check('remove data URL', t('img data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB fim').includes('[data-url-omitida]'))
  check('remove query string de URL no texto', t('GET https://api.exemplo.com/a/b?token=zzz&x=1 falhou').includes('?[query-omitida]') && !t('GET https://api.exemplo.com/a?token=zzz').includes('zzz'))
  check('remove chave de API', t('usando sk-live_abcdef1234567890 no cliente').includes('[chave-omitida]'))
  check('remove caracteres de controle', t('a\u0000b\u0007c') === 'abc')
  check('mantém texto comum', t('Erro ao salvar notas da turma 3B') === 'Erro ao salvar notas da turma 3B')
  check('trunca textos longos', sanitizarTexto('x '.repeat(10000), 100).endsWith('[...truncado]') && sanitizarTexto('x '.repeat(10000)).length <= MAX_LOG + 20)
  check('texto vazio', sanitizarTexto('') === '')
  check('rota: remove host, hash e valores da query', sanitizarRota('https://app.edu.br/edu/notas?aluno=999&token=abc#topo') === '/edu/notas?aluno=…&token=…')
  check('rota: uuid vira :id', sanitizarRota('/edu/alunos/123e4567-e89b-12d3-a456-426614174000/historico') === '/edu/alunos/:id/historico')
  check('rota: id numérico longo vira :id', sanitizarRota('/edu/protocolos/20260001/detalhe') === '/edu/protocolos/:id/detalhe')
  check('rota nula', sanitizarRota(null) === null && sanitizarRota('') === null)
  check('navegador resumido sem versão completa', resumirNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.6367.60 Safari/537.36') === 'Chrome 124 / Windows')
  check('navegador Firefox/Android', resumirNavegador('Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0') === 'Firefox 125 / Android')
  check('similaridade alta para títulos parecidos', similaridade('Mostrar horário das aulas no portal', 'Mostrar o horário das aulas no portal do aluno') >= 0.5)
  check('similaridade baixa para assuntos diferentes', similaridade('Mostrar horário das aulas', 'Exportar boletos financeiro') < 0.2)
  check('transições: RESOLVIDO só reabre para triagem/andamento', TRANSICOES.RESOLVIDO.join() === 'EM_TRIAGEM,EM_ANDAMENTO')

  secao('API')
  const h = await setup()
  const { call, t1, t2 } = h
  const admin = await t1.mk('ADMIN'), sup = await t1.mk('SUPPORT'), aluno = await t1.mk('STUDENT', true), aluno2 = await t1.mk('STUDENT', true), prof = await t1.mk('TEACHER'), fac = await t1.mk('FACILITIES'), aluno3 = await t1.mk('STUDENT', true), spam = await t1.mk('TEACHER')
  const adminB = await t2.mk('ADMIN'), alunoB = await t2.mk('STUDENT', true)
  const C = (a: Actor, m: string, p: string, b?: any) => call(a, m, F + p.replace(/^/, ''), b)

  // ---- envio
  let r = await call(null, 'POST', `${F}/itens`, ok()); check('sem login = 401', r.status === 401)
  r = await C(aluno, 'POST', '/itens', ok({ titulo: 'ab' })); check('título curto = 400', r.status === 400)
  r = await C(aluno, 'POST', '/itens', ok({ tipo: 'OUTRO' })); check('tipo inválido = 400', r.status === 400)
  r = await C(aluno, 'POST', '/itens', ok({ descricao: 'curta' })); check('descrição curta = 400', r.status === 400)
  r = await C(aluno, 'POST', '/itens', ok({ capturas: [{ arquivoNome: 'x.txt', mime: 'text/plain', dataUrl: 'data:text/plain;base64,aGVsbG8=' }] })); check('captura que não é imagem = 400', r.status >= 400 && r.status < 500)
  r = await C(aluno, 'POST', '/itens', ok({ capturas: [{ arquivoNome: 'x.png', dataUrl: EXE }] })); check('upload guard recusa executável disfarçado de imagem', r.status >= 400 && r.status < 500, r.json)
  r = await C(aluno, 'POST', '/itens', ok({ capturas: Array(4).fill({ arquivoNome: 'a.png', dataUrl: FOTO_DEMO }) })); check('mais de 3 capturas = 400', r.status === 400)
  r = await C(aluno, 'POST', '/itens', ok({ contexto: { rota: 'https://app.exemplo.com/edu/notas?aluno=9981&token=SEGREDO#x', tela: 'Diário de notas', versaoApp: '1.4.2', navegador: 'Mozilla/5.0 (Windows NT 10.0) Chrome/124.0.0.0 Safari/537.36', plataforma: 'Win32', viewport: '1366x768', idioma: 'pt-BR', logsConsole: `[10:00:01] ERROR falha ao salvar para joao.silva@escola.com cpf 123.456.789-09\n[10:00:02] ERROR Authorization: Bearer ${JWT}\n[10:00:03] WARN senha=Abc12345 enviada` }, perfil: 'ADMIN', autorUserId: 'outro' }))
  const it1 = r.json
  check('aluno envia sugestão (201) com número FBK', r.status === 201 && it1.numero?.startsWith('FBK-') && it1.status === 'NOVO')
  check('resposta ao autor não expõe logs, autor nem responsável', !('logsConsole' in it1) && !('autorUserId' in it1) && !('responsavelUserId' in it1))
  const db1 = await prisma.fbkItem.findUnique({ where: { id: it1.id } })
  check('perfil vem do token, não do corpo', db1?.perfil === 'STUDENT' && db1?.autorUserId === aluno.id)
  check('rota gravada sem host, hash nem valores', db1?.rota === '/edu/notas?aluno=…&token=…')
  check('logs: e-mail, CPF, Bearer e senha removidos no servidor', !!db1?.logsConsole && !/joao\.silva|123\.456|eyJ|Abc12345|SEGREDO/.test(db1.logsConsole) && db1.logsConsole.includes('[e-mail]'))
  check('navegador resumido; viewport e versão guardados', db1?.navegador === 'Chrome 124 / Windows' && db1?.viewport === '1366x768' && db1?.versaoApp === '1.4.2')
  check('nome do autor guardado para a triagem', !!db1?.autorNome && db1?.anonimo === false)
  r = await C(aluno, 'POST', '/itens', ok({ titulo: 'Sugestão anônima de melhoria', anonimo: true })); const anon = r.json
  check('envio anônimo', r.status === 201 && (await prisma.fbkItem.findUnique({ where: { id: anon.id } }))?.autorNome === null)
  r = await C(aluno, 'POST', '/itens', { tipo: 'BUG', categoria: 'ACADEMICO', prioridade: 'CRITICA', titulo: 'Botão salvar não responde no celular', descricao: 'No celular o botão Salvar do diário não faz nada.', passosReproduzir: 'Abrir o diário; preencher; salvar.', contexto: { rota: '/edu/notas' }, capturas: [{ arquivoNome: 'captura.png', mime: 'image/png', dataUrl: FOTO_DEMO }] })
  const bug = r.json
  check('bug crítico com captura de tela', r.status === 201 && bug.prioridade === 'CRITICA' && bug.tipo === 'BUG')
  check('bug crítico notifica administração e suporte', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, templateKey: 'feedback.triagem', userId: { in: [admin.id, sup.id] } } })) >= 2)
  check('captura de tela salva', (await prisma.fbkAnexo.count({ where: { itemId: bug.id } })) === 1)
  r = await C(aluno2, 'POST', '/itens', ok({ titulo: 'Mostrar o horário das aulas no portal do aluno', descricao: 'Quero ver o horário das minhas aulas assim que entrar.' }))
  check('sugestão parecida devolve similares', r.status === 201 && r.json.similares.some((s: any) => s.id === it1.id))
  const it2 = r.json
  r = await C(prof, 'POST', '/itens', ok({ tipo: 'ERRO', titulo: 'Erro 500 ao exportar boletim', descricao: 'Ao exportar o boletim da turma aparece erro interno.', contexto: { rota: '/edu/notas' } })); const erro = r.json
  check('professor também envia', r.status === 201)
  r = await C(aluno, 'GET', '/itens/meus'); check('meus envios', r.json.total === 3 && r.json.items.every((i: any) => !('logsConsole' in i)))

  // ---- rate limit
  let ultimo = 0
  for (let i = 0; i < 16; i++) { const x = await C(spam, 'POST', '/itens', ok({ titulo: `Sugestão automática ${i} de teste` })); ultimo = x.status }
  check('limite de envios por hora (429)', ultimo === 429)
  check('limite não afeta outros usuários', (await C(aluno3, 'POST', '/itens', ok({ titulo: 'Outra sugestão qualquer', descricao: 'Descrição de teste longa o bastante.' }))).status === 201)

  // ---- votação
  r = await C(aluno2, 'GET', '/sugestoes'); check('lista pública de sugestões só com sugestões/melhorias', r.status === 200 && r.json.items.every((i: any) => ['SUGESTAO', 'MELHORIA'].includes(i.tipo)) && !r.json.items.some((i: any) => i.id === bug.id))
  check('visão pública não revela autor', r.json.items.every((i: any) => !('autorNome' in i) && !('autorUserId' in i) && !('logsConsole' in i)))
  r = await C(aluno2, 'POST', `/itens/${it1.id}/votar`, {}); check('vota em sugestão', r.status === 200 && r.json.votos === 1 && r.json.jaVotei === true)
  r = await C(aluno3, 'POST', `/itens/${it1.id}/votar`, {}); check('segundo voto de outro usuário', r.json.votos === 2)
  r = await C(aluno2, 'POST', `/itens/${it1.id}/votar`, {}); check('votar de novo remove o voto (alternar)', r.json.votos === 1 && r.json.jaVotei === false)
  await C(aluno2, 'POST', `/itens/${it1.id}/votar`, {})
  r = await C(aluno, 'POST', `/itens/${it1.id}/votar`, {}); check('autor não vota na própria sugestão (409)', r.status === 409)
  r = await C(aluno2, 'POST', `/itens/${bug.id}/votar`, {}); check('bug não é votável (404)', r.status === 404)
  r = await C(alunoB, 'POST', `/itens/${it1.id}/votar`, {}); check('isolamento: voto em item de outro tenant (404)', r.status === 404)
  r = await C(aluno2, 'GET', '/sugestoes'); check('"jaVotei" por usuário e ordenação por votos', r.json.items[0].id === it1.id && r.json.items[0].jaVotei === true && r.json.items[0].votos === 2)
  r = await C(aluno2, 'GET', '/sugestoes?q=horário'); check('busca nas sugestões', r.json.total >= 2)

  // ---- permissões da triagem
  for (const [nome, a] of [['aluno', aluno], ['professor', prof], ['infraestrutura', fac]] as Array<[string, Actor]>) { r = await C(a, 'GET', '/fila'); check(`${nome} não acessa a fila (403)`, r.status === 403) }
  r = await C(aluno, 'GET', '/painel'); check('aluno não acessa o painel (403)', r.status === 403)
  r = await C(aluno, 'GET', '/exportar'); check('aluno não exporta (403)', r.status === 403)
  r = await C(sup, 'GET', '/fila'); check('suporte acessa a fila', r.status === 200 && r.json.total >= 5)
  check('fila não expõe o id do autor e oculta o nome do anônimo', r.json.items.every((i: any) => !('autorUserId' in i)) && r.json.items.find((i: any) => i.id === anon.id).autorNome === null && r.json.items.find((i: any) => i.id === anon.id).autorAnonimo === true)
  r = await C(admin, 'GET', '/fila?tipo=BUG'); check('filtro por tipo', r.json.total === 1 && r.json.items[0].id === bug.id)
  r = await C(admin, 'GET', '/fila?prioridade=CRITICA'); check('filtro por prioridade', r.json.items.every((i: any) => i.prioridade === 'CRITICA'))
  r = await C(admin, 'GET', '/fila?q=boletim'); check('busca por texto', r.json.total === 1 && r.json.items[0].id === erro.id)
  r = await C(admin, 'GET', '/fila?q=/edu/notas'); check('busca por rota', r.json.total >= 2)
  r = await C(admin, 'GET', '/fila?ordem=prioridade'); check('ordenação por prioridade (crítico primeiro)', r.json.items[0].prioridade === 'CRITICA')
  r = await C(admin, 'GET', '/fila?ordem=votos'); check('ordenação por votos', r.json.items[0].id === it1.id)
  r = await C(admin, 'GET', '/fila?status=INEXISTENTE'); check('status inexistente = lista vazia', r.status === 200 && r.json.total === 0)
  r = await C(adminB, 'GET', '/fila'); check('isolamento: fila do outro tenant vazia', r.json.total === 0)

  // ---- detalhe
  r = await C(aluno, 'GET', `/itens/${bug.id}`); check('autor vê o próprio item sem logs técnicos', r.status === 200 && !('logsConsole' in r.json) && r.json.anexos.length === 1)
  r = await C(aluno2, 'GET', `/itens/${bug.id}`); check('outro usuário não vê item alheio (404)', r.status === 404)
  r = await C(adminB, 'GET', `/itens/${bug.id}`); check('outro tenant não vê (404)', r.status === 404)
  r = await C(sup, 'GET', `/itens/${it1.id}`); check('triagem vê contexto e logs sanitizados', r.status === 200 && r.json.logsConsole.includes('[e-mail]') && r.json.rota === '/edu/notas?aluno=…&token=…')
  check('visualização pela triagem é auditada', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'feedback', acao: 'TRIAGEM_VISUALIZOU' } })) >= 1)
  r = await C(sup, 'GET', `/itens/${bug.id}`); const anexoId = r.json.anexos[0].id
  let dl = await fetch(`${h.base}/edu/feedback/itens/${bug.id}/anexos/${anexoId}`, { headers: { authorization: `Bearer ${sup.token}` } })
  check('triagem baixa a captura (imagem, nosniff, CSP)', dl.status === 200 && dl.headers.get('content-type') === 'image/png' && dl.headers.get('x-content-type-options') === 'nosniff' && (dl.headers.get('content-security-policy') || '').includes("default-src 'none'"))
  dl = await fetch(`${h.base}/edu/feedback/itens/${bug.id}/anexos/${anexoId}`, { headers: { authorization: `Bearer ${aluno.token}` } }); check('autor baixa a própria captura', dl.status === 200)
  dl = await fetch(`${h.base}/edu/feedback/itens/${bug.id}/anexos/${anexoId}`, { headers: { authorization: `Bearer ${aluno2.token}` } }); check('outro usuário não baixa a captura (404)', dl.status === 404)

  // ---- triagem: classificar, atribuir, status
  r = await C(aluno, 'PATCH', `/itens/${bug.id}`, { prioridade: 'BAIXA' }); check('autor não classifica (403)', r.status === 403)
  r = await C(sup, 'PATCH', `/itens/${bug.id}`, { responsavelUserId: 'nao-existe' }); check('responsável inexistente = 400', r.status === 400)
  r = await C(sup, 'PATCH', `/itens/${bug.id}`, { responsavelUserId: admin.id, categoria: 'ACADEMICO' }); check('atribui responsável e move para triagem', r.status === 200 && r.json.responsavelNome && r.json.status === 'EM_TRIAGEM')
  r = await C(sup, 'GET', '/responsaveis'); check('lista de responsáveis possíveis', r.json.items.length >= 2)
  r = await C(sup, 'POST', `/itens/${bug.id}/status`, { status: 'NOVO' }); check('voltar para NOVO é transição inválida (409)', r.status === 409)
  r = await C(sup, 'POST', `/itens/${bug.id}/status`, { status: 'DUPLICADO' }); check('DUPLICADO só por /duplicado (400)', r.status === 400)
  r = await C(sup, 'POST', `/itens/${erro.id}/status`, { status: 'RECUSADO' }); check('recusar sem explicação = 400', r.status === 400)
  r = await C(sup, 'POST', `/itens/${erro.id}/status`, { status: 'RECUSADO', resposta: 'Não conseguimos reproduzir; reabra com mais detalhes.' }); check('recusa com resposta ao autor', r.status === 200 && r.json.status === 'RECUSADO' && r.json.respostaAutor)
  check('autor notificado da recusa', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, userId: prof.id, templateKey: 'feedback.status' } })) === 1)
  r = await C(sup, 'POST', `/itens/${erro.id}/status`, { status: 'EM_TRIAGEM' }); check('item recusado volta à triagem', r.json.status === 'EM_TRIAGEM')
  r = await C(sup, 'POST', `/itens/${bug.id}/status`, { status: 'EM_ANDAMENTO', resposta: 'Reproduzimos o problema e já estamos corrigindo.' }); check('status em andamento com resposta', r.json.status === 'EM_ANDAMENTO')
  r = await C(aluno, 'GET', `/itens/${bug.id}`); check('autor vê a resposta da equipe', r.json.respostaAutor?.includes('corrigindo') && r.json.status === 'EM_ANDAMENTO')
  r = await C(sup, 'POST', `/itens/${bug.id}/responder`, { resposta: 'Correção publicada na versão 1.4.3. Pode testar?' }); check('responde ao autor', r.status === 200 && r.json.respondidoEm)
  r = await C(sup, 'POST', `/itens/${bug.id}/status`, { status: 'RESOLVIDO' }); check('resolve e registra data', r.json.status === 'RESOLVIDO' && !!r.json.resolvidoEm)
  r = await C(sup, 'POST', `/itens/${bug.id}/status`, { status: 'PLANEJADO' }); check('resolvido não vai para planejado (409)', r.status === 409)
  check('autor notificado das respostas', (await prisma.eduNotification.count({ where: { tenantId: t1.tenantId, userId: aluno.id, templateKey: { in: ['feedback.status', 'feedback.resposta'] } } })) >= 2)
  r = await C(aluno, 'POST', `/itens/${bug.id}/responder`, { resposta: 'obrigado' }); check('autor não responde como equipe (403)', r.status === 403)

  // ---- comentários
  r = await C(sup, 'POST', `/itens/${it1.id}/comentarios`, { texto: 'Falar com o time do portal. contato fulano@x.com' }); check('nota interna da triagem (sanitizada)', r.status === 201 && r.json.interno === true && !r.json.texto.includes('fulano@x.com'))
  r = await C(sup, 'POST', `/itens/${it1.id}/comentarios`, { texto: 'Estamos avaliando a ideia.', interno: false }); check('comentário visível ao autor', r.status === 201 && r.json.interno === false)
  r = await C(aluno, 'GET', `/itens/${it1.id}`); check('autor só vê comentários públicos, sem nome do analista', r.json.comentarios.length === 1 && r.json.comentarios[0].autorNome === 'Equipe EduMaster')
  r = await C(sup, 'GET', `/itens/${it1.id}`); check('triagem vê todos os comentários', r.json.comentarios.length === 2)
  r = await C(aluno, 'POST', `/itens/${it1.id}/comentarios`, { texto: 'Complemento: também no app.', interno: true }); check('autor complementa (sempre público)', r.status === 201 && r.json.interno === false)
  r = await C(aluno2, 'POST', `/itens/${it1.id}/comentarios`, { texto: 'quero comentar' }); check('terceiro não comenta (404)', r.status === 404)

  // ---- duplicados
  r = await C(sup, 'POST', `/itens/${it2.id}/duplicado`, { duplicadoDeId: it2.id }); check('item não duplica a si mesmo (400)', r.status === 400)
  r = await C(sup, 'POST', `/itens/${it2.id}/duplicado`, { duplicadoDeId: 'nao-e-uuid' }); check('id inválido = 400', r.status === 400)
  await C(aluno3, 'POST', `/itens/${it2.id}/votar`, {})
  await C(prof, 'POST', `/itens/${it2.id}/votar`, {})
  r = await C(sup, 'POST', `/itens/${it2.id}/duplicado`, { duplicadoDeId: it1.id })
  check('marca duplicado, aponta o principal e avisa o autor', r.status === 200 && r.json.status === 'DUPLICADO' && r.json.duplicadoDeId === it1.id && r.json.respostaAutor.includes(it1.numero))
  const principal = await prisma.fbkItem.findUnique({ where: { id: it1.id } })
  check('votos migram para o principal sem repetir (aluno2 já votava; aluno3 e autor do duplicado entram)', principal?.votos === 3 && (await prisma.fbkVoto.count({ where: { itemId: it1.id } })) === 3)
  r = await C(aluno2, 'GET', '/sugestoes'); check('duplicado sai da lista pública', !r.json.items.some((i: any) => i.id === it2.id))
  r = await C(sup, 'POST', `/itens/${anon.id}/duplicado`, { duplicadoDeId: it2.id }); check('não aponta para outro duplicado (409)', r.status === 409)
  r = await C(aluno3, 'POST', `/itens/${it2.id}/votar`, {}); check('duplicado não aceita voto (404/409)', r.status === 409)

  // ---- Atendimento
  r = await C(aluno, 'POST', `/itens/${erro.id}/encaminhar-atendimento`, {}); check('autor não encaminha ao Atendimento (403)', r.status === 403)
  r = await C(sup, 'POST', `/itens/${erro.id}/encaminhar-atendimento`, {}); const enc = r.json
  check('encaminha ao Atendimento criando protocolo', r.status === 201 && /^(ATD|CHD)-/.test(enc.atendimentoRef) && !!enc.chamadoId && ['atendimento', 'apoio'].includes(enc.destino))
  if (enc.destino === 'atendimento') {
    const at = await (prisma as any).atdAtendimento.findUnique({ where: { id: enc.chamadoId } })
    check('atendimento criado na Central com SLA, origem FEEDBACK e referência ao item', at?.numero === enc.atendimentoRef && at.origem === 'FEEDBACK' && !!at.slaResolucaoEm && at.assunto.includes(erro.numero))
  } else {
    const ch = await prisma.apoChamado.findUnique({ where: { id: enc.chamadoId } })
    check('chamado criado no Apoio com SLA e solicitante', ch?.numero === enc.atendimentoRef && ch.solicitanteUserId === prof.id && ch.slaHoras > 0 && ch.titulo.includes(erro.numero))
  }
  r = await C(sup, 'POST', `/itens/${erro.id}/encaminhar-atendimento`, {}); check('encaminhar duas vezes = 409', r.status === 409)

  // ---- painel e exportação
  await C(aluno3, 'POST', '/itens', ok({ titulo: 'Exportar =cmd|calc!A1 relatório', descricao: '=HYPERLINK("http://x") fórmula na descrição do pedido.' }))
  r = await C(admin, 'GET', '/painel')
  check('painel: totais, status, tipos e telas com mais erros', r.status === 200 && r.json.total >= 6 && r.json.porStatus.RESOLVIDO === 1 && r.json.porTipo.BUG === 1 && r.json.telasComMaisErros.some((x: any) => x.rota === '/edu/notas'))
  check('painel: mais votadas, taxa de resposta e tempo médio', r.json.maisVotadas[0].id === it1.id && r.json.taxaResposta > 0 && r.json.tempoMedioResolucaoDias !== null)
  r = await C(admin, 'GET', '/exportar'); check('exportação JSON', r.status === 200 && r.json.total >= 6 && !('descricao' in {}) && r.json.items[0].numero)
  const csv = await fetch(`${h.base}/edu/feedback/exportar?format=csv`, { headers: { authorization: `Bearer ${admin.token}` } })
  const txt = await csv.text()
  check('exportação CSV com BOM e cabeçalho', csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv') && txt.replace(/^\uFEFF/, '').startsWith('numero;criadoEm;tipo'))
  check('CSV neutraliza fórmulas (injeção)', /'=HYPERLINK|'=cmd/.test(txt) && !/;=HYPERLINK/.test(txt))
  check('CSV não traz id nem nome do autor', !txt.includes(aluno.id) && !/autor/i.test(txt.split('\n')[0]))
  check('exportação foi auditada', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'feedback', acao: 'EXPORTADO' } })) === 2)

  // ---- retenção LGPD
  await prisma.fbkItem.update({ where: { id: bug.id }, data: { updatedAt: new Date(Date.now() - 200 * 86_400_000) } }).catch(() => null)
  await prisma.$executeRawUnsafe(`UPDATE "FbkItem" SET "updatedAt" = now() - interval '200 days' WHERE id = '${bug.id}'`)
  await prisma.fbkItem.update({ where: { id: bug.id }, data: { logsConsole: 'ERROR teste de retenção' } }).catch(() => null)
  await prisma.$executeRawUnsafe(`UPDATE "FbkItem" SET "updatedAt" = now() - interval '200 days' WHERE id = '${bug.id}'`)
  const ret = await jobFeedbackRetencao()
  check('retenção: remove logs e capturas de itens encerrados há > 180 dias', ret.logsRemovidos >= 1 && (await prisma.fbkAnexo.count({ where: { itemId: bug.id } })) === 0 && (await prisma.fbkItem.findUnique({ where: { id: bug.id } }))?.logsConsole === null)
  check('retenção preserva itens recentes', (await prisma.fbkItem.findUnique({ where: { id: it1.id } }))?.logsConsole !== null)

  // ---- seed
  secao('Seed')
  const failures: string[] = []
  const api = async (m: string, p: string, b?: any) => { const x = await call(adminB, m, p, b); return x.status < 300 ? x.json : (console.log('  seed falhou', m, p, x.status, JSON.stringify(x.json).slice(0, 160)), null) }
  const itens = await seedFeedback(api, { failures })
  check('seedFeedback sem falhas', failures.length === 0 && itens.length === 6, failures)
  r = await call(adminB, 'GET', `${F}/painel`); check('seed: painel com dados e bug em andamento', r.json.total === 6 && r.json.porStatus.EM_ANDAMENTO === 1 && r.json.porStatus.PLANEJADO === 1)

  await h.close()
  summary()
  process.exit(fails.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
