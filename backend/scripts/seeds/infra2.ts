/**
 * Seed de demonstração de INFRAESTRUTURA 2 (agenda, solicitações/OS com fotos, frota, segurança patrimonial) e da CAIXA DE FEEDBACK.
 * Usa a API REAL com token ADMIN (estilo scripts/edu-demo-seed.ts).
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedInfra2, seedFeedback } from './seeds/infra2'  ->  await seedInfra2(c.api, c); await seedFeedback(c.api, c)
 * Uso isolado: DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/infra2.ts   (login admin@ravel.edu.br / Ravel@2026)
 * Pessoas, placas, apólices e valores são FICTÍCIOS. Rodar em banco limpo.
 */
export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const ymd = (n: number) => day(n).slice(0, 10)
const I = '/edu/infraestrutura'
// PNG 1x1 válido (foto de demonstração)
export const FOTO_DEMO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export async function seedInfra2(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = {}
  const post = (p: string, b: any) => api('POST', `${I}${p}`, b)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) ctx.failures?.push(`seedInfra2: falhou ${tag}`); return x as T }

  // ---------------------------------------------------------------- equipe
  if (ctx.mk) {
    await ctx.mk('infra@ravel.edu.br', 'Ravel@2026', 'Marcos', 'Tavares', 'FACILITIES')
    await ctx.mk('seguranca1@ravel.edu.br', 'Ravel@2026', 'Jorge', 'Almeida', 'STAFF')
    await ctx.mk('seguranca2@ravel.edu.br', 'Ravel@2026', 'Rita', 'Cavalcanti', 'STAFF')
    await ctx.mk('motorista@ravel.edu.br', 'Ravel@2026', 'Antônio', 'Pereira', 'STAFF')
  }
  const pessoas: any[] = (await api('GET', `${I}/pessoas`))?.items ?? []
  const uid = (nome: string) => pessoas.find((p) => p.nome.startsWith(nome))?.id as string | undefined
  const marcos = uid('Marcos'), jorge = uid('Jorge'), rita = uid('Rita'), antonio = uid('Antônio')
  S.pessoas = { marcos, jorge, rita, antonio }

  // ---------------------------------------------------------------- agenda
  const agenda: Array<[string, string, string, number, number | null, any?]> = [
    ['PREVENTIVA', 'EXTINTOR', 'Inspeção semestral de extintores — todos os blocos', 12, 13, { recorrenciaDias: 180, prioridade: 'ALTA', custoPrevisto: 1800 }],
    ['PREVENTIVA', 'ELETRICA', 'Revisão do quadro elétrico e SPDA', 20, 22, { recorrenciaDias: 365, custoPrevisto: 4200 }],
    ['PREVENTIVA', 'HIDRAULICA', 'Limpeza de caixas d’água e reservatórios', -3, -2, { recorrenciaDias: 180, prioridade: 'ALTA' }],
    ['PREVENTIVA', 'JARDIM', 'Poda e adubação do jardim central', 5, 6, { recorrenciaDias: 60, custoPrevisto: 650 }],
    ['PREVENTIVA', 'EQUIPAMENTOS', 'Manutenção dos aparelhos de ar-condicionado (bloco B)', 30, 34, { recorrenciaDias: 90, custoPrevisto: 5200 }],
    ['EVENTUAL', 'TELHADO', 'Reparo de telhas e calhas — bloco C', 9, 12, { prioridade: 'ALTA', custoPrevisto: 7400 }],
    ['EVENTUAL', 'BANHEIRO', 'Reforma dos banheiros do térreo (acessibilidade)', 45, 70, { custoPrevisto: 38000 }],
    ['EVENTUAL', 'PINTURA', 'Pintura das fachadas leste e oeste', 60, 80, { custoPrevisto: 26000 }],
    ['EVENTUAL', 'CALCAMENTO', 'Recuperação do calçamento do acesso principal', 25, 32, { custoPrevisto: 15500 }],
    ['AQUISICAO', 'EQUIPAMENTOS', 'Compra de 2 bebedouros industriais', 15, null, { custoPrevisto: 6800 }],
    ['EXPANSAO', 'OUTRO', 'Expansão: novo laboratório de habilidades clínicas', 90, 180, { custoPrevisto: 210000 }],
    ['SEGURANCA', 'CIPA', 'Reunião ordinária da CIPA', 7, 7, { recorrenciaDias: 30 }],
    ['SEGURANCA', 'SIMULADO', 'Simulado de evacuação e abandono de edifício', 40, 40, { recorrenciaDias: 365, prioridade: 'ALTA' }],
    ['SEGURANCA', 'EPI', 'Entrega e conferência de EPIs da manutenção e laboratórios', 18, 19, { custoPrevisto: 2300 }],
    ['AVISO', 'COMUNICACAO', 'Aviso: interdição temporária do estacionamento B para obras', 10, 14],
    ['SINALIZACAO', 'COMUNICACAO', 'Nova sinalização de rotas de fuga e acessibilidade', 28, 35, { custoPrevisto: 9800 }],
    ['IDENTIDADE_VISUAL', 'COMUNICACAO', 'Adesivagem institucional dos corredores e recepção', 50, 56, { custoPrevisto: 12400 }],
    ['MOBILIARIO', 'MOBILIARIO', 'Reposição de carteiras — Departamento de Odontologia', 22, 25, { departamentoNome: 'Odontologia', custoPrevisto: 14200 }],
  ]
  S.agenda = []
  for (const [tipo, area, titulo, ini, fim, extra] of agenda) {
    const it = await post('/agenda/itens', { tipo, area, titulo, inicio: day(ini), ...(fim != null ? { fim: day(fim) } : {}), responsavelUserId: marcos, anotacoes: 'Registro de demonstração.', ...extra })
    if (it) S.agenda.push(it); else ctx.failures?.push(`seedInfra2: agenda ${titulo}`)
  }
  if (S.agenda[3]) await post(`/agenda/itens/${S.agenda[3].id}/notas`, { texto: 'Fornecedor confirmou a visita para a semana que vem.' })
  if (S.agenda[2]) await post(`/agenda/itens/${S.agenda[2].id}/iniciar`, {})

  // ---------------------------------------------------------------- QR das salas e solicitações com fotos
  S.qr = []
  for (const nome of ['Sala 101 — Bloco A', 'Laboratório de Anatomia', 'Biblioteca — salão de estudos']) { const q = await post('/qr-locais', { nome }); if (q) S.qr.push(q) }
  const sols: Array<[string, string, string, string, string, string?]> = [
    ['PROBLEMA', 'ELETRICA', 'Tomadas sem energia na Sala 101', 'Três tomadas da parede lateral não funcionam desde segunda. O projetor está sendo ligado com extensão, o que é um risco.', 'ALTA'],
    ['PROBLEMA', 'HIDRAULICA', 'Vazamento na torneira do banheiro feminino do 2º andar', 'Torneira da segunda pia pinga constantemente e molhou o piso.', 'MEDIA'],
    ['PROBLEMA', 'TELHADO', 'Goteira no corredor do bloco C', 'Quando chove forte entra água perto da secretaria. Já colocamos balde.', 'URGENTE'],
    ['IMPLEMENTACAO', 'EQUIPAMENTO', 'Instalar bebedouro no pátio', 'Alunos pedem um bebedouro próximo à quadra; hoje só há no prédio principal.', 'BAIXA'],
    ['PROBLEMA', 'JARDIM', 'Galho de árvore sobre o estacionamento', 'Galho grande com risco de queda sobre as vagas 12 a 15.', 'ALTA'],
    ['PROBLEMA', 'MOBILIARIO', 'Cadeiras quebradas no Laboratório de Anatomia', 'Quatro cadeiras com assento solto.', 'MEDIA'],
  ]
  S.sols = []
  for (const [tipo, categoria, titulo, relatorio, prioridade] of sols) {
    const s = await post('/solicitacoes', { tipo, categoria, titulo, relatorio, prioridade, local: 'Campus sede', fotos: [{ arquivoNome: 'foto-local.png', mime: 'image/png', dataUrl: FOTO_DEMO }] })
    if (s) S.sols.push(s); else ctx.failures?.push(`seedInfra2: solicitação ${titulo}`)
  }
  if (S.sols[0]) {
    await post(`/solicitacoes/${S.sols[0].id}/triagem`, { decisao: 'ACEITAR', responsavelUserId: marcos, prioridade: 'ALTA', custoEstimado: 480 })
    const os = await post(`/solicitacoes/${S.sols[0].id}/gerar-os`, { custoPrevisto: 480 })
    if (os) { await post(`/os/${os.id}/iniciar`, {}); await post(`/os/${os.id}/concluir`, { custoReal: 455, relatorioExecucao: 'Substituídas 3 tomadas e o disjuntor do circuito; testado com carga.' }); S.os = os }
  }
  if (S.sols[1]) { await post(`/solicitacoes/${S.sols[1].id}/triagem`, { decisao: 'ACEITAR', responsavelUserId: marcos }); await post(`/solicitacoes/${S.sols[1].id}/gerar-os`, {}) }
  if (S.sols[2]) await post(`/solicitacoes/${S.sols[2].id}/triagem`, { decisao: 'ACEITAR', responsavelUserId: marcos, prioridade: 'URGENTE', custoEstimado: 2300 })
  if (S.sols[3]) await post(`/solicitacoes/${S.sols[3].id}/triagem`, { decisao: 'REJEITAR', motivo: 'Já previsto na agenda de aquisições (2 bebedouros industriais).' })

  // ---------------------------------------------------------------- frota
  const veics: Array<[string, string, string, string, number, string, number, any?]> = [
    ['QWE1A23', 'Fiat', 'Doblò', 'UTILITARIO', 2021, 'FLEX', 48200, { apelido: 'Utilitário da manutenção', capacidade: 5 }],
    ['RTY4B56', 'Mercedes-Benz', 'Sprinter 415', 'VAN', 2020, 'DIESEL', 91500, { apelido: 'Van institucional', capacidade: 16 }],
    ['UIO7C89', 'Toyota', 'Corolla', 'CARRO', 2023, 'FLEX', 21300, { apelido: 'Carro da reitoria', capacidade: 5 }],
  ]
  S.veics = []
  for (const [placa, marca, modelo, tipo, ano, combustivel, odometroKm, extra] of veics) {
    const v = await post('/frota/veiculos', { placa, marca, modelo, tipo, ano, combustivel, odometroKm, responsavelUserId: marcos, departamentoNome: 'Infraestrutura', ...extra })
    if (v) S.veics.push(v); else ctx.failures?.push(`seedInfra2: veículo ${placa}`)
  }
  const cnh = async (nome: string, cnhNumero: string, userId: string | undefined, dias: number) => post('/frota/motoristas', { nome, cnhNumero, cnhCategoria: 'D', cnhValidade: day(dias), userId, telefone: '(11) 99999-0000' })
  S.mots = [ok(await cnh('Antônio Pereira', '12345678901', antonio, 400), 'mot1'), ok(await cnh('Luciana Prado', '98765432100', undefined, 25), 'mot2'), ok(await cnh('Edson Barreto', '11122233344', undefined, 700), 'mot3')]
  const [v0, v1, v2] = S.veics, [m0, m1, m2] = S.mots
  if (v0 && m0) {
    const regs: Array<[string, number, number, number, number]> = [[v0.id, -60, 48300, 40, 232], [v0.id, -40, 48650, 38, 224], [v0.id, -20, 49010, 41, 246], [v0.id, -5, 49390, 39, 238]]
    for (const [veiculoId, d, km, litros, valor] of regs) await post('/frota/registros', { veiculoId, tipo: 'ABASTECIMENTO', data: day(d), km, litros, valor, combustivel: 'FLEX', posto: 'Posto Central', motoristaId: m0.id })
  }
  if (v1 && m1) for (const [d, km, litros, valor] of [[-50, 91900, 60, 372], [-25, 92600, 66, 409], [-6, 93300, 64, 397]] as number[][]) await post('/frota/registros', { veiculoId: v1.id, tipo: 'ABASTECIMENTO', data: day(d), km, litros, valor, combustivel: 'DIESEL', posto: 'Posto Rodovia', motoristaId: m1.id })
  if (v2) await post('/frota/registros', { veiculoId: v2.id, tipo: 'QUILOMETRAGEM', data: day(-3), km: 21650, motoristaId: m2?.id })
  if (v0 && m0) {
    const mu = await post('/frota/multas', { veiculoId: v0.id, motoristaId: m0.id, autoInfracao: 'A1234567', dataInfracao: day(-30), descricao: 'Excesso de velocidade até 20% (art. 218, I)', pontos: 4, valor: 130.16, vencimento: day(20), local: 'Av. Brasil, km 12' })
    if (mu) { await post(`/frota/multas/${mu.id}/tratamento`, { tratamento: 'RESSARCIMENTO', responsavelUserId: antonio, responsavelNome: 'Antônio Pereira', valorRessarcir: 130.16 }); await post(`/frota/multas/${mu.id}/ressarcir`, { valor: 65.08 }); S.multa = mu }
  }
  if (v1 && m1) { const mu2 = await post('/frota/multas', { veiculoId: v1.id, motoristaId: m1.id, autoInfracao: 'B7654321', dataInfracao: day(-12), descricao: 'Estacionar em local proibido (art. 181)', pontos: 3, valor: 195.23, vencimento: day(8) }); if (mu2) await post(`/frota/multas/${mu2.id}/tratamento`, { tratamento: 'DESCONTO_FOLHA', responsavelNome: 'Luciana Prado' }) }
  if (v2) await post('/frota/multas', { veiculoId: v2.id, autoInfracao: 'C1122334', dataInfracao: day(-70), descricao: 'Avanço de sinal vermelho (art. 208)', pontos: 7, valor: 293.47, vencimento: day(-40) }).then((m) => m && post(`/frota/multas/${m.id}/pagar`, {}))
  for (const [v, ap, seg, fim, premio] of [[v0, 'AP-2026-001', 'Porto Seguro', 200, 3200], [v1, 'AP-2026-002', 'Bradesco Seguros', 18, 5400], [v2, 'AP-2026-003', 'Tokio Marine', 320, 4100]] as any[])
    if (v) await post('/frota/seguros', { veiculoId: v.id, apolice: ap, seguradora: seg, vigenciaInicio: day(fim - 365), vigenciaFim: day(fim), premio, franquia: 2500, cobertura: 'Compreensiva, terceiros R$ 300 mil, assistência 24h', responsavelNome: 'Marcos Tavares' })
  for (const [v, tipo, desc, d, km, custo, pd] of [[v0, 'REVISAO', 'Revisão dos 50 mil km', -15, 49100, 1280, 150], [v1, 'PREVENTIVA', 'Troca de óleo e filtros', -22, 92300, 960, 14], [v2, 'REVISAO', 'Revisão dos 20 mil km', -90, 20100, 890, 120]] as any[])
    if (v) await post('/frota/manutencoes', { veiculoId: v.id, tipo, descricao: desc, data: day(d), km, custo, oficina: 'Oficina Autorizada', responsavelUserId: marcos, proximaData: day(pd) })
  for (const [v, tipo, val] of [[v0, 'CRLV', 150], [v0, 'LICENCIAMENTO', 40], [v1, 'CRLV', 90], [v1, 'LICENCIAMENTO', -5], [v2, 'CRLV', 300], [v2, 'IPVA', 60]] as any[])
    if (v) await post('/frota/documentos', { veiculoId: v.id, tipo, exercicio: new Date().getFullYear(), validade: day(val), responsavelNome: 'Marcos Tavares' })
  if (v1 && m1) {
    const r1 = await post('/frota/reservas', { veiculoId: v1.id, motoristaId: m1.id, finalidade: 'Visita técnica ao hospital conveniado (turma de Enfermagem)', destino: 'Hospital Santa Clara', passageiros: 14, saidaPrevista: day(3), retornoPrevisto: day(3.4) })
    if (r1) await post(`/frota/reservas/${r1.id}/decidir`, { decisao: 'APROVAR', motoristaId: m1.id })
    await post('/frota/reservas', { veiculoId: v2?.id ?? v1.id, finalidade: 'Reunião com a Secretaria de Educação', destino: 'Prefeitura Municipal', passageiros: 2, saidaPrevista: day(5), retornoPrevisto: day(5.3) })
  }

  // ---------------------------------------------------------------- segurança patrimonial
  const postos: Array<[string, string, string, number]> = [['PORT-1', 'Portaria principal', 'PORTARIA', 2], ['PAT-1', 'Pátio central', 'PATIO', 1], ['EST-A', 'Estacionamento A', 'ESTACIONAMENTO', 1], ['SAL-B', 'Coordenação de salas — Bloco B', 'SALAS', 1]]
  S.postos = []
  for (const [codigo, nome, tipo, efetivoMinimo] of postos) { const p = await post('/seguranca-patrimonial/postos', { codigo, nome, tipo, efetivoMinimo }); if (p) S.postos.push(p); else ctx.failures?.push(`seedInfra2: posto ${codigo}`) }
  const ags: Array<[string, string, string | undefined, any?]> = [
    ['Jorge Almeida', 'SEGURANCA', jorge, { matricula: 'SEG-001' }], ['Rita Cavalcanti', 'SEGURANCA', rita, { matricula: 'SEG-002' }], ['Wagner Souza', 'PORTEIRO', undefined, { terceirizado: true, empresa: 'Guardian Segurança Ltda' }],
    ['Cláudia Menezes', 'COORDENADOR_SALAS', undefined, { matricula: 'COO-010' }], ['Paulo Nogueira', 'COORDENADOR_PATIO', undefined, { matricula: 'COO-011' }], ['Silvia Ramos', 'COORDENADOR_ESTACIONAMENTO', undefined, { matricula: 'COO-012' }],
  ]
  S.agentes = []
  for (const [nome, cargo, userId, extra] of ags) { const a = await post('/seguranca-patrimonial/agentes', { nome, cargo, userId, ...extra }); if (a) S.agentes.push(a); else ctx.failures?.push(`seedInfra2: agente ${nome}`) }
  const [pPort, pPat, pEst, pSal] = S.postos, [aJ, aR, aW, aC, aP, aS] = S.agentes
  if (pPort && aJ && aR) {
    await post('/seguranca-patrimonial/escalas/lote', { de: ymd(-6), ate: ymd(6), postoId: pPort.id, agenteId: aJ.id, turno: 'MANHA', inicio: '06:00', fim: '14:00', diasSemana: [1, 2, 3, 4, 5] })
    await post('/seguranca-patrimonial/escalas/lote', { de: ymd(-6), ate: ymd(6), postoId: pPort.id, agenteId: aR.id, turno: 'TARDE', inicio: '14:00', fim: '22:00', diasSemana: [1, 2, 3, 4, 5] })
  }
  if (pPort && aW) await post('/seguranca-patrimonial/escalas/lote', { de: ymd(-6), ate: ymd(6), postoId: pPort.id, agenteId: aW.id, turno: 'PLANTAO_12X36', inicio: '19:00', fim: '07:00' })
  if (pPat && aP) await post('/seguranca-patrimonial/escalas/lote', { de: ymd(-6), ate: ymd(6), postoId: pPat.id, agenteId: aP.id, turno: 'INTEGRAL', inicio: '08:00', fim: '18:00', diasSemana: [1, 2, 3, 4, 5] })
  if (pEst && aS) await post('/seguranca-patrimonial/escalas/lote', { de: ymd(-6), ate: ymd(6), postoId: pEst.id, agenteId: aS.id, turno: 'INTEGRAL', inicio: '07:00', fim: '19:00', diasSemana: [1, 2, 3, 4, 5, 6] })
  if (pSal && aC) await post('/seguranca-patrimonial/escalas/lote', { de: ymd(-6), ate: ymd(6), postoId: pSal.id, agenteId: aC.id, turno: 'INTEGRAL', inicio: '07:30', fim: '17:30', diasSemana: [1, 2, 3, 4, 5] })
  S.cks = []
  for (const [nome, postoId, ordem] of [['Portão 1', pPort?.id, 1], ['Bloco A — corredor', pPat?.id, 2], ['Bloco B — 2º andar', pSal?.id, 3], ['Estacionamento A — fundos', pEst?.id, 4]] as any[]) { const c = await post('/seguranca-patrimonial/checkpoints', { nome, postoId, ordem }); if (c) S.cks.push(c) }
  if (aJ && S.cks.length) {
    const r = await post('/seguranca-patrimonial/rondas', { agenteId: aJ.id })
    if (r) { for (const c of S.cks) await post(`/seguranca-patrimonial/rondas/${r.id}/leitura`, { token: c.token, observacao: 'Sem alterações.' }); await post(`/seguranca-patrimonial/rondas/${r.id}/encerrar`, {}) }
  }
  await post('/seguranca-patrimonial/ocorrencias', { tipo: 'ACESSO_INDEVIDO', gravidade: 'MEDIA', descricao: 'Pessoa sem crachá tentou entrar pelo portão lateral; abordada e encaminhada à portaria.', local: 'Portão lateral', postoId: pPort?.id, agenteId: aJ?.id })
  await post('/seguranca-patrimonial/ocorrencias', { tipo: 'VEICULO', gravidade: 'ALTA', descricao: 'Veículo com alarme disparado no estacionamento A; proprietário localizado, sem avarias.', local: 'Estacionamento A', postoId: pEst?.id, agenteId: aS?.id })
  if (pPort && aJ && aR) await post('/seguranca-patrimonial/passagens', { postoId: pPort.id, deAgenteId: aJ.id, paraAgenteId: aR.id, resumo: 'Turno tranquilo. Entrega de materiais do laboratório às 10h30.', pendencias: 'Aguardar o técnico do elevador às 15h.', chaves: 'Chaves do almoxarifado com o vigilante.' })
  return S
}

