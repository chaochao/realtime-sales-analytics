import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { parseQuery } from "@/src/mastra/agents/query-agent";
import { resolveFilter } from "@/src/lib/agent/resolver";
import { queryTransactions, distinctValues } from "@/src/lib/transactions";
import { lookupCorrection } from "@/src/lib/agent/corrections";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { text } = (await req.json()) as { text: string };

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
  return NextResponse.json({
    status: "ok",
    interpretation: result.interpretation,
    filter: result.resolved,
    transactions: await queryTransactions(result.resolved),
  });
}
