"use client";
import { useEffect, useRef, useState } from "react";
import type { Analytics } from "@/src/lib/types";
import { usd } from "@/src/lib/format";

function useCountUp(target: number, duration = 600) {
  const [value, setValue] = useState(target);
  const prev = useRef(target);
  const raf = useRef<number>(undefined);

  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) * (1 - t); // ease-out quad
      setValue(start + diff * eased);
      if (t < 1) raf.current = requestAnimationFrame(animate);
      else prev.current = target;
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return value;
}

export function AnalyticsCards({ a }: { a: Analytics }) {
  const revenue = useCountUp(a.totalRevenueUsd);
  const count = useCountUp(a.transactionCount);
  const avg = useCountUp(a.avgDealSizeUsd);

  const cards = [
    { label: "Total Revenue",   value: usd(revenue) },
    { label: "Transactions",    value: Math.round(count).toString() },
    { label: "Avg Deal Size",   value: usd(avg) },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg bg-white p-4 shadow-sm border border-slate-100">
          <div className="text-sm text-slate-500">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
