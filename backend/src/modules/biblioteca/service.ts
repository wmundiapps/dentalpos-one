import { prisma } from '../../lib/prisma'
import { audit, notify } from '../core/notify'
import { scheduleReminder, completeReminders, cancelReminders } from '../core/reminders'
import {
  POLITICAS_PADRAO, Perfil, PoliticaCirc, calcularMulta, distribuirFila, novaDataRenovacao, podeRenovar,
  somarDias, verificarElegibilidade, round2,
} from './logic'

const MOD = 'biblioteca'
const DAY = 86_400_000
const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status })

// ---------- configuração e políticas ----------
export async function getConfig(tenantId: string) {
  return prisma.bibConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

export async function getPolitica(tenantId: string, perfil: Perfil): Promise<PoliticaCirc> {
  const p = await prisma.bibPolitica.findFirst({ where: { tenantId, perfil, ativo: true } })
  if (!p) return POLITICAS_PADRAO[perfil]
  return {
    prazoDias: p.prazoDias, limiteEmprestimos: p.limiteEmprestimos, maxRenovacoes: p.maxRenovacoes, diasRenovacao: p.diasRenovacao,
    multaDia: p.multaDia, multaMaxima: p.multaMaxima, limiteReservas: p.limiteReservas, diasRetiradaReserva: p.diasRetiradaReserva,
    bloqueioDiasPorAtraso: p.bloqueioDiasPorAtraso,
  }
}

// Gera N tombos sequenciais de forma atômica (incremento no BibConfig).
export async function gerarTombos(tenantId: string, n: number): Promise<string[]> {
  await getConfig(tenantId)
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const cfg = await prisma.bibConfig.update({ where: { tenantId }, data: { proximoTombo: { increment: n } } })
    const inicio = cfg.proximoTombo - n
    const tombos = Array.from({ length: n }, (_, i) => `${cfg.prefixoTombo || ''}${String(inicio + i).padStart(6, '0')}`)
    const colide = await prisma.bibExemplar.count({ where: { tenantId, tombo: { in: tombos } } })
    if (!colide) return tombos
  }
  throw httpErr(409, 'Não foi possível gerar tombos únicos; ajuste o contador em /config.')
}

// ---------- leitores ----------
export async function leitorDoUsuario(tenantId: string, user: { id: string; role: string; studentId?: string }) {
  if (user.studentId) return garantirLeitorAluno(tenantId, user.studentId)
  const u = await prisma.user.findFirst({ where: { id: user.id, tenantId } })
  const perfil: Perfil = String(user.role).toUpperCase() === 'TEACHER' ? 'PROFESSOR' : 'FUNCIONARIO'
  const existente = await prisma.bibLeitor.findFirst({ where: { tenantId, userId: user.id } })
  if (existente) return existente
  return prisma.bibLeitor.create({
    data: { tenantId, perfil, userId: user.id, nome: u ? `${u.firstName} ${u.lastName}`.trim() : 'Usuário', email: u?.email, telefone: u?.phone },
  })
}

export async function garantirLeitorAluno(tenantId: string, studentId: string) {
  const existente = await prisma.bibLeitor.findFirst({ where: { tenantId, studentId } })
  if (existente) return existente
  const s = await prisma.student.findFirst({ where: { id: studentId, tenantId } })
  if (!s) throw httpErr(404, 'Aluno não encontrado.')
  return prisma.bibLeitor.create({ data: { tenantId, perfil: 'ALUNO', studentId, nome: s.nomeCompleto, documento: s.cpf ?? s.ra } })
}

export async function garantirLeitorUsuario(tenantId: string, userId: string, perfil?: Perfil) {
  const existente = await prisma.bibLeitor.findFirst({ where: { tenantId, userId } })
  if (existente) return existente
  const u = await prisma.user.findFirst({ where: { id: userId, tenantId } })
  if (!u) throw httpErr(404, 'Usuário não encontrado.')
  const p: Perfil = perfil ?? (u.role === 'TEACHER' ? 'PROFESSOR' : 'FUNCIONARIO')
  return prisma.bibLeitor.create({ data: { tenantId, perfil: p, userId, nome: `${u.firstName} ${u.lastName}`.trim(), email: u.email, telefone: u.phone } })
}

export async function notificarLeitor(
  leitor: { tenantId: string; studentId?: string | null; userId?: string | null; email?: string | null },
  assunto: string,
  mensagem: string,
  ref?: { refType: string; refId: string },
  templateKey?: string,
) {
  if (!leitor.studentId && !leitor.userId && !leitor.email) return null
  return notify({
    tenantId: leitor.tenantId, canal: leitor.studentId || leitor.userId ? 'IN_APP' : 'EMAIL', studentId: leitor.studentId ?? undefined,
    userId: leitor.userId ?? undefined, destino: leitor.email ?? undefined, assunto, mensagem, templateKey, refType: ref?.refType, refId: ref?.refId,
  })
}

