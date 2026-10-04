import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { MODULO, tid } from './common'

const SETORES = [
  { codigo: 'SECRETARIA', nome: 'Secretaria Acadêmica', slaDias: 5 }, { codigo: 'FINANCEIRO', nome: 'Financeiro / Tesouraria', slaDias: 5 },
  { codigo: 'COORDENACAO', nome: 'Coordenações de Curso', slaDias: 7 }, { codigo: 'BIBLIOTECA', nome: 'Biblioteca', slaDias: 7 },
  { codigo: 'INFRA', nome: 'Infraestrutura e Manutenção', slaDias: 10 }, { codigo: 'TI', nome: 'Tecnologia da Informação', slaDias: 7 },
  { codigo: 'RH', nome: 'Recursos Humanos', slaDias: 10 }, { codigo: 'NAE', nome: 'Núcleo de Apoio ao Estudante (NAE/NAPNE)', slaDias: 7 },
  { codigo: 'COMUNICACAO', nome: 'Comunicação e Marketing', slaDias: 10 }, { codigo: 'DIRETORIA', nome: 'Direção / Reitoria', slaDias: 15 },
]

const PROGRAMAS = [
  { nome: 'Bolsa Mérito Acadêmico', tipo: 'MERITO', descricao: 'Desconto para estudantes com excelente desempenho.', percentualDesconto: 20, vagas: 20, mediaMinima: 8.5, frequenciaMinima: 90, vigenciaMeses: 6, renovacaoAntecedenciaDias: 30, criterios: { documentos: [] } },
  { nome: 'Bolsa Socioeconômica', tipo: 'SOCIOECONOMICA', descricao: 'Apoio a estudantes em vulnerabilidade socioeconômica.', percentualDesconto: 30, vagas: 30, rendaPerCapitaMaxSM: 1.5, mediaMinima: 6, frequenciaMinima: 75, vigenciaMeses: 6, renovacaoAntecedenciaDias: 30, criterios: { documentos: ['COMPROVANTE_RENDA', 'COMPROVANTE_RESIDENCIA', 'DOCUMENTO_FAMILIARES'] } },
  { nome: 'Auxílio Permanência (alimentação/transporte)', tipo: 'PERMANENCIA', descricao: 'Auxílio mensal em valor para custear alimentação e transporte.', percentualDesconto: 0, valorMensal: 300, vagas: 15, rendaPerCapitaMaxSM: 1, frequenciaMinima: 75, vigenciaMeses: 6, renovacaoAntecedenciaDias: 30, criterios: { documentos: ['COMPROVANTE_RENDA', 'COMPROVANTE_RESIDENCIA'] } },
  { nome: 'Bolsa Monitoria', tipo: 'MONITORIA', descricao: 'Desconto para monitores de disciplinas.', percentualDesconto: 15, vagas: 20, mediaMinima: 7, frequenciaMinima: 85, vigenciaMeses: 6, renovacaoAntecedenciaDias: 20, criterios: { documentos: [] } },
]

