import { Router } from 'express'
import { requirePermission } from '../middleware/permission'
import * as content from '../controllers/eduContentController'

// Rotas do EduMaster Pro — Conteúdo e Biblioteca.
// Montadas em /api/edu/*. Autenticação e contexto de tenant já
// resolvidos pelos middlewares aplicados antes deste router em
// src/routes/index.ts.
const router = Router()

router.get('/edu/content-items', requirePermission('edu.content.view'), content.listContentItems)
router.post('/edu/content-items', requirePermission('edu.content.manage'), content.createContentItem)
router.post('/edu/content-items/:contentItemId/generate-summary-8020', requirePermission('edu.content.manage'), content.generateSummary8020)

router.get('/edu/flashcard-decks', requirePermission('edu.content.view'), content.listFlashcardDecks)
router.post('/edu/flashcard-decks', requirePermission('edu.content.manage'), content.createFlashcardDeck)
router.post('/edu/flashcard-decks/:deckId/cards', requirePermission('edu.content.manage'), content.addFlashcard)

// Fóruns são espaço de discussão de alunos e equipe: leitura e
// participação abertas a qualquer usuário autenticado do tenant
// (já resolvido pelos middlewares globais); só a criação do fórum
// em si é administrativa.
router.get('/edu/forums', content.listForums)
router.post('/edu/forums', requirePermission('edu.content.manage'), content.createForum)
router.get('/edu/forums/:forumId/topics', content.listForumTopics)
router.post('/edu/forums/:forumId/topics', content.createForumTopic)
router.post('/edu/forum-topics/:topicId/replies', content.replyForumTopic)

router.get('/edu/library-subscriptions', requirePermission('edu.library.manage'), content.listLibrarySubscriptions)
router.post('/edu/library-subscriptions', requirePermission('edu.library.manage'), content.createLibrarySubscription)

// Portal do aluno (self-service)
router.get('/edu/me/content-items', content.myContentItems)
router.put('/edu/me/content-items/:contentItemId/progress', content.updateMyContentProgress)
router.get('/edu/me/flashcard-decks/:deckId/due', content.myDueFlashcards)
router.post('/edu/me/flashcards/:flashcardId/review', content.reviewFlashcard)
router.get('/edu/me/library-subscription', content.myLibrarySubscription)

export default router
