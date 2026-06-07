"use client";
import { useState, useEffect } from "react";
import type { Transaction } from "@/src/lib/types";

const PAGE_SIZE = 10;

type SortKey = keyof Pick<Transaction, "date" | "customerName" | "amount" | "currency" | "region" | "salesRep">;
type SortDir = "asc" | "desc";

function sortRows(rows: Transaction[], key: SortKey, dir: SortDir): Transaction[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <svg className="ml-1 inline-block h-3 w-3 text-slate-300" viewBox="0 0 8 10" fill="currentColor">
        <path d="M4 0 L7 3.5 H1 Z" />
        <path d="M4 10 L1 6.5 H7 Z" />
      </svg>
    );
  }
  return (
    <svg className="ml-1 inline-block h-3 w-3 text-blue-600" viewBox="0 0 8 6" fill="currentColor">
      {dir === "asc"
        ? <path d="M4 0 L8 6 H0 Z" />
        : <path d="M4 6 L0 0 H8 Z" />}
    </svg>
  );
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "date",         label: "Date" },
  { key: "customerName", label: "Customer" },
  { key: "amount",       label: "Amount" },
  { key: "currency",     label: "Currency" },
  { key: "region",       label: "Region" },
  { key: "salesRep",     label: "Sales Rep" },
];

export function TransactionsTable({ rows, newId }: { rows: Transaction[]; newId?: string }) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => { setPage(1); }, [rows]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sorted = sortRows(rows, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-lg bg-white shadow-sm border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="p-3 font-medium cursor-pointer select-none hover:text-slate-900"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((t) => (
              <tr
                key={t.id}
                className={`border-t border-slate-100 hover:bg-slate-50 ${t.id === newId ? "row-new" : ""}`}
              >
                <td className="p-3">{t.date}</td>
                <td className="p-3">{t.customerName}</td>
                <td className="p-3">{t.amount.toLocaleString()}</td>
                <td className="p-3">{t.currency}</td>
                <td className="p-3">{t.region}</td>
                <td className="p-3">{t.salesRep}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">No transactions</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">«</button>
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | "...")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 py-1">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    className={`rounded px-2 py-1 ${page === p ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}>
                    {p}
                  </button>
                )
              )}
            <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
