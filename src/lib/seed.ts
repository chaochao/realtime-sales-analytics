import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { prisma } from "@/src/lib/db";
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

async function isEmpty(): Promise<boolean> {
  const count = await prisma.transaction.count();
  return count === 0;
}

async function fallbackSeed(): Promise<void> {
  console.log("[seed] Using deterministic fallback seed...");
  const customers = ["Acme", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Stark", "Wayne"];
  const promises = [];
  let day = 0;
  for (let i = 0; i < 60; i++) {
    day = (day + 1) % 30;
    const date = new Date(Date.now() - day * 86400000).toISOString().slice(0, 10);
    promises.push(createTransaction({
      customerName: `${customers[i % customers.length]} ${i}`,
      amount: Math.round((2000 + Math.random() * 80000) / 100) * 100,
      currency: SUPPORTED_CURRENCIES[i % SUPPORTED_CURRENCIES.length],
      region: REGIONS[i % REGIONS.length],
      salesRep: REPS[i % REPS.length],
      date,
    }));
  }
  await Promise.all(promises);
  const count = await prisma.transaction.count();
  console.log(`[seed] Fallback seed complete — ${count} transactions ready.`);
}

async function llmSeed(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[seed] No OPENAI_API_KEY found, skipping LLM seed.");
    return false;
  }
  try {
    console.log("[seed] Calling gpt-4o-mini to generate transactions...");
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: seedSchema,
      prompt: `Today is ${new Date().toISOString().slice(0, 10)}. Generate 60 plausible B2B sales transactions for the last 30 days (all dates must be between ${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)} and today).
Use these regions: ${REGIONS.join(", ")}. Use these sales reps: ${REPS.join(", ")}.
Use currencies from: ${SUPPORTED_CURRENCIES.join(", ")} (mostly USD).
Realistic company customer names, amounts between 2,000 and 90,000, ISO dates (YYYY-MM-DD).`,
    });
    console.log(`[seed] LLM returned ${object.transactions.length} transactions, inserting...`);
    for (const t of object.transactions) {
      const currency = SUPPORTED_CURRENCIES.includes(t.currency.toUpperCase()) ? t.currency : "USD";
      await createTransaction({ ...t, currency });
    }
    const count = await prisma.transaction.count();
    console.log(`[seed] LLM seed complete — ${count} transactions ready.`);
    return true;
  } catch (err) {
    console.warn("[seed] LLM seed failed, will use fallback:", err);
    return false;
  }
}

let seeding: Promise<void> | null = null;

export function resetSeeding(): void {
  seeding = null;
}

export function ensureSeeded(): Promise<void> {
  if (seeding) return seeding;
  seeding = (async () => {
    if (!(await isEmpty())) return;
    console.log("[seed] Database is empty, starting seed...");
    const ok = await llmSeed();
    if (!ok && (await isEmpty())) await fallbackSeed();
  })();
  return seeding;
}
