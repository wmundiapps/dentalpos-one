import { CNAES, cnaeDe, formatarCnae, type Cnae } from './cnae'
import { validarCpf } from '../util'

// Regras societárias e checagem de viabilidade SIMULADA (não consulta Junta, Receita nem prefeitura).

export const TIPOS = ['MEI', 'EI', 'SLU', 'LTDA', 'SA'] as const
export type TipoSoc = (typeof TIPOS)[number]

export const TIPOS_INFO: Record<TipoSoc, { nome: string; minSocios: number; maxSocios: number; registro: string; resumo: string; exigeCapital: boolean }> = {
  MEI: { nome: 'Microempreendedor Individual (MEI)', minSocios: 1, maxSocios: 1, registro: 'Portal do Empreendedor (CCMEI) — sem Junta Comercial', exigeCapital: false, resumo: 'Titular único, faturamento anual limitado (R$ 81 mil, conferir), no máximo 1 empregado, apenas ocupações permitidas.' },
  EI: { nome: 'Empresário Individual (EI)', minSocios: 1, maxSocios: 1, registro: 'Junta Comercial (Requerimento de Empresário)', exigeCapital: false, resumo: 'Uma pessoa física exercendo atividade empresarial; responsabilidade ilimitada (patrimônio pessoal).' },
  SLU: { nome: 'Sociedade Limitada Unipessoal (SLU)', minSocios: 1, maxSocios: 1, registro: 'Junta Comercial (ato constitutivo)', exigeCapital: true, resumo: 'Um único sócio, responsabilidade limitada ao capital, sem capital mínimo legal.' },
  LTDA: { nome: 'Sociedade Limitada (LTDA)', minSocios: 2, maxSocios: 50, registro: 'Junta Comercial (contrato social)', exigeCapital: true, resumo: 'Dois ou mais sócios; responsabilidade limitada ao capital integralizado.' },
  SA: { nome: 'Sociedade Anônima (S.A.)', minSocios: 2, maxSocios: 500, registro: 'Junta Comercial (estatuto + ata de assembleia de constituição) e publicações', exigeCapital: true, resumo: 'Capital dividido em ações; estrutura formal (assembleia, diretoria, conselho conforme o caso).' },
}

export interface ItemViabilidade { codigo: string; nivel: 'OK' | 'ALERTA' | 'ERRO'; mensagem: string }
export interface ResultadoViabilidade { resultado: 'VIAVEL' | 'VIAVEL_COM_RESSALVAS' | 'INVIAVEL'; itens: ItemViabilidade[]; simulado: true; geradoEm: string; aviso: string }

const PALAVRAS_RESTRITAS = ['banco', 'universidade', 'seguradora', 'caixa economica', 'brasil', 'federal', 'nacional', 'republica', 'ministerio', 'conselho', 'cartorio', 'policia']

export interface EntradaViabilidade {
  tipo: string; nomeEmpresarial: string; capitalSocial: number; municipio?: string | null; uf?: string | null
  cnaePrincipal?: string | null; cnaesSecundarios?: string[]; endereco?: any; objetoSocial?: string | null
  socios: Array<{ nome: string; cpf?: string | null; participacao: number; administrador: boolean }>
}

