import type { Transaction } from "@/src/lib/types";

export function TransactionsTable({ rows }: { rows: Transaction[] }) {
  return (
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
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
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
  );
}
