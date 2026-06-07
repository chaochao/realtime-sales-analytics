"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import type { Analytics, Transaction } from "@/src/lib/types";
import { AnalyticsCards } from "@/src/components/AnalyticsCards";
import { RevenueChart } from "@/src/components/RevenueChart";
import { TransactionsTable } from "@/src/components/TransactionsTable";
import { ChatPanel } from "@/src/components/ChatPanel";
import { TableFilters, EMPTY_FILTER, type TableFilter } from "@/src/components/TableFilters";

const EMPTY: Analytics = {
  totalRevenueUsd: 0, transactionCount: 0, avgDealSizeUsd: 0,
  revenueByRegion: [], topReps: [],
};

function applyFilter(rows: Transaction[], f: TableFilter): Transaction[] {
  return rows.filter((t) => {
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    if (f.customerName && !t.customerName.toLowerCase().includes(f.customerName.toLowerCase())) return false;
    if (f.amountMin && t.amount < Number(f.amountMin)) return false;
    if (f.amountMax && t.amount > Number(f.amountMax)) return false;
    if (f.region && t.region !== f.region) return false;
    if (f.salesRep && t.salesRep !== f.salesRep) return false;
    return true;
  });
}

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [chatFiltered, setChatFiltered] = useState<Transaction[] | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>(EMPTY_FILTER);
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
        setNewId(data.transaction.id);
        clearTimeout(newIdTimer.current);
        newIdTimer.current = setTimeout(() => setNewId(undefined), 600);
      }
    };
    return () => { es.close(); clearTimeout(newIdTimer.current); };
  }, []);

  // derive unique regions + reps from loaded data for filter dropdowns
  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))].sort(), [rows]);
  const salesReps = useMemo(() => [...new Set(rows.map((r) => r.salesRep))].sort(), [rows]);

  // chat filter takes priority; otherwise apply table filter
  const displayRows = useMemo(() => {
    const base = chatFiltered ?? rows;
    return applyFilter(base, tableFilter);
  }, [chatFiltered, rows, tableFilter]);

  const hasTableFilter = Object.values(tableFilter).some((v) => v !== "");

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Sales Analytics</h1>
        <Link href="/transactions/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
          + New Transaction
        </Link>
      </div>

      <AnalyticsCards a={analytics} />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <RevenueChart a={analytics} />
        </div>
        <div className="h-[280px]">
          <ChatPanel onResults={(r) => { setChatFiltered(r); setTableFilter(EMPTY_FILTER); }} insights={insights} />
        </div>
      </div>

      <TableFilters
        filter={tableFilter}
        regions={regions}
        salesReps={salesReps}
        onChange={(f) => { setTableFilter(f); setChatFiltered(null); }}
        onClear={() => setTableFilter(EMPTY_FILTER)}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">
          {chatFiltered
            ? `Chat filter (${displayRows.length})`
            : hasTableFilter
            ? `Filtered (${displayRows.length} of ${rows.length})`
            : `All transactions (${rows.length})`}
        </h2>
        {(chatFiltered || hasTableFilter) && (
          <button
            onClick={() => { setChatFiltered(null); setTableFilter(EMPTY_FILTER); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      <TransactionsTable rows={displayRows} newId={newId} />
    </main>
  );
}
