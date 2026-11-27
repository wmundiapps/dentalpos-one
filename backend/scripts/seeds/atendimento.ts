/**
 * Seed de demonstração da CENTRAL DE ATENDIMENTO (EduMaster Pro). Usa a API REAL com token ADMIN, no estilo de scripts/edu-demo-seed.ts.
 * Uso a partir do edu-demo-seed (sem editá-lo):  import { seedAtendimento } from './seeds/atendimento'  ->  await seedAtendimento(c.api, c)
 * Uso isolado:  DATABASE_URL=... API_URL=http://localhost:3000/api npx tsx scripts/seeds/atendimento.ts   (login admin@suainstituicao.edu.br / Demo@2026)
 * Pré-requisito: alunos cadastrados (seed acadêmico). Todos os textos e contatos são FICTÍCIOS. Rodar em banco limpo.
 * Equipe criada (senha Demo@2026): atendimento@suainstituicao.edu.br e atendimento2@suainstituicao.edu.br (SUPPORT).
 */
export interface SeedCtx {
  tenantId?: string
  mk?: (email: string, password: string, firstName: string, lastName: string, role: string) => Promise<any>
  failures?: string[]
}
type Api = (method: string, path: string, body?: any) => Promise<any>

const A = '/edu/atendimento'
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')

