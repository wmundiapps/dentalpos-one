import { prisma } from '../../lib/prisma'

// Catálogos padrão para uma IES brasileira (idempotente: só cria o que não existe, nunca sobrescreve).

const TIPOS = [
  { codigo: 'DECL_MATRICULA', nome: 'Declaração de matrícula', categoria: 'DOCUMENTO', slaDias: 2, taxa: 0, geraDocumento: 'DECLARACAO_MATRICULA' },
  { codigo: 'DECL_VINCULO', nome: 'Declaração de vínculo e frequência', categoria: 'DOCUMENTO', slaDias: 3, taxa: 0, geraDocumento: 'DECLARACAO_VINCULO' },
  { codigo: 'HISTORICO_ESCOLAR', nome: 'Histórico escolar', categoria: 'DOCUMENTO', slaDias: 5, taxa: 0, geraDocumento: 'HISTORICO_ESCOLAR' },
  { codigo: 'COMPROVANTE_CONCLUSAO', nome: 'Comprovante de conclusão de curso', categoria: 'DOCUMENTO', slaDias: 5, taxa: 0, geraDocumento: 'COMPROVANTE_CONCLUSAO' },
  { codigo: 'TRANCAMENTO', nome: 'Trancamento de matrícula', categoria: 'ACADEMICO', slaDias: 5, taxa: 0, exigeAnexo: false, descricao: 'Suspensão temporária do vínculo, conforme regimento.' },
  { codigo: 'DESTRANCAMENTO', nome: 'Retorno de trancamento', categoria: 'ACADEMICO', slaDias: 5, taxa: 0 },
  { codigo: 'CANCELAMENTO', nome: 'Cancelamento de matrícula', categoria: 'ACADEMICO', slaDias: 7, taxa: 0, descricao: 'Desligamento definitivo a pedido do aluno.' },
  { codigo: 'TRANSFERENCIA_EXTERNA', nome: 'Transferência de/para outra instituição', categoria: 'ACADEMICO', slaDias: 15, taxa: 0, exigeAnexo: true, checklist: 'CHK_TRANSFERENCIA' },
  { codigo: 'TRANSFERENCIA_INTERNA', nome: 'Transferência de curso/turno/polo', categoria: 'ACADEMICO', slaDias: 10, taxa: 0 },
  { codigo: 'SEGUNDA_CHAMADA', nome: 'Segunda chamada de avaliação', categoria: 'ACADEMICO', slaDias: 5, taxa: 30, exigeAnexo: true, descricao: 'Anexe justificativa/atestado dentro de 3 dias da avaliação.', camposExtras: [{ chave: 'disciplina', rotulo: 'Disciplina', obrigatorio: true }, { chave: 'dataAvaliacao', rotulo: 'Data da avaliação', obrigatorio: true }] },
  { codigo: 'REVISAO_NOTA', nome: 'Revisão de nota', categoria: 'ACADEMICO', slaDias: 7, taxa: 0, camposExtras: [{ chave: 'disciplina', rotulo: 'Disciplina', obrigatorio: true }, { chave: 'avaliacao', rotulo: 'Avaliação', obrigatorio: true }] },
  { codigo: 'APROVEITAMENTO_ESTUDOS', nome: 'Aproveitamento de estudos', categoria: 'ACADEMICO', slaDias: 15, taxa: 0, exigeAnexo: true, checklist: 'CHK_APROVEITAMENTO', descricao: 'Anexe histórico e ementas das disciplinas cursadas.' },
  { codigo: 'DISPENSA_DISCIPLINA', nome: 'Dispensa de disciplina', categoria: 'ACADEMICO', slaDias: 10, taxa: 0, exigeAnexo: true },
  { codigo: 'ESTAGIO', nome: 'Documentação de estágio', categoria: 'ACADEMICO', slaDias: 5, taxa: 0, exigeAnexo: true, checklist: 'CHK_ESTAGIO' },
  { codigo: 'SEGUNDA_VIA_CARTEIRINHA', nome: '2ª via de carteirinha', categoria: 'DOCUMENTO', slaDias: 5, taxa: 25 },
  { codigo: 'SEGUNDA_VIA_DIPLOMA', nome: '2ª via de diploma', categoria: 'DIPLOMA', slaDias: 30, taxa: 150, exigeAnexo: true, descricao: 'Anexe boletim de ocorrência (extravio) ou diploma danificado.' },
  { codigo: 'EMISSAO_DIPLOMA', nome: 'Emissão e registro de diploma', categoria: 'DIPLOMA', slaDias: 45, taxa: 0, checklist: 'CHK_DIPLOMA' },
  { codigo: 'CERTIFICADO_EXTENSAO', nome: 'Certificado de atividade complementar/extensão', categoria: 'DOCUMENTO', slaDias: 7, taxa: 0, exigeAnexo: true },
  { codigo: 'ATUALIZACAO_CADASTRAL', nome: 'Atualização cadastral', categoria: 'GERAL', slaDias: 3, taxa: 0 },
  { codigo: 'OUTROS', nome: 'Outros requerimentos', categoria: 'GERAL', slaDias: 10, taxa: 0 },
] as const

