# Real-Time Sales Analytics Dashboard — Design

**Date:** 2026-05-30
**Status:** Approved

## Objective

A real-time sales analytics dashboard that:
- seeds plausible sales history with an LLM on first run,
- displays live analytics that update without page refresh,
- lets users filter transactions with natural-language queries via a chat agent,
- has an agent that shows its interpretation/confidence, asks for clarification when ambiguous, learns from corrections, and proactively surfaces drift insights.

## Stack

- **App:** Next.js (App Router) + TypeScript + Tailwind. Single app, single `pnpm dev`.
- **DB:** SQLite via `better-sqlite3`.
- **Real-time:** Server-Sent Events (SSE) — one-directional, native `EventSource`, no WebSocket server needed.
- **LLM:** OpenAI `gpt-4o-mini` via `@ai-sdk/openai`, read from `OPENAI_API_KEY`.
- **Agent framework:** Mastra (`@mastra/core`), embedded in the Next.js process (no separate `mastra dev`).

## Architecture & module layout

```
src/lib/
  db.ts             SQLite setup + schema + migrations-on-boot
  seed.ts           LLM seed generation (+ deterministic fallback if no key/error)
  currency.ts       static FX table -> amountUsd for comparable analytics
  analytics.ts      pure: transactions[] -> analytics object
  events.ts         in-process SSE event bus (globalThis singleton)
  transactions.ts   create + filtered query
  agent/
    resolver.ts     match parsed values to real DB values, apply corrections,
                    decide clarify-vs-execute, run the query
    corrections.ts  store/lookup learned aliases (term+field -> resolvedValue)
    drift.ts        drift metric + noteworthy check
src/mastra/
  index.ts          Mastra instance (registers queryAgent)
  agents/query-agent.ts  NL text -> structured filter draft (Zod output schema)
app/api/
  transactions/route.ts  POST create, GET list (with filters)
  query/route.ts         POST NL query -> interpretation + results or clarification
  correction/route.ts    POST store correction + re-run
  analytics/route.ts     GET current analytics
  stream/route.ts        GET SSE stream
app/
  (dashboard) page.tsx   analytics cards + charts, chat panel, transactions table
  transactions/new       create-transaction form
src/components/
  AnalyticsCards, RevenueChart, ChatPanel, TransactionsTable, TransactionForm
```

**Core principle — keep the LLM boundary thin and deterministic everywhere else.** The Mastra agent does *extraction only*. All resolution, confidence decisions, querying, analytics, and drift logic are deterministic, pure where possible, and unit-tested. The LLM is never given DB tools and never runs queries.

## Data model (SQLite)

```sql
transactions(
  id TEXT PK, customerName TEXT, amount REAL, currency TEXT,
  amountUsd REAL, region TEXT, salesRep TEXT,
  date TEXT, createdAt TEXT
)
corrections(
  id TEXT PK, term TEXT, field TEXT, resolvedValue TEXT, createdAt TEXT,
  UNIQUE(term, field)
)
```

Reps and regions are derived as `DISTINCT` values from `transactions` — no separate tables.
`amountUsd` is computed at insert time from a static FX table so "total revenue" and averages are comparable across currencies.

## Currency handling

Static hardcoded FX rates -> USD (`currency.ts`). Original `amount` + `currency` preserved; `amountUsd` derived for analytics. **Limitation (documented):** rates are static, not live.

## Real-time

- `GET /api/stream` (SSE) subscribes a client to the in-process event bus.
- `POST /api/transactions` inserts, recomputes analytics, runs drift check, then publishes
  `{ type: 'transaction', transaction, analytics, insight? }` to the bus.
- All open dashboards update cards/charts/table and render any drift insight in the chat panel — no refresh.
- Event bus is a `globalThis` singleton to survive Next.js HMR / module reloads in dev.

## NL Query Agent

Per-query flow:

1. **Correction lookup first.** Normalize terms (lowercase/trim). If a term has a stored correction for a field, resolve directly and skip ambiguity handling.
2. **LLM parse (Mastra queryAgent).** Structured output (Zod): `{ filter draft, per-field confidence, interpretation string }`. Filter fields: `salesRep?, region?, customer?, currency?, amountMin?, amountMax?, dateFrom?, dateTo?`.
3. **Resolve** each parsed value against real DB distinct values (case-insensitive + substring/fuzzy match):
   - exactly one candidate -> **silent execute** (still show interpretation chip, e.g. *"Reading this as: Sales Rep = John Smith"*).
   - more than one candidate (e.g. "John" -> John Smith / John Doe) **or** empty parse -> **ask clarification** with clickable candidate chips.
4. **Clarification resolution:** clicking a chip resolves the query *and* stores a correction. The user may also type a natural correction ("no, I meant John Smith") — the agent detects it references the last query, stores the alias, and re-runs.

**Clarify-vs-execute trigger:** ambiguity (>1 candidate) or empty parse -> ask; unambiguous single match -> execute. Avoids nagging on clear queries while catching genuinely ambiguous ones.

## Learning from corrections

Every resolved ambiguity (chip click or NL correction) writes `corrections(term, field, resolvedValue)`. Step 1 consults it first, so the same ambiguous term auto-resolves next time. Persisted in SQLite — survives restarts.

**Trade-off (documented):** corrections live in app SQLite rather than Mastra's memory primitive, so the resolver can consult them deterministically and they remain queryable.

## Drift detection — average deal size per region

On each new transaction, compute the new deal's **z-score against its region's prior deals**. Surface an insight in chat when:

> region has **>= 3 prior deals** AND **|z| > 2**

Example insight: *"Heads up — this $250k West deal is 3.1σ above West's avg ($40k); West's average deal size jumped 28% -> $52k."*

- **Why this metric:** average deal size per region is business-meaningful (signals shifting deal quality/mix) and segment-scoped, so a single deal can move it enough to be interesting — unlike total revenue, which one deal barely dents.
- **Why this noteworthy rule:** the >=3 prior-deals guard avoids alerting on noise from near-empty regions; the 2σ bar fires only on genuine outliers, not routine deals.

## Seeding

On first run (empty `transactions` table), generate ~50-80 plausible transactions as JSON via the OpenAI model (AI SDK + Zod schema): realistic reps mapped to regions, customer names, amounts, currencies, dates spread over recent months. Idempotent (only seeds when empty). **Deterministic fallback** generator runs if no API key or the call fails, so the app always boots.

## Analytics displayed

- Total revenue (USD-normalized), transaction count, average deal size (cards).
- Revenue by region (bar chart).
- Top sales reps (bar or list).
- Library: `recharts`.

## Testing

Vitest unit tests on the deterministic core:
- currency conversion,
- analytics aggregation,
- resolver ambiguity + correction application,
- drift threshold logic.

LLM calls (Mastra agent, seed generation) are mocked.

## Scope guardrails (explicitly NOT building)

Auth, multi-user, live FX API, pagination, edit/delete transactions, conversation memory beyond corrections.

## README requirements (to deliver)

- One-line setup (`pnpm install && pnpm dev`) + `OPENAI_API_KEY` note.
- Technical approach, key decisions, trade-offs.
- Assumptions/limitations + one thing the agent got wrong during development and how the system was changed.
- Points to focus on during review.
