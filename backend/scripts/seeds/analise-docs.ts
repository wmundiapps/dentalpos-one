/**
 * Seed de demonstração do AGENTE DE ANÁLISE DE DOCUMENTOS (EduMaster Pro). Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts.
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedAnaliseDocs } from './seeds/analise-docs'  ->  await seedAnaliseDocs(c.api, c)
 * Uso isolado:  DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/analise-docs.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 * Cria ~22 casos: documentos corretos, com conflito, falsos, instituição inexistente/descredenciada, diploma duplicado, equivalências, financeiro e jurídico.
 * TODOS os nomes, CPFs (válidos, fictícios), instituições e códigos são FICTÍCIOS. A verificação de instituições usa a base local de demonstração
 * (provedor SIMULADO): nenhuma consulta real ao MEC/secretarias estaduais é feita. Rodar em banco limpo.
 */
export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const A = '/edu/analise-docs'
const DAY = 86_400_000
const ymd = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
const br = (iso: string) => iso.split('-').reverse().join('/')

/** CPF válido a partir de uma semente (fictício). */
export function cpfFicticio(seed: number): string {
  const base = String(100_000_000 + ((seed * 7919) % 899_999_999)).slice(0, 9).split('').map(Number)
  const dv = (d: number[]) => { const s = d.reduce((a, x, i) => a + x * (d.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  const d1 = dv(base); const d2 = dv([...base, d1])
  return [...base, d1, d2].join('')
}
export const fmtCpf = (c: string) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`

/** PDF mínimo (texto não comprimido + metadados) para exercitar o extrator de PDF e as regras de metadados. */
export function pdfFicticio(linhas: string[], meta: { producer?: string; creator?: string; criado?: string; modificado?: string; assinado?: boolean } = {}): string {
  const d = (iso?: string) => (iso ? `D:${iso.replace(/-/g, '')}120000Z` : '')
  const info = `<< ${meta.producer ? `/Producer (${meta.producer}) ` : ''}${meta.creator ? `/Creator (${meta.creator}) ` : ''}${meta.criado ? `/CreationDate (${d(meta.criado)}) ` : ''}${meta.modificado ? `/ModDate (${d(meta.modificado)}) ` : ''}>>`
  const txt = linhas.map((l) => `(${l.replace(/[()\\]/g, ' ')}) Tj`).join('\n')
  const sig = meta.assinado ? '\n5 0 obj<</Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 10 20 30]>>endobj' : ''
  const pdf = `%PDF-1.4\n1 0 obj${info}endobj\n2 0 obj<</Length 10>>stream\nBT /F1 11 Tf\n${txt}\nET\nendstream endobj${sig}\ntrailer<</Info 1 0 R>>\n%%EOF`
  return 'data:application/pdf;base64,' + Buffer.from(pdf, 'latin1').toString('base64')
}

interface Hist { nome: string; cpf?: string; nasc?: string; inst: string; cod?: string; curso: string; total: number; emissao: string; conclusao?: string; inicio?: string; assin?: boolean; qr?: boolean; uf?: string; disc: Array<[string, number, number | string, string, number]>; ementas?: Record<string, string> }
export function textoHistorico(h: Hist): string {
  const L = [
    `Nome do aluno: ${h.nome}`, ...(h.cpf ? [`CPF: ${fmtCpf(h.cpf)}`] : []), ...(h.nasc ? [`Data de nascimento: ${br(h.nasc)}`] : []),
    `Instituição de origem: ${h.inst}`, ...(h.cod ? [`Código e-MEC: ${h.cod}`] : []), ...(h.uf ? [`UF: ${h.uf}`] : []), `Curso: ${h.curso}`,
    ...(h.inicio ? [`Data de início: ${br(h.inicio)}`] : []), ...(h.conclusao ? [`Data de conclusão: ${br(h.conclusao)}`] : []),
    `Carga horária total: ${h.total}h`, `Data de emissão: ${br(h.emissao)}`, 'Disciplina | CH | Nota | Situação | Ano',
    ...h.disc.map(([n, ch, nota, sit, ano]) => `${n} | ${ch} | ${String(nota).replace('.', ',')} | ${sit} | ${ano}`),
    ...Object.entries(h.ementas ?? {}).map(([n, e]) => `Ementa (${n}): ${e}`),
    h.assin ? 'Documento assinado digitalmente (ICP-Brasil).' : 'Assinatura: ausente', ...(h.qr ? ['QR Code de verificação: presente'] : []),
  ]
  return L.join('\n')
}

export async function seedAnaliseDocs(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = { casos: [] as any[] }
  const post = (p: string, b: any = {}) => api('POST', `${A}${p}`, b)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) ctx.failures?.push(`seedAnaliseDocs: falhou ${tag}`); return x as T }
  const caso = async (tag: string, body: any) => { const c = await post('/casos', body); if (c) S.casos.push(c); S[tag] = ok(c, tag); return c }

  // equipe que recebe os avisos críticos
  if (ctx.mk) {
    await ctx.mk('reitor@suainstituicao.edu.br', 'Demo@2026', 'Helena', 'Souza', 'RECTOR')
    await ctx.mk('financeiro@suainstituicao.edu.br', 'Demo@2026', 'Rogério', 'Tavares', 'FINANCE')
    await ctx.mk('juridico@suainstituicao.edu.br', 'Demo@2026', 'Renata', 'Siqueira', 'LEGAL')
  }
  await post('/instituicoes/bootstrap')

  // curso/alunos existentes (seed acadêmico), quando houver
  const progs = await api('GET', '/edu/academico/programs')
  const programas: any[] = Array.isArray(progs) ? progs : progs?.items ?? []
  const odonto = programas.find((p) => /odonto/i.test(p.nome))
  const lista = await api('GET', '/edu/academico/students?pageSize=10')
  const alunos: any[] = Array.isArray(lista) ? lista : lista?.items ?? []
  const aluno = (i: number) => alunos[i]?.id as string | undefined
  const nomeAluno = (i: number, padrao: string) => (alunos[i]?.nomeCompleto as string | undefined) ?? padrao

  const c1 = cpfFicticio(11), c2 = cpfFicticio(12), c3 = cpfFicticio(13), c4 = cpfFicticio(14), c5 = cpfFicticio(15), c6 = cpfFicticio(16), c7 = cpfFicticio(17), c8 = cpfFicticio(18)
  const cOutro = cpfFicticio(99)
  const baseDisc: Hist['disc'] = [['Anatomia Humana', 80, 8.5, 'APROVADO', 2023], ['Histologia e Embriologia', 60, 7.8, 'APROVADO', 2023], ['Bioquímica Básica', 40, 7, 'APROVADO', 2023], ['Fisiologia Geral', 80, 8, 'APROVADO', 2024]]
  const totalBase = 260

  // 1) Transferência OK — documentos corretos e completos
  await caso('ok1', {
    origem: 'SECRETARIA', contexto: 'TRANSFERENCIA', titulo: 'Transferência — histórico UFVA e documento de identidade (tudo conforme)',
    documentos: [
      { tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: 'Camila Duarte Ferraz', cpf: c1, inst: 'Universidade Federal do Vale Azul', cod: '1001', curso: 'Odontologia', total: totalBase, inicio: ymd(-1200), conclusao: ymd(-400), emissao: ymd(-20), assin: true, qr: true, disc: baseDisc }) },
      { tipo: 'RG_CPF', texto: `Nome: Camila Duarte Ferraz\nCPF: ${fmtCpf(c1)}\nData de nascimento: 14/03/2001\nRG: 34.221.887-5`, metadados: {} },
    ],
  })
  // 2) Matrícula OK — ensino médio em escola regular
  await caso('ok2', {
    origem: 'SECRETARIA', contexto: 'MATRICULA', titulo: 'Matrícula — histórico do ensino médio (Colégio Estadual Aurora Boreal)',
    documentos: [
      { tipo: 'HISTORICO_ENSINO_MEDIO', texto: `Nome: Lucas Henrique Barros\nCPF: ${fmtCpf(c2)}\nEscola de origem: Colégio Estadual Aurora Boreal\nCódigo da escola: 35000123\nUF: SP\nNível de ensino: Ensino Médio\nData de conclusão: ${br(ymd(-300))}\nData de emissão: ${br(ymd(-15))}\nDocumento assinado digitalmente (ICP-Brasil).` },
      { tipo: 'RG_CPF', texto: `Nome: Lucas Henrique Barros\nCPF: ${fmtCpf(c2)}\nNascimento: 02/08/2007`, campos: { dataNascimento: '2007-08-02' } },
    ],
  })
  // 3) Conflito grave de identidade: CPF e nome diferentes entre histórico e RG
  await caso('conflito1', {
    origem: 'SECRETARIA', contexto: 'TRANSFERENCIA', titulo: 'Transferência — CPF e nome divergentes entre histórico e documento de identidade', studentId: aluno(1),
    documentos: [
      { tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: 'Rafael Augusto Pinheiro', cpf: c3, inst: 'Centro Universitário Horizonte', cod: '1002', curso: 'Odontologia', total: totalBase, inicio: ymd(-1300), conclusao: ymd(-500), emissao: ymd(-30), assin: true, disc: baseDisc }) },
      { tipo: 'RG_CPF', texto: `Nome: Rodrigo Alves Macedo\nCPF: ${fmtCpf(c4)}\nData de nascimento: 21/11/1999` },
    ],
  })
  // 4) Datas incoerentes e nascimento divergente
  await caso('datas', {
    origem: 'SECRETARIA', contexto: 'MATRICULA', titulo: 'Matrícula — datas incoerentes (conclusão antes do início e emissão futura)',
    documentos: [
      { tipo: 'DIPLOMA', texto: `Nome do diplomado: Beatriz Nogueira Lacerda\nCPF: ${fmtCpf(c5)}\nInstituição: Universidade Estadual do Sertão\nCódigo e-MEC: 1005\nCurso: Biomedicina\nData de início: ${br(ymd(-200))}\nData de conclusão: ${br(ymd(-900))}\nData de emissão: ${br(ymd(40))}\nDiploma nº REG-558201\nQR Code de verificação: presente` },
      { tipo: 'RG_CPF', texto: `Nome: Beatriz Nogueira Lacerda\nCPF: ${fmtCpf(c5)}\nData de nascimento: 05/05/1998` },
      { tipo: 'DECLARACAO', texto: `Nome: Beatriz Nogueira Lacerda\nInstituição: Universidade Estadual do Sertão\nData de nascimento: 06/05/1998\nData de emissão: ${br(ymd(-10))}\nAssinatura digital: presente`, campos: { dataNascimento: '1998-05-06' } },
    ],
  })
  // 5) Carga horária não fecha e nota inválida
  await caso('carga', {
    origem: 'SECRETARIA', contexto: 'TRANSFERENCIA', titulo: 'Transferência — carga horária total não fecha e nota fora da escala',
    documentos: [{ tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: 'Diego Moraes Antunes', cpf: c6, inst: 'Universidade Federal do Vale Azul', cod: '1001', curso: 'Odontologia', total: 3200, emissao: ymd(-12), assin: true, disc: [['Anatomia Humana', 80, 8, 'APROVADO', 2024], ['Histologia e Embriologia', 60, 11.5, 'APROVADO', 2024], ['Bioquímica Básica', 40, 6.5, 'APROVADO', 2024]] }) }],
  })
  // 6) Sem assinatura/QR e campos faltando
  await caso('semassin', {
    origem: 'SECRETARIA', contexto: 'MATRICULA', titulo: 'Matrícula — declaração sem assinatura, QR Code ou CPF',
    documentos: [{ tipo: 'HISTORICO_ESCOLAR', campos: { nome: 'Fernanda Quintela Souza', instituicao: 'Universidade do Planalto Central', codigoIes: '1007', curso: 'Ciências Contábeis', dataEmissao: ymd(-8) } }],
  })
  // 7) Falso: PDF com metadados de Photoshop, criado antes da emissão, campos sobrepostos
  await caso('falso1', {
    origem: 'SECRETARIA', contexto: 'TRANSFERENCIA', titulo: 'Transferência — histórico PDF com sinais de edição (possível adulteração)', studentId: aluno(2),
    documentos: [{
      tipo: 'HISTORICO_ESCOLAR', arquivo: { nome: 'historico-escolar.pdf', mime: 'application/pdf', dataUrl: pdfFicticio(textoHistorico({ nome: nomeAluno(2, 'Gustavo Lemos Prado'), inst: 'Universidade Federal do Vale Azul', cod: '1001', curso: 'Odontologia', total: totalBase, emissao: ymd(-5), conclusao: ymd(-60), assin: false, qr: true, disc: baseDisc }).split('\n'), { producer: 'Adobe Photoshop 25.0', creator: 'Adobe Photoshop', criado: ymd(-400), modificado: ymd(-6) }) },
      metadados: { camposSobrepostos: true, fontesDistintas: 5, qrConfere: false },
    }],
  })
  // 8) Instituição inexistente
  await caso('inexistente', {
    origem: 'SECRETARIA', contexto: 'TRANSFERENCIA', titulo: 'Transferência — instituição de origem inexistente no cadastro',
    documentos: [{ tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: 'Thiago Brandão Neves', cpf: c8, inst: 'Universidade Internacional do Futuro Brilhante', cod: '9999', curso: 'Odontologia', total: totalBase, emissao: ymd(-9), conclusao: ymd(-80), assin: true, qr: true, disc: baseDisc }) }],
  })
  // 9) IES descredenciada
  await caso('descred', {
    origem: 'SECRETARIA', contexto: 'DIPLOMA', titulo: 'Diploma — IES de origem descredenciada',
    documentos: [{ tipo: 'DIPLOMA', texto: `Nome do diplomado: Larissa Monteiro Cavalcanti\nCPF: ${fmtCpf(cpfFicticio(21))}\nInstituição: Faculdade Santa Aurora\nCódigo e-MEC: 1003\nCurso: Administração\nData de conclusão: ${br(ymd(-700))}\nData de emissão: ${br(ymd(-690))}\nRegistro nº FSA-77120\nAssinado digitalmente (ICP-Brasil)` }],
  })
  // 10) Curso não reconhecido
  await caso('cursonr', {
    origem: 'SECRETARIA', contexto: 'TRANSFERENCIA', titulo: 'Transferência — curso sem reconhecimento (Medicina Veterinária)',
    documentos: [{ tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: 'Mariana Peixoto Salgado', cpf: cpfFicticio(22), inst: 'Centro Universitário Horizonte', cod: '1002', curso: 'Medicina Veterinária', total: 240, emissao: ymd(-14), assin: true, disc: [['Anatomia Veterinária', 120, 8, 'APROVADO', 2023], ['Fisiologia Animal', 120, 7.5, 'APROVADO', 2024]] }) }],
  })
  // 11) IES em extinção
  await caso('extincao', {
    origem: 'SECRETARIA', contexto: 'EQUIVALENCIA', titulo: 'Equivalência — IES em extinção (Instituto Superior Pinheiral)',
    documentos: [{ tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: 'André Luís Furtado', cpf: cpfFicticio(23), inst: 'Instituto Superior Pinheiral', cod: '1004', curso: 'Odontologia', total: 160, emissao: ymd(-25), assin: true, qr: true, disc: [['Anatomia Humana', 80, 7.5, 'APROVADO', 2022], ['Histologia e Embriologia', 80, 8, 'APROVADO', 2022]] }) }],
  })
  // 12) Escola de ensino médio inexistente (secretaria estadual)
  await caso('escolaNao', {
    origem: 'SECRETARIA', contexto: 'MATRICULA', titulo: 'Matrícula — escola de ensino médio não consta na secretaria estadual',
    documentos: [{ tipo: 'HISTORICO_ENSINO_MEDIO', texto: `Nome: Patrícia Valadares Moura\nCPF: ${fmtCpf(cpfFicticio(24))}\nEscola: Colégio Cidade Nova Ensino Rápido\nCódigo da escola: 35001234\nUF: SP\nNível de ensino: Ensino Médio\nData de conclusão: ${br(ymd(-200))}\nData de emissão: ${br(ymd(-12))}\nQR Code de verificação: presente` }],
  })
  // 13) Escola/supletivo descredenciado (EJA)
  await caso('escolaDesc', {
    origem: 'SECRETARIA', contexto: 'MATRICULA', titulo: 'Matrícula — certificado de EJA de escola descredenciada',
    documentos: [{ tipo: 'HISTORICO_ENSINO_MEDIO', texto: `Nome: Wellington Costa Arantes\nCPF: ${fmtCpf(cpfFicticio(25))}\nEscola: Colégio Atlântico Supletivo Ltda\nCódigo da escola: 35000999\nUF: SP\nNível de ensino: EJA\nData de conclusão: ${br(ymd(-150))}\nData de emissão: ${br(ymd(-20))}\nAssinatura: ausente` }],
  })
  // 14) Diploma duplicado: o mesmo número em nome de duas pessoas
  const dipTxt = (nome: string, cpf: string) => `Nome do diplomado: ${nome}\nCPF: ${fmtCpf(cpf)}\nInstituição: Universidade Federal do Vale Azul\nCódigo e-MEC: 1001\nCurso: Farmácia\nData de conclusão: ${br(ymd(-800))}\nData de emissão: ${br(ymd(-760))}\nDiploma nº UFVA-2024-009911\nQR Code de verificação: presente\nAssinado digitalmente (ICP-Brasil)`
  await caso('dip1', { origem: 'SECRETARIA', contexto: 'DIPLOMA', titulo: 'Diploma — graduação em Farmácia (titular original)', documentos: [{ tipo: 'DIPLOMA', texto: dipTxt('Isabela Rocha Medeiros', cpfFicticio(31)) }] })
  await caso('dip2', { origem: 'SECRETARIA', contexto: 'DIPLOMA', titulo: 'Diploma — mesmo número apresentado por outra pessoa', documentos: [{ tipo: 'DIPLOMA', texto: dipTxt('Jéssica Rocha Medeiros', cpfFicticio(32)) }] })

  // 15–16) Equivalências (usam a matriz/currículo de Odontologia do seed acadêmico, se existir)
  if (odonto) {
    const ementas = { 'Anatomia Humana': 'Estudo da anatomia sistêmica e topográfica do corpo humano.', 'Fisiologia Geral': 'Fisiologia dos sistemas orgânicos.' }
    await caso('equiv1', {
      origem: 'SECRETARIA', contexto: 'EQUIVALENCIA', titulo: 'Equivalência — aproveitamento de disciplinas da UFVA (Odontologia)', programId: odonto.id, studentId: aluno(3),
      documentos: [
        { tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: nomeAluno(3, 'Camila Duarte Ferraz'), inst: 'Universidade Federal do Vale Azul', cod: '1001', curso: 'Odontologia', total: 260, emissao: ymd(-18), assin: true, qr: true, disc: [['Anatomia Humana', 80, 8.5, 'APROVADO', new Date().getFullYear() - 2], ['Histologia e Embriologia', 60, 7.8, 'APROVADO', new Date().getFullYear() - 2], ['Bioquímica Básica', 40, 7, 'APROVADO', new Date().getFullYear() - 2], ['Fisiologia Geral', 80, 8, 'APROVADO', new Date().getFullYear() - 1]], ementas }) },
      ],
    })
    await caso('equiv2', {
      origem: 'SECRETARIA', contexto: 'EQUIVALENCIA', titulo: 'Equivalência com conflitos — reprovação, prazo de validade e carga insuficiente', programId: odonto.id, studentId: aluno(4),
      documentos: [
        { tipo: 'HISTORICO_ESCOLAR', texto: textoHistorico({ nome: nomeAluno(4, 'Diego Moraes Antunes'), inst: 'Universidade Federal do Vale Azul', cod: '1001', curso: 'Odontologia', total: 190, emissao: ymd(-18), assin: true, qr: true, disc: [['Anatomia Humana', 80, 8, 'APROVADO', new Date().getFullYear() - 14], ['Dentística I', 80, 4.5, 'REPROVADO', new Date().getFullYear() - 3], ['Bioquímica Oral', 30, 7, 'APROVADO', new Date().getFullYear() - 2]] }) },
      ],
    })
  }

  // 17–19) FINANCEIRO
  await caso('finOk', { origem: 'FINANCEIRO', contexto: 'COMPROVANTE', titulo: 'Comprovante de pagamento da mensalidade (conforme)', documentos: [{ tipo: 'COMPROVANTE', texto: `Nome do pagador: Camila Duarte Ferraz\nBanco: Banco Meridional S.A.\nValor pago: R$ 1.850,00\nData do pagamento: ${br(ymd(-3))}` }] })
  await caso('finNf', {
    origem: 'FINANCEIRO', contexto: 'NOTA_FISCAL', titulo: 'Nota fiscal de serviços — CNPJ inválido e chave de acesso incompleta',
    documentos: [{ tipo: 'NOTA_FISCAL', texto: `Emitente: Serviços Gráficos Arco-Íris Ltda\nCNPJ: 12.345.678/0001-00\nNota fiscal nº 000.554\nValor total: R$ 12.480,00\nData de emissão: ${br(ymd(-6))}\nChave de acesso: 3526 1112 3456 7800 0100 5500 1000 0005 54` }],
  })
  await caso('finNfFalsa', {
    origem: 'FINANCEIRO', contexto: 'NOTA_FISCAL', titulo: 'Nota fiscal em PDF editado depois de emitida (indício de adulteração)',
    documentos: [{ tipo: 'NOTA_FISCAL', arquivo: { nome: 'nf-9981.pdf', mime: 'application/pdf', dataUrl: pdfFicticio([`Emitente: Papelaria Central Eireli`, 'CNPJ: 11.222.333/0001-81', 'Nota fiscal nº 9981', 'Valor total: R$ 48.900,00', `Data de emissão: ${br(ymd(-20))}`], { producer: 'iLovePDF', creator: 'Canva', criado: ymd(-60), modificado: ymd(-2) }) }, metadados: { camposSobrepostos: true } }],
  })
  // 20–22) JURÍDICO
  await caso('jurOk', { origem: 'JURIDICO', contexto: 'CONTRATO', titulo: 'Contrato de prestação de serviços de vigilância (conforme)', documentos: [{ tipo: 'CONTRATO', texto: `Contratante: SUA INSTITUIÇÃO\nContratada: Guardian Segurança Ltda\nInício da vigência: ${br(ymd(-30))}\nFim da vigência: ${br(ymd(335))}\nValor: R$ 18.500,00\nContrato assinado digitalmente (ICP-Brasil)` }] })
  await caso('jurCert', { origem: 'JURIDICO', contexto: 'CERTIDAO', titulo: 'Certidão negativa de débitos — validade expirada', documentos: [{ tipo: 'CERTIDAO', texto: `Órgão emissor: Receita Federal do Brasil\nTitular CNPJ: 12.345.678/0001-95\nData de emissão: ${br(ymd(-210))}\nValidade: ${br(ymd(-30))}\nCódigo de controle: 8F3A.22C1.77B9` }] })
  await caso('jurIncoer', { origem: 'JURIDICO', contexto: 'CONTRATO', titulo: 'Contrato de locação — vigência incoerente e sem assinatura', documentos: [{ tipo: 'CONTRATO', texto: `Locador: Imobiliária Centro Antigo Ltda\nLocatário: SUA INSTITUIÇÃO\nInício da vigência: ${br(ymd(200))}\nFim da vigência: ${br(ymd(-20))}\nValor: R$ 42.000,00\nAssinatura: ausente` }] })

  // decisões humanas de exemplo (a fila fica com casos críticos abertos e bloqueando os processos)
  for (const k of ['ok1', 'ok2', 'finOk', 'jurOk']) if (S[k]) await post(`/casos/${S[k].id}/decisao`, { decisao: 'APROVAR', justificativa: 'Documentos conferidos e conformes.' })
  if (S.falso1) await post(`/casos/${S.falso1.id}/decisao`, { decisao: 'REJEITAR', justificativa: 'Indícios de adulteração confirmados na conferência do original com a instituição; processo indeferido e comunicado à reitoria.' })
  if (S.cursonr) await post(`/casos/${S.cursonr.id}/decisao`, { decisao: 'SOLICITAR_NOVO_DOCUMENTO', justificativa: 'Solicitar portaria de reconhecimento do curso e novo histórico.' })
  if (S.datas) await post(`/casos/${S.datas.id}/comentarios`, { texto: 'Aguardando retorno do aluno sobre a data de nascimento correta.' })
  return S
}

// execução isolada
if (require.main === module) {
  const API = process.env.API_URL || 'http://localhost:3000/api'
  ;(async () => {
    const { prisma } = await import('../../src/lib/prisma')
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Rode antes scripts/edu-demo-seed.ts (cria a instituição sua-instituicao).')
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const token = ((await r.json()) as any).token as string
    const failures: string[] = []
    const api: Api = async (method, path, body) => {
      const x = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await x.text(); let j: any = null; try { j = JSON.parse(t) } catch { /* texto */ }
      if (!x.ok) { failures.push(`${method} ${path} -> ${x.status} ${t.slice(0, 160)}`); return null }
      return j
    }
    const { default: bcrypt } = await import('bcryptjs')
    const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
      const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      return ex ?? prisma.user.create({ data: { clinicId: clinic.id, tenantId: clinic.tenantId, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
    }
    await seedAnaliseDocs(api, { tenantId: 'sua-instituicao', failures, mk })
    console.log(failures.length ? `${failures.length} chamadas falharam:\n - ${failures.join('\n - ')}` : 'Seed do Agente de documentos concluído.')
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
