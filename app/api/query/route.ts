// POST /api/query  body: { text, today?, baseFilter? }
// Parses a natural-language query into a structured filter via LLM (parseQuery),
// then resolves partial/ambiguous field values against known DB values (resolveFilter).
// Returns status "clarify" when a term matches multiple candidates (frontend shows buttons),
// or status "ok" with the resolved filter and a human-readable interpretation string.
// baseFilter carries over previously confirmed filters so the user can refine incrementally.
import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { parseQuery } from "@/src/mastra/agents/query-agent";
import { resolveFilter } from "@/src/lib/agent/resolver";
import { queryTransactions, distinctValues } from "@/src/lib/transactions";
import { lookupCorrection } from "@/src/lib/agent/corrections";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { text, baseFilter, today } = (await req.json()) as { text: string; baseFilter?: Record<string, unknown>; today?: string };

  const [draft, salesRep, region, currency, customer] = await Promise.all([
    parseQuery(text, today),
    distinctValues("salesRep"),
    distinctValues("region"),
    distinctValues("currency"),
    distinctValues("customerName"),
  ]);
  const known = { salesRep, region, currency, customer };
  const result = await resolveFilter(draft, known, lookupCorrection);

  if (result.needsClarification) {
    return NextResponse.json({
      status: "clarify",
      interpretation: result.interpretation,
      ambiguities: result.ambiguities,
      partialFilter: result.resolved,
    });
  }

  const merged = baseFilter ? { ...baseFilter, ...result.resolved } : result.resolved;
  const interpretation = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ") || "no filters";

  return NextResponse.json({
    status: "ok",
    interpretation,
    filter: merged,
    draft,
  });
}
