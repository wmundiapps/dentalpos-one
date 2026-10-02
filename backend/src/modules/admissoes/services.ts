import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import {
  StatusCandidato,
  aplicarBeneficios,
  avaliarElegibilidadeBolsa,
  etapaDe,
  gerarSenhaProvisoria,
  podeTransicionar,
  proximoRA,
  somarMeses,
} from './logic'

const DAY = 86_400_000
const httpErr = (status: number, msg: string) => Object.assign(new Error(msg), { status })
export { httpErr }

export const STUDENT_REF_PREFIX = 'ADM:' // AccountReceivable.studentId provisório (candidato ainda sem Student)

// ---------- Funil: mudança de status com histórico ----------

export async function mudarStatusCandidato(params: {
  tenantId: string
  candidatoId: string
  para: StatusCandidato
  userId?: string
  motivo?: string
  forcar?: boolean
}) {
  const c = await prisma.admCandidato.findFirst({ where: { id: params.candidatoId, tenantId: params.tenantId } })
  if (!c) throw httpErr(404, 'Candidato não encontrado.')
  const de = c.status as StatusCandidato
  if (!params.forcar && !podeTransicionar(de, params.para)) throw httpErr(409, `Transição inválida: ${de} → ${params.para}.`)
  const etapaMaxima = Math.max(c.etapaMaxima, etapaDe(params.para, c.etapaMaxima))
  const upd = await prisma.admCandidato.update({
    where: { id: c.id },
    data: { status: params.para, etapaMaxima, ...(params.para === 'DESISTENTE' ? { motivoDesistencia: params.motivo ?? c.motivoDesistencia } : {}) },
  })
  await prisma.admInteracao.create({
    data: { tenantId: params.tenantId, candidatoId: c.id, tipo: 'SISTEMA', descricao: `Status: ${de} → ${params.para}${params.motivo ? ` (${params.motivo})` : ''}`, userId: params.userId },
  })
  if (params.para === 'DESISTENTE' || params.para === 'REPROVADO' || params.para === 'MATRICULADO') {
    await completeReminders({ tenantId: params.tenantId, refType: 'AdmCandidato', refId: c.id, userId: params.userId })
  }
  return upd
}

// Agenda follow-up (lembrete) para o consultor/papel ADMISSIONS.
export async function agendarFollowUp(params: { tenantId: string; candidatoId: string; nome: string; quando: Date; responsavelId?: string | null; descricao?: string }) {
  await prisma.admCandidato.update({ where: { id: params.candidatoId }, data: { proximoContatoEm: params.quando } })
  return scheduleReminder({
    tenantId: params.tenantId,
    modulo: 'admissoes',
    titulo: `Follow-up com candidato ${params.nome}`,
    descricao: params.descricao,
    dueAt: params.quando,
    remindAt: new Date(Math.max(Date.now(), params.quando.getTime() - 3_600_000)),
    refType: 'AdmCandidato',
    refId: params.candidatoId,
    assigneeUserId: params.responsavelId ?? undefined,
    assigneeRole: params.responsavelId ? undefined : 'ADMISSIONS',
    severity: 'ATENCAO',
    dedupeKey: `adm-followup-${params.candidatoId}`,
  })
}

// ---------- Cobrança da taxa de inscrição (AccountReceivable) ----------

export function montarCobrancaInscricao(p: { tenantId: string; candidatoId: string; protocolo: string; processoNome: string; valor: number; vencimento: Date }) {
  return {
    tenantId: p.tenantId,
    studentId: `${STUDENT_REF_PREFIX}${p.candidatoId}`,
    descricao: `Taxa de inscrição ${p.processoNome} — protocolo ${p.protocolo}`,
    numeroParcela: 1,
    valor: p.valor,
    dataVencimento: p.vencimento,
  }
}

