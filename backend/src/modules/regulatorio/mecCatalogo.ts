// Catálogos da Comissão de avaliação do MEC: evidências por indicador (kit da visita) e roteiro-modelo da visita.
// Os códigos/nomes de indicador seguem a síntese por dimensão já usada na autoavaliação (catalogo.ts);
// NÃO substituem o instrumento oficial do INEP vigente — conferir antes de usar em processo real.
import { DIM_ORG, DIM_DOC, DIM_INF } from './mecLogic'

export interface EvidenciaModelo { dimensao: string; codigo: string; indicador: string; documento: string; pasta: string; role?: string; dias: number; obrigatorio?: boolean }

export const EVIDENCIAS_MODELO: EvidenciaModelo[] = [
  { dimensao: DIM_ORG, codigo: '1.1', indicador: 'Contexto educacional e demanda', documento: 'Estudo de demanda regional e justificativa de vagas', pasta: '1-Organizacao/1.1', dias: 20, role: 'COORDINATOR' },
  { dimensao: DIM_ORG, codigo: '1.2', indicador: 'Políticas institucionais no âmbito do curso', documento: 'PDI vigente e políticas de ensino, pesquisa e extensão', pasta: '1-Organizacao/1.2', dias: 20, role: 'COORDINATOR' },
  { dimensao: DIM_ORG, codigo: '1.3', indicador: 'Objetivos do curso e perfil profissional do egresso', documento: 'PPC com objetivos, perfil do egresso e matriz de competências', pasta: '1-Organizacao/1.3', dias: 25, role: 'COORDINATOR' },
  { dimensao: DIM_ORG, codigo: '1.4', indicador: 'Estrutura curricular e conteúdos curriculares', documento: 'Matriz curricular, ementários e DCN atendidas', pasta: '1-Organizacao/1.4', dias: 25, role: 'COORDINATOR' },
  { dimensao: DIM_ORG, codigo: '1.5', indicador: 'Metodologia, estágio, TCC e atividades complementares', documento: 'Regulamentos de estágio, TCC e atividades complementares', pasta: '1-Organizacao/1.5', dias: 30, role: 'SECRETARY' },
  { dimensao: DIM_ORG, codigo: '1.6', indicador: 'Apoio ao discente e acessibilidade metodológica', documento: 'Programa de apoio ao discente, nivelamento e atendimento a PCD', pasta: '1-Organizacao/1.6', dias: 30, role: 'SUPPORT' },
  { dimensao: DIM_ORG, codigo: '1.7', indicador: 'Atividades de extensão e curricularização', documento: 'Projetos de extensão e registro da curricularização (10%)', pasta: '1-Organizacao/1.7', dias: 30, role: 'COORDINATOR' },
  { dimensao: DIM_ORG, codigo: '1.8', indicador: 'Sistema de avaliação do processo ensino-aprendizagem', documento: 'Regimento: sistema de avaliação e relatórios da CPA', pasta: '1-Organizacao/1.8', dias: 35, role: 'COORDINATOR' },
  { dimensao: DIM_DOC, codigo: '2.1', indicador: 'Núcleo Docente Estruturante (NDE)', documento: 'Portaria do NDE com titulação, regime e atas de reunião', pasta: '2-Docente/2.1', dias: 20, role: 'COORDINATOR' },
  { dimensao: DIM_DOC, codigo: '2.2', indicador: 'Atuação e regime de trabalho do coordenador', documento: 'Contrato, titulação e plano de ação do coordenador', pasta: '2-Docente/2.2', dias: 20, role: 'COORDINATOR' },
  { dimensao: DIM_DOC, codigo: '2.3', indicador: 'Titulação e experiência do corpo docente', documento: 'Diplomas, comprovação de experiência e currículos Lattes', pasta: '2-Docente/2.3', dias: 25, role: 'STAFF' },
  { dimensao: DIM_DOC, codigo: '2.4', indicador: 'Regime de trabalho do corpo docente', documento: 'Relação de docentes com regime de trabalho (integral/parcial/horista)', pasta: '2-Docente/2.4', dias: 25, role: 'STAFF' },
  { dimensao: DIM_DOC, codigo: '2.5', indicador: 'Produção científica, cultural, artística ou tecnológica', documento: 'Relação de produção dos últimos 3 anos', pasta: '2-Docente/2.5', dias: 30, role: 'COORDINATOR', obrigatorio: false },
  { dimensao: DIM_INF, codigo: '3.1', indicador: 'Salas de aula, gabinetes e espaços de trabalho', documento: 'Planta, laudo de acessibilidade e fotos das salas e gabinetes', pasta: '3-Infra/3.1', dias: 20, role: 'FACILITIES' },
  { dimensao: DIM_INF, codigo: '3.2', indicador: 'Laboratórios didáticos de formação básica e específica', documento: 'Inventário de laboratórios, normas de biossegurança e plano de manutenção', pasta: '3-Infra/3.2', dias: 25, role: 'FACILITIES' },
  { dimensao: DIM_INF, codigo: '3.3', indicador: 'Biblioteca: bibliografia básica e complementar', documento: 'Relatório do acervo (títulos/exemplares) e assinatura de bases', pasta: '3-Infra/3.3', dias: 25, role: 'LIBRARIAN' },
  { dimensao: DIM_INF, codigo: '3.4', indicador: 'Comitê de ética, TIC e acessibilidade', documento: 'Portaria do CEP, infraestrutura de TIC e plano de acessibilidade', pasta: '3-Infra/3.4', dias: 30, role: 'FACILITIES' },
  { dimensao: DIM_INF, codigo: '3.5', indicador: 'Requisitos legais e de segurança (AVCB, alvará, CND)', documento: 'AVCB, alvará de funcionamento, certidões negativas', pasta: '3-Infra/3.5', dias: 15, role: 'FACILITIES' },
]

