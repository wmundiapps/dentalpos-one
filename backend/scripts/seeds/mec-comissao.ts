/**
 * Seed "Comissão de avaliação do MEC" + "Instituição nota máxima" (AMBIENTE DE DEMONSTRAÇÃO).
 *
 * *** TODOS OS DADOS DESTE SEED SÃO FICTÍCIOS ***  Conceitos (CI, IGC, CPC, CC, ENADE, IDD), números de
 * processo e-MEC, comissão avaliadora, egressos e docentes NÃO existem: servem só para mostrar como uma IES de
 * excelência aparece nos painéis. Nada aqui é (nem pode ser apresentado como) resultado oficial do MEC/INEP.
 *
 * Usa SOMENTE a API (token ADMIN) e é idempotente (pode rodar mais de uma vez). NÃO edita edu-demo-seed.ts:
 * o seed principal (ou o e2e) chama esta função DEPOIS de academico, regulatório, governança, reitoria2 e apoio.
 *
 *   import { seedMecComissao } from './seeds/mec-comissao'
 *   await seedMecComissao(api, ctx)    // api(method, path, body?) -> corpo JSON ou null em caso de erro
 *
 * O que ele ajusta (complementa/atualiza o que os outros seeds criaram):
 *  - regulatório: 4 processos de avaliação (autorização, reconhecimento, renovação, recredenciamento) com
 *    comissão, visita in loco, roteiro, kit de evidências; atos/portarias com conceito 5 e vigência longa;
 *    checklists e autoavaliação por indicador concluídos; diligências respondidas;
 *  - conceitos fictícios: CI 5, IGC 5, CPC/CC/ENADE/IDD 5 por curso; comparativo com outras IES (reitoria);
 *  - governança: CPA completa (ciclo concluído, relatório anual, plano de ação), PDI cumprido, NDE titulado;
 *  - corpo docente (mestres/doutores, regime integral), egressos/empregabilidade, infraestrutura 100%, exames.
 */
export type SeedApi = (method: string, path: string, body?: any) => Promise<any>
export interface SeedCtx {
  tenantId?: string
  failures?: string[]
  /** cria usuário de login (usado só para cadastrar docentes fictícios; opcional) */
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
}

export const AVISO_FICTICIO = 'DADOS FICTÍCIOS DE DEMONSTRAÇÃO'
const R = '/edu/regulatorio'
const G = '/edu/governanca'
const DAY = 86_400_000
const dia = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const lst = (r: any): any[] => (Array.isArray(r) ? r : r?.items ?? [])
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export interface ResumoMecComissao {
  processos: number; membros: number; evidencias: number; conceitos: number; atosAjustados: number; checklistsConcluidos: number; indicadoresAvaliados: number
  diligenciasCumpridas: number; cpa: number; pdiMedicoes: number; docentes: number; egressos: number; requisitosInfra: number; inscricoesExame: number; comparativo: number; avisos: number
}

// Cursos "oficiais" fictícios com conceitos: vêm dos programas existentes (academico) e, se faltarem, só os existentes são usados.
const NOMES_FICT = {
  coordenadora: 'Profa. Dra. Helga Brandão Nogueira', a1: 'Prof. Dr. Cássio Ventura Lemos', a2: 'Profa. Ma. Iara Ferraz Bittencourt', a3: 'Prof. Dr. Osvaldo Tavares Pinheiro',
  c2: 'Prof. Dr. Raimundo Castelo Branco Neto', c2a: 'Profa. Dra. Lívia Montenegro Aguiar', c3: 'Profa. Dra. Selma Vasconcellos Prado', c3a: 'Prof. Me. Gilberto Antunes Rocha',
}

