import type { Filter, ResolveResult, Ambiguity } from "@/src/lib/types";
import { normalizeTerm } from "@/src/lib/agent/corrections";

type KnownValues = Partial<Record<keyof Filter, string[]>>;
type CorrectionLookup = (term: string, field: string) => Promise<string | null>;

const TEXT_FIELDS: (keyof Filter)[] = ["salesRep", "region", "customer", "currency"];

function matchCandidates(term: string, known: string[]): string[] {
  const t = term.toLowerCase();
  const exact = known.filter((k) => k.toLowerCase() === t);
  if (exact.length) return exact;
  return known.filter((k) => k.toLowerCase().includes(t));
}

export async function resolveFilter(
  draft: Filter,
  known: KnownValues,
  lookupCorrection: CorrectionLookup,
): Promise<ResolveResult> {
  const resolved: Filter = {};
  const ambiguities: Ambiguity[] = [];

  for (const [k, v] of Object.entries(draft)) {
    const field = k as keyof Filter;
    if (v === undefined || v === null || v === "") continue;

    if (!TEXT_FIELDS.includes(field)) {
      (resolved as Record<string, unknown>)[field] = v;
      continue;
    }

    const term = String(v);
    const corrected = await lookupCorrection(normalizeTerm(term), field);
    if (corrected) {
      (resolved as Record<string, string>)[field] = corrected;
      continue;
    }

    const candidates = matchCandidates(term, known[field] ?? []);
    if (candidates.length === 1) {
      (resolved as Record<string, string>)[field] = candidates[0];
    } else {
      ambiguities.push({ field, term, candidates });
    }
  }

  const interpretation = Object.entries(resolved)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");

  return {
    resolved,
    ambiguities,
    interpretation: interpretation || "no filters",
    needsClarification: ambiguities.length > 0,
  };
}
