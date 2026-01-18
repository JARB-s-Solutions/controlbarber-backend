/*
  Warnings:

  - The values [BASIC] on the enum `PlanType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PlanType_new" AS ENUM ('FREE', 'PREMIUM');
ALTER TABLE "suscripciones" ALTER COLUMN "tipo_plan" TYPE "PlanType_new" USING ("tipo_plan"::text::"PlanType_new");
ALTER TYPE "PlanType" RENAME TO "PlanType_old";
ALTER TYPE "PlanType_new" RENAME TO "PlanType";
DROP TYPE "PlanType_old";
COMMIT;
