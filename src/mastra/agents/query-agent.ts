import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { Filter } from "@/src/lib/types";

const filterSchema = z.object({
  salesRep: z.string().nullable(),
  region: z.string().nullable(),
  customer: z.string().nullable(),
  currency: z.string().nullable(),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
});

export async function parseQuery(text: string, today?: string): Promise<Filter> {
  if (!process.env.OPENAI_API_KEY) return {};
  const date = today ?? new Date().toLocaleDateString("en-CA");
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: filterSchema,
      prompt: `Today is ${date}. Extract sales transaction filters from this request. Use partial names exactly as typed — do NOT guess full names. Omit fields not mentioned. Dates: ISO (YYYY-MM-DD). Amounts: numbers only.

Field guidance:
- salesRep: the sales representative (a person's name, e.g. "john", "sarah lee")
- customer: the customer or company being sold to (a business or person name, e.g. "virgo", "Acme Corp")
- If the query mentions a company, organization, or business name → use customer, not salesRep

Words like "deal", "deals", "transaction", "transactions", "trans", "record", "records", "data" refer to what is being shown — strip them before extracting names. Example: "john's deals" → salesRep: "john".

Request: "${text}"`,
    });
    return Object.fromEntries(
      Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    ) as Filter;
  } catch {
    return {};
  }
}
