/*
  Warnings:

  - A unique constraint covering the columns `[google_id]` on the table `barberos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "barberos" ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "barberos_google_id_key" ON "barberos"("google_id");