export async function gerarCobrancaInscricao(params: { tenantId: string; candidatoId: string }) {
  const c = await prisma.admCandidato.findFirst({ where: { id: params.candidatoId, tenantId: params.tenantId }, include: { processo: true } })
  if (!c || !c.processo) throw httpErr(404, 'Candidato/processo não encontrado.')
  if (c.taxaReceivableId) {
    const existente = await prisma.accountReceivable.findFirst({ where: { id: c.taxaReceivableId, tenantId: params.tenantId } })
    if (existente) return existente
  }
  const valor = c.processo.taxaInscricao
  if (!(valor > 0)) {
    await prisma.admCandidato.update({ where: { id: c.id }, data: { taxaPaga: true } })
    return null
  }
  const venc = new Date(Math.min(Date.now() + 3 * DAY, c.processo.inscricaoFim.getTime() + DAY))
  const rec = await prisma.accountReceivable.create({
    data: montarCobrancaInscricao({ tenantId: params.tenantId, candidatoId: c.id, protocolo: c.protocolo, processoNome: c.processo.nome, valor, vencimento: venc }),
  })
  await prisma.admCandidato.update({ where: { id: c.id }, data: { taxaReceivableId: rec.id } })
  return rec
}

// Sincroniza taxaPaga a partir do financeiro (pago, ou cancelado = isento).
export async function sincronizarTaxasPagas(tenantId?: string) {
  const pend = await prisma.admCandidato.findMany({
    where: { taxaPaga: false, taxaReceivableId: { not: null }, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, tenantId: true, taxaReceivableId: true },
    take: 1000,
  })
  let atualizados = 0
  for (const c of pend) {
    const r = await prisma.accountReceivable.findFirst({ where: { id: c.taxaReceivableId!, tenantId: c.tenantId }, select: { status: true } })
    if (r?.status === 'PAGO') {
      await prisma.admCandidato.update({ where: { id: c.id }, data: { taxaPaga: true } })
      atualizados++
    }
  }
  return atualizados
}

// ---------- Documentos ----------

export const DOCUMENTOS_PADRAO: Array<{ codigo: string; nome: string; obrigatorio: boolean; niveis: string[] }> = [
  { codigo: 'RG', nome: 'RG ou CNH (cópia)', obrigatorio: true, niveis: ['GRADUACAO', 'POS_LATO', 'POS_STRICTO'] },
  { codigo: 'CPF', nome: 'CPF', obrigatorio: true, niveis: ['GRADUACAO', 'POS_LATO', 'POS_STRICTO'] },
  { codigo: 'COMPROVANTE_RESIDENCIA', nome: 'Comprovante de residência', obrigatorio: true, niveis: ['GRADUACAO', 'POS_LATO', 'POS_STRICTO'] },
  { codigo: 'CERTIDAO_NASC_CASAMENTO', nome: 'Certidão de nascimento ou casamento', obrigatorio: true, niveis: ['GRADUACAO', 'POS_LATO', 'POS_STRICTO'] },
  { codigo: 'HISTORICO_ENSINO_MEDIO', nome: 'Histórico escolar do Ensino Médio', obrigatorio: true, niveis: ['GRADUACAO'] },
  { codigo: 'CERTIFICADO_ENSINO_MEDIO', nome: 'Certificado de conclusão do Ensino Médio', obrigatorio: true, niveis: ['GRADUACAO'] },
  { codigo: 'DIPLOMA_GRADUACAO', nome: 'Diploma de graduação (frente e verso)', obrigatorio: true, niveis: ['POS_LATO', 'POS_STRICTO'] },
  { codigo: 'HISTORICO_GRADUACAO', nome: 'Histórico escolar da graduação', obrigatorio: true, niveis: ['POS_LATO', 'POS_STRICTO'] },
  { codigo: 'FOTO_3X4', nome: 'Foto 3x4', obrigatorio: false, niveis: ['GRADUACAO', 'POS_LATO', 'POS_STRICTO'] },
  { codigo: 'TITULO_ELEITOR', nome: 'Título de eleitor', obrigatorio: false, niveis: ['GRADUACAO'] },
  { codigo: 'RESERVISTA', nome: 'Certificado de reservista (sexo masculino)', obrigatorio: false, niveis: ['GRADUACAO'] },
  { codigo: 'COMPROVANTE_COTA', nome: 'Comprovante de elegibilidade de cota/bolsa', obrigatorio: false, niveis: ['GRADUACAO', 'POS_LATO', 'POS_STRICTO'] },
]

