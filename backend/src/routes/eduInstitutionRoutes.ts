import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as institution from '../controllers/eduInstitutionController'

// Rotas do EduMaster Pro — Personalização institucional (marca/logo,
// contato, polos e campi). Montadas em /api/edu/*. Autenticação e
// contexto de tenant já resolvidos pelos middlewares aplicados antes
// deste router em src/routes/index.ts.
const router = Router()

// Leitura liberada a qualquer usuário autenticado do tenant: é a
// identidade institucional pública (nome, endereço, logo, polos) que
// aparece no cabeçalho e no rodapé de todas as telas, inclusive para
// aluno/professor. Só a edição é restrita a quem administra a conta.
router.get('/edu/institution-profile', institution.getInstitutionProfile)
router.put('/edu/institution-profile', requirePermission('edu.institution.manage'), institution.updateInstitutionProfile)

router.get('/edu/campuses', institution.listCampuses)
router.post('/edu/campuses', requirePermission('edu.institution.manage'), institution.createCampus)
router.put('/edu/campuses/:id', requirePermission('edu.institution.manage'), institution.updateCampus)

export default router
