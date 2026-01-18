/*
  Warnings:

  - Added the required column `barbero_id` to the `calificaciones` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "calificaciones" ADD COLUMN     "barbero_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_barbero_id_fkey" FOREIGN KEY ("barbero_id") REFERENCES "barberos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
