-- CreateTable
CREATE TABLE "edu_content_items" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT,
    "classId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PDF',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_content_progress" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NAO_INICIADO',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "lastPositionSeconds" INTEGER,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_content_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_flashcard_decks" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_flashcard_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_flashcards" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "edu_flashcards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_flashcard_reviews" (
    "id" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastQuality" INTEGER,
    "lastReviewedAt" TIMESTAMP(3),

    CONSTRAINT "edu_flashcard_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_forums" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_forums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_forum_topics" (
    "id" TEXT NOT NULL,
    "forumId" TEXT NOT NULL,
    "authorStudentId" TEXT,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_forum_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_forum_replies" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "authorStudentId" TEXT,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_forum_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_library_subscriptions" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'INSTITUCIONAL',
    "provider" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "financialEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_library_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_content_items_clinicId_subjectId_isActive_idx" ON "edu_content_items"("clinicId", "subjectId", "isActive");

-- CreateIndex
CREATE INDEX "edu_content_items_clinicId_classId_isActive_idx" ON "edu_content_items"("clinicId", "classId", "isActive");

-- CreateIndex
CREATE INDEX "edu_content_items_tenantId_idx" ON "edu_content_items"("tenantId");

-- CreateIndex
CREATE INDEX "edu_content_progress_studentId_idx" ON "edu_content_progress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_content_progress_contentItemId_studentId_key" ON "edu_content_progress"("contentItemId", "studentId");

-- CreateIndex
CREATE INDEX "edu_flashcard_decks_clinicId_subjectId_isActive_idx" ON "edu_flashcard_decks"("clinicId", "subjectId", "isActive");

-- CreateIndex
CREATE INDEX "edu_flashcard_decks_tenantId_idx" ON "edu_flashcard_decks"("tenantId");

-- CreateIndex
CREATE INDEX "edu_flashcards_deckId_idx" ON "edu_flashcards"("deckId");

-- CreateIndex
CREATE INDEX "edu_flashcard_reviews_studentId_dueDate_idx" ON "edu_flashcard_reviews"("studentId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "edu_flashcard_reviews_flashcardId_studentId_key" ON "edu_flashcard_reviews"("flashcardId", "studentId");

-- CreateIndex
CREATE INDEX "edu_forums_clinicId_isActive_idx" ON "edu_forums"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_forums_tenantId_idx" ON "edu_forums"("tenantId");

-- CreateIndex
CREATE INDEX "edu_forum_topics_forumId_isPinned_idx" ON "edu_forum_topics"("forumId", "isPinned");

-- CreateIndex
CREATE INDEX "edu_forum_replies_topicId_idx" ON "edu_forum_replies"("topicId");

-- CreateIndex
CREATE INDEX "edu_library_subscriptions_clinicId_scope_status_idx" ON "edu_library_subscriptions"("clinicId", "scope", "status");

-- CreateIndex
CREATE INDEX "edu_library_subscriptions_tenantId_idx" ON "edu_library_subscriptions"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_content_items" ADD CONSTRAINT "edu_content_items_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_content_items" ADD CONSTRAINT "edu_content_items_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_content_items" ADD CONSTRAINT "edu_content_items_classId_fkey" FOREIGN KEY ("classId") REFERENCES "edu_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_content_progress" ADD CONSTRAINT "edu_content_progress_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "edu_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_content_progress" ADD CONSTRAINT "edu_content_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_flashcard_decks" ADD CONSTRAINT "edu_flashcard_decks_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_flashcard_decks" ADD CONSTRAINT "edu_flashcard_decks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_flashcards" ADD CONSTRAINT "edu_flashcards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "edu_flashcard_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_flashcard_reviews" ADD CONSTRAINT "edu_flashcard_reviews_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "edu_flashcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_flashcard_reviews" ADD CONSTRAINT "edu_flashcard_reviews_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_forums" ADD CONSTRAINT "edu_forums_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_forums" ADD CONSTRAINT "edu_forums_classId_fkey" FOREIGN KEY ("classId") REFERENCES "edu_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_forums" ADD CONSTRAINT "edu_forums_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_forum_topics" ADD CONSTRAINT "edu_forum_topics_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "edu_forums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_forum_replies" ADD CONSTRAINT "edu_forum_replies_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "edu_forum_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_library_subscriptions" ADD CONSTRAINT "edu_library_subscriptions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_library_subscriptions" ADD CONSTRAINT "edu_library_subscriptions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

