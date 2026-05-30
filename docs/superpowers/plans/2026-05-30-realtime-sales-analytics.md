# Real-Time Sales Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js real-time sales analytics dashboard with LLM-seeded data, live SSE updates, a Mastra-powered NL query agent that asks for clarification + learns from corrections, and deterministic per-region drift detection.

**Architecture:** Single Next.js (App Router) app. SQLite (`better-sqlite3`) for storage. The LLM boundary is thin: a Mastra `queryAgent` extracts a structured filter draft from NL text; all resolution, confidence, querying, analytics, and drift logic are deterministic and unit-tested. Real-time via Server-Sent Events backed by an in-process event bus.

**Tech Stack:** Next.js + TypeScript + Tailwind, better-sqlite3, Mastra (`@mastra/core`), `@ai-sdk/openai`, zod, recharts, vitest.

---

## File Structure

```
src/lib/
  types.ts          shared TypeScript types
  db.ts             SQLite connection + schema bootstrap (globalThis singleton)
  currency.ts       static FX table + toUsd()
  analytics.ts      pure computeAnalytics(transactions[])
  transactions.ts   createTransaction() + queryTransactions(filter)
  events.ts         SSE event bus (globalThis singleton)
  agent/
    corrections.ts  normalizeTerm/saveCorrection/lookupCorrection
    resolver.ts     resolveFilter(): match values, apply corrections, flag ambiguity
    drift.ts        detectDrift() z-score rule + template message
src/mastra/
  index.ts          Mastra instance
  agents/query-agent.ts  NL -> structured filter draft (zod output)
app/api/
  transactions/route.ts  POST create, GET list(filter)
  query/route.ts         POST NL query
  correction/route.ts    POST store correction + re-run
  analytics/route.ts     GET analytics
  stream/route.ts        GET SSE
app/
  layout.tsx, globals.css
  page.tsx               dashboard
  transactions/new/page.tsx  create form
src/components/
  AnalyticsCards.tsx, RevenueChart.tsx, ChatPanel.tsx,
  TransactionsTable.tsx, TransactionForm.tsx
src/lib/seed.ts          LLM seed + deterministic fallback
tests/                   vitest unit tests
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `app/globals.css`, `app/layout.tsx`, `.env.example`

- [ ] **Step 1: Initialize Next.js + deps**

Run:
```bash
cd realtime-sales-analytics
pnpm init
pnpm add next@latest react react-dom better-sqlite3 zod recharts @mastra/core @ai-sdk/openai ai
pnpm add -D typescript @types/react @types/node @types/better-sqlite3 tailwindcss postcss autoprefixer vitest
```

- [ ] **Step 2: Add scripts to package.json**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};
export default nextConfig;
```

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

`.env.example`:
```
OPENAI_API_KEY=sk-...
```

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/layout.tsx`:
```tsx
import "./globals.css";
export const metadata = { title: "Sales Analytics" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify build tooling**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + vitest project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the types**

```ts
export type Transaction = {
  id: string;
  customerName: string;
  amount: number;
  currency: string;
  amountUsd: number;
  region: string;
  salesRep: string;
  date: string;       // ISO date (YYYY-MM-DD)
  createdAt: string;  // ISO datetime
};

export type NewTransactionInput = {
  customerName: string;
  amount: number;
  currency: string;
  region: string;
  salesRep: string;
  date?: string;      // defaults to today if omitted
};

export type Filter = {
  salesRep?: string;
  region?: string;
  customer?: string;
  currency?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type Analytics = {
  totalRevenueUsd: number;
  transactionCount: number;
  avgDealSizeUsd: number;
  revenueByRegion: { region: string; revenueUsd: number }[];
  topReps: { salesRep: string; revenueUsd: number }[];
};

export type Ambiguity = { field: keyof Filter; term: string; candidates: string[] };

export type ResolveResult = {
  resolved: Filter;
  ambiguities: Ambiguity[];
  interpretation: string;      // human-readable summary of resolved fields
  needsClarification: boolean;
};

export type DriftInsight = {
  region: string;
  amount: number;
  z: number;
  prevAvg: number;
  newAvg: number;
  pctChange: number;
  message: string;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3: Currency conversion (TDD)

**Files:**
- Create: `src/lib/currency.ts`
- Test: `tests/currency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toUsd, SUPPORTED_CURRENCIES } from "@/src/lib/currency";

