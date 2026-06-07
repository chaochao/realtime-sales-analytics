import { PrismaClient } from "@/src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const g = globalThis as unknown as { __prisma?: PrismaClient };

function init(): PrismaClient {
  const url = process.env.DATABASE_PATH ?? "dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any);
}

export const prisma = g.__prisma ?? (g.__prisma = init());
