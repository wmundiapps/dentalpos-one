import { prisma } from '../../lib/prisma'
import { ETAPAS_PADRAO, EtapaModelo } from './logic'

// Padrões da instituição criados uma única vez (só quando a categoria está vazia — nunca recria o que foi excluído de propósito).
const feitos = new Set<string>()

const SETORES = [
  { codigo: 'SECRETARIA', nome: 'Secretaria Acadêmica', palavrasChave: ['declaracao', 'historico', 'diploma', 'certificado', 'matricula', 'transferencia', 'documento', 'atestado'], slaPrimeiraRespostaMin: 60, slaResolucaoMin: 1440 },
  { codigo: 'FINANCEIRO', nome: 'Financeiro', palavrasChave: ['boleto', 'mensalidade', 'pagamento', 'cobranca', 'desconto', 'bolsa', 'financiamento', 'parcela'], slaPrimeiraRespostaMin: 45, slaResolucaoMin: 1440 },
  { codigo: 'COORDENACAO', nome: 'Coordenação de Curso', palavrasChave: ['disciplina', 'aproveitamento', 'dispensa', 'revisao de prova', 'trancamento', 'estagio', 'horario'], slaPrimeiraRespostaMin: 120, slaResolucaoMin: 2880 },
  { codigo: 'TI', nome: 'Suporte de TI', palavrasChave: ['senha', 'login', 'acesso', 'portal', 'aplicativo', 'wifi', 'email institucional'], slaPrimeiraRespostaMin: 30, slaResolucaoMin: 480 },
  { codigo: 'OUVIDORIA', nome: 'Ouvidoria', palavrasChave: ['reclamacao', 'denuncia', 'elogio', 'sugestao', 'ouvidoria', 'assedio'], slaPrimeiraRespostaMin: 120, slaResolucaoMin: 4320 },
]

export const MODELOS_PADRAO = [
  { codigo: 'DECL_MATRICULA', nome: 'Declaração de matrícula', tipo: 'DECLARACAO', titulo: 'Declaração de Matrícula', validadeDias: 30, exigeMatriculaAtiva: true,
    texto: 'Declaramos, para {{finalidade}}, que {{nome}}, CPF {{cpf}}, registro acadêmico (RA) {{ra}}, está regularmente matriculado(a) no curso de {{curso}} ({{modalidade}}), no período letivo {{periodo}}, tendo ingressado em {{ingresso}}.\n\n{{instituicao}}, {{data}}.' },
  { codigo: 'DECL_VINCULO', nome: 'Declaração de vínculo e frequência', tipo: 'DECLARACAO', titulo: 'Declaração de Vínculo e Frequência', validadeDias: 30,
    texto: 'Declaramos que {{nome}}, RA {{ra}}, possui vínculo com esta Instituição no curso de {{curso}}, situação acadêmica {{situacao}}. A frequência média apurada nas disciplinas cursadas é de {{frequencia_media}} (mínimo regimental de 75%).\n\nEmitida para {{finalidade}} em {{data}}.' },
  { codigo: 'HISTORICO_ESCOLAR', nome: 'Histórico escolar', tipo: 'DECLARACAO', titulo: 'Histórico Escolar', validadeDias: 90,
    texto: 'Aluno(a): {{nome}} — RA {{ra}} — CPF {{cpf}}\nCurso: {{curso}} ({{modalidade}}) — Ingresso: {{ingresso}} — Situação: {{situacao}}\n\nCarga horária integralizada: {{carga_horaria_cursada}}h de {{carga_horaria_total}}h. Disciplinas aprovadas: {{disciplinas_aprovadas}}. Coeficiente de rendimento: {{coeficiente}}.\n\n{{historico}}\n\n{{data}}.' },
  { codigo: 'ATESTADO_FREQUENCIA', nome: 'Atestado de frequência', tipo: 'ATESTADO', titulo: 'Atestado de Frequência', validadeDias: 15, exigeMatriculaAtiva: true,
    texto: 'Atestamos, para {{finalidade}}, que {{nome}}, RA {{ra}}, aluno(a) do curso de {{curso}}, frequenta regularmente as atividades acadêmicas, com frequência média de {{frequencia_media}} até a presente data.\n\n{{data}}.' },
  { codigo: 'CERT_CONCLUSAO', nome: 'Certificado de conclusão de curso', tipo: 'CERTIFICADO', titulo: 'Certificado de Conclusão', exigeConclusao: true, orientacao: 'portrait',
    texto: 'Certificamos que {{nome}}, CPF {{cpf}}, concluiu em {{conclusao}} o curso de {{curso}} ({{modalidade}}), com carga horária de {{carga_horaria_cursada}} horas e coeficiente de rendimento {{coeficiente}}.\n\n{{instituicao}}, {{data}}.' },
  { codigo: 'DIPLOMA_DIGITAL', nome: 'Diploma (via digital)', tipo: 'DIPLOMA', titulo: 'Diploma', exigeConclusao: true,
    texto: '{{instituicao}} confere a {{nome}}, CPF {{cpf}}, o grau correspondente ao curso de {{curso}}, concluído em {{conclusao}}, nos termos da legislação vigente.\n\nDocumento nº {{numero}} — {{data}}.' },
  { codigo: 'TERMO_CIENCIA', nome: 'Termo de ciência e compromisso', tipo: 'TERMO', titulo: 'Termo de Ciência e Compromisso', validadeDias: 365,
    texto: 'Eu, {{nome}}, RA {{ra}}, aluno(a) do curso de {{curso}}, declaro ter ciência das normas acadêmicas e financeiras da Instituição e me comprometo a cumpri-las.\n\n{{instituicao}}, {{data}}.' },
]

