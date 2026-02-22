import pkg from "@prisma/client";

// Ensure a single Prisma instance across hot-reloads
const { PrismaClient } = pkg as { PrismaClient: new (...args: any[]) => any };
type PrismaClientType = InstanceType<typeof PrismaClient>;
const globalForPrisma = global as unknown as { prisma?: PrismaClientType };

export const prisma: PrismaClientType =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
