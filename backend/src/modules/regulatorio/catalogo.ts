// Modelos padrão de checklist e indicadores (bootstrap). Baseados nos eixos/dimensões dos instrumentos
// de avaliação do INEP — conferir a redação e os indicadores com o instrumento vigente.
type Dim = 'ORGANIZACAO_DIDATICO_PEDAGOGICA' | 'CORPO_DOCENTE_TUTORIAL' | 'INFRAESTRUTURA' | 'DOCUMENTAL' | 'GESTAO_INSTITUCIONAL'
type Item = { t: string; d?: Dim; o?: boolean; p?: number; dias?: number; role?: string; desc?: string }
export interface ModeloPadrao {
  chave: string
  nome: string
  tipoProcesso?: string
  instrumento: 'INSTITUCIONAL' | 'CURSO_AUTORIZACAO' | 'CURSO_RECONHECIMENTO' | 'CURSO_RENOVACAO' | 'DOCUMENTAL'
  descricao: string
  itens: Item[]
}

const DOC: Dim = 'DOCUMENTAL'
const OD: Dim = 'ORGANIZACAO_DIDATICO_PEDAGOGICA'
const CD: Dim = 'CORPO_DOCENTE_TUTORIAL'
const IN: Dim = 'INFRAESTRUTURA'
const GI: Dim = 'GESTAO_INSTITUCIONAL'

const docsInstitucionais: Item[] = [
  { t: 'Ato constitutivo da mantenedora e alterações registradas', d: DOC, p: 2, dias: 15, role: 'SECRETARY' },
  { t: 'CNPJ e comprovante de inscrição da mantenedora e da mantida', d: DOC, dias: 15, role: 'SECRETARY' },
  { t: 'Certidões de regularidade fiscal (federal, estadual, municipal, FGTS, INSS)', d: DOC, p: 2, dias: 20, role: 'FINANCE', desc: 'Certidões dentro da validade na data do protocolo.' },
  { t: 'Demonstrações financeiras e balanço dos últimos exercícios', d: DOC, p: 2, dias: 20, role: 'FINANCE' },
  { t: 'Comprovante de disponibilidade do imóvel (escritura, matrícula ou contrato de locação)', d: DOC, p: 2, dias: 20, role: 'FACILITIES' },
  { t: 'Regimento Geral / Estatuto atualizado e aprovado pelo órgão colegiado', d: GI, p: 3, dias: 30, role: 'SECRETARY' },
  { t: 'PDI (Plano de Desenvolvimento Institucional) vigente', d: GI, p: 3, dias: 30 },
  { t: 'Projeto Pedagógico Institucional (PPI)', d: OD, p: 2, dias: 30 },
]

