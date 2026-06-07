import { describe, it, expect } from "vitest";
import { computeAnalytics } from "@/src/lib/analytics";
import type { Transaction } from "@/src/lib/types";

const txn = (over: Partial<Transaction>): Transaction => ({
  id: "1", customerName: "Acme", amount: 100, currency: "USD", amountUsd: 100,
  region: "West", salesRep: "John Smith", date: "2026-01-01",
  createdAt: "2026-01-01T00:00:00Z", ...over,
});

describe("computeAnalytics", () => {
  it("returns zeros for empty list", () => {
    const a = computeAnalytics([]);
    expect(a.totalRevenueUsd).toBe(0);
    expect(a.transactionCount).toBe(0);
    expect(a.avgDealSizeUsd).toBe(0);
    expect(a.revenueByRegion).toEqual([]);
    expect(a.topReps).toEqual([]);
  });

  it("sums revenue and counts transactions", () => {
    const a = computeAnalytics([
      txn({ id: "1", amountUsd: 100 }),
      txn({ id: "2", amountUsd: 300 }),
    ]);
    expect(a.totalRevenueUsd).toBe(400);
    expect(a.transactionCount).toBe(2);
    expect(a.avgDealSizeUsd).toBe(200);
  });

  it("groups revenue by region sorted descending", () => {
    const a = computeAnalytics([
      txn({ id: "1", region: "West", amountUsd: 100 }),
      txn({ id: "2", region: "East", amountUsd: 250 }),
      txn({ id: "3", region: "West", amountUsd: 100 }),
    ]);
    expect(a.revenueByRegion).toEqual([
      { region: "East", revenueUsd: 250 },
      { region: "West", revenueUsd: 200 },
    ]);
  });

  it("ranks top reps by revenue descending", () => {
    const a = computeAnalytics([
      txn({ id: "1", salesRep: "John Smith", amountUsd: 100 }),
      txn({ id: "2", salesRep: "Sarah Lee", amountUsd: 500 }),
    ]);
    expect(a.topReps[0]).toEqual({ salesRep: "Sarah Lee", revenueUsd: 500 });
    expect(a.topReps[1]).toEqual({ salesRep: "John Smith", revenueUsd: 100 });
  });

  it("accumulates revenue for the same rep across transactions", () => {
    const a = computeAnalytics([
      txn({ id: "1", salesRep: "John Smith", amountUsd: 200 }),
      txn({ id: "2", salesRep: "John Smith", amountUsd: 300 }),
    ]);
    expect(a.topReps).toEqual([{ salesRep: "John Smith", revenueUsd: 500 }]);
  });
});
