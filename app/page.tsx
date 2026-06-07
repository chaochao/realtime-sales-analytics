"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import type { Analytics, Transaction } from "@/src/lib/types";
import { AnalyticsCards } from "@/src/components/AnalyticsCards";
import { RevenueChart } from "@/src/components/RevenueChart";
import { TransactionsTable } from "@/src/components/TransactionsTable";
import { ChatPanel } from "@/src/components/ChatPanel";

const EMPTY: Analytics = {
  totalRevenueUsd: 0, transactionCount: 0, avgDealSizeUsd: 0,
  revenueByRegion: [], topReps: [],
};

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [filtered, setFiltered] = useState<Transaction[] | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [newId, setNewId] = useState<string | undefined>();
  const newIdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function loadAll() {
    const [a, t] = await Promise.all([
      fetch("/api/analytics").then((r) => r.json()),
      fetch("/api/transactions").then((r) => r.json()),
    ]);
    setAnalytics(a);
    setRows(t);
  }

  useEffect(() => {
    loadAll();
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "transaction") {
        setAnalytics(data.analytics);
        setRows((prev) => [data.transaction, ...prev]);
        if (data.insight) setInsights((prev) => [data.insight.message, ...prev]);
        // highlight the new row, clear after animation completes
        setNewId(data.transaction.id);
        clearTimeout(newIdTimer.current);
        newIdTimer.current = setTimeout(() => setNewId(undefined), 600);
      }
    };
    return () => { es.close(); clearTimeout(newIdTimer.current); };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Sales Analytics</h1>
        <Link
          href="/transactions/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + New Transaction
        </Link>
      </div>

      <AnalyticsCards a={analytics} />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <RevenueChart a={analytics} />
        </div>
        <div className="h-[280px]">
          <ChatPanel onResults={(r) => setFiltered(r)} insights={insights} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">
          {filtered
            ? `Filtered transactions (${filtered.length})`
            : `All transactions (${rows.length})`}
        </h2>
        {filtered && (
          <button onClick={() => setFiltered(null)} className="text-xs text-blue-600 hover:underline">
            Clear filter
          </button>
        )}
      </div>

      <TransactionsTable rows={filtered ?? rows} newId={newId} />
    </main>
  );
}
