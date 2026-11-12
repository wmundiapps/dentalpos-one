/**
 * Seed de demonstração do PLANEJAMENTO de infraestrutura (obras, reformas, expansão, reposição, pintura, plotagem e
 * equipamentos/materiais por curso). Usa a API REAL (estilo scripts/edu-demo-seed.ts).
 * Integração (sem editar o edu-demo-seed):  import { seedInfraPlanejamento } from './seeds/infra-planejamento'
 *   -> await seedInfraPlanejamento(c.api, c)   // c = { tenantId, mk, loginAs, failures }
 * Aprovações usam usuários distintos do solicitante: se ctx.apiAs não vier, o seed cria coordenação/diretoria/reitoria
 * via ctx.mk e entra com ctx.loginAs (API_URL, padrão http://localhost:3000/api). Sem nada disso, os planos ficam "aguardando aprovação".
 * Uso isolado: DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/infra-planejamento.ts  (login admin@suainstituicao.edu.br / Demo@2026)
 * Cursos, fornecedores, valores e prazos são FICTÍCIOS. Rodar em banco limpo (não é idempotente por título).
 */
type Api = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx {
  tenantId?: string
  clinicId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  loginAs?: (c: { email: string; password: string }) => Promise<string>
  /** Opcional: devolve uma API autenticada como o papel (COORDINATOR | BOARD | RECTOR). */
  apiAs?: (role: 'COORDINATOR' | 'BOARD' | 'RECTOR') => Promise<Api>
  tokenOf?: () => Promise<string>
  failures?: string[]
}

const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const I = '/edu/infraestrutura'
const PL = `${I}/planejamento`

type Fluxo = 'rascunho' | 'enviado' | 'coord' | 'aprovado' | 'convertido' | 'andamento' | 'concluido' | 'reprovado'
interface Def {
  titulo: string; tipo: string; curso?: string; espaco?: string; prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA'; orcamento?: number
  itens?: Array<{ descricao: string; quantidade: number; unidade?: string; precoEstimado: number }>
  justificativa: string; mec?: string; ano?: number; inicio?: number; fim?: number; marcos?: Array<[string, number]>
  cotacoes?: Array<[string, number, number]>; fluxo: Fluxo; executado?: number; requisito?: string; destino?: 'REQUISICAO' | 'OS' | 'PROJETO'; parecer?: string
}

