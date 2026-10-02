import { Condicao, Grafo, ItemChecklist, LembreteConfig, NoDef, NoTipo, TransDef } from './engine'

// ===================================================================
// Templates PADRÃO de jornadas (bootstrap). DSL compacta -> Grafo.
// Sem `n` (next), o nó segue para o próximo da lista. Condicional:
//   ['destino', 'rótulo', campo, op, valor]   |   'destino'
// ===================================================================

type Seta = string | [string, string] | [string, string, string, string, unknown?]
interface D {
  k: string
  t: string
  tipo?: NoTipo
  p?: string               // papel responsável
  sla?: number
  f?: string               // fase
  m?: string               // módulo destino
  r?: string               // rota frontend
  ev?: string              // evento aguardado
  chk?: string[]
  docs?: string[]
  n?: Seta[]
  d?: string               // descrição
  rec?: number             // recorrência (dias) do lembrete
  esc?: string             // papel do escalonamento nível 1
}
export interface TemplatePadrao { chave: string; nome: string; persona: string; descricao: string; grafo: Grafo }

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
const itens = (a?: string[]): ItemChecklist[] | null => (a?.length ? a.map((t) => ({ chave: slug(t), titulo: t, obrigatorio: true })) : null)

const ESCALA: Record<string, string> = {
  STUDENT: 'SECRETARY', TEACHER: 'COORDINATOR', COORDINATOR: 'RECTOR', BOARD: 'RECTOR', RECTOR: 'ADMIN',
}

function lembreteDe(d: D): LembreteConfig | null {
  if (d.sla == null) return null
  const ante = d.sla <= 3 ? 1 : d.sla <= 10 ? 2 : d.sla <= 30 ? 5 : 10
  return {
    antecedenciaDias: ante,
    recorrenciaDias: d.rec ?? (d.sla > 30 ? 15 : undefined),
    escalarPara: d.esc ?? ESCALA[d.p ?? ''] ?? 'COORDINATOR',
    escalarAposDias: d.sla > 30 ? 15 : 7,
    escalarPara2: 'RECTOR',
  }
}

function montar(defs: D[], fases?: Record<string, string>): Grafo {
  const nos: NoDef[] = []
  const transicoes: TransDef[] = []
  defs.forEach((d, i) => {
    const tipo: NoTipo = d.tipo ?? 'TAREFA'
    nos.push({
      chave: d.k, titulo: d.t, descricao: d.d ?? null, tipo, papel: d.p ?? null, slaDias: d.sla ?? null,
      checklist: itens(d.chk), documentos: itens(d.docs), modulo: d.m ?? null, rota: d.r ?? null, evento: d.ev ?? null,
      lembrete: ['TAREFA', 'APROVACAO', 'ESPERA_EVENTO'].includes(tipo) ? lembreteDe(d) : null, fase: d.f ?? fases?.[d.k] ?? null, ordem: i,
    })
    if (tipo === 'FIM') return
    const setas: Seta[] = d.n ?? (defs[i + 1] ? [defs[i + 1].k] : [])
    setas.forEach((s, j) => {
      if (typeof s === 'string') transicoes.push({ deChave: d.k, paraChave: s, prioridade: 100 + j })
      else {
        const [para, rotulo, campo, op, valor] = s
        if (!campo) { transicoes.push({ deChave: d.k, paraChave: para, rotulo, prioridade: 100 + j }); return }
        transicoes.push({ deChave: d.k, paraChave: para, rotulo, condicao: { campo, op, valor } as Condicao, prioridade: j })
      }
    })
  })
  return { nos, transicoes }
}
// atalho: condição na aprovação/gateway
const rej = (para: string): Seta => [para, 'Reprovado', 'decisao', 'eq', 'REJEITADO']
const ok = (para: string): Seta => para

