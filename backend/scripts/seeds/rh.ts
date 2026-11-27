/**
 * Seed de demonstração do RH do EduMaster Pro. Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts.
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedRh } from './seeds/rh'  ->  await seedRh(c.api, c)
 * Uso isolado:  DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/rh.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 * Pessoas, CPFs (válidos, mas fictícios), salários e valores são FICTÍCIOS. Cálculos trabalhistas/tributários são MODELO a validar por contador.
 * Cria: parâmetros, departamentos, cargos, plano de carreira, 9 colaboradores (docentes e técnico-administrativos), ponto do mês anterior fechado,
 * banco de horas, atestado, licença, férias, bonificação, advertência, avaliação de desempenho, sócios, terceiros e a folha do mês anterior (fechada).
 * Usuário RH de demonstração: rh@suainstituicao.edu.br / Demo@2026 (papel HR).
 */
export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const R = '/edu/rh'
const pad = (n: number) => String(n).padStart(2, '0')
/** CPF com dígitos verificadores válidos (fictício) a partir de 9 dígitos-base. */
function cpf(base: string): string {
  const d = base.split('').map(Number)
  for (const n of [9, 10]) { const s = d.slice(0, n).reduce((a, x, i) => a + x * (n + 1 - i), 0); const r = (s * 10) % 11; d.push(r === 10 ? 0 : r) }
  const t = d.join('')
  return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`
}
const iso = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString()

export async function seedRh(api: Api, ctx: SeedCtx = {}) {
  const post = (p: string, b: any) => api('POST', `${R}${p}`, b)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) ctx.failures?.push(`seedRh: falhou ${tag}`); return x as T }

  // usuários de demonstração (RH, gestor e dois colaboradores)
  const users: Record<string, any> = {}
  if (ctx.mk) {
    users.rh = await ctx.mk('rh@suainstituicao.edu.br', 'Demo@2026', 'Rita', 'Almeida', 'HR')
    users.gestor = await ctx.mk('gestor.rh@suainstituicao.edu.br', 'Demo@2026', 'Marcos', 'Teixeira', 'COORDINATOR')
    users.func = await ctx.mk('colaborador@suainstituicao.edu.br', 'Demo@2026', 'Camila', 'Duarte', 'STAFF')
    users.prof = await ctx.mk('professor.rh@suainstituicao.edu.br', 'Demo@2026', 'Renato', 'Carvalho', 'TEACHER')
  }

  ok(await post('/bootstrap', {}), 'bootstrap')
  const jornadas = (await api('GET', `${R}/jornadas`))?.items ?? []
  const j40 = jornadas.find((j: any) => String(j.nome).startsWith('Padrão 40h')), j44 = jornadas.find((j: any) => String(j.nome).startsWith('Padrão 44h'))

  // ---------------------------------------------------------------- estrutura
  const dep = async (codigo: string, nome: string, centroCusto: string) => ok(await post('/departamentos', { codigo, nome, centroCusto }), `depto ${codigo}`)
  const dSec = await dep('SEC', 'Secretaria Acadêmica', 'CC-100'), dFin = await dep('FIN', 'Financeiro', 'CC-110'), dDoc = await dep('DOC', 'Corpo Docente - Saúde', 'CC-200'), dTi = await dep('TI', 'Tecnologia da Informação', 'CC-120')
  const cargo = async (nome: string, categoria: string, faixaMin: number, faixaMax: number) => ok(await post('/cargos', { nome, categoria, faixaMin, faixaMax }), `cargo ${nome}`)
  const cAss = await cargo('Assistente Administrativo', 'TECNICO_ADMINISTRATIVO', 2500, 4500), cAnal = await cargo('Analista de TI', 'TECNICO_ADMINISTRATIVO', 5000, 9000)
  const cProf = await cargo('Professor Adjunto', 'DOCENTE', 6000, 14000), cProfH = await cargo('Professor Horista', 'DOCENTE', 3000, 9000), cCoord = await cargo('Coordenador de Setor', 'GESTAO', 7000, 12000)

  // ---------------------------------------------------------------- plano de carreira
  const plano = ok(await post('/planos-carreira', { nome: 'Plano Técnico-Administrativo 2026', categoria: 'TECNICO_ADMINISTRATIVO' }), 'plano')
  const n1 = plano && ok(await post(`/planos-carreira/${plano.id}/niveis`, { ordem: 1, nome: 'Assistente I', salarioBase: 3000, intersticioMeses: 12, requisitos: 'Ensino médio completo' }), 'nivel1')
  const n2 = plano && ok(await post(`/planos-carreira/${plano.id}/niveis`, { ordem: 2, nome: 'Assistente II', salarioBase: 3600, intersticioMeses: 12, requisitos: '1 ano no nível I e avaliação adequada' }), 'nivel2')
  if (plano) await post(`/planos-carreira/${plano.id}/niveis`, { ordem: 3, nome: 'Assistente III', salarioBase: 4300, intersticioMeses: 18, requisitos: 'Graduação e avaliação excelente' })

  // ---------------------------------------------------------------- colaboradores
  const hoje = new Date()
  const anoMes = (delta: number) => { const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + delta, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}` }
  const comp = anoMes(-1)
  const adm = (anos: number, extraMeses = 0) => { const d = new Date(Date.UTC(hoje.getUTCFullYear() - anos, hoje.getUTCMonth() - extraMeses, 3, 12)); return d.toISOString() }
  const col = async (b: any) => ok(await post('/colaboradores', b), `colaborador ${b.nome}`)
  const gest = await col({ nome: 'Marcos Teixeira', userId: users.gestor?.id, tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'CLT', cargoId: cCoord?.id, departamentoId: dSec?.id, jornadaId: j40?.id, salarioBase: 9500, dependentesIrrf: 2, dataAdmissao: adm(4), cpf: cpf('529982247'), centroCusto: 'CC-100' })
  const camila = await col({ nome: 'Camila Duarte', userId: users.func?.id, tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'CLT', cargoId: cAss?.id, departamentoId: dSec?.id, jornadaId: j40?.id, gestorId: gest?.id, salarioBase: 3000, dataAdmissao: adm(1, 2), cpf: cpf('111444777'), banco: 'Banco Exemplo', agencia: '0001', conta: '12345-6', pix: 'camila@exemplo.com' })
  const joao = await col({ nome: 'João Pereira', tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'CLT', cargoId: cAss?.id, departamentoId: dFin?.id, jornadaId: j44?.id, gestorId: gest?.id, salarioBase: 3400, dataAdmissao: adm(2), cpf: cpf('390533447'), dependentesIrrf: 1 })
  const lara = await col({ nome: 'Lara Nogueira', tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'CLT', cargoId: cAnal?.id, departamentoId: dTi?.id, jornadaId: j44?.id, gestorId: gest?.id, salarioBase: 6200, dataAdmissao: adm(3), cpf: cpf('168995350') })
  const prof1 = await col({ nome: 'Renato Carvalho', userId: users.prof?.id, tipo: 'DOCENTE', vinculo: 'CLT', cargoId: cProf?.id, departamentoId: dDoc?.id, salarioBase: 9800, dataAdmissao: adm(5), cpf: cpf('714558230'), dependentesIrrf: 2 })
  const prof2 = await col({ nome: 'Helena Moraes', tipo: 'DOCENTE', vinculo: 'PROFESSOR_HORISTA', cargoId: cProfH?.id, departamentoId: dDoc?.id, valorHora: 68, cargaMensalHoras: 96, dataAdmissao: adm(2, 4) })
  const prof3 = await col({ nome: 'Otávio Lacerda', tipo: 'DOCENTE', vinculo: 'PROFESSOR_HORISTA', cargoId: cProfH?.id, departamentoId: dDoc?.id, valorHora: 72, cargaMensalHoras: 60, dataAdmissao: adm(1, 6) })
  const estag = await col({ nome: 'Bianca Freitas', tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'ESTAGIARIO', departamentoId: dSec?.id, salarioBase: 1500, dataAdmissao: adm(0, 5) })
  const pj = await col({ nome: 'Tiago Consultor ME', tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'PJ', departamentoId: dTi?.id, salarioBase: 7000, dataAdmissao: adm(1, 1) })
  const novo = await col({ nome: 'Patrícia Gomes (em admissão)', tipo: 'TECNICO_ADMINISTRATIVO', vinculo: 'CLT', cargoId: cAss?.id, departamentoId: dFin?.id, salarioBase: 3100 })
  const todos = [gest, camila, joao, lara, prof1, prof2, prof3, estag, pj].filter(Boolean)
  if (dSec && gest) await api('PUT', `${R}/departamentos/${dSec.id}`, { responsavelId: gest.id })

  // carreira
  if (camila && n1) await post('/movimentacoes', { colaboradorId: camila.id, tipo: 'ENQUADRAMENTO', dataEfetiva: iso(`${anoMes(-8)}-05`, '12:00'), nivelParaId: n1.id, motivo: 'Enquadramento inicial no plano de carreira' })
  if (camila && n2) await post('/movimentacoes', { colaboradorId: camila.id, tipo: 'PROGRESSAO', dataEfetiva: new Date().toISOString(), nivelParaId: n2.id, forcarIntersticio: true, motivo: 'Progressão por mérito aprovada pela direção' })

  // ---------------------------------------------------------------- exames e admissão
  for (const c of [gest, camila, joao, lara, prof1]) if (c) await post('/exames', { colaboradorId: c.id, tipo: 'PERIODICO', realizadoEm: new Date(Date.now() - 200 * 86400000).toISOString(), resultado: 'APTO', medico: 'Dra. Fernanda (Medicina do Trabalho)', clinica: 'Clínica Ocupacional Exemplo' })
  if (joao) await post('/exames', { colaboradorId: joao.id, tipo: 'PERIODICO', realizadoEm: new Date(Date.now() - 400 * 86400000).toISOString(), resultado: 'APTO' })   // vencido
  if (novo) {
    const ad = await api('GET', `${R}/admissao/${novo.id}`)
    for (const i of (ad?.itens ?? []).slice(0, 5)) await post(`/checklist/${i.id}`, { status: 'RECEBIDO' })
  }

  // ---------------------------------------------------------------- ponto do mês anterior (importação) e fechamento
  const dias = Array.from({ length: new Date(Date.UTC(+comp.slice(0, 4), +comp.slice(5), 0)).getUTCDate() }, (_, i) => `${comp}-${pad(i + 1)}`)
  const dow = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay()
  const marcacoes: any[] = []
  const dia = (id: string, d: string, e: string, s: string) => { marcacoes.push({ colaboradorId: id, tipo: 'ENTRADA', dataHora: iso(d, e) }, { colaboradorId: id, tipo: 'SAIDA_INTERVALO', dataHora: iso(d, '12:00') }, { colaboradorId: id, tipo: 'RETORNO_INTERVALO', dataHora: iso(d, '13:00') }, { colaboradorId: id, tipo: 'SAIDA', dataHora: iso(d, s) }) }
  for (const c of [gest, camila, joao, lara].filter(Boolean)) {
    for (const [i, d] of dias.entries()) {
      const w = dow(d); const sab = w === 6 && c === joao
      if (w >= 1 && w <= 5) {
        if (c === camila && i === 6) continue            // uma falta
        dia(c.id, d, c === camila && i === 3 ? '08:40' : '08:00', c === joao && i % 5 === 0 ? '19:00' : c === lara && i % 7 === 0 ? '18:30' : '17:00')
      } else if (sab) marcacoes.push({ colaboradorId: c.id, tipo: 'ENTRADA', dataHora: iso(d, '08:00') }, { colaboradorId: c.id, tipo: 'SAIDA', dataHora: iso(d, '12:00') })
    }
  }
  const imp = await post('/ponto/importar', { marcacoes })
  if (!imp) ctx.failures?.push('seedRh: importação de ponto')
  if (camila) {
    // ajuste fica PENDENTE para demonstrar a fila de aprovação do gestor (o solicitante não pode aprovar o próprio ajuste)
    await api('POST', `${R}/ponto/ajustes`, { colaboradorId: camila.id, data: dias.find((d) => dow(d) === 3)!, tipo: 'JUSTIFICAR_ATRASO', justificativa: 'Atraso por interdição da via de acesso (comprovante anexo)' })
  }
  await post('/ponto/fechamento', { competencia: comp })

  // ---------------------------------------------------------------- saúde, licenças, férias
  if (lara) await post('/atestados', { colaboradorId: lara.id, dataInicio: new Date(Date.now() - 20 * 86400000).toISOString(), dias: 2, cid: 'J11', medico: 'Dr. Paulo Nunes', crm: 'CRM-SP 000000' })
  if (joao) await post('/licencas', { colaboradorId: joao.id, tipo: 'PATERNIDADE', inicio: new Date(Date.now() + 15 * 86400000).toISOString() })
  if (lara) await post('/licencas', { colaboradorId: lara.id, tipo: 'GALA', inicio: new Date(Date.now() + 60 * 86400000).toISOString() })
  if (gest) await post('/ferias/periodos/gerar', {})
  if (camila) {
    const pers = (await api('GET', `${R}/ferias/periodos?colaboradorId=${camila.id}`))?.items ?? []
    const disp = pers.find((p: any) => p.status === 'DISPONIVEL')
    if (disp) {
      const base = new Date(Date.now() + 120 * 86400000)
      while (![1, 2].includes(base.getUTCDay())) base.setUTCDate(base.getUTCDate() + 1)
      const r = await post('/ferias/programacoes', { colaboradorId: camila.id, periodoId: disp.id, parcelas: [{ inicio: base.toISOString().slice(0, 10), dias: 20 }], diasAbono: 10 })
      if (r?.items?.[0]) await post(`/ferias/programacoes/${r.items[0].id}/decidir`, { aprovar: true, motivo: 'Escala de férias do setor aprovada' })
    }
  }

  // ---------------------------------------------------------------- bonificações e disciplina
  if (camila) { const b = await api('POST', `${R}/bonificacoes`, { colaboradorId: camila.id, tipo: 'BONUS', descricao: 'Meta de rematrículas superada', valor: 600, competencia: comp }); if (b) await post(`/bonificacoes/${b.id}/decidir`, { aprovar: true }) }
  if (prof1) { const b = await api('POST', `${R}/bonificacoes`, { colaboradorId: prof1.id, tipo: 'PREMIO', descricao: 'Docente destaque do ano', valor: 1500, competencia: comp }); if (b) await post(`/bonificacoes/${b.id}/decidir`, { aprovar: true }) }
  if (joao) await post('/advertencias', { colaboradorId: joao.id, nivel: 'ORIENTACAO', motivo: 'Descumprimento de prazo de conciliação', descricao: 'Orientação formal sobre o prazo de conciliação bancária diária estabelecido pelo setor.' })

  // ---------------------------------------------------------------- avaliação de desempenho
  const ciclo = ok(await post('/ciclos', { nome: `Avaliação de desempenho ${hoje.getUTCFullYear()}`, inicio: new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1)).toISOString(), fim: new Date(Date.UTC(hoje.getUTCFullYear(), 11, 31)).toISOString(), pesoAuto: 30, pesoGestor: 70, escalaMax: 5 }), 'ciclo')
  if (ciclo) {
    const crit = []
    for (const [nome, peso, categoria] of [['Qualidade e precisão do trabalho', 2, 'COMPETENCIA'], ['Cumprimento de prazos e metas', 2, 'RESULTADO'], ['Trabalho em equipe e comunicação', 1, 'COMPETENCIA'], ['Alinhamento aos valores institucionais', 1, 'VALORES']] as const) crit.push(await post(`/ciclos/${ciclo.id}/criterios`, { nome, peso, categoria }))
    await post(`/ciclos/${ciclo.id}/abrir`, {})
    const avs = (await api('GET', `${R}/avaliacoes?cicloId=${ciclo.id}&pageSize=100`))?.items ?? []
    let k = 0
    for (const a of avs) {
      if (!a.colaboradorId || k >= 5) break
      const notasG: Record<string, any> = {}
      for (const c of crit) if (c) notasG[c.id] = { nota: 3 + ((k + c.peso) % 3) }
      const r = await post(`/avaliacoes/${a.id}/avaliacao-gestor`, { notas: notasG, parecer: 'Desempenho consistente no período, com pontos de melhoria já conversados.', planoAcao: [{ acao: 'Capacitação em ferramentas do setor', prazo: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) }], semAutoavaliacao: true })
      if (r) k++
    }
  }

  // ---------------------------------------------------------------- sócios, pró-labore e terceiros
  await post('/socios', { nome: 'Dra. Helena Duarte', cpf: cpf('295379955'), participacaoPct: 60, proLaboreMensal: 12000, dependentesIrrf: 2 })
  await post('/socios', { nome: 'Dr. Augusto Duarte', cpf: cpf('862288680'), participacaoPct: 40, proLaboreMensal: 8000 })
  const tRpa = await post('/terceiros', { tipo: 'RPA', nome: 'Prof. Convidado Dr. Lucas Brandão', documento: cpf('047538490'), servico: 'Palestras e bancas' })
  const tPj = await post('/terceiros', { tipo: 'PJ', nome: 'Consultoria Pedagógica Alfa LTDA', documento: '11.222.333/0001-81', servico: 'Consultoria de projeto pedagógico' })
  if (tRpa) { const p = await post('/terceiros/pagamentos', { terceiroId: tRpa.id, competencia: comp, descricao: 'Palestra magna - semana acadêmica', bruto: 3500 }); if (p) await post(`/terceiros/pagamentos/${p.id}/aprovar`, {}) }
  if (tPj) { const p = await post('/terceiros/pagamentos', { terceiroId: tPj.id, competencia: comp, descricao: 'Consultoria - revisão de PPC', bruto: 9000, notaFiscal: 'NF-2026-0042' }); if (p) await post(`/terceiros/pagamentos/${p.id}/aprovar`, {}) }

  // ---------------------------------------------------------------- folha do mês anterior
  if (camila) await post('/folha/lancamentos', { colaboradorId: camila.id, competencia: comp, eventoCodigo: 'VT', valor: 132, descricao: 'Vale-transporte (desconto)' })
  const folha = ok(await post('/folha/calcular', { competencia: comp }), 'folha')
  if (folha) await post(`/folha/${folha.id}/fechar`, {})

  return { departamentos: 4, cargos: 5, colaboradores: todos.length + (novo ? 1 : 0), competencia: comp, folhaId: folha?.id, logins: { rh: 'rh@suainstituicao.edu.br', gestor: 'gestor.rh@suainstituicao.edu.br', colaborador: 'colaborador@suainstituicao.edu.br' } }
}

// Execução isolada
if (require.main === module) {
  (async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const { prisma } = await import('../../src/lib/prisma')
    const bcrypt = (await import('bcryptjs')).default
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Rode antes o scripts/edu-demo-seed.ts (cria a instituição sua-instituicao).')
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const token = ((await r.json()) as any).token
    const failures: string[] = []
    const api: Api = async (method, path, body) => {
      const x = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) })
      const t = await x.text()
      if (!x.ok) { failures.push(`${method} ${path} -> ${x.status} ${t.slice(0, 160)}`); return null }
      try { return JSON.parse(t) } catch { return t }
    }
    const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
      const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      if (ex) return ex
      return prisma.user.create({ data: { clinicId: clinic.id, tenantId: 'sua-instituicao', email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
    }
    const out = await seedRh(api, { tenantId: 'sua-instituicao', mk, failures })
    console.log(JSON.stringify(out, null, 2))
    if (failures.length) console.log('FALHAS:\n' + failures.join('\n'))
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