export async function seedInfraPlanejamento(api: Api, ctx: SeedCtx = {}) {
  const falha = (m: string) => ctx.failures?.push(`seedInfraPlanejamento: ${m}`)
  const hoje = new Date().getFullYear()
  const res = { planos: 0, convertidos: 0, sugestoes: 0, requisitos: 0 }

  // ---------------------------------------------------------------- aprovadores (usuários distintos do solicitante)
  let por: Partial<Record<'COORDINATOR' | 'BOARD' | 'RECTOR', Api>> = {}
  const API = process.env.API_URL || 'http://localhost:3000/api'
  const mkApi = (token: string): Api => async (method, path, body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
    return r.json().catch(() => null)
  }
  if (ctx.apiAs) {
    for (const r of ['COORDINATOR', 'BOARD', 'RECTOR'] as const) por[r] = await ctx.apiAs(r)
  } else if (ctx.mk && ctx.loginAs) {
    const contas: Array<['COORDINATOR' | 'BOARD' | 'RECTOR', string, string, string]> = [['COORDINATOR', 'coordenacao.infra@suainstituicao.edu.br', 'Patrícia', 'Moura'], ['BOARD', 'diretoria@suainstituicao.edu.br', 'Ricardo', 'Nogueira'], ['RECTOR', 'reitoria@suainstituicao.edu.br', 'Beatriz', 'Albuquerque']]
    for (const [role, email, n, s] of contas) {
      try { await ctx.mk(email, 'Demo@2026', n, s, role); por[role] = mkApi(await ctx.loginAs({ email, password: 'Demo@2026' })) } catch (e: any) { falha(`conta ${role}: ${e?.message}`) }
    }
  }
  const podeAprovar = !!(por.COORDINATOR && por.BOARD && por.RECTOR)

  // ---------------------------------------------------------------- política (limite de cotação e alçadas)
  const pol = await api('PUT', `${PL}/politica`, {
    limiteCotacao: 8000, minCotacoes: 3, alertaPrazoDias: 20, alertaOrcamentoPct: 90,
    alcadas: [{ nivel: 1, papel: 'COORDINATOR', rotulo: 'Coordenação', valorMinimo: 0 }, { nivel: 2, papel: 'BOARD', rotulo: 'Diretoria', valorMinimo: 15000 }, { nivel: 3, papel: 'RECTOR', rotulo: 'Reitoria', valorMinimo: 80000 }],
    orcamentoAnual: [{ ano: hoje, valor: 600000 }, { ano: hoje + 1, valor: 1500000 }],
  })
  if (!pol?.configurada) falha('política')

  // ---------------------------------------------------------------- cursos, espaços, categorias, requisitos e bens
  await api('POST', `${I}/bootstrap`, {})
  const lista = (x: any) => (Array.isArray(x) ? x : x?.items ?? [])
  const cursosExist = lista(await api('GET', '/edu/academico/programs'))
  const curso: Record<string, string> = {}
  for (const c of cursosExist) curso[c.nome] = c.id
  for (const [nome, ch] of [['Medicina Veterinária', 4200], ['Psicologia', 4000], ['Engenharia da Computação', 3600], ['Biomedicina', 3300], ['Enfermagem', 4000], ['Medicina', 7200]] as Array<[string, number]>) {
    if (curso[nome]) continue
    const c = await api('POST', '/edu/academico/programs', { nome, modalidade: 'PRESENCIAL', cargaHorariaTotal: ch })
    if (c?.id) curso[nome] = c.id; else falha(`curso ${nome}`)
  }
  const espExist = lista(await api('GET', '/edu/core/espacos?pageSize=200'))
  const espaco: Record<string, string> = {}
  for (const e of espExist) espaco[e.codigo] = e.id
  const espacos: Array<[string, string, string, number]> = [
    ['LAB-IMG-VET', 'Laboratório de Diagnóstico por Imagem Veterinário', 'LABORATORIO', 20], ['CLIN-PSI', 'Clínica-Escola de Psicologia', 'CLINICA_ESCOLA', 30], ['LAB-INF-2', 'Laboratório de Informática 2', 'LABORATORIO', 30],
    ['LAB-MICRO', 'Laboratório de Microscopia', 'LABORATORIO', 30], ['LAB-SIM', 'Laboratório de Simulação Realística', 'LABORATORIO', 24], ['BLOCO-A', 'Bloco A — Salas de aula', 'SALA_AULA', 200],
    ['BLOCO-C', 'Bloco C — Salas de aula', 'SALA_AULA', 160], ['AUD-1', 'Auditório Principal', 'AUDITORIO', 300], ['BIB-CENTRAL', 'Biblioteca Central', 'BIBLIOTECA', 120],
  ]
  for (const [codigo, nome, tipo, capacidade] of espacos) {
    if (espaco[codigo]) continue
    const e = await api('POST', '/edu/core/espacos', { codigo, nome, tipo, capacidade })
    if (e?.id) espaco[codigo] = e.id; else falha(`espaço ${codigo}`)
  }
  let cats = lista(await api('GET', `${I}/categorias-bem?pageSize=100`))
  const catId = async (codigo: string, nome: string) => {
    let c = cats.find((x: any) => x.codigo === codigo)
    if (!c) { c = await api('POST', `${I}/categorias-bem`, { codigo, nome, vidaUtilMeses: 120, valorResidualPct: 10, grupo: 'LABORATORIO' }); cats = [...cats, c] }
    return c?.id as string
  }
  const cMicro = await catId('MICROSCOPIO', 'Microscópios'), cComp = await catId('COMPUTADOR', 'Computadores e notebooks'), cManeq = await catId('MANEQUIM', 'Manequins e simuladores')
  const cImg = await catId('EQUIP-IMAGEM', 'Equipamentos de diagnóstico por imagem'), cMob = await catId('MOBILIARIO', 'Mobiliário')
  type Req = [string, string, string, any]
  const reqs: Req[] = [
    ['Medicina Veterinária', 'Equipamento de raio-X para diagnóstico veterinário', 'EQUIP-IMAGEM', { quantidadeMinima: 1, obrigatorio: true, referenciaMec: 'Indicador 1.6 — Laboratórios didáticos especializados: qualidade (hospital veterinário-escola)' }],
    ['Medicina Veterinária', 'Microscópios para Patologia e Parasitologia', 'MICROSCOPIO', { quantidadeMinima: 1, porVagas: 3, obrigatorio: true, referenciaMec: 'Indicador 1.6 — Laboratórios didáticos especializados' }],
    ['Psicologia', 'Mobiliário terapêutico da clínica-escola', 'MOBILIARIO', { quantidadeMinima: 12, obrigatorio: true, referenciaMec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde (clínica-escola)', spaceTipo: 'CLINICA_ESCOLA' }],
    ['Engenharia da Computação', 'Computadores do laboratório de programação', 'COMPUTADOR', { quantidadeMinima: 1, porVagas: 1, obrigatorio: true, referenciaMec: 'Indicador 1.6 — Laboratórios didáticos especializados: quantidade' }],
    ['Biomedicina', 'Microscópios binoculares', 'MICROSCOPIO', { quantidadeMinima: 1, porVagas: 2, obrigatorio: true, referenciaMec: 'Indicador 1.6 — Laboratórios didáticos especializados: quantidade' }],
    ['Enfermagem', 'Manequins e simuladores de habilidades', 'MANEQUIM', { quantidadeMinima: 8, obrigatorio: true, referenciaMec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde' }],
    ['Medicina', 'Simuladores de alta fidelidade', 'MANEQUIM', { quantidadeMinima: 6, obrigatorio: true, referenciaMec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde' }],
  ]
  const reqId: Record<string, string> = {}
  for (const [c, descricao, categoriaCodigo, extra] of reqs) {
    if (!curso[c]) continue
    const r = await api('POST', `${I}/requisitos-curso`, { programId: curso[c], descricao, tipo: 'EQUIPAMENTO', categoriaCodigo, ...extra })
    if (r?.id) { reqId[descricao] = r.id; res.requisitos++ } else falha(`requisito ${descricao}`)
  }
  // patrimônio existente (para que a lacuna seja realista: o curso já tem parte do que é exigido)
  const bens: Array<[string, string, string, number, string, number]> = [
    ['Microscópio binocular', cMicro, 'LAB-MICRO', 11, 'BOM', 4200], ['Microscópio de bancada (Parasitologia)', cMicro, 'LAB-IMG-VET', 4, 'REGULAR', 3800],
    ['Notebook i5 16GB', cComp, 'LAB-INF-2', 14, 'BOM', 4600], ['Manequim de RCP adulto', cManeq, 'LAB-SIM', 3, 'REGULAR', 2900], ['Cadeira de atendimento estofada', cMob, 'CLIN-PSI', 5, 'REGULAR', 650],
  ]
  let tomb = 0
  for (const [desc, cid, esp, qtd, estado, valor] of bens) {
    if (!cid || !espaco[esp]) continue
    for (let i = 0; i < qtd; i++) await api('POST', `${I}/bens`, { tombamento: `PLN-DEMO-${String(++tomb).padStart(3, '0')}`, descricao: desc, categoriaId: cid, valorAquisicao: valor, dataAquisicao: dia(-900), spaceId: espaco[esp], estado })
  }
  // ocorrências de manutenção reincidentes (alimentam as sugestões automáticas)
  const bemAr = await api('POST', `${I}/bens`, { tombamento: 'PLN-DEMO-AC1', descricao: 'Ar-condicionado split 36.000 BTU — Laboratório de Informática 2', categoriaId: lista(await api('GET', `${I}/categorias-bem?q=AR-COND`))[0]?.id ?? cComp, valorAquisicao: 7400, dataAquisicao: dia(-3000), spaceId: espaco['LAB-INF-2'], estado: 'RUIM', criticidade: 'ALTA' })
  if (bemAr?.id) for (const t of ['Não gela — compressor', 'Vazamento de água no dreno', 'Ruído e desligamentos']) await api('POST', `${I}/ordens-servico`, { tipo: 'CORRETIVA', titulo: `${t} — ar-condicionado Lab. Inf. 2`, bemId: bemAr.id, spaceId: espaco['LAB-INF-2'], prioridade: 'ALTA' })
  for (const t of ['Infiltração no teto', 'Goteira durante a chuva', 'Mofo na parede norte']) await api('POST', `${I}/ordens-servico`, { tipo: 'CORRETIVA', titulo: `${t} — Bloco C`, spaceId: espaco['BLOCO-C'] })

  // ---------------------------------------------------------------- planos
  const E = (c: string) => curso[c]
  const defs: Def[] = [
    // equipamentos e materiais por curso
    { titulo: 'Aparelho de RX digital para Medicina Veterinária', tipo: 'EQUIPAMENTO', curso: 'Medicina Veterinária', espaco: 'LAB-IMG-VET', prioridade: 'CRITICA', orcamento: 118000, justificativa: 'O hospital veterinário-escola não dispõe de equipamento de raio-X; o diagnóstico por imagem é exigido para o ciclo clínico e para a autorização/reconhecimento do curso.', mec: 'Indicador 1.6 — Laboratórios didáticos especializados (hospital veterinário-escola)', requisito: 'Equipamento de raio-X para diagnóstico veterinário', fim: 120, marcos: [['Projeto de blindagem e licença sanitária', 30], ['Entrega e instalação do equipamento', 90], ['Teste de aceitação e treinamento', 110]], cotacoes: [['RadioVet Brasil', 112500, 60], ['MedImagem Equipamentos', 118000, 45], ['Diagnóstica Imagem Ltda', 121900, 30]], fluxo: 'convertido', destino: 'REQUISICAO' },
    { titulo: 'Divãs e mobiliário terapêutico para a clínica de Psicologia', tipo: 'MATERIAL', curso: 'Psicologia', espaco: 'CLIN-PSI', prioridade: 'ALTA', itens: [{ descricao: 'Divã terapêutico estofado', quantidade: 4, precoEstimado: 1850 }, { descricao: 'Poltrona de atendimento', quantidade: 8, precoEstimado: 980 }, { descricao: 'Mesa de apoio e caixa de brinquedos terapêuticos', quantidade: 6, precoEstimado: 420 }], justificativa: 'A clínica-escola atende em salas improvisadas; o mobiliário adequado é requisito do estágio supervisionado e do indicador de laboratórios de ensino da saúde.', mec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde', requisito: 'Mobiliário terapêutico da clínica-escola', fim: 75, marcos: [['Escolha do fornecedor', 20], ['Entrega e montagem', 60]], cotacoes: [['Móveis Clínicos Aurora', 17420, 30], ['Conforto & Saúde Móveis', 18150, 25], ['Design Terapêutico Ltda', 19300, 35]], fluxo: 'aprovado' },
    { titulo: '30 computadores para o laboratório de Engenharia da Computação', tipo: 'EQUIPAMENTO', curso: 'Engenharia da Computação', espaco: 'LAB-INF-2', prioridade: 'ALTA', orcamento: 138000, itens: [{ descricao: 'Computador i7 32GB + SSD 1TB + monitor 27"', quantidade: 30, precoEstimado: 4600 }], justificativa: 'O PPC prevê turmas de 30 alunos com um posto por aluno; há 14 equipamentos em uso e vários obsoletos para as disciplinas de sistemas embarcados e IA.', mec: 'Indicador 1.6 — Laboratórios didáticos especializados: quantidade', requisito: 'Computadores do laboratório de programação', ano: hoje + 1, inicio: 60, fim: 150, marcos: [['Cotação e escolha', 20], ['Entrega', 100]], cotacoes: [['TechEdu Soluções', 136400, 30], ['InfoSul Distribuidora', 139900, 20], ['Nova Era Informática', 141200, 25]], fluxo: 'coord' },
    { titulo: 'Microscópios binoculares para o curso de Biomedicina', tipo: 'EQUIPAMENTO', curso: 'Biomedicina', espaco: 'LAB-MICRO', prioridade: 'ALTA', itens: [{ descricao: 'Microscópio binocular com objetiva 100x (imersão)', quantidade: 10, precoEstimado: 5200 }], justificativa: 'Proporção exigida de 1 microscópio para cada 2 alunos nas aulas de Histologia, Hematologia e Parasitologia; hoje o laboratório atende 22 vagas com 11 equipamentos.', mec: 'Indicador 1.6 — Laboratórios didáticos especializados: quantidade', requisito: 'Microscópios binoculares', fim: 90, marcos: [['Aprovação e pedido', 15], ['Recebimento e conferência', 70]], cotacoes: [['Óptica Científica Brasil', 51200, 40], ['LabTec Instrumentos', 53000, 30], ['MicroLab Importadora', 55900, 25]], fluxo: 'andamento', executado: 20000 },
    { titulo: 'Simuladores de alta fidelidade para Enfermagem', tipo: 'EQUIPAMENTO', curso: 'Enfermagem', espaco: 'LAB-SIM', prioridade: 'ALTA', itens: [{ descricao: 'Simulador de paciente adulto (sinais vitais)', quantidade: 2, precoEstimado: 42000 }, { descricao: 'Manequim de RCP com feedback', quantidade: 5, precoEstimado: 5800 }], justificativa: 'Laboratório de simulação possui apenas 3 manequins para o mínimo de 8 do checklist; práticas de urgência e emergência dependem de simuladores.', mec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde', requisito: 'Manequins e simuladores de habilidades', ano: hoje + 1, inicio: 90, fim: 200, cotacoes: [['SimuSaúde Educacional', 111900, 60], ['MedTrain Simuladores', 118500, 45], ['Vida Simulação Clínica', 124000, 50]], fluxo: 'enviado' },
    { titulo: 'Simuladores e modelos anatômicos para Medicina (habilidades clínicas)', tipo: 'EQUIPAMENTO', curso: 'Medicina', espaco: 'LAB-SIM', prioridade: 'CRITICA', orcamento: 265000, justificativa: 'Reconhecimento do curso: o laboratório de habilidades exige simuladores de alta fidelidade (mínimo de 6) e modelos para procedimentos; faltam 6.', mec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde', requisito: 'Simuladores de alta fidelidade', ano: hoje + 1, inicio: 120, fim: 260, cotacoes: [['SimuSaúde Educacional', 258000, 90], ['MedTrain Simuladores', 271500, 75]], fluxo: 'enviado' },
    { titulo: 'Ultrassom portátil para o hospital veterinário-escola', tipo: 'EQUIPAMENTO', curso: 'Medicina Veterinária', espaco: 'LAB-IMG-VET', prioridade: 'MEDIA', orcamento: 36000, justificativa: 'Complemento do diagnóstico por imagem para grandes e pequenos animais nas disciplinas de Clínica Médica.', mec: 'Indicador 1.6 — Laboratórios didáticos especializados', ano: hoje + 1, fim: 180, fluxo: 'rascunho' },
    { titulo: 'Armários de segurança e capela de exaustão — Laboratório de Microscopia', tipo: 'EQUIPAMENTO', curso: 'Biomedicina', espaco: 'LAB-MICRO', prioridade: 'ALTA', orcamento: 24500, justificativa: 'Adequação às normas de biossegurança apontadas no relatório da CIPA: armazenamento de reagentes e exaustão.', cotacoes: [['BioSafe Equipamentos', 24100, 40], ['LabInox', 25400, 35], ['CapelaTec', 26800, 45]], fim: 70, fluxo: 'aprovado' },
    // obras: reformas, expansão, pintura
    { titulo: 'Novo prédio de laboratórios de saúde (Bloco D)', tipo: 'EXPANSAO', espaco: 'BLOCO-A', prioridade: 'ALTA', orcamento: 2400000, justificativa: 'Expansão prevista no PDI para comportar o aumento de vagas de Medicina, Enfermagem e Biomedicina e a clínica-escola ampliada.', mec: 'Indicador 1.2 / 1.5 — Espaço de trabalho e salas de aula (adequação ao número de vagas)', ano: hoje + 1, inicio: 150, fim: 700, marcos: [['Projeto executivo e alvarás', 200], ['Fundação e estrutura', 380], ['Alvenaria e cobertura', 520], ['Entrega e habite-se', 690]], cotacoes: [['Construtora Horizonte', 2310000, 0], ['Engenharia Vale Verde', 2420000, 0], ['Bastos & Dias Obras', 2460000, 0]], fluxo: 'enviado' },
    { titulo: 'Ampliação do laboratório de Informática 2 (mais 12 postos)', tipo: 'EXPANSAO', curso: 'Engenharia da Computação', espaco: 'LAB-INF-2', prioridade: 'MEDIA', orcamento: 96000, justificativa: 'Comporta a turma completa de 30 alunos prevista no PPC; hoje a sala só acomoda 18 postos confortavelmente.', ano: hoje + 1, inicio: 40, fim: 120, marcos: [['Projeto elétrico e de rede', 50], ['Obra civil', 90]], cotacoes: [['Construtora Horizonte', 91000, 0], ['Reformas Alfa', 96500, 0], ['Engenharia Vale Verde', 98900, 0]], fluxo: 'aprovado' },
    { titulo: 'Reforma do telhado e das calhas do Bloco C', tipo: 'REFORMA', espaco: 'BLOCO-C', prioridade: 'ALTA', orcamento: 42500, justificativa: 'Três ocorrências corretivas de infiltração em 12 meses; risco de dano ao acervo e de interdição de salas.', inicio: -40, fim: -5, marcos: [['Contratação da empreiteira', -30], ['Substituição das telhas', -12]], cotacoes: [['Coberturas Silva', 41200, 0], ['Reformas Alfa', 43800, 0], ['Telhados Premium', 46500, 0]], fluxo: 'andamento', executado: 29800 },
    { titulo: 'Reforma e adaptação dos banheiros do térreo (acessibilidade)', tipo: 'REFORMA', espaco: 'BLOCO-A', prioridade: 'ALTA', orcamento: 38000, justificativa: 'Adequação à NBR 9050 — exigência de acessibilidade da avaliação in loco.', mec: 'Indicador 1.12 — Condições de acessibilidade para pessoas com deficiência', ano: hoje + 1, inicio: 30, fim: 100, cotacoes: [['Reformas Alfa', 36900, 0], ['Construtora Horizonte', 38800, 0], ['Obras & Acabamentos', 40100, 0]], fluxo: 'coord' },
    { titulo: 'Reforma da Clínica-Escola de Psicologia (salas de atendimento e escuta)', tipo: 'REFORMA', curso: 'Psicologia', espaco: 'CLIN-PSI', prioridade: 'ALTA', orcamento: 72000, justificativa: 'Isolamento acústico, sala de observação com espelho unidirecional e recepção, exigidos para o sigilo do atendimento supervisionado.', mec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde', ano: hoje + 1, inicio: 20, fim: 110, fluxo: 'enviado' },
    { titulo: 'Pintura das fachadas leste e oeste', tipo: 'PINTURA', espaco: 'BLOCO-A', prioridade: 'BAIXA', orcamento: 26000, justificativa: 'Manutenção da conservação do prédio e da imagem institucional para a visita de avaliação.', inicio: 5, fim: 40, cotacoes: [['Pinturas Colorama', 25200, 0], ['Alfa Pinturas', 26900, 0], ['Fachadas & Cia', 27800, 0]], fluxo: 'aprovado' },
    { titulo: 'Pintura das salas de aula do Bloco A', tipo: 'PINTURA', espaco: 'BLOCO-A', prioridade: 'MEDIA', orcamento: 6400, justificativa: 'Desgaste e manchas apontados nas vistorias semestrais.', inicio: -60, fim: -30, fluxo: 'concluido', executado: 6150 },
    { titulo: 'Pintura de sinalização de piso e faixas de segurança (estacionamento e circulação)', tipo: 'PINTURA', prioridade: 'BAIXA', orcamento: 4200, justificativa: 'Demarcação de vagas, faixas de pedestres e rotas de fuga.', ano: hoje + 1, inicio: 15, fim: 30, fluxo: 'rascunho' },
    // reposição de materiais
    { titulo: 'Reposição semestral de reagentes e vidrarias — laboratórios de saúde', tipo: 'REPOSICAO', espaco: 'LAB-MICRO', prioridade: 'MEDIA', itens: [{ descricao: 'Kit de corantes e reagentes de histologia', quantidade: 12, precoEstimado: 380 }, { descricao: 'Lâminas e lamínulas (caixa 50)', quantidade: 80, precoEstimado: 22 }, { descricao: 'Vidraria diversa (bécher, proveta, pipetas)', quantidade: 1, precoEstimado: 2900 }], justificativa: 'Reposição programada para as aulas práticas do semestre.', fim: 45, fluxo: 'aprovado' },
    { titulo: 'Reposição do ar-condicionado do Laboratório de Informática 2', tipo: 'REPOSICAO', curso: 'Engenharia da Computação', espaco: 'LAB-INF-2', prioridade: 'ALTA', orcamento: 9800, justificativa: 'Equipamento com três chamados corretivos recentes e estado ruim; superaquecimento dos computadores do laboratório.', cotacoes: [['ClimaSul Refrigeração', 9200, 0], ['FrioTotal', 9900, 0], ['Ar Ideal Serviços', 10400, 0]], fim: 25, fluxo: 'convertido', destino: 'REQUISICAO' },
    { titulo: 'Reposição de EPIs e jalecos dos laboratórios', tipo: 'REPOSICAO', prioridade: 'MEDIA', orcamento: 5600, justificativa: 'Renovação anual de jalecos, luvas, óculos e máscaras conforme o PGR.', ano: hoje + 1, fim: 60, fluxo: 'rascunho' },
    { titulo: 'Reposição de cadeiras e carteiras do Bloco C', tipo: 'REPOSICAO', espaco: 'BLOCO-C', prioridade: 'BAIXA', orcamento: 21000, justificativa: 'Cerca de 60 carteiras com defeito estrutural identificadas no inventário.', cotacoes: [['Móveis Escolares Pioneiro', 20300, 0]], fluxo: 'reprovado', parecer: 'Aguardar o resultado do inventário completo e reavaliar com três cotações.' },
    // plotagem
    { titulo: 'Plotagem de sinalização de emergência e mapas de risco', tipo: 'PLOTAGEM', prioridade: 'ALTA', itens: [{ descricao: 'Placa fotoluminescente 30x20 cm', quantidade: 90, precoEstimado: 26 }, { descricao: 'Mapa de risco / planta de evacuação A1', quantidade: 14, precoEstimado: 110 }], justificativa: 'Atender ao laudo do corpo de bombeiros (rotas de fuga) e ao PGR.', mec: 'Indicador 1.13 — Segurança e sinalização das instalações', fim: 30, fluxo: 'convertido', destino: 'REQUISICAO' },
    { titulo: 'Plotagem de banners e painéis científicos — Semana Acadêmica', tipo: 'PLOTAGEM', curso: 'Biomedicina', prioridade: 'BAIXA', orcamento: 1800, justificativa: 'Impressão de painéis e banners dos trabalhos dos alunos.', fim: 50, fluxo: 'rascunho' },
    { titulo: 'Plotagem de identidade visual e sinalização interna do Bloco D', tipo: 'PLOTAGEM', prioridade: 'MEDIA', orcamento: 9500, justificativa: 'Sinalização de salas, andares e acessibilidade (braile) do novo prédio.', ano: hoje + 1, inicio: 600, fim: 690, fluxo: 'rascunho' },
    // outros materiais por curso
    { titulo: 'Acervo bibliográfico básico e complementar — Medicina Veterinária', tipo: 'MATERIAL', curso: 'Medicina Veterinária', espaco: 'BIB-CENTRAL', prioridade: 'ALTA', orcamento: 28000, justificativa: 'Atingir a proporção de exemplares por vaga do acervo básico das unidades curriculares.', mec: 'Indicador 1.14 / 1.15 — Bibliografia básica e complementar', fim: 80, cotacoes: [['Livraria Universitária', 27100, 0], ['Distribuidora Saber', 28900, 0], ['Editora Acadêmica', 29500, 0]], fluxo: 'aprovado' },
    { titulo: 'Kit de projeção e som para o Auditório Principal', tipo: 'EQUIPAMENTO', espaco: 'AUD-1', prioridade: 'MEDIA', orcamento: 31000, justificativa: 'Projetor laser e sistema de som para eventos acadêmicos e colação de grau.', ano: hoje + 1, fim: 150, fluxo: 'enviado' },
    { titulo: 'Equipamentos de reabilitação e avaliação neuropsicológica — Psicologia', tipo: 'EQUIPAMENTO', curso: 'Psicologia', espaco: 'CLIN-PSI', prioridade: 'MEDIA', orcamento: 22400, justificativa: 'Testes psicológicos aprovados pelo SATEPSI e materiais de avaliação neuropsicológica para o estágio.', mec: 'Indicador 1.7 — Laboratórios de ensino para a área da saúde', ano: hoje + 1, fim: 140, fluxo: 'rascunho' },
  ]

  const caminho = async (planoId: string, f: Fluxo, d: Def, centroCustoId?: string) => {
    if (f === 'rascunho') return
    const env = await api('POST', `${PL}/planos/${planoId}/enviar`)
    if (!env?.id) { falha(`enviar ${d.titulo}`); return }
    if (f === 'enviado' || !podeAprovar) return
    const dec = async (papel: 'COORDINATOR' | 'BOARD' | 'RECTOR', decisao: 'APROVADO' | 'REPROVADO', parecer: string) => por[papel]!('POST', `${PL}/planos/${planoId}/decidir`, { decisao, parecer })
    let p = await dec('COORDINATOR', f === 'reprovado' ? 'REPROVADO' : 'APROVADO', f === 'reprovado' ? d.parecer || 'Reprovado.' : 'De acordo com a necessidade do curso.')
    if (f === 'reprovado' || f === 'coord') return
    for (let i = 0; i < 2 && p?.status === 'AGUARDANDO_APROVACAO'; i++) {
      const papel = p.etapaAprovacao?.papel as 'BOARD' | 'RECTOR'
      p = await dec(papel, 'APROVADO', papel === 'RECTOR' ? 'Aprovado pela reitoria, conforme o PDI.' : 'Autorizado pela diretoria.')
    }
    if (p?.status !== 'APROVADO') { falha(`aprovação ${d.titulo}: ${p?.status ?? p?.error}`); return }
    if (f === 'aprovado') return
    const cot = (await api('GET', `${PL}/planos/${planoId}`))?.cotacoes ?? []
    const menor = [...cot].sort((a: any, b: any) => a.valor - b.valor)[0]
    if (menor) await api('POST', `${PL}/planos/${planoId}/cotacoes/${menor.id}/escolher`, {})
    const conv = await api('POST', `${PL}/planos/${planoId}/converter`, { destino: d.destino, ...(centroCustoId ? { centroCustoId } : {}) })
    if (conv?.status !== 'CONVERTIDO') { falha(`converter ${d.titulo}: ${conv?.error}`); return }
    res.convertidos++
    if (f === 'convertido') return
    if (d.executado) await api('POST', `${PL}/planos/${planoId}/execucao`, { valor: d.executado })
    if (f === 'concluido') {
      if (d.executado) { /* já lançado */ } else await api('POST', `${PL}/planos/${planoId}/execucao`, { valor: d.orcamento ?? 1 })
      await api('POST', `${PL}/planos/${planoId}/status`, { status: 'CONCLUIDO' })
    }
  }

  // centro de custo para planos institucionais (plotagem sem curso/espaço)
  const ccs = lista(await api('GET', '/edu/financeiro/cost-centers'))
  let centro: string | undefined = ccs[0]?.id

  for (const d of defs) {
    const ano = d.ano ?? hoje
    const body: any = {
      titulo: d.titulo, tipo: d.tipo, prioridade: d.prioridade, anoReferencia: ano, programId: d.curso ? E(d.curso) : undefined, spaceId: d.espaco ? espaco[d.espaco] : undefined,
      justificativa: d.justificativa, indicadorMec: d.mec, orcamentoEstimado: d.orcamento, itens: d.itens, origem: d.requisito ? 'CHECKLIST' : 'MANUAL', requisitoId: d.requisito ? reqId[d.requisito] : undefined,
      inicioPrevisto: d.inicio != null ? dia(d.inicio) : undefined, fimPrevisto: d.fim != null ? dia(d.fim) : undefined,
    }
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k]
    const p = await api('POST', `${PL}/planos`, body)
    if (!p?.id) { falha(`criar "${d.titulo}": ${p?.error}`); continue }
    res.planos++
    for (const [i, [t, off]] of (d.marcos ?? []).entries()) {
      const m = await api('POST', `${PL}/planos/${p.id}/marcos`, { titulo: t, data: dia(off), ordem: i + 1 })
      if (m?.id && off < -20 && d.fluxo !== 'rascunho') await api('POST', `${PL}/marcos/${m.id}/concluir`)
    }
    for (const [forn, valor, prazo] of d.cotacoes ?? []) await api('POST', `${PL}/planos/${p.id}/cotacoes`, { fornecedorNome: forn, valor, prazoDias: prazo || undefined })
    if (!d.curso && !d.espaco && !centro) {
      // plano institucional: precisa de centro de custo na conversão
      const cc = await api('POST', '/edu/financeiro/cost-centers', { nome: 'Infraestrutura e Manutenção' })
      centro = cc?.id
    }
    await caminho(p.id, d.fluxo, d, !d.curso && !d.espaco ? centro : undefined)
  }

  // sugestões automáticas (checklist + manutenção) para a demonstração
  const sg = await api('POST', `${PL}/sugestoes/gerar`, {})
  res.sugestoes = (sg?.criadas ?? 0) + (sg?.atualizadas ?? 0)
  if (!sg || sg.error) falha(`sugestões: ${sg?.error}`)
  return res
}

// execução isolada
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const { prisma } = await import('../../src/lib/prisma')
    const bcrypt = (await import('bcryptjs')).default
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Rode antes o edu-demo-seed (instituição sua-instituicao não encontrada).')
    const login = async (c: { email: string; password: string }) => {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, ...c }) })
      const j: any = await r.json(); if (!r.ok) throw new Error('login: ' + JSON.stringify(j)); return j.token as string
    }
    const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
      const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      return ex ?? prisma.user.create({ data: { clinicId: clinic.id, tenantId: clinic.tenantId, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
    }
    const token = await login({ email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' })
    const api: Api = async (method, path, body) => { const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined }); return r.json().catch(() => null) }
    const failures: string[] = []
    console.log(await seedInfraPlanejamento(api, { tenantId: clinic.tenantId, mk, loginAs: login, failures }))
    failures.forEach((f) => console.log('FALHA', f))
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
