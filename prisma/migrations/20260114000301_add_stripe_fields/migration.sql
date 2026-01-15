/*
  Warnings:

  - A unique constraint covering the columns `[stripe_customer_id]` on the table `suscripciones` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripe_subscription_id]` on the table `suscripciones` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "suscripciones" ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "stripe_subscription_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_stripe_customer_id_key" ON "suscripciones"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_stripe_subscription_id_key" ON "suscripciones"("stripe_subscription_id");