const CHECKLISTS = [
  {
    codigo: 'CHK_MATRICULA', nome: 'Documentos de matrícula', processo: 'MATRICULA',
    itens: [
      ['Documento de identidade (RG/CNH)', true, null, 'nome, número, órgão emissor, foto legível'],
      ['CPF', true, null, 'cpf'],
      ['Certidão de nascimento ou casamento', true, null, 'nome, data'],
      ['Comprovante de residência', true, 90, 'endereço, data'],
      ['Histórico escolar do ensino médio', true, null, 'instituição, conclusão, nome do aluno'],
      ['Certificado de conclusão do ensino médio', true, null, 'conclusão, instituição'],
      ['Título de eleitor e quitação eleitoral', false, null, 'zona, seção'],
      ['Certificado de reservista (sexo masculino)', false, null, 'reservista'],
      ['Foto 3x4 / foto digital', true, null, 'rosto visível'],
      ['Contrato de prestação de serviços assinado', true, null, 'assinatura, data'],
    ],
  },
  {
    codigo: 'CHK_TRANSFERENCIA', nome: 'Transferência externa', processo: 'TRANSFERENCIA',
    itens: [
      ['Declaração de vínculo da instituição de origem', true, 60, 'situação regular, curso, instituição'],
      ['Histórico escolar do ensino superior', true, 180, 'disciplinas, notas, carga horária'],
      ['Programas/ementas das disciplinas cursadas', true, null, 'ementa, carga horária'],
      ['Guia de transferência / declaração de situação no ENADE', false, null, 'enade'],
      ['Documento de identidade e CPF', true, null, 'nome, número'],
      ['Comprovante de conclusão do ensino médio', true, null, 'conclusão'],
    ],
  },
  {
    codigo: 'CHK_APROVEITAMENTO', nome: 'Aproveitamento de estudos', processo: 'APROVEITAMENTO',
    itens: [
      ['Histórico escolar com notas e carga horária', true, 365, 'disciplinas, notas, carga horária'],
      ['Ementas/conteúdo programático autenticados', true, null, 'ementa, carga horária'],
      ['Declaração de reconhecimento/autorização do curso de origem', false, null, 'portaria, reconhecimento'],
      ['Requerimento assinado pelo aluno', true, null, 'assinatura'],
    ],
  },
  {
    codigo: 'CHK_ESTAGIO', nome: 'Estágio supervisionado', processo: 'ESTAGIO',
    itens: [
      ['Termo de compromisso de estágio (TCE) assinado pelas 3 partes', true, null, 'aluno, concedente, instituição, assinatura'],
      ['Plano de atividades de estágio', true, null, 'atividades, carga horária, supervisor'],
      ['Apólice de seguro de acidentes pessoais', true, 365, 'apólice, vigência, segurado'],
      ['Comprovante de matrícula do aluno', true, 30, 'matrícula'],
      ['Convênio com a unidade concedente', false, null, 'convênio, vigência'],
    ],
  },
  {
    codigo: 'CHK_DIPLOMA', nome: 'Emissão de diploma', processo: 'DIPLOMA',
    itens: [
      ['Histórico escolar completo e integralizado', true, null, 'carga horária, aprovação'],
      ['Ata/registro de colação de grau', true, null, 'data, colação'],
      ['Situação regular no ENADE', true, null, 'enade'],
      ['Documento de identidade e CPF', true, null, 'nome, número'],
      ['Certidão de nascimento ou casamento', true, null, 'nome, data'],
      ['Certificado e histórico do ensino médio', true, null, 'conclusão'],
      ['Nada consta (biblioteca/financeiro)', true, 60, 'quitação'],
    ],
  },
  {
    codigo: 'CHK_COLACAO', nome: 'Colação de grau', processo: 'COLACAO',
    itens: [
      ['Requerimento de colação de grau', true, null, 'assinatura'],
      ['Nada consta financeiro', true, 30, 'quitação'],
      ['Nada consta biblioteca', true, 30, 'quitação'],
      ['Integralização curricular conferida pela coordenação', true, null, 'carga horária, estágio, TCC, atividades complementares'],
    ],
  },
] as const