function assignee(l: { studentId?: string | null; userId?: string | null }) {
  if (l.studentId) return { assigneeStudentId: l.studentId }
  if (l.userId) return { assigneeUserId: l.userId }
  return { assigneeRole: 'LIBRARIAN' }
}

// ---------- situação do leitor ----------
export async function situacaoLeitor(tenantId: string, leitor: { id: string; perfil: Perfil; ativo: boolean; bloqueadoAte: Date | null; validadeAte: Date | null; studentId?: string | null }) {
  const [politica, cfg, ativos, multas] = await Promise.all([
    getPolitica(tenantId, leitor.perfil),
    getConfig(tenantId),
    prisma.bibEmprestimo.findMany({ where: { tenantId, leitorId: leitor.id, status: 'ATIVO' }, select: { id: true, dataPrevista: true } }),
    prisma.bibMulta.aggregate({ where: { tenantId, leitorId: leitor.id, status: { in: ['ABERTA', 'EM_COBRANCA'] } }, _sum: { valor: true } }),
  ])
  const agora = new Date()
  const atrasados = ativos.filter((e) => diasAtrasoSimples(e.dataPrevista, agora) > 0).length
  const multasAbertasValor = round2(multas._sum.valor ?? 0)
  let motivos = verificarElegibilidade({
    politica, leitor, emprestimosAtivos: ativos.length, atrasados, multasAbertasValor, valorMaxMultaAberta: cfg.valorMaxMultaAberta, agora,
  })
  if (leitor.studentId) {
    const s = await prisma.student.findFirst({ where: { id: leitor.studentId, tenantId }, select: { status: true } })
    if (s && s.status !== 'ATIVO') motivos = [...motivos, `Situação acadêmica do aluno: ${s.status}.`]
  }
  return { politica, cfg, emprestimosAtivos: ativos.length, atrasados, multasAbertasValor, motivosBloqueio: motivos, podeEmprestar: motivos.length === 0 }
}

function diasAtrasoSimples(prevista: Date, agora: Date) {
  return calcularMulta(prevista, agora, { multaDia: 0 }).diasAtraso
}

// ---------- fila de reservas ----------
// Atribui exemplares livres da obra às reservas AGUARDANDO (FIFO), avisando o leitor.
export async function atribuirReservas(tenantId: string, obraId: string) {
  const [aguardando, livres] = await Promise.all([
    prisma.bibReserva.findMany({ where: { tenantId, obraId, status: 'AGUARDANDO' }, include: { leitor: true }, orderBy: { createdAt: 'asc' } }),
    prisma.bibExemplar.findMany({ where: { tenantId, obraId, status: 'DISPONIVEL', apenasConsulta: false }, orderBy: { createdAt: 'asc' } }),
  ])
  if (!aguardando.length || !livres.length) return 0
  const pares = distribuirFila(aguardando, livres.map((l) => l.id))
  const obra = await prisma.bibObra.findFirst({ where: { id: obraId, tenantId } })
  let n = 0
  for (const par of pares) {
    const reserva = aguardando.find((r) => r.id === par.reservaId)!
    const pol = await getPolitica(tenantId, reserva.leitor.perfil as Perfil)
    const agora = new Date()
    const expira = new Date(agora.getTime() + pol.diasRetiradaReserva * DAY)
    const claim = await prisma.bibExemplar.updateMany({ where: { id: par.exemplarId, tenantId, status: 'DISPONIVEL' }, data: { status: 'RESERVADO' } })
    if (claim.count === 0) continue
    await prisma.bibReserva.update({ where: { id: reserva.id }, data: { status: 'DISPONIVEL', exemplarId: par.exemplarId, disponivelEm: agora, expiraEm: expira } })
    await notificarLeitor(
      { ...reserva.leitor, tenantId }, 'Reserva disponível para retirada',
      `A obra "${obra?.titulo ?? ''}" que você reservou está disponível. Retire na biblioteca até ${expira.toLocaleDateString('pt-BR')}.`,
      { refType: 'BibReserva', refId: reserva.id }, 'BIB_RESERVA_DISPONIVEL',
    )
    await scheduleReminder({
      tenantId, modulo: MOD, titulo: `Reserva a expirar: ${obra?.titulo ?? ''}`, descricao: 'Retire a obra reservada antes que a reserva expire.',
      dueAt: expira, remindAt: new Date(Math.max(agora.getTime(), expira.getTime() - DAY)), refType: 'BibReserva', refId: reserva.id,
      severity: 'ATENCAO', dedupeKey: `bib-reserva:${reserva.id}`, ...assignee(reserva.leitor),
    })
    n++
  }
  return n
}