export function checarViabilidade(e: EntradaViabilidade): ResultadoViabilidade {
  const itens: ItemViabilidade[] = []
  const ok = (codigo: string, mensagem: string) => itens.push({ codigo, nivel: 'OK', mensagem })
  const alerta = (codigo: string, mensagem: string) => itens.push({ codigo, nivel: 'ALERTA', mensagem })
  const erro = (codigo: string, mensagem: string) => itens.push({ codigo, nivel: 'ERRO', mensagem })
  const tipo = e.tipo as TipoSoc
  const info = TIPOS_INFO[tipo]
  if (!info) { erro('TIPO', 'Tipo societário inválido.'); return fecha(itens) }

  // nome empresarial
  const nome = (e.nomeEmpresarial || '').trim()
  const nomeSem = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (nome.length < 3) erro('NOME', 'Informe o nome empresarial.')
  else {
    if (tipo === 'LTDA' || tipo === 'SLU') { /\b(ltda|limitada)\b\.?$/i.test(nome) ? ok('NOME_SUFIXO', 'Nome com a expressão LTDA/Limitada.') : erro('NOME_SUFIXO', 'Sociedade limitada deve terminar com "LTDA" ou "Limitada".') }
    else if (tipo === 'SA') { /(s\.?\s?a\.?|companhia)\s*$|^companhia\b/i.test(nome) ? ok('NOME_SUFIXO', 'Nome com a expressão S.A./Companhia.') : erro('NOME_SUFIXO', 'Sociedade anônima deve incluir "S.A." ou "Companhia".') }
    else ok('NOME_SUFIXO', 'Nome de empresário individual/MEI (nome civil do titular, conforme registro).')
    const achadas = PALAVRAS_RESTRITAS.filter((p) => nomeSem.includes(p))
    if (achadas.length) alerta('NOME_RESTRITO', `O nome contém expressão sujeita a autorização/restrição (${achadas.join(', ')}). Consulte a Junta/órgão competente.`)
    else ok('NOME_RESTRITO', 'Nenhuma expressão restrita detectada no nome (verificação simulada de homonímia).')
    if (/\bexistente\b|\bhomonimo\b/.test(nomeSem)) erro('NOME_HOMONIMO', 'Nome igual ao de empresa já registrada (simulado).')
  }

  // CNAE
  const principal = e.cnaePrincipal ? cnaeDe(e.cnaePrincipal) : undefined
  if (!e.cnaePrincipal) erro('CNAE_PRINCIPAL', 'Escolha o CNAE principal.')
  else if (!principal) alerta('CNAE_PRINCIPAL', 'CNAE principal fora da base referencial: confirme o código na tabela oficial.')
  else ok('CNAE_PRINCIPAL', `CNAE principal ${formatarCnae(principal.codigo)} — ${principal.descricao}.`)
  const sec = (e.cnaesSecundarios || []).map((c) => cnaeDe(c)).filter(Boolean) as Cnae[]
  const todos = [principal, ...sec].filter(Boolean) as Cnae[]
  if ((e.cnaesSecundarios || []).length > 1 && tipo === 'MEI') alerta('MEI_SECUNDARIOS', 'MEI pode ter apenas ocupações da lista oficial (1 principal + secundárias permitidas).')
  if (tipo === 'MEI') {
    const proibidos = todos.filter((c) => !c.mei)
    proibidos.length ? erro('MEI_CNAE', `Atividade(s) normalmente não permitida(s) ao MEI: ${proibidos.map((c) => formatarCnae(c.codigo)).join(', ')}.`) : todos.length && ok('MEI_CNAE', 'Atividades compatíveis com o MEI (conferir lista oficial de ocupações).')
    if (e.socios.length > 1) erro('MEI_SOCIOS', 'MEI não possui sócios.')
    if (e.capitalSocial > 0) alerta('MEI_CAPITAL', 'MEI não tem capital social registrado; o valor será ignorado.')
  }
  if (todos.some((c) => c.educacaoRegulada)) alerta('EDU_REGULADA', 'Atividade de educação regulada: exige autorização/credenciamento do órgão educacional (MEC, conselho estadual ou secretaria municipal) além do CNPJ.')
  if (todos.some((c) => c.conselhoClasse)) alerta('CONSELHO', 'Atividade com exigência de registro em conselho de classe (CRM, CRO, OAB, CRC, CREA...). O responsável técnico deve estar inscrito.')
  if (todos.some((c) => c.risco === 'ALTO')) alerta('RISCO_ALTO', 'Atividade de risco alto: não há alvará automático; vistorias de vigilância sanitária/bombeiros/ambiental podem ser necessárias antes do funcionamento.')

  // sócios / capital
  const n = e.socios.length
  if (n < info.minSocios) erro('SOCIOS_MIN', `${info.nome} exige ao menos ${info.minSocios} ${info.minSocios === 1 ? 'titular/sócio' : 'sócios/acionistas'}.`)
  else if (n > info.maxSocios) erro('SOCIOS_MAX', `${info.nome} aceita no máximo ${info.maxSocios} ${info.maxSocios === 1 ? 'titular/sócio' : 'sócios'} nesta ferramenta.`)
  else ok('SOCIOS', `${n} ${n === 1 ? 'titular/sócio' : 'sócios'} informado(s).`)
  const invalidos = e.socios.filter((s) => s.cpf && !validarCpf(s.cpf))
  if (invalidos.length) erro('SOCIOS_CPF', `${invalidos.length} CPF(s) inválido(s).`)
  else if (e.socios.some((s) => !s.cpf)) alerta('SOCIOS_CPF', 'Há sócio sem CPF informado.')
  if (info.minSocios >= 1 && tipo !== 'MEI' && tipo !== 'EI') {
    const soma = Math.round(e.socios.reduce((a, s) => a + (s.participacao || 0), 0) * 100) / 100
    soma === 100 ? ok('PARTICIPACAO', 'Participações somam 100%.') : erro('PARTICIPACAO', `As participações somam ${soma}% (devem somar 100%).`)
    if (tipo !== 'SA') e.socios.some((s) => s.administrador) ? ok('ADMINISTRADOR', 'Há ao menos um administrador.') : erro('ADMINISTRADOR', 'Indique ao menos um sócio administrador.')
  }
  if (info.exigeCapital) (e.capitalSocial || 0) > 0 ? ok('CAPITAL', 'Capital social informado.') : erro('CAPITAL', 'Informe o capital social (maior que zero).')

  // localização
  if (!e.municipio || !e.uf || String(e.uf).length !== 2) erro('LOCAL', 'Informe município e UF.')
  else ok('LOCAL', `Município ${e.municipio}/${String(e.uf).toUpperCase()}.`)
  const end = e.endereco || {}
  if (!end.logradouro || !end.numero || !end.cep) alerta('ENDERECO', 'Endereço incompleto (logradouro, número e CEP são necessários para a consulta de zoneamento).')
  else {
    ok('ENDERECO', 'Endereço informado.')
    if (String(end.tipoImovel || '').toUpperCase() === 'RESIDENCIAL' && principal && principal.risco !== 'BAIXO') alerta('ZONEAMENTO', 'Imóvel residencial com atividade de risco médio/alto: o zoneamento costuma não permitir (consulta simulada).')
    else ok('ZONEAMENTO', 'Zoneamento compatível (consulta SIMULADA; a prefeitura é quem decide).')
  }
  if (!e.objetoSocial || e.objetoSocial.trim().length < 10) alerta('OBJETO', 'Descreva o objeto social (atividades que a empresa exercerá).')
  return fecha(itens)
}

