/**
 * Seed de demonstração do módulo POLOS EAD (EduMaster Pro) — "SUA INSTITUIÇÃO".
 * Cria 6 polos em cidades reais (PR, SP, MS, MT) com cursos/vagas/turnos, ~60 alunos FICTÍCIOS distribuídos entre os polos,
 * mensalidades (com inadimplência diferente por polo), provas presenciais com avisos D-7/D-1, estágios, repasse, campanhas de
 * rematrícula, ENADE, egressos com consentimento de marketing e ofertas automáticas de segunda graduação/pós (funil preenchido).
 * Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts; Prisma só para o que não tem rota (mensalidades, situação do aluno, consentimento).
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedPolos } from './seeds/polos'  ->  await seedPolos(c.api, sCtx(c))
 * Uso isolado: API_URL=http://localhost:3000/api DATABASE_URL=... npx tsx scripts/seeds/polos.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 *
 * Todos os nomes, CPFs, e-mails e telefones são FICTÍCIOS. Nenhuma mensagem é enviada de verdade: notify() só enfileira (provedores simulados).
 */
import { prisma } from '../../src/lib/prisma'
import { registrarConsentimento } from '../../src/modules/lgpd/consentimentos'
import { textoVigente } from '../../src/modules/lgpd/consentimentos'