export const MODELOS_PADRAO: ModeloPadrao[] = [
  {
    chave: 'credenciamento-ies',
    nome: 'Credenciamento / Recredenciamento institucional',
    tipoProcesso: 'CREDENCIAMENTO',
    instrumento: 'INSTITUCIONAL',
    descricao: 'Documentos e eixos do instrumento de avaliação institucional externa.',
    itens: [
      ...docsInstitucionais,
      { t: 'Relatório de autoavaliação institucional da CPA (todos os ciclos exigidos)', d: GI, p: 3, dias: 30, role: 'COORDINATOR' },
      { t: 'Comprovação das ações da CPA e resultados incorporados ao planejamento', d: GI, dias: 30 },
      { t: 'Políticas de ensino, pesquisa e extensão documentadas e implementadas', d: OD, p: 2, dias: 45 },
      { t: 'Política de atendimento ao discente (nivelamento, acessibilidade, monitoria, ouvidoria)', d: OD, dias: 45 },
      { t: 'Política de acompanhamento de egressos', d: OD, o: false, dias: 45 },
      { t: 'Quadro e plano de carreira do corpo docente e técnico-administrativo', d: CD, p: 2, dias: 45 },
      { t: 'Infraestrutura física: laudos (AVCB/bombeiros, vigilância sanitária, acessibilidade)', d: IN, p: 3, dias: 45, role: 'FACILITIES' },
      { t: 'Biblioteca: acervo, política de atualização e plano de contingência', d: IN, p: 2, dias: 45, role: 'LIBRARIAN' },
      { t: 'Plano de contingência/segurança da informação e acesso a laboratórios de informática', d: IN, dias: 45 },
    ],
  },
  {
    chave: 'autorizacao-curso',
    nome: 'Autorização de curso',
    tipoProcesso: 'AUTORIZACAO_CURSO',
    instrumento: 'CURSO_AUTORIZACAO',
    descricao: 'Requisitos para protocolar a autorização de um novo curso no e-MEC.',
    itens: [
      { t: 'PPC (Projeto Pedagógico do Curso) aprovado, com perfil do egresso, matriz e ementas', d: OD, p: 3, dias: 30, role: 'COORDINATOR' },
      { t: 'Alinhamento do PPC às DCN do curso e à carga horária mínima legal', d: OD, p: 3, dias: 30, role: 'COORDINATOR' },
      { t: 'Portaria de constituição do NDE com titulação e regime de trabalho', d: OD, p: 2, dias: 20, role: 'COORDINATOR' },
      { t: 'Ata de aprovação do PPC pelo colegiado superior', d: DOC, dias: 20, role: 'SECRETARY' },
      { t: 'Justificativa da oferta (demanda regional, número de vagas)', d: OD, dias: 30 },
      { t: 'Coordenador do curso: titulação, experiência e regime de trabalho', d: CD, p: 2, dias: 20 },
      { t: 'Corpo docente previsto (titulação, regime, experiência) e plano de contratação', d: CD, p: 3, dias: 40 },
      { t: 'Estágio supervisionado, TCC e atividades complementares regulamentados', d: OD, dias: 40 },
      { t: 'Salas de aula, gabinetes e espaços de trabalho (descrição e dimensionamento)', d: IN, p: 2, dias: 40, role: 'FACILITIES' },
      { t: 'Laboratórios didáticos de formação básica e específica (lista, normas de uso e segurança)', d: IN, p: 3, dias: 40, role: 'FACILITIES' },
      { t: 'Biblioteca: bibliografia básica e complementar (títulos e exemplares por vaga)', d: IN, p: 3, dias: 40, role: 'LIBRARIAN' },
      { t: 'Comprovante de pagamento da taxa de avaliação', d: DOC, dias: 10, role: 'FINANCE' },
    ],
  },
  {
    chave: 'reconhecimento-curso',
    nome: 'Reconhecimento de curso',
    tipoProcesso: 'RECONHECIMENTO_CURSO',
    instrumento: 'CURSO_RECONHECIMENTO',
    descricao: 'Protocolo entre 50% e 75% da carga horária da 1ª turma, com os três eixos do instrumento de curso.',
    itens: [
      { t: 'Verificar janela legal (50%–75% da carga horária da 1ª turma) e data limite do protocolo', d: DOC, p: 3, dias: 7, role: 'COORDINATOR' },
      { t: 'Ato de autorização do curso vigente', d: DOC, dias: 7 },
      { t: 'PPC atualizado, com a implementação efetiva (matriz cumprida, ajustes pós-NDE)', d: OD, p: 3, dias: 30, role: 'COORDINATOR' },
      { t: 'Atas e relatórios do NDE e do colegiado de curso (acompanhamento do PPC)', d: OD, p: 2, dias: 30, role: 'COORDINATOR' },
      { t: 'Apoio ao discente: nivelamento, monitoria, acessibilidade, intercâmbios (evidências)', d: OD, dias: 30 },
      { t: 'Estágios e atividades práticas: convênios, termos e relatórios', d: OD, p: 2, dias: 30 },
      { t: 'Atividades de extensão curricularizadas (comprovação de 10% da carga horária)', d: OD, p: 2, dias: 30, role: 'COORDINATOR' },
      { t: 'Relatório CPA do curso e ações decorrentes', d: OD, dias: 30 },
      { t: 'Docentes: titulação, regime, experiência e produção científica (currículo Lattes)', d: CD, p: 3, dias: 30 },
      { t: 'Relatório de adequação da formação e experiência do coordenador', d: CD, p: 2, dias: 30 },
      { t: 'Tutores/mediadores (EAD): formação, experiência e relação tutor/aluno', d: CD, o: false, dias: 30 },
      { t: 'Infraestrutura: laboratórios com normas, manutenção e avaliação de qualidade', d: IN, p: 3, dias: 30, role: 'FACILITIES' },
      { t: 'Biblioteca: acervo virtual/físico, plano de atualização, assinatura de bases', d: IN, p: 2, dias: 30, role: 'LIBRARIAN' },
      { t: 'Acessibilidade (rampas, banheiros, sinalização, recursos de tecnologia assistiva)', d: IN, p: 2, dias: 30, role: 'FACILITIES' },
      { t: 'Comprovante de pagamento da taxa', d: DOC, dias: 7, role: 'FINANCE' },
    ],
  },
  {
    chave: 'renovacao-reconhecimento',
    nome: 'Renovação de reconhecimento',
    tipoProcesso: 'RENOVACAO_RECONHECIMENTO',
    instrumento: 'CURSO_RENOVACAO',
    descricao: 'Preparação para o ciclo avaliativo: CPC/ENADE e instrumento de renovação.',
    itens: [
      { t: 'Levantar ato vigente, vencimento e janela de protocolo de renovação', d: DOC, p: 3, dias: 7 },
      { t: 'Analisar CPC/ENADE/IDD do último ciclo e plano de melhoria dos indicadores baixos', d: OD, p: 3, dias: 30, role: 'COORDINATOR' },
      { t: 'Atualizar PPC e matriz conforme DCN e resultados do NDE', d: OD, p: 2, dias: 30, role: 'COORDINATOR' },
      { t: 'Evidências de preparação de alunos para o ENADE (participação, simulados)', d: OD, dias: 30 },
      { t: 'Atualização do corpo docente (titulação e regime) e do NDE', d: CD, p: 3, dias: 30 },
      { t: 'Relatórios de CPA e plano de ação decorrente', d: OD, dias: 30 },
      { t: 'Manutenção e atualização de laboratórios e acervo', d: IN, p: 2, dias: 30 },
      { t: 'Comprovante de pagamento da taxa (quando aplicável)', d: DOC, dias: 7, role: 'FINANCE' },
    ],
  },
  {
    chave: 'aditamento-vagas',
    nome: 'Aditamento: aumento de vagas',
    tipoProcesso: 'ADITAMENTO_VAGAS',
    instrumento: 'DOCUMENTAL',
    descricao: 'Requisitos para solicitar ampliação de vagas autorizadas.',
    itens: [
      { t: 'Justificativa de demanda e relatório de evasão/ocupação das vagas atuais', d: DOC, p: 2, dias: 15 },
      { t: 'Projeção de docentes e NDE para o novo número de vagas', d: CD, p: 2, dias: 20 },
      { t: 'Dimensionamento de salas, laboratórios e acervo por vaga', d: IN, p: 3, dias: 20, role: 'FACILITIES' },
      { t: 'Ato de autorização/reconhecimento vigente do curso', d: DOC, dias: 5 },
    ],
  },
  {
    chave: 'aditamento-endereco',
    nome: 'Aditamento: mudança de endereço',
    tipoProcesso: 'ADITAMENTO_ENDERECO',
    instrumento: 'DOCUMENTAL',
    descricao: 'Mudança de endereço de funcionamento / unidade.',
    itens: [
      { t: 'Comprovante de disponibilidade do novo imóvel', d: DOC, p: 2, dias: 15, role: 'FACILITIES' },
      { t: 'Laudos de segurança, AVCB e acessibilidade do novo endereço', d: IN, p: 3, dias: 20, role: 'FACILITIES' },
      { t: 'Plano de transferência de alunos, acervo e laboratórios', d: GI, p: 2, dias: 20 },
    ],
  },
  {
    chave: 'aditamento-polo-ead',
    nome: 'Aditamento: novo polo EAD',
    tipoProcesso: 'ADITAMENTO_POLO_EAD',
    instrumento: 'DOCUMENTAL',
    descricao: 'Credenciamento de polo de apoio presencial.',
    itens: [
      { t: 'Contrato/convênio com o polo e responsável local', d: DOC, p: 2, dias: 15 },
      { t: 'Comprovação do imóvel, laudos e acessibilidade do polo', d: IN, p: 3, dias: 20 },
      { t: 'Laboratórios, biblioteca e infraestrutura de tecnologia do polo', d: IN, p: 3, dias: 25 },
      { t: 'Equipe de tutoria presencial e processo de capacitação', d: CD, p: 2, dias: 25 },
    ],
  },
  {
    chave: 'transferencia-mantenca',
    nome: 'Transferência de mantença',
    tipoProcesso: 'TRANSFERENCIA_MANTENCA',
    instrumento: 'DOCUMENTAL',
    descricao: 'Troca da mantenedora da IES.',
    itens: [
      { t: 'Contrato/instrumento de transferência assinado e registrado', d: DOC, p: 3, dias: 15 },
      { t: 'Documentos societários e fiscais da nova mantenedora', d: DOC, p: 2, dias: 15 },
      { t: 'Comprovação de capacidade econômico-financeira da nova mantenedora', d: DOC, p: 3, dias: 20, role: 'FINANCE' },
      { t: 'Plano de continuidade acadêmica e garantias aos discentes', d: GI, p: 2, dias: 20 },
    ],
  },
]

