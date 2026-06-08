"use client";
import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Analytics, Transaction, Filter } from "@/src/lib/types";
import { AnalyticsCards } from "@/src/components/AnalyticsCards";
import { RevenueChart } from "@/src/components/RevenueChart";
import { TransactionsTable } from "@/src/components/TransactionsTable";
import { ChatPanel } from "@/src/components/ChatPanel";
import { TableFilters, EMPTY_FILTER, type TableFilter } from "@/src/components/TableFilters";

const EMPTY: Analytics = {
  totalRevenueUsd: 0, transactionCount: 0, avgDealSizeUsd: 0,
  revenueByRegion: [], topReps: [],
};

function filterFromResolved(f: Filter): TableFilter {
  return {
    dateFrom:     f.dateFrom  ?? "",
    dateTo:       f.dateTo    ?? "",
    customerName: f.customer  ?? "",
    amountMin:    f.amountMin != null ? String(f.amountMin) : "",
    amountMax:    f.amountMax != null ? String(f.amountMax) : "",
    region:       f.region    ?? "",
    salesRep:     f.salesRep  ?? "",
  };
}

function filterFromParams(params: URLSearchParams): TableFilter {
  return {
    dateFrom:     params.get("dateFrom")   ?? "",
    dateTo:       params.get("dateTo")     ?? "",
    customerName: params.get("customer")   ?? "",
    amountMin:    params.get("amountMin")  ?? "",
    amountMax:    params.get("amountMax")  ?? "",
    region:       params.get("region")     ?? "",
    salesRep:     params.get("salesRep")   ?? "",
  };
}

function filterToParams(f: TableFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.region)       p.set("region",    f.region);
  if (f.salesRep)     p.set("salesRep",  f.salesRep);
  if (f.customerName) p.set("customer",  f.customerName);
  if (f.dateFrom)     p.set("dateFrom",  f.dateFrom);
  if (f.dateTo)       p.set("dateTo",    f.dateTo);
  if (f.amountMin !== "") p.set("amountMin", f.amountMin);
  if (f.amountMax !== "") p.set("amountMax", f.amountMax);
  return p;
}

function applyFilter(rows: Transaction[], f: TableFilter): Transaction[] {
  return rows.filter((t) => {
    if (f.dateFrom && t.date < f.dateFrom) return false;
    if (f.dateTo && t.date > f.dateTo) return false;
    if (f.customerName && !t.customerName.toLowerCase().includes(f.customerName.toLowerCase())) return false;
    if (f.amountMin !== "" && t.amountUsd < Number(f.amountMin)) return false;
    if (f.amountMax !== "" && t.amountUsd > Number(f.amountMax)) return false;
    if (f.region && t.region !== f.region) return false;
    if (f.salesRep && t.salesRep !== f.salesRep) return false;
    return true;
  });
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [analytics, setAnalytics] = useState<Analytics>(EMPTY);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [tableFilter, setTableFilter] = useState<TableFilter>(() => filterFromParams(searchParams));
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

  // sync tableFilter → URL
  useEffect(() => {
    const qs = filterToParams(tableFilter).toString();
    router.replace(qs ? `?${qs}` : pathname, { scroll: false });
  }, [tableFilter, router]);

  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))].sort(), [rows]);
  const salesReps = useMemo(() => [...new Set(rows.map((r) => r.salesRep))].sort(), [rows]);

  const displayRows = useMemo(() => applyFilter(rows, tableFilter), [rows, tableFilter]);

  const hasFilter = Object.values(tableFilter).some((v) => v !== "");

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
          <ChatPanel
            onResults={(f) => setTableFilter(f ? filterFromResolved(f) : EMPTY_FILTER)}
            insights={insights}
            onDismissInsight={(i) => setInsights((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>
      </div>

      <TableFilters
        filter={tableFilter}
        regions={regions}
        salesReps={salesReps}
        onChange={setTableFilter}
        onClear={() => setTableFilter(EMPTY_FILTER)}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">
          {hasFilter
            ? `Filtered (${displayRows.length} of ${rows.length})`
            : `All transactions (${rows.length})`}
        </h2>
        {hasFilter && (
          <button
            onClick={() => setTableFilter(EMPTY_FILTER)}
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

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