function fecha(itens: ItemViabilidade[]): ResultadoViabilidade {
  const resultado = itens.some((i) => i.nivel === 'ERRO') ? 'INVIAVEL' : itens.some((i) => i.nivel === 'ALERTA') ? 'VIAVEL_COM_RESSALVAS' : 'VIAVEL'
  return { resultado, itens, simulado: true, geradoEm: new Date().toISOString(), aviso: 'Checagem SIMULADA: não consultou Junta Comercial, Receita Federal nem prefeitura. Resultado indicativo.' }
}

// ---------------- licenças e alvarás por atividade/município ----------------
export interface ItemAlvaraTpl { tipo: 'FUNCIONAMENTO' | 'BOMBEIROS' | 'VIGILANCIA_SANITARIA' | 'AMBIENTAL'; descricao: string; checklist: string[]; validadeMeses: number }

const OBS_MUNICIPIO: Record<string, string> = {
  'sao paulo': 'Capital paulista: licenciamento via Portal do Contribuinte/Descomplica SP; exigências de zoneamento (Lei de Zoneamento) e Auto de Licença de Funcionamento.',
  'rio de janeiro': 'Rio de Janeiro: Alvará via Carioca Digital; Corpo de Bombeiros (CBMERJ) exige Certificado de Aprovação conforme risco.',
  'belo horizonte': 'Belo Horizonte: alvará de localização e funcionamento via BH Digital.',
  'curitiba': 'Curitiba: Alvará de Localização via Inscrição Municipal e Consulta Amarela (viabilidade).',
  'brasilia': 'Distrito Federal: licenciamento via Sistema Integrado de Licenciamento (conferir RA/zoneamento).',
}

