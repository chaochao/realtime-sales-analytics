"use client";

export type TableFilter = {
  dateFrom: string;
  dateTo: string;
  customerName: string;
  amountMin: string;
  amountMax: string;
  region: string;
  salesRep: string;
};

export const EMPTY_FILTER: TableFilter = {
  dateFrom: "", dateTo: "", customerName: "", amountMin: "", amountMax: "", region: "", salesRep: "",
};

export function TableFilters({
  filter,
  regions,
  salesReps,
  onChange,
  onClear,
}: {
  filter: TableFilter;
  regions: string[];
  salesReps: string[];
  onChange: (f: TableFilter) => void;
  onClear: () => void;
}) {
  const set = (key: keyof TableFilter, val: string) => onChange({ ...filter, [key]: val });
  const hasFilter = Object.values(filter).some((v) => v !== "");

  const input = "w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="rounded-lg bg-white border border-slate-100 shadow-sm p-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: "180px 140px 1fr 1fr" }}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Date Range</label>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-xs text-slate-400">From</span>
              <input
                type="date"
                className={input}
                value={filter.dateFrom}
                onChange={(e) => set("dateFrom", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-xs text-slate-400">To</span>
              <input
                type="date"
                className={input}
                value={filter.dateTo}
                onChange={(e) => set("dateTo", e.target.value)}
              />
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer Name</label>
          <input
            type="text"
            placeholder="Search..."
            className={input}
            value={filter.customerName}
            onChange={(e) => set("customerName", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Amount <span className="font-normal text-slate-400">filter in USD</span>
          </label>
          <div className="flex gap-1">
            <input
              type="number"
              placeholder="Min"
              className={input}
              value={filter.amountMin}
              onChange={(e) => set("amountMin", e.target.value)}
            />
            <input
              type="number"
              placeholder="Max"
              className={input}
              value={filter.amountMax}
              onChange={(e) => set("amountMax", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Region / Sales Rep</label>
          <div className="flex gap-1">
            <select className={input} value={filter.region} onChange={(e) => set("region", e.target.value)}>
              <option value="">All regions</option>
              {regions.map((r) => <option key={r}>{r}</option>)}
            </select>
            <select className={input} value={filter.salesRep} onChange={(e) => set("salesRep", e.target.value)}>
              <option value="">All reps</option>
              {salesReps.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>
      {hasFilter && (
        <button
          onClick={onClear}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
