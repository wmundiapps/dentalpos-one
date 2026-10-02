import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, academicErrorHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { GESTAO, MOD } from './common'
import { QUALIS_PONTOS, CRITERIOS_PARECER } from './lib'
import mountPublicacoes from './publicacoes'
import mountProjetos from './projetos'
import mountEditais from './editais'
import mountTcc from './tcc'
import mountPeriodico from './periodico'
import mountEventos from './eventos'

export { publicRouter } from './public'

// Módulo "pesquisa" — produção científica, grupos, projetos, editais/bolsas, TCC/pós,
// periódico institucional (OJS) e eventos científicos. Montado em /api/edu/pesquisa.
const router = Router()

mountPublicacoes(router)
mountProjetos(router)
mountEditais(router)
mountTcc(router)
mountPeriodico(router)
mountEventos(router)

// Catálogos estáticos úteis para formulários do front.
router.get('/catalogos', (_req, res) => {
  res.json({
    qualis: Object.keys(QUALIS_PONTOS),
    qualisPontos: QUALIS_PONTOS,
    tiposPublicacao: ['ARTIGO', 'LIVRO', 'CAPITULO', 'TRABALHO_EVENTO', 'PATENTE', 'SOFTWARE', 'OUTRO'],
    tiposProjeto: ['IC', 'PIBIC', 'PIBITI', 'EXTENSAO', 'INOVACAO', 'PESQUISA', 'OUTRO'],
    tiposTrabalho: ['TCC', 'MONOGRAFIA', 'DISSERTACAO', 'TESE'],
    cicloTrabalho: ['TEMA', 'ORIENTACAO', 'PROJETO', 'QUALIFICACAO', 'BANCA_AGENDADA', 'DEFESA', 'VERSAO_FINAL', 'DEPOSITADO'],
    fluxoSubmissao: ['SUBMETIDO', 'TRIAGEM', 'EM_REVISAO', 'REVISOES_SOLICITADAS', 'ACEITO', 'REJEITADO', 'EDITORACAO', 'PUBLICADO'],
    criteriosParecer: CRITERIOS_PARECER,
  })
})

// Bootstrap idempotente: modelo de edital PIBIC (rascunho), periódico institucional modelo (inativo) e evento modelo (rascunho).
router.post(
  '/bootstrap',
  requireRole(...GESTAO),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const ano = new Date().getFullYear()
    const criados: string[] = []
    const edNum = `MODELO-PIBIC-${ano}`
    if (!(await prisma.pesEdital.findFirst({ where: { tenantId, numero: edNum } }))) {
      await prisma.pesEdital.create({
        data: {
          tenantId, numero: edNum, titulo: `Edital Modelo de Iniciação Científica ${ano}`, tipo: 'PIBIC', status: 'RASCUNHO', dataAbertura: new Date(Date.UTC(ano, 2, 1)), dataFechamento: new Date(Date.UTC(ano, 2, 31)), dataResultado: new Date(Date.UTC(ano, 3, 20)),
          vagas: 10, vagasSuplentes: 3, valorBolsa: 400, duracaoMeses: 12, notaMinima: 6,
          descricao: 'Modelo de edital interno para bolsas de iniciação científica. Ajuste vagas, valores e critérios antes de abrir.',
          requisitos: 'Docente com vínculo ativo e currículo Lattes atualizado; aluno regularmente matriculado, sem reprovação por falta no último semestre, com dedicação mínima de 20h semanais.',
          criterios: [{ nome: 'Mérito científico e originalidade', peso: 3, notaMax: 10 }, { nome: 'Viabilidade metodológica e cronograma', peso: 2, notaMax: 10 }, { nome: 'Produção científica do orientador (últimos 5 anos)', peso: 2, notaMax: 10 }, { nome: 'Impacto institucional / aderência às linhas de pesquisa', peso: 2, notaMax: 10 }, { nome: 'Desempenho acadêmico do candidato', peso: 1, notaMax: 10 }],
        },
      })
      criados.push('edital-modelo')
    }
    if (!(await prisma.pesPeriodico.findFirst({ where: { tenantId, slug: 'revista-institucional' } }))) {
      const p = await prisma.pesPeriodico.create({
        data: {
          tenantId, slug: 'revista-institucional', nome: 'Revista Científica Institucional', sigla: 'RCI', ativo: false, area: 'Multidisciplinar', duploCego: true, revisoresPorSubmissao: 2, prazoRevisaoDias: 30, prazoAutorDias: 30, periodicidade: 'Semestral', licenca: 'CC BY 4.0', politicaAcessoAberto: true,
          linhaEditorial: 'Divulgação de pesquisas originais, revisões e relatos de experiência produzidos na instituição e por parceiros.',
          escopo: 'Artigos originais, revisões sistemáticas/narrativas, relatos de caso e de experiência, resenhas.',
          normas: 'Manuscritos em PDF/DOCX, até 25 páginas, resumo (150-250 palavras) e 3-5 palavras-chave, referências em ABNT (NBR 6023). Submissão duplo-cega: remova identificação dos autores do arquivo. Declaração de originalidade e de conflitos de interesse obrigatória. Pesquisas com seres humanos/animais devem informar o parecer do CEP/CEUA.',
        },
      })
      await prisma.pesSecao.createMany({ data: [{ nome: 'Artigos Originais', ordem: 1 }, { nome: 'Revisões', ordem: 2 }, { nome: 'Relatos de Caso/Experiência', ordem: 3 }, { nome: 'Resenhas', ordem: 4 }, { nome: 'Editorial', ordem: 5, revisadaPorPares: false }].map((s) => ({ ...s, tenantId, periodicoId: p.id })) })
      criados.push('periodico-modelo')
    }
    const slugEv = `semana-academica-${ano}`
    if (!(await prisma.pesEvento.findFirst({ where: { tenantId, slug: slugEv } }))) {
      await prisma.pesEvento.create({ data: { tenantId, slug: slugEv, nome: `Semana Acadêmica e Jornada de Iniciação Científica ${ano}`, tipo: 'SEMANA_ACADEMICA', status: 'RASCUNHO', dataInicio: new Date(Date.UTC(ano, 9, 20)), dataFim: new Date(Date.UTC(ano, 9, 24)), prazoSubmissao: new Date(Date.UTC(ano, 8, 5)), prazoAvaliacao: new Date(Date.UTC(ano, 8, 25)), prazoResultado: new Date(Date.UTC(ano, 8, 30)), prazoCameraReady: new Date(Date.UTC(ano, 9, 10)), trilhas: ['Saúde', 'Educação', 'Tecnologia e Inovação', 'Gestão e Sociedade'], avaliadoresPorTrabalho: 2, notaMinimaAprovacao: 6, descricao: 'Modelo de evento científico com submissão de resumos, avaliação por pares e publicação de anais.' } })
      criados.push('evento-modelo')
    }
    await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BOOTSTRAP', detalhes: { criados } })
    res.json({ ok: true, criados, jaExistiam: criados.length === 0 })
  }),
)

router.use(academicErrorHandler)

export default router