export async function seedAtendimento(api: Api, ctx: SeedCtx = {}) {
  const S: Record<string, any> = {}
  const post = (p: string, b: any = {}) => api('POST', `${A}${p}`, b)
  const ok = <T,>(x: T | null | undefined, tag: string): T => { if (!x) ctx.failures?.push(`seedAtendimento: falhou ${tag}`); return x as T }

  // equipe
  const u1 = ctx.mk ? await ctx.mk('atendimento@suainstituicao.edu.br', 'Demo@2026', 'Juliana', 'Prado', 'SUPPORT') : null
  const u2 = ctx.mk ? await ctx.mk('atendimento2@suainstituicao.edu.br', 'Demo@2026', 'Marcos', 'Teixeira', 'SUPPORT') : null
  await post('/bootstrap')
  const setores: any[] = (await api('GET', `${A}/setores`)) ?? []
  const set = (c: string) => setores.find((s) => s.codigo === c)
  if (u1 && u2) for (const c of ['SECRETARIA', 'FINANCEIRO']) await api('PUT', `${A}/setores/${set(c)?.id}/membros`, { membros: [{ userId: u1.id, capacidade: 10 }, { userId: u2.id, capacidade: 10 }] })

  // IA: base de conhecimento e resposta automática no chat do portal e WhatsApp
  const kb: Array<[string, string, string, string, string[]]> = [
    ['FINANCEIRO', '2ª via de boleto', 'Como emitir a segunda via do boleto da mensalidade?', 'Acesse o portal do aluno > Serviços > 2ª via de boleto. As cobranças em aberto aparecem com o código para pagamento.', ['boleto', 'segunda via', 'mensalidade', 'pagamento']],
    ['ACADEMICO', 'Prazo de rematrícula', 'Qual o prazo para fazer a rematrícula?', 'A rematrícula do semestre seguinte ocorre de 1 a 30 de junho e de 1 a 30 de novembro, pelo portal do aluno.', ['rematricula', 'prazo', 'matricula', 'semestre']],
    ['DOCUMENTOS', 'Declaração de matrícula', 'Como obter a declaração de matrícula?', 'Pelo portal do aluno > Serviços > Declaração de matrícula. A emissão é imediata, em PDF com QR de verificação.', ['declaracao', 'matricula', 'vinculo', 'comprovante']],
    ['ACADEMICO', 'Trancamento', 'Como trancar a matrícula?', 'Abra o serviço "Trancamento de matrícula" no portal e envie os documentos pedidos. Você acompanha cada etapa pelo código de rastreio.', ['trancamento', 'trancar', 'matricula']],
    ['DOCUMENTOS', 'Histórico escolar', 'Como pedir o histórico escolar?', 'O histórico é emitido pelo portal (serviço "Histórico escolar"), com taxa conforme tabela vigente.', ['historico', 'escolar', 'notas']],
    ['TI_ACESSO', 'Senha do portal', 'Esqueci a senha do portal do aluno, e agora?', 'Na tela de login use "Esqueci minha senha". Se não receber o e-mail em 10 minutos, procure o suporte de TI.', ['senha', 'login', 'acesso', 'portal']],
    ['FINANCEIRO', 'Bolsas e descontos', 'Como solicitar bolsa ou desconto?', 'Abra um atendimento ao Financeiro informando o curso e a situação; a análise ocorre em até 5 dias úteis.', ['bolsa', 'desconto', 'financiamento']],
    ['GERAL', 'Biblioteca', 'Qual o horário da biblioteca?', 'De segunda a sexta, das 8h às 22h, e aos sábados, das 8h às 14h.', ['biblioteca', 'horario']],
  ]
  for (const [categoria, titulo, pergunta, resposta, palavrasChave] of kb) ok(await post('/conhecimento', { categoria, titulo, pergunta, resposta, palavrasChave }), `conhecimento ${titulo}`)
  await api('PUT', `${A}/ia/config`, { respostaAutomatica: true, confiancaMinima: 0.6, canaisAutomaticos: ['CHAT_PORTAL', 'WHATSAPP'] })

  // visibilidade das etapas para o solicitante (instituição esconde as etapas internas)
  await api('PUT', `${A}/etapas-config`, { etapas: [
    { codigo: 'CONFERENCIA', nome: 'Conferência de documentos', visivelSolicitante: true, mensagemPublica: 'Estamos conferindo os documentos enviados.', notificar: true },
    { codigo: 'PARECER_COORDENACAO', nome: 'Parecer da coordenação', visivelSolicitante: false, notificar: false },
    { codigo: 'ANALISE_FINANCEIRA', nome: 'Análise financeira', visivelSolicitante: false, notificar: false },
    { codigo: 'SECRETARIA', nome: 'Registro na secretaria', visivelSolicitante: true, mensagemPublica: 'Seu pedido está na fila de registro.', notificar: true },
  ] })

  // alunos
  const lista = await api('GET', '/edu/academico/students?pageSize=20')
  const alunos: any[] = Array.isArray(lista) ? lista : lista?.items ?? []
  if (!alunos.length) { ctx.failures?.push('seedAtendimento: sem alunos cadastrados (rode o seed acadêmico antes)'); return S }

  // caixa única: um atendimento em cada canal
  const entradas: Array<[string, string, string, string]> = [
    ['WHATSAPP', 'Carolina Matos', '+5511991110001', 'Oi! Como faço para emitir a segunda via do boleto da mensalidade?'],
    ['WHATSAPP', 'Rafael Duarte', '+5511991110002', 'Qual o prazo para fazer a rematrícula?'],
    ['WHATSAPP', 'Gabriela Torres', '+5511991110003', 'Meu orientador não responde e quero trocar de grupo de TCC'],
    ['EMAIL', 'Henrique Barros', 'henrique.barros@exemplo.com', 'Solicito o histórico escolar para processo seletivo de mestrado'],
    ['INSTAGRAM', 'perfil_marina', 'perfil_marina', 'Vocês têm curso de Odontologia à noite?'],
    ['FACEBOOK', 'Paulo Ricardo', 'fb-paulo-ricardo', 'Quando abre a inscrição do vestibular?'],
    ['WHATSAPP', 'Larissa Gomes', '+5511991110004', 'Preciso justificar faltas: tenho atestado médico de tratamento de depressão'],
  ]
  S.entradas = []
  for (const [canal, nome, contato, texto] of entradas) S.entradas.push(await post('/canais/simular-entrada', { canal, nome, contato, texto }))
  S.balcao = ok(await post('/atendimentos', { canal: 'BALCAO', solicitanteNome: alunos[0].nomeCompleto, studentId: alunos[0].id, assunto: 'Dúvida sobre estágio obrigatório', mensagem: 'Aluno pergunta quais documentos entregar para iniciar o estágio.', prioridade: 'NORMAL' }), 'balcao')
  S.telefone = ok(await post('/atendimentos', { canal: 'TELEFONE', solicitanteNome: 'Responsável por aluno', solicitanteContato: '(11) 3000-1234', assunto: 'Ligação: dúvida sobre financiamento estudantil', prioridade: 'ALTA' }), 'telefone')
  // atendimento resolvido com avaliação (CSAT)
  if (S.balcao) {
    await post(`/atendimentos/${S.balcao.id}/mensagens`, { conteudo: 'Para iniciar o estágio entregue o termo assinado e o seguro. Posso agendar com a coordenação?' })
    await post(`/atendimentos/${S.balcao.id}/resolver`, { observacao: 'Orientado; encaminhado à coordenação de estágio.' })
    await post(`/atendimentos/${S.balcao.id}/avaliacao`, { nota: 5, comentario: 'Atendimento muito claro.' })
  }
  if (S.telefone) { await post(`/atendimentos/${S.telefone.id}/mensagens`, { conteudo: 'Enviamos o passo a passo do FIES por e-mail.' }); await post(`/atendimentos/${S.telefone.id}/resolver`, {}); await post(`/atendimentos/${S.telefone.id}/avaliacao`, { nota: 4 }) }
  // transferência entre setores
  const w3 = S.entradas[2]?.atendimentoId
  if (w3 && set('COORDENACAO')) await post(`/atendimentos/${w3}/transferir`, { setorId: set('COORDENACAO').id, motivo: 'Troca de orientador é tratada pela coordenação do curso' })

  // catálogo extra
  const serv: any[] = (await api('GET', `${A}/servicos`)) ?? []
  const sv = (c: string) => serv.find((s) => s.codigo === c)
  ok(await post('/servicos', {
    codigo: 'REVISAO_DE_PROVA', nome: 'Revisão de prova', descricao: 'Solicite a revisão da nota de uma avaliação.', categoria: 'ACADEMICO', autoatendimento: true, prazoDias: 6, setorId: set('COORDENACAO')?.id,
    etapas: [{ codigo: 'RECEBIDO', nome: 'Recebido' }, { codigo: 'CONFERENCIA', nome: 'Conferência de documentos', prazoDias: 1 }, { codigo: 'PARECER_COORDENACAO', nome: 'Parecer da coordenação', prazoDias: 4 }, { codigo: 'ENTREGUE', nome: 'Resultado informado' }],
    documentos: [{ titulo: 'Cópia da prova', obrigatorio: true }, { titulo: 'Justificativa do pedido', obrigatorio: false }],
  }), 'servico revisao')
  ok(await post('/servicos', { codigo: 'HISTORICO_COM_TAXA', nome: 'Histórico escolar (via oficial com taxa)', descricao: 'Emitido após a confirmação do pagamento da taxa.', categoria: 'DOCUMENTO', autoatendimento: true, automacao: 'EMITIR_DOCUMENTO', modeloId: sv('HISTORICO_ESCOLAR')?.modeloId, taxa: 30, prazoDias: 2, setorId: set('SECRETARIA')?.id, etapas: [{ codigo: 'RECEBIDO', nome: 'Recebido' }, { codigo: 'PRONTO', nome: 'Pronto' }, { codigo: 'ENTREGUE', nome: 'Entregue' }] }), 'servico taxa')

  // protocolos em andamento (a jornada aparece na tela e no rastreio público)
  S.protocolos = []
  const al = (i: number) => alunos[i % alunos.length]
  const trancamento = ok(await post('/protocolos', { servicoId: sv('TRANCAMENTO_MATRICULA')?.id, studentId: al(1).id, descricao: 'Trancamento por motivo de trabalho.', solicitanteEmail: 'aluno.demo@exemplo.com', solicitanteTelefone: '+5511990001111' }), 'protocolo trancamento')
  if (trancamento) {
    S.protocolos.push(trancamento)
    const d = await api('GET', `${A}/protocolos/${trancamento.id}`)
    const obrig = (d?.documentos ?? []).filter((x: any) => x.obrigatorio)
    if (obrig[0]) {
      const r = await post(`/protocolos/${trancamento.id}/documentos`, { docId: obrig[0].id, arquivoNome: 'requerimento-assinado.pdf', dataUrl: PDF, origem: 'BALCAO' })
      if (r?.id) await post(`/documentos/${r.id}/conferir`, { decisao: 'REJEITAR', motivo: 'Requerimento sem assinatura do aluno.', prazoDias: 5 })
    }
  }
  const revisao = ok(await post('/protocolos', { assunto: 'Revisão de prova de Anatomia', servicoId: (await api('GET', `${A}/servicos`))?.find((s: any) => s.codigo === 'REVISAO_DE_PROVA')?.id, studentId: al(2).id, solicitanteTelefone: '+5511990002222' }), 'protocolo revisao')
  if (revisao) {
    S.protocolos.push(revisao)
    const d = await api('GET', `${A}/protocolos/${revisao.id}`)
    const obrig = (d?.documentos ?? []).find((x: any) => x.obrigatorio)
    if (obrig) { const r = await post(`/protocolos/${revisao.id}/documentos`, { docId: obrig.id, arquivoNome: 'prova-anatomia.pdf', dataUrl: PDF, origem: 'PORTAL' }); if (r?.id) await post(`/documentos/${r.id}/conferir`, { decisao: 'APROVAR' }) }
    await post(`/protocolos/${revisao.id}/avancar`, { observacao: 'Documentos conferidos.' })
  }
  const taxa = ok(await post('/protocolos', { servicoId: (await api('GET', `${A}/servicos`))?.find((s: any) => s.codigo === 'HISTORICO_COM_TAXA')?.id, studentId: al(3).id }), 'protocolo taxa')
  if (taxa) S.protocolos.push(taxa)
  const imediato = ok(await post('/protocolos', { servicoId: sv('DECLARACAO_MATRICULA')?.id, studentId: al(0).id }), 'protocolo declaracao')
  if (imediato) S.protocolos.push(imediato)

  // emissão avulsa pela secretaria (aparece em "Emissão de documentos")
  const modelos: any[] = (await api('GET', `${A}/modelos-documento`)) ?? []
  const mod = (c: string) => modelos.find((m) => m.codigo === c)
  S.docs = []
  for (const [i, c] of ['DECL_VINCULO', 'ATESTADO_FREQUENCIA', 'TERMO_CIENCIA', 'DECL_MATRICULA'].entries()) {
    const d = await post('/documentos-emitidos', { modeloId: mod(c)?.id, studentId: al(i + 4).id, extras: { finalidade: 'apresentação ao empregador' } })
    if (d?.id) S.docs.push(d)
  }
  if (S.docs[0]) await post(`/documentos-emitidos/${S.docs[0].id}/segunda-via`, { motivo: 'Aluno solicitou nova via por perda.' })
  return S
}

