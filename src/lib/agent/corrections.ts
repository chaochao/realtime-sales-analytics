import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/db";

export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

export async function saveCorrection(
  term: string,
  field: string,
  resolvedValue: string,
): Promise<void> {
  await prisma.correction.upsert({
    where: { term_field: { term: normalizeTerm(term), field } },
    update: { resolvedValue },
    create: {
      id: randomUUID(),
      term: normalizeTerm(term),
      field,
      resolvedValue,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function lookupCorrection(
  term: string,
  field: string,
): Promise<string | null> {
  const row = await prisma.correction.findUnique({
    where: { term_field: { term: normalizeTerm(term), field } },
  });
  return row?.resolvedValue ?? null;
}
