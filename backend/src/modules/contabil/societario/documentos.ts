import { cnaeDe, formatarCnae } from './cnae'
import { TIPOS_INFO, type TipoSoc } from './regras'
import { brl, dataBr, fmtCpf } from '../util'

// Geradores de MINUTAS em texto imprimível. Sem validade jurídica: servem de rascunho para revisão do contador/advogado e para o
// preenchimento dos sistemas oficiais (Junta Comercial, Redesim, Portal do Empreendedor). Nada é enviado a nenhum órgão.

export interface DadosAbertura {
  nomeEmpresarial: string; nomeFantasia?: string | null; tipo: string; capitalSocial: number; objetoSocial?: string | null
  endereco?: any; municipio?: string | null; uf?: string | null; cnaePrincipal?: string | null; cnaesSecundarios?: string[]
  socios: Array<{ nome: string; cpf?: string | null; participacao: number; administrador: boolean; proLabore?: number | null; estadoCivil?: string | null; nacionalidade?: string | null; profissao?: string | null; enderecoTexto?: string | null }>
  dataPrevista?: Date | null
}

const CABECALHO = (titulo: string) => `${titulo}\n${'='.repeat(titulo.length)}\nMINUTA — SIMULAÇÃO. Documento gerado pelo EduMaster Pro para REVISÃO por contador/advogado. Não tem validade jurídica, não foi enviado a nenhum órgão e não substitui os formulários oficiais.\n`
const RODAPE = '\n\n—\nDocumento gerado automaticamente em ' + '{{DATA}}' + '. Este sistema não substitui um contador. Valide com seu contador antes de assinar ou protocolar.'

const enderecoTxt = (e: any, m?: string | null, uf?: string | null) => {
  if (!e) return `${m || '—'}/${uf || '—'}`
  return `${e.logradouro || '—'}, ${e.numero || 's/n'}${e.complemento ? ' - ' + e.complemento : ''}, ${e.bairro || '—'}, ${m || e.municipio || '—'}/${(uf || e.uf || '—').toString().toUpperCase()}, CEP ${e.cep || '—'}`
}
const cnaeTxt = (c?: string | null) => { const x = c ? cnaeDe(c) : undefined; return c ? `${formatarCnae(c)}${x ? ' — ' + x.descricao : ''}` : '—' }
const socioQualificacao = (s: DadosAbertura['socios'][number]) => `${s.nome.toUpperCase()}, ${s.nacionalidade || 'brasileiro(a)'}, ${s.estadoCivil || 'estado civil a informar'}, ${s.profissao || 'profissão a informar'}, CPF ${s.cpf ? fmtCpf(s.cpf) : 'a informar'}, residente em ${s.enderecoTexto || 'endereço a informar'}`

function fim(txt: string) { return txt + RODAPE.replace('{{DATA}}', dataBr(new Date())) }