// ---------- empréstimo ----------
export async function localizarExemplar(tenantId: string, ref: { exemplarId?: string; tombo?: string }) {
  const where: any = { tenantId }
  if (ref.exemplarId) where.id = ref.exemplarId
  else if (ref.tombo) where.OR = [{ tombo: ref.tombo }, { codigoBarras: ref.tombo }]
  else throw httpErr(400, 'Informe exemplarId ou tombo/código de barras.')
  const ex = await prisma.bibExemplar.findFirst({ where, include: { obra: true } })
  if (!ex) throw httpErr(404, 'Exemplar não encontrado.')
  return ex
}

export async function emprestar(p: { tenantId: string; leitorId: string; exemplarId?: string; tombo?: string; operadorId?: string; forcar?: boolean; observacoes?: string }) {
  const { tenantId } = p
  const leitor = await prisma.bibLeitor.findFirst({ where: { id: p.leitorId, tenantId } })
  if (!leitor) throw httpErr(404, 'Leitor não encontrado.')
  let ex = await localizarExemplar(tenantId, p)
  if (!ex.obra.ativo) throw httpErr(409, 'Obra inativa no catálogo.')
  if (ex.apenasConsulta) throw httpErr(409, 'Exemplar de consulta local: não pode ser emprestado.')

  const sit = await situacaoLeitor(tenantId, leitor as any)
  if (!sit.podeEmprestar && !p.forcar) throw Object.assign(new Error(`Empréstimo bloqueado: ${sit.motivosBloqueio.join(' ')}`), { status: 409, motivos: sit.motivosBloqueio })

  // Reserva do próprio leitor para este exemplar?
  let reservaDoLeitor = await prisma.bibReserva.findFirst({ where: { tenantId, leitorId: leitor.id, obraId: ex.obraId, status: 'DISPONIVEL', exemplarId: ex.id } })
  if (ex.status === 'DISPONIVEL') {
    await atribuirReservas(tenantId, ex.obraId)
    ex = await localizarExemplar(tenantId, { exemplarId: ex.id })
    // a fila pode ter acabado de separar este exemplar justamente para o leitor que está retirando
    if (!reservaDoLeitor && ex.status === 'RESERVADO')
      reservaDoLeitor = await prisma.bibReserva.findFirst({ where: { tenantId, leitorId: leitor.id, obraId: ex.obraId, status: 'DISPONIVEL', exemplarId: ex.id } })
  }
  if (ex.status === 'RESERVADO' && !reservaDoLeitor) {
    // exemplar separado para outro leitor — mas se este leitor tem reserva DISPONIVEL de outro exemplar da mesma obra, não troca
    throw httpErr(409, 'Exemplar reservado para outro leitor (fila de reservas).')
  }
  if (ex.status !== 'DISPONIVEL' && ex.status !== 'RESERVADO') throw httpErr(409, `Exemplar indisponível (${ex.status}).`)

  // Leitor que já tem a mesma obra emprestada
  const dup = await prisma.bibEmprestimo.count({ where: { tenantId, leitorId: leitor.id, obraId: ex.obraId, status: 'ATIVO' } })
  if (dup) throw httpErr(409, 'O leitor já está com um exemplar desta obra.')

  const cfg = sit.cfg
  const prazo = sit.politica.prazoDias
  const agora = new Date()
  const prevista = somarDias(agora, prazo, { somenteUteis: cfg.considerarDiasUteis, feriados: (cfg.feriados as string[] | null) ?? [] })

  const emp = await prisma.$transaction(async (tx) => {
    const claim = await tx.bibExemplar.updateMany({ where: { id: ex.id, tenantId, status: ex.status }, data: { status: 'EMPRESTADO' } })
    if (claim.count === 0) throw httpErr(409, 'Exemplar acabou de ser emprestado por outra operação.')
    if (reservaDoLeitor) await tx.bibReserva.update({ where: { id: reservaDoLeitor.id }, data: { status: 'ATENDIDA', concluidaEm: agora } })
    else {
      // se o leitor tinha reserva AGUARDANDO da obra e pegou um livre, atende a reserva
      const r = await tx.bibReserva.findFirst({ where: { tenantId, leitorId: leitor.id, obraId: ex.obraId, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } })
      if (r) {
        if (r.exemplarId && r.exemplarId !== ex.id) await tx.bibExemplar.updateMany({ where: { id: r.exemplarId, tenantId, status: 'RESERVADO' }, data: { status: 'DISPONIVEL' } })
        await tx.bibReserva.update({ where: { id: r.id }, data: { status: 'ATENDIDA', concluidaEm: agora } })
        reservaDoLeitor = r as any
      }
    }
    return tx.bibEmprestimo.create({
      data: { tenantId, leitorId: leitor.id, exemplarId: ex.id, obraId: ex.obraId, dataEmprestimo: agora, dataPrevista: prevista, emprestadoPorId: p.operadorId, observacoes: p.observacoes },
    })
  })
  if (reservaDoLeitor) {
    await completeReminders({ tenantId, refType: 'BibReserva', refId: reservaDoLeitor.id })
    await atribuirReservas(tenantId, ex.obraId)
  }
  await agendarLembreteDevolucao(tenantId, leitor, emp.id, ex.obra.titulo, prevista)
  await notificarLeitor(
    { ...leitor, tenantId }, 'Empréstimo realizado',
    `"${ex.obra.titulo}" (tombo ${ex.tombo}) emprestado. Devolução até ${prevista.toLocaleDateString('pt-BR')}.`,
    { refType: 'BibEmprestimo', refId: emp.id }, 'BIB_EMPRESTIMO',
  )
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'EMPRESTAR', refType: 'BibEmprestimo', refId: emp.id, detalhes: { tombo: ex.tombo, leitorId: leitor.id, forcado: !!p.forcar } })
  return emp
}

