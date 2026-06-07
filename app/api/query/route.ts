import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { parseQuery } from "@/src/mastra/agents/query-agent";
import { resolveFilter } from "@/src/lib/agent/resolver";
import { queryTransactions, distinctValues } from "@/src/lib/transactions";
import { lookupCorrection } from "@/src/lib/agent/corrections";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { text, baseFilter } = (await req.json()) as { text: string; baseFilter?: Record<string, unknown> };

  const draft = await parseQuery(text);
  const known = {
    salesRep: await distinctValues("salesRep"),
    region: await distinctValues("region"),
    currency: await distinctValues("currency"),
  };
  const result = await resolveFilter(draft, known, lookupCorrection);

  if (result.needsClarification) {
    return NextResponse.json({
      status: "clarify",
      interpretation: result.interpretation,
      ambiguities: result.ambiguities,
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
  });
}