export interface RoteiroModelo { dia: number; horaInicio: string; horaFim: string; dimensao: string; atividade: string; local: string; participantes: string }

// dia: 0 = primeiro dia da visita; 1 = segundo dia.
export const ROTEIRO_MODELO: RoteiroModelo[] = [
  { dia: 0, horaInicio: '09:00', horaFim: '10:30', dimensao: DIM_ORG, atividade: 'Reunião de abertura com a direção, mantenedora e CPA', local: 'Sala da Reitoria', participantes: 'Reitor(a), Pró-reitores, Coordenação, CPA' },
  { dia: 0, horaInicio: '10:45', horaFim: '12:00', dimensao: DIM_DOC, atividade: 'Reunião com o Núcleo Docente Estruturante (NDE)', local: 'Sala de reuniões do NDE', participantes: 'Membros do NDE' },
  { dia: 0, horaInicio: '14:00', horaFim: '15:30', dimensao: DIM_DOC, atividade: 'Reunião com o corpo docente', local: 'Auditório', participantes: 'Docentes do curso' },
  { dia: 0, horaInicio: '15:45', horaFim: '17:30', dimensao: DIM_INF, atividade: 'Visita à biblioteca e ao acervo físico/virtual', local: 'Biblioteca central', participantes: 'Bibliotecária, Coordenação' },
  { dia: 1, horaInicio: '09:00', horaFim: '10:15', dimensao: DIM_ORG, atividade: 'Reunião com representantes discentes', local: 'Sala de reuniões 2', participantes: 'Discentes (diferentes períodos)' },
  { dia: 1, horaInicio: '10:30', horaFim: '12:00', dimensao: DIM_INF, atividade: 'Visita aos laboratórios e à clínica/campo de prática', local: 'Laboratórios', participantes: 'Técnicos, Coordenação, Docentes' },
  { dia: 1, horaInicio: '13:30', horaFim: '14:30', dimensao: DIM_INF, atividade: 'Salas de aula, gabinetes, TIC, acessibilidade e comitê de ética', local: 'Blocos A e B', participantes: 'Infraestrutura, TI' },
  { dia: 1, horaInicio: '14:45', horaFim: '15:45', dimensao: DIM_DOC, atividade: 'Entrevista com o(a) coordenador(a) do curso', local: 'Coordenação', participantes: 'Coordenador(a)' },
  { dia: 1, horaInicio: '16:30', horaFim: '17:30', dimensao: DIM_ORG, atividade: 'Reunião de encerramento e devolutiva da comissão', local: 'Sala da Reitoria', participantes: 'Direção, Coordenação' },
]
