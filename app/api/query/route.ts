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
  // Seed the DB on first request so the demo has data to match against (no-op afterwards).
  await ensureSeeded();
  const { text, baseFilter, today } = (await req.json()) as { text: string; baseFilter?: Record<string, unknown>; today?: string };

  // Run the LLM parse and the four "known values" lookups concurrently — they don't depend on each other.
  // draft = LLM's best-guess structured filter; the distinctValues arrays are the valid values to resolve against.
  const [draft, salesRep, region, currency, customer] = await Promise.all([
    parseQuery(text, today),
    distinctValues("salesRep"),
    distinctValues("region"),
    distinctValues("currency"),
    distinctValues("customerName"),
  ]);
  const known = { salesRep, region, currency, customer };
  // Turn the loose draft into concrete DB values: checks saved corrections first, then matches against `known`.
  const result = await resolveFilter(draft, known, lookupCorrection);

  // A term matched multiple candidates and isn't covered by a correction → ask the user to pick.
  // The frontend renders `ambiguities` as buttons; `partialFilter` holds whatever fields did resolve cleanly.
  if (result.needsClarification) {
    return NextResponse.json({
      status: "clarify",
      interpretation: result.interpretation,
      ambiguities: result.ambiguities,
      partialFilter: result.resolved,
    });
  }

  // Everything resolved. Merge over any previously confirmed filter so refinements add to (and override) earlier fields.
  const merged = baseFilter ? { ...baseFilter, ...result.resolved } : result.resolved;
  // Build the human-readable summary shown in chat, e.g. "salesRep = John Smith, region = West" (empty fields dropped).
  const interpretation = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ") || "no filters";

  // `draft` is returned too so the frontend can detect corrections (compare what the LLM guessed vs. what resolved).
  return NextResponse.json({
    status: "ok",
    interpretation,
    filter: merged,
    draft,
  });
}
