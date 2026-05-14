import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

// Si ya existe una conexión, la recicla. Si no, crea una sola.
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}