export function contratoSocialLtda(d: DadosAbertura): string {
  const adm = d.socios.filter((s) => s.administrador)
  const unip = d.tipo === 'SLU'
  const secund = (d.cnaesSecundarios || []).map((c) => `   - ${cnaeTxt(c)}`).join('\n') || '   (nenhum)'
  const cotas = d.socios.map((s) => `   - ${s.nome.toUpperCase()}: ${s.participacao}% do capital = ${brl((d.capitalSocial * s.participacao) / 100)}`).join('\n')
  const t = `${CABECALHO(unip ? 'ATO CONSTITUTIVO DE SOCIEDADE LIMITADA UNIPESSOAL (SLU) — MINUTA' : 'CONTRATO SOCIAL DE SOCIEDADE LIMITADA (LTDA) — MINUTA')}
${unip ? 'Pelo presente instrumento, o sócio único:' : 'Pelo presente instrumento particular, os sócios:'}
${d.socios.map((s, i) => `  ${i + 1}. ${socioQualificacao(s)}`).join('\n')}

resolve${unip ? '' : 'm'} constituir uma sociedade limitada, regida pelos arts. 1.052 a 1.087 do Código Civil e, supletivamente, pela Lei das S.A., mediante as cláusulas seguintes:

CLÁUSULA 1ª — DENOMINAÇÃO. A sociedade girará sob o nome empresarial ${d.nomeEmpresarial.toUpperCase()}${d.nomeFantasia ? `, nome fantasia ${d.nomeFantasia.toUpperCase()}` : ''}.

CLÁUSULA 2ª — SEDE. A sede da sociedade será em ${enderecoTxt(d.endereco, d.municipio, d.uf)}.

CLÁUSULA 3ª — OBJETO SOCIAL. ${d.objetoSocial || 'A definir.'}
   Atividade principal (CNAE): ${cnaeTxt(d.cnaePrincipal)}
   Atividades secundárias:
${secund}

CLÁUSULA 4ª — PRAZO. A sociedade iniciará suas atividades na data do registro e seu prazo de duração é indeterminado.

CLÁUSULA 5ª — CAPITAL SOCIAL. O capital social é de ${brl(d.capitalSocial)}, dividido em quotas de R$ 1,00, ${unip ? 'totalmente subscrito e integralizado pelo sócio único' : 'subscrito e integralizado pelos sócios na proporção abaixo'}:
${cotas}

CLÁUSULA 6ª — RESPONSABILIDADE. ${unip ? 'A responsabilidade do sócio é limitada ao valor do capital social, que deve estar integralizado.' : 'A responsabilidade de cada sócio é restrita ao valor de suas quotas, mas todos respondem solidariamente pela integralização do capital social.'}

CLÁUSULA 7ª — ADMINISTRAÇÃO. A administração da sociedade caberá a ${adm.length ? adm.map((a) => a.nome.toUpperCase()).join(', ') : '[indicar administrador]'}, com poderes para representar a sociedade ativa e passivamente, vedado o uso do nome empresarial em negócios estranhos ao objeto social ou em favor de terceiros.

CLÁUSULA 8ª — PRÓ-LABORE. ${adm.some((a) => a.proLabore) ? `Os administradores farão jus a retirada mensal a título de pró-labore: ${adm.filter((a) => a.proLabore).map((a) => `${a.nome.toUpperCase()} — ${brl(a.proLabore!)}`).join('; ')}.` : 'Os administradores poderão receber retirada mensal a título de pró-labore, em valor a definir.'}

CLÁUSULA 9ª — EXERCÍCIO SOCIAL E LUCROS. O exercício social coincide com o ano civil. Os resultados, após as deduções legais, serão distribuídos ${unip ? 'ao sócio' : 'aos sócios na proporção de suas quotas, salvo deliberação em contrário'}.

CLÁUSULA 10ª — DECLARAÇÃO DE DESIMPEDIMENTO. ${unip ? 'O sócio declara' : 'Os sócios declaram'}, sob as penas da lei, que não ${unip ? 'está' : 'estão'} impedido${unip ? '' : 's'} de exercer a administração da sociedade por lei especial ou em virtude de condenação criminal.

CLÁUSULA 11ª — FORO. Fica eleito o foro da comarca de ${d.municipio || '[município]'}/${(d.uf || '').toUpperCase()} para dirimir quaisquer questões decorrentes deste instrumento.

${d.municipio || '[Município]'}, ____ de ______________ de ______.

${d.socios.map((s) => `\n______________________________\n${s.nome.toUpperCase()}\nCPF ${s.cpf ? fmtCpf(s.cpf) : '____________'}`).join('\n')}
`
  return fim(t)
}

export function requerimentoEmpresario(d: DadosAbertura): string {
  const s = d.socios[0]
  return fim(`${CABECALHO('REQUERIMENTO DE EMPRESÁRIO (EMPRESA INDIVIDUAL) — MINUTA')}
À JUNTA COMERCIAL DO ESTADO DE ${(d.uf || '__').toUpperCase()}

O(A) abaixo assinado(a) requer o registro de EMPRESÁRIO INDIVIDUAL com os seguintes dados:

1. TITULAR: ${s ? socioQualificacao(s) : '[dados do titular]'}
2. NOME EMPRESARIAL: ${d.nomeEmpresarial.toUpperCase()}${d.nomeFantasia ? ` (nome fantasia: ${d.nomeFantasia.toUpperCase()})` : ''}
3. ENDEREÇO DO ESTABELECIMENTO: ${enderecoTxt(d.endereco, d.municipio, d.uf)}
4. CAPITAL: ${brl(d.capitalSocial)} (destinado ao exercício da atividade)
5. OBJETO / ATIVIDADES: ${d.objetoSocial || 'A definir.'}
   CNAE principal: ${cnaeTxt(d.cnaePrincipal)}
   CNAEs secundários: ${(d.cnaesSecundarios || []).map(cnaeTxt).join('; ') || '—'}
6. INÍCIO DE ATIVIDADES: ${d.dataPrevista ? dataBr(d.dataPrevista) : 'na data do registro'}
7. DECLARAÇÃO: o(a) titular declara, sob as penas da lei, que não está impedido(a) de exercer atividade empresária e que a responsabilidade pelas obrigações da empresa é ilimitada.

${d.municipio || '[Município]'}, ____ de ______________ de ______.

______________________________
${s ? s.nome.toUpperCase() : '[TITULAR]'}
`)
}