const E_RAPIDA: EtapaModelo[] = [{ codigo: 'RECEBIDO', nome: 'Recebido', prazoDias: 0 }, { codigo: 'PRONTO', nome: 'Documento pronto', prazoDias: 0 }, { codigo: 'ENTREGUE', nome: 'Entregue', prazoDias: 0 }]
const E_TRANC: EtapaModelo[] = [
  { codigo: 'RECEBIDO', nome: 'Recebido', prazoDias: 0 }, { codigo: 'CONFERENCIA', nome: 'Conferência de documentos', prazoDias: 1 }, { codigo: 'PARECER_COORDENACAO', nome: 'Parecer da coordenação', prazoDias: 3, setorCodigo: 'COORDENACAO' },
  { codigo: 'ANALISE_FINANCEIRA', nome: 'Análise financeira', prazoDias: 2, setorCodigo: 'FINANCEIRO' }, { codigo: 'SECRETARIA', nome: 'Registro na secretaria', prazoDias: 2, setorCodigo: 'SECRETARIA' }, { codigo: 'ENTREGUE', nome: 'Concluído', prazoDias: 0 },
]

export const SERVICOS_PADRAO: Array<any> = [
  { codigo: 'DECLARACAO_MATRICULA', nome: 'Declaração de matrícula', categoria: 'DOCUMENTO', descricao: 'Comprova que você está matriculado(a). Emissão imediata em PDF com QR de verificação.', modelo: 'DECL_MATRICULA', automacao: 'EMITIR_DOCUMENTO', prazoDias: 1, etapas: E_RAPIDA, setor: 'SECRETARIA' },
  { codigo: 'DECLARACAO_VINCULO', nome: 'Declaração de vínculo e frequência', categoria: 'DOCUMENTO', descricao: 'Declaração de vínculo com a instituição e frequência média.', modelo: 'DECL_VINCULO', automacao: 'EMITIR_DOCUMENTO', prazoDias: 1, etapas: E_RAPIDA, setor: 'SECRETARIA' },
  { codigo: 'HISTORICO_ESCOLAR', nome: 'Histórico escolar', categoria: 'DOCUMENTO', descricao: 'Histórico com disciplinas, notas e frequência.', modelo: 'HISTORICO_ESCOLAR', automacao: 'EMITIR_DOCUMENTO', prazoDias: 2, etapas: E_RAPIDA, setor: 'SECRETARIA' },
  { codigo: 'ATESTADO_FREQUENCIA', nome: 'Atestado de frequência', categoria: 'DOCUMENTO', descricao: 'Atesta a frequência regular nas atividades.', modelo: 'ATESTADO_FREQUENCIA', automacao: 'EMITIR_DOCUMENTO', prazoDias: 1, etapas: E_RAPIDA, setor: 'SECRETARIA' },
  { codigo: 'CERTIFICADO_CONCLUSAO', nome: 'Certificado de conclusão', categoria: 'DOCUMENTO', descricao: 'Para concluintes.', modelo: 'CERT_CONCLUSAO', automacao: 'EMITIR_DOCUMENTO', prazoDias: 2, etapas: E_RAPIDA, setor: 'SECRETARIA' },
  { codigo: 'SEGUNDA_VIA_BOLETO', nome: '2ª via de boleto', categoria: 'FINANCEIRO', descricao: 'Lista as cobranças em aberto com o código para pagamento.', automacao: 'SEGUNDA_VIA_BOLETO', prazoDias: 1, etapas: E_RAPIDA, setor: 'FINANCEIRO' },
  { codigo: 'TRANCAMENTO_MATRICULA', nome: 'Trancamento de matrícula', categoria: 'ACADEMICO', descricao: 'Solicitação de trancamento com análise da coordenação e do financeiro.', automacao: 'TRANCAMENTO', prazoDias: 8, etapas: E_TRANC, setor: 'COORDENACAO',
    documentos: [{ titulo: 'Requerimento de trancamento assinado', obrigatorio: true }, { titulo: 'Documento de identificação com foto', obrigatorio: true, validadeDias: 3650 }, { titulo: 'Comprovante de motivo (opcional)', obrigatorio: false }] },
  { codigo: 'SEGUNDA_VIA_DIPLOMA', nome: '2ª via de diploma', categoria: 'DOCUMENTO', descricao: 'Emissão de 2ª via do diploma (via digital) após conferência.', modelo: 'DIPLOMA_DIGITAL', automacao: 'EMITIR_DOCUMENTO', prazoDias: 10, taxa: 80, setor: 'SECRETARIA', autoatendimento: false,
    documentos: [{ titulo: 'Boletim de ocorrência (em caso de perda)', obrigatorio: false }, { titulo: 'Documento de identificação com foto', obrigatorio: true, validadeDias: 3650 }] },
]

