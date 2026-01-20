-- CreateTable
CREATE TABLE "aperturas_caja" (
    "id" SERIAL NOT NULL,
    "barbero_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "efectivo_inicial" DECIMAL(10,2) NOT NULL,
    "hora_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aperturas_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aperturas_caja_barbero_id_fecha_key" ON "aperturas_caja"("barbero_id", "fecha");

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_barbero_id_fkey" FOREIGN KEY ("barbero_id") REFERENCES "barberos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
