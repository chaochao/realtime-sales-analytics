"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Analytics } from "@/src/lib/types";
import { usd } from "@/src/lib/format";

export function RevenueChart({ a }: { a: Analytics }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm border border-slate-100">
      <div className="mb-3 text-sm font-medium text-slate-700">Revenue by Region</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={a.revenueByRegion}>
          <XAxis dataKey="region" fontSize={12} />
          <YAxis fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => usd(Number(v))} />
          <Bar dataKey="revenueUsd" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
