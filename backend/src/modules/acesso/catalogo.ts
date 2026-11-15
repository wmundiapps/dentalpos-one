import type { AcademicRole } from '../academico/middleware'

// Catálogo da matriz de acesso por cargo: cargos (papéis do sistema) e módulos (1º segmento de /api/edu/<modulo>).

/** Cargos com acesso total à gestão: nunca podem ser bloqueados (evita trancar a instituição). Espelha SUPER_ROLES de academico/middleware.ts. */
export const CARGOS_SUPER: string[] = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
/** Quem pode EDITAR a matriz. */
export const CARGOS_EDITORES: string[] = ['ADMIN', 'OWNER']

export const ESTADOS = ['PADRAO', 'PERMITIR', 'BLOQUEAR'] as const
export type Estado = (typeof ESTADOS)[number]

export const CARGOS: Array<{ cargo: AcademicRole; nome: string }> = [
  { cargo: 'ADMIN', nome: 'Administrador' },
  { cargo: 'OWNER', nome: 'Proprietário / mantenedora' },
  { cargo: 'RECTOR', nome: 'Reitoria' },
  { cargo: 'BOARD', nome: 'Conselho / diretoria' },
  { cargo: 'COORDINATOR', nome: 'Coordenação' },
  { cargo: 'SECRETARY', nome: 'Secretaria' },
  { cargo: 'TEACHER', nome: 'Professor' },
  { cargo: 'STUDENT', nome: 'Aluno' },
  { cargo: 'FINANCE', nome: 'Financeiro' },
  { cargo: 'ADMISSIONS', nome: 'Admissões / captação' },
  { cargo: 'MARKETING', nome: 'Marketing' },
  { cargo: 'LIBRARIAN', nome: 'Biblioteca' },
  { cargo: 'FACILITIES', nome: 'Infraestrutura' },
  { cargo: 'SUPPLIES', nome: 'Suprimentos' },
  { cargo: 'SUPPORT', nome: 'Apoio ao estudante' },
  { cargo: 'STAFF', nome: 'Colaborador (geral)' },
]

/** Módulos que NUNCA podem ser bloqueados nem receber concessão: sustentam o shell (marca, avisos) e esta própria tela. */
export const MODULOS_ESSENCIAIS = ['core', 'acesso']

export const MODULOS: Array<{ modulo: string; nome: string; grupo: string }> = [
  { modulo: 'core', nome: 'Núcleo (marca, avisos, auditoria)', grupo: 'Essenciais' },
  { modulo: 'acesso', nome: 'Acesso por cargo', grupo: 'Essenciais' },
  { modulo: 'academico', nome: 'Acadêmico (alunos, matrizes, turmas)', grupo: 'Acadêmico' },
  { modulo: 'desenvolvimento', nome: 'Programas de desenvolvimento', grupo: 'Acadêmico' },
  { modulo: 'conteudo', nome: 'Conteúdo e AVA', grupo: 'Acadêmico' },
  { modulo: 'provas', nome: 'Provas com IA', grupo: 'Acadêmico' },
  { modulo: 'notas', nome: 'Notas e diário', grupo: 'Acadêmico' },
  { modulo: 'calendario', nome: 'Calendário e salas', grupo: 'Acadêmico' },
  { modulo: 'presenca', nome: 'Presença e acesso', grupo: 'Acadêmico' },
  { modulo: 'modalidades', nome: 'Modalidades, EAD e pós', grupo: 'Acadêmico' },
  { modulo: 'desempenho', nome: 'ENADE, OAB e desempenho', grupo: 'Acadêmico' },
  { modulo: 'exames', nome: 'ENADE · ENAMED · OAB (simulados)', grupo: 'Acadêmico' },
  { modulo: 'campos-pratica', nome: 'Campos de prática e estágios', grupo: 'Acadêmico' },
  { modulo: 'biblioteca', nome: 'Biblioteca', grupo: 'Acadêmico' },
  { modulo: 'pesquisa', nome: 'Pesquisa e revista', grupo: 'Acadêmico' },
  { modulo: 'portal2', nome: 'Portais e ambientes de ensino', grupo: 'Acadêmico' },
  { modulo: 'admissoes', nome: 'Admissões e vestibular', grupo: 'Secretaria e relacionamento' },
  { modulo: 'secretaria', nome: 'Secretaria e certificados', grupo: 'Secretaria e relacionamento' },
  { modulo: 'analise-docs', nome: 'Agente de documentos (IA)', grupo: 'Secretaria e relacionamento' },
  { modulo: 'atendimento', nome: 'Atendimento e protocolos', grupo: 'Secretaria e relacionamento' },
  { modulo: 'apoio', nome: 'Apoio, ouvidoria e egressos', grupo: 'Secretaria e relacionamento' },
  { modulo: 'comunicacao', nome: 'Comunicação omnichannel', grupo: 'Secretaria e relacionamento' },
  { modulo: 'marketing', nome: 'Marketing', grupo: 'Secretaria e relacionamento' },
  { modulo: 'feedback', nome: 'Central de feedback', grupo: 'Secretaria e relacionamento' },
  { modulo: 'mensagens', nome: 'Mensageiro interno entre departamentos', grupo: 'Secretaria e relacionamento' },
  { modulo: 'financeiro', nome: 'Financeiro acadêmico', grupo: 'Financeiro' },
  { modulo: 'tesouraria', nome: 'Tesouraria', grupo: 'Financeiro' },
  { modulo: 'cobranca', nome: 'Cobrança', grupo: 'Financeiro' },
  { modulo: 'boletos', nome: 'Caixa de boletos', grupo: 'Financeiro' },
  { modulo: 'suprimentos', nome: 'Compras, estoque e vendas', grupo: 'Administrativo' },
  { modulo: 'infraestrutura', nome: 'Infraestrutura e patrimônio', grupo: 'Administrativo' },
  { modulo: 'rh', nome: 'RH e gestão de pessoas', grupo: 'Administrativo' },
  { modulo: 'juridico', nome: 'Jurídico', grupo: 'Administrativo' },
  { modulo: 'reitoria', nome: 'Reitoria e painéis executivos', grupo: 'Gestão e conformidade' },
  { modulo: 'governanca', nome: 'Governança e PDI', grupo: 'Gestão e conformidade' },
  { modulo: 'regulatorio', nome: 'Regulatório MEC', grupo: 'Gestão e conformidade' },
  { modulo: 'jornadas', nome: 'Jornadas e fluxogramas', grupo: 'Gestão e conformidade' },
  { modulo: 'lgpd', nome: 'Central LGPD', grupo: 'Gestão e conformidade' },
]

export const cargoValido = (c: string) => CARGOS.some((x) => x.cargo === c)
export const moduloValido = (m: string) => MODULOS.some((x) => x.modulo === m)
export const ehSuper = (c: string) => CARGOS_SUPER.includes(String(c || '').toUpperCase())
export const ehEssencial = (m: string) => MODULOS_ESSENCIAIS.includes(m)