export function estatutoSa(d: DadosAbertura): string {
  return fim(`${CABECALHO('ESTATUTO SOCIAL DE SOCIEDADE ANÔNIMA — MINUTA RESUMIDA')}
CAPÍTULO I — DENOMINAÇÃO, SEDE, OBJETO E DURAÇÃO
Art. 1º. A companhia denomina-se ${d.nomeEmpresarial.toUpperCase()} e rege-se por este estatuto e pela Lei 6.404/1976.
Art. 2º. Sede e foro: ${enderecoTxt(d.endereco, d.municipio, d.uf)}.
Art. 3º. Objeto: ${d.objetoSocial || 'A definir.'} (CNAE principal ${cnaeTxt(d.cnaePrincipal)}).
Art. 4º. Prazo de duração: indeterminado.

CAPÍTULO II — CAPITAL E AÇÕES
Art. 5º. O capital social é de ${brl(d.capitalSocial)}, dividido em ações ordinárias nominativas, sem valor nominal.
Subscritores:
${d.socios.map((s) => `   - ${s.nome.toUpperCase()}: ${s.participacao}% do capital`).join('\n')}

CAPÍTULO III — ADMINISTRAÇÃO
Art. 6º. A companhia será administrada por uma Diretoria composta por no mínimo 2 (dois) diretores, eleitos pela Assembleia Geral, com mandato de 3 anos, permitida a reeleição. Diretores indicados: ${d.socios.filter((s) => s.administrador).map((s) => s.nome.toUpperCase()).join(', ') || '[a indicar]'}.
Art. 7º. A Assembleia Geral reunir-se-á ordinariamente nos quatro primeiros meses após o fim do exercício social.

CAPÍTULO IV — EXERCÍCIO SOCIAL E LUCROS
Art. 8º. O exercício social coincide com o ano civil. Do lucro líquido, 5% serão destinados à reserva legal e 25% (dividendo obrigatório), conforme a lei.

(Documentos complementares, normalmente exigidos: ata da assembleia de constituição, boletim de subscrição, lista de presença e publicações legais.)
`)
}

export function resumoMei(d: DadosAbertura): string {
  const s = d.socios[0]
  return fim(`${CABECALHO('FICHA DE CONFERÊNCIA PARA FORMALIZAÇÃO DO MEI — RESUMO')}
A formalização do MEI é feita pelo próprio titular no Portal do Empreendedor (gov.br). Esta ficha apenas reúne os dados para conferência.

TITULAR: ${s ? `${s.nome.toUpperCase()} — CPF ${s.cpf ? fmtCpf(s.cpf) : 'a informar'}` : '[titular]'}
NOME EMPRESARIAL (conforme regra do MEI: nome do titular + CPF): ${d.nomeEmpresarial.toUpperCase()}
NOME FANTASIA: ${d.nomeFantasia ? d.nomeFantasia.toUpperCase() : '—'}
ENDEREÇO: ${enderecoTxt(d.endereco, d.municipio, d.uf)}
OCUPAÇÃO PRINCIPAL (CNAE): ${cnaeTxt(d.cnaePrincipal)}
OCUPAÇÕES SECUNDÁRIAS: ${(d.cnaesSecundarios || []).map(cnaeTxt).join('; ') || '—'}

CONDIÇÕES A CONFERIR: faturamento anual dentro do limite (R$ 81 mil, conferir o limite vigente); no máximo um empregado; não ser sócio/administrador/titular de outra empresa; ocupação permitida ao MEI; pagamento mensal do DAS-MEI.
`)
}