async function agendarLembreteDevolucao(tenantId: string, leitor: { studentId?: string | null; userId?: string | null }, empId: string, titulo: string, prevista: Date) {
  await scheduleReminder({
    tenantId, modulo: MOD, titulo: `Devolver "${titulo}"`, descricao: 'Devolva ou renove o empréstimo para evitar multa.',
    dueAt: prevista, remindAt: new Date(Math.max(Date.now(), prevista.getTime() - 2 * DAY)), refType: 'BibEmprestimo', refId: empId,
    severity: 'INFO', dedupeKey: `bib-devolucao:${empId}`, ...assignee(leitor),
  })
}

export async function renovar(p: { tenantId: string; emprestimoId: string; operadorId?: string; leitorId?: string }) {
  const { tenantId } = p
  const emp = await prisma.bibEmprestimo.findFirst({ where: { id: p.emprestimoId, tenantId, ...(p.leitorId ? { leitorId: p.leitorId } : {}) }, include: { leitor: true, exemplar: { include: { obra: true } } } })
  if (!emp) throw httpErr(404, 'Empréstimo não encontrado.')
  const sit = await situacaoLeitor(tenantId, emp.leitor as any)
  const reservas = await prisma.bibReserva.count({ where: { tenantId, obraId: emp.obraId, status: { in: ['AGUARDANDO'] } } })
  const bloqueadoPorOutros = sit.multasAbertasValor > sit.cfg.valorMaxMultaAberta || (!!emp.leitor.bloqueadoAte && emp.leitor.bloqueadoAte > new Date())
  const chk = podeRenovar({ renovacoes: emp.renovacoes, maxRenovacoes: sit.politica.maxRenovacoes, status: emp.status, prevista: emp.dataPrevista, reservasAguardando: reservas, leitorBloqueado: bloqueadoPorOutros })
  if (!chk.ok) throw httpErr(409, chk.motivo || 'Renovação não permitida.')
  const dias = sit.politica.diasRenovacao ?? sit.politica.prazoDias
  const nova = novaDataRenovacao(emp.dataPrevista, new Date(), dias, { somenteUteis: sit.cfg.considerarDiasUteis, feriados: (sit.cfg.feriados as string[] | null) ?? [] })
  const upd = await prisma.bibEmprestimo.update({ where: { id: emp.id }, data: { dataPrevista: nova, renovacoes: { increment: 1 }, diasAtraso: 0, multaPrevista: 0 } })
  await agendarLembreteDevolucao(tenantId, emp.leitor, emp.id, emp.exemplar.obra.titulo, nova)
  await notificarLeitor({ ...emp.leitor, tenantId }, 'Empréstimo renovado', `"${emp.exemplar.obra.titulo}" renovado até ${nova.toLocaleDateString('pt-BR')}.`, { refType: 'BibEmprestimo', refId: emp.id }, 'BIB_RENOVACAO')
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'RENOVAR', refType: 'BibEmprestimo', refId: emp.id, detalhes: { novaData: nova } })
  return upd
}

