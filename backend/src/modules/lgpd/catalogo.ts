import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { soDigitos } from './mascara'

// ============================================================
// Catálogo de entidades do EduMaster por titular (aluno, candidato, egresso).
// Define, para cada tabela com dados pessoais: como achar os registros da pessoa, se é dado sensível e o
// que fazer num pedido de anonimização/eliminação (art. 18, IV e VI):
//   MANTER      - preservado por obrigação legal/regulatória ou exercício regular de direitos (art. 16, I e art. 7º, II/VI).
//                 É EXPORTADO (acesso/portabilidade) mas NÃO é apagado.
//   ANONIMIZAR  - campos pessoais são substituídos/limpos; o registro (sem identificação) permanece.
//   ELIMINAR    - registro removido (dado puramente pessoal/derivado, sem dever de guarda).
// Qualquer tabela com studentId/candidatoId/egressoId que NÃO estiver aqui é varrida automaticamente (DMMF do Prisma),
// exportada e tratada como MANTER "não classificado" até o DPO decidir - nada fica de fora do pacote do titular.
//
// EXCEÇÃO DO ART. 16 (documentada): o histórico escolar, diplomas, certificados, notas, frequência e registros
// financeiros/fiscais NÃO são apagados nem anonimizados, pois a instituição está obrigada a guardá-los
// (LDB - Lei 9.394/96; Portarias/Resoluções do MEC e do CNE sobre guarda de acervo acadêmico; Código Tributário
// Nacional e legislação fiscal - 5 anos). Pode ser aplicado bloqueio de uso para outros fins.
// ============================================================

export type RefPessoa = 'student' | 'candidato' | 'egresso' | 'user' | 'contato' | 'destino'
export type AcaoEntidade = 'MANTER' | 'ANONIMIZAR' | 'ELIMINAR'

export interface Entidade {
  model: string                       // delegate do Prisma
  titulo: string
  categoria: 'IDENTIFICACAO' | 'ACADEMICO' | 'FINANCEIRO' | 'SAUDE' | 'COMUNICACAO' | 'DESEMPENHO' | 'SOCIOECONOMICO' | 'DISCIPLINAR' | 'CAPTACAO' | 'EGRESSO' | 'ESTAGIO' | 'BIBLIOTECA'
  sensivel?: boolean
  onde: Array<{ ref: RefPessoa; campo: string }>
  semTenant?: boolean                 // tabela sem tenantId (escopo pelo vínculo com o aluno, já validado)
  acao: AcaoEntidade
  campos?: Record<string, unknown>    // ANONIMIZAR: valores novos
  base?: string                       // MANTER: fundamento legal para guardar
  minMeses?: number                   // guarda mínima antes de anonimizar/eliminar (usa createdAt)
  soSemMatricula?: boolean            // só atua em candidatos que NÃO se matricularam (os demais compõem o dossiê do aluno)
  omitir?: string[]
}

export const ANON = 'Titular anonimizado'
const REM = '[conteúdo removido - LGPD]'
const BASE_ACAD = 'Obrigação legal/regulatória de guarda do acervo acadêmico (LDB 9.394/96 e normas do MEC) - LGPD art. 16, I e art. 7º, II'
const BASE_FISCAL = 'Obrigação legal fiscal/contábil (CTN e legislação tributária, 5 anos) - LGPD art. 16, I e art. 7º, II'
const BASE_DIREITOS = 'Exercício regular de direitos em processo administrativo/judicial - LGPD art. 7º, VI'

const A = (campo = 'studentId') => [{ ref: 'student' as RefPessoa, campo }]