// ----------------------------------------------------------------- ALUNO
const ALUNO: D[] = [
  { k: 'inicio', t: 'Interesse do futuro aluno', tipo: 'INICIO', f: 'Ingresso' },
  { k: 'captacao', t: 'Captação e atendimento do lead', p: 'MARKETING', sla: 7, m: 'admissoes', r: '/admissoes/leads', f: 'Ingresso', chk: ['Primeiro contato realizado', 'Curso de interesse registrado', 'Visita/aula experimental oferecida'] },
  { k: 'inscricao', t: 'Inscrição no processo seletivo', p: 'ADMISSIONS', sla: 3, m: 'admissoes', r: '/admissoes/inscricoes', f: 'Ingresso', chk: ['Dados cadastrais conferidos', 'Forma de ingresso definida (vestibular, ENEM, transferência, 2ª graduação)', 'Taxa de inscrição quitada ou isenta'] },
  { k: 'prova', t: 'Prova / avaliação de ingresso', tipo: 'ESPERA_EVENTO', p: 'ADMISSIONS', sla: 30, ev: 'admissoes.prova_realizada', m: 'admissoes', r: '/admissoes/provas', f: 'Ingresso', d: 'Aguarda a realização da prova, redação ou análise de histórico/nota ENEM.' },
  { k: 'resultado', t: 'Apuração e divulgação do resultado', p: 'ADMISSIONS', sla: 5, m: 'admissoes', r: '/admissoes/resultados', f: 'Ingresso', chk: ['Classificação publicada', 'Candidato notificado'] },
  { k: 'gw_aprovado', t: 'Candidato aprovado?', tipo: 'GATEWAY', f: 'Ingresso', n: [['fim_nao_aprovado', 'Não aprovado', 'aprovado', 'eq', false], 'convocacao'] },
  { k: 'convocacao', t: 'Convocação e proposta de matrícula', p: 'ADMISSIONS', sla: 2, m: 'admissoes', r: '/admissoes/convocacoes', f: 'Matrícula', chk: ['Candidato convocado', 'Condições comerciais e bolsas apresentadas'] },
  { k: 'matricula', t: 'Matrícula e contrato educacional', p: 'SECRETARY', sla: 5, m: 'secretaria', r: '/secretaria/matriculas', f: 'Matrícula', chk: ['RA gerado', 'Turma/período definidos', 'Contrato educacional assinado'] },
  { k: 'pagamento_1a', t: 'Pagamento da 1ª parcela / financiamento', p: 'FINANCE', sla: 5, m: 'financeiro', r: '/financeiro/mensalidades', f: 'Matrícula', chk: ['Boleto/PIX da 1ª parcela emitido', 'Pagamento confirmado ou bolsa/FIES/ProUni aprovado'] },
  { k: 'documentos', t: 'Entrega de documentos de matrícula', p: 'STUDENT', sla: 15, m: 'secretaria', r: '/secretaria/documentos', f: 'Matrícula', docs: ['RG', 'CPF', 'Histórico escolar do ensino médio', 'Certificado de conclusão', 'Certidão de nascimento ou casamento', 'Comprovante de residência', 'Foto 3x4'], rec: 5 },
  { k: 'conferencia_docs', t: 'Conferência documental', tipo: 'APROVACAO', p: 'SECRETARY', sla: 5, m: 'secretaria', r: '/secretaria/documentos', f: 'Matrícula', n: [rej('documentos'), ok('marco_matriculado')], d: 'Aprovar a documentação ou devolver ao aluno com a lista de pendências.' },
  { k: 'marco_matriculado', t: 'Matrícula efetivada', tipo: 'MARCO', f: 'Matrícula' },
  { k: 'acesso_ava', t: 'E-mail institucional e acesso ao AVA', p: 'SUPPORT', sla: 3, m: 'conteudo', r: '/suporte/acessos', f: 'Integração', chk: ['E-mail institucional criado', 'Acesso ao AVA e portal do aluno liberado'] },
  { k: 'integracao', t: 'Integração e acolhimento de calouros', p: 'COORDINATOR', sla: 7, m: 'academico', r: '/academico/integracao', f: 'Integração', chk: ['Recepção/aula inaugural realizada', 'Apresentação do PPC e do calendário', 'Tour pelo campus e biblioteca'] },
  { k: 'frequencia', t: 'Acompanhamento de frequência e evasão', p: 'COORDINATOR', sla: 90, m: 'academico', r: '/academico/frequencia', f: 'Cursando', rec: 15, chk: ['Frequência conferida mensalmente', 'Alunos em risco contatados'] },
  { k: 'notas', t: 'Avaliações e lançamento de notas', p: 'TEACHER', sla: 120, m: 'notas', r: '/notas/diario', f: 'Cursando', rec: 15, chk: ['Notas das avaliações lançadas', 'Recuperação aplicada quando necessário'] },
  { k: 'fechamento', t: 'Fechamento do período letivo', p: 'SECRETARY', sla: 15, m: 'secretaria', r: '/secretaria/fechamento', f: 'Cursando', chk: ['Diários fechados', 'Resultado do período apurado (aprovado/reprovado/DP)'] },
  { k: 'gw_situacao', t: 'Situação ao fim do período', tipo: 'GATEWAY', f: 'Cursando', n: [['plano_dp', 'Dependência', 'situacao', 'eq', 'DEPENDENCIA'], ['fim_evasao', 'Evasão/cancelamento', 'situacao', 'in', ['EVADIDO', 'CANCELADO']], 'rematricula'] },
  { k: 'plano_dp', t: 'Plano de dependência / adaptação', p: 'COORDINATOR', sla: 10, m: 'academico', r: '/academico/dependencias', f: 'Cursando', n: ['rematricula'] },
  { k: 'rematricula', t: 'Rematrícula semestral', p: 'STUDENT', sla: 20, m: 'secretaria', r: '/secretaria/rematricula', f: 'Rematrícula', chk: ['Disciplinas do próximo período confirmadas', 'Contrato do semestre aceito'], rec: 5 },
  { k: 'adimplencia', t: 'Verificação de adimplência', tipo: 'APROVACAO', p: 'FINANCE', sla: 5, m: 'financeiro', r: '/financeiro/inadimplencia', f: 'Rematrícula', n: [rej('negociacao'), ok('gw_ultimo')] },
  { k: 'negociacao', t: 'Negociação financeira', p: 'FINANCE', sla: 7, m: 'financeiro', r: '/financeiro/negociacao', f: 'Rematrícula', n: ['adimplencia'] },
  { k: 'gw_ultimo', t: 'Último período do curso?', tipo: 'GATEWAY', f: 'Rematrícula', n: [['estagio', 'Sim', 'ultimoPeriodo', 'eq', true], ['frequencia', 'Próximo período']] },
  { k: 'estagio', t: 'Estágio supervisionado', p: 'COORDINATOR', sla: 180, m: 'academico', r: '/academico/estagios', f: 'Conclusão', docs: ['Termo de compromisso de estágio', 'Relatório final de estágio'], chk: ['Horas mínimas cumpridas', 'Relatório avaliado pelo supervisor'] },
  { k: 'tcc', t: 'TCC: orientação e banca', p: 'TEACHER', sla: 120, m: 'academico', r: '/academico/tcc', f: 'Conclusão', chk: ['Orientador definido', 'Banca realizada e ata assinada', 'Versão final depositada na biblioteca'] },
  { k: 'gw_enade', t: 'Estudante habilitado ao ENADE?', tipo: 'GATEWAY', f: 'Conclusão', n: [['enade_inscricao', 'Habilitado', 'enadeObrigatorio', 'eq', true], 'auditoria'] },
  { k: 'enade_inscricao', t: 'Inscrição/regularização no ENADE', p: 'SECRETARY', sla: 30, m: 'regulatorio', r: '/regulatorio/enade', f: 'Conclusão', chk: ['Estudante inscrito no sistema do INEP', 'Aluno orientado sobre local e data'] },
  { k: 'enade_prova', t: 'Aguardando realização do ENADE', tipo: 'ESPERA_EVENTO', p: 'SECRETARY', sla: 90, ev: 'regulatorio.enade_realizado', m: 'regulatorio', r: '/regulatorio/enade', f: 'Conclusão' },
  { k: 'auditoria', t: 'Auditoria de integralização curricular', tipo: 'APROVACAO', p: 'SECRETARY', sla: 15, m: 'secretaria', r: '/secretaria/integralizacao', f: 'Conclusão', n: [rej('regularizar'), ok('nada_consta_bib')], d: 'Disciplinas, horas complementares, estágio, TCC e ENADE.' },
  { k: 'regularizar', t: 'Regularização de pendências acadêmicas', p: 'STUDENT', sla: 30, m: 'secretaria', r: '/secretaria/pendencias', f: 'Conclusão', n: ['auditoria'] },
  { k: 'nada_consta_bib', t: 'Nada consta da biblioteca', p: 'LIBRARIAN', sla: 5, m: 'biblioteca', r: '/biblioteca/nada-consta', f: 'Conclusão', n: ['nada_consta_fin'] },
  { k: 'nada_consta_fin', t: 'Nada consta financeiro', p: 'FINANCE', sla: 5, m: 'financeiro', r: '/financeiro/nada-consta', f: 'Conclusão' },
  { k: 'colacao', t: 'Colação de grau', p: 'SECRETARY', sla: 30, m: 'secretaria', r: '/secretaria/colacao', f: 'Conclusão', chk: ['Data da colação definida', 'Ata de colação assinada'] },
  { k: 'diploma', t: 'Expedição e registro do diploma', p: 'SECRETARY', sla: 60, m: 'secretaria', r: '/secretaria/diplomas', f: 'Diploma', chk: ['Diploma digital emitido', 'Registro realizado', 'Diploma publicado/entregue ao aluno'] },
  { k: 'marco_egresso', t: 'Aluno concluinte tornou-se egresso', tipo: 'MARCO', f: 'Egresso' },
  { k: 'fim_concluido', t: 'Jornada do aluno concluída', tipo: 'FIM', f: 'Egresso' },
  { k: 'fim_nao_aprovado', t: 'Encerrada: candidato não aprovado', tipo: 'FIM', f: 'Ingresso' },
  { k: 'fim_evasao', t: 'Encerrada: evasão/cancelamento', tipo: 'FIM', f: 'Cursando' },
]