export async function devolver(p: { tenantId: string; exemplarId?: string; tombo?: string; operadorId?: string; danificado?: boolean; valorDano?: number; observacoes?: string; dataDevolucao?: Date }) {
  const { tenantId } = p
  const ex = await localizarExemplar(tenantId, p)
  const emp = await prisma.bibEmprestimo.findFirst({ where: { tenantId, exemplarId: ex.id, status: 'ATIVO' }, include: { leitor: true } })
  if (!emp) throw httpErr(409, 'Este exemplar não possui empréstimo ativo.')
  const pol = await getPolitica(tenantId, emp.leitor.perfil as Perfil)
  const cfg = await getConfig(tenantId)
  const quando = p.dataDevolucao ?? new Date()
  const calc = calcularMulta(emp.dataPrevista, quando, pol, { tolerancia: cfg.diasTolerancia, somenteUteis: cfg.considerarDiasUteis, feriados: (cfg.feriados as string[] | null) ?? [] })

  const resultado = await prisma.$transaction(async (tx) => {
    // Reivindica a devolução: duas devoluções simultâneas do mesmo exemplar não geram multa em duplicidade.
    const claim = await tx.bibEmprestimo.updateMany({ where: { id: emp.id, status: 'ATIVO' }, data: { status: 'DEVOLVIDO' } })
    if (claim.count === 0) throw httpErr(409, 'Este exemplar não possui empréstimo ativo.')
    await tx.bibEmprestimo.update({
      where: { id: emp.id },
      data: { status: 'DEVOLVIDO', dataDevolucao: quando, diasAtraso: calc.diasAtraso, multaPrevista: calc.valor, devolvidoPorId: p.operadorId, observacoes: p.observacoes ?? emp.observacoes },
    })
    await tx.bibExemplar.update({ where: { id: ex.id }, data: { status: p.danificado ? 'EM_REPARO' : 'DISPONIVEL' } })
    const multas: any[] = []
    if (calc.valor > 0)
      multas.push(await tx.bibMulta.create({ data: { tenantId, leitorId: emp.leitorId, emprestimoId: emp.id, tipo: 'ATRASO', valor: calc.valor, diasAtraso: calc.diasAtraso, descricao: `Atraso de ${calc.diasAtraso} dia(s) — "${ex.obra.titulo}"` } }))
    if (p.danificado && (p.valorDano ?? 0) > 0)
      multas.push(await tx.bibMulta.create({ data: { tenantId, leitorId: emp.leitorId, emprestimoId: emp.id, tipo: 'DANO', valor: round2(p.valorDano!), descricao: `Dano ao exemplar ${ex.tombo} — "${ex.obra.titulo}"` } }))
    if (calc.diasAtraso > 0 && pol.bloqueioDiasPorAtraso > 0) {
      const ate = new Date(quando.getTime() + calc.diasAtraso * pol.bloqueioDiasPorAtraso * DAY)
      if (!emp.leitor.bloqueadoAte || emp.leitor.bloqueadoAte < ate)
        await tx.bibLeitor.update({ where: { id: emp.leitorId }, data: { bloqueadoAte: ate, motivoBloqueio: `Atraso de ${calc.diasAtraso} dia(s)` } })
    }
    return multas
  })
  await completeReminders({ tenantId, refType: 'BibEmprestimo', refId: emp.id })
  if (resultado.length) {
    const total = resultado.reduce((s, m) => s + m.valor, 0)
    await notificarLeitor({ ...emp.leitor, tenantId }, 'Multa registrada', `Devolução de "${ex.obra.titulo}" registrada com multa de R$ ${total.toFixed(2)}. Regularize na biblioteca.`, { refType: 'BibEmprestimo', refId: emp.id }, 'BIB_MULTA')
  } else {
    await notificarLeitor({ ...emp.leitor, tenantId }, 'Devolução registrada', `Devolução de "${ex.obra.titulo}" registrada. Obrigado!`, { refType: 'BibEmprestimo', refId: emp.id }, 'BIB_DEVOLUCAO')
  }
  if (!p.danificado) await atribuirReservas(tenantId, ex.obraId)
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'DEVOLVER', refType: 'BibEmprestimo', refId: emp.id, detalhes: { tombo: ex.tombo, diasAtraso: calc.diasAtraso, multa: calc.valor } })
  return { emprestimoId: emp.id, diasAtraso: calc.diasAtraso, multaAtraso: calc.valor, multaLimitada: calc.limitada, multas: resultado }
}

