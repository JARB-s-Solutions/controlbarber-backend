/*
  Warnings:

  - You are about to drop the column `barbero_id` on the `aperturas_caja` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `bloqueos_agenda` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `calificaciones` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `cierres_caja` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `citas` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `clientes` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `configuracion_horarios` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `galeria` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `movimientos_financieros` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `notificaciones` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `servicios` table. All the data in the column will be lost.
  - You are about to drop the column `barbero_id` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the `barberos` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[barberia_id,personal_id,fecha]` on the table `aperturas_caja` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barberia_id,personal_id,fecha]` on the table `cierres_caja` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telefono,barberia_id]` on the table `clientes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[personal_id,dia_semana]` on the table `configuracion_horarios` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barberia_id]` on the table `suscripciones` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `barberia_id` to the `aperturas_caja` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `aperturas_caja` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `bloqueos_agenda` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `calificaciones` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `cierres_caja` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `cierres_caja` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `citas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `citas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `clientes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `configuracion_horarios` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `galeria` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `movimientos_financieros` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `movimientos_financieros` table without a default value. This is not possible if the table is not empty.
  - Added the required column `personal_id` to the `notificaciones` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `servicios` table without a default value. This is not possible if the table is not empty.
  - Added the required column `barberia_id` to the `suscripciones` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "PlanType" ADD VALUE 'ENTERPRISE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OWNER';

-- DropForeignKey
ALTER TABLE "aperturas_caja" DROP CONSTRAINT "aperturas_caja_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "bloqueos_agenda" DROP CONSTRAINT "bloqueos_agenda_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "calificaciones" DROP CONSTRAINT "calificaciones_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "cierres_caja" DROP CONSTRAINT "cierres_caja_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "citas" DROP CONSTRAINT "citas_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "clientes" DROP CONSTRAINT "clientes_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "configuracion_horarios" DROP CONSTRAINT "configuracion_horarios_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "galeria" DROP CONSTRAINT "galeria_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_financieros" DROP CONSTRAINT "movimientos_financieros_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "notificaciones" DROP CONSTRAINT "notificaciones_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "servicios" DROP CONSTRAINT "servicios_barbero_id_fkey";

-- DropForeignKey
ALTER TABLE "suscripciones" DROP CONSTRAINT "suscripciones_barbero_id_fkey";

-- DropIndex
DROP INDEX "aperturas_caja_barbero_id_fecha_key";

-- DropIndex
DROP INDEX "cierres_caja_barbero_id_fecha_key";

-- DropIndex
DROP INDEX "citas_barbero_id_fecha_hora_idx";

-- DropIndex
DROP INDEX "clientes_telefono_barbero_id_key";

-- DropIndex
DROP INDEX "configuracion_horarios_barbero_id_dia_semana_key";

-- DropIndex
DROP INDEX "suscripciones_barbero_id_key";

-- AlterTable
ALTER TABLE "aperturas_caja" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL,
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "bloqueos_agenda" DROP COLUMN "barbero_id",
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "calificaciones" DROP COLUMN "barbero_id",
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "cierres_caja" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL,
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "citas" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL,
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "configuracion_horarios" DROP COLUMN "barbero_id",
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "galeria" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "movimientos_financieros" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL,
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notificaciones" DROP COLUMN "barbero_id",
ADD COLUMN     "personal_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "servicios" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "suscripciones" DROP COLUMN "barbero_id",
ADD COLUMN     "barberia_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "barberos";

-- CreateTable
CREATE TABLE "barberias" (
    "id" TEXT NOT NULL,
    "nombre_comercial" TEXT NOT NULL,
    "alias_url" TEXT NOT NULL,
    "zona_horaria" TEXT NOT NULL DEFAULT 'America/Merida',
    "direccion_texto" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barberias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal" (
    "id" TEXT NOT NULL,
    "barberia_id" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "telefono" TEXT,
    "foto_perfil" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BARBER',
    "ranking_score" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "estado_cuenta" BOOLEAN NOT NULL DEFAULT true,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barberias_alias_url_key" ON "barberias"("alias_url");

-- CreateIndex
CREATE UNIQUE INDEX "personal_email_key" ON "personal"("email");

-- CreateIndex
CREATE UNIQUE INDEX "personal_google_id_key" ON "personal"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "aperturas_caja_barberia_id_personal_id_fecha_key" ON "aperturas_caja"("barberia_id", "personal_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_caja_barberia_id_personal_id_fecha_key" ON "cierres_caja"("barberia_id", "personal_id", "fecha");

-- CreateIndex
CREATE INDEX "citas_barberia_id_fecha_hora_idx" ON "citas"("barberia_id", "fecha_hora");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_telefono_barberia_id_key" ON "clientes"("telefono", "barberia_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_horarios_personal_id_dia_semana_key" ON "configuracion_horarios"("personal_id", "dia_semana");

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_barberia_id_key" ON "suscripciones"("barberia_id");

-- AddForeignKey
ALTER TABLE "personal" ADD CONSTRAINT "personal_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_horarios" ADD CONSTRAINT "configuracion_horarios_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galeria" ADD CONSTRAINT "galeria_barberia_id_fkey" FOREIGN KEY ("barberia_id") REFERENCES "barberias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_personal_id_fkey" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
