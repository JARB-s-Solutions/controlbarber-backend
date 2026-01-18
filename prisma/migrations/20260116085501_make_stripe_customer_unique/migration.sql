/*
  Warnings:

  - A unique constraint covering the columns `[stripe_customer_id]` on the table `suscripciones` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_stripe_customer_id_key" ON "suscripciones"("stripe_customer_id");