const CERT_MODELOS = [
  { codigo: 'CURSO_CONCLUSAO', nome: 'Certificado de conclusão de curso', tipo: 'CURSO', titulo: 'CERTIFICADO', texto: 'Certificamos que <b>{{nome}}</b>{{cpf}} concluiu com aproveitamento o curso <b>{{evento}}</b>, com carga horária de <b>{{cargaHoraria}} horas</b>, realizado em {{periodo}}.<br/>{{data}}.' },
  { codigo: 'EXTENSAO', nome: 'Certificado de extensão', tipo: 'EXTENSAO', titulo: 'CERTIFICADO DE EXTENSÃO', texto: 'Certificamos que <b>{{nome}}</b> participou da atividade de extensão <b>{{evento}}</b>, perfazendo <b>{{cargaHoraria}} horas</b>, no período de {{periodo}}.<br/>{{data}}.' },
  { codigo: 'EVENTO_PALESTRA', nome: 'Certificado de palestra/evento', tipo: 'EVENTO', titulo: 'CERTIFICADO', texto: 'Certificamos que <b>{{nome}}</b> participou do evento <b>{{evento}}</b>, realizado em {{periodo}}, com carga horária de {{cargaHoraria}} horas.<br/>{{data}}.' },
  { codigo: 'POS_GRADUACAO', nome: 'Certificado de pós-graduação', tipo: 'POS_GRADUACAO', titulo: 'CERTIFICADO DE PÓS-GRADUAÇÃO', texto: 'Certificamos que <b>{{nome}}</b> concluiu o curso de pós-graduação <i>lato sensu</i> <b>{{evento}}</b>, com carga horária de <b>{{cargaHoraria}} horas</b>, tendo cumprido todos os requisitos regimentais ({{periodo}}).<br/>{{data}}.' },
  { codigo: 'MONITORIA', nome: 'Certificado de monitoria', tipo: 'MONITORIA', titulo: 'CERTIFICADO DE MONITORIA', texto: 'Certificamos que <b>{{nome}}</b> exerceu a função de monitor(a) em <b>{{evento}}</b>, totalizando <b>{{cargaHoraria}} horas</b> ({{periodo}}).<br/>{{data}}.' },
  { codigo: 'PARTICIPACAO', nome: 'Certificado de participação', tipo: 'PARTICIPACAO', titulo: 'CERTIFICADO DE PARTICIPAÇÃO', texto: 'Certificamos que <b>{{nome}}</b> participou de <b>{{evento}}</b> ({{periodo}}), com carga horária de {{cargaHoraria}} horas.<br/>{{data}}.' },
] as const