export interface SeedCtx {
  tenantId?: string
  clinicId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const M = '/edu/modalidades'
const P = '/edu/modalidades/polos-ead'
const DIA = 86_400_000
const lista = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const iso = (ms: number) => new Date(ms).toISOString()

const POLOS = [
  { codigo: 'POL-MGA', nome: 'Polo Maringá', cidade: 'Maringá', uf: 'PR', cep: '87013-000', logradouro: 'Av. Brasil', numero: '4120', bairro: 'Zona 7', resp: 'Carla Menezes Tavares', cursos: ['Administração', 'Pedagogia', 'Ciências Contábeis'], inad: 0.1, vagas: 90, cap: 400 },
  { codigo: 'POL-LDB', nome: 'Polo Londrina', cidade: 'Londrina', uf: 'PR', cep: '86020-000', logradouro: 'Rua Sergipe', numero: '800', bairro: 'Centro', resp: 'Rogério Antunes Pires', cursos: ['Administração', 'Análise e Desenvolvimento de Sistemas', 'Enfermagem'], inad: 0.2, vagas: 80, cap: 350 },
  { codigo: 'POL-CPS', nome: 'Polo Campinas', cidade: 'Campinas', uf: 'SP', cep: '13015-000', logradouro: 'Av. Francisco Glicério', numero: '1250', bairro: 'Centro', resp: 'Patrícia Gomes Ladeira', cursos: ['Análise e Desenvolvimento de Sistemas', 'Ciências Contábeis', 'Pedagogia'], inad: 0.14, vagas: 100, cap: 450 },
  { codigo: 'POL-RPO', nome: 'Polo Ribeirão Preto', cidade: 'Ribeirão Preto', uf: 'SP', cep: '14015-000', logradouro: 'Rua Tibiriçá', numero: '350', bairro: 'Centro', resp: 'Eduardo Salgado Neto', cursos: ['Administração', 'Enfermagem'], inad: 0.3, vagas: 60, cap: 250 },
  { codigo: 'POL-CGR', nome: 'Polo Campo Grande', cidade: 'Campo Grande', uf: 'MS', cep: '79002-000', logradouro: 'Rua 14 de Julho', numero: '2200', bairro: 'Centro', resp: 'Marlene Cavalcante Dias', cursos: ['Pedagogia', 'Administração', 'Enfermagem'], inad: 0.12, vagas: 70, cap: 300 },
  { codigo: 'POL-CGB', nome: 'Polo Cuiabá', cidade: 'Cuiabá', uf: 'MT', cep: '78005-000', logradouro: 'Av. Getúlio Vargas', numero: '900', bairro: 'Centro Sul', resp: 'Thiago Rondon Alves', cursos: ['Ciências Contábeis', 'Análise e Desenvolvimento de Sistemas', 'Pedagogia'], inad: 0.18, vagas: 60, cap: 280 },
] as const
const CURSOS = [
  ['Administração', 3000], ['Pedagogia', 3200], ['Ciências Contábeis', 3000], ['Análise e Desenvolvimento de Sistemas', 2400], ['Enfermagem', 4000],
] as const
const PRIMEIROS = ['Ana', 'Bruno', 'Camila', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Leandro', 'Mariana', 'Nelson', 'Olívia', 'Paulo', 'Rafaela', 'Sérgio', 'Tatiane', 'Vitor']
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Guedes', 'Holanda', 'Ibrahim', 'Junqueira', 'Klein', 'Lopes', 'Macedo', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Ribeiro', 'Siqueira', 'Teixeira', 'Uchoa', 'Vasconcelos']
const EMPRESAS = ['Supermercados Rede Bom Preço', 'Clínica Vida Plena', 'Escola Municipal Monteiro Lobato', 'Contábil Soares & Filhos', 'TechSul Sistemas', 'Prefeitura Municipal', 'Hospital Santa Cecília', 'Distribuidora Planalto']

/** Código de documento fictício (11 dígitos) — não é CPF real. */
const cpfFicticio = (n: number) => String(100000000 + n * 7919).slice(0, 9) + String(10 + (n % 90)).slice(-2)

export async function seedPolos(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = { polos: [] as any[], alunos: [] as any[] }
  const falha = (m: string) => ctx.failures?.push(`seedPolos: ${m}`)
  const tenantId = ctx.tenantId ?? (await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } }))?.tenantId ?? 'sua-instituicao'
  const clinic = ctx.clinicId ? { id: ctx.clinicId } : await prisma.clinic.findFirst({ where: { tenantId } })
  const mkUser = async (email: string, first: string, last: string) => {
    if (ctx.mk) return ctx.mk(email, 'Aluno@2026', first, last, 'STUDENT')
    const ex = await prisma.user.findFirst({ where: { tenantId, email } })
    return ex ?? prisma.user.create({ data: { clinicId: clinic!.id, tenantId, email, password: 'x', firstName: first, lastName: last, role: 'STUDENT', isActive: true } as any })
  }

  // ---------------------------------------------------------------- parâmetros acadêmicos
  await api('POST', `${M}/bootstrap`, {})
  const programas = lista(await api('GET', '/edu/academico/programs?pageSize=200'))
  const prog: Record<string, any> = {}
  for (const [nome, ch] of CURSOS) {
    prog[nome] = programas.find((p) => p.nome === nome) ?? (await api('POST', '/edu/academico/programs', { nome, modalidade: nome === 'Enfermagem' ? 'SEMIPRESENCIAL' : 'EAD', cargaHorariaTotal: ch }))
    if (!prog[nome]) falha(`curso ${nome}`)
  }
  S.cursos = prog
  const terms = lista(await api('GET', '/edu/academico/terms?pageSize=100'))
  const ano = new Date().getFullYear()
  const termAtual = terms.find((t) => t.codigo === `${ano}/2`) ?? terms[0] ?? (await api('POST', '/edu/academico/terms', { codigo: `${ano}/2`, dataInicio: `${ano}-08-03`, dataFim: `${ano}-12-18` }))
  const termProx = terms.find((t) => t.codigo === `${ano + 1}/1`) ?? (await api('POST', '/edu/academico/terms', { codigo: `${ano + 1}/1`, dataInicio: `${ano + 1}-02-02`, dataFim: `${ano + 1}-07-10` }))
  if (!termAtual || !termProx) { falha('períodos letivos'); return S }
  S.termAtual = termAtual; S.termProx = termProx

  // ---------------------------------------------------------------- polos, credenciamento, cursos/vagas/turnos
  const existentes = lista(await api('GET', `${M}/polos?q=POL-&pageSize=100`))
  for (const [pi, def] of POLOS.entries()) {
    let polo = existentes.find((p) => p.codigo === def.codigo)
    if (!polo) {
      polo = await api('POST', `${M}/polos`, {
        codigo: def.codigo, nome: def.nome, cidade: def.cidade, uf: def.uf, cep: def.cep, logradouro: def.logradouro, numero: def.numero, bairro: def.bairro,
        responsavelNome: def.resp, responsavelEmail: `coord.${def.codigo.toLowerCase()}@suainstituicao.edu.br`, responsavelTelefone: `(${[44, 43, 19, 16, 67, 65][pi]}) 3000-${1000 + pi * 111}`,
        capacidade: def.cap, atoNumero: `Portaria MEC ${300 + pi}/2024`, atoData: '2024-03-15', atoValidade: pi === 3 ? iso(Date.now() + 90 * DIA) : '2029-03-15',
      })
    }
    if (!polo) { falha(`polo ${def.codigo}`); continue }
    if (polo.statusCredenciamento === 'EM_CREDENCIAMENTO' && pi !== 3) {
      const ck = await api('GET', `${M}/polos/${polo.id}/checklist`)
      for (const it of lista(ck?.items)) await api('PUT', `${M}/polos/${polo.id}/checklist/${it.chave}`, { atendido: true, observacao: 'Vistoria de demonstração' })
      const cred = await api('POST', `${M}/polos/${polo.id}/credenciar`, { atoNumero: `Portaria MEC ${300 + pi}/2024`, atoData: '2024-03-15', atoValidade: '2029-03-15' })
      if (cred) polo = cred
    }
    S.polos.push({ ...polo, def })
  }
  // Ribeirão Preto é credenciado por último, com ato que vence em 90 dias (dispara o alerta de renovação na demonstração).
  const rpo = S.polos.find((p: any) => p.codigo === 'POL-RPO')
  if (rpo) {
    const ck = await api('GET', `${M}/polos/${rpo.id}/checklist`)
    for (const it of lista(ck?.items).filter((i: any) => i.obrigatorio)) await api('PUT', `${M}/polos/${rpo.id}/checklist/${it.chave}`, { atendido: true })
    const cred = await api('POST', `${M}/polos/${rpo.id}/credenciar`, { atoNumero: 'Portaria MEC 303/2024', atoData: '2024-03-15', atoValidade: iso(Date.now() + 90 * DIA) })
    if (cred) Object.assign(rpo, cred)
  }
  const turnosPor = [['NOITE'], ['MANHA', 'NOITE'], ['TARDE', 'NOITE'], ['NOITE', 'SABADO'], ['MANHA', 'TARDE', 'NOITE']]
  for (const [pi, p] of S.polos.entries()) {
    const ofertasJa = lista(await api('GET', `${M}/polo-ofertas?poloId=${p.id}&pageSize=50`))
    for (const [ci, nome] of p.def.cursos.entries()) {
      if (!prog[nome] || ofertasJa.some((o) => o.programId === prog[nome].id)) continue
      await api('POST', `${M}/polo-ofertas`, { poloId: p.id, programId: prog[nome].id, vagas: Math.floor(p.def.vagas / p.def.cursos.length), turnos: turnosPor[(pi + ci) % turnosPor.length].join(',') })
    }
  }

  // ---------------------------------------------------------------- alunos fictícios por polo + vínculo + matrícula
  const registrar = new Map<string, any>()
  // RA é único no banco todo: na instituição da demonstração fica POL26xxxx; em ambientes de teste leva um sufixo do tenant
  const raPrefixo = tenantId === 'sua-instituicao' ? 'POL26' : `PL${tenantId.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase()}`
  let seq = 0
  for (const [pi, p] of S.polos.entries()) {
    for (let k = 0; k < 10; k++) {
      seq++
      const nome = `${PRIMEIROS[(seq * 3) % PRIMEIROS.length]} ${SOBRENOMES[(seq * 5 + pi) % SOBRENOMES.length]} ${SOBRENOMES[(seq * 7 + 2) % SOBRENOMES.length]}`
      const email = `aluno.polo${seq}@polos.suainstituicao.edu.br`
      const user = await mkUser(email, nome.split(' ')[0], nome.split(' ').slice(1).join(' '))
      if (user && !user.phone) await prisma.user.update({ where: { id: user.id }, data: { phone: `(${[44, 43, 19, 16, 67, 65][pi]}) 9${8000 + seq}-${1000 + seq}` } as any }).catch(() => null)
      const ra = `${raPrefixo}${String(1000 + seq)}`
      let st = await prisma.student.findFirst({ where: { tenantId, ra } })
      if (!st) st = await api('POST', '/edu/academico/students', { userId: user.id, ra, nomeCompleto: nome, cpf: cpfFicticio(seq), dataNascimento: `${1980 + (seq % 20)}-0${1 + (seq % 9)}-1${seq % 9}` })
      if (!st) { falha(`aluno ${ra}`); continue }
      const cursoNome = p.def.cursos[k % p.def.cursos.length]
      const programa = prog[cursoNome]
      if (!programa) continue
      let enr = await prisma.enrollment.findFirst({ where: { studentId: st.id, programId: programa.id, termId: termAtual.id } })
      if (!enr) enr = await api('POST', '/edu/academico/enrollments', { studentId: st.id, programId: programa.id, termId: termAtual.id })
      await api('POST', `${M}/polos/${p.id}/alunos`, { studentId: st.id, programId: programa.id })
      const a = { id: st.id, nome, email, polo: p, k, programa, cursoNome, enrollmentId: enr?.id, userId: user.id, seq }
      S.alunos.push(a)
      registrar.set(st.id, a)
    }
  }

  // situação do aluno (variedade para evasão / egressos) e mensalidades — sem rota própria, via Prisma
  const agora = Date.now()
  for (const a of S.alunos) {
    const pi = S.polos.indexOf(a.polo)
    let status: 'ATIVO' | 'TRANCADO' | 'DESISTENTE' | 'CANCELADO' | 'FORMADO' | 'CONCLUIDO' = 'ATIVO'
    if (a.k === 7) status = (['TRANCADO', 'DESISTENTE', 'CANCELADO'] as const)[pi % 3]
    if (a.k === 8) status = 'FORMADO'
    if (a.k === 9) status = pi % 2 ? 'CONCLUIDO' : 'FORMADO'
    if (pi === 3 && a.k === 6) status = 'DESISTENTE'
    a.status = status
    await prisma.student.update({ where: { id: a.id }, data: { status } })
    if (status === 'FORMADO' || status === 'CONCLUIDO') await prisma.enrollment.updateMany({ where: { studentId: a.id }, data: { status: 'CONCLUIDA' } })
    if (status === 'DESISTENTE' || status === 'CANCELADO') await prisma.enrollment.updateMany({ where: { studentId: a.id }, data: { status: 'CANCELADA' } })
    if (status === 'TRANCADO') await prisma.enrollment.updateMany({ where: { studentId: a.id }, data: { status: 'TRANCADA' } })
    if (await prisma.accountReceivable.count({ where: { tenantId, studentId: a.id } })) continue
    const valor = a.cursoNome === 'Enfermagem' ? 690 : a.cursoNome === 'Análise e Desenvolvimento de Sistemas' ? 420 : 380
    const devedor = (status === 'ATIVO' || status === 'TRANCADO') && ((a.seq * 37) % 100) / 100 < a.polo.def.inad * 1.6
    for (let m = -3; m <= 1; m++) {
      const venc = new Date(agora + m * 30 * DIA + 5 * DIA) // vence 5 dias após o dia do mês corrente (parcela 0 ainda a vencer)
      const paga = m <= -1 && !(devedor && m >= -2) && status !== 'DESISTENTE' && status !== 'CANCELADO'
      await prisma.accountReceivable.create({
        data: {
          tenantId, studentId: a.id, enrollmentId: a.enrollmentId, descricao: `Mensalidade ${5 + m + 3}/${ano} — ${a.cursoNome}`, numeroParcela: m + 4, valor,
          dataVencimento: venc, dataPagamento: paga ? new Date(venc.getTime() - 2 * DIA) : null, status: paga ? 'PAGO' : m < 0 ? 'ATRASADO' : 'PENDENTE',
          ...(m === 0 && !paga && a.seq % 2 ? { gatewayId: `SIM-BOL-${a.seq}-${m}`, gatewayStatus: 'BOLETO_EMITIDO_SIMULADO' } : {}),
        },
      })
    }
  }

  // ---------------------------------------------------------------- egressos + consentimento de marketing (LGPD)
  const formados = S.alunos.filter((a: any) => a.status === 'FORMADO' || a.status === 'CONCLUIDO')
  const textoMkt = await textoVigente(tenantId, 'COMUNICACAO_MARKETING')
  S.egressos = []
  const situ = ['EMPREGADO', 'EMPREGADO', 'EMPREENDEDOR', 'AUTONOMO', 'ESTUDANDO', 'EMPREGADO']
  for (const [i, a] of formados.entries()) {
    if (a.status !== 'FORMADO') continue
    const aprov = await prisma.apoEgresso.findFirst({ where: { tenantId, studentId: a.id } })
    const eg = aprov ?? (await api('POST', '/edu/apoio/egressos', {
      studentId: a.id, nome: a.nome, email: a.email, telefone: `(11) 9${7000 + i}-${2000 + i}`, programId: a.programa.id, programaNome: a.cursoNome, anoIngresso: ano - 4, anoConclusao: ano - (i % 3),
      cidade: a.polo.cidade, uf: a.polo.uf, consenteContato: i % 7 !== 3, situacaoProfissional: situ[i % situ.length], empregadorAtual: EMPRESAS[i % EMPRESAS.length],
      cargoAtual: 'Colaborador', atuaNaArea: i % 3 !== 0, cursandoPos: i % 5 === 0,
    }))
    if (!eg) { falha(`egresso ${a.nome}`); continue }
    a.egressoId = eg.id
    S.egressos.push(eg)
    if (textoMkt && i % 5 !== 2) {
      // consentimento de marketing dado na secretaria do polo; quem não consente NÃO recebe oferta (comprovado no e2e)
      await registrarConsentimento(tenantId, { finalidade: 'COMUNICACAO_MARKETING', versao: textoMkt.versao, titularTipo: 'EGRESSO', titularId: eg.id, nome: a.nome, email: a.email }, { canal: 'PRESENCIAL' }).catch((e) => falha(`consentimento ${a.nome}: ${e.message}`))
    }
  }
  // concluintes (CONCLUIDO, ainda sem diploma) — também podem receber ofertas se consentirem
  for (const a of formados.filter((x: any) => x.status === 'CONCLUIDO')) {
    if (textoMkt) await registrarConsentimento(tenantId, { finalidade: 'COMUNICACAO_MARKETING', versao: textoMkt.versao, titularTipo: 'ALUNO', titularId: a.id, nome: a.nome, email: a.email }, { canal: 'PORTAL' }).catch(() => null)
  }

  // ---------------------------------------------------------------- estágios
  S.estagios = []
  for (const a of S.alunos.filter((x: any) => x.status === 'ATIVO' && x.k % 3 === 0 && ['Enfermagem', 'Pedagogia', 'Administração'].includes(x.cursoNome))) {
    const e = await api('POST', `${M}/estagios`, { studentId: a.id, programId: a.programa.id, concedente: EMPRESAS[a.seq % EMPRESAS.length], supervisorNome: 'Supervisor(a) de Estágio', horasExigidas: a.cursoNome === 'Enfermagem' ? 400 : 160, inicio: iso(agora - 60 * DIA), fim: iso(agora + 120 * DIA) })
    if (e) {
      S.estagios.push(e)
      await api('POST', `${M}/estagios/${e.id}/horas`, { data: iso(agora - 10 * DIA), horas: 6, descricao: 'Prática supervisionada' })
    }
  }

  // ---------------------------------------------------------------- provas presenciais nos polos + avisos
  S.provas = []
  for (const [pi, p] of S.polos.entries()) {
    const cur = prog[p.def.cursos[0]]
    const prova = async (titulo: string, quando: number, extra: any = {}) => {
      const r = await api('POST', `${P}/provas`, { poloId: p.id, programId: cur?.id, titulo, disciplina: titulo.split('—')[1]?.trim(), dataHora: iso(quando), duracaoMin: 120, local: `${p.def.logradouro}, ${p.def.numero} — Sala ${100 + pi}`, ...extra })
      if (r) S.provas.push(r)
      return r
    }
    await prova(`Prova presencial — Gestão de Pessoas (${p.def.cidade})`, agora + (6.5 - (pi % 2)) * DIA)
    if (pi % 2 === 0) await prova(`Prova presencial — Matemática Financeira (${p.def.cidade})`, agora + 20 * 3_600_000)
    await prova(`Prova presencial — Metodologia Científica (${p.def.cidade})`, agora + 24 * DIA)
    const passada = await prova(`Prova presencial — Introdução ao Direito (${p.def.cidade})`, agora - 20 * DIA)
    if (passada) await api('POST', `${P}/provas/${passada.id}/realizar`, {})
  }
  S.avisos = await api('POST', `${P}/provas/avisos/processar`, {})

  // ---------------------------------------------------------------- repasse por polo
  S.repasses = []
  const comp = (mes: number) => { const d = new Date(agora + mes * 30 * DIA); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
  for (const [pi, p] of S.polos.entries()) {
    await api('PUT', `${P}/polo/${p.id}/repasse-config`, { percentualRepasse: 22 + pi * 2, valorFixoAluno: pi % 2 ? 12 : 0 })
    for (const mes of [-3, -2, -1]) {
      const r = await api('POST', `${P}/polo/${p.id}/repasses/apurar`, { competencia: comp(mes) })
      if (r) {
        S.repasses.push(r)
        if (mes <= -2) { await api('POST', `${P}/repasses/${r.id}/aprovar`, {}); if (mes === -3) await api('POST', `${P}/repasses/${r.id}/pagar`, {}) }
      }
    }
  }
  // boletos (simulados) para parte das parcelas vencidas de Campinas e Cuiabá
  for (const cod of ['POL-CPS', 'POL-CGB']) { const p = S.polos.find((x: any) => x.codigo === cod); if (p) await api('POST', `${P}/polo/${p.id}/cobranca/boletos`, { apenasVencidas: true }) }

  // ---------------------------------------------------------------- rematrícula por polo (período seguinte)
  S.rematriculas = []
  for (const p of S.polos) {
    const r = await api('POST', `${P}/polo/${p.id}/rematricula/campanhas`, { nome: `Rematrícula ${termProx.codigo} — ${p.nome}`, termDestinoId: termProx.id, termOrigemId: termAtual.id, janelaInicio: iso(agora - 3 * DIA), janelaFim: iso(agora + 25 * DIA), descontoAntecipacaoPct: 10, dataLimiteDesconto: iso(agora + 10 * DIA), valorTaxa: 0, abrir: true, notificar: true })
    if (!r) continue
    S.rematriculas.push(r)
    const det = lista(await api('GET', `${P}/polo/${p.id}/rematricula`))[0]
    const elegiveis = lista(det?.itens).filter((i: any) => i.status === 'ELEGIVEL')
    for (const it of elegiveis.slice(0, Math.ceil(elegiveis.length * 0.6))) await api('POST', `${P}/polo/${p.id}/rematricula/itens/${it.id}/confirmar`, { ignorarJanela: true })
  }

  // ---------------------------------------------------------------- ENADE por polo (participação e preparatório)
  for (const [pi, p] of S.polos.entries()) {
    await api('POST', `${P}/polo/${p.id}/enade/gerar`, { ano })
    const rows = lista((await api('GET', `${P}/polo/${p.id}/enade?ano=${ano}`))?.items)
    for (const [i, r] of rows.entries()) {
      const situacao = (['INSCRITO', 'PARTICIPOU', 'PARTICIPOU', 'PENDENTE', 'AUSENTE', 'PARTICIPOU'] as const)[(i + pi) % 6]
      await api('PUT', `${P}/polo/${p.id}/enade/${r.studentId}`, { ano, situacao, preparatorio: (i + pi) % 3 !== 0, simuladoNota: (i + pi) % 4 === 3 ? null : 48 + ((i * 7 + pi * 5) % 40) })
    }
  }

  // ---------------------------------------------------------------- ofertas automáticas (2ª graduação e pós) com política configurável
  const pos = lista(await api('GET', `${M}/pos/programas?pageSize=100`))
  for (const [codigo, nome, nivel] of [['POS-GEP', 'MBA em Gestão Empresarial e Pessoas', 'MBA'], ['POS-PSI', 'Especialização em Psicopedagogia Institucional', 'ESPECIALIZACAO'], ['POS-GTI', 'Especialização em Segurança da Informação', 'ESPECIALIZACAO'], ['POS-SAU', 'Especialização em Gestão em Saúde', 'ESPECIALIZACAO']] as const) {
    if (!pos.some((p) => p.codigo === codigo)) await api('POST', `${M}/pos/programas`, { codigo, nome, nivel, modalidade: 'EAD', cargaHoraria: 420, status: 'ATIVO' })
  }
  S.politicas = []
  const pol2 = await api('POST', `${P}/ofertas-auto/politicas`, { nome: 'Segunda graduação para egressos (toda a rede)', tipo: 'SEGUNDA_GRADUACAO', gatilho: 'EGRESSO', descontoPct: 30, prazoDias: 20, canal: 'EMAIL', limiteContatos: 2, janelaInicio: '09:00', janelaFim: '20:00' })
  const polPos = await api('POST', `${P}/ofertas-auto/politicas`, { nome: 'Pós-graduação para concluintes e egressos', tipo: 'POS_GRADUACAO', gatilho: 'AMBOS', descontoPct: 20, prazoDias: 30, canal: 'WHATSAPP', limiteContatos: 3, janelaInicio: '10:00', janelaFim: '19:00', areaAfim: { Administração: ['Gestão Empresarial'], Pedagogia: ['Psicopedagogia'], Sistemas: ['Segurança da Informação'], Enfermagem: ['Gestão em Saúde'], Contábeis: ['Gestão Empresarial'] } })
  for (const pl of [pol2, polPos]) {
    if (!pl) continue
    S.politicas.push(pl)
    const r = await api('POST', `${P}/ofertas-auto/politicas/${pl.id}/executar`, {})
    if (r) (S.execucoes ??= []).push(r)
  }
  const ofertas = lista(await api('GET', `${P}/ofertas-auto?pageSize=200`))
  S.ofertas = ofertas
  // funil de demonstração: parte aceita, parte matriculada, parte recusada
  for (const [i, o] of ofertas.entries()) {
    if (i % 4 === 0) { await api('POST', `${P}/ofertas-auto/${o.id}/aceitar`, {}); if (i % 8 === 0) await api('POST', `${P}/ofertas-auto/${o.id}/matricular`, {}) }
    else if (i % 4 === 1) await api('POST', `${P}/ofertas-auto/${o.id}/recusar`, {})
  }
  return S
}

// Execução isolada (contra um backend em API_URL)
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Rode antes o edu-demo-seed (instituição sua-instituicao).')
    const lr = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const token = ((await lr.json()) as any).token
    const failures: string[] = []
    const api: Api = async (method, path, body) => {
      const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await r.text()
      if (!r.ok) { failures.push(`${method} ${path} -> ${r.status} ${t.slice(0, 160)}`); return null }
      try { return JSON.parse(t) } catch { return null }
    }
    const S = await seedPolos(api, { tenantId: clinic.tenantId, clinicId: clinic.id, failures })
    console.log(`Polos: ${S.polos.length} · alunos: ${S.alunos.length} · provas: ${S.provas?.length ?? 0} · ofertas: ${S.ofertas?.length ?? 0}`)
    if (failures.length) { console.log(`${failures.length} chamadas falharam:`); failures.forEach((f) => console.log(' -', f)) }
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