export const CATALOGO: Entidade[] = [
  // ---- núcleo acadêmico (preservado)
  { model: 'enrollment', titulo: 'Matrículas', categoria: 'ACADEMICO', onde: A(), semTenant: true, acao: 'MANTER', base: BASE_ACAD },
  { model: 'attendance', titulo: 'Frequência', categoria: 'ACADEMICO', onde: A(), semTenant: true, acao: 'MANTER', base: BASE_ACAD },
  { model: 'assessmentAttempt', titulo: 'Avaliações realizadas', categoria: 'ACADEMICO', onde: A(), semTenant: true, acao: 'MANTER', base: BASE_ACAD },
  { model: 'certificate', titulo: 'Certificados acadêmicos', categoria: 'ACADEMICO', onde: A(), semTenant: true, acao: 'MANTER', base: BASE_ACAD },
  { model: 'ntLancamento', titulo: 'Notas lançadas', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'ntLancamentoHistorico', titulo: 'Histórico de alterações de notas', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'ntResultado', titulo: 'Resultados finais por disciplina (histórico escolar)', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'ntRevisao', titulo: 'Pedidos de revisão de nota', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secDiploma', titulo: 'Diplomas', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secDocumentoEmitido', titulo: 'Documentos acadêmicos emitidos', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secCertificado', titulo: 'Certificados emitidos (com verificação pública)', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secProtocolo', titulo: 'Requerimentos da secretaria', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secConferencia', titulo: 'Conferência de documentos', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secColacaoFormando', titulo: 'Colação de grau', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'secArquivoItem', titulo: 'Pasta do aluno (arquivo)', categoria: 'ACADEMICO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  { model: 'admMatricula', titulo: 'Matrícula/contrato de prestação de serviços', categoria: 'ACADEMICO', onde: [{ ref: 'candidato', campo: 'candidatoId' }, { ref: 'student', campo: 'studentId' }], acao: 'MANTER', base: 'Execução de contrato (art. 7º, V) e ' + BASE_ACAD },
  // ---- financeiro (preservado)
  { model: 'accountReceivable', titulo: 'Mensalidades e cobranças', categoria: 'FINANCEIRO', onde: A(), acao: 'MANTER', base: BASE_FISCAL },
  // ---- disciplinar / socioeconômico (preservado, sensível)
  { model: 'apoOcorrencia', titulo: 'Ocorrências disciplinares', categoria: 'DISCIPLINAR', sensivel: true, onde: A(), acao: 'MANTER', base: BASE_DIREITOS },
  { model: 'apoInscricaoBolsa', titulo: 'Inscrições de bolsa (renda familiar)', categoria: 'SOCIOECONOMICO', sensivel: true, onde: A(), acao: 'MANTER', base: 'Prestação de contas de bolsas e benefícios - ' + BASE_DIREITOS },
  { model: 'apoConcessaoBolsa', titulo: 'Bolsas concedidas', categoria: 'SOCIOECONOMICO', onde: A(), acao: 'MANTER', base: 'Execução de contrato e ' + BASE_FISCAL },
  { model: 'admBolsaConcessao', titulo: 'Bolsas do processo seletivo', categoria: 'SOCIOECONOMICO', onde: [{ ref: 'student', campo: 'studentId' }, { ref: 'candidato', campo: 'candidatoId' }], acao: 'MANTER', base: 'Execução de contrato e ' + BASE_FISCAL },
  // ---- estágio (Lei 11.788/2008)
  { model: 'apoTermoEstagio', titulo: 'Termos de estágio', categoria: 'ESTAGIO', onde: A(), acao: 'MANTER', base: 'Lei 11.788/2008 (estágio) e ' + BASE_ACAD },
  { model: 'modEstagio', titulo: 'Estágios', categoria: 'ESTAGIO', onde: A(), acao: 'MANTER', base: 'Lei 11.788/2008 (estágio) e ' + BASE_ACAD },
  { model: 'modHoraPratica', titulo: 'Horas práticas', categoria: 'ESTAGIO', onde: A(), acao: 'MANTER', base: BASE_ACAD },
  // ---- saúde / acessibilidade (sensível; anonimiza)
  { model: 'apoAtendimento', titulo: 'Atendimentos de apoio (NAE/NAPNE/psicopedagógico)', categoria: 'SAUDE', sensivel: true, onde: A(), acao: 'ANONIMIZAR', minMeses: 60, campos: { motivo: null, relato: null, encaminhamentos: null },
    base: 'Guarda mínima de 5 anos do registro de atendimento profissional (verificar a norma do conselho profissional aplicável) - art. 16, I' },
  { model: 'apoPlanoAee', titulo: 'Planos de atendimento educacional especializado', categoria: 'SAUDE', sensivel: true, onde: A(), acao: 'ANONIMIZAR', campos: { necessidade: REM, laudoReferencia: null, observacoes: null, recursos: Prisma.DbNull, encerradoMotivo: null } },
  { model: 'apoRiscoSnapshot', titulo: 'Perfil de risco de evasão (decisão automatizada - art. 20)', categoria: 'DESEMPENHO', onde: A(), acao: 'ELIMINAR' },
  { model: 'apoPlanoAcao', titulo: 'Planos de ação de permanência', categoria: 'DESEMPENHO', onde: A(), acao: 'ANONIMIZAR', campos: { acoesSugeridas: Prisma.DbNull, resultado: null } },
  // ---- comunicação
  { model: 'comContato', titulo: 'Contatos de comunicação', categoria: 'COMUNICACAO', onde: [{ ref: 'student', campo: 'studentId' }, { ref: 'candidato', campo: 'candidatoId' }, { ref: 'user', campo: 'userId' }], acao: 'ANONIMIZAR',
    campos: { nome: ANON, email: null, telefone: null, telegramChatId: null, instagramId: null, facebookId: null, documento: null, ativo: false, tags: [] } },
  { model: 'comPreferencia', titulo: 'Preferências de comunicação (opt-in/opt-out)', categoria: 'COMUNICACAO', onde: [{ ref: 'contato', campo: 'contatoId' }], acao: 'MANTER', base: 'Prova do consentimento/oposição (art. 8º, §2º) e ' + BASE_DIREITOS },
  { model: 'eduNotification', titulo: 'Mensagens enviadas', categoria: 'COMUNICACAO', onde: [{ ref: 'student', campo: 'studentId' }, { ref: 'user', campo: 'userId' }, { ref: 'destino', campo: 'destino' }], acao: 'ANONIMIZAR', campos: { mensagem: REM, destino: null, assunto: null, erro: null } },
  { model: 'apoManifestacao', titulo: 'Manifestações da ouvidoria', categoria: 'COMUNICACAO', onde: [{ ref: 'student', campo: 'studentId' }, { ref: 'user', campo: 'userId' }], acao: 'ANONIMIZAR', campos: { nome: null, email: null, telefone: null, studentId: null, userId: null, anonima: true } },
  // ---- biblioteca
  { model: 'bibLeitor', titulo: 'Cadastro de leitor', categoria: 'BIBLIOTECA', onde: [{ ref: 'student', campo: 'studentId' }, { ref: 'user', campo: 'userId' }], acao: 'ANONIMIZAR', campos: { nome: ANON, documento: null, email: null, telefone: null, ativo: false } },
  // ---- captação
  { model: 'admCandidato', titulo: 'Candidatura (vestibular/lead)', categoria: 'CAPTACAO', onde: [{ ref: 'candidato', campo: 'id' }], acao: 'ANONIMIZAR', soSemMatricula: true,
    campos: { nome: ANON, cpf: null, email: null, telefone: null, dataNascimento: null, ipOrigem: null, dados: Prisma.DbNull, utmSource: null, utmMedium: null, utmCampaign: null, motivoDesistencia: null, consentimentoMarketing: false },
    base: 'Candidato matriculado: os dados compõem o dossiê do aluno (acervo acadêmico)' },
  { model: 'admInteracao', titulo: 'Interações comerciais com o candidato', categoria: 'CAPTACAO', onde: [{ ref: 'candidato', campo: 'candidatoId' }], acao: 'ELIMINAR', soSemMatricula: true },
  { model: 'admDocumentoCandidato', titulo: 'Documentos do candidato', categoria: 'CAPTACAO', onde: [{ ref: 'candidato', campo: 'candidatoId' }], acao: 'ELIMINAR', soSemMatricula: true },
  { model: 'admResultadoProva', titulo: 'Notas do processo seletivo', categoria: 'CAPTACAO', onde: [{ ref: 'candidato', campo: 'candidatoId' }], acao: 'ELIMINAR', soSemMatricula: true },
  // ---- egressos
  { model: 'apoEgresso', titulo: 'Cadastro de egresso', categoria: 'EGRESSO', onde: [{ ref: 'egresso', campo: 'id' }, { ref: 'student', campo: 'studentId' }], acao: 'ANONIMIZAR',
    campos: { nome: ANON, email: null, telefone: null, cpf: null, cidade: null, uf: null, empregadorAtual: null, cargoAtual: null, faixaSalarial: null, linkedin: null, consenteContato: false } },
  { model: 'apoEgressoTrajetoria', titulo: 'Trajetória profissional do egresso', categoria: 'EGRESSO', onde: [{ ref: 'egresso', campo: 'egressoId' }], acao: 'ELIMINAR' },
  // ---- registros do próprio módulo LGPD (prova de consentimento e de atendimento: pseudonimizados, não apagados)
  { model: 'lgpConsentimento', titulo: 'Consentimentos registrados', categoria: 'IDENTIFICACAO', onde: [{ ref: 'student', campo: 'titularId' }, { ref: 'candidato', campo: 'titularId' }, { ref: 'egresso', campo: 'titularId' }], acao: 'ANONIMIZAR',
    campos: { titularNome: ANON, titularEmail: null, titularDocHash: null, titularDocMascarado: null, titularId: null },
    base: 'O ônus da prova do consentimento é do controlador (art. 8º, §2º): a data, a finalidade, a versão do texto e a revogação permanecem sem identificação' },
  { model: 'lgpSolicitacao', titulo: 'Solicitações do titular (protocolo)', categoria: 'IDENTIFICACAO', onde: [{ ref: 'student', campo: 'titularId' }, { ref: 'candidato', campo: 'titularId' }, { ref: 'egresso', campo: 'titularId' }], acao: 'ANONIMIZAR',
    campos: { nome: ANON, email: '', telefone: null, docHash: null, docMascarado: null, descricao: null, dados: Prisma.DbNull, responsavelNome: null },
    base: 'O registro de que o direito foi exercido e atendido é mantido para prestação de contas (art. 6º, X); a identificação é removida' },
  { model: 'lgpResponsavel', titulo: 'Responsáveis legais (menores)', categoria: 'IDENTIFICACAO', onde: [{ ref: 'student', campo: 'titularId' }, { ref: 'candidato', campo: 'titularId' }, { ref: 'egresso', campo: 'titularId' }], acao: 'ANONIMIZAR',
    campos: { nome: ANON, email: null, telefone: null, docHash: null, docMascarado: null, titularNome: null, anonimizadoEm: () => new Date() } },
]

const ANOTADOS = new Set(CATALOGO.map((e) => e.model))

// ------------------------------------------------------------------ descoberta automática (DMMF)
const lcFirst = (s: string) => s[0].toLowerCase() + s.slice(1)
const MODELOS = Prisma.dmmf.datamodel.models
export function temCampo(delegate: string, campo: string): boolean {
  const m = MODELOS.find((x) => lcFirst(x.name) === delegate)
  return !!m?.fields.some((f) => f.name === campo)
}

/** Tabelas com vínculo ao aluno/candidato/egresso que não estão no catálogo (exportadas e tratadas como MANTER). */
export function entidadesNaoClassificadas(): Entidade[] {
  const out: Entidade[] = []
  for (const m of MODELOS) {
    const d = lcFirst(m.name)
    if (ANOTADOS.has(d) || /^(Seg|Lgp)/.test(m.name) || m.name === 'Student' || m.name === 'EduAuditEvent') continue
    const onde: Entidade['onde'] = []
    for (const [ref, campo] of [['student', 'studentId'], ['candidato', 'candidatoId'], ['egresso', 'egressoId']] as const) {
      if (m.fields.some((f) => f.name === campo && f.kind === 'scalar')) onde.push({ ref, campo })
    }
    if (!onde.length) continue
    out.push({ model: d, titulo: m.name, categoria: 'ACADEMICO', onde, semTenant: !m.fields.some((f) => f.name === 'tenantId'), acao: 'MANTER', base: 'Registro acadêmico/operacional vinculado ao titular - NÃO CLASSIFICADO: o encarregado deve revisar antes de eliminar' })
  }
  return out
}

export const todasEntidades = () => [...CATALOGO, ...entidadesNaoClassificadas()]

/** Valida (usado nos testes) se cada modelo/campo do catálogo existe no schema do Prisma. */
export function validarCatalogo(): string[] {
  const erros: string[] = []
  for (const e of CATALOGO) {
    if (!MODELOS.some((x) => lcFirst(x.name) === e.model)) { erros.push(`modelo inexistente: ${e.model}`); continue }
    for (const o of e.onde) if (!temCampo(e.model, o.campo)) erros.push(`${e.model}: campo de vínculo inexistente ${o.campo}`)
    for (const c of Object.keys(e.campos ?? {})) if (!temCampo(e.model, c)) erros.push(`${e.model}: campo a anonimizar inexistente ${c}`)
    if (!e.semTenant && !temCampo(e.model, 'tenantId')) erros.push(`${e.model}: sem tenantId (marque semTenant)`)
  }
  return erros
}

// ------------------------------------------------------------------ resolução da pessoa
export type TitularTipo = 'ALUNO' | 'CANDIDATO' | 'EGRESSO' | 'RESPONSAVEL'

export interface Pessoa {
  tenantId: string
  tipo: TitularTipo
  id: string
  nome: string
  studentId: string | null
  userId: string | null
  userRole: string | null
  candidatoIds: string[]
  egressoIds: string[]
  contatoIds: string[]
  emails: string[]
  telefones: string[]
  docs: string[]                         // dígitos de CPF
  dataNascimento: Date | null
  matriculado: boolean                    // existe vínculo de matrícula (candidato virou aluno)
  todosIds: string[]
}

const uniq = <T>(a: T[]) => [...new Set(a.filter((x) => x !== null && x !== undefined && (x as any) !== ''))] as T[]

export async function resolverPessoa(tenantId: string, tipo: TitularTipo, id: string): Promise<Pessoa | null> {
  let studentId: string | null = null
  let candidatoIds: string[] = []
  let egressoIds: string[] = []
  if (tipo === 'ALUNO') studentId = id
  else if (tipo === 'CANDIDATO') candidatoIds = [id]
  else if (tipo === 'EGRESSO') egressoIds = [id]
  else return null

  if (tipo === 'CANDIDATO') {
    const c = await prisma.admCandidato.findFirst({ where: { id, tenantId }, select: { id: true } })
    if (!c) return null
    const m = await prisma.admMatricula.findFirst({ where: { tenantId, candidatoId: id, studentId: { not: null } }, select: { studentId: true } })
    studentId = m?.studentId ?? null
  } else if (tipo === 'EGRESSO') {
    const e = await prisma.apoEgresso.findFirst({ where: { id, tenantId }, select: { studentId: true } })
    if (!e) return null
    studentId = e.studentId
  }
  const aluno = studentId ? await prisma.student.findFirst({ where: { id: studentId, tenantId } }) : null
  if (tipo === 'ALUNO' && !aluno) return null
  if (!aluno) studentId = null

  if (studentId) {
    const ms = await prisma.admMatricula.findMany({ where: { tenantId, studentId }, select: { candidatoId: true } })
    candidatoIds = uniq([...candidatoIds, ...ms.map((m) => m.candidatoId)])
    const es = await prisma.apoEgresso.findMany({ where: { tenantId, studentId }, select: { id: true } })
    egressoIds = uniq([...egressoIds, ...es.map((e) => e.id)])
  }
  const candidatos = candidatoIds.length ? await prisma.admCandidato.findMany({ where: { tenantId, id: { in: candidatoIds } } }) : []
  const egressos = egressoIds.length ? await prisma.apoEgresso.findMany({ where: { tenantId, id: { in: egressoIds } } }) : []
  const user = aluno?.userId ? await prisma.user.findFirst({ where: { id: aluno.userId, tenantId }, select: { id: true, email: true, role: true, phone: true, firstName: true, lastName: true } }) : null
  const matriculado = !!studentId || (candidatoIds.length > 0 && (await prisma.admMatricula.count({ where: { tenantId, candidatoId: { in: candidatoIds } } })) > 0)

  const emails = uniq([user?.email, ...candidatos.map((c) => c.email), ...egressos.map((e) => e.email)].map((e) => (e ? String(e).toLowerCase() : null)))
  const telefones = uniq([user?.phone, ...candidatos.map((c) => c.telefone), ...egressos.map((e) => e.telefone)].map((t) => (t ? String(t) : null)))
  const docs = uniq([aluno?.cpf, ...candidatos.map((c) => c.cpf), ...egressos.map((e) => e.cpf)].map((d) => (d ? soDigitos(d) : null)).filter((d) => d && d.length === 11) as string[])

  const orC: any[] = []
  if (studentId) orC.push({ studentId })
  if (candidatoIds.length) orC.push({ candidatoId: { in: candidatoIds } })
  if (user) orC.push({ userId: user.id })
  const contatos = orC.length ? await prisma.comContato.findMany({ where: { tenantId, OR: orC }, select: { id: true, email: true, telefone: true } }) : []

  const nome = aluno?.nomeCompleto || candidatos[0]?.nome || egressos[0]?.nome || ''
  return {
    tenantId, tipo, id, nome, studentId, userId: user?.id ?? null, userRole: user?.role ?? null,
    candidatoIds, egressoIds, contatoIds: contatos.map((c) => c.id),
    emails: uniq([...emails, ...contatos.map((c) => (c.email ? c.email.toLowerCase() : null))]) as string[],
    telefones: uniq([...telefones, ...contatos.map((c) => c.telefone)]) as string[],
    docs, dataNascimento: aluno?.dataNascimento ?? candidatos[0]?.dataNascimento ?? null, matriculado,
    todosIds: uniq([id, studentId, ...candidatoIds, ...egressoIds].filter(Boolean) as string[]),
  }
}

/** Monta o `where` do Prisma para uma entidade e uma pessoa (null = a pessoa não tem como ter registros ali). */
export function whereDaEntidade(e: Entidade, p: Pessoa): any | null {
  const ors: any[] = []
  for (const o of e.onde) {
    let valores: string[] = []
    if (o.ref === 'student') valores = p.studentId ? [p.studentId] : []
    else if (o.ref === 'candidato') valores = p.candidatoIds
    else if (o.ref === 'egresso') valores = p.egressoIds
    else if (o.ref === 'user') valores = p.userId ? [p.userId] : []
    else if (o.ref === 'contato') valores = p.contatoIds
    else if (o.ref === 'destino') valores = [...p.emails, ...p.telefones]
    if (!valores.length) continue
    // titularId do módulo LGPD vale para qualquer id da pessoa
    if (e.model.startsWith('lgp')) { ors.push({ [o.campo]: { in: p.todosIds } }); break }
    ors.push({ [o.campo]: { in: valores } })
  }
  if (!ors.length) return null
  const where: any = ors.length === 1 ? ors[0] : { OR: ors }
  return e.semTenant ? where : { AND: [{ tenantId: p.tenantId }, where] }
}