// ------------------------------------------------------------- CANDIDATO
const CANDIDATO: D[] = [
  { k: 'inicio', t: 'Candidato captado', tipo: 'INICIO' },
  { k: 'contato', t: 'Primeiro contato (até 1 dia útil)', p: 'ADMISSIONS', sla: 1, m: 'admissoes', r: '/admissoes/leads', chk: ['Contato por WhatsApp/telefone realizado', 'Interesse e curso registrados'] },
  { k: 'visita', t: 'Visita guiada / aula experimental', p: 'ADMISSIONS', sla: 7, m: 'admissoes', r: '/admissoes/agenda' },
  { k: 'inscricao', t: 'Inscrição no processo seletivo', p: 'ADMISSIONS', sla: 5, m: 'admissoes', r: '/admissoes/inscricoes', docs: ['Documento de identidade', 'CPF'] },
  { k: 'prova', t: 'Aguardando prova / análise de nota', tipo: 'ESPERA_EVENTO', p: 'ADMISSIONS', sla: 30, ev: 'admissoes.prova_realizada' },
  { k: 'resultado', t: 'Resultado do processo seletivo', p: 'ADMISSIONS', sla: 5, m: 'admissoes', r: '/admissoes/resultados' },
  { k: 'gw_aprovado', t: 'Aprovado?', tipo: 'GATEWAY', n: [['reengajamento', 'Não aprovado', 'aprovado', 'eq', false], 'proposta'] },
  { k: 'proposta', t: 'Proposta comercial e bolsas', p: 'ADMISSIONS', sla: 3, m: 'admissoes', r: '/admissoes/propostas' },
  { k: 'aprovacao_desconto', t: 'Aprovação de desconto/bolsa', tipo: 'APROVACAO', p: 'FINANCE', sla: 2, m: 'financeiro', r: '/financeiro/bolsas', n: [rej('proposta'), ok('gw_decisao')] },
  { k: 'gw_decisao', t: 'Candidato decidiu matricular?', tipo: 'GATEWAY', n: [['reengajamento', 'Não', 'matricular', 'eq', false], 'matricula'] },
  { k: 'matricula', t: 'Matrícula', p: 'SECRETARY', sla: 5, m: 'secretaria', r: '/secretaria/matriculas', chk: ['Contrato assinado', 'Primeira parcela paga'] },
  { k: 'marco_matriculado', t: 'Candidato convertido em aluno', tipo: 'MARCO' },
  { k: 'fim_matriculado', t: 'Concluída: matriculado', tipo: 'FIM' },
  { k: 'reengajamento', t: 'Reengajamento (cadência de follow-up)', p: 'MARKETING', sla: 15, m: 'admissoes', r: '/admissoes/leads', n: ['fim_perdido'] },
  { k: 'fim_perdido', t: 'Encerrada: candidato não convertido', tipo: 'FIM' },
]