export async function garantirChecklistDocumentos(tenantId: string, candidatoId: string, nivel: string) {
  let tipos = await prisma.admDocumentoTipo.findMany({ where: { tenantId, ativo: true, niveis: { has: nivel } } })
  const base = tipos.length ? tipos.map((t) => ({ codigo: t.codigo, nome: t.nome, obrigatorio: t.obrigatorio })) : DOCUMENTOS_PADRAO.filter((d) => d.niveis.includes(nivel))
  for (const d of base) {
    await prisma.admDocumentoCandidato.upsert({
      where: { candidatoId_codigo: { candidatoId, codigo: d.codigo } },
      create: { tenantId, candidatoId, codigo: d.codigo, nome: d.nome, obrigatorio: d.obrigatorio },
      update: {},
    })
  }
  return prisma.admDocumentoCandidato.findMany({ where: { tenantId, candidatoId }, orderBy: { nome: 'asc' } })
}

export function documentosCompletos(docs: Array<{ obrigatorio: boolean; status: string }>) {
  const pend = docs.filter((d) => d.obrigatorio && d.status !== 'APROVADO')
  return { completo: pend.length === 0, pendentes: pend.length }
}

// ---------- Convocação ----------

export async function convocarCandidato(params: { tenantId: string; candidatoId: string; chamadaId: string; ofertaId: string; prazo: Date; userId?: string; processoNome?: string }) {
  const c = await prisma.admCandidato.findFirst({ where: { id: params.candidatoId, tenantId: params.tenantId } })
  if (!c) return null
  const conv = await prisma.admConvocacao.create({
    data: { tenantId: params.tenantId, chamadaId: params.chamadaId, candidatoId: c.id, ofertaId: params.ofertaId, prazo: params.prazo },
  })
  await mudarStatusCandidato({ tenantId: params.tenantId, candidatoId: c.id, para: 'CONVOCADO', userId: params.userId, motivo: 'Convocado em chamada', forcar: true })
  await notify({
    tenantId: params.tenantId,
    canal: c.telefone ? 'WHATSAPP' : 'EMAIL',
    destino: c.telefone ?? c.email ?? undefined,
    assunto: 'Você foi convocado(a) para matrícula!',
    mensagem: `Olá, ${c.nome}! Parabéns, você foi convocado(a)${params.processoNome ? ` no ${params.processoNome}` : ''}. Realize sua matrícula até ${params.prazo.toLocaleDateString('pt-BR')}. Protocolo: ${c.protocolo}.`,
    templateKey: 'adm.convocacao',
    refType: 'AdmConvocacao',
    refId: conv.id,
  })
  await scheduleReminder({
    tenantId: params.tenantId,
    modulo: 'admissoes',
    titulo: `Convocação vence: ${c.nome}`,
    descricao: 'Candidato convocado ainda não concluiu a matrícula.',
    dueAt: params.prazo,
    antecedenciaDias: 2,
    refType: 'AdmConvocacao',
    refId: conv.id,
    assigneeRole: 'ADMISSIONS',
    severity: 'ATENCAO',
    dedupeKey: `adm-conv-${conv.id}`,
  })
  return conv
}

// Expira convocações vencidas: candidato volta a APROVADO (permanece na fila só se a política permitir;
// por padrão não é reconvocado pois já possui convocação expirada).
export async function expirarConvocacoes(tenantId?: string, agora = new Date()) {
  const vencidas = await prisma.admConvocacao.findMany({ where: { status: 'CONVOCADO', prazo: { lt: agora }, ...(tenantId ? { tenantId } : {}) }, take: 500 })
  for (const v of vencidas) {
    await prisma.admConvocacao.update({ where: { id: v.id }, data: { status: 'EXPIRADO' } })
    const c = await prisma.admCandidato.findFirst({ where: { id: v.candidatoId, tenantId: v.tenantId } })
    if (c && c.status === 'CONVOCADO') {
      await mudarStatusCandidato({ tenantId: v.tenantId, candidatoId: c.id, para: 'APROVADO', motivo: 'Convocação expirada', forcar: true })
      await notify({ tenantId: v.tenantId, canal: 'EMAIL', destino: c.email ?? undefined, assunto: 'Convocação expirada', mensagem: `Olá, ${c.nome}. O prazo da sua convocação terminou sem matrícula. Entre em contato com a secretaria de admissões.`, templateKey: 'adm.convocacao.expirada', refType: 'AdmConvocacao', refId: v.id })
    }
    await completeReminders({ tenantId: v.tenantId, refType: 'AdmConvocacao', refId: v.id })
  }
  return vencidas.length
}