// execução isolada
if (require.main === module) {
  ;(async () => {
    const API = process.env.API_URL || 'http://localhost:3000/api'
    const { prisma } = await import('../../src/lib/prisma')
    const bcrypt = await import('bcryptjs')
    const clinic = await prisma.clinic.findFirst({ where: { tenantId: 'sua-instituicao' } })
    if (!clinic) throw new Error('Clínica sua-instituicao não encontrada: rode o edu-demo-seed antes.')
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: clinic.id, email: 'admin@suainstituicao.edu.br', password: 'Demo@2026' }) })
    const j: any = await r.json()
    if (!r.ok) throw new Error('login: ' + JSON.stringify(j))
    const api: Api = async (method, path, body) => { const x = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${j.token}` }, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await x.json().catch(() => null); if (!x.ok) console.log('!!', method, path, x.status, JSON.stringify(t)?.slice(0, 200)); return x.ok ? t : null }
    const mk = async (email: string, password: string, firstName: string, lastName: string, role: string) => {
      const ex = await prisma.user.findFirst({ where: { clinicId: clinic.id, email } })
      return ex ?? prisma.user.create({ data: { clinicId: clinic.id, tenantId: clinic.tenantId, email, password: await bcrypt.hash(password, 10), firstName, lastName, role, isActive: true } as any })
    }
    const failures: string[] = []
    await seedAtendimento(api, { tenantId: clinic.tenantId, mk, failures })
    console.log(failures.length ? 'Falhas:\n' + failures.join('\n') : 'Seed de atendimento concluído.')
    await prisma.$disconnect()
  })().catch((e) => { console.error(e); process.exit(1) })
}
