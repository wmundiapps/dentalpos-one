/**
 * Seed da REITORIA (parte 2): agenda executiva, monitor do DOU, acordos e convênios, investimentos por
 * disciplina, avaliação de pessoas (resumos) e comparativo com outras IES.
 * Usa SOMENTE a API (token ADMIN) e é idempotente (pode rodar mais de uma vez).
 *
 *   import { seedReitoria } from './seeds/reitoria'
 *   await seedReitoria(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * Não edita edu-demo-seed.ts: o seed principal (ou o e2e) chama esta função.
 */
import { DOU_PALAVRAS_DEMO, DOU_RSS, DOU_TEXTO_COLADO, DOU_XML_INLABS } from '../../src/modules/reitoria/douFixtures'

export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx { tenantId?: string; failures?: string[] }

const R = '/edu/reitoria'
const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])

/** CNPJ válido a partir de 8 dígitos-base (filial 0001). */
export function cnpjDe(base8: string): string {
  const d = (base8 + '0001').split('').map(Number)
  const dv = (n: number[]) => { let p = n.length - 7, s = 0; for (const x of n) { s += x * p--; if (p < 2) p = 9 } const r = s % 11; return r < 2 ? 0 : 11 - r }
  d.push(dv(d)); d.push(dv(d))
  return d.join('').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export interface ResumoSeedReitoria { dou: number; compromissos: number; convenios: number; investimentos: number; resumosPessoas: number; ies: number; indicadores: number }

export async function seedReitoria(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoSeedReitoria> {
  const falha = (m: string) => ctx.failures?.push(`seedReitoria: ${m}`)
  const resumo: ResumoSeedReitoria = { dou: 0, compromissos: 0, convenios: 0, investimentos: 0, resumosPessoas: 0, ies: 0, indicadores: 0 }

  // ---------------- DOU ----------------
  await api('POST', `${R}/dou/palavras/sugerir`, {})
  const existentes = new Set(lst(await api('GET', `${R}/dou/palavras?pageSize=200`)).map((p: any) => p.termo))
  for (const p of DOU_PALAVRAS_DEMO) if (!existentes.has(p.termo)) await api('POST', `${R}/dou/palavras`, p)
  const fontes = lst(await api('GET', `${R}/dou/fontes?pageSize=50`))
  if (!fontes.some((f: any) => f.nome === 'INLABS — Seção 1 (exemplo)')) await api('POST', `${R}/dou/fontes`, { nome: 'INLABS — Seção 1 (exemplo)', tipo: 'INLABS_XML', url: 'https://inlabs.in.gov.br/exemplo.xml', ativo: false })
  if (!fontes.some((f: any) => f.nome === 'RSS DOU — Educação (exemplo)')) await api('POST', `${R}/dou/fontes`, { nome: 'RSS DOU — Educação (exemplo)', tipo: 'RSS', url: 'https://www.in.gov.br/rss-exemplo.xml', ativo: false })
  for (const [formato, conteudo] of [['XML', DOU_XML_INLABS], ['RSS', DOU_RSS], ['TEXTO', DOU_TEXTO_COLADO]] as const) {
    const r = await api('POST', `${R}/dou/importar`, { formato, conteudo, dataPadrao: '2026-10-29' })
    resumo.dou += r?.novas ?? 0
  }
  const pubs = lst(await api('GET', `${R}/dou/publicacoes?pageSize=50`))
  const reconhece = pubs.find((p: any) => p.numero === '812')
  if (reconhece && !reconhece.regAtoId) {
    await api('POST', `${R}/dou/publicacoes/${reconhece.id}/criar-ato`, { cursoNome: 'Odontologia', vencimento: dia(365 * 5) })
    await api('PATCH', `${R}/dou/publicacoes/${reconhece.id}`, { status: 'EM_TRATAMENTO', responsavelNome: 'Secretaria Acadêmica', observacoes: 'Ato lançado no Regulatório; protocolar aditamento em até 30 dias.' })
  }
  const penal = pubs.find((p: any) => p.numero === '1.234')
  if (penal) await api('PATCH', `${R}/dou/publicacoes/${penal.id}`, { status: 'EM_ANALISE', responsavelNome: 'Assessoria Jurídica' })

  // ---------------- Agenda ----------------
  await api('POST', `${R}/agenda/efemerides/bootstrap`, {})
  const atuais = lst(await api('GET', `${R}/compromissos?pageSize=200`)).map((c: any) => c.titulo)
  const comp: any[] = [
    { tipo: 'REUNIAO', titulo: 'Reunião semanal de gestão', local: 'Sala da Reitoria', inicio: dia(-((new Date().getUTCDay() + 6) % 7) + 1).slice(0, 10) + 'T12:00:00.000Z', fim: dia(-((new Date().getUTCDay() + 6) % 7) + 1).slice(0, 10) + 'T13:00:00.000Z', recorrencia: 'SEMANAL', prioridade: 'ALTA', lembretesMin: [60], pauta: [{ titulo: 'Indicadores da semana', responsavel: 'Reitoria', minutos: 15 }, { titulo: 'Pendências regulatórias', responsavel: 'Regulação', minutos: 20 }, { titulo: 'Assuntos gerais', minutos: 25 }], convites: [{ nome: 'Pró-reitoria Acadêmica', papel: 'PARTICIPANTE' }, { nome: 'Direção Administrativa', papel: 'PARTICIPANTE' }, { nome: 'Secretaria Geral', papel: 'SECRETARIO' }] },
    { tipo: 'AUDIENCIA', titulo: 'Audiência de conciliação — processo trabalhista', local: 'Fórum Trabalhista, sala 4', inicio: dia(6).slice(0, 10) + 'T17:00:00.000Z', fim: dia(6).slice(0, 10) + 'T18:00:00.000Z', prioridade: 'CRITICA', lembretesMin: [1440, 120] },
    { tipo: 'REUNIAO', titulo: 'Conselho Superior (CONSUP) — ordinária', local: 'Auditório', inicio: dia(12).slice(0, 10) + 'T17:00:00.000Z', fim: dia(12).slice(0, 10) + 'T20:00:00.000Z', prioridade: 'ALTA', lembretesMin: [1440], pauta: [{ titulo: 'Aprovação do calendário 2027/1', minutos: 30 }, { titulo: 'Relatório da CPA', minutos: 30 }, { titulo: 'Convênios internacionais', minutos: 20 }] },
    { tipo: 'COMPROMISSO', titulo: 'Visita da comissão avaliadora do MEC (in loco)', local: 'Campus sede', inicio: dia(25).slice(0, 10) + 'T11:00:00.000Z', fim: dia(26).slice(0, 10) + 'T21:00:00.000Z', prioridade: 'CRITICA', lembretesMin: [10080, 1440] },
    { tipo: 'VIAGEM', titulo: 'Congresso da ABMES — Brasília', local: 'Brasília/DF', inicio: dia(40).slice(0, 10) + 'T11:00:00.000Z', fim: dia(42).slice(0, 10) + 'T21:00:00.000Z', diaInteiro: true },
    { tipo: 'EFEMERIDE', titulo: 'Aniversário da instituição', inicio: dia(55).slice(0, 10) + 'T03:00:00.000Z', fim: dia(55).slice(0, 10) + 'T03:00:00.000Z', diaInteiro: true, recorrencia: 'ANUAL', prioridade: 'NORMAL' },
    { tipo: 'ANIVERSARIO', titulo: 'Aniversário da Reitora', inicio: dia(18).slice(0, 10) + 'T03:00:00.000Z', fim: dia(18).slice(0, 10) + 'T03:00:00.000Z', diaInteiro: true, recorrencia: 'ANUAL', prioridade: 'BAIXA' },
  ]
  for (const c of comp) {
    if (atuais.includes(c.titulo)) continue
    const r = await api('POST', `${R}/compromissos`, c)
    if (r) resumo.compromissos++
  }
  if (!atuais.includes('Reunião de alinhamento do PDI (realizada)')) {
    const passada = await api('POST', `${R}/compromissos`, { tipo: 'REUNIAO', titulo: 'Reunião de alinhamento do PDI (realizada)', local: 'Sala da Reitoria', inicio: dia(-8).slice(0, 10) + 'T17:00:00.000Z', fim: dia(-8).slice(0, 10) + 'T18:30:00.000Z', convites: [{ nome: 'Pró-reitoria Acadêmica' }, { nome: 'Direção Administrativa' }] })
    if (passada) {
      resumo.compromissos++
      await api('POST', `${R}/compromissos/${passada.id}/ata`, { ata: 'Revisadas as metas do eixo Ensino. Definido que a Coordenação entregará o plano de retenção.', decisoes: [{ texto: 'Entregar plano de retenção de alunos', responsavel: 'Pró-reitoria Acadêmica', prazo: dia(20) }] })
      await api('POST', `${R}/compromissos/${passada.id}/ata/aprovar`, {})
    }
  }

  // ---------------- Convênios ----------------
  const convExist = new Set(lst(await api('GET', `${R}/convenios?pageSize=200`)).map((c: any) => c.numero))
  const convs: any[] = [
    { numero: 'CV-2024-001', tipo: 'ESTAGIO', titulo: 'Convênio de estágio — Rede Sorriso Clínicas', parteNome: 'Rede Sorriso Clínicas Ltda.', parteCnpj: cnpjDe('11222333'), area: 'Estágio', inicio: dia(-700), fim: dia(25), responsavelNome: 'Coordenação de Estágios', valor: 0 },
    { numero: 'CV-2023-014', tipo: 'ACORDO_COOPERACAO', titulo: 'Cooperação técnica com a Secretaria Municipal de Saúde', parteNome: 'Secretaria Municipal de Saúde', parteTipo: 'ORGAO_PUBLICO', inicio: dia(-900), fim: dia(70), valor: 120000, renovacaoAutomatica: true },
    { numero: 'CV-2025-003', tipo: 'INTERNACIONAL', titulo: 'Intercâmbio acadêmico — Universidade de Coimbra', parteNome: 'Universidade de Coimbra', parteTipo: 'IES', abrangencia: 'INTERNACIONAL', pais: 'Portugal', area: 'Mobilidade', inicio: dia(-200), fim: dia(1100) },
    { numero: 'CV-2022-009', tipo: 'TERMO_PARCERIA', titulo: 'Parceria com hospital-escola', parteNome: 'Hospital Santa Clara', parteCnpj: cnpjDe('44555666'), inicio: dia(-1500), fim: dia(-12), valor: 350000 },
    { numero: 'CV-2026-002', tipo: 'CONVENIO', titulo: 'Convênio de bolsas com fundação de amparo', parteNome: 'Fundação de Amparo à Pesquisa', parteTipo: 'ORGAO_PUBLICO', inicio: dia(-90), vigenciaIndeterminada: true },
    { numero: 'CV-2026-004', tipo: 'CONTRATO', titulo: 'Licenciamento de plataforma de periódicos', parteNome: 'Editora Científica S.A.', parteCnpj: cnpjDe('77888999'), inicio: dia(-30), fim: dia(335), valor: 98000, avisoDias: [60, 30, 15] },
  ]
  for (const c of convs) {
    if (convExist.has(c.numero)) continue
    if (await api('POST', `${R}/convenios`, c)) resumo.convenios++
  }

  // ---------------- Investimentos por disciplina ----------------
  const discs = lst(await api('GET', '/edu/academico/disciplines?pageSize=100'))
  const invExist = new Set(lst(await api('GET', `${R}/investimentos?pageSize=200`)).map((i: any) => i.titulo))
  const dn = (re: RegExp) => discs.find((d: any) => re.test(d.nome))?.id
  const inv: any[] = [
    { tipo: 'EQUIPAMENTO', titulo: 'Simuladores odontológicos (12 unidades)', valor: 186000, data: dia(-120), status: 'CONCLUIDO', disciplinas: [dn(/Anatomia/), dn(/Dent/), dn(/Cirurg/)].filter(Boolean).map((disciplineId: string) => ({ disciplineId })) },
    { tipo: 'MELHORIA', titulo: 'Reforma do laboratório de anatomia', valor: 94000, data: dia(-80), status: 'CONCLUIDO', disciplinas: [dn(/Anatomia/)].filter(Boolean).map((disciplineId: string) => ({ disciplineId, percentual: 100 })) },
    { tipo: 'EQUIPAMENTO', titulo: 'Microscópios binoculares', valor: 52000, data: dia(-40), status: 'CONCLUIDO', disciplinas: [dn(/Histolog/), dn(/Patolog/)].filter(Boolean).map((disciplineId: string) => ({ disciplineId })) },
    { tipo: 'SOFTWARE', titulo: 'Licença de software de planejamento digital', valor: 28000, data: dia(-15), status: 'EM_EXECUCAO', disciplinas: [] },
    { tipo: 'MELHORIA', titulo: 'Climatização das salas de aula', valor: 73000, data: dia(10), status: 'PLANEJADO', disciplinas: [] },
  ]
  for (const i of inv) {
    if (invExist.has(i.titulo)) continue
    if (await api('POST', `${R}/investimentos`, i)) resumo.investimentos++
  }
  await api('POST', `${R}/investimentos/importar-infra`, {})

  // ---------------- Avaliação de pessoas (resumos agregados) ----------------
  const rs: any[] = [
    ['Secretaria Acadêmica', 'ADMINISTRATIVO', 14, 13, 4.2], ['Financeiro', 'ADMINISTRATIVO', 9, 9, 3.9], ['Biblioteca', 'APOIO', 6, 5, 4.4], ['Tecnologia da Informação', 'ADMINISTRATIVO', 7, 7, 3.6],
    ['Corpo docente — Odontologia', 'DOCENTE', 38, 33, 4.3], ['Corpo docente — Direito', 'DOCENTE', 29, 24, 4.0], ['Coordenações de curso', 'COORDENACAO', 2, 2, 4.5],
  ]
  for (const [setor, grupo, avaliados, concluidas, notaMedia] of rs) {
    if (await api('PUT', `${R}/pessoas/resumos`, { ciclo: '2026', setor, grupo, avaliados, concluidas, notaMedia, escalaMax: 5, pontosFortes: ['Comprometimento', 'Trabalho em equipe'], pontosAtencao: ['Capacitação continuada'] })) resumo.resumosPessoas++
  }
  await api('POST', `${R}/pessoas/sincronizar-rh`, {})

  // ---------------- Comparativo com outras IES ----------------
  await api('POST', `${R}/comparativo/ies/propria`, {})
  const iesExist = new Set(lst(await api('GET', `${R}/comparativo/ies`)).map((i: any) => i.nome))
  const outras: any[] = [
    { nome: 'Centro Universitário Horizonte', sigla: 'UNIHORIZ', codigoEmec: '1121', cnpj: cnpjDe('10101010'), uf: 'SP', municipio: 'Campinas', categoria: 'Privada com fins lucrativos', organizacao: 'Centro Universitário', tipo: 'CONCORRENTE' },
    { nome: 'Faculdade Atlântica de Ciências', sigla: 'FACAT', codigoEmec: '2234', cnpj: cnpjDe('20202020'), uf: 'SP', municipio: 'Santos', categoria: 'Privada com fins lucrativos', organizacao: 'Faculdade', tipo: 'CONCORRENTE' },
    { nome: 'Universidade Estadual Paulista Central', sigla: 'UEPC', codigoEmec: '55', uf: 'SP', municipio: 'São Paulo', categoria: 'Pública estadual', organizacao: 'Universidade', tipo: 'REFERENCIA' },
    { nome: 'Instituto Mantiqueira de Ensino', sigla: 'IME', codigoEmec: '3341', cnpj: cnpjDe('30303030'), uf: 'MG', municipio: 'Poços de Caldas', categoria: 'Privada sem fins lucrativos', organizacao: 'Centro Universitário', tipo: 'CONCORRENTE' },
  ]
  for (const i of outras) {
    if (iesExist.has(i.nome)) continue
    if (await api('POST', `${R}/comparativo/ies`, i)) resumo.ies++
  }
  const csv = [
    'CO_IES;NO_IES;NU_ANO_CENSO;CPC_CONTINUO;IGC_CONTINUO;ENADE_CONTINUO;MENSALIDADE;QT_CURSO;QT_MAT',
    '24819;SUA INSTITUIÇÃO;2023;3,41;3,52;3,38;1480;18;4200', '24819;SUA INSTITUIÇÃO;2024;3,66;3,60;3,57;1560;20;4650', '24819;SUA INSTITUIÇÃO;2025;3,92;3,71;3,81;1640;22;5100',
    '1121;Centro Universitário Horizonte;2023;3,70;3,80;3,65;1720;40;14000', '1121;Centro Universitário Horizonte;2024;3,75;3,84;3,70;1790;41;14600', '1121;Centro Universitário Horizonte;2025;3,88;3,90;3,84;1850;43;15200',
    '2234;Faculdade Atlântica de Ciências;2023;3,05;3,10;3,02;990;9;2100', '2234;Faculdade Atlântica de Ciências;2024;3,20;3,15;3,18;1020;10;2300', '2234;Faculdade Atlântica de Ciências;2025;3,34;3,22;3,30;1090;11;2450',
    '55;Universidade Estadual Paulista Central;2023;4,40;4,52;4,35;0;120;38000', '55;Universidade Estadual Paulista Central;2024;4,42;4,55;4,40;0;121;38400', '55;Universidade Estadual Paulista Central;2025;4,46;4,57;4,44;0;122;38900',
    '3341;Instituto Mantiqueira de Ensino;2023;3,50;3,60;3,48;1350;16;5200', '3341;Instituto Mantiqueira de Ensino;2024;3,58;3,62;3,55;1400;17;5350', '3341;Instituto Mantiqueira de Ensino;2025;3,64;3,70;3,62;1450;17;5500',
  ].join('\n')
  const imp = await api('POST', `${R}/comparativo/importar-csv`, { conteudo: csv, criarIes: false })
  resumo.indicadores = (imp?.importados ?? 0) + (imp?.atualizados ?? 0)
  if (!imp) falha('importação CSV do comparativo falhou')
  return resumo
}
