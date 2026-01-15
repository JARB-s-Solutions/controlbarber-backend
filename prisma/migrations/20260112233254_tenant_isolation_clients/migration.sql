/*
  Warnings:

  - A unique constraint covering the columns `[telefono,barbero_id]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `barbero_id` to the `clientes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "barbero_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_telefono_barbero_id_key" ON "clientes"("telefono", "barbero_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_barbero_id_fkey" FOREIGN KEY ("barbero_id") REFERENCES "barberos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