export async function seedFeedback(api: Api, ctx: SeedCtx = {}) {
  const F = '/edu/feedback'
  const itens: Array<[string, string, string, string, string, string, string?]> = [
    ['SUGESTAO', 'PORTAL', 'MEDIA', 'Mostrar o horário das aulas no topo do portal do aluno', 'Seria útil ver a próxima aula assim que abro o portal, sem entrar em outro menu.', '/edu/portal-aluno'],
    ['SUGESTAO', 'FINANCEIRO', 'BAIXA', 'Permitir baixar o boleto em PDF direto da lista', 'Hoje preciso abrir cada cobrança para baixar o PDF do boleto.', '/edu/financeiro'],
    ['MELHORIA', 'SECRETARIA', 'ALTA', 'Filtro por curso na lista de protocolos', 'A lista de protocolos fica grande; um filtro por curso ajudaria a secretaria.', '/edu/secretaria'],
    ['BUG', 'ACADEMICO', 'CRITICA', 'Botão salvar notas não responde no celular', 'No celular o botão “Salvar” do diário não faz nada; no computador funciona.', '/edu/notas', 'Abrir o diário no celular; preencher notas; tocar em Salvar.'],
    ['ERRO', 'INFRAESTRUTURA', 'MEDIA', 'Mensagem de erro ao abrir QR da sala', 'Apareceu “QR inválido ou desativado” ao ler o QR da sala 101.', '/edu/infraestrutura'],
    ['DUVIDA', 'OUTRO', 'BAIXA', 'Como alterar minha foto de perfil?', 'Não encontrei onde trocar a foto do meu perfil.', '/configuracoes'],
  ]
  const out: any[] = []
  for (const [tipo, categoria, prioridade, titulo, descricao, rota, passos] of itens) {
    const r = await api('POST', `${F}/itens`, { tipo, categoria, prioridade, titulo, descricao, passosReproduzir: passos, contexto: { rota, tela: titulo.slice(0, 40), versaoApp: '1.0.0', navegador: 'Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile Safari/537.36', viewport: '390x844', logsConsole: tipo === 'BUG' ? '[10:01:02] ERROR TypeError: Cannot read properties of undefined (reading "map")' : undefined }, capturas: tipo === 'BUG' ? [{ arquivoNome: 'captura.png', mime: 'image/png', dataUrl: FOTO_DEMO }] : undefined })
    if (r) out.push(r); else ctx.failures?.push(`seedFeedback: ${titulo}`)
  }
  if (out[3]) { await api('POST', `${F}/itens/${out[3].id}/status`, { status: 'EM_ANDAMENTO', resposta: 'Reproduzimos o problema no iOS e já estamos corrigindo.' }) }
  if (out[2]) await api('POST', `${F}/itens/${out[2].id}/status`, { status: 'PLANEJADO', resposta: 'Entra no próximo ciclo de melhorias da secretaria.' })
  return out
}

// Execução isolada
if (process.argv[1] && /seeds[\\/]infra2\.ts$/.test(process.argv[1])) {
  const API = process.env.API_URL || 'http://localhost:3000/api'
  ;(async () => {
    const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@ravel.edu.br', password: 'Ravel@2026' }) }).then((r) => r.json())
    const api: Api = async (method, path, body) => {
      const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
      const t = await r.text(); try { return r.ok ? JSON.parse(t || 'null') : (console.log('falhou', method, path, t.slice(0, 160)), null) } catch { return null }
    }
    const failures: string[] = []
    await seedInfra2(api, { failures }); await seedFeedback(api, { failures })
    console.log(failures.length ? failures : 'seed infra2/feedback ok')
  })()
}