// ---------- Benefícios ----------

export async function calcularBeneficiosCandidato(tenantId: string, candidatoId: string, valorBase: number, bolsaIdsExtras: string[] = []) {
  const c = await prisma.admCandidato.findFirst({ where: { id: candidatoId, tenantId }, include: { processo: true } })
  if (!c) throw httpErr(404, 'Candidato não encontrado.')
  const oferta = c.ofertaAlocadaId ? await prisma.admOferta.findFirst({ where: { id: c.ofertaAlocadaId, tenantId } }) : c.ofertaId ? await prisma.admOferta.findFirst({ where: { id: c.ofertaId, tenantId } }) : null
  const dados: any = c.dados ?? {}
  const bolsas = await prisma.admBolsa.findMany({ where: { tenantId, ativo: true, OR: [{ id: { in: [...bolsaIdsExtras, ...(c.bolsaId ? [c.bolsaId] : [])] } }, { tipo: 'DESCONTO' }] } })
  const aplicaveis: typeof bolsas = []
  const rejeitadas: Array<{ id: string; nome: string; motivos: string[] }> = []
  for (const b of bolsas) {
    const concessoesAtuais = await prisma.admBolsaConcessao.count({ where: { tenantId, bolsaId: b.id } })
    const av = avaliarElegibilidadeBolsa(
      { id: b.id, nome: b.nome, percentual: b.percentual, valorFixo: b.valorFixo, cumulativa: b.cumulativa, ativo: b.ativo, vigenciaInicio: b.vigenciaInicio, vigenciaFim: b.vigenciaFim, limiteConcessoes: b.limiteConcessoes, concessoesAtuais, regras: (b.regras as any) ?? null },
      { notaFinal: c.notaFinal, cota: c.cota, nivel: c.processo?.nivel, programId: oferta?.programId, tipoProcesso: c.processo?.tipo, empresaConvenio: dados?.empresa },
    )
    if (av.elegivel) aplicaveis.push(b)
    else rejeitadas.push({ id: b.id, nome: b.nome, motivos: av.motivos })
  }
  const calc = aplicarBeneficios(valorBase, aplicaveis.map((b) => ({ id: b.id, percentual: b.percentual, cumulativa: b.cumulativa, valorFixo: b.valorFixo })))
  return { ...calc, rejeitadas, elegiveis: aplicaveis.map((b) => ({ id: b.id, nome: b.nome, percentual: b.percentual })) }
}

// ---------- Contrato ----------