// ------------------------------------------------------------- PROFESSOR
const PROFESSOR: D[] = [
  { k: 'inicio', t: 'Necessidade de docente identificada', tipo: 'INICIO', f: 'Recrutamento' },
  { k: 'requisicao', t: 'Requisição de vaga docente', p: 'COORDINATOR', sla: 5, m: 'desempenho', r: '/rh/vagas', f: 'Recrutamento', chk: ['Disciplinas e carga horária definidas', 'Titulação mínima definida', 'Justificativa orçamentária'] },
  { k: 'aprovacao_vaga', t: 'Aprovação da vaga', tipo: 'APROVACAO', p: 'BOARD', sla: 7, f: 'Recrutamento', n: [rej('fim_vaga_negada'), ok('divulgacao')] },
  { k: 'divulgacao', t: 'Divulgação da vaga / edital', p: 'MARKETING', sla: 10, f: 'Recrutamento' },
  { k: 'triagem', t: 'Triagem de currículos (Lattes)', p: 'STAFF', sla: 10, f: 'Recrutamento', chk: ['Titulação verificada', 'Lattes analisado'] },
  { k: 'entrevista', t: 'Entrevista e aula teste', p: 'COORDINATOR', sla: 10, f: 'Recrutamento', chk: ['Entrevista realizada', 'Aula teste avaliada'] },
  { k: 'gw_candidato', t: 'Candidato selecionado?', tipo: 'GATEWAY', f: 'Recrutamento', n: [['triagem', 'Nenhum aprovado', 'selecionado', 'eq', false], 'proposta'] },
  { k: 'proposta', t: 'Proposta e aceite', p: 'STAFF', sla: 5, f: 'Contratação' },
  { k: 'docs_contratacao', t: 'Documentos de contratação', p: 'STAFF', sla: 7, f: 'Contratação', docs: ['Diploma de graduação/pós-graduação', 'Currículo Lattes', 'CTPS ou dados de PJ', 'ASO (exame admissional)', 'Comprovante de residência', 'Dados bancários'] },
  { k: 'contrato', t: 'Contrato de trabalho e eSocial', p: 'STAFF', sla: 3, f: 'Contratação', chk: ['Contrato assinado', 'Evento eSocial enviado'] },
  { k: 'onboarding', t: 'Integração institucional', p: 'COORDINATOR', sla: 7, f: 'Onboarding', chk: ['Apresentação da missão, PPC e regimento', 'Apresentação da equipe', 'Visita aos laboratórios'] },
  { k: 'cadastro_sistema', t: 'Cadastro no sistema, e-mail e AVA', p: 'SUPPORT', sla: 3, f: 'Onboarding', m: 'academico', r: '/academico/professores' },
  { k: 'capacitacao', t: 'Capacitação docente (metodologias, AVA, avaliação)', p: 'COORDINATOR', sla: 30, f: 'Onboarding' },
  { k: 'planejamento', t: 'Planejamento semestral: planos de ensino', p: 'TEACHER', sla: 15, f: 'Ciclo semestral', m: 'conteudo', r: '/conteudo/planos-ensino', chk: ['Plano de ensino cadastrado', 'Bibliografia conferida com a biblioteca', 'Cronograma de avaliações definido'] },
  { k: 'aprovacao_planos', t: 'Aprovação dos planos de ensino', tipo: 'APROVACAO', p: 'COORDINATOR', sla: 7, f: 'Ciclo semestral', n: [rej('planejamento'), ok('diario')] },
  { k: 'diario', t: 'Diário de classe: aulas e frequência', p: 'TEACHER', sla: 120, f: 'Ciclo semestral', m: 'notas', r: '/notas/diario', rec: 15, chk: ['Frequência lançada em dia', 'Conteúdo ministrado registrado'] },
  { k: 'notas', t: 'Lançamento e fechamento de notas', p: 'TEACHER', sla: 10, f: 'Ciclo semestral', m: 'notas', r: '/notas/lancamento', chk: ['Notas lançadas', 'Recuperação lançada', 'Diário fechado'] },
  { k: 'avaliacao', t: 'Avaliação docente (alunos, coordenação, CPA)', p: 'COORDINATOR', sla: 15, f: 'Desenvolvimento', m: 'desempenho', r: '/desempenho/avaliacao-docente' },
  { k: 'gw_ciclo', t: 'Próximo passo do ciclo docente', tipo: 'GATEWAY', f: 'Desenvolvimento', n: [['fim_desligado', 'Desligamento', 'desligado', 'eq', true], ['progressao', 'Elegível à progressão', 'elegivelProgressao', 'eq', true], ['planejamento', 'Novo semestre']] },
  { k: 'progressao', t: 'Pedido de progressão de carreira', p: 'TEACHER', sla: 20, f: 'Desenvolvimento', docs: ['Relatório de atividades', 'Comprovantes de titulação/produção'] },
  { k: 'comissao', t: 'Comissão de avaliação da progressão', tipo: 'APROVACAO', p: 'BOARD', sla: 30, f: 'Desenvolvimento', n: [rej('planejamento'), ok('marco_progressao')] },
  { k: 'marco_progressao', t: 'Progressão concedida', tipo: 'MARCO', f: 'Desenvolvimento', n: ['planejamento'] },
  { k: 'fim_vaga_negada', t: 'Encerrada: vaga não aprovada', tipo: 'FIM' },
  { k: 'fim_desligado', t: 'Encerrada: docente desligado', tipo: 'FIM' },
]

