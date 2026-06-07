"use client";
import { useState, useEffect } from "react";
import type { Transaction } from "@/src/lib/types";

const PAGE_SIZE = 10;

export function TransactionsTable({ rows, newId }: { rows: Transaction[]; newId?: string }) {
  const [page, setPage] = useState(1);

  // reset to page 1 when rows change (filter applied or new transaction)
  useEffect(() => { setPage(1); }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-lg bg-white shadow-sm border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Amount</th>
              <th className="p-3 font-medium">Currency</th>
              <th className="p-3 font-medium">Region</th>
              <th className="p-3 font-medium">Sales Rep</th>
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
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
            >«</button>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
            >‹</button>
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
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`rounded px-2 py-1 ${page === p ? "bg-blue-600 text-white" : "hover:bg-slate-100"}`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
            >›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-30"
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}
