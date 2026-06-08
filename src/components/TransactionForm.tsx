"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_CURRENCIES } from "@/src/lib/currency";

const REGIONS = ["West", "East", "North", "South"];

export function TransactionForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    customerName: "", amount: "", currency: "USD", region: "West", salesRep: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    }).then((r) => r.json());
    if (res.insight?.message) {
      sessionStorage.setItem("pendingInsight", res.insight.message);
    }
    router.push("/");
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm border border-slate-100">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Customer Name</label>
        <input required placeholder="Acme Corp" className={field}
          value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
          <input required type="number" min="1" placeholder="50000" className={field}
            value={form.amount} onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Currency</label>
          <select className={field} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Region</label>
        <select className={field} value={form.region} onChange={(e) => set("region", e.target.value)}>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Sales Representative</label>
        <input required placeholder="John Smith" className={field}
          value={form.salesRep} onChange={(e) => set("salesRep", e.target.value)} />
      </div>
      <button
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Create Transaction"}
      </button>
    </form>
  );
}
