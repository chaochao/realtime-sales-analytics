// GET /api/analytics
// Returns aggregated analytics over all transactions:
// total revenue, transaction count, avg deal size, revenue by region, top reps.
import { NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { queryTransactions } from "@/src/lib/transactions";
import { computeAnalytics } from "@/src/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const txns = await queryTransactions();
  return NextResponse.json(computeAnalytics(txns));
}
