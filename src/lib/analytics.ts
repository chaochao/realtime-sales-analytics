import type { Transaction, Analytics } from "@/src/lib/types";

function sumBy(txns: Transaction[], key: "region" | "salesRep") {
  const map = new Map<string, number>();
  for (const t of txns) map.set(t[key], (map.get(t[key]) ?? 0) + t.amountUsd);
  return [...map.entries()]
    .map(([name, revenueUsd]) => ({ name, revenueUsd }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd);
}

export function computeAnalytics(txns: Transaction[]): Analytics {
  const totalRevenueUsd = txns.reduce((s, t) => s + t.amountUsd, 0);
  const transactionCount = txns.length;
  const avgDealSizeUsd = transactionCount ? totalRevenueUsd / transactionCount : 0;
  return {
    totalRevenueUsd,
    transactionCount,
    avgDealSizeUsd,
    revenueByRegion: sumBy(txns, "region").map((x) => ({ region: x.name, revenueUsd: x.revenueUsd })),
    topReps: sumBy(txns, "salesRep").map((x) => ({ salesRep: x.name, revenueUsd: x.revenueUsd })),
  };
}
