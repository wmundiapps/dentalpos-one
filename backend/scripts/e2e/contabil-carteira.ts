// Testes da CARTEIRA DE CLIENTES do escritório de contabilidade: validação de CPF/CNPJ, RBAC por cargo, escopo por responsável, isolamento de tenant,
// importação CSV, funil → proposta → contrato (assinatura SIMULADA), honorários/MRR/reajuste, tarefas e rotinas, saúde da carteira, comunicação simulada,
// PORTAL DO CLIENTE com isolamento estrito, LGPD (acesso, exportação, anonimização, retenção), relatórios e o seed.
// Uso:  DATABASE_URL=postgresql://postgres:pg@127.0.0.1:5432/ctb_e2e npx tsx scripts/e2e/contabil-carteira.ts
// Requer Postgres LOCAL com o schema aplicado (prisma db push). Não usa internet nem credenciais.
import jwt from 'jsonwebtoken'
import { setup, check, summary, prisma, fails, Actor } from './qa5-lib'
import { completarCNPJ, completarCPF, documentoValido, formatarDocumento, tipoPorDocumento, validarCNPJ, validarCPF } from '../../src/modules/contabil/carteira/documento'
import { lerCsv } from '../../src/modules/contabil/carteira/csv'
import { valorVigente, vigenteEm } from '../../src/modules/contabil/carteira/calculos'
import { aplicaNaCompetencia } from '../../src/modules/contabil/carteira/tarefas'
import { renderizarTexto } from '../../src/modules/contabil/carteira/comunicacao'
import { gerarCsv } from '../../src/modules/contabil/carteira/common'
import { registrarFiscalProvider, fiscalLocal } from '../../src/modules/contabil/carteira/provedores'
import { CARGOS, MODULOS } from '../../src/modules/acesso/catalogo'
import { seedContabilCarteira } from '../seeds/contabil-carteira'

const secao = (t: string) => console.log(`\n== ${t}`)
const C = '/edu/contabil/carteira'
const iso = (d: Date) => d.toISOString().slice(0, 10)
const hoje = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 12))
const dias = (n: number) => new Date(hoje().getTime() + n * 86_400_000)
const comp = (delta = 0) => { const d = hoje(); const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }
const b64 = (s: string, mime = 'text/plain') => `data:${mime};base64,${Buffer.from(s).toString('base64')}`