// ----------------------------------------------------------- COORDENADOR
const COORDENADOR: D[] = [
  { k: 'inicio', t: 'Início do ciclo do curso', tipo: 'INICIO' },
  { k: 'ppc_nde', t: 'Revisão do PPC com o NDE', p: 'COORDINATOR', sla: 30, f: 'Projeto pedagógico', m: 'academico', r: '/academico/ppc', chk: ['Reunião do NDE realizada', 'Ata registrada', 'Ajustes de matriz definidos'] },
  { k: 'aprov_colegiado', t: 'Aprovação no colegiado de curso', tipo: 'APROVACAO', p: 'BOARD', sla: 15, f: 'Projeto pedagógico', m: 'governanca', r: '/governanca/reunioes', n: [rej('ppc_nde'), ok('oferta')] },
  { k: 'oferta', t: 'Oferta de disciplinas e vagas', p: 'COORDINATOR', sla: 20, f: 'Oferta', m: 'academico', r: '/academico/ofertas' },
  { k: 'alocacao_docentes', t: 'Alocação de docentes', p: 'COORDINATOR', sla: 15, f: 'Oferta', m: 'academico', r: '/academico/turmas', chk: ['Docente titular de cada turma', 'Carga horária conferida'] },
  { k: 'horarios', t: 'Horários e salas', p: 'COORDINATOR', sla: 10, f: 'Oferta', m: 'calendario', r: '/calendario/horarios', chk: ['Choques de horário resolvidos', 'Espaços reservados'] },
  { k: 'publicacao', t: 'Publicação de horários e calendário', p: 'SECRETARY', sla: 5, f: 'Oferta', m: 'calendario', r: '/calendario' },
  { k: 'marco_inicio', t: 'Início do semestre', tipo: 'MARCO', f: 'Acompanhamento' },
  { k: 'acomp_freq', t: 'Acompanhamento de frequência e evasão', p: 'COORDINATOR', sla: 30, f: 'Acompanhamento', m: 'academico', r: '/academico/frequencia', rec: 7, chk: ['Alunos com baixa frequência contatados', 'Plano de retenção registrado'] },
  { k: 'acomp_notas', t: 'Acompanhamento de diários e notas', p: 'COORDINATOR', sla: 60, f: 'Acompanhamento', m: 'notas', r: '/notas/acompanhamento' },
  { k: 'reuniao_nde', t: 'Reunião periódica do NDE', p: 'COORDINATOR', sla: 30, f: 'Acompanhamento', m: 'governanca', r: '/governanca/reunioes' },
  { k: 'regulatorio', t: 'Dados regulatórios do curso (e-MEC, Censo)', p: 'COORDINATOR', sla: 30, f: 'Regulatório', m: 'regulatorio', r: '/regulatorio/cursos', chk: ['Dados no e-MEC conferidos', 'Prazos de renovação de reconhecimento verificados', 'Censo da Educação Superior preenchido'] },
  { k: 'gw_enade', t: 'Curso no ciclo ENADE?', tipo: 'GATEWAY', f: 'Regulatório', n: [['enade_prep', 'Sim', 'cicloEnade', 'eq', true], 'relatorio'] },
  { k: 'enade_prep', t: 'Preparação para o ENADE', p: 'COORDINATOR', sla: 60, f: 'Regulatório', m: 'regulatorio', r: '/regulatorio/enade', chk: ['Lista de habilitados conferida', 'Simulado aplicado'] },
  { k: 'enade_resultado', t: 'Análise do conceito ENADE/CPC', p: 'COORDINATOR', sla: 45, f: 'Regulatório', m: 'regulatorio', r: '/regulatorio/enade' },
  { k: 'relatorio', t: 'Relatório semestral do curso (indicadores)', p: 'COORDINATOR', sla: 15, f: 'Relatórios', m: 'desempenho', r: '/desempenho/relatorios', chk: ['Evasão/retenção', 'Desempenho discente', 'Avaliação docente', 'Plano de ação'] },
  { k: 'aprov_relatorio', t: 'Validação do relatório pela direção', tipo: 'APROVACAO', p: 'RECTOR', sla: 10, f: 'Relatórios', n: [rej('relatorio'), ok('gw_ciclo')] },
  { k: 'gw_ciclo', t: 'Continuar ciclo do curso?', tipo: 'GATEWAY', f: 'Relatórios', n: [['fim_ciclo', 'Encerrar', 'encerrarCiclo', 'eq', true], ['oferta', 'Novo semestre']] },
  { k: 'fim_ciclo', t: 'Ciclo do curso encerrado', tipo: 'FIM' },
]

