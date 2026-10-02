import { Router } from 'express'
import { eduContext } from './academico/middleware'
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

// Agregador de todos os módulos EduMaster Pro. Montado em /api/edu (autenticado).
const router = Router()
router.use(eduContext)

router.use('/core', coreRouter)
router.use('/academico', academicoRouter)
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
