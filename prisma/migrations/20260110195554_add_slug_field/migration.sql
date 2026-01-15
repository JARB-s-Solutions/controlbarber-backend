/*
  Warnings:

  - A unique constraint covering the columns `[alias_url]` on the table `barberos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "barberos" ADD COLUMN     "alias_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "barberos_alias_url_key" ON "barberos"("alias_url");
