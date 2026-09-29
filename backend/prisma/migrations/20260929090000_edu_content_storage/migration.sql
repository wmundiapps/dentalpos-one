-- AlterTable
ALTER TABLE "edu_content_items" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "storageProvider" TEXT NOT NULL DEFAULT 'EXTERNAL',
ADD COLUMN     "storageStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
ALTER COLUMN "url" DROP NOT NULL;