// Indicadores de autoavaliação (síntese por dimensão). Códigos próprios — não substituem o instrumento oficial.
export const INDICADORES_PADRAO: Array<{ instrumento: 'INSTITUCIONAL' | 'CURSO_RECONHECIMENTO'; dimensao: Dim; codigo: string; nome: string }> = [
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.1', nome: 'Contexto educacional e demanda' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.2', nome: 'Políticas institucionais no âmbito do curso' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.3', nome: 'Objetivos do curso e perfil profissional do egresso' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.4', nome: 'Estrutura curricular e conteúdos curriculares' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.5', nome: 'Metodologia, estágio, TCC e atividades complementares' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.6', nome: 'Apoio ao discente e acessibilidade metodológica' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.7', nome: 'Atividades de extensão e curricularização' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: OD, codigo: '1.8', nome: 'Sistema de avaliação do processo ensino-aprendizagem' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: CD, codigo: '2.1', nome: 'Núcleo Docente Estruturante (NDE)' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: CD, codigo: '2.2', nome: 'Atuação e regime de trabalho do coordenador' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: CD, codigo: '2.3', nome: 'Titulação e experiência do corpo docente' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: CD, codigo: '2.4', nome: 'Regime de trabalho do corpo docente' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: CD, codigo: '2.5', nome: 'Produção científica, cultural, artística ou tecnológica' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: IN, codigo: '3.1', nome: 'Salas de aula, gabinetes e espaços de trabalho' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: IN, codigo: '3.2', nome: 'Laboratórios didáticos de formação básica e específica' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: IN, codigo: '3.3', nome: 'Biblioteca: bibliografia básica e complementar' },
  { instrumento: 'CURSO_RECONHECIMENTO', dimensao: IN, codigo: '3.4', nome: 'Comitê de ética, TIC e acessibilidade' },
  { instrumento: 'INSTITUCIONAL', dimensao: GI, codigo: 'E1', nome: 'Eixo 1 — Planejamento e avaliação institucional' },
  { instrumento: 'INSTITUCIONAL', dimensao: OD, codigo: 'E2', nome: 'Eixo 2 — Desenvolvimento institucional' },
  { instrumento: 'INSTITUCIONAL', dimensao: OD, codigo: 'E3', nome: 'Eixo 3 — Políticas acadêmicas' },
  { instrumento: 'INSTITUCIONAL', dimensao: GI, codigo: 'E4', nome: 'Eixo 4 — Políticas de gestão' },
  { instrumento: 'INSTITUCIONAL', dimensao: IN, codigo: 'E5', nome: 'Eixo 5 — Infraestrutura' },
]
