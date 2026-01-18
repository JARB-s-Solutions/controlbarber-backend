/*
  Warnings:

  - You are about to drop the column `auto_renew` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the column `clip_checkout_id` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the column `clip_payment_id` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the column `clip_payment_method` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the column `last_payment_date` on the `suscripciones` table. All the data in the column will be lost.
  - You are about to drop the column `next_payment_date` on the `suscripciones` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "suscripciones_clip_payment_id_key";

-- AlterTable
ALTER TABLE "suscripciones" DROP COLUMN "auto_renew",
DROP COLUMN "clip_checkout_id",
DROP COLUMN "clip_payment_id",
DROP COLUMN "clip_payment_method",
DROP COLUMN "last_payment_date",
DROP COLUMN "next_payment_date",
ADD COLUMN     "stripe_customer_id" TEXT;
