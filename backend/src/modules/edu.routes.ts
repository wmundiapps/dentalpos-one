import { Router } from 'express'
import { eduContext, academicErrorHandler } from './academico/middleware'
import academicoRouter from './academico/routes'
import financeiroRouter from './financeiro/routes'
import conteudoRouter from './conteudo/routes'
import provasRouter from './provas-ia/routes'
import coreRouter from './core/routes'
import admissoesRouter, { publicRouter as admissoesPublic } from './admissoes/routes'
import secretariaRouter, { publicRouter as secretariaPublic } from './secretaria/routes'
import calendarioRouter, { publicRouter as calendarioPublic } from './calendario/routes'
import notasRouter, { publicRouter as notasPublic } from './notas/routes'
import infraestruturaRouter, { publicRouter as infraestruturaPublic } from './infraestrutura/routes'
import suprimentosRouter, { publicRouter as suprimentosPublic } from './suprimentos/routes'
import regulatorioRouter, { publicRouter as regulatorioPublic } from './regulatorio/routes'
import governancaRouter, { publicRouter as governancaPublic } from './governanca/routes'
import desempenhoRouter, { publicRouter as desempenhoPublic } from './desempenho/routes'
import pesquisaRouter, { publicRouter as pesquisaPublic } from './pesquisa/routes'
import apoioRouter, { publicRouter as apoioPublic } from './apoio/routes'
import comunicacaoRouter, { publicRouter as comunicacaoPublic } from './comunicacao/routes'
import bibliotecaRouter, { publicRouter as bibliotecaPublic } from './biblioteca/routes'
import jornadasRouter, { publicRouter as jornadasPublic } from './jornadas/routes'
import modalidadesRouter, { publicRouter as modalidadesPublic } from './modalidades/routes'
import reitoriaRouter, { publicRouter as reitoriaPublic } from './reitoria/routes'
import rhRouter from './rh/routes'
import lgpdRouter, { publicRouter as lgpdPublic } from './lgpd/routes'
import tesourariaRouter from './tesouraria/routes'
import cobrancaRouter from './cobranca/routes'
import { acessoSensivelLog } from './lgpd/sensiveis'
import juridicoRouter from './juridico/routes'
import atendimentoRouter, { publicRouter as atendimentoPublic } from './atendimento/routes'
import marketingRouter, { publicRouter as marketingPublic } from './marketing/routes'
import feedbackRouter from './feedback/routes'
import portal2Router, { publicRouter as portal2Public, ambienteContext } from './portal2/routes'
import presencaRouter from './presenca/routes'
import { academico2Router, desenvolvimentoRouter } from './academico2/routes'

// Agregador de todos os módulos EduMaster Pro. Montado em /api/edu (autenticado).
const router = Router()
router.use(eduContext)
// Ambiente de ensino atual (cabeçalho X-Edu-Ambiente ou contexto salvo): filtra listas por curso. Ver modules/portal2/README.md.
router.use(ambienteContext)
// LGPD: registra quem acessa dados sensíveis (apoio/atendimentos, AEE, ocorrências, bolsas) - não altera a resposta.
router.use(acessoSensivelLog)

router.use('/core', coreRouter)
router.use('/academico', academicoRouter)
router.use('/academico', academico2Router)
router.use('/desenvolvimento', desenvolvimentoRouter)
router.use('/financeiro', financeiroRouter)
router.use('/conteudo', conteudoRouter)
router.use('/provas', provasRouter)
router.use('/admissoes', admissoesRouter)
router.use('/secretaria', secretariaRouter)
router.use('/calendario', calendarioRouter)
router.use('/notas', notasRouter)
router.use('/infraestrutura', infraestruturaRouter)
router.use('/suprimentos', suprimentosRouter)
router.use('/regulatorio', regulatorioRouter)
router.use('/governanca', governancaRouter)
router.use('/desempenho', desempenhoRouter)
router.use('/pesquisa', pesquisaRouter)
router.use('/apoio', apoioRouter)
router.use('/comunicacao', comunicacaoRouter)
router.use('/biblioteca', bibliotecaRouter)
router.use('/jornadas', jornadasRouter)
router.use('/modalidades', modalidadesRouter)
router.use('/reitoria', reitoriaRouter)
router.use('/lgpd', lgpdRouter)
router.use('/rh', rhRouter)
router.use('/juridico', juridicoRouter)
router.use('/atendimento', atendimentoRouter)
router.use('/marketing', marketingRouter)
router.use('/feedback', feedbackRouter)
router.use('/portal2', portal2Router)
router.use('/presenca', presencaRouter)
router.use('/tesouraria', tesourariaRouter)
router.use('/cobranca', cobrancaRouter)
// Converte erros com .status (validação 400, 404, 409...) em respostas 4xx em vez de 500 genérico.
router.use(academicErrorHandler)

export default router

// Rotas públicas (sem login): inscrição de vestibular, validação de certificados,
// ouvidoria, webhooks de canais... Montado em /api/public/edu.
export const eduPublicRouter = Router()
eduPublicRouter.use('/admissoes', admissoesPublic)
eduPublicRouter.use('/secretaria', secretariaPublic)
eduPublicRouter.use('/calendario', calendarioPublic)
eduPublicRouter.use('/notas', notasPublic)
eduPublicRouter.use('/infraestrutura', infraestruturaPublic)
eduPublicRouter.use('/suprimentos', suprimentosPublic)
eduPublicRouter.use('/regulatorio', regulatorioPublic)
eduPublicRouter.use('/governanca', governancaPublic)
eduPublicRouter.use('/desempenho', desempenhoPublic)
eduPublicRouter.use('/pesquisa', pesquisaPublic)
eduPublicRouter.use('/apoio', apoioPublic)
eduPublicRouter.use('/comunicacao', comunicacaoPublic)
eduPublicRouter.use('/biblioteca', bibliotecaPublic)
eduPublicRouter.use('/jornadas', jornadasPublic)
eduPublicRouter.use('/modalidades', modalidadesPublic)
eduPublicRouter.use('/reitoria', reitoriaPublic)
eduPublicRouter.use('/lgpd', lgpdPublic)
eduPublicRouter.use('/atendimento', atendimentoPublic)
eduPublicRouter.use('/marketing', marketingPublic)
eduPublicRouter.use('/portal2', portal2Public)
eduPublicRouter.use(academicErrorHandler)
