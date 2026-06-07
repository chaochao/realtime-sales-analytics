import { randomUUID } from "node:crypto";
import { prisma } from "@/src/lib/db";
import { toUsd } from "@/src/lib/currency";
import type { Transaction, NewTransactionInput, Filter } from "@/src/lib/types";

export async function createTransaction(input: NewTransactionInput): Promise<Transaction> {
  return prisma.transaction.create({
    data: {
      id: randomUUID(),
      customerName: input.customerName,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      amountUsd: toUsd(input.amount, input.currency),
      region: input.region,
      salesRep: input.salesRep,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    },
  });
}

export async function queryTransactions(filter: Filter = {}): Promise<Transaction[]> {
  return prisma.transaction.findMany({
    where: {
      ...(filter.salesRep && { salesRep: filter.salesRep }),
      ...(filter.region && { region: filter.region }),
      ...(filter.currency && { currency: filter.currency }),
      ...(filter.customer && { customerName: { contains: filter.customer } }),
      ...(filter.amountMin !== undefined && { amountUsd: { gte: filter.amountMin } }),
      ...(filter.amountMax !== undefined && { amountUsd: { lte: filter.amountMax } }),
      ...(filter.dateFrom && { date: { gte: filter.dateFrom } }),
      ...(filter.dateTo && { date: { lte: filter.dateTo } }),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export async function distinctValues(column: "salesRep" | "region" | "currency"): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    select: { [column]: true },
    distinct: [column],
    orderBy: { [column]: "asc" },
  });
  return rows.map((r) => String((r as Record<string, unknown>)[column]));
}

export async function regionPriorAmountsUsd(region: string): Promise<number[]> {
  const rows = await prisma.transaction.findMany({
    where: { region },
    select: { amountUsd: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.amountUsd as number);
}