// ----------------------------------------------------------- FUNCIONARIO
const FUNCIONARIO: D[] = [
  { k: 'inicio', t: 'Necessidade de contratação', tipo: 'INICIO' },
  { k: 'requisicao', t: 'Requisição de pessoal', p: 'COORDINATOR', sla: 5, f: 'Admissão' },
  { k: 'aprov_admissao', t: 'Aprovação da admissão', tipo: 'APROVACAO', p: 'BOARD', sla: 5, f: 'Admissão', n: [rej('fim_nao_admitido'), ok('exames')] },
  { k: 'exames', t: 'Exames admissionais (ASO)', p: 'STAFF', sla: 7, f: 'Admissão' },
  { k: 'docs', t: 'Documentos de admissão', p: 'STAFF', sla: 7, f: 'Admissão', docs: ['RG e CPF', 'CTPS digital', 'Comprovante de residência', 'Título de eleitor', 'Dados bancários', 'Certidão de dependentes'] },
  { k: 'contrato', t: 'Contrato e eSocial', p: 'STAFF', sla: 3, f: 'Admissão', chk: ['Registro realizado', 'Evento eSocial enviado'] },
  { k: 'onboarding', t: 'Integração e entrega de crachá/equipamentos', p: 'STAFF', sla: 5, f: 'Onboarding', chk: ['Crachá entregue', 'Equipamentos entregues', 'Apresentação à equipe'] },
  { k: 'acessos', t: 'Acessos a sistemas e e-mail', p: 'SUPPORT', sla: 2, f: 'Onboarding' },
  { k: 'treinamento', t: 'Treinamentos obrigatórios (LGPD, ética, segurança)', p: 'STAFF', sla: 15, f: 'Onboarding' },
  { k: 'rotinas', t: 'Rotinas e metas do período', p: 'COORDINATOR', sla: 30, f: 'Rotinas', rec: 30 },
  { k: 'aval_experiencia', t: 'Avaliação de experiência (45/90 dias)', tipo: 'APROVACAO', p: 'COORDINATOR', sla: 45, f: 'Experiência', n: [rej('fim_nao_efetivado'), ok('ferias_prog')] },
  { k: 'ferias_prog', t: 'Programação de férias', p: 'STAFF', sla: 30, f: 'Ciclo anual' },
  { k: 'ferias_aprov', t: 'Aprovação das férias', tipo: 'APROVACAO', p: 'COORDINATOR', sla: 5, f: 'Ciclo anual', n: [rej('ferias_prog'), ok('avaliacao')] },
  { k: 'avaliacao', t: 'Avaliação anual de desempenho', p: 'COORDINATOR', sla: 20, f: 'Ciclo anual', m: 'desempenho', r: '/desempenho/avaliacoes' },
  { k: 'gw_ciclo', t: 'Continuidade do vínculo', tipo: 'GATEWAY', f: 'Ciclo anual', n: [['deslig_solic', 'Desligamento', 'desligamento', 'eq', true], ['rotinas', 'Novo ciclo']] },
  { k: 'deslig_solic', t: 'Solicitação de desligamento', p: 'COORDINATOR', sla: 2, f: 'Desligamento' },
  { k: 'deslig_aprov', t: 'Aprovação do desligamento', tipo: 'APROVACAO', p: 'BOARD', sla: 3, f: 'Desligamento', n: [rej('rotinas'), ok('exames_dem')] },
  { k: 'exames_dem', t: 'Exame demissional', p: 'STAFF', sla: 5, f: 'Desligamento' },
  { k: 'rescisao', t: 'Rescisão e acerto financeiro', p: 'FINANCE', sla: 10, f: 'Desligamento' },
  { k: 'baixa_acessos', t: 'Revogação de acessos e devolução de bens', p: 'SUPPORT', sla: 1, f: 'Desligamento', chk: ['Acessos revogados', 'Equipamentos e crachá devolvidos'] },
  { k: 'fim_desligado', t: 'Vínculo encerrado', tipo: 'FIM' },
  { k: 'fim_nao_admitido', t: 'Encerrada: admissão não aprovada', tipo: 'FIM' },
  { k: 'fim_nao_efetivado', t: 'Encerrada: não efetivado', tipo: 'FIM' },
]

