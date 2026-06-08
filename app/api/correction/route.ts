// POST /api/correction  body: { term, field, resolvedValue }
// Persists a user correction: maps a raw search term (e.g. "john") to the correct
// resolved value (e.g. "John Doe") for a given field (e.g. "salesRep").
// The correction is stored in the DB and automatically applied on all future queries
// via lookupCorrection() in the resolver, so the user never has to correct it again.
import { NextRequest, NextResponse } from "next/server";
import { saveCorrection } from "@/src/lib/agent/corrections";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { term, field, resolvedValue } =
    (await req.json()) as { term: string; field: string; resolvedValue: string };
  await saveCorrection(term, field, resolvedValue);
  return NextResponse.json({ status: "ok" });
}
