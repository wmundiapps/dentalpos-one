import { Response, Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { exigirGestorLgpd, httpError, tid, trilha, uid } from './base'

// ============================================================
// 3) Inventário de tratamento / ROPA (art. 37). Pré-populado com as atividades do EduMaster.
//    Textos são MODELO: o encarregado deve revisar cada linha com as áreas responsáveis.
// ============================================================

export const BASES_LEGAIS = [
  'CONSENTIMENTO', 'CONSENTIMENTO_DESTACADO', 'CUMPRIMENTO_OBRIGACAO_LEGAL', 'POLITICAS_PUBLICAS', 'ESTUDOS_ORGAO_PESQUISA', 'EXECUCAO_CONTRATO',
  'EXERCICIO_REGULAR_DIREITOS', 'PROTECAO_VIDA', 'TUTELA_SAUDE', 'LEGITIMO_INTERESSE', 'PROTECAO_CREDITO', 'GARANTIA_PREVENCAO_FRAUDE',
] as const
// Bases que a LGPD NÃO admite para dado sensível (art. 11)
const NAO_PARA_SENSIVEL = new Set(['LEGITIMO_INTERESSE', 'PROTECAO_CREDITO', 'EXECUCAO_CONTRATO'])

const OPERADORA = { nome: 'WMundi Technologies (plataforma EduMaster Pro)', funcao: 'Operadora: hospedagem e processamento do sistema', pais: 'Brasil' }
const NUVEM = { nome: 'Provedor de infraestrutura em nuvem (hospedagem/banco de dados) [confirmar contrato e região]', funcao: 'Suboperador de armazenamento', pais: 'Conforme contrato' }

interface Seed {
  codigo: string; atividade: string; area: string; sistema: string; titulares: string[]; dados: string[]; sensivel?: boolean; menores?: boolean
  finalidade: string; base: string; detalhe?: string; retencao: string; meses?: number | null
  compart?: Array<{ destinatario: string; finalidade: string; baseLegal: string }>; operadores?: any[]; intl?: boolean; seguranca?: string
}

const SEG = 'Controle de acesso por papel; autenticação com 2FA opcional/obrigatória; criptografia em trânsito (HTTPS); logs de segurança; varredura de uploads; backup.'

const SEEDS: Seed[] = [
  { codigo: 'ACAD-MATRICULA', atividade: 'Matrícula e cadastro do aluno', area: 'Secretaria', sistema: 'academico/secretaria', titulares: ['Alunos', 'Responsáveis financeiros'], dados: ['Nome', 'CPF', 'RG', 'Data de nascimento', 'Endereço', 'E-mail', 'Telefone', 'Documentos de matrícula'], menores: true,
    finalidade: 'Efetivar a matrícula, manter o vínculo acadêmico e cumprir o contrato educacional.', base: 'EXECUCAO_CONTRATO', detalhe: 'Cumprimento de obrigação legal/regulatória (LDB e normas do MEC) em paralelo (art. 7º, II).', retencao: 'Permanente (acervo acadêmico).', meses: null,
    compart: [{ destinatario: 'MEC/INEP (Censo da Educação Superior), conforme a modalidade', finalidade: 'Obrigação regulatória', baseLegal: 'CUMPRIMENTO_OBRIGACAO_LEGAL' }], operadores: [OPERADORA, NUVEM] },
  { codigo: 'ACAD-HISTORICO', atividade: 'Histórico escolar, notas e frequência', area: 'Secretaria/Coordenação', sistema: 'academico/notas', titulares: ['Alunos', 'Egressos'], dados: ['Notas', 'Frequência', 'Situação de matrícula', 'Aproveitamento de estudos'],
    finalidade: 'Registrar a vida acadêmica e emitir documentos oficiais.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', detalhe: 'Guarda permanente do acervo acadêmico (LDB 9.394/96 e normas do MEC). Exceção do art. 16, I: não é eliminado a pedido.', retencao: 'Permanente.', meses: null, operadores: [OPERADORA, NUVEM] },
  { codigo: 'ACAD-DIPLOMAS', atividade: 'Diplomas, certificados e validação pública', area: 'Secretaria', sistema: 'secretaria', titulares: ['Alunos', 'Egressos', 'Participantes de eventos'], dados: ['Nome', 'CPF/Documento', 'Curso', 'Datas de conclusão', 'Código de verificação'],
    finalidade: 'Emitir e permitir a verificação pública de autenticidade de diplomas e certificados.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', retencao: 'Permanente.', meses: null, operadores: [OPERADORA, NUVEM] },
  { codigo: 'ADM-VESTIBULAR', atividade: 'Processo seletivo (vestibular) e candidatos', area: 'Admissões', sistema: 'admissoes', titulares: ['Candidatos', 'Responsáveis'], dados: ['Nome', 'CPF', 'Contato', 'Notas', 'Documentos', 'Cota/condição declarada'], menores: true,
    finalidade: 'Conduzir inscrição, classificação e matrícula de candidatos.', base: 'EXECUCAO_CONTRATO', detalhe: 'Procedimentos preliminares a pedido do titular (art. 7º, V).', retencao: 'Candidatos não matriculados: 24 meses e depois anonimização; matriculados: segue o acervo acadêmico.', meses: 24, operadores: [OPERADORA, NUVEM] },
  { codigo: 'ADM-LEADS', atividade: 'Captação de interessados (leads) e funil comercial', area: 'Marketing/Admissões', sistema: 'admissoes/comunicacao', titulares: ['Interessados'], dados: ['Nome', 'E-mail', 'Telefone', 'Origem/UTM', 'IP (hash)'],
    finalidade: 'Responder a pedidos de informação e, com consentimento específico, enviar divulgação.', base: 'CONSENTIMENTO', detalhe: 'Marketing exige aceite separado e opcional; opt-out sempre respeitado.', retencao: '24 meses sem interação, depois anonimização.', meses: 24, operadores: [OPERADORA, NUVEM] },
  { codigo: 'FIN-COBRANCA', atividade: 'Mensalidades, cobrança, boletos e PIX', area: 'Financeiro', sistema: 'financeiro', titulares: ['Alunos', 'Responsáveis financeiros'], dados: ['Nome', 'CPF', 'Contato', 'Valores e vencimentos', 'Status de pagamento'],
    finalidade: 'Cobrar e conciliar mensalidades e serviços contratados.', base: 'EXECUCAO_CONTRATO', detalhe: 'Obrigação fiscal/tributária em paralelo.', retencao: '5 anos após o exercício (CTN) e, depois, eliminação.', meses: 60,
    compart: [{ destinatario: 'Gateway de pagamento / instituição financeira', finalidade: 'Processar pagamentos', baseLegal: 'EXECUCAO_CONTRATO' }, { destinatario: 'Contabilidade', finalidade: 'Escrituração', baseLegal: 'CUMPRIMENTO_OBRIGACAO_LEGAL' }], operadores: [OPERADORA, NUVEM, { nome: 'Gateway de pagamento [confirmar]', funcao: 'Operador de pagamentos', pais: 'Brasil' }] },
  { codigo: 'FIN-FISCAL', atividade: 'Emissão de notas fiscais e escrituração', area: 'Financeiro/Contabilidade', sistema: 'financeiro', titulares: ['Alunos', 'Fornecedores'], dados: ['Nome', 'CPF/CNPJ', 'Endereço', 'Valores'],
    finalidade: 'Cumprir obrigações fiscais acessórias.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', retencao: '5 anos (prazo prescricional tributário).', meses: 60, compart: [{ destinatario: 'Prefeitura/Secretaria da Fazenda', finalidade: 'Emissão de nota fiscal', baseLegal: 'CUMPRIMENTO_OBRIGACAO_LEGAL' }], operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-ATENDIMENTO', atividade: 'Atendimento de apoio ao estudante (NAE/NAPNE/psicopedagógico)', area: 'Apoio ao estudante', sistema: 'apoio', titulares: ['Alunos'], dados: ['Motivo e relato do atendimento', 'Encaminhamentos', 'Dados de saúde mental/social'], sensivel: true, menores: true,
    finalidade: 'Acolher e acompanhar o estudante, promovendo permanência e bem-estar.', base: 'TUTELA_SAUDE', detalhe: 'Dado sensível (art. 11): tutela da saúde por profissional da área ou consentimento específico e destacado. Acesso restrito e registrado.', retencao: '5 anos (registro de atendimento profissional) e depois anonimização.', meses: 60, seguranca: SEG + ' Acesso a dados sensíveis registrado (quem viu o quê).', operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-AEE', atividade: 'Planos de atendimento educacional especializado (AEE)', area: 'NAPNE', sistema: 'apoio', titulares: ['Alunos com deficiência'], dados: ['Necessidade educacional especial', 'Laudo (referência)', 'Adaptações'], sensivel: true, menores: true,
    finalidade: 'Garantir acessibilidade e adaptações pedagógicas.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', detalhe: 'Lei 13.146/2015 (Estatuto da Pessoa com Deficiência) e normas de educação inclusiva.', retencao: 'Vigência do plano + 5 anos.', meses: 60, seguranca: SEG + ' Acesso a dados sensíveis registrado.', operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-OCORRENCIAS', atividade: 'Ocorrências e processos disciplinares', area: 'Coordenação/Comissão disciplinar', sistema: 'apoio', titulares: ['Alunos', 'Testemunhas'], dados: ['Descrição do fato', 'Defesa', 'Decisão e sanção'], menores: true,
    finalidade: 'Aplicar o regimento com contraditório e ampla defesa.', base: 'EXERCICIO_REGULAR_DIREITOS', retencao: '5 anos após a decisão.', meses: 60, operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-BOLSAS', atividade: 'Bolsas e assistência estudantil', area: 'Apoio ao estudante/Financeiro', sistema: 'apoio/admissoes', titulares: ['Alunos', 'Famílias'], dados: ['Renda familiar', 'Composição familiar', 'Documentos comprobatórios'],
    finalidade: 'Avaliar elegibilidade e conceder benefícios.', base: 'EXECUCAO_CONTRATO', detalhe: 'Dado socioeconômico (não sensível pela lei, mas de proteção reforçada).', retencao: 'Duração do benefício + 5 anos (prestação de contas).', meses: 60, operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-OUVIDORIA', atividade: 'Ouvidoria (manifestações)', area: 'Ouvidoria', sistema: 'apoio', titulares: ['Alunos', 'Docentes', 'Comunidade'], dados: ['Identificação (opcional)', 'Relato', 'Contato'],
    finalidade: 'Receber, tratar e responder manifestações; manifestações anônimas são permitidas.', base: 'LEGITIMO_INTERESSE', retencao: '5 anos após o encerramento.', meses: 60, operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-RISCO', atividade: 'Indicador de risco de evasão (perfilamento)', area: 'Apoio ao estudante', sistema: 'apoio', titulares: ['Alunos'], dados: ['Frequência', 'Notas', 'Inadimplência (agregada)', 'Pontuação de risco'], menores: true,
    finalidade: 'Identificar alunos que precisam de acolhimento e reduzir evasão. Sem decisão automática com efeito jurídico: a pontuação só aciona atendimento humano (art. 20 - revisão a pedido).', base: 'LEGITIMO_INTERESSE', detalhe: 'Exige teste de balanceamento (LIA) documentado.', retencao: '24 meses.', meses: 24, operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-EGRESSOS', atividade: 'Acompanhamento de egressos', area: 'Apoio/Reitoria', sistema: 'apoio', titulares: ['Egressos'], dados: ['Contato', 'Situação profissional', 'Faixa salarial (opcional)'],
    finalidade: 'Avaliar a trajetória de egressos (indicadores institucionais) e manter relacionamento.', base: 'CONSENTIMENTO', detalhe: 'Parte dos indicadores é exigida pela avaliação institucional (SINAES) em dados agregados.', retencao: 'Até a revogação ou 5 anos sem atualização.', meses: 60, operadores: [OPERADORA, NUVEM] },
  { codigo: 'APO-ESTAGIO', atividade: 'Estágios e empregabilidade', area: 'Coordenação de estágio', sistema: 'apoio/modalidades', titulares: ['Alunos', 'Supervisores'], dados: ['Termo de estágio', 'Empresa concedente', 'Horas', 'Relatórios'],
    finalidade: 'Formalizar e acompanhar estágios.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', detalhe: 'Lei 11.788/2008.', retencao: '5 anos após o término.', meses: 60, compart: [{ destinatario: 'Empresa concedente do estágio e agente de integração', finalidade: 'Formalização do estágio', baseLegal: 'CUMPRIMENTO_OBRIGACAO_LEGAL' }], operadores: [OPERADORA, NUVEM] },
  { codigo: 'COM-OMNICHANNEL', atividade: 'Comunicação por e-mail, WhatsApp, SMS e voz', area: 'Comunicação', sistema: 'comunicacao', titulares: ['Alunos', 'Candidatos', 'Egressos', 'Responsáveis'], dados: ['Nome', 'E-mail', 'Telefone', 'Preferências (opt-in/opt-out)', 'Conteúdo das mensagens'], menores: true,
    finalidade: 'Avisos acadêmicos/financeiros (operacionais) e, somente com consentimento, divulgação.', base: 'EXECUCAO_CONTRATO', detalhe: 'Marketing: CONSENTIMENTO separado; opt-out vence.', retencao: 'Mensagens: 12 meses; preferências: enquanto durar o vínculo + 5 anos (prova).', meses: 12,
    compart: [{ destinatario: 'Provedores de mensageria (WhatsApp/e-mail/SMS) [confirmar]', finalidade: 'Entrega das mensagens', baseLegal: 'EXECUCAO_CONTRATO' }], operadores: [OPERADORA, { nome: 'Provedor de mensageria [confirmar]', funcao: 'Entrega de mensagens', pais: 'Conforme contrato' }], intl: true },
  { codigo: 'BIB-ACERVO', atividade: 'Biblioteca: leitores, empréstimos e multas', area: 'Biblioteca', sistema: 'biblioteca', titulares: ['Alunos', 'Docentes', 'Comunidade'], dados: ['Nome', 'Documento', 'Contato', 'Histórico de empréstimos'],
    finalidade: 'Controlar o acervo e os empréstimos.', base: 'EXECUCAO_CONTRATO', retencao: 'Vínculo + 24 meses.', meses: 24, operadores: [OPERADORA, NUVEM] },
  { codigo: 'NOT-AVALIACOES', atividade: 'Avaliações online, provas e correção assistida por IA', area: 'Coordenação/Docentes', sistema: 'notas/provas-ia/desempenho', titulares: ['Alunos'], dados: ['Respostas', 'Notas', 'Tempo de prova'], menores: true,
    finalidade: 'Avaliar o desempenho acadêmico; a correção por IA é revisável pelo docente (art. 20).', base: 'EXECUCAO_CONTRATO', retencao: 'Registro de notas: permanente; respostas brutas: conforme regimento.', meses: null,
    compart: [{ destinatario: 'Provedor de IA (correção/geração de questões) - texto enviado sem identificação direta quando possível', finalidade: 'Correção assistida', baseLegal: 'EXECUCAO_CONTRATO' }], operadores: [OPERADORA, NUVEM, { nome: 'Provedor de IA generativa [confirmar]', funcao: 'Operador de processamento de texto', pais: 'Exterior' }], intl: true },
  { codigo: 'PES-PESQUISA', atividade: 'Pesquisa científica e produção acadêmica', area: 'Pesquisa', sistema: 'pesquisa', titulares: ['Docentes', 'Alunos', 'Participantes de pesquisa'], dados: ['Autoria', 'Vínculos', 'Dados de participantes (quando houver, via comitê de ética)'],
    finalidade: 'Gerir projetos, grupos e publicações.', base: 'ESTUDOS_ORGAO_PESQUISA', detalhe: 'Sempre que possível, anonimização dos dados de pesquisa.', retencao: 'Conforme norma do comitê de ética/agência de fomento.', meses: null, operadores: [OPERADORA, NUVEM] },
  { codigo: 'SEG-AUTH', atividade: 'Autenticação, 2FA e logs de segurança', area: 'TI/Segurança', sistema: 'seguranca', titulares: ['Usuários do sistema'], dados: ['E-mail', 'IP', 'User-Agent', 'Eventos de login'],
    finalidade: 'Proteger contas e detectar abuso; guarda de registros de acesso (Marco Civil da Internet, art. 15).', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', detalhe: 'Também legítimo interesse para prevenção a fraude.', retencao: '12 meses.', meses: 12, operadores: [OPERADORA, NUVEM] },
  { codigo: 'SEG-UPLOADS', atividade: 'Varredura de arquivos enviados (anti-malware e moderação)', area: 'TI/Segurança', sistema: 'seguranca', titulares: ['Usuários do sistema'], dados: ['Hash do arquivo', 'Tipo/tamanho', 'Imagens (moderação)'],
    finalidade: 'Impedir malware e conteúdo impróprio.', base: 'LEGITIMO_INTERESSE', retencao: '12 meses (veredito e hash; o arquivo em si segue a retenção do módulo de origem).', meses: 12,
    compart: [{ destinatario: 'Serviço de reputação de arquivos (consulta apenas por hash) [opcional]', finalidade: 'Detecção de malware', baseLegal: 'LEGITIMO_INTERESSE' }], operadores: [OPERADORA, { nome: 'Provedor de IA de visão [opcional]', funcao: 'Moderação de imagens', pais: 'Exterior' }], intl: true },
  { codigo: 'GOV-REGULATORIO', atividade: 'Obrigações regulatórias (Censo, ENADE, e-MEC, CPA)', area: 'Regulação/Reitoria', sistema: 'regulatorio/governanca', titulares: ['Alunos', 'Docentes', 'Funcionários'], dados: ['Dados cadastrais e acadêmicos exigidos pelo MEC/INEP'],
    finalidade: 'Cumprir obrigações perante órgãos reguladores.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', retencao: 'Conforme norma do órgão (mín. 5 anos).', meses: 60, compart: [{ destinatario: 'MEC / INEP / CAPES', finalidade: 'Obrigação regulatória', baseLegal: 'CUMPRIMENTO_OBRIGACAO_LEGAL' }], operadores: [OPERADORA, NUVEM] },
  { codigo: 'RH-DOCENTES', atividade: 'Cadastro de docentes e colaboradores', area: 'Recursos Humanos', sistema: 'core', titulares: ['Docentes', 'Colaboradores'], dados: ['Dados cadastrais', 'Titulação', 'Vínculo'],
    finalidade: 'Gestão do vínculo trabalhista/contratual e exigências regulatórias do corpo docente.', base: 'EXECUCAO_CONTRATO', retencao: 'Vínculo + prazos trabalhistas/previdenciários.', meses: null, operadores: [OPERADORA, NUVEM] },
  { codigo: 'LGPD-DIREITOS', atividade: 'Atendimento de direitos do titular e consentimentos', area: 'Encarregado (DPO)', sistema: 'lgpd', titulares: ['Todos os titulares'], dados: ['Identificação', 'Solicitação', 'Trilha de auditoria', 'Hash de IP/UA'],
    finalidade: 'Cumprir os arts. 8º, 18 e 19 da LGPD e manter prova do consentimento.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', retencao: '5 anos (prestação de contas e defesa).', meses: 60, operadores: [OPERADORA, NUVEM] },
  { codigo: 'SUP-VENDAS', atividade: 'Vendas na loja/cantina/papelaria', area: 'Suprimentos', sistema: 'suprimentos', titulares: ['Alunos', 'Clientes'], dados: ['Nome', 'CPF na nota (opcional)', 'Itens e valores'],
    finalidade: 'Registrar vendas e emitir documento fiscal.', base: 'CUMPRIMENTO_OBRIGACAO_LEGAL', retencao: '5 anos.', meses: 60, operadores: [OPERADORA, NUVEM] },
  { codigo: 'MOD-EAD', atividade: 'Ensino a distância: presença, engajamento e lives', area: 'EAD', sistema: 'modalidades/conteudo', titulares: ['Alunos', 'Tutores'], dados: ['Acessos', 'Presença em transmissões', 'Progresso em conteúdos'], menores: true,
    finalidade: 'Controle de frequência e acompanhamento pedagógico na modalidade a distância.', base: 'EXECUCAO_CONTRATO', retencao: 'Frequência: acervo acadêmico; eventos de engajamento: 24 meses.', meses: 24, operadores: [OPERADORA, NUVEM] },
]

export async function semearRopa(tenantId: string): Promise<{ criadas: number; existentes: number }> {
  let criadas = 0, existentes = 0
  for (const s of SEEDS) {
    const ex = await prisma.lgpAtividadeTratamento.findUnique({ where: { tenantId_codigo: { tenantId, codigo: s.codigo } } })
    if (ex) { existentes++; continue }
    await prisma.lgpAtividadeTratamento.create({
      data: {
        tenantId, codigo: s.codigo, atividade: s.atividade, area: s.area, sistema: s.sistema, categoriasTitulares: s.titulares, categoriasDados: s.dados, dadosSensiveis: !!s.sensivel, dadosMenores: !!s.menores,
        finalidade: s.finalidade, baseLegal: s.base, baseLegalDetalhe: s.detalhe, retencao: s.retencao, retencaoMeses: s.meses ?? null, compartilhamento: (s.compart ?? []) as any, operadores: (s.operadores ?? []) as any,
        transferenciaInternacional: !!s.intl, medidasSeguranca: s.seguranca ?? SEG, status: 'EM_REVISAO', origem: 'SEED',
      },
    })
    criadas++
  }
  if (criadas) await trilha({ tenantId, refType: 'Ropa', refId: 'seed', acao: 'SEED', ator: 'SISTEMA', detalhe: { criadas } })
  return { criadas, existentes }
}

export const totalSeeds = SEEDS.length

const atividadeSchema = z.object({
  codigo: z.string().min(2).max(40).transform((s) => s.toUpperCase()),
  atividade: z.string().min(3).max(200), area: z.string().max(120).optional(), sistema: z.string().max(120).optional(), descricao: z.string().max(2000).optional(),
  categoriasTitulares: z.array(z.string().max(80)).max(30).default([]), categoriasDados: z.array(z.string().max(120)).max(60).default([]),
  dadosSensiveis: z.boolean().default(false), dadosMenores: z.boolean().default(false),
  finalidade: z.string().min(5).max(1000), baseLegal: z.enum(BASES_LEGAIS), baseLegalDetalhe: z.string().max(1000).optional(),
  retencao: z.string().max(500).optional(), retencaoMeses: z.number().int().min(0).max(1200).nullable().optional(),
  compartilhamento: z.array(z.object({ destinatario: z.string().max(200), finalidade: z.string().max(300), baseLegal: z.string().max(60).optional() })).max(30).default([]),
  operadores: z.array(z.object({ nome: z.string().max(200), funcao: z.string().max(300).optional(), pais: z.string().max(80).optional() })).max(30).default([]),
  transferenciaInternacional: z.boolean().default(false), medidasSeguranca: z.string().max(2000).optional(), responsavel: z.string().max(150).optional(),
  status: z.enum(['ATIVA', 'EM_REVISAO', 'DESCONTINUADA']).default('ATIVA'),
})

function validarRegras(d: z.infer<typeof atividadeSchema>) {
  if (d.dadosSensiveis && NAO_PARA_SENSIVEL.has(d.baseLegal)) throw httpError(422, 'Dado sensível não pode se basear em legítimo interesse, proteção ao crédito ou execução de contrato (LGPD art. 11). Use consentimento destacado, obrigação legal, tutela da saúde etc.')
  if (d.dadosMenores && d.baseLegal === 'CONSENTIMENTO' && !/respons[aá]vel/i.test(d.baseLegalDetalhe ?? '')) throw httpError(422, 'Menores com base em consentimento: descreva em "detalhe da base legal" como o consentimento do responsável é obtido (art. 14, §1º).')
}

export function mountRopa(router: Router) {
  router.get('/ropa', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    if ((await prisma.lgpAtividadeTratamento.count({ where: { tenantId } })) === 0) await semearRopa(tenantId)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'baseLegal']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.sensiveis) === 'true') where.dadosSensiveis = true
    if (qs(req.query.menores) === 'true') where.dadosMenores = true
    const q = qs(req.query.q)
    if (q) where.OR = [{ atividade: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q, mode: 'insensitive' } }, { area: { contains: q, mode: 'insensitive' } }]
    const [items, total] = await Promise.all([prisma.lgpAtividadeTratamento.findMany({ where, orderBy: { codigo: 'asc' }, skip, take: qs(req.query.formato) === 'csv' ? 1000 : take }), prisma.lgpAtividadeTratamento.count({ where })])
    if (qs(req.query.formato) === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const linhas = [['Código', 'Atividade', 'Área', 'Sistema', 'Titulares', 'Categorias de dados', 'Sensível', 'Menores', 'Finalidade', 'Base legal', 'Retenção', 'Compartilhamento', 'Operadores', 'Transf. internacional', 'Status'].map(esc).join(';')]
      for (const a of items) linhas.push([a.codigo, a.atividade, a.area, a.sistema, a.categoriasTitulares.join(', '), a.categoriasDados.join(', '), a.dadosSensiveis ? 'Sim' : 'Não', a.dadosMenores ? 'Sim' : 'Não', a.finalidade, a.baseLegal, a.retencao, ((a.compartilhamento as any[]) ?? []).map((c) => c.destinatario).join(' | '), ((a.operadores as any[]) ?? []).map((c) => c.nome).join(' | '), a.transferenciaInternacional ? 'Sim' : 'Não', a.status].map(esc).join(';'))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="ropa-inventario-tratamento.csv"')
      return res.send('﻿' + linhas.join('\n'))
    }
    res.json({ items, total, page, pageSize })
  }))

  router.post('/ropa/seed', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ ...(await semearRopa(tid(req))), modelo: totalSeeds, aviso: 'Atividades pré-populadas como MODELO (status EM_REVISAO): revise com cada área e marque como ATIVA.' })
  }))

  router.get('/ropa/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.lgpAtividadeTratamento.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a) throw httpError(404, 'Atividade não encontrada.')
    res.json(a)
  }))

  router.post('/ropa', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(atividadeSchema, req.body)
    validarRegras(b)
    const r = await prisma.lgpAtividadeTratamento.create({ data: { ...b, tenantId, compartilhamento: b.compartilhamento as any, operadores: b.operadores as any, retencaoMeses: b.retencaoMeses ?? null, origem: 'MANUAL' } })
    await trilha({ tenantId, refType: 'Ropa', refId: r.id, acao: 'CRIADA', userId: uid(req), ator: 'EQUIPE', detalhe: { codigo: r.codigo } })
    res.status(201).json(r)
  }))

  router.put('/ropa/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const atual = await prisma.lgpAtividadeTratamento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!atual) throw httpError(404, 'Atividade não encontrada.')
    const b = parseBody(atividadeSchema.partial(), req.body)
    validarRegras({ ...atividadeSchema.parse({ ...atual, retencaoMeses: atual.retencaoMeses, compartilhamento: atual.compartilhamento ?? [], operadores: atual.operadores ?? [], area: atual.area ?? undefined, sistema: atual.sistema ?? undefined, descricao: atual.descricao ?? undefined, baseLegalDetalhe: atual.baseLegalDetalhe ?? undefined, retencao: atual.retencao ?? undefined, medidasSeguranca: atual.medidasSeguranca ?? undefined, responsavel: atual.responsavel ?? undefined }), ...b } as any)
    const { compartilhamento, operadores, ...resto } = b
    const r = await prisma.lgpAtividadeTratamento.update({ where: { id: atual.id }, data: { ...resto, ...(compartilhamento ? { compartilhamento: compartilhamento as any } : {}), ...(operadores ? { operadores: operadores as any } : {}), revisadoEm: new Date() } })
    await trilha({ tenantId, refType: 'Ropa', refId: r.id, acao: 'ATUALIZADA', userId: uid(req), ator: 'EQUIPE', detalhe: { campos: Object.keys(b) } })
    res.json(r)
  }))

  router.post('/ropa/:id/revisar', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.lgpAtividadeTratamento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Atividade não encontrada.')
    const r = await prisma.lgpAtividadeTratamento.update({ where: { id: a.id }, data: { status: 'ATIVA', revisadoEm: new Date(), responsavel: a.responsavel ?? undefined } })
    await trilha({ tenantId, refType: 'Ropa', refId: a.id, acao: 'REVISADA', userId: uid(req), ator: 'EQUIPE' })
    res.json(r)
  }))

  router.delete('/ropa/:id', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const a = await prisma.lgpAtividadeTratamento.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!a) throw httpError(404, 'Atividade não encontrada.')
    // art. 37: o histórico do inventário é mantido - descontinua em vez de apagar
    await prisma.lgpAtividadeTratamento.update({ where: { id: a.id }, data: { status: 'DESCONTINUADA' } })
    await trilha({ tenantId, refType: 'Ropa', refId: a.id, acao: 'DESCONTINUADA', userId: uid(req), ator: 'EQUIPE' })
    res.status(204).end()
  }))
}