// ------------------------------------------------------------- DIRETORIA
const DIRETORIA: D[] = [
  { k: 'inicio', t: 'Início do ciclo anual da diretoria', tipo: 'INICIO' },
  { k: 'diagnostico', t: 'Diagnóstico do ano anterior e SWOT', p: 'BOARD', sla: 30, f: 'Planejamento', m: 'desempenho', r: '/desempenho/painel' },
  { k: 'planejamento', t: 'Planejamento anual da unidade', p: 'BOARD', sla: 30, f: 'Planejamento', chk: ['Metas por área', 'Indicadores (OKR/BSC)', 'Responsáveis definidos'] },
  { k: 'orcamento', t: 'Proposta orçamentária', p: 'FINANCE', sla: 30, f: 'Orçamento', m: 'financeiro', r: '/financeiro/orcamento' },
  { k: 'aprov_orcamento', t: 'Aprovação do orçamento', tipo: 'APROVACAO', p: 'BOARD', sla: 15, f: 'Orçamento', n: [rej('orcamento'), ok('pdi')] },
  { k: 'pdi', t: 'Alinhamento ao PDI', p: 'BOARD', sla: 30, f: 'Planejamento', m: 'governanca', r: '/governanca/pdi' },
  { k: 'acomp_trimestral', t: 'Acompanhamento trimestral de metas', p: 'BOARD', sla: 90, f: 'Execução', rec: 30, m: 'desempenho', r: '/desempenho/metas' },
  { k: 'cpa', t: 'Ciclo da CPA e plano de melhorias', p: 'STAFF', sla: 60, f: 'Avaliação', m: 'governanca', r: '/governanca/cpa' },
  { k: 'regulatorio', t: 'Acompanhamento regulatório (e-MEC, MEC)', p: 'STAFF', sla: 30, f: 'Regulatório', m: 'regulatorio', r: '/regulatorio' },
  { k: 'conselho', t: 'Reunião do conselho/colegiado', p: 'BOARD', sla: 15, f: 'Governança', m: 'governanca', r: '/governanca/reunioes', chk: ['Pauta enviada', 'Ata assinada'] },
  { k: 'relatorio_gestao', t: 'Relatório de gestão', p: 'BOARD', sla: 30, f: 'Prestação de contas' },
  { k: 'prestacao_contas', t: 'Prestação de contas', p: 'FINANCE', sla: 30, f: 'Prestação de contas', chk: ['Balanço', 'Parecer de auditoria'] },
  { k: 'aprov_contas', t: 'Aprovação das contas pela reitoria', tipo: 'APROVACAO', p: 'RECTOR', sla: 15, f: 'Prestação de contas', n: [rej('prestacao_contas'), ok('gw_ciclo')] },
  { k: 'gw_ciclo', t: 'Novo ciclo?', tipo: 'GATEWAY', n: [['fim', 'Encerrar', 'encerrar', 'eq', true], ['diagnostico', 'Novo ano']] },
  { k: 'fim', t: 'Ciclo encerrado', tipo: 'FIM' },
]

// ------------------------------------------------------------- REITORIA
const REITORIA: D[] = [
  { k: 'inicio', t: 'Início do ciclo anual institucional', tipo: 'INICIO' },
  { k: 'planejamento', t: 'Planejamento anual institucional', p: 'RECTOR', sla: 30, f: 'Planejamento', m: 'reitoria', r: '/reitoria/planejamento' },
  { k: 'orcamento', t: 'Elaboração do orçamento anual', p: 'FINANCE', sla: 45, f: 'Orçamento', m: 'financeiro', r: '/financeiro/orcamento' },
  { k: 'aprov_orcamento', t: 'Aprovação do orçamento (mantenedora/CONSUP)', tipo: 'APROVACAO', p: 'BOARD', sla: 15, f: 'Orçamento', n: [rej('orcamento'), ok('pdi')] },
  { k: 'pdi', t: 'Monitoramento e revisão do PDI', p: 'RECTOR', sla: 60, f: 'PDI', m: 'governanca', r: '/governanca/pdi', chk: ['Metas do PDI conferidas', 'Ações corretivas registradas'] },
  { k: 'cpa', t: 'Relatório da CPA e plano de melhorias', p: 'STAFF', sla: 60, f: 'Avaliação', m: 'governanca', r: '/governanca/cpa' },
  { k: 'consup1', t: 'Reunião do conselho superior (1º semestre)', p: 'BOARD', sla: 30, f: 'Conselhos', m: 'governanca', r: '/governanca/reunioes' },
  { k: 'regulatorio', t: 'Gestão regulatória (recredenciamento, cursos)', p: 'COORDINATOR', sla: 45, f: 'Regulatório', m: 'regulatorio', r: '/regulatorio/processos', rec: 15 },
  { k: 'indicadores', t: 'Indicadores institucionais (IGC, CPC, evasão)', p: 'RECTOR', sla: 30, f: 'Desempenho', m: 'desempenho', r: '/desempenho/painel' },
  { k: 'consup2', t: 'Reunião do conselho superior (2º semestre)', p: 'BOARD', sla: 30, f: 'Conselhos', m: 'governanca', r: '/governanca/reunioes' },
  { k: 'balanco', t: 'Balanço e auditoria', p: 'FINANCE', sla: 45, f: 'Prestação de contas' },
  { k: 'prestacao', t: 'Prestação de contas à comunidade e mantenedora', p: 'RECTOR', sla: 30, f: 'Prestação de contas', chk: ['Relatório de gestão', 'Publicação no portal de transparência'] },
  { k: 'aprov_contas', t: 'Aprovação das contas pelo conselho', tipo: 'APROVACAO', p: 'BOARD', sla: 15, f: 'Prestação de contas', n: [rej('balanco'), ok('marco_ano')] },
  { k: 'marco_ano', t: 'Ano institucional encerrado', tipo: 'MARCO' },
  { k: 'gw_ciclo', t: 'Novo ciclo anual?', tipo: 'GATEWAY', n: [['fim', 'Encerrar', 'encerrar', 'eq', true], ['planejamento', 'Novo ano']] },
  { k: 'fim', t: 'Ciclo encerrado', tipo: 'FIM' },
]