export async function garantirPadroes(tenantId: string) {
  if (feitos.has(tenantId)) return
  const [ns, nm, nsv, nc] = await Promise.all([prisma.atdSetor.count({ where: { tenantId } }), prisma.atdModeloDocumento.count({ where: { tenantId } }), prisma.atdServico.count({ where: { tenantId } }), prisma.atdEtapaConfig.count({ where: { tenantId } })])
  if (!ns) await prisma.atdSetor.createMany({ data: SETORES.map((s) => ({ tenantId, ...s })), skipDuplicates: true })
  if (!nm) await prisma.atdModeloDocumento.createMany({ data: MODELOS_PADRAO.map((m: any) => ({ tenantId, ...m, campos: [...new Set([...m.texto.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((x: any) => x[1]))], assinante: 'Secretaria Acadêmica', cargoAssinante: 'Secretário(a) Acadêmico(a)' })), skipDuplicates: true })
  if (!nc) {
    const todas = [...ETAPAS_PADRAO, ...E_TRANC, ...E_RAPIDA]
    const vistos = new Set<string>()
    const rows = todas.filter((e) => !vistos.has(e.codigo) && vistos.add(e.codigo)).map((e, i) => ({ tenantId, codigo: e.codigo, nome: e.nome, ordem: i, visivelSolicitante: !['PARECER_COORDENACAO', 'ANALISE_FINANCEIRA'].includes(e.codigo) }))
    await prisma.atdEtapaConfig.createMany({ data: rows, skipDuplicates: true })
  }
  if (!nsv) {
    const setores = new Map((await prisma.atdSetor.findMany({ where: { tenantId } })).map((s) => [s.codigo, s.id]))
    const modelos = new Map((await prisma.atdModeloDocumento.findMany({ where: { tenantId } })).map((m) => [m.codigo, m.id]))
    for (const s of SERVICOS_PADRAO) {
      await prisma.atdServico.create({
        data: {
          tenantId, codigo: s.codigo, nome: s.nome, descricao: s.descricao, categoria: s.categoria, autoatendimento: s.autoatendimento ?? true, automacao: s.automacao, modeloId: s.modelo ? modelos.get(s.modelo) : undefined, taxa: s.taxa ?? 0, prazoDias: s.prazoDias,
          setorId: s.setor ? setores.get(s.setor) : undefined, etapas: s.etapas ?? ETAPAS_PADRAO, exigeAssinatura: !!s.modelo,
          documentos: s.documentos ? { create: s.documentos.map((d: any, i: number) => ({ tenantId, ordem: i, titulo: d.titulo, obrigatorio: d.obrigatorio, validadeDias: d.validadeDias })) } : undefined,
        },
      })
    }
  }
  feitos.add(tenantId)
}
