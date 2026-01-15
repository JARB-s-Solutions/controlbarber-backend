/*
  Warnings:

  - You are about to drop the column `stripe_customer_id` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the column `stripe_subscription_id` on the `suscripciones` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clip_payment_id]` on the table `suscripciones` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "suscripciones_stripe_customer_id_key";

-- DropIndex
DROP INDEX "suscripciones_stripe_subscription_id_key";

-- AlterTable
ALTER TABLE "suscripciones" DROP COLUMN "stripe_customer_id",
DROP COLUMN "stripe_subscription_id",
ADD COLUMN     "auto_renew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "clip_checkout_id" TEXT,
ADD COLUMN     "clip_payment_id" TEXT,
ADD COLUMN     "clip_payment_method" TEXT,
ADD COLUMN     "last_payment_date" TIMESTAMP(3),
ADD COLUMN     "next_payment_date" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_clip_payment_id_key" ON "suscripciones"("clip_payment_id");