export async function registrarPerda(p: { tenantId: string; emprestimoId: string; valor?: number; operadorId?: string }) {
  const emp = await prisma.bibEmprestimo.findFirst({ where: { id: p.emprestimoId, tenantId: p.tenantId, status: 'ATIVO' }, include: { exemplar: { include: { obra: true } }, leitor: true } })
  if (!emp) throw httpErr(404, 'Empréstimo ativo não encontrado.')
  const valor = round2(p.valor ?? emp.exemplar.valor ?? 0)
  await prisma.$transaction([
    prisma.bibEmprestimo.update({ where: { id: emp.id }, data: { status: 'PERDIDO', dataDevolucao: new Date(), devolvidoPorId: p.operadorId } }),
    prisma.bibExemplar.update({ where: { id: emp.exemplarId }, data: { status: 'EXTRAVIADO', baixaMotivo: 'EXTRAVIO', baixaEm: new Date(), baixaPorId: p.operadorId } }),
    ...(valor > 0 ? [prisma.bibMulta.create({ data: { tenantId: p.tenantId, leitorId: emp.leitorId, emprestimoId: emp.id, tipo: 'EXTRAVIO', valor, descricao: `Extravio de "${emp.exemplar.obra.titulo}" (tombo ${emp.exemplar.tombo})` } })] : []),
  ])
  await completeReminders({ tenantId: p.tenantId, refType: 'BibEmprestimo', refId: emp.id })
  await notificarLeitor({ ...emp.leitor, tenantId: p.tenantId }, 'Extravio registrado', `Extravio de "${emp.exemplar.obra.titulo}" registrado${valor ? ` — valor a ressarcir: R$ ${valor.toFixed(2)}` : ''}.`, { refType: 'BibEmprestimo', refId: emp.id })
  await audit({ tenantId: p.tenantId, userId: p.operadorId, modulo: MOD, acao: 'EXTRAVIO', refType: 'BibEmprestimo', refId: emp.id, detalhes: { valor } })
  return { ok: true, valor }
}

// ---------- reservas ----------
export async function reservar(p: { tenantId: string; leitorId: string; obraId: string; operadorId?: string }) {
  const { tenantId } = p
  const [leitor, obra] = await Promise.all([
    prisma.bibLeitor.findFirst({ where: { id: p.leitorId, tenantId } }),
    prisma.bibObra.findFirst({ where: { id: p.obraId, tenantId, ativo: true } }),
  ])
  if (!leitor) throw httpErr(404, 'Leitor não encontrado.')
  if (!obra) throw httpErr(404, 'Obra não encontrada.')
  const sit = await situacaoLeitor(tenantId, leitor as any)
  const bloq = sit.motivosBloqueio.filter((m) => !m.startsWith('Limite de'))
  if (bloq.length) throw httpErr(409, `Reserva bloqueada: ${bloq.join(' ')}`)
  const ativas = await prisma.bibReserva.count({ where: { tenantId, leitorId: leitor.id, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } })
  if (ativas >= sit.politica.limiteReservas) throw httpErr(409, `Limite de ${sit.politica.limiteReservas} reserva(s) atingido.`)
  if (await prisma.bibReserva.count({ where: { tenantId, leitorId: leitor.id, obraId: obra.id, status: { in: ['AGUARDANDO', 'DISPONIVEL'] } } })) throw httpErr(409, 'Você já possui reserva ativa desta obra.')
  if (await prisma.bibEmprestimo.count({ where: { tenantId, leitorId: leitor.id, obraId: obra.id, status: 'ATIVO' } })) throw httpErr(409, 'Você já está com um exemplar desta obra.')
  const emprestaveis = await prisma.bibExemplar.count({ where: { tenantId, obraId: obra.id, apenasConsulta: false, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] } } })
  if (!emprestaveis) throw httpErr(409, 'Não há exemplares emprestáveis desta obra.')
  const r = await prisma.bibReserva.create({ data: { tenantId, leitorId: leitor.id, obraId: obra.id } })
  await atribuirReservas(tenantId, obra.id)
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: 'RESERVAR', refType: 'BibReserva', refId: r.id })
  return prisma.bibReserva.findFirstOrThrow({ where: { id: r.id } })
}

export async function cancelarReserva(tenantId: string, reservaId: string, userId?: string, leitorId?: string) {
  const r = await prisma.bibReserva.findFirst({ where: { id: reservaId, tenantId, ...(leitorId ? { leitorId } : {}) } })
  if (!r) throw httpErr(404, 'Reserva não encontrada.')
  if (!['AGUARDANDO', 'DISPONIVEL'].includes(r.status)) throw httpErr(409, 'Reserva já encerrada.')
  await prisma.bibReserva.update({ where: { id: r.id }, data: { status: 'CANCELADA', concluidaEm: new Date() } })
  if (r.exemplarId) await prisma.bibExemplar.updateMany({ where: { id: r.exemplarId, tenantId, status: 'RESERVADO' }, data: { status: 'DISPONIVEL' } })
  await cancelReminders({ tenantId, refType: 'BibReserva', refId: r.id })
  await atribuirReservas(tenantId, r.obraId)
  await audit({ tenantId, userId, modulo: MOD, acao: 'CANCELAR_RESERVA', refType: 'BibReserva', refId: r.id })
  return { ok: true }
}

