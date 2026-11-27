/**
 * Seed de demonstração do MENSAGEIRO INTERNO (EduMaster Pro). Usa a API REAL: cada pessoa escreve com o próprio login, como no uso de verdade.
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedMensagens } from './seeds/mensagens'  ->  await seedMensagens(c.api, { ...sCtx(c), loginAs: c.loginAs })
 * Uso isolado:  DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/mensagens.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 * Pré-requisito: seed da central de atendimento (setores, protocolos). Todos os textos, nomes e anexos são FICTÍCIOS. Idempotente (não repete se já semeado).
 * Equipe criada (senha Demo@2026): msg.secretaria@, msg.financeiro@, msg.juridico@, msg.reitoria@, msg.admissoes@, msg.coordenacao@ (@suainstituicao.edu.br).
 * Para mostrar o alerta: entre como admin@suainstituicao.edu.br (ou msg.financeiro@) em /edu/mensagens: há um pedido de "falar com uma pessoa" pendente no Financeiro.
 * Para disparar ao vivo: em outra janela entre como msg.coordenacao@ e escreva "quero falar com uma pessoa" no canal Financeiro.
 */
export interface SeedCtx {
  tenantId?: string
  clinicId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  loginAs?: (c: { email: string; password: string }) => Promise<string>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const M = '/edu/mensagens'
const AT = '/edu/atendimento'
const SENHA = 'Demo@2026'
const DOM = 'suainstituicao.edu.br'
const pdf = (titulo: string) => 'data:application/pdf;base64,' + Buffer.from(`%PDF-1.4\n1 0 obj<</Title (${titulo})>>endobj\ntrailer<<>>\n%%EOF`).toString('base64')

export async function seedMensagens(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = { canais: {} }
  const falha = (m: string) => { ctx.failures?.push(`seedMensagens: ${m}`); console.log('!! seedMensagens:', m) }
  const API = process.env.API_URL || 'http://localhost:3000/api'

  // ---------- equipe: cada pessoa escreve com o próprio login
  const tokenDe = async (email: string): Promise<string | null> => {
    if (ctx.loginAs) return ctx.loginAs({ email, password: SENHA })
    if (ctx.clinicId) {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: ctx.clinicId, email, password: SENHA }) })
      const j: any = await r.json().catch(() => null)
      return r.ok ? j.token : null
    }
    return null
  }
  const apiComToken = (token: string): Api => async (method, path, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const t = await r.text(); let j: any = null; try { j = JSON.parse(t) } catch { /* texto */ }
    if (!r.ok) { falha(`${method} ${path} -> ${r.status} ${t.slice(0, 140)}`); return null }
    return j
  }
  if (!ctx.mk) { falha('sem ctx.mk: não é possível criar a equipe da demonstração'); return S }
  type Pessoa = { user: any; email: string; api: Api }
  const pessoa = async (slug: string, nome: string, sobrenome: string, role: string): Promise<Pessoa> => {
    const email = `msg.${slug}@${DOM}`
    return { user: await ctx.mk!(email, SENHA, nome, sobrenome, role), email, api: null as any }
  }
  const entrar = async (p: Pessoa) => { const t = await tokenDe(p.email); if (!t) { falha(`login de ${p.email} indisponível`); return false } p.api = apiComToken(t); return true }
  const sec = await pessoa('secretaria', 'Patrícia', 'Lemos', 'SECRETARY')
  const fin = await pessoa('financeiro', 'Roberto', 'Siqueira', 'FINANCE')
  const jur = await pessoa('juridico', 'Marina', 'Albuquerque', 'LEGAL')
  const rei = await pessoa('reitoria', 'Antônio', 'Vasconcelos', 'RECTOR')
  const adm = await pessoa('admissoes', 'Camila', 'Duarte', 'ADMISSIONS')
  const coo = await pessoa('coordenacao', 'Eduardo', 'Pimentel', 'COORDINATOR')

  // ---------- departamentos (setores do atendimento) e integrantes
  const meta = await api('GET', `${M}/meta`) // cria os canais dos setores padrão
  if (!meta) return S
  const meuId: string = meta.usuarioId
  const setoresAtd: any[] = (await api('GET', `${AT}/setores`)) ?? []
  for (const [codigo, nome, descricao] of [['JURIDICO', 'Jurídico', 'Contratos, convênios e questões jurídicas da instituição'], ['REITORIA', 'Reitoria', 'Gabinete da reitoria e conselho'], ['ADMISSOES', 'Admissões', 'Vestibular, matrículas e ingresso']] as const) {
    if (!setoresAtd.some((s) => s.codigo === codigo)) await api('POST', `${AT}/setores`, { codigo, nome, descricao })
  }
  await api('POST', `${M}/bootstrap`, {})
  const setores: any[] = (await api('GET', `${AT}/setores`)) ?? []
  const setor = (c: string) => setores.find((s) => s.codigo === c)
  const equipe = async (codigo: string, userIds: string[]) => {
    const s = setor(codigo); if (!s) return falha(`setor ${codigo} ausente`)
    const atuais: Array<{ userId: string; capacidade: number }> = (s.membros ?? []).map((m: any) => ({ userId: m.userId, capacidade: m.capacidade ?? 8 }))
    const todos = [...atuais, ...userIds.filter((u) => !atuais.some((a) => a.userId === u)).map((userId) => ({ userId, capacidade: 8 }))]
    await api('PUT', `${AT}/setores/${s.id}/membros`, { membros: todos })
  }
  await equipe('SECRETARIA', [sec.user.id]); await equipe('FINANCEIRO', [fin.user.id]); await equipe('JURIDICO', [jur.user.id]); await equipe('REITORIA', [rei.user.id]); await equipe('ADMISSOES', [adm.user.id]); await equipe('COORDENACAO', [coo.user.id])

  const todos: any[] = (await api('GET', `${M}/canais?escopo=todos`))?.items ?? []
  if (todos.some((c) => c.nome === 'Rematrícula 2027/1')) { console.log('seedMensagens: já semeado, nada a fazer.'); return S }
  for (const p of [sec, fin, jur, rei, adm, coo]) if (!(await entrar(p))) return S // logins só depois da checagem (o login tem limite de tentativas)
  const canal = (c: string) => todos.find((x) => x.tipo === 'DEPARTAMENTO' && x.setor?.codigo === c)
  const cSec = canal('SECRETARIA'), cFin = canal('FINANCEIRO'), cJur = canal('JURIDICO'), cRei = canal('REITORIA'), cAdm = canal('ADMISSOES'), cCoo = canal('COORDENACAO')
  if (![cSec, cFin, cJur, cRei, cAdm, cCoo].every(Boolean)) { falha('canais de departamento ausentes'); return S }
  S.canais = { secretaria: cSec.id, financeiro: cFin.id, juridico: cJur.id, reitoria: cRei.id, admissoes: cAdm.id, coordenacao: cCoo.id }

  // ---------- resposta automática por departamento (FAQ + ausência), com confiança mínima configurável
  const faq = async (c: any, itens: Array<[string, string, string[]]>) => { for (const [pergunta, resposta, palavrasChave] of itens) await sec.api('POST', `${M}/canais/${c.id}/faq`, { pergunta, resposta, palavrasChave }) }
  await faq(cFin, [
    ['Como emitir a segunda via do boleto da mensalidade?', 'Acesse o portal do aluno > Serviços > 2ª via de boleto. Todas as cobranças em aberto aparecem com a linha digitável. O vencimento é sempre dia 10.', ['boleto', 'segunda via', 'mensalidade', 'vencimento']],
    ['Qual o prazo para pedir desconto ou bolsa?', 'O pedido de bolsa ou desconto é aberto como atendimento ao Financeiro até o dia 25 do mês anterior ao vencimento. A análise leva até 5 dias úteis.', ['bolsa', 'desconto', 'prazo', 'financiamento']],
    ['Como pedir a declaração de quitação de débitos?', 'A declaração de quitação é emitida pelo Financeiro em até 2 dias úteis após a baixa do último boleto. Solicite abrindo um protocolo no portal.', ['quitacao', 'declaracao', 'debitos', 'quitar']],
  ])
  await faq(cSec, [
    ['Como solicitar a declaração de matrícula?', 'Pelo portal do aluno > Serviços > Declaração de matrícula. A emissão é imediata, em PDF com QR de verificação.', ['declaracao', 'matricula', 'vinculo']],
    ['Qual o prazo da rematrícula?', 'A rematrícula do semestre seguinte ocorre de 1 a 30 de novembro e de 1 a 30 de junho, pelo portal do aluno.', ['rematricula', 'prazo', 'matricula']],
    ['Como pedir o histórico escolar?', 'O histórico é emitido pelo portal (serviço Histórico escolar). Para uso externo, a Secretaria assina digitalmente em até 3 dias úteis.', ['historico', 'escolar', 'notas']],
  ])
  await faq(cJur, [['Como encaminhar um contrato para análise jurídica?', 'Envie o contrato em PDF neste canal, informe o prazo desejado e o centro de custo. O Jurídico responde em até 3 dias úteis.', ['contrato', 'analise', 'minuta', 'convenio']]])
  const horario = { ativa: true, ausenciaAtiva: true, horarioInicio: '08:00', horarioFim: '18:00', diasSemana: [1, 2, 3, 4, 5] }
  await sec.api('PUT', `${M}/canais/${cFin.id}/auto`, { ...horario, mensagemAusencia: 'O Financeiro atende de segunda a sexta, das 8h às 18h. Sua mensagem foi registrada e será respondida no próximo dia útil.', respostaAutomatica: true, confiancaMinima: 0.6, usarConhecimento: true, usarFaqGeral: true, mensagemSemResposta: 'Não encontrei uma resposta automática segura para isso. Avisei a equipe do Financeiro: uma pessoa vai responder por aqui.' })
  await sec.api('PUT', `${M}/canais/${cSec.id}/auto`, { ...horario, respostaAutomatica: true, confiancaMinima: 0.65, usarConhecimento: true, usarFaqGeral: true })
  await sec.api('PUT', `${M}/canais/${cJur.id}/auto`, { ...horario, mensagemAusencia: 'O Jurídico atende de segunda a sexta, das 8h às 18h. Para urgências de prazo processual, escreva "quero falar com uma pessoa".', respostaAutomatica: true, confiancaMinima: 0.75, usarConhecimento: true, usarFaqGeral: false })

  // ---------- todos entram nos canais que acompanham (a Helena, administradora da demonstração, vê tudo e recebe os alertas)
  for (const c of [cFin, cSec, cJur, cRei]) await api('POST', `${M}/canais/${c.id}/entrar`, {})

  const msg = async (a: Api, canalId: string, texto: string, extra: Record<string, unknown> = {}) => (await a('POST', `${M}/canais/${canalId}/mensagens`, { texto, ...extra }))?.mensagem
  const pausa = (ms = 40) => new Promise((r) => setTimeout(r, ms))

  // ---------- 1) conversa direta Secretaria ↔ Financeiro, com anexo
  const dmSF = await sec.api('POST', `${M}/canais`, { tipo: 'DIRETA', userId: fin.user.id })
  if (dmSF) {
    await msg(sec.api, dmSF.id, 'Roberto, bom dia! A coordenação pediu a declaração de quitação de uma formanda. Você consegue emitir ainda hoje?')
    await msg(fin.api, dmSF.id, 'Bom dia, Patrícia. Consigo sim, só preciso da baixa do último boleto. Te mando o documento ainda esta manhã.')
    await msg(sec.api, dmSF.id, 'Perfeito. Já anexei o requerimento assinado para facilitar.', { anexos: [{ nome: 'requerimento-quitacao-assinado.pdf', mime: 'application/pdf', dataUrl: pdf('Requerimento de quitação (fictício)') }] })
    await msg(fin.api, dmSF.id, 'Recebi, obrigado! Vou conferir e te aviso quando estiver pronto.')
    S.diretaSecFin = dmSF.id
  }

  // ---------- 2) grupo da rematrícula (menções, anexo, mensagem fixada)
  const grp = await sec.api('POST', `${M}/canais`, { tipo: 'GRUPO', nome: 'Rematrícula 2027/1', descricao: 'Força-tarefa da rematrícula do próximo semestre', membros: [fin.user.id, coo.user.id, adm.user.id, rei.user.id, meuId], restrito: true })
  if (grp) {
    const aviso = await msg(sec.api, grp.id, 'Pessoal, a janela de rematrícula abre em 1º de novembro e vai até o dia 30. Combinei com a TI de liberar o portal às 8h do dia 1º.')
    if (aviso) await sec.api('POST', `${M}/mensagens/${aviso.id}/fixar`, {})
    await msg(fin.api, grp.id, `@Patrícia_Lemos posso gerar os boletos da primeira parcela já com o desconto de rematrícula antecipada? Preciso da lista de elegíveis.`, { mencoesUsuarios: [sec.user.id] })
    await msg(sec.api, grp.id, 'Pode sim. Segue a lista dos alunos sem pendência documental (fictícia, apenas para teste).', { anexos: [{ nome: 'elegiveis-rematricula-2027-1.pdf', mime: 'application/pdf', dataUrl: pdf('Lista de elegíveis (fictícia)') }] })
    await msg(coo.api, grp.id, 'Do lado da coordenação, 3 cursos ainda não fecharam a oferta de optativas. Vou cobrar os coordenadores até quarta.')
    await msg(adm.api, grp.id, '@secretaria os ingressantes do vestibular de inverno entram na mesma janela, certo?', { mencoesSetores: [setor('SECRETARIA')?.id].filter(Boolean) })
    await msg(rei.api, grp.id, 'Certo. Prioridade para fechar o calendário e comunicar os alunos com 15 dias de antecedência. Obrigado, equipe.')
    S.grupoRematricula = grp.id
  }

  // ---------- 3) canal do Jurídico: pedido de análise, resposta de quem é do departamento, anexo
  const pedJur = await msg(sec.api, cJur.id, '@juridico bom dia! Precisamos de análise da minuta do convênio de estágio com uma empresa parceira (fictícia). Prazo desejado: sexta-feira.', { anexos: [{ nome: 'minuta-convenio-estagio.pdf', mime: 'application/pdf', dataUrl: pdf('Minuta de convênio (fictícia)') }] })
  await pausa()
  await msg(jur.api, cJur.id, '@Patrícia_Lemos Bom dia! Recebi a minuta. Já adianto: a cláusula de rescisão precisa de aviso prévio de 30 dias para ficar alinhada ao regimento. Devolvo com os ajustes até quinta.', { respostaAId: pedJur?.id, mencoesUsuarios: [sec.user.id] })
  await msg(sec.api, cJur.id, 'Combinado, obrigada! Aviso a empresa.')

  // ---------- 4) atendimento encaminhado ao Jurídico (reaproveita a transferência da Central)
  const atd = await sec.api('POST', `${AT}/atendimentos`, { canal: 'BALCAO', assunto: 'Empresa parceira solicita alteração de cláusula do convênio de estágio', solicitanteNome: 'Empresa Parceira Exemplo Ltda (fictícia)', prioridade: 'NORMAL', setorId: setor('SECRETARIA')?.id })
  if (atd) {
    await sec.api('POST', `${M}/canais/${cJur.id}/encaminhar-atendimento`, { atendimentoId: atd.id, motivo: 'Alteração contratual: análise do Jurídico antes de responder à empresa.' })
    S.atendimentoEncaminhado = atd.id
  }

  // ---------- 5) conversa ligada a um protocolo (link direto para a tela)
  const protocolos: any[] = ((await api('GET', `${AT}/protocolos?pageSize=5`))?.items) ?? []
  const prot = protocolos.find((p) => p.servicoNome?.toLowerCase().includes('tranc')) ?? protocolos[0]
  if (prot) {
    const gp = await sec.api('POST', `${M}/canais`, { tipo: 'GRUPO', nome: `Acompanhamento do protocolo ${prot.numero}`, membros: [fin.user.id, coo.user.id, meuId], restrito: true, contexto: { tipo: 'PROTOCOLO', id: prot.id } })
    if (gp) {
      await msg(sec.api, gp.id, 'Abri este grupo para tratar o protocolo do aluno em um só lugar. Falta o parecer da coordenação e a análise financeira.')
      await msg(coo.api, gp.id, 'Parecer da coordenação: favorável, sem prejuízo ao percurso do aluno. Estou registrando no protocolo.')
      await msg(fin.api, gp.id, 'Financeiro: não há débitos em aberto. Pode seguir com o registro na secretaria.', { contexto: { tipo: 'PROTOCOLO', id: prot.id } })
      S.grupoProtocolo = gp.id
    }
  }

  // ---------- 6) reitoria ↔ administração (direta, não lida pela administradora)
  {
    const dmR = await rei.api('POST', `${M}/canais`, { tipo: 'DIRETA', userId: meuId })
    if (dmR) {
      await msg(rei.api, dmR.id, 'Helena, preciso do consolidado de matrículas e inadimplência para a pauta do conselho de segunda. Consegue me enviar até sexta?')
      await msg(rei.api, dmR.id, 'Se possível, com o comparativo do semestre anterior.')
      S.diretaReitoria = dmR.id
    }
  }

  // ---------- 7) canal do Financeiro: dúvida respondida pela resposta automática, caso atendido por uma pessoa e um pedido pendente
  await msg(fin.api, cFin.id, 'Equipe: lembrete de que a remessa do banco fecha às 16h. Quem for emitir acordo hoje, avise antes das 15h.')
  await pausa()
  const q1 = await msg(coo.api, cFin.id, 'Boa tarde! Como eu consigo a segunda via do boleto da mensalidade para um aluno que perdeu o e-mail?')
  await pausa()
  const q2 = await msg(adm.api, cFin.id, 'Preciso falar com uma pessoa sobre a bolsa de um ingressante que mudou de curso.')
  await pausa()
  if (q2) {
    // quem é do departamento atende e o pedido fica resolvido (histórico do alerta)
    await msg(fin.api, cFin.id, '@Camila_Duarte pode me mandar o nome do aluno e o curso novo? Reviso a bolsa hoje.', { mencoesUsuarios: [adm.user.id], respostaAId: q2.id })
    await msg(adm.api, cFin.id, 'Claro, Roberto: é o aluno do 3º período que passou de Administração para Ciências Contábeis. Te passo o RA por mensagem direta.')
    const todosPed = (await fin.api('GET', `${M}/pedidos?status=TODOS`))?.items ?? []
    const meu = todosPed.find((p: any) => p.solicitante.nome.startsWith('Camila') && p.status !== 'RESOLVIDO')
    if (meu) await fin.api('POST', `${M}/pedidos/${meu.id}/resolver`, {}) // histórico: um pedido já atendido e resolvido
  }
  void q1
  // pedido pendente: fica aguardando uma pessoa para mostrar o alerta sonoro/visual
  await msg(coo.api, cFin.id, 'Quero falar com uma pessoa sobre uma cobrança em duplicidade para um aluno do 5º período. É urgente, o aluno está com a matrícula travada.')

  // ---------- 8) secretaria: pergunta fora da base (vira pedido) e conversa aberta de avisos
  await msg(coo.api, cSec.id, 'Qual a regra para aproveitamento de disciplinas cursadas em outra instituição fora do Brasil?')
  const avisos = await sec.api('POST', `${M}/canais`, { tipo: 'GRUPO', nome: 'Avisos gerais', descricao: 'Comunicados da instituição para toda a equipe', restrito: false })
  if (avisos) {
    const m = await msg(sec.api, avisos.id, 'Comunicado: o sistema ficará em manutenção programada no sábado, das 22h às 23h30. Salvem seus trabalhos antes.')
    if (m) await sec.api('POST', `${M}/mensagens/${m.id}/fixar`, {})
    S.avisos = avisos.id
  }
  console.log('seedMensagens: canais de departamento, grupos, conversas diretas, respostas automáticas e 1 pedido de pessoa pendente criados.')
  return S
}

// execução isolada
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const { prisma } = await import('../../src/lib/prisma')
    const bcryptMod: any = await import('bcryptjs')
    const bcrypt = bcryptMod.default ?? bcryptMod
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Clínica sua-instituicao não encontrada: rode o edu-demo-seed antes.')
    const login = async (email: string, password: string) => {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email, password }) })
      const j: any = await r.json()
      if (!r.ok) throw new Error('login: ' + JSON.stringify(j))
      return j.token as string
    }
    const token = await login('admin@suainstituicao.edu.br', 'Demo@2026')
    const api: Api = async (method, path, body) => { const x = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await x.json().catch(() => null); if (!x.ok) console.log('!!', method, path, x.status, JSON.stringify(t)?.slice(0, 200)); return x.ok ? t : null }
    const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
      const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      return ex ?? prisma.user.create({ data: { clinicId: clinic.id, tenantId: clinic.tenantId, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
    }
    const failures: string[] = []
    await seedMensagens(api, { tenantId: clinic.tenantId, clinicId: clinic.id, mk, loginAs: ({ email, password }) => login(email, password), failures })
    console.log(failures.length ? 'Falhas:\n' + failures.join('\n') : 'Seed de mensagens concluído.')
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