// --------------------------------------------------------------- EGRESSO
const EGRESSO: D[] = [
  { k: 'inicio', t: 'Diploma entregue: novo egresso', tipo: 'INICIO' },
  { k: 'cadastro', t: 'Atualização cadastral do egresso', p: 'SECRETARY', sla: 7, m: 'secretaria', r: '/secretaria/egressos' },
  { k: 'boas_vindas', t: 'Boas-vindas e carteirinha de ex-aluno', p: 'MARKETING', sla: 7 },
  { k: 'pesquisa_aguarda', t: 'Pesquisa de inserção profissional (6 meses)', tipo: 'ESPERA_EVENTO', p: 'STUDENT', sla: 180, ev: 'egresso.pesquisa_respondida', m: 'desempenho', r: '/desempenho/egressos' },
  { k: 'analise', t: 'Análise dos resultados da pesquisa', p: 'COORDINATOR', sla: 15, m: 'desempenho', r: '/desempenho/egressos' },
  { k: 'gw_pos', t: 'Egresso interessado em pós-graduação?', tipo: 'GATEWAY', n: [['oferta_pos', 'Sim', 'interessePos', 'eq', true], 'educacao_continuada'] },
  { k: 'oferta_pos', t: 'Oferta de pós-graduação com benefício de egresso', p: 'ADMISSIONS', sla: 7, m: 'admissoes', r: '/admissoes/leads' },
  { k: 'marco_pos', t: 'Encaminhado para jornada de candidato (pós)', tipo: 'MARCO', n: ['educacao_continuada'] },
  { k: 'educacao_continuada', t: 'Convite a cursos de extensão e educação continuada', p: 'MARKETING', sla: 30 },
  { k: 'eventos', t: 'Eventos e networking Alumni', p: 'MARKETING', sla: 90 },
  { k: 'depoimento', t: 'Depoimento / case de sucesso', p: 'MARKETING', sla: 30 },
  { k: 'atualizacao_anual', t: 'Atualização cadastral anual', p: 'SECRETARY', sla: 365 },
  { k: 'gw_continua', t: 'Continuar relacionamento?', tipo: 'GATEWAY', n: [['fim', 'Encerrar', 'encerrar', 'eq', true], ['educacao_continuada', 'Novo ano']] },
  { k: 'fim', t: 'Relacionamento encerrado', tipo: 'FIM' },
]

const MAPA: Array<[string, string, string, string, D[]]> = [
  ['ALUNO', 'ALUNO', 'Jornada do aluno: do vestibular ao diploma', 'Captação, ingresso, matrícula, vida acadêmica por período, rematrícula, estágio/TCC, ENADE, colação e diploma.', ALUNO],
  ['CANDIDATO', 'CANDIDATO', 'Jornada do candidato', 'Funil de admissão do primeiro contato à matrícula, com reengajamento.', CANDIDATO],
  ['PROFESSOR', 'PROFESSOR', 'Jornada do professor', 'Recrutamento, contratação, onboarding, ciclo semestral, avaliação e progressão de carreira.', PROFESSOR],
  ['COORDENADOR', 'COORDENADOR', 'Jornada do coordenador de curso', 'Ciclo do curso: PPC/NDE, oferta, horários, acompanhamento, regulatório, ENADE e relatórios.', COORDENADOR],
  ['FUNCIONARIO', 'FUNCIONARIO', 'Jornada do funcionário', 'Admissão, onboarding, rotinas, férias, avaliações e desligamento.', FUNCIONARIO],
  ['DIRETORIA', 'DIRETORIA', 'Jornada da diretoria', 'Ciclo anual da unidade: planejamento, orçamento, PDI, CPA, conselhos e prestação de contas.', DIRETORIA],
  ['REITORIA', 'REITORIA', 'Jornada da reitoria', 'Ciclo institucional: planejamento, orçamento, PDI, CPA, CONSUP, regulatório e prestação de contas.', REITORIA],
  ['EGRESSO', 'EGRESSO', 'Jornada do egresso', 'Acompanhamento, pesquisa de inserção, educação continuada, pós-graduação e relacionamento Alumni.', EGRESSO],
]

export function templatesPadrao(): TemplatePadrao[] {
  return MAPA.map(([chave, persona, nome, descricao, defs]) => ({ chave: `${chave.toLowerCase()}-padrao`, nome, persona, descricao, grafo: montar(defs) }))
}