const ESC = (id: string, texto: string, obrigatoria = true) => ({ id, texto, tipo: 'ESCALA' as const, obrigatoria })
const INSTRUMENTOS = [
  { nome: 'Avaliação Docente (padrão)', finalidade: 'AVALIACAO_DOCENTE', descricao: 'Instrumento padrão de avaliação do professor pelos alunos.', anonimo: true, minRespostas: 5, escalaMax: 5, perguntas: [
    ESC('dominio', 'O professor demonstra domínio do conteúdo.'), ESC('didatica', 'A didática facilita minha aprendizagem.'), ESC('clareza', 'Os objetivos e critérios de avaliação foram claros.'),
    ESC('pontualidade', 'O professor é pontual e cumpre o plano de ensino.'), ESC('respeito', 'Há respeito e abertura para o diálogo em sala.'), ESC('feedback', 'Recebo retorno adequado sobre minhas avaliações.'),
    { id: 'nps', texto: 'De 0 a 10, o quanto você recomendaria este professor a um colega?', tipo: 'NPS' as const, obrigatoria: false }, { id: 'comentario', texto: 'Comentários e sugestões', tipo: 'TEXTO' as const } ] },
  { nome: 'Satisfação com Serviços (NPS)', finalidade: 'SATISFACAO_SERVICO', descricao: 'Pesquisa de satisfação de serviços da instituição.', anonimo: true, minRespostas: 10, escalaMax: 5, perguntas: [
    ESC('atendimento', 'Atendimento recebido.'), ESC('agilidade', 'Agilidade na solução.'), ESC('clareza', 'Clareza das informações.'),
    { id: 'nps', texto: 'De 0 a 10, o quanto você recomendaria a instituição?', tipo: 'NPS' as const, obrigatoria: true }, { id: 'comentario', texto: 'O que podemos melhorar?', tipo: 'TEXTO' as const } ] },
  { nome: 'Satisfação com a Disciplina', finalidade: 'SATISFACAO_DISCIPLINA', descricao: 'Avaliação da disciplina (conteúdo, material, carga de trabalho).', anonimo: true, minRespostas: 5, escalaMax: 5, perguntas: [
    ESC('conteudo', 'O conteúdo é relevante para minha formação.'), ESC('material', 'O material de apoio é adequado.'), ESC('carga', 'A carga de trabalho é compatível com a carga horária.'), ESC('avaliacoes', 'As avaliações refletem o conteúdo trabalhado.'),
    { id: 'nps', texto: 'De 0 a 10, você recomendaria esta disciplina?', tipo: 'NPS' as const }, { id: 'comentario', texto: 'Comentários', tipo: 'TEXTO' as const } ] },
  { nome: 'Pesquisa de Egressos', finalidade: 'EGRESSOS', descricao: 'Acompanhamento da trajetória profissional e da formação recebida.', anonimo: false, minRespostas: 1, escalaMax: 5, perguntas: [
    { id: 'situacao', texto: 'Situação profissional atual', tipo: 'MULTIPLA' as const, opcoes: ['Empregado(a)', 'Autônomo(a)', 'Empreendedor(a)', 'Desempregado(a)', 'Estudando', 'Outra'], obrigatoria: true },
    { id: 'atuaArea', texto: 'Você atua na área de formação?', tipo: 'SIM_NAO' as const, obrigatoria: true }, ESC('formacao', 'A formação recebida me preparou para o mercado.'), ESC('infra', 'Avalio positivamente a infraestrutura que utilizei.'),
    { id: 'nps', texto: 'De 0 a 10, você recomendaria a instituição?', tipo: 'NPS' as const }, { id: 'comentario', texto: 'Sugestões para melhorar os cursos', tipo: 'TEXTO' as const } ] },
]

// Idempotente: cria apenas o que ainda não existe (chave: código/nome).
export async function bootstrapApoio(tenantId: string) {
  const r = { setores: 0, programasBolsa: 0, instrumentos: 0 }
  for (const s of SETORES) {
    const ex = await prisma.apoSetorOuvidoria.findFirst({ where: { tenantId, codigo: s.codigo }, select: { id: true } })
    if (!ex) { await prisma.apoSetorOuvidoria.create({ data: { tenantId, ...s } }); r.setores++ }
  }
  for (const p of PROGRAMAS) {
    const ex = await prisma.apoProgramaBolsa.findFirst({ where: { tenantId, nome: p.nome }, select: { id: true } })
    if (!ex) { await prisma.apoProgramaBolsa.create({ data: { tenantId, ...p } as any }); r.programasBolsa++ }
  }
  for (const i of INSTRUMENTOS) {
    const ex = await prisma.apoInstrumento.findFirst({ where: { tenantId, nome: i.nome }, select: { id: true } })
    if (!ex) { await prisma.apoInstrumento.create({ data: { tenantId, ...i, perguntas: i.perguntas as any } as any }); r.instrumentos++ }
  }
  return r
}

export function mountBootstrap(router: Router) {
  router.post('/bootstrap', requireRole('SUPPORT', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const r = await bootstrapApoio(tenantId)
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BOOTSTRAP', detalhes: r })
    res.json({ ok: true, criados: r })
  }))
}
