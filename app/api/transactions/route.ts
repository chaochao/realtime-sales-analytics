// GET  /api/transactions?salesRep=&region=&customer=&currency=&dateFrom=&dateTo=&amountMin=&amountMax=
// Returns transactions matching the given filter params (all optional).
//
// POST /api/transactions  body: NewTransactionInput
// Creates a transaction, runs drift detection against prior deals in the same region,
// recomputes analytics, and broadcasts the result to all SSE subscribers.
import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { createTransaction, queryTransactions, regionPriorAmountsUsd } from "@/src/lib/transactions";
import { computeAnalytics } from "@/src/lib/analytics";
import { detectDrift } from "@/src/lib/agent/drift";
import { publishTransaction } from "@/src/lib/events";
import type { Filter, NewTransactionInput } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const p = req.nextUrl.searchParams;
  const filter: Filter = {};
  for (const k of ["salesRep", "region", "currency", "customer", "dateFrom", "dateTo"] as const) {
    const v = p.get(k);
    if (v) (filter as Record<string, string>)[k] = v;
  }
  const min = p.get("amountMin"); if (min) filter.amountMin = Number(min);
  const max = p.get("amountMax"); if (max) filter.amountMax = Number(max);
  return NextResponse.json(await queryTransactions(filter));
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const body = (await req.json()) as NewTransactionInput;
  const prior = await regionPriorAmountsUsd(body.region);
  const transaction = await createTransaction(body);
  const insight = detectDrift(transaction.region, transaction.amountUsd, prior);
  const analytics = computeAnalytics(await queryTransactions());
  publishTransaction({ type: "transaction", transaction, analytics, insight });
  return NextResponse.json({ transaction, analytics, insight });
}