interface PerfilProc { chave: string; titulo: string; tipo: string; cursoNome?: string; usarPrograma?: string; protocolo: string; etapa: 'AVALIACAO_IN_LOCO' | 'EM_ANALISE'; visitaEm?: number; visitaDuracao?: number; visitaRealizada?: boolean; pendentes: number; membros: boolean }
const PROCESSOS: PerfilProc[] = [
  { chave: 'enfermagem', titulo: 'Autorização — Enfermagem (visita da comissão do MEC)', tipo: 'AUTORIZACAO_CURSO', cursoNome: 'Enfermagem', protocolo: '202611-000481', etapa: 'AVALIACAO_IN_LOCO', visitaEm: 22, visitaDuracao: 2, pendentes: 2, membros: true },
  { chave: 'fisio', titulo: 'Reconhecimento — Fisioterapia (relatório da comissão)', tipo: 'RECONHECIMENTO_CURSO', cursoNome: 'Fisioterapia', protocolo: '202609-000317', etapa: 'AVALIACAO_IN_LOCO', visitaEm: -21, visitaDuracao: 2, visitaRealizada: true, pendentes: 0, membros: true },
  { chave: 'odonto', titulo: 'Renovação de reconhecimento — Odontologia (comissão do MEC)', tipo: 'RENOVACAO_RECONHECIMENTO', usarPrograma: 'odont', protocolo: '202610-000552', etapa: 'AVALIACAO_IN_LOCO', visitaEm: 6, visitaDuracao: 2, pendentes: 3, membros: true },
  { chave: 'recred', titulo: 'Recredenciamento institucional — ciclo 2026 (análise documental)', tipo: 'RECREDENCIAMENTO', cursoNome: 'Instituição', protocolo: '202608-000091', etapa: 'EM_ANALISE', pendentes: 0, membros: false },
]