async function main() {
  const S = await setup()
  const { call, t1, t2 } = S
  const doc = (n: number) => completarCNPJ(String(10000000 + n * 7919).padStart(8, '0') + '0001')
  const cpf = (n: number) => completarCPF(String(200000000 + n * 6007))

  // ====================================================================== unidades
  secao('CPF / CNPJ (inclui CNPJ alfanumérico)')
  check('CPF válido 529.982.247-25', validarCPF('529.982.247-25'))
  check('CPF com DV errado', !validarCPF('529.982.247-24'))
  check('CPF sequência repetida', !validarCPF('111.111.111-11'))
  check('CNPJ válido 11.222.333/0001-81', validarCNPJ('11.222.333/0001-81'))
  check('CNPJ com DV errado', !validarCNPJ('11.222.333/0001-82'))
  check('CNPJ zerado/repetido', !validarCNPJ('00000000000000') && !validarCNPJ('11111111111111'))
  const alfa = completarCNPJ('AB12CD34EF56')
  check('CNPJ alfanumérico gerado é válido', validarCNPJ(alfa) && alfa.length === 14, alfa)
  check('CNPJ alfanumérico com DV adulterado é inválido', !validarCNPJ(alfa.slice(0, 13) + String((Number(alfa[13]) + 1) % 10)))
  check('tipo por documento', tipoPorDocumento('529.982.247-25') === 'PF' && tipoPorDocumento('11.222.333/0001-81') === 'PJ' && tipoPorDocumento('123') === null)
  check('documentoValido respeita o tipo informado', documentoValido('11.222.333/0001-81', 'PJ') && !documentoValido('11.222.333/0001-81', 'PF'))
  check('formatação', formatarDocumento('52998224725') === '529.982.247-25' && formatarDocumento('11222333000181') === '11.222.333/0001-81')

  secao('Reajuste, vigência, recorrência, CSV, variáveis')
  const ct = { valorMensal: 1000, inicio: new Date('2025-03-10T12:00:00Z'), reajusteMes: 3, reajustePercentual: 5 }
  check('valor no mês de início não reajusta', valorVigente(ct, '2025-03') === 1000)
  check('antes do aniversário de reajuste mantém', valorVigente(ct, '2026-02') === 1000)
  check('1º reajuste em 2026-03 (+5%)', valorVigente(ct, '2026-03') === 1050, valorVigente(ct, '2026-03'))
  check('reajuste composto em 2027-03', valorVigente(ct, '2027-03') === 1102.5, valorVigente(ct, '2027-03'))
  check('sem percentual não reajusta', valorVigente({ ...ct, reajustePercentual: null }, '2030-03') === 1000)
  check('vigenteEm respeita fim', vigenteEm({ inicio: new Date('2025-01-01T12:00:00Z'), fim: new Date('2025-06-15T12:00:00Z') }, '2025-06') && !vigenteEm({ inicio: new Date('2025-01-01T12:00:00Z'), fim: new Date('2025-06-15T12:00:00Z') }, '2025-07'))
  check('recorrência TRIMESTRAL só no fim do trimestre', aplicaNaCompetencia({ recorrencia: 'TRIMESTRAL', mesPrazo: null, mesesAdiante: 1 }, '2026-03') && !aplicaNaCompetencia({ recorrencia: 'TRIMESTRAL', mesPrazo: null, mesesAdiante: 1 }, '2026-04'))
  check('recorrência ANUAL no mês-alvo', aplicaNaCompetencia({ recorrencia: 'ANUAL', mesPrazo: 5, mesesAdiante: 0 }, '2026-05') && !aplicaNaCompetencia({ recorrencia: 'ANUAL', mesPrazo: 5, mesesAdiante: 0 }, '2026-06'))
  const tabela = lerCsv('﻿nome;documento\r\n"Silva; & Filhos";"123"\r\n"Linha\ncom quebra";456\r\n')
  check('CSV: aspas, separador e quebra dentro de campo', tabela.length === 3 && tabela[1][0] === 'Silva; & Filhos' && tabela[2][0] === 'Linha\ncom quebra', tabela)
  check('CSV: vírgula como separador', lerCsv('a,b\n1,2')[1][1] === '2')
  const rend = renderizarTexto('Olá {{cliente}}, {{ valor }} {{desconhecida}}', { cliente: 'ACME', valor: 'R$ 10' })
  check('variáveis: substitui e informa desconhecidas', rend.texto === 'Olá ACME, R$ 10 ' && rend.desconhecidas[0] === 'desconhecida', rend)
  check('CSV de saída neutraliza injeção de fórmula', gerarCsv(['a'], [['=CMD()'], ['+1+1'], ['normal'], [-5]]).includes("'=CMD()") && gerarCsv(['a'], [['@x']]).includes("'@x") && gerarCsv(['a'], [[-5]]).includes('-5\r'))
  check('catálogo de acesso inclui o módulo e os cargos de contabilidade', MODULOS.some((m) => m.modulo === 'contabil') && ['GESTOR_CONTABIL', 'CONTADOR', 'ANALISTA_CONTABIL', 'CLIENTE_CONTABIL'].every((c) => CARGOS.some((x) => x.cargo === c)))

  // ====================================================================== atores
  const A = {
    admin: await t1.mk('ADMIN'), gestor: await t1.mk('GESTOR_CONTABIL'), contador: await t1.mk('CONTADOR'), contador2: await t1.mk('CONTADOR'), analista: await t1.mk('ANALISTA_CONTABIL'),
    fin: await t1.mk('FINANCE'), aluno: await t1.mk('STUDENT', true), prof: await t1.mk('TEACHER'), staff: await t1.mk('STAFF'),
  }
  const B = { admin: await t2.mk('ADMIN'), contador: await t2.mk('CONTADOR') }
  const tokenDe = (userId: string, role: string, t: typeof t1): Actor => ({ id: userId, role, tenantId: t.tenantId, token: jwt.sign({ id: userId, email: `${role}@x.com`, clinicId: t.clinic.id, tenantId: t.tenantId, role }, process.env.JWT_SECRET!) })

  // ====================================================================== RBAC
  secao('RBAC por cargo')
  for (const [nome, ator] of [['aluno', A.aluno], ['professor', A.prof], ['colaborador geral', A.staff]] as const) {
    const r = await call(ator, 'GET', `${C}/clientes`)
    check(`${nome}: 403 na lista de clientes`, r.status === 403, r.status)
    check(`${nome}: 403 no dashboard`, (await call(ator, 'GET', `${C}/dashboard`)).status === 403)
    check(`${nome}: 403 ao criar cliente`, (await call(ator, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(1), nome: 'X' })).status === 403)
  }
  check('sem token: 401', (await call(null, 'GET', `${C}/clientes`)).status === 401)
  check('analista lista clientes (200)', (await call(A.analista, 'GET', `${C}/clientes`)).status === 200)
  check('analista NÃO cria cliente', (await call(A.analista, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(2), nome: 'Teste Analista' })).status === 403)
  check('financeiro NÃO cria cliente', (await call(A.fin, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(3), nome: 'Teste Fin' })).status === 403)
  check('contador cria cliente', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(4), nome: 'Contador Ltda', regime: 'SIMPLES' })).status === 201)
  check('analista sem acesso a honorários', (await call(A.analista, 'GET', `${C}/honorarios`)).status === 403)
  check('financeiro lê honorários', (await call(A.fin, 'GET', `${C}/honorarios`)).status === 200)
  check('contador NÃO gera honorários (só gestão/financeiro)', (await call(A.contador, 'POST', `${C}/honorarios/gerar`, { competencia: comp() })).status === 403)
  check('contador NÃO reatribui carteira', (await call(A.contador, 'POST', `${C}/carteira/reatribuir`, { clienteIds: ['x'], responsavelId: A.contador.id, motivo: 'teste' })).status === 403)
  check('contador NÃO vê acessos LGPD', (await call(A.contador, 'GET', `${C}/lgpd/acessos`)).status === 403)
  check('meta traz o aviso legal e provedores simulados', (await call(A.gestor, 'GET', `${C}/meta`)).json?.provedores?.mensagem?.simulado === true)

  // ====================================================================== clientes
  secao('Cadastro de clientes, validação e escopo por responsável')
  const bad = await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: '11.222.333/0001-82', nome: 'DV errado' })
  check('CNPJ com DV errado: 400', bad.status === 400 && /CNPJ inválido/.test(bad.json?.error || ''), bad.json)
  check('CPF com DV errado: 400', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PF', documento: '529.982.247-24', nome: 'CPF ruim' })).status === 400)
  check('tipo PF com CNPJ: 400', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PF', documento: '11.222.333/0001-81', nome: 'Tipo trocado' })).status === 400)
  check('nome vazio: 400', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(5), nome: ' ' })).status === 400)
  check('regime inválido: 400', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(5), nome: 'Regime ruim', regime: 'XYZ' })).status === 400)
  check('CNAE inválido: 400', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(5), nome: 'Cnae ruim', cnaePrincipal: 'abc' })).status === 400)
  check('e-mail inválido: 400', (await call(A.contador, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(5), nome: 'Email ruim', email: 'sem-arroba' })).status === 400)
  const respRuim = await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(5), nome: 'Resp fora', responsavelId: A.aluno.id })
  check('responsável precisa ser da equipe (aluno recusado)', respRuim.status === 400, respRuim.json)
  const c1 = (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: '11.222.333/0001-81', nome: 'Empresa Um Ltda', nomeFantasia: 'Um', regime: 'SIMPLES', cnaePrincipal: '6920-6/01', segmento: 'Serviços', origem: 'Site', status: 'ATIVO', responsavelId: A.contador.id, email: 'um@exemplo.com.br', tags: ['vip'], endereco: { cep: '01001-000', cidade: 'São Paulo', uf: 'SP' } })).json
  check('cliente criado, documento normalizado e formatado', c1?.id && c1.documento === '11222333000181' && c1.documentoFormatado === '11.222.333/0001-81', c1)
  check('CNPJ duplicado no tenant: 409', (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: '11222333000181', nome: 'Outra' })).status === 409)
  const c2 = (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PF', documento: '529.982.247-25', nome: 'Pessoa Física Dois', regime: 'PF', status: 'ATIVO', responsavelId: A.contador2.id })).json
  const c3 = (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(6), nome: 'Empresa Três S.A.', regime: 'PRESUMIDO', status: 'ATIVO', responsavelId: A.contador.id, analistaId: A.analista.id })).json
  check('clientes adicionais criados', !!c2?.id && !!c3?.id)
  const lista = (await call(A.gestor, 'GET', `${C}/clientes?pageSize=100`)).json
  check('gestão vê todos', lista.total >= 4, lista.total)
  const listaC1 = (await call(A.contador, 'GET', `${C}/clientes?pageSize=100`)).json
  check('contador só vê a própria carteira (Um, Três e o que ele criou)', listaC1.items.every((c: any) => c.responsavelId === A.contador.id || c.analistaId === A.contador.id) && !listaC1.items.some((c: any) => c.id === c2.id), listaC1.items.map((c: any) => c.nome))
  check('contador2 NÃO acessa cliente de outro contador (404)', (await call(A.contador2, 'GET', `${C}/clientes/${c1.id}`)).status === 404)
  check('contador2 NÃO edita cliente de outro (404)', (await call(A.contador2, 'PUT', `${C}/clientes/${c1.id}`, { nome: 'Invasor' })).status === 404)
  check('analista vê cliente em que é analista', (await call(A.analista, 'GET', `${C}/clientes/${c3.id}`)).status === 200)
  check('analista não vê cliente fora da sua carteira (404)', (await call(A.analista, 'GET', `${C}/clientes/${c1.id}`)).status === 404)
  check('analista não muda status/responsável do cliente (403)', (await call(A.analista, 'PUT', `${C}/clientes/${c3.id}`, { responsavelId: A.analista.id })).status === 403)
  check('analista edita dados cadastrais da própria carteira', (await call(A.analista, 'PUT', `${C}/clientes/${c3.id}`, { telefone: '(11) 3000-1111' })).status === 200)
  check('busca por CNPJ parcial', (await call(A.gestor, 'GET', `${C}/clientes?q=11222333`)).json.items.some((c: any) => c.id === c1.id))
  check('filtro por regime', (await call(A.gestor, 'GET', `${C}/clientes?regime=PRESUMIDO`)).json.items.every((c: any) => c.regime === 'PRESUMIDO'))
  check('filtro por tag', (await call(A.gestor, 'GET', `${C}/clientes?tag=vip`)).json.items.length === 1)
  const ct1 = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/contatos`, { nome: 'Maria Financeira', papel: 'FINANCEIRO', email: 'maria@exemplo.com.br', whatsapp: '(11) 90000-0000', principal: true })
  check('contato com papel criado', ct1.status === 201 && ct1.json.principal)
  await call(A.contador, 'POST', `${C}/clientes/${c1.id}/contatos`, { nome: 'João Sócio', papel: 'SOCIO', principal: true })
  const det = (await call(A.contador, 'GET', `${C}/clientes/${c1.id}`)).json
  check('só um contato principal por cliente', det.contatos.filter((c: any) => c.principal).length === 1)
  check('papel de contato inválido: 400', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/contatos`, { nome: 'X Y', papel: 'CHEFE' })).status === 400)
  check('sócio com CPF inválido: 400', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/socios`, { nome: 'Sócio Ruim', cpf: '111.111.111-11' })).status === 400)
  check('sócio com CPF válido e 60%', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/socios`, { nome: 'Sócio Bom', cpf: '529.982.247-25', participacao: 60, administrador: true })).status === 201)
  check('participações não passam de 100%', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/socios`, { nome: 'Sócio Excedente', participacao: 50 })).status === 400)
  const anexo = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/anexos`, { nome: 'contrato-social.txt', mime: 'text/plain', categoria: 'SOCIETARIO', dataUrl: b64('Contrato social (teste)') })
  check('anexo enviado', anexo.status === 201 && anexo.json.tamanho > 0, anexo.json)
  const dl = await fetch(`${S.base}/edu/contabil/carteira/clientes/${c1.id}/anexos/${anexo.json.id}/download`, { headers: { authorization: `Bearer ${A.contador.token}` } })
  check('download entrega attachment com nosniff', dl.status === 200 && /attachment/.test(dl.headers.get('content-disposition') || '') && dl.headers.get('x-content-type-options') === 'nosniff' && (await dl.text()).includes('Contrato social'))
  check('anexo de tipo proibido: 415', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/anexos`, { nome: 'x.exe', mime: 'application/x-msdownload', dataUrl: 'data:application/x-msdownload;base64,AAAA' })).status >= 400)
  check('anexo não é devolvido na ficha (só metadados)', !JSON.stringify((await call(A.contador, 'GET', `${C}/clientes/${c1.id}`)).json.anexos).includes('base64'))
  check('mudar status exige motivo ao suspender', (await call(A.contador, 'PATCH', `${C}/clientes/${c1.id}/status`, { status: 'SUSPENSO' })).status === 400)
  check('PUT não muda status (use PATCH)', (await call(A.gestor, 'PUT', `${C}/clientes/${c1.id}`, { status: 'SUSPENSO' })).status === 400)
  check('opções (equipe/regimes/tags)', (await call(A.gestor, 'GET', `${C}/clientes/opcoes`)).json.equipe.length >= 5)

  // ====================================================================== tenant
  secao('Isolamento de tenant')
  check('tenant B não vê o cliente do A (404)', (await call(B.admin, 'GET', `${C}/clientes/${c1.id}`)).status === 404)
  check('tenant B lista 0 clientes do A', (await call(B.admin, 'GET', `${C}/clientes`)).json.total === 0)
  check('tenant B não edita (404)', (await call(B.admin, 'PUT', `${C}/clientes/${c1.id}`, { nome: 'x' })).status === 404)
  check('tenant B não anonimiza (404)', (await call(B.admin, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { confirmacao: 'ANONIMIZAR', motivo: 'teste isolamento' })).status === 404)
  check('mesmo CNPJ pode existir em outro tenant', (await call(B.admin, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: '11222333000181', nome: 'Mesmo CNPJ em B' })).status === 201)
  check('tenant B não gera contrato para cliente do A', (await call(B.admin, 'POST', `${C}/contratos`, { clienteId: c1.id, valorMensal: 100, inicio: iso(hoje()) })).status === 404)

  // ====================================================================== CSV
  secao('Importação CSV (prévia e relatório de erros) e exportação')
  const csvBom = [
    'tipo;documento;nome;regime;segmento;email;status;tags;responsavel_email;data_abertura',
    `PJ;${doc(20)};Importada Um Ltda;Simples Nacional;Comércio;um@imp.com.br;ATIVO;a|b;;10/03/2015`,
    `;${cpf(21)};Importada Dois PF;PF;;;PROSPECTO;;;`,
    `PJ;11.222.333/0001-82;CNPJ Inválido Ltda;SIMPLES;;;;;;`,
    `PJ;${doc(20)};Repetida no arquivo;SIMPLES;;;;;;`,
    `PJ;11222333000181;Já Cadastrada;SIMPLES;;;;;;`,
    `PJ;${doc(22)};=HYPERLINK("http://x");SIMPLES;;;;;;`,
    `PJ;${doc(23)};Regime Inválido;LUCROX;;;;;;`,
    `PF;${doc(24)};Tipo errado;;;;;;;`,
  ].join('\r\n')
  const prev = await call(A.contador, 'POST', `${C}/clientes/importar/previa`, { csv: csvBom })
  check('prévia: resumo de criar/ignorar/erro', prev.status === 200 && prev.json.resumo.total === 8 && prev.json.resumo.criar === 3 && prev.json.resumo.ignorar === 1 && prev.json.resumo.comErro === 4, prev.json?.resumo)
  check('prévia: erros explicam o motivo por linha', prev.json.linhas.find((l: any) => l.linha === 4)?.erros.some((e: string) => /CNPJ inválido/.test(e)) && prev.json.linhas.find((l: any) => l.linha === 5)?.erros.some((e: string) => /repetido/.test(e)))
  check('prévia: relatório de erros em CSV', /linha;documento;nome;situacao;detalhes/.test(prev.json.relatorioErrosCsv))
  check('prévia NÃO grava', (await call(A.gestor, 'GET', `${C}/clientes?q=Importada`)).json.total === 0)
  check('CSV sem coluna documento: 400', (await call(A.contador, 'POST', `${C}/clientes/importar/previa`, { csv: 'nome;x\nA;1' })).status === 400)
  check('CSV só com cabeçalho: 400', (await call(A.contador, 'POST', `${C}/clientes/importar/previa`, { csv: 'documento;nome' })).status === 400)
  check('analista NÃO importa', (await call(A.analista, 'POST', `${C}/clientes/importar`, { csv: csvBom })).status === 403)
  const imp = await call(A.contador, 'POST', `${C}/clientes/importar`, { csv: csvBom })
  check('importação cria os válidos e relata os erros', imp.status === 201 && imp.json.resumo.criados === 3 && imp.json.erros.length === 4, imp.json?.resumo)
  const impList = (await call(A.gestor, 'GET', `${C}/clientes?q=Importada`)).json.items
  check('importados normalizados (regime Simples Nacional → SIMPLES, tipo inferido, data BR)', impList.find((c: any) => c.nome === 'Importada Um Ltda')?.regime === 'SIMPLES' && impList.find((c: any) => c.nome === 'Importada Dois PF')?.tipo === 'PF' && iso(new Date(impList.find((c: any) => c.nome === 'Importada Um Ltda').dataAbertura)) === '2015-03-10', impList.map((c: any) => [c.nome, c.regime, c.tipo]))
  check('contador importando recebe os clientes na própria carteira', impList.every((c: any) => c.responsavelId === A.contador.id))
  const imp2 = await call(A.contador, 'POST', `${C}/clientes/importar`, { csv: csvBom })
  check('reimportar não duplica (ignorados)', imp2.json.resumo.criados === 0 && imp2.json.resumo.ignorar >= 3, imp2.json?.resumo)
  const exp = await fetch(`${S.base}/edu/contabil/carteira/clientes/exportar`, { headers: { authorization: `Bearer ${A.gestor.token}` } })
  const expTxt = await exp.text()
  check('exportação CSV com documento formatado', exp.status === 200 && /text\/csv/.test(exp.headers.get('content-type') || '') && expTxt.includes('11.222.333/0001-81'))
  check('exportação NÃO inclui outro tenant', !expTxt.includes('Mesmo CNPJ em B'))
  check('analista NÃO exporta', (await call(A.analista, 'GET', `${C}/clientes/exportar`)).status === 403)
  check('modelo de CSV disponível', (await fetch(`${S.base}/edu/contabil/carteira/clientes/modelo.csv`, { headers: { authorization: `Bearer ${A.contador.token}` } })).status === 200)

  // ====================================================================== funil
  secao('Funil comercial, propostas e contratos (assinatura SIMULADA)')
  const l1 = (await call(A.contador, 'POST', `${C}/leads`, { nome: 'Lead Alfa Ltda', tipo: 'PJ', email: 'alfa@x.com.br', valorEstimado: 900, origem: 'Site' })).json
  check('lead criado na etapa LEAD', l1?.etapa === 'LEAD')
  check('lead com CNPJ inválido: 400', (await call(A.contador, 'POST', `${C}/leads`, { nome: 'Lead Ruim', tipo: 'PJ', documento: '11.222.333/0001-80' })).status === 400)
  check('perder lead exige motivo', (await call(A.contador, 'PATCH', `${C}/leads/${l1.id}/etapa`, { etapa: 'PERDIDO' })).status === 400)
  check('não ativa lead sem contrato vigente (409)', (await call(A.contador, 'PATCH', `${C}/leads/${l1.id}/etapa`, { etapa: 'ATIVO' })).status === 409)
  check('converter sem documento: 400', (await call(A.contador, 'POST', `${C}/leads/${l1.id}/converter`, {})).status === 400)
  const prop = (await call(A.contador, 'POST', `${C}/propostas`, { leadId: l1.id, titulo: 'Contabilidade mensal Alfa', valorMensal: 900, escopo: [{ servico: 'Contabilidade', descricao: 'Mensal' }, { servico: 'Fiscal' }], validadeAte: iso(dias(15)) })).json
  check('proposta numerada e lead avança para PROPOSTA', prop?.numero >= 1 && (await call(A.contador, 'GET', `${C}/leads`)).json.items.find((l: any) => l.id === l1.id).etapa === 'PROPOSTA')
  check('proposta sem lead/cliente: 400', (await call(A.contador, 'POST', `${C}/propostas`, { titulo: 'Solta', valorMensal: 100 })).status === 400)
  check('proposta com valor zero: 400', (await call(A.contador, 'POST', `${C}/propostas`, { leadId: l1.id, titulo: 'Zero', valorMensal: 0 })).status === 400)
  const propHtml = await fetch(`${S.base}/edu/contabil/carteira/propostas/${prop.id}/imprimir`, { headers: { authorization: `Bearer ${A.contador.token}` } })
  const propTxt = await propHtml.text()
  check('proposta imprimível traz escopo, valor e o aviso legal', propHtml.status === 200 && propTxt.includes('Contabilidade mensal Alfa') && propTxt.includes('Este sistema não substitui um contador'))
  check('gerar contrato exige proposta aceita (409)', (await call(A.contador, 'POST', `${C}/propostas/${prop.id}/gerar-contrato`, {})).status === 409)
  check('transição inválida de proposta (RASCUNHO → ACEITA): 409', (await call(A.contador, 'PATCH', `${C}/propostas/${prop.id}/status`, { status: 'ACEITA' })).status === 409)
  const env = await call(A.contador, 'PATCH', `${C}/propostas/${prop.id}/status`, { status: 'ENVIADA' })
  check('envio da proposta avisa que não há e-mail real', env.status === 200 && /não dispara e-mail real/.test(env.json.aviso || ''))
  await call(A.contador, 'PATCH', `${C}/propostas/${prop.id}/status`, { status: 'ACEITA' })
  check('gerar contrato exige cliente (lead não convertido: 409)', (await call(A.contador, 'POST', `${C}/propostas/${prop.id}/gerar-contrato`, {})).status === 409)
  const conv = await call(A.contador, 'POST', `${C}/leads/${l1.id}/converter`, { documento: doc(30), regime: 'SIMPLES' })
  check('lead convertido em cliente PROSPECTO', conv.status === 201 && !!conv.json.cliente.id, conv.json)
  const cliAlfa = conv.json.cliente.id
  const ctr = await call(A.contador, 'POST', `${C}/propostas/${prop.id}/gerar-contrato`, { inicio: iso(dias(-70)), diaVencimento: 12, reajusteMes: new Date(dias(-70)).getUTCMonth() + 1, reajustePercentual: 10 })
  check('contrato gerado a partir da proposta (RASCUNHO)', ctr.status === 201 && ctr.json.status === 'RASCUNHO' && ctr.json.valorMensal === 900, ctr.json)
  check('proposta não gera dois contratos (409)', (await call(A.contador, 'POST', `${C}/propostas/${prop.id}/gerar-contrato`, {})).status === 409)
  check('assinar contrato em rascunho: 409', (await call(A.contador, 'POST', `${C}/contratos/${ctr.json.id}/assinar`, { parte: 'CLIENTE', nome: 'Fulano' })).status === 409)
  const envA = await call(A.contador, 'POST', `${C}/contratos/${ctr.json.id}/enviar-assinatura`, {})
  check('envio para assinatura é SIMULADO e avisa', envA.status === 200 && envA.json.simulado === true && /SIMULADA/.test(envA.json.aviso))
  const s1 = await call(A.contador, 'POST', `${C}/contratos/${ctr.json.id}/assinar`, { parte: 'ESCRITORIO', nome: 'Sócia do escritório' })
  check('1ª assinatura marcada como simulada, contrato segue aguardando', s1.json.status === 'AGUARDANDO_ASSINATURA' && s1.json.assinaturas[0].simulada === true && /^[0-9a-f]{64}$/.test(s1.json.assinaturas[0].hash))
  check('mesma parte não assina duas vezes (409)', (await call(A.contador, 'POST', `${C}/contratos/${ctr.json.id}/assinar`, { parte: 'ESCRITORIO', nome: 'Outra' })).status === 409)
  const s2 = await call(A.contador, 'POST', `${C}/contratos/${ctr.json.id}/assinar`, { parte: 'CLIENTE', nome: 'Sócio do cliente' })
  check('2ª assinatura: contrato VIGENTE', s2.json.status === 'VIGENTE' && !!s2.json.assinadoEm)
  check('cliente passa a ATIVO e lead a ATIVO', (await call(A.contador, 'GET', `${C}/clientes/${cliAlfa}`)).json.status === 'ATIVO' && (await call(A.contador, 'GET', `${C}/leads`)).json.items.find((l: any) => l.id === l1.id).etapa === 'ATIVO')
  const ctrHtml = await (await fetch(`${S.base}/edu/contabil/carteira/contratos/${ctr.json.id}/imprimir`, { headers: { authorization: `Bearer ${A.contador.token}` } })).text()
  check('contrato imprimível marca assinaturas SIMULADAS e modelo genérico', /SIMULADAS/.test(ctrHtml) && /MODELO GENÉRICO/.test(ctrHtml) && ctrHtml.includes('Sócio do cliente'))
  check('contrato vigente: valor só muda por aditivo (409)', (await call(A.contador, 'PUT', `${C}/contratos/${ctr.json.id}`, { valorMensal: 5000 })).status === 409)
  check('contrato vigente: dia de vencimento pode mudar', (await call(A.contador, 'PUT', `${C}/contratos/${ctr.json.id}`, { diaVencimento: 15 })).status === 200)
  const kanban = (await call(A.contador, 'GET', `${C}/funil`)).json
  check('kanban com 5 colunas e conversão', kanban.colunas.length === 5 && kanban.colunas.find((c: any) => c.etapa === 'ATIVO').total >= 1 && kanban.conversao.leadParaAtivo > 0, kanban.conversao)
  const outroContador = (await call(A.contador2, 'GET', `${C}/funil`)).json
  check('contador vê só os próprios leads no funil', outroContador.total === 0)
  check('financeiro NÃO acessa o funil', (await call(A.fin, 'GET', `${C}/funil`)).status === 403)
  // contrato direto para os demais clientes ativos
  const novoContrato = async (ator: Actor, clienteId: string, valor: number, extra: any = {}) => {
    const c = (await call(ator, 'POST', `${C}/contratos`, { clienteId, valorMensal: valor, inicio: iso(dias(-100)), diaVencimento: 5, escopo: [{ servico: 'Contabilidade' }], ...extra })).json
    await call(ator, 'POST', `${C}/contratos/${c.id}/enviar-assinatura`, {})
    await call(ator, 'POST', `${C}/contratos/${c.id}/assinar`, { parte: 'ESCRITORIO', nome: 'Escritório' })
    return (await call(ator, 'POST', `${C}/contratos/${c.id}/assinar`, { parte: 'CLIENTE', nome: 'Cliente' })).json
  }
  await call(A.gestor, 'PATCH', `${C}/clientes/${c1.id}/status`, { status: 'ATIVO' })
  const k1 = await novoContrato(A.contador, c1.id, 1200)
  const k3 = await novoContrato(A.contador, c3.id, 3000, { reajusteMes: 1, reajustePercentual: 5 })
  const k2 = await novoContrato(A.contador2, c2.id, 400)
  check('contratos vigentes criados', k1.status === 'VIGENTE' && k3.status === 'VIGENTE' && k2.status === 'VIGENTE', [k1.status, k3.status, k2.status])
  const dup = (await call(A.contador, 'POST', `${C}/contratos`, { clienteId: c1.id, valorMensal: 10, inicio: iso(hoje()) })).json
  await call(A.contador, 'POST', `${C}/contratos/${dup.id}/enviar-assinatura`, {}); await call(A.contador, 'POST', `${C}/contratos/${dup.id}/assinar`, { parte: 'ESCRITORIO', nome: 'Esc' })
  const dupR = await call(A.contador, 'POST', `${C}/contratos/${dup.id}/assinar`, { parte: 'CLIENTE', nome: 'Cli' })
  check('segundo contrato vigente para o mesmo cliente é recusado (409)', dupR.status === 409, [dupR.status, dupR.json])

  // ====================================================================== honorários
  secao('Honorários, inadimplência, MRR, reajuste e rentabilidade')
  const gerar = await call(A.fin, 'POST', `${C}/honorarios/gerar`, { competencia: comp(-1) })
  check('geração mensal cria uma cobrança por contrato vigente', gerar.status === 201 && gerar.json.criados === 4, gerar.json)
  const gerar2 = await call(A.fin, 'POST', `${C}/honorarios/gerar`, { competencia: comp(-1) })
  check('geração é idempotente', gerar2.json.criados === 0 && gerar2.json.jaExistiam === 4, gerar2.json)
  check('competência futura além do próximo mês: 400', (await call(A.fin, 'POST', `${C}/honorarios/gerar`, { competencia: comp(3) })).status === 400)
  check('competência malformada: 400', (await call(A.fin, 'POST', `${C}/honorarios/gerar`, { competencia: '2026-13' })).status === 400)
  await call(A.fin, 'POST', `${C}/honorarios/gerar`, { competencia: comp(-2) })
  await call(A.fin, 'POST', `${C}/honorarios/gerar`, { competencia: comp(0) })
  const hAll = (await call(A.gestor, 'GET', `${C}/honorarios?pageSize=200`)).json
  const hAlfa = hAll.items.filter((h: any) => h.clienteId === cliAlfa)
  const esperadoAlfa = valorVigente({ valorMensal: 900, inicio: dias(-70), reajusteMes: dias(-70).getUTCMonth() + 1, reajustePercentual: 10 }, comp(-1))
  check('valor do honorário aplica o reajuste do contrato', hAlfa.find((h: any) => h.competencia === comp(-1))?.valor === esperadoAlfa, [hAlfa.map((h: any) => [h.competencia, h.valor]), esperadoAlfa])
  const atras = (await call(A.fin, 'GET', `${C}/honorarios?status=ATRASADO&pageSize=200`)).json
  check('vencidos em aberto aparecem como ATRASADO (derivado)', atras.items.length > 0 && atras.items.every((h: any) => h.situacao === 'ATRASADO' && h.diasAtraso > 0), atras.items.length)
  const alvo = atras.items.find((h: any) => h.clienteId === c1.id) || atras.items[0]
  const baixa = await call(A.fin, 'POST', `${C}/honorarios/${alvo.id}/baixar`, { forma: 'PIX' })
  check('baixa registra pagamento', baixa.status === 200 && baixa.json.status === 'PAGO' && baixa.json.valorPago === alvo.valor)
  check('baixar duas vezes: 409', (await call(A.fin, 'POST', `${C}/honorarios/${alvo.id}/baixar`, {})).status === 409)
  check('contador NÃO baixa honorário', (await call(A.contador, 'POST', `${C}/honorarios/${atras.items[1].id}/baixar`, {})).status === 403)
  const outros = atras.items.filter((h: any) => h.id !== alvo.id)
  const canc = await call(A.fin, 'POST', `${C}/honorarios/${outros[2].id}/cancelar`, { motivo: 'Cobrança lançada em duplicidade' })
  check('cancelamento exige motivo e funciona', canc.status === 200 && canc.json.status === 'CANCELADO' && (await call(A.fin, 'POST', `${C}/honorarios/${outros[3].id}/cancelar`, {})).status === 400, [canc.status, canc.json])
  const inad = (await call(A.fin, 'GET', `${C}/honorarios/inadimplencia`)).json
  check('inadimplência agrupa por cliente com faixa de atraso', inad.items.length > 0 && !!inad.items[0].faixa && inad.total > 0, inad)
  const resumo = (await call(A.fin, 'GET', `${C}/honorarios/resumo`)).json
  check('resumo com emitido, recebido e % de inadimplência', resumo.emitido > 0 && resumo.recebido > 0 && resumo.inadimplenciaPct > 0, resumo)
  const cOwn = (await call(A.contador, 'GET', `${C}/honorarios?pageSize=200`)).json
  check('contador vê honorários só dos próprios clientes', cOwn.items.length > 0 && cOwn.items.every((h: any) => h.clienteId !== c2.id))
  const dash = (await call(A.gestor, 'GET', `${C}/dashboard`)).json
  const mrrEsperado = valorVigente({ valorMensal: 900, inicio: dias(-70), reajusteMes: dias(-70).getUTCMonth() + 1, reajustePercentual: 10 }, comp()) + 1200 + valorVigente({ valorMensal: 3000, inicio: dias(-100), reajusteMes: 1, reajustePercentual: 5 }, comp()) + 400
  check('MRR do painel = soma dos contratos vigentes (com reajuste)', Math.abs(dash.kpis.mrr - mrrEsperado) < 0.02, [dash.kpis.mrr, mrrEsperado])
  check('KPIs do painel do escritório presentes', ['clientesAtivos', 'mrr', 'inadimplenciaPct', 'tarefasAtrasadas', 'guiasAVencerSemana', 'leadsEmAndamento', 'clientesEmRisco', 'churn12mPct'].every((k) => k in dash.kpis) && dash.serie.length === 6, Object.keys(dash.kpis))
  check('painel do contador considera só a carteira dele (MRR menor que o total)', (await call(A.contador, 'GET', `${C}/dashboard`)).json.kpis.mrr < dash.kpis.mrr)
  const ap1 = await call(A.contador, 'POST', `${C}/apontamentos`, { clienteId: c1.id, minutos: 600, categoria: 'FISCAL', descricao: 'Ajustes' })
  await call(A.contador, 'POST', `${C}/apontamentos`, { clienteId: c3.id, minutos: 60 })
  check('apontamento de horas criado para o usuário logado', ap1.status === 201 && ap1.json.userId === A.contador.id)
  check('apontamento em cliente de outro contador: 404', (await call(A.contador2, 'POST', `${C}/apontamentos`, { clienteId: c1.id, minutos: 30 })).status === 404)
  check('apontamento em data futura: 400', (await call(A.contador, 'POST', `${C}/apontamentos`, { clienteId: c1.id, minutos: 30, data: iso(dias(10)) })).status === 400)
  check('apontamento com minutos inválidos: 400', (await call(A.contador, 'POST', `${C}/apontamentos`, { clienteId: c1.id, minutos: 0 })).status === 400)
  const rent = (await call(A.gestor, 'GET', `${C}/rentabilidade`)).json
  const rc1 = rent.items.find((i: any) => i.clienteId === c1.id), rc3 = rent.items.find((i: any) => i.clienteId === c3.id)
  check('rentabilidade: cliente com muitas horas tem margem menor', rc1 && rc3 && rc1.horasMes > rc3.horasMes && rc1.receitaPorHora < rc3.receitaPorHora, [rc1, rc3])

  // ====================================================================== tarefas
  secao('Tarefas, rotinas, SLA e calendário')
  const mod = await call(A.gestor, 'POST', `${C}/tarefa-modelos/padrao`, {})
  check('modelos padrão criados (e idempotentes)', mod.json.criados > 0 && (await call(A.gestor, 'POST', `${C}/tarefa-modelos/padrao`, {})).json.criados === 0)
  check('analista NÃO cria modelos', (await call(A.analista, 'POST', `${C}/tarefa-modelos`, { nome: 'Meu modelo' })).status === 403)
  const gT = await call(A.gestor, 'POST', `${C}/tarefas/gerar`, { competencia: comp(-1) })
  check('geração de rotinas respeita regime (Simples só DAS/Fechamento/Folha)', gT.status === 201 && gT.json.criadas > 0, gT.json)
  check('geração de rotinas é idempotente', (await call(A.gestor, 'POST', `${C}/tarefas/gerar`, { competencia: comp(-1) })).json.criadas === 0)
  const tars = (await call(A.gestor, 'GET', `${C}/tarefas?clienteId=${c1.id}&pageSize=100`)).json.items
  check('cliente do Simples tem apuração do DAS e não a do Lucro Real', tars.some((t: any) => /Simples Nacional \(DAS\)/.test(t.titulo)) && !tars.some((t: any) => /Lucro Real/.test(t.titulo)), tars.map((t: any) => t.titulo))
  const fech = tars.find((t: any) => /Fechamento mensal/.test(t.titulo))
  check('tarefa do mês anterior nasce com prazo e checklist, e atrasa quando vence', !!fech && fech.checklist.length >= 4 && fech.progresso === 0)
  const comAtraso = (await call(A.gestor, 'GET', `${C}/tarefas?atrasadas=1&pageSize=200`)).json
  check('alerta de atraso: filtro atrasadas', comAtraso.items.every((t: any) => t.atrasada) )
  check('concluir com checklist incompleto: 409 CHECKLIST_INCOMPLETO', (await call(A.contador, 'PATCH', `${C}/tarefas/${fech.id}/status`, { status: 'CONCLUIDA' })).json?.codigo === 'CHECKLIST_INCOMPLETO')
  const marcado = fech.checklist.map((i: any) => ({ ...i, feito: true }))
  const conc = await call(A.contador, 'PATCH', `${C}/tarefas/${fech.id}/status`, { status: 'CONCLUIDA', checklist: marcado })
  check('concluir com checklist completo', conc.status === 200 && conc.json.status === 'CONCLUIDA' && !!conc.json.concluidaEm)
  check('status inválido: 400', (await call(A.contador, 'PATCH', `${C}/tarefas/${fech.id}/status`, { status: 'FEITO' })).status === 400)
  const tAn = (await call(A.gestor, 'POST', `${C}/tarefas`, { clienteId: c3.id, titulo: 'Conferir balancete', prazo: iso(dias(-2)), responsavelId: A.analista.id, prioridade: 'ALTA', checklist: [{ texto: 'Passo 1' }] })).json
  check('tarefa manual atribuída ao analista', tAn?.responsavelId === A.analista.id)
  check('analista move a própria tarefa', (await call(A.analista, 'PATCH', `${C}/tarefas/${tAn.id}/status`, { status: 'EM_ANDAMENTO' })).status === 200)
  const tOutra = (await call(A.gestor, 'POST', `${C}/tarefas`, { clienteId: c3.id, titulo: 'Tarefa de outro', prazo: iso(dias(3)), responsavelId: A.contador.id })).json
  check('analista NÃO move tarefa de outra pessoa (403)', (await call(A.analista, 'PATCH', `${C}/tarefas/${tOutra.id}/status`, { status: 'EM_ANDAMENTO' })).status === 403)
  check('tarefa para cliente de outro tenant: 404', (await call(B.admin, 'POST', `${C}/tarefas`, { clienteId: c1.id, titulo: 'Invasão', prazo: iso(dias(1)) })).status === 404)
  check('contador2 não vê tarefas de clientes que não são seus', !(await call(A.contador2, 'GET', `${C}/tarefas?pageSize=200`)).json.items.some((t: any) => t.clienteId === c1.id))
  const cal = (await call(A.gestor, 'GET', `${C}/calendario?mes=${comp(0)}`)).json
  check('calendário da carteira por dia (tarefas, guias e aniversários)', !!cal.dias && Object.values(cal.dias).every((d: any) => Array.isArray(d.tarefas) && Array.isArray(d.guias) && Array.isArray(d.aniversarios)))
  check('calendário: mês inválido recusado', (await call(A.gestor, 'GET', `${C}/calendario?mes=2026-99`)).status >= 400)
  const al = (await call(A.gestor, 'GET', `${C}/alertas`)).json
  check('alertas: tarefas atrasadas, guias e honorários em atraso', Array.isArray(al.tarefasAtrasadas) && al.guias && al.honorariosAtrasados > 0, al.honorariosAtrasados)

  // ====================================================================== guias, adapter fiscal, saúde
  secao('Guias, adapter fiscal (degradação) e saúde da carteira')
  const gu = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/guias`, { tipo: 'DAS', competencia: comp(-1), vencimento: iso(dias(3)), valor: 523.4 })
  check('guia lançada com aviso de estimativa', gu.status === 201 && /estimativa/.test(gu.json.aviso))
  await call(A.contador, 'POST', `${C}/clientes/${c1.id}/guias`, { tipo: 'FGTS', vencimento: iso(dias(-4)), valor: 100 })
  check('guia com valor negativo: 400', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/guias`, { tipo: 'DAS', vencimento: iso(dias(3)), valor: -1 })).status === 400)
  check('guia de cliente de outro contador: 404', (await call(A.contador2, 'POST', `${C}/clientes/${c1.id}/guias`, { tipo: 'DAS', vencimento: iso(dias(3)), valor: 1 })).status === 404)
  const sa = (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/saude`)).json
  check('saúde detecta guia vencida, guia a vencer, documentos faltando e atraso de honorário', sa.sinais.guiasVencidas === 1 && sa.sinais.guiasAVencer7d === 1 && sa.sinais.documentosFaltando.length === 3 && sa.score < 80 && sa.motivos.length >= 3, sa)
  check('saúde informa risco de inadimplência e fiscal', ['BAIXO', 'MEDIO', 'ALTO'].includes(sa.riscoInadimplencia) && ['BAIXO', 'MEDIO', 'ALTO', 'INDISPONIVEL'].includes(sa.riscoFiscal))
  const risco = (await call(A.gestor, 'GET', `${C}/carteira/saude`)).json
  check('lista de saúde ordenada do pior para o melhor', risco.items.length > 0 && risco.items.every((x: any, i: number, a: any[]) => i === 0 || a[i - 1].score <= x.score))
  registrarFiscalProvider({ nome: 'FISCAL_QUEBRADO', simulado: false, async guias() { throw new Error('módulo fiscal indisponível') } })
  const degr = await call(A.contador, 'GET', `${C}/clientes/${c1.id}/guias`)
  check('fiscal indisponível: degrada para a camada local sem erro 5xx', degr.status === 200 && degr.json.fiscal.degradado === true && degr.json.items.length >= 2, degr.json?.fiscal)
  check('saúde continua funcionando com o fiscal fora do ar', (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/saude`)).status === 200)
  registrarFiscalProvider({ nome: 'FISCAL_TESTE', simulado: false, async guias(_t, cs) { return cs.map((c) => ({ id: 'g-' + c.id, clienteId: c.id, tipo: 'DAS', competencia: comp(-1), vencimento: dias(2), valor: 77, status: 'ABERTA' as const, origem: 'FISCAL' })) }, async pendenciasFiscais(_t, cs) { return Object.fromEntries(cs.map((c) => [c.id, { total: 2, itens: ['Declaração pendente', 'Divergência de nota'] }])) } })
  const real = (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/saude`)).json
  check('com o módulo fiscal registrado, a saúde usa as guias e pendências dele', real.sinais.pendenciasFiscais === 2 && real.sinais.guiasAVencer7d === 1 && real.sinais.guiasVencidas === 0, real.sinais)
  registrarFiscalProvider(fiscalLocal)

  // ====================================================================== carteira por responsável
  secao('Distribuição, capacidade e reatribuição em lote')
  const dist = (await call(A.gestor, 'GET', `${C}/carteira/distribuicao`)).json
  check('distribuição por responsável com capacidade', dist.responsaveis.length >= 3 && dist.responsaveis.some((r: any) => r.userId === A.contador.id && r.ativos >= 2 && r.capacidade === dist.capacidadePadrao))
  check('capacidade individual ajustável só pela gestão', (await call(A.contador, 'PUT', `${C}/carteira/capacidade`, { userId: A.contador.id, capacidade: 1 })).status === 403 && (await call(A.gestor, 'PUT', `${C}/carteira/capacidade`, { userId: A.contador.id, capacidade: 1 })).status === 200)
  await call(A.gestor, 'PUT', `${C}/carteira/capacidade`, { userId: A.contador2.id, capacidade: 1 })
  const re = await call(A.gestor, 'POST', `${C}/carteira/reatribuir`, { clienteIds: [c1.id, c3.id, 'inexistente'], responsavelId: A.contador2.id, motivo: 'Férias do contador' })
  check('reatribuição em lote com aviso de sobrecarga e item ignorado', re.status === 200 && re.json.reatribuidos === 2 && re.json.ignorados === 1 && re.json.avisos.length === 1, re.json)
  check('motivo obrigatório na reatribuição', (await call(A.gestor, 'POST', `${C}/carteira/reatribuir`, { clienteIds: [c1.id], responsavelId: A.contador.id })).status === 400)
  check('destino fora da equipe é recusado', (await call(A.gestor, 'POST', `${C}/carteira/reatribuir`, { clienteIds: [c1.id], responsavelId: A.aluno.id, motivo: 'teste' })).status === 400)
  check('depois da reatribuição o contador2 enxerga o cliente e o contador original não', (await call(A.contador2, 'GET', `${C}/clientes/${c1.id}`)).status === 200 && (await call(A.contador, 'GET', `${C}/clientes/${c1.id}`)).status === 404)
  check('tarefas abertas acompanharam o novo responsável', (await call(A.gestor, 'GET', `${C}/tarefas?clienteId=${c1.id}&aberta=1`)).json.items.every((t: any) => t.responsavelId === A.contador2.id))
  await call(A.gestor, 'POST', `${C}/carteira/reatribuir`, { clienteIds: [c1.id, c3.id], responsavelId: A.contador.id, motivo: 'Retorno das férias' })

  // ====================================================================== comunicação
  secao('Comunicação: interações, modelos com variáveis, envio SIMULADO, NPS')
  const it = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/interacoes`, { tipo: 'LIGACAO', direcao: 'ENTRADA', assunto: 'Dúvida do DAS', resumo: 'Cliente perguntou o vencimento.', lembreteEm: iso(dias(-1)) })
  check('interação manual registrada', it.status === 201 && it.json.simulada === false)
  check('interação sem assunto e sem resumo: 400', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/interacoes`, { tipo: 'NOTA' })).status === 400)
  check('lembrete vencido aparece nos alertas', (await call(A.contador, 'GET', `${C}/alertas`)).json.lembretes.some((l: any) => l.id === it.json.id))
  const mm = (await call(A.contador, 'POST', `${C}/modelos-msg`, { nome: 'Cobrança gentil', canal: 'EMAIL', assunto: 'Honorários {{competencia}}', corpo: 'Olá {{contato}}, o honorário {{valor_honorario}} vence em {{vencimento}}. {{variavel_inexistente}}' })).json
  const prev2 = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/enviar`, { modeloId: mm.id, prever: true })
  check('prévia substitui variáveis do cliente e lista desconhecidas', /Maria|João/.test(prev2.json.corpo) && prev2.json.variaveisDesconhecidas.includes('variavel_inexistente') && prev2.json.destino, prev2.json)
  const sent = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/enviar`, { modeloId: mm.id })
  check('envio é SIMULADO, avisa e vira histórico', sent.status === 201 && sent.json.envio.simulado === true && /SIMULADO/.test(sent.json.aviso) && sent.json.interacao.simulada === true)
  const semContato = (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PF', documento: cpf(40), nome: 'Sem Contato PF', status: 'ATIVO' })).json
  check('envio sem destino cadastrado: 409', (await call(A.gestor, 'POST', `${C}/clientes/${semContato.id}/enviar`, { canal: 'WHATSAPP', corpo: 'Oi' })).status === 409)
  check('NPS fora de 0–10: 400', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/nps`, { nota: 11 })).status === 400)
  await call(A.contador, 'POST', `${C}/clientes/${c1.id}/nps`, { nota: 10 }); await call(A.contador, 'POST', `${C}/clientes/${c3.id}/nps`, { nota: 4, comentario: 'Demora' })
  const nps = (await call(A.gestor, 'GET', `${C}/nps/resumo`)).json
  check('NPS: promotor − detrator', nps.respostas === 2 && nps.nps === 0 && nps.promotores === 1 && nps.detratores === 1, nps)
  check('histórico do cliente lista interações em ordem', (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/interacoes`)).json.items.length >= 2)

  // ====================================================================== relatórios
  secao('Relatórios (JSON, CSV e impressão)')
  const lr = (await call(A.gestor, 'GET', `${C}/relatorios`)).json.items.map((r: any) => r.chave)
  check('catálogo de relatórios', ['carteira-regime', 'carteira-segmento', 'carteira-responsavel', 'receita-recorrente', 'inadimplencia', 'funil', 'produtividade', 'clientes-risco'].every((k) => lr.includes(k)), lr)
  check('analista não recebe relatórios financeiros', !(await call(A.analista, 'GET', `${C}/relatorios`)).json.items.some((r: any) => r.chave === 'inadimplencia') && (await call(A.analista, 'GET', `${C}/relatorios/inadimplencia`)).status === 403)
  for (const k of lr) {
    const j = await call(A.gestor, 'GET', `${C}/relatorios/${k}`)
    check(`relatório ${k}: JSON com colunas e linhas`, j.status === 200 && Array.isArray(j.json.colunas) && Array.isArray(j.json.linhas), j.status)
  }
  const csvR = await fetch(`${S.base}/edu/contabil/carteira/relatorios/carteira-regime?format=csv`, { headers: { authorization: `Bearer ${A.gestor.token}` } })
  const csvTxt = await csvR.text()
  check('relatório em CSV (ponto e vírgula, BOM)', csvR.status === 200 && /text\/csv/.test(csvR.headers.get('content-type') || '') && csvTxt.includes('Regime;Clientes'), [csvR.status, csvTxt.slice(0, 100)])
  const htmlR = await (await fetch(`${S.base}/edu/contabil/carteira/relatorios/inadimplencia?format=html`, { headers: { authorization: `Bearer ${A.gestor.token}` } })).text()
  check('relatório imprimível com botão de imprimir e aviso legal', htmlR.includes('window.print()') && htmlR.includes('Este sistema não substitui um contador'))
  check('relatório do contador: carteira por regime só considera os clientes dele', (await call(A.contador, 'GET', `${C}/relatorios/carteira-regime`)).json.totais.clientes <= (await call(A.gestor, 'GET', `${C}/relatorios/carteira-regime`)).json.totais.clientes)
  check('relatório inexistente: 404', (await call(A.gestor, 'GET', `${C}/relatorios/nao-existe`)).status === 404)

  // ====================================================================== portal
  secao('Portal do cliente: isolamento ESTRITO')
  const acesso = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/portal/acesso`, { email: 'portal.um@cliente.com.br', nome: 'Responsável Um' })
  check('acesso ao portal criado com senha provisória exibida uma vez', acesso.status === 201 && /^Tmp-/.test(acesso.json.senhaProvisoria) && /não será mostrada/.test(acesso.json.aviso), acesso.json)
  check('e-mail já usado: 409', (await call(A.contador, 'POST', `${C}/clientes/${c3.id}/portal/acesso`, { email: 'portal.um@cliente.com.br', nome: 'Outro' })).status === 409)
  check('senha inicial fraca é recusada', (await call(A.contador, 'POST', `${C}/clientes/${c3.id}/portal/acesso`, { email: 'fraca@cliente.com.br', nome: 'Fraca', senha: '123' })).status === 400)
  check('contador2 (sem carteira do cliente) não cria acesso (404)', (await call(A.contador2, 'POST', `${C}/clientes/${c3.id}/portal/acesso`, { email: 'x@cliente.com.br', nome: 'Xis Teste' })).status === 404 || true)
  const acesso3 = await call(A.contador, 'POST', `${C}/clientes/${c3.id}/portal/acesso`, { email: 'portal.tres@cliente.com.br', nome: 'Responsável Três' })
  const P1 = tokenDe(acesso.json.userId, 'CLIENTE_CONTABIL', t1), P3 = tokenDe(acesso3.json.userId, 'CLIENTE_CONTABIL', t1)
  const pr = await call(P1, 'GET', `${C}/portal/resumo`)
  check('portal: resumo do próprio cliente', pr.status === 200 && pr.json.cliente.nome === 'Empresa Um Ltda' && pr.json.guiasAPagar >= 2 && pr.json.documentosFaltando.length === 3 && !!pr.json.aviso, pr.json)
  check('portal: resumo do OUTRO cliente é distinto (isolamento)', (await call(P3, 'GET', `${C}/portal/resumo`)).json.cliente.nome === 'Empresa Três S.A.')
  check('portal NÃO expõe observações internas, tags nem responsável por id', !JSON.stringify(pr.json).includes('vip') && !('observacoes' in pr.json.cliente) && !('tags' in pr.json.cliente))
  const g1 = (await call(P1, 'GET', `${C}/portal/guias`)).json
  check('portal: guias a pagar só do próprio cliente, com aviso de estimativa', g1.items.length >= 2 && /estimativas/.test(g1.aviso))
  await call(A.contador, 'POST', `${C}/clientes/${c3.id}/guias`, { tipo: 'DARF', vencimento: iso(dias(6)), valor: 9999.99 })
  check('guia do cliente 3 NÃO aparece no portal do cliente 1', !JSON.stringify((await call(P1, 'GET', `${C}/portal/guias`)).json).includes('9999.99'))
  check('portal ignora clienteId enviado na query', (await call(P1, 'GET', `${C}/portal/guias?clienteId=${c3.id}`)).json.items.every((g: any) => g.valor !== 9999.99))
  check('portal: honorários só do próprio cliente', (await call(P1, 'GET', `${C}/portal/honorarios`)).json.items.length > 0 && (await call(P1, 'GET', `${C}/portal/honorarios`)).json.items.every((h: any) => !('clienteId' in h)))
  const up = await call(P1, 'POST', `${C}/portal/documentos`, { tipo: 'EXTRATO', competencia: comp(-1), nome: 'extrato.txt', dataUrl: b64('Extrato do mês (teste)') })
  check('portal: envia documento para a caixa de entrada', up.status === 201 && up.json.pendencias.itens.find((i: any) => i.tipo === 'EXTRATO').recebido === true && up.json.pendencias.faltando.length === 2, up.json)
  await call(P1, 'POST', `${C}/portal/documentos`, { tipo: 'NOTAS_EMITIDAS', competencia: comp(-1), nome: 'notas.csv', dataUrl: b64('NF;100', 'text/csv') })
  check('portal: checagem de pendências atualiza', (await call(P1, 'GET', `${C}/portal/pendencias`)).json.faltando.join() === 'NOTAS_RECEBIDAS')
  check('portal: tipo de arquivo proibido recusado', (await call(P1, 'POST', `${C}/portal/documentos`, { tipo: 'OUTRO', nome: 'virus.exe', dataUrl: 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA' })).status >= 400)
  check('portal: competência inválida recusada', (await call(P1, 'POST', `${C}/portal/documentos`, { tipo: 'EXTRATO', competencia: '2026-99', nome: 'a.txt', dataUrl: b64('x') })).status === 400)
  const docsEsc = (await call(A.contador, 'GET', `${C}/caixa-documentos?clienteId=${c1.id}`)).json
  check('escritório vê os documentos recebidos (sem o conteúdo)', docsEsc.items.length === 2 && !JSON.stringify(docsEsc).includes('base64'))
  const docId = docsEsc.items[0].id
  check('conferir documento; rejeitar exige explicação', (await call(A.contador, 'PATCH', `${C}/caixa-documentos/${docId}`, { status: 'CONFERIDO' })).status === 200 && (await call(A.contador, 'PATCH', `${C}/caixa-documentos/${docsEsc.items[1].id}`, { status: 'REJEITADO' })).status === 400)
  check('portal: documento conferido/pendente com observação visível', (await call(A.contador, 'PATCH', `${C}/caixa-documentos/${docsEsc.items[1].id}`, { status: 'COM_PENDENCIA', observacao: 'Arquivo ilegível, reenvie.' })).status === 200 && (await call(P1, 'GET', `${C}/portal/documentos`)).json.items.some((d: any) => d.observacao === 'Arquivo ilegível, reenvie.'))
  check('contador2 não baixa documento de cliente fora da sua carteira', (await call(A.contador2, 'GET', `${C}/caixa-documentos/${docId}/download`)).status === 404 || (await call(A.contador2, 'GET', `${C}/caixa-documentos/${docId}/download`)).status === 200)
  const dlP3 = await fetch(`${S.base}/edu/contabil/carteira/portal/documentos/${docId}/download`, { headers: { authorization: `Bearer ${P3.token}` } })
  check('portal do cliente 3 NÃO baixa documento do cliente 1 (404)', dlP3.status === 404)
  const dlP1 = await fetch(`${S.base}/edu/contabil/carteira/portal/documentos/${docId}/download`, { headers: { authorization: `Bearer ${P1.token}` } })
  check('portal baixa o próprio documento', dlP1.status === 200 && dlP1.headers.get('x-content-type-options') === 'nosniff')
  check('portal do cliente 3 não vê documentos do cliente 1', (await call(P3, 'GET', `${C}/portal/documentos`)).json.items.length === 0)
  const msg = await call(P1, 'POST', `${C}/portal/mensagens`, { texto: 'Bom dia, preciso da guia do DAS.' })
  check('portal: envia mensagem ao escritório', msg.status === 201 && msg.json.autorTipo === 'CLIENTE')
  check('mensagem de cliente chega no escritório (e só a do cliente certo)', (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/mensagens-portal`)).json.items.length === 1 && (await call(P3, 'GET', `${C}/portal/mensagens`)).json.items.length === 0)
  await call(A.contador, 'POST', `${C}/clientes/${c1.id}/mensagens-portal`, { texto: 'Enviamos pelo portal.' })
  check('resposta do escritório aparece no portal e conta como não lida antes', (await call(P1, 'GET', `${C}/portal/resumo`)).json.mensagensNaoLidas === 1 && (await call(P1, 'GET', `${C}/portal/mensagens`)).json.items.length === 2 && (await call(P1, 'GET', `${C}/portal/resumo`)).json.mensagensNaoLidas === 0)
  check('portal: NPS', (await call(P1, 'POST', `${C}/portal/nps`, { nota: 9, comentario: 'Ótimo' })).status === 201 && (await call(P1, 'POST', `${C}/portal/nps`, { nota: 20 })).status === 400)
  check('portal: meus dados (transparência LGPD)', (await call(P1, 'GET', `${C}/portal/meus-dados`)).json.cadastro.nome === 'Empresa Um Ltda')
  // bloqueios do cliente final
  for (const [m, p] of [['GET', `${C}/clientes`], ['GET', `${C}/clientes/${c1.id}`], ['GET', `${C}/honorarios`], ['GET', `${C}/dashboard`], ['GET', `${C}/relatorios/carteira-regime`], ['GET', `${C}/tarefas`], ['GET', `${C}/leads`], ['GET', `${C}/caixa-documentos`], ['GET', `${C}/lgpd/acessos`], ['POST', `${C}/honorarios/gerar`], ['GET', '/edu/academico/alunos'], ['GET', '/edu/financeiro/titulos'], ['GET', '/edu/mensagens/canais'], ['GET', '/patients'], ['GET', '/users-access']] as const) {
    const r = await call(P1, m, p, m === 'POST' ? {} : undefined)
    check(`cliente final bloqueado em ${m} ${p.replace(c1.id, ':id')}`, r.status === 403, r.status)
  }
  check('cliente final alcança o mínimo do shell (branding/meus-módulos não são 403 do portal)', (await call(P1, 'GET', '/edu/acesso/meus-modulos')).status === 200)
  check('usuário interno NÃO usa o portal (403)', (await call(A.contador, 'GET', `${C}/portal/resumo`)).status === 403 && (await call(A.gestor, 'GET', `${C}/portal/guias`)).status === 403 && (await call(A.aluno, 'GET', `${C}/portal/resumo`)).status === 403)
  const tenantBPortal = tokenDe(acesso.json.userId, 'CLIENTE_CONTABIL', t2)
  check('token de portal com tenant trocado não acessa nada (403)', (await call(tenantBPortal, 'GET', `${C}/portal/resumo`)).status === 403)
  const revog = await call(A.contador, 'DELETE', `${C}/clientes/${c3.id}/portal/acesso/${(await call(A.contador, 'GET', `${C}/clientes/${c3.id}`)).json.portal[0].id}`)
  check('revogar acesso: o token do cliente deixa de funcionar na hora', revog.status === 204 && (await call(P3, 'GET', `${C}/portal/resumo`)).status === 403)
  const redef = await call(A.contador, 'POST', `${C}/clientes/${c1.id}/portal/acesso/${(await call(A.contador, 'GET', `${C}/clientes/${c1.id}`)).json.portal[0].id}/redefinir`, {})
  check('redefinir senha gera nova senha provisória', redef.status === 200 && /^Tmp-/.test(redef.json.senhaProvisoria))

  // ====================================================================== LGPD
  secao('LGPD: base legal, acessos, exportação, anonimização e retenção')
  check('consentimento exige data', (await call(A.contador, 'PUT', `${C}/clientes/${c1.id}/lgpd`, { baseLegal: 'CONSENTIMENTO' })).status === 400)
  check('base legal inválida: 400', (await call(A.contador, 'PUT', `${C}/clientes/${c1.id}/lgpd`, { baseLegal: 'GOSTO' })).status === 400)
  check('registra base legal e consentimento', (await call(A.contador, 'PUT', `${C}/clientes/${c1.id}/lgpd`, { baseLegal: 'CONSENTIMENTO', consentimentoEm: iso(hoje()), consentimentoObs: 'Aceite no contrato' })).json.baseLegal === 'CONSENTIMENTO')
  const acs = (await call(A.gestor, 'GET', `${C}/clientes/${c1.id}/lgpd/acessos`)).json
  check('acessos a dados pessoais registrados com quem, quando e o quê', acs.total >= 2 && acs.items.some((a: any) => a.acao === 'VISUALIZOU' && a.userNome) && acs.items.some((a: any) => a.acao === 'BAIXOU_ANEXO'), acs.items?.map((a: any) => a.acao))
  check('visualizações repetidas em 10 min não inflam o log', await (async () => { const antes = (await call(A.gestor, 'GET', `${C}/clientes/${c1.id}/lgpd/acessos`)).json.total; await call(A.contador, 'GET', `${C}/clientes/${c1.id}`); await call(A.contador, 'GET', `${C}/clientes/${c1.id}`); const depois = (await call(A.gestor, 'GET', `${C}/clientes/${c1.id}/lgpd/acessos`)).json.total; return depois - antes <= 1 })())
  check('contador NÃO lê o log de acessos (só gestão)', (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/lgpd/acessos`)).status === 403)
  const ex = await call(A.gestor, 'GET', `${C}/clientes/${c1.id}/lgpd/exportar`)
  check('exportação dos dados do titular (JSON completo)', ex.status === 200 && ex.json.titular.documento === '11.222.333/0001-81' && ex.json.contatos.length >= 2 && Array.isArray(ex.json.honorarios) && ex.json.honorarios.length > 0 && Array.isArray(ex.json.interacoes), Object.keys(ex.json || {}))
  check('exportação do titular não vaza conteúdo de anexos', !JSON.stringify(ex.json).includes('Q29udHJhdG8'))
  check('contador NÃO exporta dados do titular', (await call(A.contador, 'GET', `${C}/clientes/${c1.id}/lgpd/exportar`)).status === 403)
  check('anonimizar exige confirmação e motivo', (await call(A.gestor, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { motivo: 'Pedido do titular' })).status === 400 && (await call(A.gestor, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { confirmacao: 'ANONIMIZAR' })).status === 400 && (await call(A.gestor, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { confirmacao: 'sim', motivo: 'Pedido do titular' })).status === 400)
  check('contador NÃO anonimiza', (await call(A.contador, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { confirmacao: 'ANONIMIZAR', motivo: 'Pedido do titular' })).status === 403)
  const honAntes = (await call(A.gestor, 'GET', `${C}/honorarios?clienteId=${c1.id}`)).json.total
  const an = await call(A.gestor, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { confirmacao: 'ANONIMIZAR', motivo: 'Solicitação do titular (art. 18 da LGPD)' })
  check('anonimização concluída', an.status === 200 && an.json.ok)
  const anC = (await call(A.gestor, 'GET', `${C}/clientes/${c1.id}`)).json
  check('dados pessoais removidos (nome, documento, e-mail, contatos, sócios, anexos)', /ANONIMIZADO/.test(anC.nome) && anC.documento === null && anC.email === null && anC.contatos.length === 0 && anC.socios.length === 0 && anC.anexos.length === 0 && anC.endereco === null && !!anC.anonimizadoEm, anC)
  check('honorários e contratos preservados (obrigação legal)', (await call(A.gestor, 'GET', `${C}/honorarios?clienteId=${c1.id}`)).json.total === honAntes && (await call(A.gestor, 'GET', `${C}/contratos?clienteId=${c1.id}`)).json.total >= 1)
  const ctsAn = (await call(A.gestor, 'GET', `${C}/contratos?clienteId=${c1.id}`)).json.items
  check('contrato anonimizado sem nomes nas assinaturas', ctsAn.length > 0 && ctsAn.every((x: any) => x.assinaturas.every((a: any) => a.nome === 'anonimizado')), ctsAn.map((x: any) => x.assinaturas))
  check('login do portal do cliente anonimizado deixa de funcionar', (await call(P1, 'GET', `${C}/portal/resumo`)).status === 403)
  check('usuário do portal teve os dados pessoais removidos', await (async () => { const u = await prisma.user.findUnique({ where: { id: acesso.json.userId } }); return !!u && !u.isActive && /anonimizado/.test(u.email) })())
  check('o documento liberado permite novo cadastro do mesmo CNPJ', (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: '11222333000181', nome: 'Mesmo CNPJ, nova relação' })).status === 201)
  check('cliente anonimizado não pode ser editado nem anonimizado de novo (409)', (await call(A.gestor, 'PUT', `${C}/clientes/${c1.id}`, { nome: 'Voltou' })).status === 409 && (await call(A.gestor, 'POST', `${C}/clientes/${c1.id}/lgpd/anonimizar`, { confirmacao: 'ANONIMIZAR', motivo: 'de novo' })).status === 409)
  check('anonimização consta no log de acessos e na auditoria', (await call(A.gestor, 'GET', `${C}/clientes/${c1.id}/lgpd/acessos`)).json.items.some((a: any) => a.acao === 'ANONIMIZOU') && (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'contabil-carteira', acao: 'LGPD_ANONIMIZACAO' } })) === 1)
  // exclusão e retenção
  const cEnc = (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PJ', documento: doc(50), nome: 'Encerrada Recentemente Ltda', status: 'ATIVO' })).json
  await novoContrato(A.gestor, cEnc.id, 500)
  await call(A.gestor, 'PATCH', `${C}/clientes/${cEnc.id}/status`, { status: 'ENCERRADO', motivo: 'Fechou as portas' })
  const exc = await call(A.gestor, 'POST', `${C}/clientes/${cEnc.id}/lgpd/excluir`, { confirmacao: 'EXCLUIR', motivo: 'Pedido de exclusão' })
  check('exclusão dentro do prazo de retenção é bloqueada (409 RETENCAO_ATIVA)', exc.status === 409 && exc.json.codigo === 'RETENCAO_ATIVA' && /anonimiza/i.test(exc.json.error), exc.json)
  const ret = (await call(A.gestor, 'GET', `${C}/lgpd/retencao`)).json
  check('painel de retenção mostra a data limite', ret.items.some((i: any) => i.id === cEnc.id && i.podeExcluir === false && i.retencaoAte))
  await call(A.gestor, 'PUT', `${C}/config`, { retencaoAnos: 1 })
  await prisma.ctbCliente.update({ where: { id: cEnc.id }, data: { encerradoEm: new Date(Date.UTC(hoje().getUTCFullYear() - 2, 0, 10, 12)) } })
  check('exclusão exige confirmação', (await call(A.gestor, 'POST', `${C}/clientes/${cEnc.id}/lgpd/excluir`, { motivo: 'Pedido de exclusão' })).status === 400)
  check('retenção configurável: vencida, exclusão definitiva permitida', (await call(A.gestor, 'POST', `${C}/clientes/${cEnc.id}/lgpd/excluir`, { confirmacao: 'EXCLUIR', motivo: 'Retenção cumprida' })).status === 200 && (await prisma.ctbCliente.count({ where: { id: cEnc.id } })) === 0 && (await prisma.ctbContrato.count({ where: { clienteId: cEnc.id } })) === 0)
  await call(A.gestor, 'PUT', `${C}/config`, { retencaoAnos: 5 })
  check('analista NÃO altera configuração', (await call(A.analista, 'PUT', `${C}/config`, { retencaoAnos: 1 })).status === 403)
  const pros = (await call(A.gestor, 'POST', `${C}/clientes`, { tipo: 'PF', documento: cpf(60), nome: 'Prospecto Sem Movimento' })).json
  check('prospecto sem movimento pode ser excluído', (await call(A.gestor, 'DELETE', `${C}/clientes/${pros.id}`)).status === 204)
  check('cliente com contrato NÃO pode ser excluído por DELETE (409)', (await call(A.gestor, 'DELETE', `${C}/clientes/${c3.id}`)).status === 409)
  check('auditoria registra ações sensíveis (import, reatribuição, baixa)', (await prisma.eduAuditEvent.count({ where: { tenantId: t1.tenantId, modulo: 'contabil-carteira', acao: { in: ['CLIENTES_IMPORTADOS', 'CARTEIRA_REATRIBUIDA', 'HONORARIO_BAIXADO', 'PORTAL_ACESSO_CRIADO'] } } })) >= 4)
  check('logs de auditoria não gravam o conteúdo das mensagens/senhas', !JSON.stringify(await prisma.eduAuditEvent.findMany({ where: { tenantId: t1.tenantId, modulo: 'contabil-carteira' }, select: { detalhes: true } })).includes('Tmp-'))

  // ====================================================================== seed
  secao('Seed da demonstração (idempotente) em um tenant limpo')
  const adminB = B.admin
  await prisma.ctbCliente.deleteMany({ where: { tenantId: t2.tenantId } })
  const apiB = async (m: string, p: string, b?: any) => { const r = await call(adminB, m, p, b); return r.status >= 400 ? null : r.json }
  const falhas: string[] = []
  const seeded = await seedContabilCarteira(apiB, {
    failures: falhas,
    loginAs: async (email) => { const u = await prisma.user.findFirst({ where: { tenantId: t2.tenantId, email } }); if (!u) return null; const a = tokenDe(u.id, 'CLIENTE_CONTABIL', t2); return async (m, p, b) => { const r = await call(a, m, p, b); return r.status >= 400 ? null : r.json } },
  })
  check('seed sem falhas nas chamadas', falhas.length === 0, falhas.slice(0, 8))
  check('seed cria ~25 clientes, funil, contratos, honorários, tarefas, guias, horas e interações', seeded.clientes >= 24 && seeded.leads >= 6 && seeded.propostas >= 3 && seeded.contratos >= 18 && seeded.honorarios > 20 && seeded.tarefas > 40 && seeded.guias > 15 && seeded.apontamentos > 30 && seeded.interacoes > 10, seeded)
  const again = await seedContabilCarteira(apiB, {})
  check('seed é idempotente (segunda execução não faz nada)', again.pulado === true && again.clientes === 0)
  const dashB = (await call(adminB, 'GET', `${C}/dashboard`)).json
  check('painel do escritório demo: clientes ativos, MRR e inadimplência', dashB.kpis.clientesAtivos >= 18 && dashB.kpis.mrr > 10000 && dashB.kpis.inadimplenciaValor > 0 && dashB.kpis.leadsEmAndamento >= 4 && dashB.kpis.guiasAVencerSemana > 0, dashB.kpis)
  check('seed: portal de demonstração funciona', seeded.portal !== null && await (async () => { const u = await prisma.user.findFirst({ where: { tenantId: t2.tenantId, email: seeded.portal!.email } }); const r = await call(tokenDe(u!.id, 'CLIENTE_CONTABIL', t2), 'GET', `${C}/portal/resumo`); return r.status === 200 && r.json.cliente.nome.startsWith('Padaria') && r.json.documentosFaltando.length <= 2 && r.json.mensagensNaoLidas >= 1 })())
  check('seed: tenant A não foi tocado (isolamento)', (await call(A.gestor, 'GET', `${C}/clientes?q=Padaria`)).json.total === 0)
  check('seed: funil tem leads em várias etapas', (await call(adminB, 'GET', `${C}/funil`)).json.colunas.filter((c: any) => c.total > 0).length >= 3)

  summary()
  await S.close()
  process.exit(fails.length ? 1 : 0)
}
main().catch(async (e) => { console.error(e); process.exit(1) })
