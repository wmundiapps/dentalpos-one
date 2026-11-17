import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { contatosDeAlunos, prefsPorContato } from '../comunicacao/campanhas'
import { formatDateBR, podeEnviar, renderTemplate } from '../comunicacao/pure'

const db = prisma as any
const DIA = 86_400_000

export const TIPOS = ['INATIVIDADE', 'VIDEOAULA', 'ATIVIDADE', 'PROVA', 'AULA_PRATICA', 'ESTAGIO', 'EVENTO', 'RESUMO_SEMANAL'] as const
export type TipoRegra = (typeof TIPOS)[number]

interface Alvo { studentId: string; chave: string; vars: Record<string, string>; item?: string }

const hora = (d: Date) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)
const semanaIso = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia); const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-S${Math.ceil(((t.getTime() - ini.getTime()) / DIA + 1) / 7)}` }

/** Alunos com matrícula ativa (e curso), por tenant. */
async function alunosAtivos(tenantId: string) {
  const mats = await db.enrollment.findMany({ where: { status: 'ATIVA', student: { tenantId } }, include: { program: { select: { id: true, nome: true } } }, take: 20000 })
  const m = new Map<string, { curso: string; programId: string }>()
  for (const x of mats) if (!m.has(x.studentId)) m.set(x.studentId, { curso: x.program?.nome ?? '', programId: x.programId })
  return m
}

/** Matriculados em turmas (classSectionId -> alunos ativos). */
async function alunosPorTurma(tenantId: string, turmaIds: string[]) {
  const out = new Map<string, string[]>()
  if (!turmaIds.length) return out
  const rows = await db.classSectionEnrollment.findMany({ where: { classSectionId: { in: turmaIds }, enrollment: { status: 'ATIVA', student: { tenantId } } }, include: { enrollment: { select: { studentId: true } } }, take: 50000 })
  for (const r of rows) out.set(r.classSectionId, [...(out.get(r.classSectionId) ?? []), r.enrollment.studentId])
  return out
}

type Coletor = (tenantId: string, regra: any, now: Date) => Promise<Alvo[]>

const COLETORES: Record<TipoRegra, Coletor> = {
  async INATIVIDADE(tenantId, regra, now) {
    const limiar = regra.limiarDias ?? 7
    const ativos = await alunosAtivos(tenantId)
    const rs = await db.modEngajamentoResumo.findMany({ where: { tenantId, diasSemAcesso: { gte: limiar }, studentId: { in: [...ativos.keys()] } }, take: 20000 })
    return rs.map((r: any) => ({ studentId: r.studentId, chave: `ina:${semanaIso(now)}`, vars: { dias_sem_acesso: String(r.diasSemAcesso), curso: ativos.get(r.studentId)?.curso ?? '' }, item: `${r.diasSemAcesso} dias sem acessar o ambiente virtual` }))
  },

  async VIDEOAULA(tenantId, _regra, now) {
    const mats = await db.porMaterial.findMany({ where: { tenantId, status: 'PUBLICADO', tipo: { in: ['VIDEO', 'AULA_GRAVADA'] }, OR: [{ visivelDe: null }, { visivelDe: { lte: now } }] }, take: 5000 })
    if (!mats.length) return []
    const porTurma = await alunosPorTurma(tenantId, [...new Set<string>(mats.map((m: any) => m.classSectionId as string))])
    const feitos = await db.porProgresso.findMany({ where: { tenantId, materialId: { in: mats.map((m: any) => m.id) }, concluido: true }, select: { materialId: true, studentId: true } })
    const ok = new Set(feitos.map((f: any) => `${f.materialId}|${f.studentId}`))
    const pend = new Map<string, string[]>()
    for (const m of mats) for (const sid of porTurma.get(m.classSectionId) ?? []) if (!ok.has(`${m.id}|${sid}`)) pend.set(sid, [...(pend.get(sid) ?? []), m.titulo])
    const ativos = await alunosAtivos(tenantId)
    return [...pend.entries()].map(([sid, ts]) => ({ studentId: sid, chave: `vid:${semanaIso(now)}`, vars: { qtd_videos: String(ts.length), primeiro_video: ts[0], curso: ativos.get(sid)?.curso ?? '' }, item: `${ts.length} videoaula(s) para assistir (ex.: ${ts[0]})` }))
  },

  async ATIVIDADE(tenantId, regra, now) {
    const lim = new Date(now.getTime() + regra.antecedenciaDias * DIA)
    const mats = await db.porMaterial.findMany({ where: { tenantId, status: 'PUBLICADO', aceitaEntrega: true, prazoEntrega: { gte: now, lte: lim } }, take: 3000 })
    if (!mats.length) return []
    const porTurma = await alunosPorTurma(tenantId, [...new Set<string>(mats.map((m: any) => m.classSectionId as string))])
    const entregues = await db.porEntrega.findMany({ where: { tenantId, materialId: { in: mats.map((m: any) => m.id) } }, select: { materialId: true, studentId: true } })
    const ok = new Set(entregues.map((e: any) => `${e.materialId}|${e.studentId}`))
    const out: Alvo[] = []
    for (const m of mats) for (const sid of porTurma.get(m.classSectionId) ?? []) {
      if (ok.has(`${m.id}|${sid}`)) continue
      out.push({ studentId: sid, chave: `ativ:${m.id}`, vars: { atividade: m.titulo, prazo: `${formatDateBR(m.prazoEntrega)} às ${hora(m.prazoEntrega)}` }, item: `Atividade "${m.titulo}" — entrega até ${formatDateBR(m.prazoEntrega)} às ${hora(m.prazoEntrega)}` })
    }
    return out
  },

  async PROVA(tenantId, regra, now) {
    const lim = new Date(now.getTime() + regra.antecedenciaDias * DIA)
    const ex = await db.calExame.findMany({ where: { tenantId, status: 'AGENDADA', inicio: { gte: now, lte: lim } }, take: 3000 })
    if (!ex.length) return []
    const porTurma = await alunosPorTurma(tenantId, [...new Set<string>(ex.map((e: any) => e.classSectionId as string))])
    const discs = new Map<string, string>((await db.discipline.findMany({ where: { tenantId, id: { in: ex.map((e: any) => e.disciplineId).filter(Boolean) } }, select: { id: true, nome: true } })).map((d: any) => [d.id, d.nome]))
    const out: Alvo[] = []
    for (const e of ex) for (const sid of porTurma.get(e.classSectionId) ?? []) {
      const disc = discs.get(e.disciplineId) ?? e.titulo
      out.push({ studentId: sid, chave: `prova:${e.id}`, vars: { prova: e.titulo, disciplina: disc, data: formatDateBR(e.inicio), hora: hora(e.inicio) }, item: `Prova "${e.titulo}" (${disc}) — ${formatDateBR(e.inicio)} às ${hora(e.inicio)}` })
    }
    return out
  },

  async AULA_PRATICA(tenantId, regra, now) {
    const lim = new Date(now.getTime() + regra.antecedenciaDias * DIA)
    const ag = await db.modAgendaPratica.findMany({ where: { tenantId, status: 'AGENDADA', tipo: { in: ['AULA_PRATICA', 'LABORATORIO', 'VISITA_TECNICA'] }, inicio: { gte: now, lte: lim } }, include: { inscricoes: { where: { status: 'INSCRITO' } } }, take: 3000 })
    const out: Alvo[] = []
    for (const a of ag) for (const i of a.inscricoes) out.push({ studentId: i.studentId, chave: `prat:${a.id}`, vars: { aula: a.titulo, data: formatDateBR(a.inicio), hora: hora(a.inicio) }, item: `Aula prática "${a.titulo}" — ${formatDateBR(a.inicio)} às ${hora(a.inicio)}` })
    return out
  },

  async ESTAGIO(tenantId, regra, now) {
    const lim = new Date(now.getTime() + regra.antecedenciaDias * DIA)
    const out: Alvo[] = []
    const est = await db.modEstagio.findMany({ where: { tenantId, status: 'EM_ANDAMENTO' }, take: 5000 })
    for (const e of est) {
      const faltam = Math.max(0, Math.round((e.horasExigidas - e.horasCumpridas) * 10) / 10)
      const fimProximo = e.fim && e.fim >= now && e.fim <= lim
      if (!faltam || (!fimProximo && now.getDate() > 7)) continue // aviso mensal (primeira semana) ou perto do fim
      out.push({ studentId: e.studentId, chave: `est:${e.id}:${now.toISOString().slice(0, 7)}`, vars: { concedente: e.concedente, horas_faltantes: String(faltam), horas_cumpridas: String(e.horasCumpridas), fim: e.fim ? formatDateBR(e.fim) : 'a definir' }, item: `Estágio em ${e.concedente} — faltam ${faltam} h${e.fim ? ` (término em ${formatDateBR(e.fim)})` : ''}` })
    }
    const ag = await db.modAgendaPratica.findMany({ where: { tenantId, status: 'AGENDADA', tipo: 'ESTAGIO_SUPERVISIONADO', inicio: { gte: now, lte: lim } }, include: { inscricoes: { where: { status: 'INSCRITO' } } }, take: 3000 })
    for (const a of ag) for (const i of a.inscricoes) out.push({ studentId: i.studentId, chave: `estag:${a.id}`, vars: { concedente: a.titulo, horas_faltantes: '', horas_cumpridas: '', fim: formatDateBR(a.inicio) }, item: `Estágio supervisionado "${a.titulo}" — ${formatDateBR(a.inicio)} às ${hora(a.inicio)}` })
    return out
  },

  async EVENTO(tenantId, regra, now) {
    const lim = new Date(now.getTime() + regra.antecedenciaDias * DIA)
    const evs = await db.calEvento.findMany({ where: { tenantId, ativo: true, publico: { in: ['TODOS', 'ALUNOS'] }, inicio: { gte: now, lte: lim }, ...(regra.eventoTipo ? { tipo: regra.eventoTipo } : {}), ...(regra.tituloContem ? { titulo: { contains: regra.tituloContem, mode: 'insensitive' } } : {}) }, take: 500 })
    if (!evs.length) return []
    const ativos = await alunosAtivos(tenantId)
    const out: Alvo[] = []
    for (const e of evs) for (const [sid, a] of ativos) {
      if (e.programId && e.programId !== a.programId) continue
      out.push({ studentId: sid, chave: `ev:${e.id}`, vars: { evento: e.titulo, data: formatDateBR(e.inicio), local: e.local ?? 'conforme comunicado', curso: a.curso }, item: `${e.titulo} — ${formatDateBR(e.inicio)}` })
    }
    return out
  },

  async RESUMO_SEMANAL(tenantId, regra, now) {
    const sub = { ...regra, antecedenciaDias: 7 }
    const [a, p, pr, v] = await Promise.all([COLETORES.ATIVIDADE(tenantId, sub, now), COLETORES.PROVA(tenantId, sub, now), COLETORES.AULA_PRATICA(tenantId, sub, now), COLETORES.VIDEOAULA(tenantId, sub, now)])
    const itens = new Map<string, string[]>()
    for (const x of [...p, ...a, ...pr, ...v]) itens.set(x.studentId, [...(itens.get(x.studentId) ?? []), x.item ?? ''])
    const ativos = await alunosAtivos(tenantId)
    return [...itens.entries()].map(([sid, l]) => ({ studentId: sid, chave: `res:${semanaIso(now)}`, vars: { itens: l.slice(0, 8).map((t) => `• ${t}`).join('\n'), qtd_itens: String(l.length), curso: ativos.get(sid)?.curso ?? '' }, item: `${l.length} item(ns) na semana` }))
  },
}

export interface ResumoExec { regras: number; avaliados: number; enfileiradas: number; semDestino: number; bloqueadas: number; limite: number; simulacao: any[] }

/** Executa (ou simula) as regras ativas. Idempotente: o unique (regra, aluno, chave) impede duplicidade. */
export async function executarAcompanhamento(opts: { tenantId?: string; regraId?: string; dryRun?: boolean; now?: Date } = {}): Promise<ResumoExec> {
  const now = opts.now ?? new Date()
  const resumo: ResumoExec = { regras: 0, avaliados: 0, enfileiradas: 0, semDestino: 0, bloqueadas: 0, limite: 0, simulacao: [] }
  const tenants = opts.tenantId ? [opts.tenantId] : (await prisma.acpRegra.findMany({ where: { ativa: true }, distinct: ['tenantId'], select: { tenantId: true } })).map((r) => r.tenantId)
  for (const tenantId of tenants) {
    const cfg = await prisma.acpConfig.findUnique({ where: { tenantId } })
    if (cfg && !cfg.ativo) continue
    const maxDia = cfg?.maxPorAlunoDia ?? 2
    const maxSem = cfg?.maxPorAlunoSemana ?? 5
    const regras = await prisma.acpRegra.findMany({ where: { tenantId, ativa: true, ...(opts.regraId ? { id: opts.regraId } : {}) }, orderBy: { createdAt: 'asc' } })
    const usoDia = new Map<string, number>()
    const usoSem = new Map<string, number>()
    const recentes = await prisma.acpEnvio.findMany({ where: { tenantId, resultado: 'ENFILEIRADO', createdAt: { gte: new Date(now.getTime() - 7 * DIA) } }, select: { studentId: true, createdAt: true } })
    for (const r of recentes) { usoSem.set(r.studentId, (usoSem.get(r.studentId) ?? 0) + 1); if (now.getTime() - r.createdAt.getTime() < DIA) usoDia.set(r.studentId, (usoDia.get(r.studentId) ?? 0) + 1) }
    for (const regra of regras) {
      if (!(TIPOS as readonly string[]).includes(regra.tipo)) continue
      resumo.regras++
      const alvos = await COLETORES[regra.tipo as TipoRegra](tenantId, regra, now)
      resumo.avaliados += alvos.length
      if (!alvos.length) continue
      const ids = [...new Set(alvos.map((a) => a.studentId))]
      const [contatos, cooldown, jaFeitos] = await Promise.all([
        contatosDeAlunos(tenantId, ids),
        prisma.acpEnvio.findMany({ where: { regraId: regra.id, studentId: { in: ids }, resultado: 'ENFILEIRADO', createdAt: { gte: new Date(now.getTime() - regra.cooldownDias * DIA) } }, select: { studentId: true } }),
        prisma.acpEnvio.findMany({ where: { regraId: regra.id, studentId: { in: ids } }, select: { studentId: true, chave: true } }),
      ])
      const prefs = await prefsPorContato(tenantId, [...contatos.values()].map((c) => c.contatoId).filter(Boolean) as string[])
      const emCooldown = new Set(cooldown.map((c) => c.studentId))
      const feitos = new Set(jaFeitos.map((f) => `${f.studentId}|${f.chave}`))
      for (const a of alvos) {
        if (feitos.has(`${a.studentId}|${a.chave}`) || emCooldown.has(a.studentId)) continue
        const c = contatos.get(a.studentId)
        if (!c) continue
        const vars = { nome: c.nome.split(' ')[0], nome_completo: c.nome, instituicao: cfg?.remetenteNome ?? 'sua instituição', ...a.vars }
        const assunto = renderTemplate(regra.assunto, vars).texto
        const corpo = renderTemplate(regra.corpo, vars).texto
        let resultado: 'ENFILEIRADO' | 'SEM_DESTINO' | 'BLOQUEADO_OPTOUT' | 'LIMITE_DIARIO' = 'ENFILEIRADO'
        const destino = regra.canal === 'EMAIL' ? c.email : regra.canal === 'WHATSAPP' || regra.canal === 'SMS' ? c.telefone : c.telegramChatId
        if (!destino) resultado = 'SEM_DESTINO'
        else if (!podeEnviar(prefs.get(c.contatoId ?? '') ?? [], regra.canal, 'ACADEMICO').ok) resultado = 'BLOQUEADO_OPTOUT'
        else if ((usoDia.get(a.studentId) ?? 0) >= maxDia || (usoSem.get(a.studentId) ?? 0) >= maxSem) resultado = 'LIMITE_DIARIO'
        if (opts.dryRun) { resumo.simulacao.push({ regra: regra.nome, tipo: regra.tipo, aluno: c.nome, destino, resultado, assunto, mensagem: corpo }); continue }
        try {
          let notificationId: string | undefined
          if (resultado === 'ENFILEIRADO') {
            const n = await prisma.eduNotification.create({ data: { tenantId, canal: regra.canal, studentId: a.studentId, destino: destino!, assunto, mensagem: corpo, templateKey: `acp.${regra.tipo.toLowerCase()}`, refType: 'AcpRegra', refId: regra.id, agendadoPara: now } })
            notificationId = n.id
            usoDia.set(a.studentId, (usoDia.get(a.studentId) ?? 0) + 1)
            usoSem.set(a.studentId, (usoSem.get(a.studentId) ?? 0) + 1)
          }
          await prisma.acpEnvio.create({ data: { tenantId, regraId: regra.id, studentId: a.studentId, chave: a.chave, resultado, notificationId, assunto, resumo: a.item } })
          if (resultado === 'ENFILEIRADO') resumo.enfileiradas++
          else if (resultado === 'SEM_DESTINO') resumo.semDestino++
          else if (resultado === 'BLOQUEADO_OPTOUT') resumo.bloqueadas++
          else resumo.limite++
        } catch (e: any) { if (e?.code !== 'P2002') throw e }
      }
    }
    if (!opts.dryRun && resumo.enfileiradas) await audit({ tenantId, modulo: 'acompanhamento', acao: 'ACOMPANHAMENTO_EXECUTADO', detalhes: { enfileiradas: resumo.enfileiradas } })
  }
  return resumo
}

// ---------------------------------------------------------------- regras-padrão
const RODAPE = '\n\nUm abraço,\nEquipe {{instituicao}}\n\nVocê recebe este lembrete como aluno(a). Para deixar de receber, responda SAIR.'

export const REGRAS_PADRAO = [
  { tipo: 'INATIVIDADE', nome: 'Volta aos estudos (sem acesso há 7 dias)', descricao: 'Aluno que não entra no ambiente virtual há alguns dias recebe um convite carinhoso para retomar.', limiarDias: 7, antecedenciaDias: 0, cooldownDias: 7, assunto: '{{nome}}, sentimos sua falta nas aulas!', corpo: 'Olá, {{nome}}!\n\nNotamos que faz {{dias_sem_acesso}} dias que você não acessa o ambiente virtual do curso de {{curso}}. Pequenos passos todos os dias fazem toda a diferença: que tal assistir a uma videoaula hoje?\n\nSe estiver com alguma dificuldade (acesso, conteúdo ou tempo), responda este e-mail e a nossa equipe ajuda você.' + RODAPE },
  { tipo: 'INATIVIDADE', nome: 'Alerta de afastamento (sem acesso há 15 dias)', descricao: 'Segundo contato, mais direto, para quem continua sem acessar.', limiarDias: 15, antecedenciaDias: 0, cooldownDias: 10, assunto: '{{nome}}, podemos ajudar você a continuar?', corpo: 'Olá, {{nome}}!\n\nJá se passaram {{dias_sem_acesso}} dias desde o seu último acesso. Seu curso de {{curso}} continua esperando por você, e ainda dá tempo de recuperar o ritmo.\n\nQuer conversar com a coordenação ou com o tutor sobre horários, conteúdo ou qualquer dificuldade? Responda este e-mail e agendamos um contato.' + RODAPE },
  { tipo: 'VIDEOAULA', nome: 'Videoaulas pendentes da semana', descricao: 'Lembra o aluno das videoaulas e aulas gravadas que ainda não concluiu.', antecedenciaDias: 0, cooldownDias: 7, assunto: '{{nome}}, você tem {{qtd_videos}} videoaula(s) para assistir', corpo: 'Olá, {{nome}}!\n\nSeparamos para você: {{qtd_videos}} videoaula(s) ainda não concluída(s), a começar por "{{primeiro_video}}". Reserve 30 minutos hoje para avançar.\n\nAcesse o portal do aluno, abra a sua sala virtual e continue de onde parou.' + RODAPE },
  { tipo: 'ATIVIDADE', nome: 'Lembrete de entrega de atividade', descricao: 'Avisa 3 dias antes do prazo quem ainda não entregou.', antecedenciaDias: 3, cooldownDias: 1, assunto: 'Prazo de entrega: {{atividade}} ({{prazo}})', corpo: 'Olá, {{nome}}!\n\nLembrete: a atividade "{{atividade}}" deve ser entregue até {{prazo}} e ainda não identificamos a sua entrega. Envie pelo portal do aluno, na sala virtual da disciplina.' + RODAPE },
  { tipo: 'PROVA', nome: 'Lembrete de prova', descricao: 'Avisa 5 dias antes de cada prova agendada.', antecedenciaDias: 5, cooldownDias: 1, assunto: 'Prova de {{disciplina}} em {{data}}', corpo: 'Olá, {{nome}}!\n\nSua prova "{{prova}}" de {{disciplina}} será em {{data}}, às {{hora}}. Revise os conteúdos e as videoaulas da disciplina e chegue com antecedência, com documento de identificação.' + RODAPE },
  { tipo: 'AULA_PRATICA', nome: 'Lembrete de aula prática', descricao: 'Avisa 3 dias antes de aulas práticas, laboratórios e visitas técnicas em que o aluno está inscrito.', antecedenciaDias: 3, cooldownDias: 1, assunto: 'Aula prática: {{aula}} em {{data}}', corpo: 'Olá, {{nome}}!\n\nVocê está inscrito(a) na aula prática "{{aula}}", em {{data}}, às {{hora}}. Leve o material e os equipamentos de proteção indicados pelo professor.' + RODAPE },
  { tipo: 'ESTAGIO', nome: 'Acompanhamento de estágio', descricao: 'Informa horas pendentes e proximidade do término do estágio; avisa também estágios supervisionados agendados.', antecedenciaDias: 15, cooldownDias: 25, assunto: 'Seu estágio: faltam {{horas_faltantes}} horas', corpo: 'Olá, {{nome}}!\n\nSobre o seu estágio em {{concedente}}: você já cumpriu {{horas_cumpridas}} horas e faltam {{horas_faltantes}} horas (previsão de término: {{fim}}). Registre as horas e entregue os relatórios no portal para manter tudo em dia.' + RODAPE },
  { tipo: 'EVENTO', nome: 'ENADE: aviso de prova e inscrição', descricao: 'Avisa todos os alunos antes do ENADE.', eventoTipo: 'ENADE', antecedenciaDias: 30, cooldownDias: 7, assunto: 'ENADE em {{data}}: prepare-se!', corpo: 'Olá, {{nome}}!\n\nO ENADE acontece em {{data}}. Confira a sua situação de inscrição na secretaria e aproveite os simulados e as listas de revisão do portal do aluno para chegar preparado(a).' + RODAPE },
  { tipo: 'EVENTO', nome: 'PIESC e atividades institucionais', descricao: 'Avisa sobre prazos e atividades do PIESC e outras atividades institucionais do calendário.', tituloContem: 'PIESC', antecedenciaDias: 15, cooldownDias: 7, assunto: '{{evento}} — {{data}}', corpo: 'Olá, {{nome}}!\n\nLembramos que "{{evento}}" acontece em {{data}}. Confira as orientações no calendário acadêmico do portal do aluno e procure a coordenação em caso de dúvida.' + RODAPE },
  { tipo: 'RESUMO_SEMANAL', nome: 'Resumo semanal do aluno', descricao: 'Toda semana, uma lista do que vem pela frente: provas, atividades, aulas práticas e videoaulas.', antecedenciaDias: 7, cooldownDias: 6, assunto: 'Sua semana de estudos: {{qtd_itens}} compromisso(s)', corpo: 'Olá, {{nome}}!\n\nEsta é a sua agenda de estudos dos próximos dias:\n\n{{itens}}\n\nOrganize o seu tempo e conte com a gente.' + RODAPE },
] as const

export async function garantirRegrasPadrao(tenantId: string) {
  const cfg = await prisma.acpConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } })
  const existentes = await prisma.acpRegra.count({ where: { tenantId } })
  if (existentes) return { config: cfg, criadas: 0 }
  for (const r of REGRAS_PADRAO) await prisma.acpRegra.create({ data: { tenantId, ...(r as any), canal: 'EMAIL', ativa: true } })
  return { config: cfg, criadas: REGRAS_PADRAO.length }
}
