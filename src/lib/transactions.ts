import { randomUUID } from "node:crypto";
import { db } from "@/src/lib/db";
import { toUsd } from "@/src/lib/currency";
import type { Transaction, NewTransactionInput, Filter } from "@/src/lib/types";

export function createTransaction(input: NewTransactionInput): Transaction {
  const txn: Transaction = {
    id: randomUUID(),
    customerName: input.customerName,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    amountUsd: toUsd(input.amount, input.currency),
    region: input.region,
    salesRep: input.salesRep,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO transactions
     (id, customerName, amount, currency, amountUsd, region, salesRep, date, createdAt)
     VALUES (@id, @customerName, @amount, @currency, @amountUsd, @region, @salesRep, @date, @createdAt)`,
  ).run(txn);
  return txn;
}

export function queryTransactions(filter: Filter = {}): Transaction[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.salesRep) { where.push("salesRep = @salesRep"); params.salesRep = filter.salesRep; }
  if (filter.region) { where.push("region = @region"); params.region = filter.region; }
  if (filter.currency) { where.push("currency = @currency"); params.currency = filter.currency; }
  if (filter.customer) { where.push("customerName LIKE @customer"); params.customer = `%${filter.customer}%`; }
  if (filter.amountMin !== undefined) { where.push("amountUsd >= @amountMin"); params.amountMin = filter.amountMin; }
  if (filter.amountMax !== undefined) { where.push("amountUsd <= @amountMax"); params.amountMax = filter.amountMax; }
  if (filter.dateFrom) { where.push("date >= @dateFrom"); params.dateFrom = filter.dateFrom; }
  if (filter.dateTo) { where.push("date <= @dateTo"); params.dateTo = filter.dateTo; }

  const sql = `SELECT * FROM transactions
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY date DESC, createdAt DESC`;
  return db.prepare(sql).all(params) as Transaction[];
}

export function distinctValues(column: "salesRep" | "region" | "currency"): string[] {
  const rows = db.prepare(`SELECT DISTINCT ${column} AS v FROM transactions ORDER BY v`).all() as { v: string }[];
  return rows.map((r) => r.v);
}

export function regionPriorAmountsUsd(region: string): number[] {
  const rows = db.prepare(
    `SELECT amountUsd FROM transactions WHERE region = ? ORDER BY createdAt ASC`,
  ).all(region) as { amountUsd: number }[];
  return rows.map((r) => r.amountUsd);
}
