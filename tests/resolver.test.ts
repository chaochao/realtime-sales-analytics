import { describe, it, expect } from "vitest";
import { resolveFilter } from "@/src/lib/agent/resolver";

const known = {
  salesRep: ["John Smith", "John Doe", "Sarah Lee"],
  region: ["West", "East", "North"],
  currency: ["USD", "EUR"],
};
const noCorrections = async () => null;

describe("resolveFilter", () => {
  it("resolves an unambiguous partial match silently", async () => {
    const r = await resolveFilter({ salesRep: "Sarah" }, known, noCorrections);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.salesRep).toBe("Sarah Lee");
    expect(r.interpretation).toContain("Sarah Lee");
  });

  it("flags ambiguity when a term matches multiple values", async () => {
    const r = await resolveFilter({ salesRep: "John" }, known, noCorrections);
    expect(r.needsClarification).toBe(true);
    expect(r.ambiguities[0].field).toBe("salesRep");
    expect(r.ambiguities[0].candidates).toEqual(["John Smith", "John Doe"]);
    expect(r.resolved.salesRep).toBeUndefined();
  });

  it("applies a stored correction before ambiguity check", async () => {
    const withCorrection = async (term: string, field: string) =>
      term === "john" && field === "salesRep" ? "John Smith" : null;
    const r = await resolveFilter({ salesRep: "John" }, known, withCorrection);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.salesRep).toBe("John Smith");
  });

  it("passes through numeric and date filters untouched", async () => {
    const r = await resolveFilter({ amountMin: 1000, dateFrom: "2026-01-01" }, known, noCorrections);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.amountMin).toBe(1000);
    expect(r.resolved.dateFrom).toBe("2026-01-01");
  });

  it("flags unknown value as ambiguous with no candidates", async () => {
    const r = await resolveFilter({ region: "Atlantis" }, known, noCorrections);
    expect(r.needsClarification).toBe(true);
    expect(r.ambiguities[0].candidates).toEqual([]);
  });

  it("resolves exact match case-insensitively", async () => {
    const r = await resolveFilter({ region: "west" }, known, noCorrections);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.region).toBe("West");
  });
});
