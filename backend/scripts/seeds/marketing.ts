/**
 * Seed de demonstração do módulo MARKETING E CAPTAÇÃO (EduMaster Pro). Usa SOMENTE a API (token ADMIN), no estilo de scripts/edu-demo-seed.ts.
 *   import { seedMarketing } from './seeds/marketing';  await seedMarketing(c.api, c)
 * Uso isolado: DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/marketing.ts  (login admin@ravel.edu.br / Ravel@2026)
 * Todos os dados são FICTÍCIOS (domínios .example). Provedores de canais/redes/IA rodam SIMULADOS. Idempotente: se o site já existe, não duplica.
 * Respeita a LGPD: só leads com opt-in marcado recebem marketing; há contatos sem opt-in e na lista de supressão para demonstrar os bloqueios.
 */
export interface SeedCtx { tenantId?: string; failures?: string[]; siteSlug?: string }
type Api = (method: string, path: string, body?: any) => Promise<any>

const M = '/edu/marketing'
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

export async function seedMarketing(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = {}
  const slug = ctx.siteSlug ?? 'ravel'
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) ctx.failures?.push(`seedMarketing: falhou ${tag}`); return x as T }
  const post = (p: string, b?: any) => api('POST', `${M}${p}`, b ?? {})

  const ja = await api('GET', `${M}/site`)
  if (ja?.site) return { jaExistia: true }

  await api('PUT', `${M}/config`, { janelaInicio: '08:00', janelaFim: '21:00', diasPermitidos: [1, 2, 3, 4, 5, 6], limiteDia: 2, limiteSemana: 5, remetenteNome: 'Instituto Ravel de Ensino', remetenteEndereco: 'Av. Paulista, 1000 - São Paulo/SP', contatoDpo: 'dpo@ravel.example', slaPrimeiroContatoMin: 60, ticketMedio: 10800, metaCustoLead: 45, limiteAprovacaoOrcamento: 5000 })
  await api('PUT', `${M}/marca`, { tomDeVoz: 'acolhedor, motivador e profissional', slogan: 'Aprender muda tudo.' })

  // consultores
  const cons: any[] = []
  for (const [nome, cursos] of [['Camila Duarte', ['Odontologia', 'Enfermagem']], ['Rafael Nogueira', ['Administração', 'Direito']], ['Beatriz Lopes', []]] as Array<[string, string[]]>) cons.push(ok(await post('/consultores', { nome, email: `${nome.split(' ')[0].toLowerCase()}@ravel.example`, cursos, peso: 1 }), `consultor ${nome}`))
  S.consultores = cons

  // cursos de referência (vitrine): usa as ofertas do vestibular aberto; se não houver, cria um processo simples
  let ofertas: any[] = (await api('GET', '/edu/admissoes/ofertas?pageSize=50'))?.items ?? []
  if (!ofertas.length) {
    const proc = await api('POST', '/edu/admissoes/processos', { codigo: `MKT-${Date.now() % 100000}`, nome: 'Vestibular Marketing 2027/1', tipo: 'VESTIBULAR_TRADICIONAL', nivel: 'GRADUACAO', inscricaoInicio: day(-10), inscricaoFim: day(40), provaData: day(50), taxaInscricao: 0, status: 'ABERTO' })
    if (proc) for (const [nomeCurso, valor] of [['Odontologia', 3200], ['Administração EAD', 480], ['Pedagogia EAD', 420]] as Array<[string, number]>) { const o = await api('POST', '/edu/admissoes/ofertas', { processoId: proc.id, nomeCurso, turno: 'NOTURNO', modalidade: nomeCurso.includes('EAD') ? 'EAD' : 'PRESENCIAL', vagas: 60, valorMensalidade: valor, parcelas: 6 }); if (o) ofertas.push(o) }
  }
  S.ofertas = ofertas

  // site e formulários
  ok(await api('PUT', `${M}/site`, { slug, nome: 'Instituto Ravel de Ensino', descricao: 'Graduação, pós e cursos EAD com acolhimento e tecnologia.', whatsapp: '(11) 99999-0000', rodape: 'Instituto Ravel de Ensino · Credenciada pelo MEC (dados fictícios de demonstração)', chatAtivo: true }), 'site')
  const f1 = ok(await post('/formularios', { nome: 'Quero conhecer os cursos', slug: 'quero-conhecer', origemPadrao: 'SITE', campos: [{ chave: 'nome', rotulo: 'Nome completo', tipo: 'texto', obrigatorio: true }, { chave: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true }, { chave: 'telefone', rotulo: 'WhatsApp', tipo: 'telefone', obrigatorio: false }, { chave: 'curso', rotulo: 'Curso de interesse', tipo: 'curso' }] }), 'formulario1')
  await post('/formularios', { nome: 'Convênio com empresas', slug: 'convenio-empresas', origemPadrao: 'CONVENIO_EMPRESA', campos: [{ chave: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true }, { chave: 'email', rotulo: 'E-mail corporativo', tipo: 'email', obrigatorio: true }, { chave: 'empresa', rotulo: 'Empresa', tipo: 'texto' }] })
  S.formulario = f1

  // campanhas
  const mk = async (b: any) => ok(await post('/campanhas', b), `campanha ${b.nome}`)
  const c1 = await mk({ nome: 'Vestibular 2027/1 — Odontologia', objetivo: 'Preencher 60 vagas', briefing: 'Foco em egressos do ensino médio e profissionais da saúde. Mensagem: tradição e clínica-escola.', canais: ['INSTAGRAM', 'GOOGLE_ADS', 'EMAIL', 'RADIO'], cursoNome: 'Odontologia', publico: 'ENSINO_MEDIO', responsavelNome: 'Camila Duarte', inicio: day(-20), fim: day(40), orcamentoPrevisto: 18000, metaLeads: 400, metaMatriculas: 60, utmCampaign: 'vest-odonto-2027' })
  const c2 = await mk({ nome: 'EAD Administração — Matrícula aberta', canais: ['FACEBOOK', 'TIKTOK', 'EMAIL', 'WHATSAPP'], cursoNome: 'Administração EAD', publico: 'PROFISSIONAIS', responsavelNome: 'Rafael Nogueira', inicio: day(-5), fim: day(60), orcamentoPrevisto: 4200, metaLeads: 250, metaMatriculas: 40, utmCampaign: 'ead-adm-2027' })
  const c3 = await mk({ nome: 'Open Day Ravel', canais: ['EVENTO', 'INSTAGRAM', 'PANFLETAGEM'], publico: 'COMUNIDADE', inicio: day(5), fim: day(20), orcamentoPrevisto: 7000, metaLeads: 150 })
  const c4 = await mk({ nome: 'Pós-graduação — Egressos', canais: ['EMAIL', 'LINKEDIN'], publico: 'EGRESSOS', inicio: day(-60), fim: day(-5), orcamentoPrevisto: 2500, metaLeads: 80 })
  if (c1) { await post(`/campanhas/${c1.id}/enviar-aprovacao`); await post(`/campanhas/${c1.id}/aprovar`, { nota: 'Orçamento dentro da meta trimestral.' }); await post(`/campanhas/${c1.id}/ativar`); await post(`/campanhas/${c1.id}/vincular-admissoes`) }
  if (c2) { await post(`/campanhas/${c2.id}/ativar`); await post(`/campanhas/${c2.id}/vincular-admissoes`) }
  if (c3) await post(`/campanhas/${c3.id}/enviar-aprovacao`)
  if (c4) { await post(`/campanhas/${c4.id}/ativar`); await post(`/campanhas/${c4.id}/concluir`) }
  S.campanhas = [c1, c2, c3, c4]
  for (const [camp, origem, tipo, valor, desc] of [[c1, 'GOOGLE_ADS', 'MIDIA', 5200, 'Pesquisa paga — vestibular'], [c1, 'INSTAGRAM', 'MIDIA', 3100, 'Impulsionamento Instagram'], [c1, 'INSTAGRAM', 'PRODUCAO', 1800, 'Produção de vídeos'], [c2, 'FACEBOOK', 'MIDIA', 1400, 'Anúncios Meta'], [c2, 'TIKTOK', 'MIDIA', 900, 'Anúncios TikTok'], [c4, 'LINKEDIN', 'MIDIA', 2300, 'Anúncios LinkedIn']] as Array<[any, string, string, number, string]>) if (camp) await post('/custos', { campanhaId: camp.id, origem, tipo, valor, descricao: desc, data: day(-8) })

  // mídia offline
  const radio = ok(await post('/midia-offline', { campanhaId: c1?.id, tipo: 'RADIO', veiculo: 'Rádio Cidade FM 98,1', praca: 'São Paulo', descricao: 'Spots de 30s, horário nobre', inicio: day(-15), fim: day(25), cupom: 'RAVELRADIO', telefoneExclusivo: '(11) 4000-1981' }), 'midia radio')
  if (radio) { await post(`/midia-offline/${radio.id}/insercoes`, { data: day(-14), quantidade: 30, custo: 2400, horario: '07:00-09:00' }); await post(`/midia-offline/${radio.id}/insercoes`, { data: day(-7), quantidade: 30, custo: 2400 }) }
  const out = ok(await post('/midia-offline', { campanhaId: c1?.id, tipo: 'OUTDOOR', veiculo: 'Outdoor Av. Paulista (quadra 12)', inicio: day(-10), fim: day(20), cupom: 'RAVELOUT' }), 'midia outdoor')
  if (out) await post(`/midia-offline/${out.id}/insercoes`, { data: day(-10), quantidade: 1, custo: 3800 })
  const pan = ok(await post('/midia-offline', { campanhaId: c3?.id, tipo: 'PANFLETAGEM', veiculo: 'Panfletagem estações de metrô', inicio: day(2), fim: day(15), cupom: 'RAVELFLY' }), 'midia panfleto')
  S.midias = [radio, out, pan]

  // leads (origens variadas; apenas alguns com opt-in de marketing)
  const nomes = ['Ana Beatriz Souza', 'Carlos Eduardo Lima', 'Fernanda Oliveira', 'João Pedro Santos', 'Mariana Costa', 'Lucas Almeida', 'Juliana Ribeiro', 'Pedro Henrique Rocha', 'Larissa Martins', 'Gustavo Pereira', 'Camila Ferreira', 'Rodrigo Barbosa', 'Patrícia Gomes', 'Thiago Carvalho', 'Aline Teixeira', 'Bruno Araújo', 'Vanessa Moreira', 'Diego Cardoso', 'Renata Nunes', 'Felipe Machado', 'Tatiane Freitas', 'Marcelo Dias', 'Bianca Castro', 'André Monteiro']
  const origens = ['SITE', 'INSTAGRAM', 'GOOGLE_ADS', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'THREADS', 'TWILIO_LIGACAO', 'CONVENIO_COLEGIO', 'CONVENIO_EMPRESA', 'CONVENIO_PREFEITURA', 'INDICACAO', 'EVENTO', 'PANFLETAGEM', 'SITE', 'GOOGLE_ADS']
  const cursos = ['Odontologia', 'Administração EAD', 'Pedagogia EAD', 'Odontologia', 'Direito']
  const leads: any[] = []
  for (let i = 0; i < nomes.length; i++) {
    const origem = origens[i % origens.length]
    const l = await post('/leads', { nome: nomes[i], email: `${nomes[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.')}@exemplo.example`, telefone: `(11) 9${String(8000 + i * 7).padStart(4, '0')}-${String(1000 + i * 13).slice(0, 4)}`, curso: cursos[i % cursos.length], origem, campanhaId: i % 3 === 0 ? c2?.id : c1?.id, consentimentoContato: true, consentimentoMarketing: i % 3 !== 2 })
    if (l) leads.push(l)
  }
  const viaCupom = await post('/leads', { nome: 'Sérgio Vasconcelos', email: 'sergio.vasconcelos@exemplo.example', telefone: '(11) 98111-2233', curso: 'Odontologia', origem: 'OUTRO', cupom: 'RAVELRADIO', consentimentoContato: true, consentimentoMarketing: true })
  if (viaCupom) leads.push(viaCupom)
  S.leads = leads
  // andamento do funil
  const avanca = async (idx: number, etapas: string[]) => { const l = leads[idx]; if (!l) return; for (const e of etapas) await post(`/leads/${l.id}/etapa`, { etapa: e }) }
  await avanca(0, ['CONTATO', 'QUALIFICADO', 'INSCRITO', 'MATRICULADO']); await avanca(1, ['CONTATO', 'QUALIFICADO', 'INSCRITO']); await avanca(3, ['CONTATO', 'QUALIFICADO']); await avanca(4, ['CONTATO']); await avanca(6, ['CONTATO', 'QUALIFICADO', 'INSCRITO', 'MATRICULADO']); await avanca(9, ['CONTATO', 'QUALIFICADO', 'INSCRITO', 'MATRICULADO'])
  if (leads[5]) await post(`/leads/${leads[5].id}/etapa`, { etapa: 'PERDIDO', motivo: 'Optou por outra instituição' })
  for (const i of [2, 3, 4]) if (leads[i]) { await post(`/leads/${leads[i].id}/eventos`, { tipo: 'SIMULOU_MENSALIDADE' }); await post(`/leads/${leads[i].id}/eventos`, { tipo: 'RESPONDEU' }) }

  // cadências
  await post('/cadencias', { nome: 'Boas-vindas ao lead (3 toques)', gatilho: 'LEAD_NOVO', passos: [{ atrasoHoras: 0, canal: 'EMAIL', assunto: 'Que bom ter você por aqui, {{nome}}!', corpo: 'Olá, {{nome}}! Recebemos seu interesse em {{curso}}. {{consultor}} entrará em contato para ajudar.' }, { atrasoHoras: 48, canal: 'EMAIL', assunto: 'Conheça a estrutura de {{curso}}', corpo: 'Oi, {{nome}}! Preparamos um material com a grade e as condições de {{curso}}. Quer agendar uma conversa?' }, { atrasoHoras: 120, canal: 'WHATSAPP', corpo: 'Oi, {{nome}}! Ainda dá tempo de garantir sua vaga em {{curso}}. Posso ajudar?' }] })
  await post('/cadencias', { nome: 'Lead quente — contato rápido', gatilho: 'LEAD_QUENTE', passos: [{ atrasoHoras: 1, canal: 'SMS', corpo: '{{nome}}, vimos seu interesse em {{curso}}. Responda aqui para falar com {{consultor}}.' }] })

  // supressão (descadastros anteriores) e envio de demonstração
  await post('/conformidade/supressao', { email: 'quem.saiu@exemplo.example', motivo: 'SOLICITACAO_TITULAR', observacao: 'Pediu para sair pelo e-mail' })
  await post('/conformidade/supressao', { telefone: '(11) 97777-6666', motivo: 'ATENDENTE', observacao: 'Pediu para não receber SMS/WhatsApp' })
  const seg = await post('/segmentos', { nome: 'Leads de Odontologia com opt-in', base: 'LEADS', filtros: { curso: 'Odontologia' } })
  const d1 = ok(await post('/disparos', { nome: 'Vestibular Odonto — lembrete de inscrições', campanhaId: c1?.id, canal: 'EMAIL', segmentoId: seg?.id, assunto: '{{nome}}, as inscrições para {{curso}} estão abertas', corpo: 'Olá, {{nome}}! O vestibular de {{curso}} está com inscrições abertas. Responda este e-mail para falar com {{consultor}}.' }), 'disparo')
  if (d1) await post(`/disparos/${d1.id}/executar`)
  await post('/disparos', { nome: 'EAD Administração — WhatsApp', campanhaId: c2?.id, canal: 'WHATSAPP', base: 'LEADS', filtros: { curso: 'Administração' }, corpo: 'Olá, {{nome}}! Matrículas abertas para {{curso}} EAD. Quer conhecer as condições?', agendadoPara: day(1) })

  // gerador de IA e publicações
  const ia = await post('/ia/gerar', { briefing: 'Campanha de matrículas do curso de Administração EAD para quem trabalha e quer estudar à noite, com tutoria próxima e bolsas.', curso: 'Administração EAD', publico: 'Profissionais que trabalham', cta: 'Matricule-se', variacoes: 3, campanhaId: c2?.id })
  ok(ia, 'gerador ia')
  const pecas = (await api('GET', `${M}/pecas?pageSize=100`))?.items ?? []
  const copy = pecas.find((p: any) => p.tipo === 'COPY'); const img = pecas.find((p: any) => p.tipo === 'IMAGEM')
  if (copy) await post(`/pecas/${copy.id}/enviar-aprovacao`); if (copy) await post(`/pecas/${copy.id}/aprovar`)
  if (img) { await post(`/pecas/${img.id}/enviar-aprovacao`); await post(`/pecas/${img.id}/aprovar`) }
  const redes = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'THREADS']
  for (let i = 0; i < redes.length; i++) {
    const p = await post('/publicacoes', { campanhaId: c2?.id, rede: redes[i], texto: `Administração EAD: estude no seu ritmo, com tutoria e bolsas. Matricule-se! #${i + 1}`, midiaUrl: 'https://simulado.invalid/midia.jpg', agendadoPara: day(i + 1) })
    if (p) { await post(`/publicacoes/${p.id}/enviar-aprovacao`); await post(`/publicacoes/${p.id}/aprovar`); if (i % 2 === 0) await post(`/publicacoes/${p.id}/agendar`, { agendadoPara: day(i + 1) }); if (i === 0) { await post(`/publicacoes/${p.id}/publicar`) } }
  }

  // site: páginas
  const home = ok(await post('/paginas', { slug: 'inicio', titulo: 'Início', tipo: 'HOME', noMenu: true, ordem: 0, seoTitulo: 'Instituto Ravel — graduação, pós e EAD', seoDescricao: 'Conheça cursos de graduação, pós-graduação e EAD do Instituto Ravel. Inscreva-se e simule sua mensalidade.', blocos: [{ tipo: 'HERO', titulo: 'Seu futuro começa aqui', texto: 'Graduação, pós-graduação e cursos EAD com acolhimento.', botaoRotulo: 'Quero conhecer', botaoUrl: '#formulario' }, { tipo: 'CURSOS', titulo: 'Nossos cursos' }, { tipo: 'SIMULADOR', titulo: 'Simule sua mensalidade' }, { tipo: 'EVENTOS', titulo: 'Próximos eventos' }, { tipo: 'FAQ', titulo: 'Perguntas frequentes' }, { tipo: 'FORM', titulo: 'Fale com um consultor', formularioSlug: 'quero-conhecer' }, { tipo: 'CHAT' }] }), 'pagina home')
  if (home) await post(`/paginas/${home.id}/publicar`)
  const lp = ok(await post('/paginas', { slug: 'ead-administracao', titulo: 'Administração EAD', tipo: 'LANDING', noMenu: true, ordem: 1, seoTitulo: 'Administração EAD — Instituto Ravel', seoDescricao: 'Gradue-se em Administração 100% online, com tutoria próxima e bolsas. Matrículas abertas.', campanhaId: c2?.id, blocos: [{ tipo: 'HERO', titulo: 'Administração EAD', texto: 'Estude onde e quando quiser.', botaoRotulo: 'Matricule-se', botaoUrl: '#formulario' }, { tipo: 'TEXTO', titulo: 'Por que estudar conosco', texto: 'Tutoria próxima, material atualizado e certificado reconhecido pelo MEC.' }, { tipo: 'FORM', titulo: 'Receba o contato de um consultor', formularioSlug: 'quero-conhecer' }] }), 'pagina landing')
  if (lp) await post(`/paginas/${lp.id}/publicar`)

  // eventos
  const ev = ok(await post('/eventos', { titulo: 'Open Day Ravel', slug: 'open-day', descricao: 'Conheça o campus, laboratórios e converse com coordenadores.', tipo: 'OPEN_DAY', inicio: day(7), fim: day(7.3), local: 'Campus Paulista', vagas: 120, campanhaId: c3?.id, custo: 2500 }), 'evento')
  if (ev) { await post(`/eventos/${ev.id}/publicar`); for (const [n, e] of [['Helena Prado', 'helena.prado@exemplo.example'], ['Otávio Brandão', 'otavio.brandao@exemplo.example']]) await api('POST', `/public/edu/marketing/site/${slug}/eventos/open-day/inscricao`, { nome: n, email: e, consentimentoContato: true, aceitaLembretes: true, consentimentoMarketing: true }) }
  const ev2 = await post('/eventos', { titulo: 'Aula aberta: Saúde Bucal', slug: 'aula-aberta-saude-bucal', tipo: 'AULA_ABERTA', inicio: day(14), online: true, linkOnline: 'https://meet.example/aula-aberta', vagas: 300 }); if (ev2) await post(`/eventos/${ev2.id}/publicar`)

  // incentivo / indicação premiada
  const prog = ok(await post('/programas', { nome: 'Indique um amigo — Aluno Embaixador', publicoAlvo: 'ALUNOS', descricao: 'Aluno que indica um amigo matriculado ganha desconto.', recompensa: '1 mensalidade de desconto', valorRecompensa: 480, regras: 'A recompensa é liberada após a matrícula do indicado.', inicio: day(-30), metaIndicacoes: 50 }), 'programa')
  await post('/programas', { nome: 'Endomarketing — Professor Parceiro', publicoAlvo: 'PROFESSORES', recompensa: 'Brinde e horas de formação', inicio: day(-10), metaIndicacoes: 20 })
  if (prog) { const ind = await post(`/programas/${prog.id}/indicadores`, { nome: 'Aluna Débora Matos', tipo: 'ALUNO' }); if (ind) { S.indicador = ind; await api('POST', `${M}/leads`, { nome: 'Indicado Wagner Pires', email: 'wagner.pires@exemplo.example', telefone: '(11) 98222-3344', curso: 'Pedagogia EAD', origem: 'INDICACAO', indicacao: ind.codigo, consentimentoContato: true, consentimentoMarketing: false }) } }

  // atendimento IA em canais
  for (const [canal, rem, texto] of [['WHATSAPP', '5511981112233', 'Oi, quanto custa a mensalidade de Odontologia?'], ['INSTAGRAM', 'insta_maria', 'Quando é o vestibular?'], ['SITE', 'visitante-demo-0001', 'Quero falar com um atendente']] as Array<[string, string, string]>) await post('/atendimentos/entrada', { canal, remetente: rem, texto })

  await api('POST', `${M}/leads/sincronizar-admissoes`, {})
  return { jaExistia: false, ...Object.fromEntries(Object.entries(S).map(([k, v]) => [k, Array.isArray(v) ? v.length : !!v])) }
}

if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.SEED_EMAIL || 'admin@ravel.edu.br', password: process.env.SEED_PASSWORD || 'Ravel@2026' }) })
    const t = (await login.json().catch(() => ({}))) as any
    const token = t.token || t.accessToken
    if (!token) { console.error('Login falhou'); process.exit(1) }
    const api: Api = async (method, path, body) => { const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined }); if (!r.ok) return null; return r.json().catch(() => null) }
    const failures: string[] = []
    console.log(await seedMarketing(api, { failures })); failures.forEach((f) => console.log('FALHA', f))
  })()
}