export function alvarasDaAtividade(cnaes: Cnae[], municipio?: string | null, tipo?: string): ItemAlvaraTpl[] {
  const out: ItemAlvaraTpl[] = []
  const baixo = cnaes.length > 0 && cnaes.every((c) => c.risco === 'BAIXO')
  const obs = OBS_MUNICIPIO[(municipio || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()]
  out.push({
    tipo: 'FUNCIONAMENTO',
    descricao: `Alvará de localização e funcionamento${baixo ? ' (risco baixo: normalmente emitido automaticamente após o CNPJ)' : ''}${obs ? ` — ${obs}` : ''}`,
    checklist: ['CNPJ ativo', 'Inscrição municipal', 'Comprovante de endereço / IPTU do imóvel', 'Contrato de locação ou escritura', 'Consulta de viabilidade/zoneamento aprovada', ...(tipo === 'MEI' ? ['CCMEI'] : ['Contrato social / requerimento registrado']), ...(baixo ? [] : ['Vistorias pendentes (quando exigidas)'])],
    validadeMeses: 12,
  })
  if (cnaes.some((c) => c.bombeiros)) out.push({ tipo: 'BOMBEIROS', descricao: 'AVCB/CLCB — Corpo de Bombeiros (conforme área e risco; exigências estaduais)', checklist: ['Projeto/Plano de prevenção de incêndio (quando exigido)', 'Extintores e sinalização de emergência', 'Iluminação de emergência', 'Laudo de instalações elétricas', 'Taxa de vistoria paga'], validadeMeses: 12 })
  if (cnaes.some((c) => c.vigilanciaSanitaria)) out.push({ tipo: 'VIGILANCIA_SANITARIA', descricao: 'Licença sanitária — Vigilância Sanitária municipal/estadual', checklist: ['Planta/croqui do estabelecimento', 'Responsável técnico (quando exigido) e comprovante de registro no conselho', 'Manual de boas práticas / POPs', 'Plano de gerenciamento de resíduos (PGRSS) quando aplicável', 'Controle de pragas (comprovante)', 'Taxa de licenciamento paga'], validadeMeses: 12 })
  if (cnaes.some((c) => c.ambiental)) out.push({ tipo: 'AMBIENTAL', descricao: 'Licença ambiental (órgão estadual/municipal; enquadramento conforme potencial poluidor)', checklist: ['Consulta ao órgão ambiental sobre enquadramento', 'Plano de gerenciamento de resíduos', 'Licença de operação/dispensa de licenciamento', 'Outorga/uso de água, quando aplicável'], validadeMeses: 24 })
  return out
}

export const ETAPAS = ['DADOS', 'VIABILIDADE', 'DOCUMENTOS', 'REGISTRO', 'INSCRICOES', 'ALVARAS', 'CONCLUIDA'] as const
export const ROTULO_ETAPA: Record<string, string> = { DADOS: 'Dados e sócios', VIABILIDADE: 'Viabilidade', DOCUMENTOS: 'Documentos', REGISTRO: 'Registro e CNPJ', INSCRICOES: 'Inscrições (IE/IM)', ALVARAS: 'Alvarás e licenças', CONCLUIDA: 'Empresa aberta' }

/** Tarefas padrão da linha do tempo da abertura (offset em dias a partir da data de criação). */
export function tarefasPadrao(tipo: string): Array<{ etapa: string; titulo: string; offset: number }> {
  const mei = tipo === 'MEI'
  return [
    { etapa: 'DADOS', titulo: 'Coletar dados e documentos pessoais dos sócios (RG, CPF, comprovante de residência)', offset: 2 },
    { etapa: 'DADOS', titulo: 'Definir CNAEs, objeto social e endereço da sede', offset: 3 },
    { etapa: 'VIABILIDADE', titulo: 'Rodar consulta de viabilidade (nome, atividade e zoneamento)', offset: 4 },
    { etapa: 'DOCUMENTOS', titulo: mei ? 'Conferir dados do formulário do MEI' : 'Gerar e revisar a minuta do ato constitutivo (revisão do contador/advogado)', offset: 6 },
    { etapa: 'DOCUMENTOS', titulo: 'Coletar assinaturas (certificado digital ou gov.br)', offset: 8 },
    { etapa: 'REGISTRO', titulo: mei ? 'Formalizar no Portal do Empreendedor (CCMEI e CNPJ)' : 'Protocolar na Junta Comercial e acompanhar exigências', offset: 12 },
    { etapa: 'REGISTRO', titulo: 'Conferir emissão do CNPJ e cartão CNPJ', offset: 14 },
    { etapa: 'INSCRICOES', titulo: 'Solicitar inscrição municipal (ISS)', offset: 16 },
    { etapa: 'INSCRICOES', titulo: 'Solicitar inscrição estadual (ICMS), se a atividade exigir', offset: 16 },
    { etapa: 'ALVARAS', titulo: 'Abrir processos de alvará (funcionamento, bombeiros, vigilância, ambiental)', offset: 20 },
    { etapa: 'ALVARAS', titulo: 'Acompanhar vistorias e anexar alvarás emitidos', offset: 35 },
    { etapa: 'CONCLUIDA', titulo: 'Opção pelo Simples Nacional, certificado digital, conta bancária e primeiras notas fiscais', offset: 40 },
  ]
}
export const _cnaesTotal = () => CNAES.length