// Prazos sugeridos (conferir com a CPAD/regimento da instituição — referência: Portaria MEC nº 1.224/2013).
const TEMPORALIDADE = [
  { codigo: 'DIPLOMA_REGISTRO', tipoDocumento: 'Livros de registro de diplomas', prazoCorrenteAnos: 0, prazoIntermediarioAnos: 0, destinacao: 'GUARDA_PERMANENTE', fundamento: 'Portaria MEC 1.224/2013' },
  { codigo: 'HISTORICO_ESCOLAR', tipoDocumento: 'Histórico escolar / dossiê acadêmico do aluno formado', prazoCorrenteAnos: 0, prazoIntermediarioAnos: 0, destinacao: 'GUARDA_PERMANENTE', fundamento: 'Portaria MEC 1.224/2013' },
  { codigo: 'ATA_COLACAO', tipoDocumento: 'Atas de colação de grau', prazoCorrenteAnos: 0, prazoIntermediarioAnos: 0, destinacao: 'GUARDA_PERMANENTE' },
  { codigo: 'DOSSIE_EVADIDO', tipoDocumento: 'Dossiê de aluno evadido/desligado', prazoCorrenteAnos: 5, prazoIntermediarioAnos: 15, destinacao: 'ELIMINACAO', fundamento: 'Sugestão — validar com CPAD' },
  { codigo: 'REQUERIMENTOS', tipoDocumento: 'Requerimentos e protocolos acadêmicos', prazoCorrenteAnos: 2, prazoIntermediarioAnos: 3, destinacao: 'ELIMINACAO' },
  { codigo: 'DIARIO_CLASSE', tipoDocumento: 'Diários de classe e listas de presença', prazoCorrenteAnos: 5, prazoIntermediarioAnos: 5, destinacao: 'ELIMINACAO' },
  { codigo: 'PROVAS_TRABALHOS', tipoDocumento: 'Provas e trabalhos avaliados', prazoCorrenteAnos: 1, prazoIntermediarioAnos: 1, destinacao: 'ELIMINACAO' },
  { codigo: 'CONTRATOS_ALUNO', tipoDocumento: 'Contratos de prestação de serviços educacionais', prazoCorrenteAnos: 5, prazoIntermediarioAnos: 5, destinacao: 'ELIMINACAO', fundamento: 'Prazo prescricional civil' },
  { codigo: 'ESTAGIO_TCE', tipoDocumento: 'Termos de compromisso de estágio', prazoCorrenteAnos: 5, prazoIntermediarioAnos: 0, destinacao: 'ELIMINACAO' },
  { codigo: 'CERT_EMITIDOS', tipoDocumento: 'Registro de certificados emitidos', prazoCorrenteAnos: 10, prazoIntermediarioAnos: 0, destinacao: 'ELIMINACAO' },
] as const

export async function bootstrapSecretaria(tenantId: string) {
  const criado = { tipos: 0, checklists: 0, certModelos: 0, temporalidade: 0, livros: 0 }

  const modelos = new Map<string, string>()
  for (const c of CHECKLISTS) {
    let m = await prisma.secChecklistModelo.findUnique({ where: { tenantId_codigo: { tenantId, codigo: c.codigo } } })
    if (!m) {
      m = await prisma.secChecklistModelo.create({
        data: { tenantId, codigo: c.codigo, nome: c.nome, processo: c.processo, itens: { create: c.itens.map(([titulo, obrigatorio, validadeDias, requisitos], i) => ({ tenantId, ordem: i + 1, titulo, obrigatorio, validadeDias, requisitos })) } },
      })
      criado.checklists++
    }
    modelos.set(c.codigo, m.id)
  }

  for (const t of TIPOS as readonly any[]) {
    const ex = await prisma.secTipoRequerimento.findUnique({ where: { tenantId_codigo: { tenantId, codigo: t.codigo } } })
    if (ex) continue
    await prisma.secTipoRequerimento.create({
      data: { tenantId, codigo: t.codigo, nome: t.nome, descricao: t.descricao, categoria: t.categoria, slaDias: t.slaDias, taxa: t.taxa, geraDocumento: t.geraDocumento, exigeAnexo: !!t.exigeAnexo, camposExtras: t.camposExtras, checklistModeloId: t.checklist ? modelos.get(t.checklist) : undefined },
    })
    criado.tipos++
  }

  for (const m of CERT_MODELOS) {
    const ex = await prisma.secCertModelo.findUnique({ where: { tenantId_codigo: { tenantId, codigo: m.codigo } } })
    if (ex) continue
    await prisma.secCertModelo.create({ data: { tenantId, codigo: m.codigo, nome: m.nome, tipo: m.tipo, titulo: m.titulo, texto: m.texto.replace('{{cpf}}', '') } })
    criado.certModelos++
  }

  for (const t of TEMPORALIDADE as readonly any[]) {
    const ex = await prisma.secTemporalidade.findUnique({ where: { tenantId_codigo: { tenantId, codigo: t.codigo } } })
    if (ex) continue
    await prisma.secTemporalidade.create({ data: { tenantId, ...t } })
    criado.temporalidade++
  }

  for (const [tipo, titulo] of [['REGISTRO_DIPLOMA', 'Livro de Registro de Diplomas'], ['ATAS_COLACAO', 'Livro de Atas de Colação de Grau']] as const) {
    const ex = await prisma.secLivro.findFirst({ where: { tenantId, tipo } })
    if (ex) continue
    await prisma.secLivro.create({ data: { tenantId, tipo, numero: 1, titulo } })
    criado.livros++
  }
  return criado
}