// ---------- multas ----------
export async function baixarMulta(p: {
  tenantId: string; multaId: string; operadorId?: string; acao: 'PAGAR' | 'ISENTAR' | 'CANCELAR' | 'COBRAR'; forma?: string; justificativa?: string; vencimento?: Date
}) {
  const { tenantId } = p
  const m = await prisma.bibMulta.findFirst({ where: { id: p.multaId, tenantId }, include: { leitor: true } })
  if (!m) throw httpErr(404, 'Multa não encontrada.')
  if (!['ABERTA', 'EM_COBRANCA'].includes(m.status)) throw httpErr(409, `Multa já está ${m.status}.`)
  const base = { baixaPorId: p.operadorId }
  let upd
  if (p.acao === 'PAGAR') upd = await prisma.bibMulta.update({ where: { id: m.id }, data: { ...base, status: 'PAGA', pagaEm: new Date(), formaPagamento: p.forma ?? 'BALCAO' } })
  else if (p.acao === 'ISENTAR' || p.acao === 'CANCELAR') {
    if (!p.justificativa || p.justificativa.trim().length < 5) throw httpErr(400, 'Justificativa obrigatória (mín. 5 caracteres).')
    upd = await prisma.bibMulta.update({ where: { id: m.id }, data: { ...base, status: p.acao === 'ISENTAR' ? 'ISENTA' : 'CANCELADA', justificativa: p.justificativa } })
  } else {
    if (m.status === 'EM_COBRANCA') throw httpErr(409, 'Multa já enviada para cobrança.')
    if (!m.leitor.studentId) throw httpErr(409, 'Cobrança via financeiro só está disponível para leitores que são alunos.')
    const venc = p.vencimento ?? new Date(Date.now() + 7 * DAY)
    const ar = await prisma.accountReceivable.create({ data: { tenantId, studentId: m.leitor.studentId, descricao: `Biblioteca — ${m.descricao ?? 'multa'}`, valor: m.valor, dataVencimento: venc } })
    upd = await prisma.bibMulta.update({ where: { id: m.id }, data: { ...base, status: 'EM_COBRANCA', receivableId: ar.id } })
  }
  if (upd.status !== 'EM_COBRANCA') {
    // sem multas abertas e sem atrasos: libera suspensão por atraso
    const restantes = await prisma.bibMulta.count({ where: { tenantId, leitorId: m.leitorId, status: { in: ['ABERTA', 'EM_COBRANCA'] } } })
    if (!restantes && m.leitor.motivoBloqueio?.startsWith('Atraso')) await prisma.bibLeitor.update({ where: { id: m.leitorId }, data: { bloqueadoAte: null, motivoBloqueio: null } })
  }
  await audit({ tenantId, userId: p.operadorId, modulo: MOD, acao: `MULTA_${p.acao}`, refType: 'BibMulta', refId: m.id, detalhes: { valor: m.valor, justificativa: p.justificativa } })
  return upd
}

