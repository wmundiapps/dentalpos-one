import { Router } from 'express'
import { eduContext } from './academico/middleware'
import academicoRouter from './academico/routes'
import financeiroRouter from './financeiro/routes'
import conteudoRouter from './conteudo/routes'
import provasRouter from './provas-ia/routes'

// Agregador de todos os módulos EduMaster Pro. Montado em /api/edu.
// Novos módulos entram aqui (um router por domínio).
const router = Router()

router.use(eduContext)

router.use('/academico', academicoRouter)
router.use('/financeiro', financeiroRouter)
router.use('/conteudo', conteudoRouter)
router.use('/provas', provasRouter)

export default router