export function dbe(d: DadosAbertura): string {
  const info = TIPOS_INFO[d.tipo as TipoSoc]
  return fim(`${CABECALHO('DOCUMENTO BÁSICO DE ENTRADA (DBE) — FICHA ILUSTRATIVA')}
Observação: o DBE foi o formulário clássico da Receita para inscrição no CNPJ; hoje o fluxo oficial ocorre pela Redesim/Coleta Nacional e pelo gov.br. Esta ficha reúne, no formato tradicional, os dados que serão digitados nos sistemas oficiais.

NATUREZA JURÍDICA / TIPO: ${info?.nome || d.tipo}
NOME EMPRESARIAL: ${d.nomeEmpresarial.toUpperCase()}   NOME FANTASIA: ${d.nomeFantasia || '—'}
ENDEREÇO: ${enderecoTxt(d.endereco, d.municipio, d.uf)}
CAPITAL SOCIAL: ${brl(d.capitalSocial)}
CNAE PRINCIPAL: ${cnaeTxt(d.cnaePrincipal)}
CNAES SECUNDÁRIOS: ${(d.cnaesSecundarios || []).map(cnaeTxt).join('; ') || '—'}
QUADRO DE SÓCIOS E ADMINISTRADORES:
${d.socios.map((s) => `   - ${s.nome.toUpperCase()} | CPF ${s.cpf ? fmtCpf(s.cpf) : '—'} | ${s.participacao}% | ${s.administrador ? 'ADMINISTRADOR' : 'SÓCIO'}`).join('\n')}
DATA PREVISTA DE INÍCIO: ${d.dataPrevista ? dataBr(d.dataPrevista) : '—'}
`)
}

export function checklistDocumentos(d: DadosAbertura): string {
  const mei = d.tipo === 'MEI'
  const itens = [
    'Documento de identificação com foto e CPF de todos os sócios/titular',
    'Comprovante de residência dos sócios/titular',
    'Comprovante de endereço do estabelecimento (IPTU, conta de consumo ou contrato de locação)',
    ...(mei ? ['Título de eleitor ou recibo do último IR (para acesso gov.br nível prata/ouro, conforme o caso)'] : ['Minuta do ato constitutivo revisada e assinada', 'Certificado digital ou assinatura via gov.br', 'Taxa da Junta Comercial / DARE']),
    'Consulta de viabilidade (nome, atividade, zoneamento)',
    'Documentos de conselho de classe, quando a atividade exigir',
    'Procuração, quando o contador representar o cliente',
  ]
  return fim(`${CABECALHO('CHECKLIST DE DOCUMENTOS PARA ABERTURA')}\nEmpresa: ${d.nomeEmpresarial.toUpperCase()} (${d.tipo})\n\n${itens.map((i) => `[ ] ${i}`).join('\n')}\n`)
}

export const DOCUMENTOS_POR_TIPO: Record<string, string[]> = {
  MEI: ['RESUMO_MEI', 'DBE', 'CHECKLIST_DOCS'],
  EI: ['REQUERIMENTO_EMPRESARIO', 'DBE', 'CHECKLIST_DOCS'],
  SLU: ['CONTRATO_SOCIAL', 'DBE', 'CHECKLIST_DOCS'],
  LTDA: ['CONTRATO_SOCIAL', 'DBE', 'CHECKLIST_DOCS'],
  SA: ['ESTATUTO_SA', 'DBE', 'CHECKLIST_DOCS'],
}
export const TITULO_DOC: Record<string, string> = { CONTRATO_SOCIAL: 'Contrato social / ato constitutivo (minuta)', REQUERIMENTO_EMPRESARIO: 'Requerimento de empresário (minuta)', ESTATUTO_SA: 'Estatuto da S.A. (minuta)', RESUMO_MEI: 'Ficha de conferência do MEI', DBE: 'DBE (ficha ilustrativa)', CHECKLIST_DOCS: 'Checklist de documentos' }

export function gerarDocumento(tipoDoc: string, d: DadosAbertura): { titulo: string; conteudo: string } {
  const titulo = TITULO_DOC[tipoDoc]
  if (!titulo) throw Object.assign(new Error('Tipo de documento desconhecido.'), { status: 400 })
  const f: Record<string, (x: DadosAbertura) => string> = { CONTRATO_SOCIAL: contratoSocialLtda, REQUERIMENTO_EMPRESARIO: requerimentoEmpresario, ESTATUTO_SA: estatutoSa, RESUMO_MEI: resumoMei, DBE: dbe, CHECKLIST_DOCS: checklistDocumentos }
  return { titulo, conteudo: f[tipoDoc](d) }
}
