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
