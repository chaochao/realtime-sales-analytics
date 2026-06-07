# Real-Time Sales Analytics Dashboard

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy the example env file and add your OpenAI API key:
   ```bash
   cp .env.example .env.local
   # then set OPENAI_API_KEY=sk-... in .env.local
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

That's it. `npm run dev` automatically runs `prisma migrate deploy` first (creates the database and tables if they don't exist), then starts Next.js. On the first request, the app detects an empty database and seeds it — using `gpt-4o-mini` if `OPENAI_API_KEY` is set, or a deterministic fallback otherwise.

To re-seed without restarting the server (browser refresh is enough):
```bash
npm run reseed
```

---

## Technical Approach

### Stack
- **Next.js 16 (App Router)** — single app for both frontend and API routes
- **SQLite via Prisma + better-sqlite3 adapter** — zero-infrastructure persistence
- **Server-Sent Events (SSE)** — one-directional real-time push from server to all open dashboards
- **OpenAI `gpt-4o-mini`** via Vercel AI SDK — used for seeding and NL query parsing
- **Recharts** — revenue by region bar chart
- **Tailwind CSS v4** — utility styling

### Architecture

The LLM boundary is intentionally thin. The AI does two things only:
1. **Seed generation** — generates realistic transaction history on first run
2. **NL extraction** — parses a user's natural-language query into a structured filter draft (`{ salesRep?, region?, currency?, amountMin?, ... }`)

Everything downstream is deterministic:
- **Resolver** — matches the draft against real DB values (case-insensitive substring), flags ambiguity when a term matches more than one candidate (e.g. "John" → John Smith / John Doe), and applies stored corrections first
- **Analytics** — pure function over the transaction list, no LLM involved
- **Drift detection** — z-score of the new deal against the region's prior deals; fires when `|z| > 2` with at least 3 prior deals
- **Corrections** — stored in SQLite, consulted before ambiguity checks so the same term auto-resolves next time

Real-time updates use an in-process `EventEmitter` as the SSE bus (a `globalThis` singleton to survive Next.js HMR). When a transaction is created via `POST /api/transactions`, the server computes new analytics, checks for drift, and broadcasts `{ transaction, analytics, insight }` to all connected clients. The dashboard updates cards and table without a page refresh.

### Key Decisions & Trade-offs

| Decision | Reason | Trade-off |
|----------|--------|-----------|
| SSE over WebSockets | Native `EventSource`, no extra server | One-directional only (server → client) |
| SQLite over Postgres | Zero setup, ships with the app | Not suitable for multi-instance deployments |
| Corrections in SQLite | Deterministic lookups, survives restarts | Not shared across users in a multi-user setup |
| Static FX rates | No external dependency | Rates are not live; analytics are approximate for non-USD currencies |
| Thin LLM boundary | Keeps drift/analytics fast, testable, and free | NL parsing quality depends on the LLM; falls back to empty filter if key is missing |
| Prisma ORM | Type-safe queries, Prisma Studio for DB inspection | Requires an adapter layer for SQLite in Prisma v7 |

---

## Assumptions & Limitations

- **Single user** — no auth, no multi-tenancy
- **Static FX rates** — EUR/GBP/etc. converted at hardcoded rates; `amountUsd` is approximate
- **No edit or delete** — transactions are append-only
- **LLM dependency for seeding** — without `OPENAI_API_KEY` the seed data is deterministic (less realistic names/patterns) but fully functional
- **In-process SSE bus** — works in single-instance dev; would need a pub/sub layer (Redis etc.) for multi-instance production

### One thing the agent got wrong

The original `toUsd()` function returned raw floating-point multiplication results, producing values like `32400.000000000004` for `30000 * 1.08`. This was stored directly in the DB and surfaced in the UI.

**Fix:** Added `Math.round(amount * rate * 100) / 100` in `currency.ts` to round to cents at conversion time. The DB was re-seeded after the fix so no dirty values remain.

---

## Points to Focus on During Review

1. **`src/lib/agent/resolver.ts`** — the core of the NL query pipeline. This is where ambiguity is detected, corrections are applied, and the clarify-vs-execute decision is made. All deterministic and unit-tested.

2. **`src/lib/agent/drift.ts`** — z-score drift detection per region. Check the threshold logic and the minimum prior-deal guard.

3. **`app/api/transactions/route.ts` (POST)** — the real-time hot path: insert → drift check → recompute analytics → SSE broadcast, all in one request.

4. **`src/lib/seed.ts`** — LLM seeding with graceful fallback. The singleton promise pattern prevents double-seeding on concurrent first requests.

5. **`src/components/ChatPanel.tsx`** — clarification flow: ambiguous query → candidate chips → correction stored → auto-resolves on next query.

---

## Chat Filter — Design & Bug History

### What the LLM Does (and What It Doesn't)

The LLM has exactly one job: convert a free-text string into a structured filter draft.

```
"give me mik's deals in the west under 50k"
→ { salesRep: "mik", region: "west", amountMax: 50000 }
```

It does not look up names, query the DB, or decide who "mik" is. It only extracts intent into fields.

Everything after that is deterministic code:
- **Resolver** — substring-matches draft terms against real DB values (`"mike chen".includes("mik")` → `"Mike Chen"`)
- **Corrections table** — consulted before fuzzy matching; if "john → John Doe" is saved, it resolves directly
- **DB query** — pure filter, no AI involved

Mastra (`src/mastra/agents/query-agent.ts`) is the agent framework used here but barely exercised — `parseQuery` calls `generateObject` from the Vercel AI SDK directly. It was scaffolded for potential future tool-call based agents but currently adds no behavior beyond the LLM call itself.

**The full pipeline:**
```
User text → LLM → draft filter → resolver → confirmed filter → DB query → results
```

The only intelligence is in step 1. The rest is deterministic.

---

### Agent Confirmation Flow

Every query goes through a confirmation step before filters are applied:

1. User types query → LLM extracts draft filter → resolver fuzzy-matches against DB values
2. Confirmation bubble shown: "I'm reading this as: salesRep = John Doe. Is that right?"
3. **Yes** → filter applied
4. **No** → user types correction in main input → re-parsed with previous filter as base → new confirmation
5. On confirm, if the original term (e.g. "john") differs from the confirmed value (e.g. "John Doe"), the correction is saved to the DB and auto-applied next time

### Correction Learning

Corrections are stored in SQLite (`Correction` table) keyed by `(term, field)`. `saveCorrection` does an upsert, so corrections are always up to date. Only `salesRep` and `customer` fields are stored — region and currency are finite/well-known and fuzzy matching handles them without corrections.

### Bugs Fixed

**Filter context lost after correction**
When a query returned a clarify response (ambiguous term), the already-resolved fields (e.g. `region = West`) were not being passed back to the frontend. Free-text corrections sent with no `baseFilter` lost those fields.
Fix: backend returns `partialFilter: result.resolved` on clarify; frontend uses it as `correctionBase` so the next message carries resolved fields along.

**Candidate button skipped confirmation**
Clicking a clarify candidate (e.g. "John Doe") applied the filter immediately without showing a confirmation bubble.
Fix: `choose()` builds the filter locally and calls `setPendingConfirm()`. No server call, no premature save.

**Region saved as correction (e.g. "est → West")**
Clicking "West" in a clarify dialog for "est" saved the correction to the DB. Next time any query contained "est" it auto-resolved to West, overriding the user's intent.
Fix: corrections are only saved for `salesRep` and `customer`, not region or currency.

**Correction not saved when correction table resolves the query**
When "john → John Smith" was already in the correction table, queries resolved directly (no clarify). If the user then corrected "john" to mean "John Doe", the correction was never updated.
Fix: backend returns `draft` (raw LLM output before resolution) in OK responses. The frontend stores `draft` in `pendingConfirm` and carries it through the correction flow. On confirm, it compares the original term ("john") with the new resolved value ("John Doe") and saves the updated correction.

**Correction info lost between state updates**
`pendingAmbiguity` was a separate state variable that got cleared by `send()` before `handleYes()` could use it.
Fix: correction info is now embedded directly in `pendingConfirm` as `correction?: { term, field }`, so it travels with the confirmation and cannot be lost between renders.