describe("toUsd", () => {
  it("returns the same amount for USD", () => {
    expect(toUsd(100, "USD")).toBe(100);
  });
  it("converts EUR to USD using the static rate", () => {
    expect(toUsd(100, "EUR")).toBeCloseTo(108, 5);
  });
  it("is case-insensitive on the currency code", () => {
    expect(toUsd(100, "eur")).toBeCloseTo(108, 5);
  });
  it("throws on an unknown currency", () => {
    expect(() => toUsd(100, "XYZ")).toThrow();
  });
  it("exposes the supported currency list", () => {
    expect(SUPPORTED_CURRENCIES).toContain("USD");
    expect(SUPPORTED_CURRENCIES).toContain("EUR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/currency.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// Static FX rates -> USD. Limitation: not live rates.
const FX_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.66,
  JPY: 0.0067,
};

export const SUPPORTED_CURRENCIES = Object.keys(FX_TO_USD);

export function toUsd(amount: number, currency: string): number {
  const rate = FX_TO_USD[currency.toUpperCase()];
  if (rate === undefined) throw new Error(`Unsupported currency: ${currency}`);
  return amount * rate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/currency.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency.ts tests/currency.test.ts
git commit -m "feat: add static currency conversion"
```

---

## Task 4: Analytics computation (TDD)

**Files:**
- Create: `src/lib/analytics.ts`
- Test: `tests/analytics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeAnalytics } from "@/src/lib/analytics";
import type { Transaction } from "@/src/lib/types";

const txn = (over: Partial<Transaction>): Transaction => ({
  id: "1", customerName: "Acme", amount: 100, currency: "USD", amountUsd: 100,
  region: "West", salesRep: "John Smith", date: "2026-01-01",
  createdAt: "2026-01-01T00:00:00Z", ...over,
});

describe("computeAnalytics", () => {
  it("returns zeros for no transactions", () => {
    const a = computeAnalytics([]);
    expect(a.totalRevenueUsd).toBe(0);
    expect(a.transactionCount).toBe(0);
    expect(a.avgDealSizeUsd).toBe(0);
    expect(a.revenueByRegion).toEqual([]);
    expect(a.topReps).toEqual([]);
  });

  it("sums revenue and counts in USD", () => {
    const a = computeAnalytics([
      txn({ id: "1", amountUsd: 100 }),
      txn({ id: "2", amountUsd: 300 }),
    ]);
    expect(a.totalRevenueUsd).toBe(400);
    expect(a.transactionCount).toBe(2);
    expect(a.avgDealSizeUsd).toBe(200);
  });

  it("groups revenue by region sorted descending", () => {
    const a = computeAnalytics([
      txn({ id: "1", region: "West", amountUsd: 100 }),
      txn({ id: "2", region: "East", amountUsd: 250 }),
      txn({ id: "3", region: "West", amountUsd: 100 }),
    ]);
    expect(a.revenueByRegion).toEqual([
      { region: "East", revenueUsd: 250 },
      { region: "West", revenueUsd: 200 },
    ]);
  });

  it("ranks top reps by revenue descending", () => {
    const a = computeAnalytics([
      txn({ id: "1", salesRep: "John Smith", amountUsd: 100 }),
      txn({ id: "2", salesRep: "Sarah Lee", amountUsd: 500 }),
    ]);
    expect(a.topReps[0]).toEqual({ salesRep: "Sarah Lee", revenueUsd: 500 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/analytics.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Transaction, Analytics } from "@/src/lib/types";

function sumBy(txns: Transaction[], key: "region" | "salesRep") {
  const map = new Map<string, number>();
  for (const t of txns) map.set(t[key], (map.get(t[key]) ?? 0) + t.amountUsd);
  return [...map.entries()]
    .map(([k, revenueUsd]) => ({ k, revenueUsd }))
    .sort((a, b) => b.revenueUsd - a.revenueUsd);
}

export function computeAnalytics(txns: Transaction[]): Analytics {
  const totalRevenueUsd = txns.reduce((s, t) => s + t.amountUsd, 0);
  const transactionCount = txns.length;
  const avgDealSizeUsd = transactionCount ? totalRevenueUsd / transactionCount : 0;
  return {
    totalRevenueUsd,
    transactionCount,
    avgDealSizeUsd,
    revenueByRegion: sumBy(txns, "region").map((x) => ({ region: x.k, revenueUsd: x.revenueUsd })),
    topReps: sumBy(txns, "salesRep").map((x) => ({ salesRep: x.k, revenueUsd: x.revenueUsd })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/analytics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts tests/analytics.test.ts
git commit -m "feat: add analytics computation"
```

---

## Task 5: Drift detection (TDD)

**Files:**
- Create: `src/lib/agent/drift.ts`
- Test: `tests/drift.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { detectDrift } from "@/src/lib/agent/drift";

describe("detectDrift", () => {
  it("returns null when region has fewer than 3 prior deals", () => {
    expect(detectDrift("West", 1000, [40, 50])).toBeNull();
  });

  it("returns null for an in-distribution deal", () => {
    // prior mean ~45, sd small; a 46 deal is not an outlier
    expect(detectDrift("West", 46, [44, 45, 46, 45, 44])).toBeNull();
  });

  it("flags an outlier above 2 sigma with >=3 prior deals", () => {
    const insight = detectDrift("West", 250, [40, 42, 38, 41, 39]);
    expect(insight).not.toBeNull();
    expect(insight!.region).toBe("West");
    expect(insight!.z).toBeGreaterThan(2);
    expect(insight!.newAvg).toBeGreaterThan(insight!.prevAvg);
    expect(insight!.message).toContain("West");
  });

  it("returns null when prior deals have zero variance (sd=0)", () => {
    // avoid divide-by-zero; identical priors mean no meaningful z
    expect(detectDrift("West", 100, [40, 40, 40])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/drift.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { DriftInsight } from "@/src/lib/types";

const MIN_PRIOR_DEALS = 3;
const Z_THRESHOLD = 2;

function mean(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdDev(xs: number[], mu: number) {
  const variance = xs.reduce((s, x) => s + (x - mu) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/**
 * Drift metric: average deal size per region.
 * Noteworthy when the region has >= 3 prior deals AND the new deal is
 * more than 2 standard deviations from the region's prior mean.
 * `priorAmountsUsd` is the region's deal amounts BEFORE this one.
 */
export function detectDrift(
  region: string,
  newAmountUsd: number,
  priorAmountsUsd: number[],
): DriftInsight | null {
  if (priorAmountsUsd.length < MIN_PRIOR_DEALS) return null;

  const prevAvg = mean(priorAmountsUsd);
  const sd = stdDev(priorAmountsUsd, prevAvg);
  if (sd === 0) return null;

  const z = (newAmountUsd - prevAvg) / sd;
  if (Math.abs(z) <= Z_THRESHOLD) return null;

  const newAvg = mean([...priorAmountsUsd, newAmountUsd]);
  const pctChange = ((newAvg - prevAvg) / prevAvg) * 100;
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const dir = pctChange >= 0 ? "+" : "";
  const message =
    `Heads up — this ${usd(newAmountUsd)} ${region} deal is ${z.toFixed(1)}σ ` +
    `from ${region}'s average (${usd(prevAvg)}); average deal size moved ` +
    `${dir}${pctChange.toFixed(0)}% → ${usd(newAvg)}.`;

  return { region, amount: newAmountUsd, z, prevAvg, newAvg, pctChange, message };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/drift.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/drift.ts tests/drift.test.ts
git commit -m "feat: add per-region drift detection"
```

---

## Task 6: Database layer

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write the DB bootstrap**

```ts
import Database from "better-sqlite3";

// Reuse one connection across HMR reloads in dev.
const g = globalThis as unknown as { __db?: Database.Database };

function init(): Database.Database {
  const db = new Database(process.env.SQLITE_PATH ?? "sales.db");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      customerName TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      amountUsd REAL NOT NULL,
      region TEXT NOT NULL,
      salesRep TEXT NOT NULL,
      date TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      field TEXT NOT NULL,
      resolvedValue TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(term, field)
    );
  `);
  return db;
}

export const db = g.__db ?? (g.__db = init());
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add SQLite database layer"
```

---

## Task 7: Corrections store (TDD with in-memory DB)

**Files:**
- Create: `src/lib/agent/corrections.ts`
- Test: `tests/corrections.test.ts`

Note: tests use a fresh in-memory DB injected via the `SQLITE_PATH=:memory:` env var is not reliable across the shared singleton, so the functions take an explicit `Database` handle for testability and the app passes `db`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { normalizeTerm, saveCorrection, lookupCorrection } from "@/src/lib/agent/corrections";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE corrections (
    id TEXT PRIMARY KEY, term TEXT, field TEXT, resolvedValue TEXT, createdAt TEXT,
    UNIQUE(term, field));`);
});

describe("normalizeTerm", () => {
  it("lowercases and trims", () => {
    expect(normalizeTerm("  John ")).toBe("john");
  });
});

describe("corrections store", () => {
  it("returns null when no correction exists", () => {
    expect(lookupCorrection(db, "john", "salesRep")).toBeNull();
  });

  it("saves and looks up a correction (normalized)", () => {
    saveCorrection(db, "John", "salesRep", "John Smith");
    expect(lookupCorrection(db, " john ", "salesRep")).toBe("John Smith");
  });

  it("overwrites an existing correction for the same term+field", () => {
    saveCorrection(db, "john", "salesRep", "John Doe");
    saveCorrection(db, "john", "salesRep", "John Smith");
    expect(lookupCorrection(db, "john", "salesRep")).toBe("John Smith");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/corrections.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase();
}

export function saveCorrection(
  db: Database.Database, term: string, field: string, resolvedValue: string,
): void {
  db.prepare(
    `INSERT INTO corrections (id, term, field, resolvedValue, createdAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(term, field) DO UPDATE SET resolvedValue = excluded.resolvedValue`,
  ).run(randomUUID(), normalizeTerm(term), field, resolvedValue, new Date().toISOString());
}

export function lookupCorrection(
  db: Database.Database, term: string, field: string,
): string | null {
  const row = db.prepare(
    `SELECT resolvedValue FROM corrections WHERE term = ? AND field = ?`,
  ).get(normalizeTerm(term), field) as { resolvedValue: string } | undefined;
  return row?.resolvedValue ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/corrections.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/corrections.ts tests/corrections.test.ts
git commit -m "feat: add corrections store"
```

---

## Task 8: Filter resolver (TDD)

**Files:**
- Create: `src/lib/agent/resolver.ts`
- Test: `tests/resolver.test.ts`

The resolver takes a raw filter draft (from the LLM), the set of known values per field, and a correction lookup, and decides what is resolved vs ambiguous.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveFilter } from "@/src/lib/agent/resolver";

const known = {
  salesRep: ["John Smith", "John Doe", "Sarah Lee"],
  region: ["West", "East", "North"],
  currency: ["USD", "EUR"],
};
const noCorrections = () => null;

describe("resolveFilter", () => {
  it("resolves an exact single match silently", () => {
    const r = resolveFilter({ salesRep: "Sarah" }, known, noCorrections);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.salesRep).toBe("Sarah Lee");
    expect(r.interpretation).toContain("Sarah Lee");
  });

  it("flags ambiguity when a term matches multiple known values", () => {
    const r = resolveFilter({ salesRep: "John" }, known, noCorrections);
    expect(r.needsClarification).toBe(true);
    expect(r.ambiguities[0].field).toBe("salesRep");
    expect(r.ambiguities[0].candidates).toEqual(["John Smith", "John Doe"]);
    expect(r.resolved.salesRep).toBeUndefined();
  });

  it("applies a stored correction before checking ambiguity", () => {
    const corrections = (term: string, field: string) =>
      term === "john" && field === "salesRep" ? "John Smith" : null;
    const r = resolveFilter({ salesRep: "John" }, known, corrections);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.salesRep).toBe("John Smith");
  });

  it("passes through numeric/date filters untouched", () => {
    const r = resolveFilter({ amountMin: 1000, dateFrom: "2026-01-01" }, known, noCorrections);
    expect(r.needsClarification).toBe(false);
    expect(r.resolved.amountMin).toBe(1000);
    expect(r.resolved.dateFrom).toBe("2026-01-01");
  });

  it("flags an unknown value as ambiguous with no candidates", () => {
    const r = resolveFilter({ region: "Atlantis" }, known, noCorrections);
    expect(r.needsClarification).toBe(true);
    expect(r.ambiguities[0].candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/resolver.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Filter, ResolveResult, Ambiguity } from "@/src/lib/types";

type KnownValues = Partial<Record<keyof Filter, string[]>>;
type CorrectionLookup = (term: string, field: string) => string | null;

const TEXT_FIELDS: (keyof Filter)[] = ["salesRep", "region", "customer", "currency"];

function matchCandidates(term: string, known: string[]): string[] {
  const t = term.toLowerCase();
  const exact = known.filter((k) => k.toLowerCase() === t);
  if (exact.length) return exact;
  return known.filter((k) => k.toLowerCase().includes(t));
}

export function resolveFilter(
  draft: Filter,
  known: KnownValues,
  lookupCorrection: CorrectionLookup,
): ResolveResult {
  const resolved: Filter = {};
  const ambiguities: Ambiguity[] = [];

  for (const [k, v] of Object.entries(draft)) {
    const field = k as keyof Filter;
    if (v === undefined || v === null || v === "") continue;

    if (!TEXT_FIELDS.includes(field)) {
      (resolved as Record<string, unknown>)[field] = v;
      continue;
    }

    const term = String(v);
    const corrected = lookupCorrection(term, field);
    if (corrected) {
      (resolved as Record<string, string>)[field] = corrected;
      continue;
    }

    const candidates = matchCandidates(term, known[field] ?? []);
    if (candidates.length === 1) {
      (resolved as Record<string, string>)[field] = candidates[0];
    } else {
      ambiguities.push({ field, term, candidates });
    }
  }

  const interpretation = Object.entries(resolved)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");

  return {
    resolved,
    ambiguities,
    interpretation: interpretation || "no filters",
    needsClarification: ambiguities.length > 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/resolver.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/resolver.ts tests/resolver.test.ts
git commit -m "feat: add filter resolver with ambiguity + corrections"
```

---

## Task 9: Transactions repository

**Files:**
- Create: `src/lib/transactions.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { randomUUID } from "node:crypto";
import { db } from "@/src/lib/db";
import { toUsd } from "@/src/lib/currency";
import type { Transaction, NewTransactionInput, Filter } from "@/src/lib/types";

export function createTransaction(input: NewTransactionInput): Transaction {
  const txn: Transaction = {
    id: randomUUID(),
    customerName: input.customerName,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    amountUsd: toUsd(input.amount, input.currency),
    region: input.region,
    salesRep: input.salesRep,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO transactions
     (id, customerName, amount, currency, amountUsd, region, salesRep, date, createdAt)
     VALUES (@id, @customerName, @amount, @currency, @amountUsd, @region, @salesRep, @date, @createdAt)`,
  ).run(txn);
  return txn;
}

export function queryTransactions(filter: Filter = {}): Transaction[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.salesRep) { where.push("salesRep = @salesRep"); params.salesRep = filter.salesRep; }
  if (filter.region) { where.push("region = @region"); params.region = filter.region; }
  if (filter.currency) { where.push("currency = @currency"); params.currency = filter.currency; }
  if (filter.customer) { where.push("customerName LIKE @customer"); params.customer = `%${filter.customer}%`; }
  if (filter.amountMin !== undefined) { where.push("amountUsd >= @amountMin"); params.amountMin = filter.amountMin; }
  if (filter.amountMax !== undefined) { where.push("amountUsd <= @amountMax"); params.amountMax = filter.amountMax; }
  if (filter.dateFrom) { where.push("date >= @dateFrom"); params.dateFrom = filter.dateFrom; }
  if (filter.dateTo) { where.push("date <= @dateTo"); params.dateTo = filter.dateTo; }

  const sql = `SELECT * FROM transactions
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY date DESC, createdAt DESC`;
  return db.prepare(sql).all(params) as Transaction[];
}

export function distinctValues(column: "salesRep" | "region" | "currency"): string[] {
  const rows = db.prepare(`SELECT DISTINCT ${column} AS v FROM transactions ORDER BY v`).all() as { v: string }[];
  return rows.map((r) => r.v);
}

export function regionPriorAmountsUsd(region: string): number[] {
  const rows = db.prepare(
    `SELECT amountUsd FROM transactions WHERE region = ? ORDER BY createdAt ASC`,
  ).all(region) as { amountUsd: number }[];
  return rows.map((r) => r.amountUsd);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/transactions.ts
git commit -m "feat: add transactions repository"
```

---

## Task 10: Event bus (SSE backbone)

**Files:**
- Create: `src/lib/events.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { EventEmitter } from "node:events";
import type { Transaction, Analytics, DriftInsight } from "@/src/lib/types";

export type TransactionEvent = {
  type: "transaction";
  transaction: Transaction;
  analytics: Analytics;
  insight: DriftInsight | null;
};

const g = globalThis as unknown as { __bus?: EventEmitter };
const bus = g.__bus ?? (g.__bus = new EventEmitter());
bus.setMaxListeners(0);

export function publishTransaction(event: TransactionEvent): void {
  bus.emit("event", event);
}

export function subscribe(handler: (event: TransactionEvent) => void): () => void {
  bus.on("event", handler);
  return () => bus.off("event", handler);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/events.ts
git commit -m "feat: add in-process event bus"
```

---

## Task 11: Mastra query agent

**Files:**
- Create: `src/mastra/agents/query-agent.ts`, `src/mastra/index.ts`

- [ ] **Step 1: Write the query agent**

`src/mastra/agents/query-agent.ts`:
```ts
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const filterSchema = z.object({
  salesRep: z.string().optional(),
  region: z.string().optional(),
  customer: z.string().optional(),
  currency: z.string().optional(),
  amountMin: z.number().optional(),
  amountMax: z.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const queryAgent = new Agent({
  name: "queryAgent",
  instructions: `You extract sales-transaction filters from a user's natural-language request.
Return ONLY the fields the user clearly intends. Use partial names as the user typed them
(e.g. "John") — do NOT guess a full name. Omit fields that are not mentioned.
Dates must be ISO (YYYY-MM-DD). Amounts are numbers without currency symbols.`,
  model: openai("gpt-4o-mini"),
});
```

`src/mastra/index.ts`:
```ts
import { Mastra } from "@mastra/core";
import { queryAgent } from "./agents/query-agent";

export const mastra = new Mastra({ agents: { queryAgent } });
```

- [ ] **Step 2: Write the parse helper that calls the agent**

Append to `src/mastra/agents/query-agent.ts`:
```ts
import type { Filter } from "@/src/lib/types";

export async function parseQuery(text: string): Promise<Filter> {
  const res = await queryAgent.generate(text, {
    experimental_output: filterSchema,
  });
  // Strip undefined keys so the resolver sees only intended fields.
  const out = res.object ?? {};
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Filter;
}
```

> Note for implementer: confirm the Mastra structured-output API at build time. If `experimental_output` / `res.object` differs in the installed `@mastra/core` version, use the equivalent structured-output call (the agent + zod schema intent is the contract). Adjust the single `parseQuery` function only; the rest of the system depends on its `Filter` return type, not on Mastra internals.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mastra
git commit -m "feat: add Mastra query agent + parseQuery"
```

---

## Task 12: Seeding (LLM + deterministic fallback)

**Files:**
- Create: `src/lib/seed.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { db } from "@/src/lib/db";
import { createTransaction } from "@/src/lib/transactions";
import { SUPPORTED_CURRENCIES } from "@/src/lib/currency";

const seedSchema = z.object({
  transactions: z.array(z.object({
    customerName: z.string(),
    amount: z.number(),
    currency: z.string(),
    region: z.string(),
    salesRep: z.string(),
    date: z.string(),
  })),
});

const REGIONS = ["West", "East", "North", "South"];
const REPS = ["John Smith", "John Doe", "Sarah Lee", "Mike Chen", "Priya Patel"];

function isEmpty(): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
  return row.n === 0;
}

function fallbackSeed() {
  const customers = ["Acme", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Stark", "Wayne"];
  let day = 0;
  for (let i = 0; i < 60; i++) {
    day = (day + 3) % 180;
    const date = new Date(Date.now() - day * 86400000).toISOString().slice(0, 10);
    createTransaction({
      customerName: `${customers[i % customers.length]} ${i}`,
      amount: Math.round((2000 + Math.random() * 80000) / 100) * 100,
      currency: SUPPORTED_CURRENCIES[i % SUPPORTED_CURRENCIES.length],
      region: REGIONS[i % REGIONS.length],
      salesRep: REPS[i % REPS.length],
      date,
    });
  }
}

async function llmSeed(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false;
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: seedSchema,
      prompt: `Generate 60 plausible B2B sales transactions for the last 6 months.
Use these regions: ${REGIONS.join(", ")}. Use these sales reps: ${REPS.join(", ")}.
Use currencies from: ${SUPPORTED_CURRENCIES.join(", ")} (mostly USD).
Realistic company customer names, amounts between 2,000 and 90,000, ISO dates (YYYY-MM-DD).`,
    });
    for (const t of object.transactions) {
      const currency = SUPPORTED_CURRENCIES.includes(t.currency.toUpperCase()) ? t.currency : "USD";
      createTransaction({ ...t, currency });
    }
    return true;
  } catch (err) {
    console.warn("LLM seed failed, using fallback:", err);
    return false;
  }
}

let seeding: Promise<void> | null = null;
export function ensureSeeded(): Promise<void> {
  if (seeding) return seeding;
  seeding = (async () => {
    if (!isEmpty()) return;
    const ok = await llmSeed();
    if (!ok && isEmpty()) fallbackSeed();
  })();
  return seeding;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seed.ts
git commit -m "feat: add LLM seeding with deterministic fallback"
```

---

## Task 13: API routes

**Files:**
- Create: `app/api/transactions/route.ts`, `app/api/query/route.ts`, `app/api/correction/route.ts`, `app/api/analytics/route.ts`, `app/api/stream/route.ts`

- [ ] **Step 1: analytics + seeding bootstrap route**

`app/api/analytics/route.ts`:
```ts
import { NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { queryTransactions } from "@/src/lib/transactions";
import { computeAnalytics } from "@/src/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  return NextResponse.json(computeAnalytics(queryTransactions()));
}
```

- [ ] **Step 2: transactions route (create + list)**

`app/api/transactions/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { createTransaction, queryTransactions, regionPriorAmountsUsd } from "@/src/lib/transactions";
import { computeAnalytics } from "@/src/lib/analytics";
import { detectDrift } from "@/src/lib/agent/drift";
import { publishTransaction } from "@/src/lib/events";
import type { Filter, NewTransactionInput } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const p = req.nextUrl.searchParams;
  const filter: Filter = {};
  for (const k of ["salesRep", "region", "currency", "customer", "dateFrom", "dateTo"] as const) {
    const v = p.get(k); if (v) (filter as Record<string, string>)[k] = v;
  }
  const min = p.get("amountMin"); if (min) filter.amountMin = Number(min);
  const max = p.get("amountMax"); if (max) filter.amountMax = Number(max);
  return NextResponse.json(queryTransactions(filter));
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const body = (await req.json()) as NewTransactionInput;
  // drift uses amounts BEFORE inserting the new one
  const prior = regionPriorAmountsUsd(body.region);
  const transaction = createTransaction(body);
  const insight = detectDrift(transaction.region, transaction.amountUsd, prior);
  const analytics = computeAnalytics(queryTransactions());
  publishTransaction({ type: "transaction", transaction, analytics, insight });
  return NextResponse.json({ transaction, analytics, insight });
}
```

- [ ] **Step 3: NL query route**

`app/api/query/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/src/lib/seed";
import { parseQuery } from "@/src/mastra/agents/query-agent";
import { resolveFilter } from "@/src/lib/agent/resolver";
import { queryTransactions, distinctValues } from "@/src/lib/transactions";
import { lookupCorrection } from "@/src/lib/agent/corrections";
import { db } from "@/src/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { text } = (await req.json()) as { text: string };

  const draft = await parseQuery(text);
  const known = {
    salesRep: distinctValues("salesRep"),
    region: distinctValues("region"),
    currency: distinctValues("currency"),
  };
  const result = resolveFilter(draft, known, (term, field) => lookupCorrection(db, term, field));

  if (result.needsClarification) {
    return NextResponse.json({
      status: "clarify",
      interpretation: result.interpretation,
      ambiguities: result.ambiguities,
    });
  }
  return NextResponse.json({
    status: "ok",
    interpretation: result.interpretation,
    filter: result.resolved,
    transactions: queryTransactions(result.resolved),
  });
}
```

- [ ] **Step 4: correction route**

`app/api/correction/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { saveCorrection } from "@/src/lib/agent/corrections";
import { resolveFilter } from "@/src/lib/agent/resolver";
import { queryTransactions, distinctValues } from "@/src/lib/transactions";
import { lookupCorrection } from "@/src/lib/agent/corrections";
import { db } from "@/src/lib/db";
import type { Filter } from "@/src/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { term, field, resolvedValue, baseFilter } =
    (await req.json()) as { term: string; field: string; resolvedValue: string; baseFilter?: Filter };

  saveCorrection(db, term, field, resolvedValue);

  const draft: Filter = { ...(baseFilter ?? {}), [field]: term };
  const known = {
    salesRep: distinctValues("salesRep"),
    region: distinctValues("region"),
    currency: distinctValues("currency"),
  };
  const result = resolveFilter(draft, known, (t, f) => lookupCorrection(db, t, f));
  return NextResponse.json({
    status: "ok",
    interpretation: result.interpretation,
    filter: result.resolved,
    transactions: queryTransactions(result.resolved),
  });
}
```

- [ ] **Step 5: SSE stream route**

`app/api/stream/route.ts`:
```ts
import { subscribe } from "@/src/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let unsub = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "connected" });
      unsub = subscribe(send);
    },
    cancel() { unsub(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 6: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api
git commit -m "feat: add API routes (transactions, query, correction, analytics, stream)"
```

---

## Task 14: Frontend — shared client helpers + types

**Files:**
- Create: `src/lib/format.ts`

- [ ] **Step 1: Write currency/number formatting helper**

```ts
export function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/format.ts
git commit -m "feat: add formatting helper"
```

---

## Task 15: Frontend — AnalyticsCards + RevenueChart

**Files:**
- Create: `src/components/AnalyticsCards.tsx`, `src/components/RevenueChart.tsx`

- [ ] **Step 1: AnalyticsCards**

```tsx
import type { Analytics } from "@/src/lib/types";
import { usd } from "@/src/lib/format";

export function AnalyticsCards({ a }: { a: Analytics }) {
  const cards = [
    { label: "Total Revenue", value: usd(a.totalRevenueUsd) },
    { label: "Transactions", value: a.transactionCount.toString() },
    { label: "Avg Deal Size", value: usd(a.avgDealSizeUsd) },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: RevenueChart**

```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Analytics } from "@/src/lib/types";

export function RevenueChart({ a }: { a: Analytics }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-slate-700">Revenue by Region</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={a.revenueByRegion}>
          <XAxis dataKey="region" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="revenueUsd" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/AnalyticsCards.tsx src/components/RevenueChart.tsx
git commit -m "feat: add analytics cards + revenue chart"
```

---

## Task 16: Frontend — TransactionsTable

**Files:**
- Create: `src/components/TransactionsTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { Transaction } from "@/src/lib/types";
import { usd } from "@/src/lib/format";

export function TransactionsTable({ rows }: { rows: Transaction[] }) {
  return (
    <div className="overflow-auto rounded-lg bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Region</th>
            <th className="p-3">Sales Rep</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-slate-100">
              <td className="p-3">{t.date}</td>
              <td className="p-3">{t.customerName}</td>
              <td className="p-3">{t.amount.toLocaleString()} {t.currency}</td>
              <td className="p-3">{t.region}</td>
              <td className="p-3">{t.salesRep}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-6 text-center text-slate-400">No transactions</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TransactionsTable.tsx
git commit -m "feat: add transactions table"
```

---

## Task 17: Frontend — ChatPanel

**Files:**
- Create: `src/components/ChatPanel.tsx`

The ChatPanel sends NL queries, shows the interpretation chip, renders clarification chips when needed, applies the chosen filter, and displays drift insights pushed from the parent.

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useState } from "react";
import type { Transaction, Filter, Ambiguity } from "@/src/lib/types";

type Msg =
  | { role: "user"; text: string }
  | { role: "agent"; text: string }
  | { role: "clarify"; text: string; ambiguity: Ambiguity; baseFilter: Filter };

export function ChatPanel({
  onResults,
  insights,
}: {
  onResults: (rows: Transaction[]) => void;
  insights: string[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", text }]);
    const res = await fetch("/api/query", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => r.json());

    if (res.status === "clarify") {
      const amb: Ambiguity = res.ambiguities[0];
      const label = amb.candidates.length
        ? `Did you mean one of these for ${String(amb.field)} = "${amb.term}"?`
        : `I couldn't find a ${String(amb.field)} matching "${amb.term}". Pick one:`;
      setMessages((m) => [...m, { role: "clarify", text: label, ambiguity: amb, baseFilter: {} }]);
    } else {
      setMessages((m) => [...m, { role: "agent", text: `Reading this as: ${res.interpretation}` }]);
      onResults(res.transactions);
    }
  }

  async function choose(amb: Ambiguity, value: string, baseFilter: Filter) {
    const res = await fetch("/api/correction", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: amb.term, field: amb.field, resolvedValue: value, baseFilter }),
    }).then((r) => r.json());
    setMessages((m) => [
      ...m,
      { role: "agent", text: `Got it — I'll remember "${amb.term}" means ${value}. Reading this as: ${res.interpretation}` },
    ]);
    onResults(res.transactions);
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-slate-700">Ask about your sales</div>
      <div className="flex-1 space-y-2 overflow-auto">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span className={`inline-block rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
              {m.text}
            </span>
            {m.role === "clarify" && (
              <div className="mt-1 flex flex-wrap gap-2">
                {m.ambiguity.candidates.map((c) => (
                  <button key={c} onClick={() => choose(m.ambiguity, c, m.baseFilter)}
                    className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100">
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {insights.map((t, i) => (
          <div key={`ins-${i}`}>
            <span className="inline-block rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">📈 {t}</span>
          </div>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (input.trim()) { send(input.trim()); setInput(""); } }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "Show me John&apos;s deals in the West"'
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Send</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat: add chat panel with clarification + corrections"
```

---

## Task 18: Frontend — dashboard page (wires SSE + components)

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Write the dashboard**

```tsx
"use client";
import { useEffect, useState } from "react";
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
        if (data.insight) setInsights((prev) => [...prev, data.insight.message]);
      }
    };
    return () => es.close();
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales Analytics</h1>
        <Link href="/transactions/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
          + New Transaction
        </Link>
      </div>
      <AnalyticsCards a={analytics} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><RevenueChart a={analytics} /></div>
        <div className="h-[260px]">
          <ChatPanel onResults={(r) => setFiltered(r)} insights={insights} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">
          Transactions {filtered ? `(filtered: ${filtered.length})` : `(${rows.length})`}
        </h2>
        {filtered && (
          <button onClick={() => setFiltered(null)} className="text-xs text-blue-600 underline">
            Clear filter
          </button>
        )}
      </div>
      <TransactionsTable rows={filtered ?? rows} />
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add dashboard page with live SSE updates"
```

---

## Task 19: Frontend — new transaction form

**Files:**
- Create: `src/components/TransactionForm.tsx`, `app/transactions/new/page.tsx`

- [ ] **Step 1: TransactionForm**

```tsx
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/transactions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    router.push("/");
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
      <input required placeholder="Customer Name" className={field}
        value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
      <input required type="number" placeholder="Amount" className={field}
        value={form.amount} onChange={(e) => set("amount", e.target.value)} />
      <select className={field} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
        {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className={field} value={form.region} onChange={(e) => set("region", e.target.value)}>
        {REGIONS.map((r) => <option key={r}>{r}</option>)}
      </select>
      <input required placeholder="Sales Representative" className={field}
        value={form.salesRep} onChange={(e) => set("salesRep", e.target.value)} />
      <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
        {saving ? "Saving…" : "Create Transaction"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Page**

`app/transactions/new/page.tsx`:
```tsx
import Link from "next/link";
import { TransactionForm } from "@/src/components/TransactionForm";

export default function NewTransactionPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <Link href="/" className="text-sm text-blue-600 underline">← Back to dashboard</Link>
      <h1 className="text-xl font-semibold">New Transaction</h1>
      <TransactionForm />
    </main>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/TransactionForm.tsx app/transactions/new/page.tsx
git commit -m "feat: add new transaction form"
```

---

## Task 20: Full test + manual smoke run

**Files:** none (verification)

- [ ] **Step 1: Run the whole unit suite**

Run: `pnpm test`
Expected: PASS (currency, analytics, drift, corrections, resolver).

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual smoke (with OPENAI_API_KEY set in .env.local)**

```bash
pnpm dev
```
Verify in browser at http://localhost:3000:
- Dashboard loads, seed data appears, cards + chart populated.
- Type "show me John's deals" → agent asks to clarify John Smith vs John Doe.
- Pick John Smith → table filters, agent confirms it will remember.
- Re-type "John's deals" → no clarification this time (correction applied).
- Open `/transactions/new`, add a large deal in a region with ≥3 existing deals → return to dashboard; cards update live and a 📈 drift insight appears in chat without refresh.

- [ ] **Step 4: Commit any fixes from smoke run**

```bash
git add -A
git commit -m "fix: address issues found during smoke test"
```

---

## Task 21: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

Include these sections (write real content, not placeholders):
- **Setup:** `pnpm install`, copy `.env.example` → `.env.local`, set `OPENAI_API_KEY`, `pnpm dev`. Note app falls back to deterministic seed data if no key is set.
- **Technical approach:** Next.js full-stack, SQLite, SSE real-time, Mastra `queryAgent` for NL extraction with a deterministic resolver/confidence layer. Explain the thin-LLM-boundary decision.
- **Key decisions & trade-offs:** SSE over WebSockets; corrections in SQLite vs Mastra memory; deterministic drift template vs LLM phrasing; static FX rates.
- **Drift metric writeup:** average deal size per region; noteworthy = ≥3 prior deals AND |z|>2; why chosen and why that threshold.
- **Assumptions/limitations:** single-user, static FX, no pagination, no edit/delete.
- **One thing the agent got wrong + the fix:** (fill in the real example encountered — see note below).
- **What to focus on during review:** the agent boundary (`resolver.ts`), the clarify-vs-execute rule, the corrections learning loop, the drift logic.

> Implementer note: during the smoke run, record one genuine agent misfire (e.g. the LLM returned a full guessed name "John Smith" when the user typed only "John", collapsing the ambiguity prematurely). Document the actual fix made (e.g. instruction tightened to "use partial names as typed; never guess a full name", so ambiguity is preserved for the resolver to catch). If that exact issue doesn't occur, document whatever real issue did.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review Notes (for the planner — already applied)

- **Spec coverage:** seeding (Task 12), analytics display (15/18), NL filter table (16/17/18), new-transaction form (19), real-time SSE (10/13/18), confidence/clarify (8/13/17), learning from corrections (7/13/17), drift detection + writeup (5/13/17/21), README (21). All spec sections mapped.
- **Type consistency:** `Filter`, `Transaction`, `Analytics`, `Ambiguity`, `ResolveResult`, `DriftInsight` defined once in Task 2 and used unchanged. `parseQuery → Filter`, `resolveFilter → ResolveResult`, `detectDrift → DriftInsight | null` consistent across tasks.
- **Known risk flagged in-plan:** Mastra structured-output API surface (Task 11) — isolated to `parseQuery`; everything downstream depends only on its `Filter` return type.
