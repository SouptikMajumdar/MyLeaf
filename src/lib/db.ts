import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Check if DATABASE_URL is configured
const isDatabaseConfigured = !!process.env.DATABASE_URL;

// Only create Prisma client if DATABASE_URL is set
function createPrismaClient(): PrismaClient | null {
  if (!isDatabaseConfigured) {
    return null;
  }
  return globalThis.prisma || new PrismaClient();
}

// Prevent multiple instances of Prisma Client in development
export const db = createPrismaClient();

if (process.env.NODE_ENV !== "production" && db) {
  globalThis.prisma = db;
}

// Helper to check if database is available
export function isDatabaseAvailable(): boolean {
  return isDatabaseConfigured && db !== null;
}

// Helper to get db with type assertion (throws if not available)
export function requireDb(): PrismaClient {
  if (!db) {
    throw new Error("Database not configured. Set DATABASE_URL environment variable.");
  }
  return db;
}
