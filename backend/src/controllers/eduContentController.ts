import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  contentItemSchema,
  contentProgressSchema,
  flashcardDeckSchema,
  flashcardReviewSchema,
  flashcardSchema,
  forumReplySchema,
  forumSchema,
  forumTopicSchema,
  librarySubscriptionSchema
} from '../validators/eduContentValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

async function myStudent(req: AuthRequest) {
  const { clinicId, tenantId } = ctx(req)
  if (!req.user) return null
  return prisma.eduStudent.findFirst({ where: { clinicId, tenantId, userId: req.user.id } })
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// AMBIENTE DE APRENDIZAGEM (conteúdo com progresso por aluno)
// ---------------------------------------------------------------

export async function listContentItems(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined
    const rows = await prisma.eduContentItem.findMany({
      where: { clinicId, tenantId, isActive: true, ...(subjectId ? { subjectId } : {}), ...(classId ? { classId } : {}) },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar conteúdos.' })
  }
}

export async function createContentItem(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = contentItemSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados do conteúdo inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduContentItem.create({ data: { clinicId, tenantId, createdById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CONTENT_CREATE', entityType: 'EduContentItem', entityId: row.id, summary: `Conteúdo "${row.title}" publicado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar conteúdo.' })
  }
}

export async function myContentItems(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const classIds = (await prisma.eduClassEnrollment.findMany({ where: { studentId: student.id }, select: { classId: true } })).map(row => row.classId)
    const rows = await prisma.eduContentItem.findMany({
      where: { clinicId, tenantId, isActive: true, OR: [{ classId: { in: classIds } }, { classId: null }] },
      include: { progress: { where: { studentId: student.id } } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
    })
    return res.json(rows.map(row => ({ ...row, myProgress: row.progress[0] || null })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar conteúdos do aluno.' })
  }
}

export async function updateMyContentProgress(req: AuthRequest, res: Response) {
  try {
    const contentItemId = String(req.params.contentItemId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const item = await prisma.eduContentItem.findFirst({ where: { id: contentItemId, clinicId: student.clinicId, tenantId: student.tenantId } })
    if (!item) return res.status(404).json({ error: 'Conteúdo não encontrado.' })

    const parsed = contentProgressSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduContentProgress.upsert({
      where: { contentItemId_studentId: { contentItemId, studentId: student.id } },
      create: { contentItemId, studentId: student.id, ...parsed.data, completedAt: parsed.data.status === 'CONCLUIDO' ? new Date() : undefined },
      update: { ...parsed.data, completedAt: parsed.data.status === 'CONCLUIDO' ? new Date() : null }
    })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar progresso.' })
  }
}

// ---------------------------------------------------------------
// FLASHCARDS (SM-2)
// ---------------------------------------------------------------

export async function listFlashcardDecks(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined
    const rows = await prisma.eduFlashcardDeck.findMany({
      where: { clinicId, tenantId, isActive: true, ...(subjectId ? { subjectId } : {}) },
      include: { _count: { select: { cards: true } } },
      orderBy: { title: 'asc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar decks de flashcards.' })
  }
}

export async function createFlashcardDeck(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = flashcardDeckSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduFlashcardDeck.create({ data: { clinicId, tenantId, createdById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FLASHCARD_DECK_CREATE', entityType: 'EduFlashcardDeck', entityId: row.id, summary: `Deck "${row.title}" criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar deck de flashcards.' })
  }
}

export async function addFlashcard(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const deckId = String(req.params.deckId)
    const deck = await prisma.eduFlashcardDeck.findFirst({ where: { id: deckId, clinicId, tenantId } })
    if (!deck) return res.status(404).json({ error: 'Deck não encontrado.' })

    const parsed = flashcardSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduFlashcard.create({ data: { deckId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FLASHCARD_CREATE', entityType: 'EduFlashcard', entityId: row.id, summary: `Flashcard incluído no deck ${deck.title}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar flashcard.' })
  }
}

export async function myDueFlashcards(req: AuthRequest, res: Response) {
  try {
    const deckId = String(req.params.deckId)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const deck = await prisma.eduFlashcardDeck.findFirst({ where: { id: deckId, clinicId: student.clinicId, tenantId: student.tenantId } })
    if (!deck) return res.status(404).json({ error: 'Deck não encontrado.' })

    const cards = await prisma.eduFlashcard.findMany({
      where: { deckId },
      include: { reviews: { where: { studentId: student.id } } },
      orderBy: { order: 'asc' }
    })
    const now = new Date()
    const due = cards.filter(card => {
      const review = card.reviews[0]
      return !review || review.dueDate <= now
    })
    return res.json(due.map(card => ({ id: card.id, front: card.front, back: card.back, review: card.reviews[0] || null })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar flashcards pendentes.' })
  }
}

// Algoritmo SM-2 (SuperMemo 2) — repetição espaçada por aluno.
function applySm2(previous: { easeFactor: number; intervalDays: number; repetitions: number } | null, quality: number) {
  const easeFactorPrev = previous?.easeFactor ?? 2.5
  const repetitionsPrev = previous?.repetitions ?? 0

  if (quality < 3) {
    return { easeFactor: Math.max(1.3, easeFactorPrev), intervalDays: 1, repetitions: 0 }
  }

  const repetitions = repetitionsPrev + 1
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round((previous?.intervalDays ?? 1) * easeFactorPrev)
  const easeFactor = Math.max(1.3, easeFactorPrev + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

  return { easeFactor, intervalDays, repetitions }
}

export async function reviewFlashcard(req: AuthRequest, res: Response) {
  try {
    const flashcardId = String(req.params.flashcardId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const card = await prisma.eduFlashcard.findFirst({ where: { id: flashcardId, deck: { clinicId: student.clinicId, tenantId: student.tenantId } } })
    if (!card) return res.status(404).json({ error: 'Flashcard não encontrado.' })

    const parsed = flashcardReviewSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const existing = await prisma.eduFlashcardReview.findFirst({ where: { flashcardId, studentId: student.id } })
    const next = applySm2(existing, parsed.data.quality)
    const dueDate = new Date(Date.now() + next.intervalDays * 24 * 60 * 60 * 1000)

    const row = await prisma.eduFlashcardReview.upsert({
      where: { flashcardId_studentId: { flashcardId, studentId: student.id } },
      create: { flashcardId, studentId: student.id, ...next, dueDate, lastQuality: parsed.data.quality, lastReviewedAt: new Date() },
      update: { ...next, dueDate, lastQuality: parsed.data.quality, lastReviewedAt: new Date() }
    })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao registrar revisão do flashcard.' })
  }
}

// ---------------------------------------------------------------
// FÓRUNS
// ---------------------------------------------------------------

export async function listForums(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined
    const rows = await prisma.eduForum.findMany({
      where: { clinicId, tenantId, isActive: true, ...(classId ? { classId } : {}) },
      include: { _count: { select: { topics: true } } },
      orderBy: { title: 'asc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar fóruns.' })
  }
}

export async function createForum(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = forumSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduForum.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORUM_CREATE', entityType: 'EduForum', entityId: row.id, summary: `Fórum "${row.title}" criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar fórum.' })
  }
}

export async function listForumTopics(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const forumId = String(req.params.forumId)
    const forum = await prisma.eduForum.findFirst({ where: { id: forumId, clinicId, tenantId } })
    if (!forum) return res.status(404).json({ error: 'Fórum não encontrado.' })

    const rows = await prisma.eduForumTopic.findMany({ where: { forumId }, include: { _count: { select: { replies: true } } }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar tópicos do fórum.' })
  }
}

async function resolveAuthor(req: AuthRequest) {
  const student = await myStudent(req)
  if (student) return { authorStudentId: student.id, authorUserId: null as string | null, authorName: student.fullName }
  const staffUser = await prisma.user.findFirst({ where: { id: req.user!.id } })
  return { authorStudentId: null as string | null, authorUserId: req.user!.id, authorName: staffUser ? `${staffUser.firstName} ${staffUser.lastName}` : 'Equipe' }
}

export async function createForumTopic(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const forumId = String(req.params.forumId)
    const forum = await prisma.eduForum.findFirst({ where: { id: forumId, clinicId, tenantId } })
    if (!forum) return res.status(404).json({ error: 'Fórum não encontrado.' })
    if (!forum.isActive) return res.status(409).json({ error: 'Fórum está desativado.' })

    const parsed = forumTopicSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const author = await resolveAuthor(req)
    const row = await prisma.eduForumTopic.create({ data: { forumId, ...author, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORUM_TOPIC_CREATE', entityType: 'EduForumTopic', entityId: row.id, summary: `${author.authorName} abriu tópico "${row.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar tópico.' })
  }
}

export async function replyForumTopic(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const topicId = String(req.params.topicId)
    const topic = await prisma.eduForumTopic.findFirst({ where: { id: topicId, forum: { clinicId, tenantId } } })
    if (!topic) return res.status(404).json({ error: 'Tópico não encontrado.' })
    if (topic.isLocked) return res.status(409).json({ error: 'Tópico está travado para novas respostas.' })

    const parsed = forumReplySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const author = await resolveAuthor(req)
    const row = await prisma.eduForumReply.create({ data: { topicId, ...author, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORUM_REPLY_CREATE', entityType: 'EduForumReply', entityId: row.id, summary: `${author.authorName} respondeu ao tópico "${topic.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao responder tópico.' })
  }
}

// ---------------------------------------------------------------
// BIBLIOTECA TERCEIRIZADA (assinatura institucional ou individual)
// ---------------------------------------------------------------

export async function listLibrarySubscriptions(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduLibrarySubscription.findMany({ where: { clinicId, tenantId }, include: { student: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar assinaturas da biblioteca.' })
  }
}

export async function createLibrarySubscription(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = librarySubscriptionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    let student: Awaited<ReturnType<typeof prisma.eduStudent.findFirst>> = null
    if (parsed.data.studentId) {
      student = await prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } })
      if (!student) return res.status(400).json({ error: 'Aluno inválido.' })
    }

    const subscription = await prisma.eduLibrarySubscription.create({
      data: {
        clinicId, tenantId, createdById: actorId, studentId: parsed.data.studentId, scope: parsed.data.scope,
        provider: parsed.data.provider, plan: parsed.data.plan, amount: parsed.data.amount,
        status: parsed.data.scope === 'INDIVIDUAL' && parsed.data.amount > 0 ? 'PENDENTE_PAGAMENTO' : 'ATIVA',
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined
      }
    })

    // Assinatura individual paga gera conta a receber no Financeiro compartilhado (FinancialEntry).
    let updatedSubscription = subscription
    if (parsed.data.scope === 'INDIVIDUAL' && parsed.data.amount > 0 && student) {
      const financialEntry = await prisma.financialEntry.create({
        data: {
          clinicId, tenantId, type: 'INCOME', category: 'BIBLIOTECA',
          description: `Assinatura biblioteca (${parsed.data.provider} — ${parsed.data.plan}) — ${student.fullName}`,
          personName: student.fullName, amount: parsed.data.amount, dueDate: new Date(), status: 'PENDING',
          origin: 'EDU_LIBRARY', originId: subscription.id
        }
      })
      updatedSubscription = await prisma.eduLibrarySubscription.update({ where: { id: subscription.id }, data: { financialEntryId: financialEntry.id } })
    }

    await audit({ clinicId, tenantId, actorId, action: 'EDU_LIBRARY_SUBSCRIPTION_CREATE', entityType: 'EduLibrarySubscription', entityId: subscription.id, summary: `Assinatura de biblioteca (${parsed.data.scope}) criada.` })
    return res.status(201).json(updatedSubscription)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar assinatura da biblioteca.' })
  }
}

export async function myLibrarySubscription(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const institutional = await prisma.eduLibrarySubscription.findFirst({ where: { clinicId, tenantId, scope: 'INSTITUCIONAL', status: 'ATIVA' } })
    const individual = await prisma.eduLibrarySubscription.findFirst({ where: { clinicId, tenantId, scope: 'INDIVIDUAL', studentId: student.id, status: 'ATIVA' } })
    return res.json({ institutional, individual, hasAccess: Boolean(institutional || individual) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao consultar assinatura da biblioteca.' })
  }
}
