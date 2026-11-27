/**
 * Seed de demonstração do módulo PRESENÇA (chamada facial/QR, controle de acesso e empréstimos) — EduMaster Pro.
 * Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts. Requer turmas/alunos/espaços já criados (etapas
 * "academico" e "espacos" do edu-demo-seed).
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedPresenca } from './seeds/presenca'  ->  await seedPresenca(c.api, c)
 * Uso isolado:  API_URL=http://localhost:3000/api DATABASE_URL=... npx tsx scripts/seeds/presenca.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 *
 * ATENÇÃO: os "rostos" cadastrados aqui são vetores SINTÉTICOS (nenhuma imagem). Servem para demonstrar a API; um quiosque real só
 * reconhece quem fizer o cadastro facial pelo portal (ou na secretaria) com a câmera. Para a demonstração sem câmera use o QR/código.
 */
import { evidenciaSintetica, vetorSintetico } from '../../src/modules/presenca/sintetico'

export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const P = '/edu/presenca'
const HORA = 3_600_000
const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString()

export async function seedPresenca(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = { credenciais: [] as any[] }
  const falha = (m: string) => ctx.failures?.push(`seedPresenca: ${m}`)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) falha(tag); return x as T }
  const lista = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])

  if (ctx.mk) await ctx.mk('portaria@suainstituicao.edu.br', 'Demo@2026', 'Marcos', 'Portaria', 'STAFF')

  const secoes = lista(await api('GET', '/edu/academico/class-sections')).slice(0, 3)
  if (!secoes.length) { falha('sem turmas (rode a etapa academico do edu-demo-seed antes)'); return S }

  // ---------------------------------------------------------------- dispositivos (quiosques)
  const espacos = lista(await api('GET', '/edu/core/espacos?pageSize=200'))
  const esp = (re: RegExp) => espacos.find((e) => re.test(String(e.nome)))
  S.dispositivos = []
  for (const [nome, finalidade, spaceId] of [
    ['Tablet da Sala 101', 'CHAMADA', esp(/Sala 101/)?.id], ['Quiosque da Biblioteca', 'BIBLIOTECA', esp(/Biblioteca/)?.id], ['Portaria Principal', 'PORTARIA', esp(/Pátio/)?.id], ['Controle do Laboratório de Anatomia', 'LABORATORIO', esp(/Anatomia/)?.id],
  ] as const) {
    const d = await api('POST', `${P}/dispositivos`, { nome, finalidade, ...(spaceId ? { spaceId } : {}) })
    if (d) S.dispositivos.push(d); else falha(`dispositivo ${nome}`)
  }

  // ---------------------------------------------------------------- horários programados + aulas de hoje e dos últimos dias
  const agora = Date.now()
  S.chamadas = []
  for (const [i, sec] of secoes.entries()) {
    const hoje = new Date(agora - 3 * HORA).getUTCDay() // dia da semana (Brasília); o horário programado de exemplo vale para daqui a 2 dias
    await api('POST', `${P}/horarios`, { classSectionId: sec.id, spaceId: esp(/Sala 10[12]/)?.id, diaSemana: (hoje + 2) % 7, horaEntrada: '19:00', inicioIntervalo: '20:30', fimIntervalo: '20:45', horaSaida: '22:10', toleranciaAtrasoMin: 10 })
    // aulas passadas (histórico para relatórios): 3 dias, presença lançada como retroativa pela equipe
    for (const d of [-3, -2, -1]) {
      const ini = agora + d * 24 * HORA - 2 * HORA
      const sessao = await api('POST', '/edu/academico/class-sessions', { classSectionId: sec.id, tipo: 'TEORICA', titulo: `Aula ${4 + d} — ${sec.nome}`, dataHoraInicio: iso(ini), dataHoraFim: iso(ini + 2 * HORA), local: 'Sala 101' })
      if (!sessao) { falha('sessão passada'); continue }
      const ch = await api('POST', `${P}/chamadas/abrir`, { classSessionId: sessao.id })
      if (!ch) { falha('abrir chamada passada'); continue }
      const det = await api('GET', `${P}/chamadas/${ch.id}`)
      for (const [k, a] of lista(det?.roster).entries()) {
        if ((k + d + 5) % 7 === 0) continue // falta
        const atraso = (k + d + 5) % 5 === 0 ? 22 : 2
        await api('POST', `${P}/chamadas/${ch.id}/marcar`, { metodo: 'MANUAL', studentId: a.studentId, tipo: 'ENTRADA', em: iso(ini + atraso * MIN), justificativa: 'Carga de demonstração (lançamento retroativo)' })
        if ((k + d) % 9 === 0) await api('POST', `${P}/chamadas/${ch.id}/marcar`, { metodo: 'MANUAL', studentId: a.studentId, tipo: 'SAIDA', em: iso(ini + 80 * MIN), justificativa: 'Saiu mais cedo, informado ao professor (demonstração)' })
      }
      await api('POST', `${P}/chamadas/${ch.id}/fechar`, {})
    }
    // aula de hoje, em andamento (chamada aberta para o quiosque)
    const inicio = agora - (i === 1 ? 25 : 6) * MIN
    const hojeSessao = await api('POST', '/edu/academico/class-sessions', { classSectionId: sec.id, tipo: 'TEORICA', titulo: `Aula de hoje — ${sec.nome}`, dataHoraInicio: iso(inicio), dataHoraFim: iso(inicio + 2 * HORA), local: 'Sala 101' })
    if (!hojeSessao) { falha('sessão de hoje'); continue }
    const ch = ok(await api('POST', `${P}/chamadas/abrir`, { classSessionId: hojeSessao.id, dispositivoId: S.dispositivos[0]?.id }), 'abrir chamada de hoje')
    if (ch) S.chamadas.push(ch)
  }

  // ---------------------------------------------------------------- carteirinhas (QR/código) para os alunos da primeira turma + biometria sintética
  const primeira = S.chamadas[0] ? await api('GET', `${P}/chamadas/${S.chamadas[0].id}`) : null
  const roster = lista(primeira?.roster)
  S.roster = roster
  for (const a of roster.slice(0, 12)) {
    const c = await api('POST', `${P}/biometria/pessoas/ALUNO:${a.studentId}/credencial`, {})
    if (c) S.credenciais.push({ studentId: a.studentId, nome: a.nome, ...c })
  }
  const termo = await api('GET', `${P}/biometria/termo`)
  const versao = termo?.termo?.versao
  S.biometria = []
  for (const a of roster.slice(0, 3)) {
    // consentimento presencial (assinado na secretaria) + cadastro com vetores sintéticos
    const cons = await api('POST', `${P}/biometria/pessoas/ALUNO:${a.studentId}/consentimento`, { versao })
    if (!cons) { falha(`consentimento de ${a.nome} (menor de idade sem responsável?)`); continue }
    const des = await api('GET', `${P}/biometria/desafio`)
    const cad = await api('POST', `${P}/biometria/pessoas/ALUNO:${a.studentId}/cadastro`, { embeddings: [0, 1, 2].map((n) => vetorSintetico(a.studentId, 0.08, n)), modelo: 'face-api-128', qualidade: 0.9, liveness: des ? evidenciaSintetica(des.nonce, des.acao) : undefined })
    if (cad) S.biometria.push(a.studentId); else falha(`cadastro facial de ${a.nome}`)
  }

  // ---------------------------------------------------------------- marcações de hoje por QR/código (aula em andamento)
  if (S.chamadas[0]) {
    for (const c of S.credenciais.slice(0, 8)) await api('POST', `${P}/chamadas/${S.chamadas[0].id}/marcar`, { metodo: 'CODIGO', credencial: c.codigo })
  }

  // ---------------------------------------------------------------- controle de acesso a espaços
  const cfgEsp: Array<[RegExp, any]> = [
    [/Biblioteca/, { modoAcesso: 'CREDENCIAL', capacidadeMax: 120, alertaCapacidadePct: 90 }],
    [/Anatomia/, { modoAcesso: 'RESTRITO', capacidadeMax: 30, perfisPermitidos: ['STUDENT', 'TEACHER', 'COORDINATOR', 'STAFF'], alertaCapacidadePct: 85, bloquearNaCapacidade: true }],
    [/Histologia/, { modoAcesso: 'RESTRITO', capacidadeMax: 24, perfisPermitidos: ['TEACHER', 'COORDINATOR', 'STAFF'] }],
    [/Audit/, { modoAcesso: 'LIVRE', capacidadeMax: 220 }],
    [/Pátio/, { modoAcesso: 'LIVRE' }],
  ]
  S.espacosControlados = []
  for (const [re, cfg] of cfgEsp) {
    const e = esp(re)
    if (!e) continue
    const r = await api('PUT', `${P}/espacos/${e.id}/config`, cfg)
    if (r) S.espacosControlados.push({ id: e.id, nome: e.nome })
  }
  const bib = esp(/Biblioteca/)
  if (bib) {
    for (const c of S.credenciais.slice(0, 6)) await api('POST', `${P}/acesso/registrar`, { spaceId: bib.id, metodo: 'CODIGO', credencial: c.codigo, sentido: 'ENTRADA', dispositivoId: S.dispositivos[1]?.id })
    await api('POST', `${P}/acesso/registrar`, { spaceId: bib.id, metodo: 'MANUAL', visitante: { nome: 'Rodrigo Paiva (visitante — banca de TCC)', documento: '12345678909' } })
  }
  const lab = esp(/Anatomia/)
  if (lab) for (const c of S.credenciais.slice(6, 9)) await api('POST', `${P}/acesso/registrar`, { spaceId: lab.id, metodo: 'QR', credencial: c.qr, sentido: 'ENTRADA', dispositivoId: S.dispositivos[3]?.id })

  // ---------------------------------------------------------------- itens emprestáveis, empréstimos, reserva e inventário
  const itens = [
    ['NTB-001', 'Notebook Dell Latitude 5420 (empréstimo de bancada)', 'EQUIPAMENTO', 'BIBLIOTECA', 8], ['NTB-002', 'Notebook Lenovo ThinkPad E14', 'EQUIPAMENTO', 'BIBLIOTECA', 8],
    ['PRJ-001', 'Projetor portátil Epson X49', 'AUDIOVISUAL', 'AUDIOVISUAL', 4], ['CAM-001', 'Câmera Canon EOS T7 com tripé', 'AUDIOVISUAL', 'AUDIOVISUAL', 24],
    ['MIC-014', 'Microscópio binocular Olympus CX23 nº 14', 'LABORATORIO', 'LABORATORIO', 3], ['KIT-DIS-02', 'Kit de dissecação (estojo 12 peças)', 'MATERIAL', 'LABORATORIO', 3], ['TAB-005', 'Tablet Samsung Tab A8 (leitura de prontuários)', 'EQUIPAMENTO', 'BIBLIOTECA', 8],
  ] as const
  S.itens = []
  for (const [codigo, descricao, categoria, setor, h] of itens) {
    const it = await api('POST', `${P}/itens`, { codigo, descricao, categoria, setor, prazoPadraoHoras: h, maxRenovacoes: 1, spaceId: setor === 'LABORATORIO' ? lab?.id : bib?.id })
    if (it) S.itens.push(it); else falha(`item ${codigo}`)
  }
  const cred = S.credenciais
  if (S.itens.length >= 5 && cred.length >= 5) {
    S.emprestimos = []
    for (const [n, c, codigo] of [[0, 0, 'NTB-001'], [1, 1, 'PRJ-001'], [2, 2, 'MIC-014'], [3, 3, 'CAM-001']] as const) {
      const r = await api('POST', `${P}/emprestimos/retirar`, { metodo: 'CODIGO', credencial: cred[c].codigo, codigo, observacoes: 'Retirada de demonstração' })
      if (r) S.emprestimos.push(r.emprestimo); else falha(`empréstimo ${n}`)
    }
    // reserva do notebook já emprestado
    await api('POST', `${P}/reservas`, { itemId: S.itens[0].id, pessoaKey: `ALUNO:${cred[4].studentId}` })
    // um empréstimo vencido há 3 dias (para mostrar atraso/alerta): ajusta o prazo diretamente no banco
    try {
      const { prisma } = await import('../../src/lib/prisma')
      if (S.emprestimos[3]) await prisma.preEmprestimo.update({ where: { id: S.emprestimos[3].id }, data: { retiradaEm: new Date(agora - 4 * 24 * HORA), previstaEm: new Date(agora - 3 * 24 * HORA) } })
    } catch (e: any) { falha('ajuste de atraso: ' + String(e?.message || e).slice(0, 80)) }
    await api('POST', `${P}/jobs/executar`, {})
  }
  await api('POST', `${P}/inventarios`, { setor: 'LABORATORIO' })
  return S
}

// execução isolada
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: process.env.CLINIC_ID, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const j: any = await r.json()
    if (!r.ok) throw new Error('login: ' + JSON.stringify(j))
    const api: Api = async (method, path, body) => {
      const x = await fetch(API + path, { method, headers: { Authorization: `Bearer ${j.token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
      const t = await x.text()
      if (!x.ok) { console.warn(method, path, x.status, t.slice(0, 160)); return null }
      try { return JSON.parse(t) } catch { return null }
    }
    const failures: string[] = []
    const out = await seedPresenca(api, { failures })
    console.log('Seed de presença concluído:', { dispositivos: out.dispositivos?.length, chamadas: out.chamadas?.length, credenciais: out.credenciais?.length, itens: out.itens?.length, falhas: failures })
    process.exit(failures.length ? 1 : 0)
  })().catch((e) => { console.error(e); process.exit(1) })
}
