import { NextRequest, NextResponse } from "next/server";
import { saveCorrection, lookupCorrection } from "@/src/lib/agent/corrections";
import { resolveFilter } from "@/src/lib/agent/resolver";
import { queryTransactions, distinctValues } from "@/src/lib/transactions";
import type { Filter } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { term, field, resolvedValue, baseFilter } =
    (await req.json()) as { term: string; field: string; resolvedValue: string; baseFilter?: Filter };

  await saveCorrection(term, field, resolvedValue);

  const draft: Filter = { ...(baseFilter ?? {}), [field]: term };
  const known = {
    salesRep: await distinctValues("salesRep"),
    region: await distinctValues("region"),
    currency: await distinctValues("currency"),
  };
  const result = await resolveFilter(draft, known, lookupCorrection);
  return NextResponse.json({
    status: "ok",
    interpretation: result.interpretation,
    filter: result.resolved,
    transactions: await queryTransactions(result.resolved),
  });
}