// ---------- jobs ----------
export async function jobAtrasos() {
  const agora = new Date()
  const ativos = await prisma.bibEmprestimo.findMany({
    where: { status: 'ATIVO', dataPrevista: { lt: agora } }, include: { leitor: true, exemplar: { include: { obra: true } } }, take: 3000, orderBy: { dataPrevista: 'asc' },
  })
  const cfgs = new Map<string, Awaited<ReturnType<typeof getConfig>>>()
  const pols = new Map<string, PoliticaCirc>()
  let atualizados = 0
  let lembretes = 0
  for (const e of ativos) {
    if (!cfgs.has(e.tenantId)) cfgs.set(e.tenantId, await getConfig(e.tenantId))
    const cfg = cfgs.get(e.tenantId)!
    const k = `${e.tenantId}:${e.leitor.perfil}`
    if (!pols.has(k)) pols.set(k, await getPolitica(e.tenantId, e.leitor.perfil as Perfil))
    const calc = calcularMulta(e.dataPrevista, agora, pols.get(k)!, { tolerancia: cfg.diasTolerancia, somenteUteis: cfg.considerarDiasUteis, feriados: (cfg.feriados as string[] | null) ?? [] })
    if (calc.diasAtraso <= 0) continue
    if (calc.diasAtraso !== e.diasAtraso || calc.valor !== e.multaPrevista) {
      await prisma.bibEmprestimo.update({ where: { id: e.id }, data: { diasAtraso: calc.diasAtraso, multaPrevista: calc.valor } })
      atualizados++
    }
    await scheduleReminder({
      tenantId: e.tenantId, modulo: MOD, titulo: `Atraso na devolução: "${e.exemplar.obra.titulo}"`, descricao: `${calc.diasAtraso} dia(s) de atraso — multa acumulada R$ ${calc.valor.toFixed(2)}.`,
      dueAt: e.dataPrevista, remindAt: agora, recorrenciaDias: 3, severity: 'CRITICO', refType: 'BibEmprestimo', refId: e.id, dedupeKey: `bib-atraso:${e.id}`, ...assignee(e.leitor),
    })
    lembretes++
    if (calc.diasAtraso >= 30)
      await scheduleReminder({
        tenantId: e.tenantId, modulo: MOD, titulo: `Atraso crítico (${calc.diasAtraso} dias): ${e.leitor.nome}`, descricao: `Obra "${e.exemplar.obra.titulo}", tombo ${e.exemplar.tombo}. Avaliar cobrança/registro de extravio.`,
        dueAt: agora, remindAt: agora, severity: 'CRITICO', assigneeRole: 'LIBRARIAN', refType: 'BibEmprestimo', refId: e.id, dedupeKey: `bib-atraso-bib:${e.id}`,
      })
  }
  return { atrasados: ativos.length, atualizados, lembretes }
}

export async function jobReservasExpiradas() {
  const agora = new Date()
  const exp = await prisma.bibReserva.findMany({ where: { status: 'DISPONIVEL', expiraEm: { lt: agora } }, include: { leitor: true, obra: true }, take: 1000 })
  const obras = new Set<string>()
  for (const r of exp) {
    await prisma.bibReserva.update({ where: { id: r.id }, data: { status: 'EXPIRADA', concluidaEm: agora } })
    if (r.exemplarId) await prisma.bibExemplar.updateMany({ where: { id: r.exemplarId, status: 'RESERVADO' }, data: { status: 'DISPONIVEL' } })
    await cancelReminders({ tenantId: r.tenantId, refType: 'BibReserva', refId: r.id })
    await notificarLeitor({ ...r.leitor, tenantId: r.tenantId }, 'Reserva expirada', `Sua reserva de "${r.obra.titulo}" expirou por não retirada no prazo.`, { refType: 'BibReserva', refId: r.id })
    obras.add(`${r.tenantId}|${r.obraId}`)
  }
  let reatribuidas = 0
  for (const k of obras) {
    const [t, o] = k.split('|')
    reatribuidas += await atribuirReservas(t, o)
  }
  return { expiradas: exp.length, reatribuidas }
}

export async function jobMultasCobranca() {
  const em = await prisma.bibMulta.findMany({ where: { status: 'EM_COBRANCA', receivableId: { not: null } }, take: 1000 })
  let pagas = 0
  for (const m of em) {
    const ar = await prisma.accountReceivable.findFirst({ where: { id: m.receivableId!, tenantId: m.tenantId }, select: { status: true, dataPagamento: true } })
    if (ar?.status === 'PAGO') {
      await prisma.bibMulta.update({ where: { id: m.id }, data: { status: 'PAGA', pagaEm: ar.dataPagamento ?? new Date(), formaPagamento: 'FINANCEIRO' } })
      pagas++
    }
  }
  return { verificadas: em.length, pagas }
}

export async function jobVigenciaVirtual() {
  const agora = new Date()
  const em30 = new Date(agora.getTime() + 30 * DAY)
  const rs = await prisma.bibRecursoVirtual.findMany({ where: { ativo: true, vigenciaFim: { not: null, lte: em30 } }, take: 500 })
  let expirados = 0
  for (const r of rs) {
    const vencido = r.vigenciaFim! < agora
    await scheduleReminder({
      tenantId: r.tenantId, modulo: MOD, titulo: `${vencido ? 'Assinatura vencida' : 'Assinatura a vencer'}: ${r.titulo}`, descricao: `Recurso virtual (${r.provedor ?? 'sem provedor'}) — renovar a contratação.`,
      dueAt: r.vigenciaFim!, antecedenciaDias: 30, severity: vencido ? 'CRITICO' : 'ATENCAO', assigneeRole: 'LIBRARIAN', refType: 'BibRecursoVirtual', refId: r.id, dedupeKey: `bib-vigencia:${r.id}`,
    })
    if (vencido) { await prisma.bibRecursoVirtual.update({ where: { id: r.id }, data: { ativo: false } }); expirados++ }
  }
  return { avaliados: rs.length, expirados }
}
