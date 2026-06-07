import type { Analytics } from "@/src/lib/types";
import { usd } from "@/src/lib/format";

export function AnalyticsCards({ a }: { a: Analytics }) {
  const cards = [
    { label: "Total Revenue", value: usd(a.totalRevenueUsd) },
    { label: "Transactions", value: a.transactionCount.toString() },
    { label: "Avg Deal Size", value: usd(a.avgDealSizeUsd) },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg bg-white p-4 shadow-sm border border-slate-100">
          <div className="text-sm text-slate-500">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
