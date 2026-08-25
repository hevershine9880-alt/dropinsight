import { PrismaClient } from "@/generated/prisma";

// Next.js dev server hot-reloads modules; without this we would leak a new
// connection pool on every save until SQLite refuses to open another handle.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