export async function gerarContratoHtml(tenantId: string, m: { candidato: { nome: string; cpf?: string | null; protocolo: string }; nomeCurso: string; modalidade: string; turno: string; valorMensalidade: number; percentualDesconto: number; valorComDesconto: number; parcelas: number }) {
  const b = await getBranding(tenantId)
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato de Prestação de Serviços Educacionais</title></head>
<body style="font-family:Georgia,serif;color:#0f172a;max-width:800px;margin:0 auto">
${brandHeaderHtml(b, { titulo: 'Contrato de Prestação de Serviços Educacionais', subtitulo: `Protocolo ${m.candidato.protocolo}` })}
<main style="padding:24px 28px;font-size:14px;line-height:1.6">
<p><strong>CONTRATADA:</strong> ${esc(b.nome)}${b.cnpj ? `, CNPJ ${esc(b.cnpj)}` : ''}.</p>
<p><strong>CONTRATANTE:</strong> ${esc(m.candidato.nome)}${m.candidato.cpf ? `, CPF ${esc(m.candidato.cpf)}` : ''}.</p>
<h3>Cláusula 1ª — Objeto</h3>
<p>Prestação de serviços educacionais no curso <strong>${esc(m.nomeCurso)}</strong>, modalidade ${esc(m.modalidade)}, turno ${esc(m.turno)}.</p>
<h3>Cláusula 2ª — Valores</h3>
<p>Mensalidade de ${brl(m.valorMensalidade)}${m.percentualDesconto > 0 ? `, com benefício de ${m.percentualDesconto}%, resultando em ${brl(m.valorComDesconto)}` : ''}, em ${m.parcelas} parcela(s) mensais.</p>
<h3>Cláusula 3ª — Obrigações</h3>
<p>A CONTRATADA compromete-se a ministrar o curso conforme o projeto pedagógico e o calendário acadêmico. O CONTRATANTE compromete-se ao pagamento pontual das parcelas, à apresentação dos documentos exigidos e ao cumprimento do regimento institucional.</p>
<h3>Cláusula 4ª — Inadimplência e rescisão</h3>
<p>O atraso sujeita-se a multa de 2% e juros de 1% a.m. A rescisão e o trancamento observam o regimento e a legislação vigente (Lei 9.870/1999).</p>
<h3>Cláusula 5ª — LGPD</h3>
<p>Os dados pessoais são tratados para fins acadêmicos, financeiros e legais, nos termos da Lei 13.709/2018.</p>
<p style="margin-top:40px">Data: ${new Date().toLocaleDateString('pt-BR')}</p>
<div style="display:flex;gap:40px;margin-top:48px"><div style="flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:4px">${esc(b.nome)}</div><div style="flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:4px">${esc(m.candidato.nome)}</div></div>
</main></body></html>`
}

// ---------- Matrícula ----------

export async function iniciarMatricula(params: { tenantId: string; candidatoId: string; userId?: string; bolsaIds?: string[]; ofertaId?: string }) {
  const { tenantId } = params
  const c = await prisma.admCandidato.findFirst({ where: { id: params.candidatoId, tenantId }, include: { processo: true, matricula: true } })
  if (!c) throw httpErr(404, 'Candidato não encontrado.')
  if (c.matricula && c.matricula.status !== 'CANCELADA') throw httpErr(409, 'Candidato já possui matrícula em andamento.')
  if (!['APROVADO', 'CONVOCADO'].includes(c.status)) throw httpErr(409, `Candidato com status ${c.status} não pode iniciar matrícula (exige APROVADO ou CONVOCADO).`)
  if (c.processo && c.processo.taxaInscricao > 0 && !c.taxaPaga) throw httpErr(409, 'Taxa de inscrição pendente.')
  const conv = await prisma.admConvocacao.findFirst({ where: { tenantId, candidatoId: c.id, status: 'CONVOCADO' }, orderBy: { createdAt: 'desc' } })
  if (conv && conv.prazo < new Date()) throw httpErr(409, 'Prazo de matrícula da convocação expirou.')
  const ofertaId = params.ofertaId ?? conv?.ofertaId ?? c.ofertaAlocadaId ?? c.ofertaId
  if (!ofertaId) throw httpErr(400, 'Candidato sem oferta definida.')
  const oferta = await prisma.admOferta.findFirst({ where: { id: ofertaId, tenantId } })
  if (!oferta) throw httpErr(404, 'Oferta não encontrada.')
  const benef = await calcularBeneficiosCandidato(tenantId, c.id, oferta.valorMensalidade, params.bolsaIds ?? [])
  const contratoHtml = await gerarContratoHtml(tenantId, {
    candidato: c, nomeCurso: oferta.nomeCurso, modalidade: oferta.modalidade, turno: oferta.turno,
    valorMensalidade: oferta.valorMensalidade, percentualDesconto: benef.percentualTotal, valorComDesconto: benef.valorFinal, parcelas: oferta.parcelas,
  })
  const dados = {
    tenantId, candidatoId: c.id, convocacaoId: conv?.id, ofertaId, status: 'PENDENTE_DOCUMENTOS' as const,
    bolsaId: benef.aplicados[0] ?? null, percentualDesconto: benef.percentualTotal, valorMensalidade: oferta.valorMensalidade,
    valorComDesconto: benef.valorFinal, parcelas: oferta.parcelas, contratoHtml, contratoAceitoEm: null,
  }
  const mat = c.matricula
    ? await prisma.admMatricula.update({ where: { id: c.matricula.id }, data: dados })
    : await prisma.admMatricula.create({ data: dados })
  const docs = await garantirChecklistDocumentos(tenantId, c.id, c.processo?.nivel ?? 'GRADUACAO')
  await audit({ tenantId, userId: params.userId, modulo: 'admissoes', acao: 'INICIAR_MATRICULA', refType: 'AdmMatricula', refId: mat.id })
  return { matricula: mat, documentos: docs, beneficios: benef }
}

export async function recalcularStatusDocumentos(tenantId: string, candidatoId: string) {
  const docs = await prisma.admDocumentoCandidato.findMany({ where: { tenantId, candidatoId } })
  const { completo } = documentosCompletos(docs)
  const m = await prisma.admMatricula.findFirst({ where: { tenantId, candidatoId } })
  if (m && (m.status === 'PENDENTE_DOCUMENTOS' || m.status === 'DOCUMENTOS_OK')) {
    await prisma.admMatricula.update({ where: { id: m.id }, data: { status: completo ? 'DOCUMENTOS_OK' : 'PENDENTE_DOCUMENTOS' } })
  }
  return completo
}

export async function efetivarMatricula(params: { tenantId: string; matriculaId: string; userId?: string; primeiroVencimento?: Date; diaVencimento?: number; termId?: string }) {
  const { tenantId } = params
  const m = await prisma.admMatricula.findFirst({ where: { id: params.matriculaId, tenantId }, include: { candidato: { include: { processo: true } } } })
  if (!m) throw httpErr(404, 'Matrícula não encontrada.')
  if (m.status === 'CONCLUIDA') throw httpErr(409, 'Matrícula já concluída.')
  if (m.status === 'CANCELADA') throw httpErr(409, 'Matrícula cancelada.')
  const c = m.candidato
  if (!m.contratoAceitoEm) throw httpErr(409, 'Contrato ainda não aceito.')
  const docs = await prisma.admDocumentoCandidato.findMany({ where: { tenantId, candidatoId: c.id } })
  if (!documentosCompletos(docs).completo) throw httpErr(409, 'Há documentos obrigatórios pendentes de aprovação.')
  if (!c.email) throw httpErr(400, 'Candidato sem e-mail (necessário para criar o acesso).')
  if (!c.cpf) throw httpErr(400, 'Candidato sem CPF.')
  const oferta = await prisma.admOferta.findFirst({ where: { id: m.ofertaId, tenantId } })
  if (!oferta?.programId) throw httpErr(409, 'A oferta não está vinculada a um curso do Núcleo Acadêmico (programId).')
  const termId = params.termId ?? c.processo?.termId
  if (!termId) throw httpErr(409, 'Período letivo de ingresso não definido no processo seletivo.')
  const [program, term, clinic] = await Promise.all([
    prisma.academicProgram.findFirst({ where: { id: oferta.programId, tenantId } }),
    prisma.academicTerm.findFirst({ where: { id: termId, tenantId } }),
    prisma.clinic.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
  ])
  if (!program) throw httpErr(404, 'Curso (AcademicProgram) da oferta não encontrado.')
  if (!term) throw httpErr(404, 'Período letivo não encontrado.')
  if (!clinic) throw httpErr(409, 'Instituição (clinic) do tenant não encontrada.')
  const email = c.email.trim().toLowerCase()
  const existente = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
  if (existente) {
    // Nunca reaproveitar conta de equipe: evita sobrescrever senha/papel de um funcionário.
    if (String(existente.role).toUpperCase() !== 'STUDENT') throw httpErr(409, 'Este e-mail pertence a um usuário da equipe. Use outro e-mail para o aluno.')
    const jaAluno = await prisma.student.findFirst({ where: { userId: existente.id } })
    if (jaAluno) throw httpErr(409, 'Já existe aluno cadastrado com este e-mail.')
  }
  const senha = gerarSenhaProvisoria()
  const hash = await bcrypt.hash(senha, 10)
  const partes = c.nome.trim().split(/\s+/)
  const ano = new Date().getFullYear()
  const last = await prisma.student.findFirst({ where: { ra: { startsWith: String(ano) } }, orderBy: { ra: 'desc' }, select: { ra: true } })
  let seq = last ? parseInt(last.ra.slice(4), 10) || 0 : 0

  let result: { userId: string; studentId: string; enrollmentId: string; ra: string } | null = null
  for (let tentativa = 0; tentativa < 5 && !result; tentativa++) {
    const ra = proximoRA(ano, seq)
    try {
      result = await prisma.$transaction(async (tx) => {
        const user = existente
          ? existente
          : await tx.user.create({ data: { clinicId: clinic.id, tenantId, email, password: hash, firstName: partes[0], lastName: partes.slice(1).join(' ') || '-', role: 'STUDENT', phone: c.telefone ?? undefined } })
        const student = await tx.student.create({ data: { tenantId, userId: user.id, ra, nomeCompleto: c.nome, cpf: c.cpf, dataNascimento: c.dataNascimento } })
        const enr = await tx.enrollment.create({ data: { studentId: student.id, programId: program.id, termId: term.id } })
        return { userId: user.id, studentId: student.id, enrollmentId: enr.id, ra }
      })
    } catch (e: any) {
      if (e?.code === 'P2002' && String(e?.meta?.target ?? '').includes('ra')) { seq++; continue }
      throw e
    }
  }
  if (!result) throw httpErr(500, 'Não foi possível gerar um RA único.')

  // Mensalidades (replica o gerador do financeiro: parcelas com descrição "Mensalidade n/N — Curso")
  const dia = params.diaVencimento ?? 10
  const primeiro = params.primeiroVencimento ?? somarMeses(new Date(), 1, dia)
  const parcelas: any[] = []
  for (let i = 0; i < m.parcelas; i++) {
    parcelas.push(await prisma.accountReceivable.create({
      data: { tenantId, studentId: result.studentId, enrollmentId: result.enrollmentId, descricao: `Mensalidade ${i + 1}/${m.parcelas} — ${oferta.nomeCurso}`, numeroParcela: i + 1, valor: m.valorComDesconto, dataVencimento: somarMeses(primeiro, i, dia) },
    }))
  }
  // Taxa de inscrição paga passa a pertencer ao aluno
  if (c.taxaReceivableId) await prisma.accountReceivable.updateMany({ where: { id: c.taxaReceivableId, tenantId }, data: { studentId: result.studentId, enrollmentId: result.enrollmentId } })

  const mat = await prisma.admMatricula.update({
    where: { id: m.id },
    data: { status: 'CONCLUIDA', userId: result.userId, studentId: result.studentId, enrollmentId: result.enrollmentId, ra: result.ra, primeiraMensalidadeId: parcelas[0]?.id, concluidaEm: new Date() },
  })
  if (m.convocacaoId) await prisma.admConvocacao.updateMany({ where: { id: m.convocacaoId, tenantId }, data: { status: 'MATRICULADO' } })
  if (m.convocacaoId) await completeReminders({ tenantId, refType: 'AdmConvocacao', refId: m.convocacaoId, userId: params.userId })
  await mudarStatusCandidato({ tenantId, candidatoId: c.id, para: 'MATRICULADO', userId: params.userId, forcar: true })
  for (const bid of [m.bolsaId].filter(Boolean) as string[]) {
    await prisma.admBolsaConcessao.create({ data: { tenantId, bolsaId: bid, candidatoId: c.id, studentId: result.studentId, percentualAplicado: m.percentualDesconto, motivo: 'Matrícula', concedidaPorId: params.userId } })
  }
  await notify({
    tenantId, canal: 'EMAIL', destino: email, userId: result.userId, assunto: 'Matrícula concluída — seu acesso',
    mensagem: `Bem-vindo(a), ${c.nome}! Seu RA é ${result.ra}. Acesse com o e-mail ${email}; no primeiro acesso use "Esqueci minha senha" para definir a sua senha (a senha provisória foi entregue apenas à secretaria).`,
    templateKey: 'adm.matricula.concluida', refType: 'AdmMatricula', refId: m.id,
  })
  await audit({ tenantId, userId: params.userId, modulo: 'admissoes', acao: 'EFETIVAR_MATRICULA', refType: 'AdmMatricula', refId: m.id, detalhes: { ra: result.ra, studentId: result.studentId } })
  return { matricula: mat, ra: result.ra, studentId: result.studentId, enrollmentId: result.enrollmentId, userId: result.userId, senhaProvisoria: senha, parcelasGeradas: parcelas.length }
}