export async function seedMecComissao(api: SeedApi, ctx: SeedCtx = {}): Promise<ResumoMecComissao> {
  const falha = (m: string) => ctx.failures?.push(`seedMecComissao: ${m}`)
  const resumo: ResumoMecComissao = { processos: 0, membros: 0, evidencias: 0, conceitos: 0, atosAjustados: 0, checklistsConcluidos: 0, indicadoresAvaliados: 0, diligenciasCumpridas: 0, cpa: 0, pdiMedicoes: 0, docentes: 0, egressos: 0, requisitosInfra: 0, inscricoesExame: 0, comparativo: 0, avisos: 0 }
  const ok = async (m: string, p: string, b?: any, rot?: string) => { const r = await api(m, p, b); if (r == null) falha(rot ?? `${m} ${p}`); return r }

  for (const m of ['regulatorio', 'governanca', 'desempenho', 'apoio', 'infraestrutura']) await api('POST', `/edu/${m}/bootstrap`, {})
  const programas = lst(await api('GET', '/edu/academico/programs?pageSize=200'))

  // ============ 1. processos com comissão de avaliação do MEC ============
  for (const pf of PROCESSOS) {
    const prog = pf.usarPrograma ? programas.find((p) => new RegExp(pf.usarPrograma!, 'i').test(p.nome)) : null
    const existentes = lst(await api('GET', `${R}/processos?q=${encodeURIComponent(pf.titulo.slice(0, 30))}&pageSize=50`))
    let proc = existentes.find((p: any) => p.titulo === pf.titulo)
    if (!proc) {
      proc = await ok('POST', `${R}/processos`, { tipo: pf.tipo, titulo: pf.titulo, programId: prog?.id, cursoNome: prog ? undefined : pf.cursoNome, prazoProtocolo: dia(-120) }, `processo ${pf.chave}`)
      if (!proc) continue
      await ok('POST', `${R}/processos/${proc.id}/avancar`, { etapa: 'PROTOCOLADO', protocoloEmec: pf.protocolo, forcar: true })
      await ok('POST', `${R}/processos/${proc.id}/avancar`, { etapa: 'EM_ANALISE' })
      if (pf.etapa === 'AVALIACAO_IN_LOCO') await ok('POST', `${R}/processos/${proc.id}/avancar`, { etapa: 'AVALIACAO_IN_LOCO', avaliacaoPrevistaEm: dia(pf.visitaEm ?? 30), observacao: 'Comissão designada pelo INEP (demonstração).' })
    }
    resumo.processos++
    const ini = await ok('POST', `${R}/mec/processos/${proc.id}/iniciar`, { gerarEvidencias: true })
    if (ini) resumo.evidencias += ini.evidenciasCriadas ?? 0

    // comissão avaliadora (fictícia)
    if (pf.membros) {
      const atuais = lst(await api('GET', `${R}/mec/processos/${proc.id}/membros`))
      const nomes = pf.chave === 'fisio' ? [NOMES_FICT.c2, NOMES_FICT.c2a, NOMES_FICT.a2] : pf.chave === 'odonto' ? [NOMES_FICT.c3, NOMES_FICT.c3a, NOMES_FICT.a3] : [NOMES_FICT.coordenadora, NOMES_FICT.a1, NOMES_FICT.a2]
      const defs = [
        { nome: nomes[0], papel: 'COORDENADOR', instituicao: 'Universidade Federal Fictícia do Sul', titulacao: 'Doutora', areaAtuacao: 'Saúde — gestão acadêmica', dimensaoFoco: 'ORGANIZACAO_DIDATICO_PEDAGOGICA' },
        { nome: nomes[1], papel: 'AVALIADOR', instituicao: 'Instituto Federal Fictício do Planalto', titulacao: 'Doutor', areaAtuacao: 'Docência e pesquisa', dimensaoFoco: 'CORPO_DOCENTE_TUTORIAL' },
        { nome: nomes[2], papel: 'AVALIADOR', instituicao: 'Centro Universitário Fictício de Minas', titulacao: 'Mestre', areaAtuacao: 'Infraestrutura e laboratórios', dimensaoFoco: 'INFRAESTRUTURA' },
      ]
      for (const d of defs) {
        if (atuais.some((m: any) => m.nome === d.nome)) continue
        if (await ok('POST', `${R}/mec/processos/${proc.id}/membros`, { ...d, designadoEm: dia(-50), observacao: 'Avaliador fictício (demonstração).' })) resumo.membros++
      }
    }

    // visita in loco + roteiro por dimensão
    if (pf.visitaEm != null) {
      const ini2 = new Date(Date.now() + pf.visitaEm * DAY)
      const detalhe = await api('GET', `${R}/mec/processos/${proc.id}`)
      let visita = detalhe?.visita
      if (!visita) visita = await ok('POST', `${R}/mec/processos/${proc.id}/visita`, { inicio: ini2.toISOString(), fim: new Date(ini2.getTime() + ((pf.visitaDuracao ?? 2) - 1) * DAY).toISOString(), local: 'Campus sede — SUA INSTITUIÇÃO', observacoes: 'Visita in loco (demonstração).' })
      if (visita && !(visita.roteiro?.length)) await ok('POST', `${R}/mec/visitas/${visita.id}/roteiro/gerar`, {})
      if (visita && pf.visitaRealizada) await ok('PATCH', `${R}/mec/visitas/${visita.id}`, { status: 'REALIZADA' })
    }

    // fases (ajuste fino além do derivado da etapa)
    const det = await api('GET', `${R}/mec/processos/${proc.id}`)
    for (const f of det?.fases ?? []) {
      if (pf.chave === 'fisio' && f.chave === 'RELATORIO') await ok('PATCH', `${R}/mec/fases/${f.id}`, { status: 'EM_ANDAMENTO', previstaEm: dia(12), observacao: 'Relatório preliminar da comissão: conceito favorável (fictício).' })
      if (pf.chave === 'recred' && f.chave === 'DESIGNACAO_COMISSAO') await ok('PATCH', `${R}/mec/fases/${f.id}`, { status: 'EM_ANDAMENTO', previstaEm: dia(40) })
      if (pf.chave === 'recred' && f.chave === 'ANALISE_DOCUMENTAL') await ok('PATCH', `${R}/mec/fases/${f.id}`, { status: 'CONCLUIDA' })
    }

    // kit de evidências: tudo atendido (conceito estimado 5/4) exceto os itens "pendentes" que mostram os alertas
    const evs = lst(await api('GET', `${R}/mec/processos/${proc.id}/evidencias`))
    const mantemPendente = pf.pendentes > 0 ? evs.filter((e) => e.obrigatorio).slice(-pf.pendentes).map((e) => e.id) : []
    let i = 0
    for (const e of evs) {
      i++
      const pend = mantemPendente.includes(e.id)
      const corpo: any = pend
        ? { status: 'EM_ANDAMENTO', conceitoEstimado: 4, prazo: dia(pf.chave === 'odonto' ? 3 + (i % 4) : 9 + (i % 5)), observacao: 'Em consolidação pelo responsável.' }
        : { status: 'ATENDIDO', documentoNome: `${e.indicadorCodigo}-${slug(e.indicadorNome)}.pdf`, conceitoEstimado: i % 7 === 0 ? 4 : 5 }
      if (!e.responsavelNome) corpo.responsavelNome = 'Coordenação do curso'
      if (e.status === 'ATENDIDO' && !pend) continue
      await ok('PATCH', `${R}/mec/evidencias/${e.id}`, corpo)
    }
  }

  // ============ 2. atos/portarias, checklists, autoavaliação e diligências em dia ============
  for (const a of lst(await api('GET', `${R}/atos?pageSize=200`))) {
    const venc = a.vencimento ? new Date(a.vencimento).getTime() : null
    const patch: any = {}
    if (a.conceito !== 5) patch.conceito = 5
    if (venc != null && venc < Date.now() + 700 * DAY) { patch.vencimento = dia(1460 + (a.escopo === 'INSTITUICAO' ? 365 : 0)); patch.observacoes = `${a.observacoes ?? ''} Vigência renovada (demonstração).`.trim().slice(0, 3900) }
    if (Object.keys(patch).length && (await ok('PATCH', `${R}/atos/${a.id}`, patch, `ato ${a.numero}`))) resumo.atosAjustados++
  }
  // cursos sem ato de reconhecimento/renovação passam a ter a portaria (fictícia) registrada
  const painelReg = await api('GET', `${R}/painel`)
  for (const [k, cu] of (painelReg?.cursos ?? []).filter((x: any) => !x.ato).entries()) {
    if (await ok('POST', `${R}/atos`, { tipo: 'PORTARIA_RECONHECIMENTO', numero: `Portaria MEC nº ${700 + k}/2025 (fictícia)`, orgao: 'MEC', dataPublicacao: dia(-400), vigenciaInicio: dia(-400), vencimento: dia(1460), escopo: 'CURSO', programId: cu.programId, conceito: 5, cicloAvaliativoAnos: 4, observacoes: AVISO_FICTICIO }, `ato ${cu.curso}`)) resumo.atosAjustados++
  }
  for (const ps of lst(await api('GET', `${R}/processos?pageSize=200`))) {
    // prazos de protocolo vencidos de processos em preparação passam a ter folga (IES em dia)
    if (ps.etapa === 'PREPARACAO' && ps.prazoProtocolo && new Date(ps.prazoProtocolo).getTime() < Date.now() + 45 * DAY) await ok('PATCH', `${R}/processos/${ps.id}`, { prazoProtocolo: dia(120) })
  }
  for (const d of lst(await api('GET', `${R}/diligencias?pageSize=100`))) {
    if (!['ABERTA', 'VENCIDA'].includes(d.status)) continue
    if (await ok('POST', `${R}/diligencias/${d.id}/responder`, { resposta: 'PPC revisado e comprovante de acervo protocolados no e-MEC (demonstração).' })) {
      await ok('POST', `${R}/diligencias/${d.id}/cumprir`, {})
      resumo.diligenciasCumpridas++
    }
  }
  for (const ps of lst(await api('GET', `${R}/processos?etapa=DILIGENCIA&pageSize=50`))) await api('POST', `${R}/processos/${ps.id}/avancar`, { etapa: 'EM_ANALISE' })
  for (const cl of lst(await api('GET', `${R}/checklists?pageSize=100`))) {
    const full = await api('GET', `${R}/checklists/${cl.id}`)
    let mexeu = false
    for (const it of full?.itens ?? []) {
      if (it.status === 'ATENDIDO' || it.status === 'NAO_APLICAVEL') continue
      if (!it.evidencias?.length && !it.evidenciaTexto && !it.evidenciaUrl) await api('POST', `${R}/checklists/itens/${it.id}/evidencias`, { nome: `${slug(it.titulo)}.pdf`, dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' })
      if (await api('PATCH', `${R}/checklists/itens/${it.id}`, { status: 'ATENDIDO' })) mexeu = true
    }
    if (mexeu) resumo.checklistsConcluidos++
  }
  await api('POST', `${R}/indicadores/gerar`, {})
  for (const pg of programas) await api('POST', `${R}/indicadores/gerar`, { programId: pg.id })
  for (const ind of lst(await api('GET', `${R}/indicadores?pageSize=500`))) {
    if (ind.conceito === 5) continue
    if (await api('PUT', `${R}/indicadores/${ind.id}`, { conceito: 5, justificativa: 'Indicador plenamente atendido, com evidências no kit da visita (dados fictícios de demonstração).', planoMelhoria: null, prazoMelhoria: null })) resumo.indicadoresAvaliados++
  }

  // ============ 3. conceitos regulatórios FICTÍCIOS (CI, IGC, CPC, CC, ENADE, IDD) ============
  const conceito = async (b: any) => { if (await ok('POST', `${R}/mec/conceitos`, { ficticio: true, observacao: AVISO_FICTICIO, ...b }, `conceito ${b.tipo}`)) resumo.conceitos++ }
  await conceito({ tipo: 'CI', ano: 2026, faixa: 5 })
  await conceito({ tipo: 'CI', ano: 2023, faixa: 5 })
  for (const [ano, v] of [[2023, 4.31], [2024, 4.48], [2025, 4.62], [2026, 4.71]] as const) await conceito({ tipo: 'IGC', ano, valor: v })
  const cursos = programas.length ? programas : []
  for (const [k, pg] of cursos.entries()) {
    for (const [ano, base] of [[2024, 4.52], [2025, 4.64], [2026, 4.73]] as const) {
      const d = ((k * 7) % 9) / 100
      await conceito({ tipo: 'CPC', ano, programId: pg.id, valor: Math.min(4.95, +(base + d).toFixed(2)) })
      await conceito({ tipo: 'ENADE', ano, programId: pg.id, valor: Math.min(4.95, +(base + 0.04 + d).toFixed(2)) })
      await conceito({ tipo: 'IDD', ano, programId: pg.id, valor: Math.min(4.95, +(base - 0.03 + d).toFixed(2)) })
    }
    await conceito({ tipo: 'CC', ano: 2026, programId: pg.id, faixa: 5 })
  }

  // ============ 4. comparativo com outras IES (reitoria) ============
  const C = '/edu/reitoria/comparativo'
  await api('POST', `${C}/ies/propria`, {})
  let propria = lst(await api('GET', `${C}/ies?tipo=PROPRIA`))[0]
  if (!propria) propria = await api('POST', `${C}/ies`, { tipo: 'PROPRIA', nome: 'SUA INSTITUIÇÃO', sigla: 'SUAINST' })
  if (propria) {
    const put = async (ano: number, indicador: string, valor: number, cursoNome = '') => { if (await ok('PUT', `${C}/indicadores`, { iesId: propria.id, ano, indicador, valor, cursoNome }, `comparativo ${indicador}`)) resumo.comparativo++ }
    for (const [ano, igc, cpc, enade, idd, cc] of [[2024, 4.48, 4.55, 4.5, 4.46, 4.6], [2025, 4.62, 4.68, 4.66, 4.6, 4.72], [2026, 4.71, 4.78, 4.8, 4.7, 4.85]] as const) {
      await put(ano, 'IGC', igc); await put(ano, 'CPC', cpc); await put(ano, 'ENADE', enade); await put(ano, 'IDD', idd); await put(ano, 'CC', cc)
    }
    await put(2026, 'PCT_DOUTORES', 82); await put(2026, 'NUM_DOCENTES', 118); await put(2026, 'NUM_CURSOS', Math.max(cursos.length, 1))
    for (const pg of cursos) { await put(2026, 'CPC', 4.73, pg.nome); await put(2026, 'ENADE', 4.77, pg.nome) }
  } else falha('IES própria do comparativo não encontrada')

  // ============ 5. CPA completa (ciclo concluído, relatório anual, plano de ação) ============
  await seedCpa(api, ok, resumo)

  // ============ 6. PDI cumprido ============
  for (const meta of lst(await api('GET', `${G}/pdi-metas?pageSize=500`))) {
    if (meta.valorMeta == null) continue
    const atingida = meta.valorAtual != null && (meta.sentido === 'MENOR_MELHOR' ? meta.valorAtual <= meta.valorMeta : meta.valorAtual >= meta.valorMeta)
    if (atingida) continue
    const v = meta.sentido === 'MENOR_MELHOR' ? Math.max(0, meta.valorMeta - 0.5) : meta.valorMeta + 1
    if (await ok('POST', `${G}/pdi-metas/${meta.id}/medicoes`, { valor: v, observacao: 'Meta cumprida (demonstração).' })) resumo.pdiMedicoes++
  }
  for (const ac of lst(await api('GET', `${G}/pdi-acoes?pageSize=500`))) if (ac.status !== 'CONCLUIDA') await api('PUT', `${G}/pdi-acoes/${ac.id}`, { status: 'CONCLUIDA', gasto: ac.orcamento ?? undefined })

  // ============ 7. NDE titulado e corpo docente (mestres/doutores, regime integral) ============
  for (const m of lst(await api('GET', `${G}/nde-membros?pageSize=200`))) {
    if (m.titulacao === 'DOUTOR' && m.regime === 'INTEGRAL') continue
    await api('PUT', `${G}/nde-membros/${m.id}`, { titulacao: m.titulacao === 'MESTRE' || m.titulacao === 'DOUTOR' ? 'DOUTOR' : 'MESTRE', regime: 'INTEGRAL' })
  }
  const ids = new Set<string>((((await api('GET', '/edu/portal2/prof/professores'))?.itens) ?? []).map((p: any) => p.id))
  if (ctx.mk) {
    const nomes = ['Adriano Menezes', 'Beatriz Sampaio', 'Caetano Prado', 'Daniela Furtado', 'Eduardo Salgado', 'Fabiana Rangel', 'Gustavo Peixoto', 'Heloísa Camargo', 'Ivo Marques', 'Jussara Leal']
    for (const [k, n] of nomes.entries()) {
      const [f, ...l] = n.split(' ')
      const u = await ctx.mk(`docente${String(k + 1).padStart(2, '0')}@suainstituicao.edu.br`, 'Demo@2026', f, l.join(' '), 'TEACHER')
      if (u?.id) ids.add(u.id)
    }
  }
  let k = 0
  for (const id of ids) {
    const titulacao = k % 5 === 4 ? 'Mestre' : 'Doutor'
    const regime = k % 4 === 3 ? 'PARCIAL' : 'INTEGRAL'
    if (await ok('PUT', `/edu/portal2/prof/disponibilidade?professorUserId=${id}`, { perfil: { regime, cargaContratualHoras: regime === 'INTEGRAL' ? 40 : 20, titulacao } }, 'perfil docente')) resumo.docentes++
    k++
  }

  // ============ 8. egressos e empregabilidade ============
  const SOBRENOMES = ['Albuquerque', 'Barros', 'Cavalcanti', 'Dantas', 'Esteves', 'Figueiredo', 'Guedes', 'Holanda']
  const cargos = ['Cirurgiã-dentista', 'Analista de projetos', 'Advogado associado', 'Enfermeira assistencial', 'Engenheiro civil pleno', 'Gerente administrativo', 'Pesquisadora (mestrado)', 'Coordenador clínico']
  const jaE = new Set(lst(await api('GET', '/edu/apoio/egressos?pageSize=500')).map((e: any) => e.email))
  for (let n = 0; n < 32; n++) {
    const email = `egresso${String(n + 1).padStart(2, '0')}@exemplo.edu.br`
    if (jaE.has(email)) continue
    const pg = cursos[n % Math.max(cursos.length, 1)]
    const situacao = n % 16 === 15 ? 'ESTUDANDO' : n % 11 === 10 ? 'AUTONOMO' : 'EMPREGADO'
    const r = await ok('POST', '/edu/apoio/egressos', {
      nome: `Egresso Fictício ${n + 1} ${SOBRENOMES[n % SOBRENOMES.length]}`, email, programId: pg?.id, programaNome: pg?.nome ?? 'Curso de demonstração', anoIngresso: 2018 + (n % 4), anoConclusao: 2022 + (n % 4),
      cidade: 'São Paulo', uf: 'SP', consenteContato: true, situacaoProfissional: situacao, empregadorAtual: situacao === 'EMPREGADO' ? 'Empresa de Exemplo Ltda.' : undefined, cargoAtual: cargos[n % cargos.length],
      atuaNaArea: true, cursandoPos: n % 6 === 0, faixaSalarial: ['2_5sm', '5_10sm', 'acima_10sm'][n % 3],
    }, 'egresso')
    if (r) resumo.egressos++
  }

  // ============ 9. infraestrutura com 100% dos itens exigidos atendidos ============
  const PADRAO = [
    { descricao: 'Salas de aula adequadas ao curso', spaceTipo: 'SALA_AULA', referenciaMec: 'Indicador 3.1' },
    { descricao: 'Laboratórios didáticos', spaceTipo: 'LABORATORIO', referenciaMec: 'Indicador 3.2' },
    { descricao: 'Biblioteca com acervo físico e virtual', spaceTipo: 'BIBLIOTECA', referenciaMec: 'Indicador 3.3' },
  ]
  for (const pg of programas) {
    const atuais = lst(await api('GET', `/edu/infraestrutura/requisitos-curso?programId=${pg.id}&pageSize=100`))
    for (const p of PADRAO) {
      if (atuais.some((r: any) => r.descricao === p.descricao)) continue
      if (await api('POST', '/edu/infraestrutura/requisitos-curso', { programId: pg.id, tipo: 'ESPACO', quantidadeMinima: 1, obrigatorio: true, ...p })) resumo.requisitosInfra++
    }
    // calibra os requisitos ao que a IES de demonstração possui (a IES "de excelência" tem todos os itens exigidos)
    const ad = await api('GET', `/edu/infraestrutura/adequacao/${pg.id}`)
    for (const l of ad?.linhas ?? []) {
      if (l.situacao === 'ATENDE') continue
      if (l.existente > 0) await api('PATCH', `/edu/infraestrutura/requisitos-curso/${l.requisitoId}`, { quantidadeMinima: l.existente, porVagas: null })
      else await api('PATCH', `/edu/infraestrutura/requisitos-curso/${l.requisitoId}`, { ativo: false })
    }
  }

  // ============ 10. desempenho nos exames (ENADE) ============
  const exames = lst(await api('GET', '/edu/desempenho/exames?pageSize=50'))
  const enade = exames.find((e: any) => e.tipo === 'ENADE')
  if (enade) {
    const eds = lst(await api('GET', `/edu/desempenho/edicoes?exameId=${enade.id}&pageSize=50`))
    let ed = eds.find((e: any) => e.titulo === 'ENADE 2025 (demonstração)')
    if (!ed) ed = await ok('POST', '/edu/desempenho/edicoes', { exameId: enade.id, ano: 2025, titulo: 'ENADE 2025 (demonstração)', dataProva: dia(-150), dataResultado: dia(-60), status: 'RESULTADO_PUBLICADO' }, 'edição ENADE')
    const alunos = lst(await api('GET', '/edu/academico/students?pageSize=60'))
    for (const [n, st] of alunos.slice(0, 40).entries()) {
      const pg = cursos[n % Math.max(cursos.length, 1)]
      const ins = await api('POST', `/edu/desempenho/edicoes/${ed?.id}/inscricoes`, { studentId: st.id, programId: pg?.id, categoria: 'CONCLUINTE', situacao: 'REGULAR', protocolo: `DEMO-${n + 1}` })
      if (ins?.id && (await api('PATCH', `/edu/desempenho/inscricoes/${ins.id}`, { conceito: 5, nota: 88 + (n % 10) }))) resumo.inscricoesExame++
    }
  }

  // ============ 11. avisos à reitoria e atualização dos painéis ============
  const av = await ok('POST', `${R}/mec/avisos/processar`, {})
  resumo.avisos = av?.avisos ?? 0
  await api('POST', '/edu/reitoria/painel/snapshot', {})
  await api('POST', '/edu/reitoria/okr/sincronizar', {})
  return resumo
}

async function seedCpa(api: SeedApi, ok: (m: string, p: string, b?: any, rot?: string) => Promise<any>, resumo: ResumoMecComissao) {
  const TITULO = 'Autoavaliação Institucional 2026 — ciclo concluído (demonstração)'
  let cpa = lst(await api('GET', `${G}/cpa/comissoes`))[0]
  if (!cpa) cpa = await ok('POST', `${G}/cpa/comissoes`, { nome: 'CPA — Comissão Própria de Avaliação', portaria: 'Portaria interna nº 12/2026 (fictícia)' })
  if (!cpa) return
  const membros = lst(await api('GET', `${G}/cpa/membros?cpaId=${cpa.id}&pageSize=100`))
  const SEG = ['DOCENTE', 'DISCENTE', 'TECNICO_ADMINISTRATIVO', 'SOCIEDADE_CIVIL'] as const
  const nomes: Record<string, string[]> = { DOCENTE: ['Marina Lacerda', 'Otávio Brandão'], DISCENTE: ['Júlia Cardoso', 'Pedro Henrique Lins'], TECNICO_ADMINISTRATIVO: ['Sandra Veloso', 'Renato Pimentel'], SOCIEDADE_CIVIL: ['Cleide Andrade (comunidade)', 'Moacir Teles (egresso)'] }
  for (const s of SEG) {
    if (membros.filter((m: any) => m.segmento === s).length >= 2) continue
    for (const n of nomes[s]) await api('POST', `${G}/cpa/membros`, { cpaId: cpa.id, nome: n, segmento: s, cargo: 'membro', inicioMandato: dia(-200), fimMandato: dia(900) })
  }
  if (lst(await api('GET', `${G}/cpa/ciclos?q=${encodeURIComponent('ciclo concluído')}&pageSize=10`)).some((c: any) => c.titulo === TITULO)) return
  const ciclo = await ok('POST', `${G}/cpa/ciclos`, { cpaId: cpa.id, titulo: TITULO, anoBase: 2026, inicio: dia(-45), fim: dia(1), minRespostas: 5 })
  if (!ciclo) return
  const alvo: Record<string, number> = { DOCENTE: 14, DISCENTE: 18, TECNICO_ADMINISTRATIVO: 10, SOCIEDADE_CIVIL: 6 }
  const qs: Array<{ seg: string; id: string; perguntas: any[] }> = []
  for (const s of SEG) {
    const q = await ok('POST', `${G}/cpa/questionarios/from-modelo`, { cicloId: ciclo.id, modeloKey: `CPA_${s}` }, `questionário CPA ${s}`)
    if (q) qs.push({ seg: s, id: q.id, perguntas: q.perguntas ?? [] })
  }
  if (!(await ok('POST', `${G}/cpa/ciclos/${ciclo.id}/avancar`, {}, 'CPA → coleta'))) return
  for (const q of qs) {
    const n = alvo[q.seg]
    const conv = await ok('POST', `${G}/cpa/questionarios/${q.id}/convites`, { quantidade: Math.ceil(n / 0.93) }, 'convites CPA')
    for (const [i, token] of (conv?.tokens ?? []).slice(0, n).entries()) {
      const respostas = q.perguntas.map((p: any, j: number) => (p.tipo === 'LIKERT5' ? { perguntaId: p.id, valor: (i + j) % 7 === 0 ? 4 : 5 } : p.tipo === 'SIM_NAO' ? { perguntaId: p.id, valor: 1 } : { perguntaId: p.id, texto: 'Ótima experiência na instituição (comentário fictício).' }))
      if (await api('POST', `/public/edu/governanca/cpa/responder/${token}`, { respostas })) resumo.cpa++
    }
  }
  for (let i = 0; i < 2; i++) await ok('POST', `${G}/cpa/ciclos/${ciclo.id}/avancar`, {}, 'CPA → análise/relatório')
  await ok('POST', `${G}/cpa/ciclos/${ciclo.id}/relatorios`, { tipo: 'ANUAL' }, 'relatório CPA')
  await ok('POST', `${G}/cpa/ciclos/${ciclo.id}/avancar`, {}, 'CPA → concluído')
  await api('PUT', `${G}/cpa/ciclos/${ciclo.id}`, { fim: dia(-2) })
  for (const t of ['Ampliar o acervo digital de saúde (meta superada)', 'Programa de acolhimento de calouros consolidado', 'Reforma dos laboratórios multiusuários concluída']) {
    await api('POST', `${G}/cpa/plano-acao`, { cicloId: ciclo.id, problema: `Ponto de atenção do ciclo anterior: ${t}`, acao: t, prazo: dia(-20), status: 'CONCLUIDA' })
  }
}
